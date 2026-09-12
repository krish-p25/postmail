import { Op } from 'sequelize';
import { TrackedEmail, EmailOpen, LinkedMailbox } from '../db/models';
import { batchSearchSentFolder, getOutlookAccessToken } from './sent-folder-search';

const MAX_PENDING_AGE_MS = 60 * 60 * 1000; // 1 hour

function ts(): string {
  return new Date().toISOString();
}

/**
 * Resolve pending tracked emails by searching the user's sent folders.
 * Fetches sent messages once per mailbox and scans for all pending tokens.
 * Discards emails older than 1 hour that remain unmatched.
 */
export async function resolvePendingEmails(userId: string): Promise<number> {
  const pendingEmails = await TrackedEmail.findAll({
    where: { userId, status: 'pending' },
    order: [['created_at', 'ASC']],
  });

  if (pendingEmails.length === 0) return 0;

  // Group by mailbox, collecting unassigned separately
  const byMailbox = new Map<string, TrackedEmail[]>();
  const unassigned: TrackedEmail[] = [];

  for (const email of pendingEmails) {
    if (email.mailboxId) {
      const group = byMailbox.get(email.mailboxId) || [];
      group.push(email);
      byMailbox.set(email.mailboxId, group);
    } else {
      unassigned.push(email);
    }
  }

  if (unassigned.length > 0) {
    const fallback = await LinkedMailbox.findOne({
      where: { userId },
      order: [['createdAt', 'ASC']],
    });
    if (fallback) {
      const group = byMailbox.get(fallback.id) || [];
      group.push(...unassigned);
      byMailbox.set(fallback.id, group);
    }
  }

  // Fetch all needed mailboxes in one query
  const mailboxIds = [...byMailbox.keys()];
  const mailboxes = await LinkedMailbox.findAll({
    where: { id: { [Op.in]: mailboxIds }, userId },
  });
  const mailboxMap = new Map(mailboxes.map(m => [m.id, m]));

  let resolved = 0;
  const now = Date.now();

  for (const [mailboxId, emails] of byMailbox) {
    const mailbox = mailboxMap.get(mailboxId);
    if (!mailbox) continue;

    try {
      const tokens = emails.map(e => e.trackingToken);
      const matches = await batchSearchSentFolder(mailbox, tokens);

      for (const email of emails) {
        const match = matches.get(email.trackingToken);

        if (match?.found) {
          const sentAt = match.sentAt || new Date();
          const updates: Record<string, unknown> = { status: 'sent', sentAt };
          if (match.messageId) updates.messageId = match.messageId;
          if (match.conversationId) updates.conversationId = match.conversationId;
          if (!email.mailboxId) updates.mailboxId = mailboxId;
          await email.update(updates);

          await EmailOpen.destroy({
            where: {
              trackedEmailId: email.id,
              userId,
              openedAt: { [Op.lt]: sentAt },
            },
          });

          resolved++;
        } else {
          // No match — discard if older than 1 hour, otherwise leave pending
          const age = now - new Date(email.createdAt).getTime();
          if (age > MAX_PENDING_AGE_MS) {
            await email.update({ status: 'discarded' });
          }
        }
      }
    } catch (error) {
      console.error(`[${ts()}] [PostMail API] resolvePendingEmails batch search failed for mailbox ${mailboxId}:`, error);
    }
  }

  return resolved;
}

const MS_GRAPH_URL = 'https://graph.microsoft.com/v1.0';

/**
 * Backfill conversationId for sent Outlook emails that have a messageId but no conversationId.
 * Runs lazily and non-blocking — errors are logged but do not propagate.
 */
export async function backfillConversationIds(userId: string): Promise<void> {
  try {
    const emails = await TrackedEmail.findAll({
      where: {
        userId,
        status: 'sent',
        messageId: { [Op.not]: null },
        conversationId: { [Op.is]: null as any },
      },
    });

    if (emails.length === 0) return;

    const byMailbox = new Map<string, TrackedEmail[]>();
    for (const email of emails) {
      if (!email.mailboxId) continue;
      const group = byMailbox.get(email.mailboxId) || [];
      group.push(email);
      byMailbox.set(email.mailboxId, group);
    }

    for (const [mailboxId, emailGroup] of byMailbox) {
      const mailbox = await LinkedMailbox.findByPk(mailboxId);
      if (!mailbox || mailbox.provider !== 'outlook') continue;

      const accessToken = await getOutlookAccessToken(mailbox);
      if (!accessToken) continue;

      for (const email of emailGroup) {
        try {
          const res = await fetch(
            `${MS_GRAPH_URL}/me/messages/${email.messageId}?$select=conversationId`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (res.ok) {
            const data = await res.json();
            if (data.conversationId) {
              await email.update({ conversationId: data.conversationId });
            }
          }
        } catch {
          // Skip individual failures
        }
      }
    }

  } catch (error) {
    console.error(`[${ts()}] [PostMail API] backfillConversationIds failed:`, error);
  }
}
