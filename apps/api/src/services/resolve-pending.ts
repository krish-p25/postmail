import { Op } from 'sequelize';
import { TrackedEmail, EmailOpen, LinkedMailbox } from '../db/models';
import { batchSearchSentFolder } from './sent-folder-search';

const MAX_PENDING_AGE_MS = 60 * 60 * 1000; // 1 hour

function ts(): string {
  return new Date().toISOString();
}

/**
 * Resolve pending tracked emails by searching the user's sent folders.
 * Fetches sent messages once per mailbox and scans for all pending tokens.
 * Discards emails older than 1 hour that remain unmatched.
 */
export async function resolvePendingEmails(userId: string, source: string): Promise<number> {
  console.log(`[${ts()}] [PostMail API] resolvePendingEmails called | source: ${source} | userId: ${userId}`);

  const pendingEmails = await TrackedEmail.findAll({
    where: { userId, status: 'pending' },
    order: [['created_at', 'ASC']],
  });

  if (pendingEmails.length === 0) {
    console.log(`[${ts()}] [PostMail API] resolvePendingEmails | source: ${source} | no pending emails`);
    return 0;
  }

  console.log(`[${ts()}] [PostMail API] resolvePendingEmails | source: ${source} | ${pendingEmails.length} pending email(s)`);

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
          if (!email.mailboxId) updates.mailboxId = mailboxId;
          await email.update(updates);

          await EmailOpen.destroy({
            where: {
              trackedEmailId: email.id,
              userId,
              openedAt: { [Op.lt]: sentAt },
            },
          });

          console.log(`[${ts()}] [PostMail API] resolvePendingEmails | source: ${source} | resolved email ${email.id}`);
          resolved++;
        } else {
          // No match — discard if older than 1 hour, otherwise leave pending
          const age = now - new Date(email.createdAt).getTime();
          if (age > MAX_PENDING_AGE_MS) {
            console.log(`[${ts()}] [PostMail API] resolvePendingEmails | source: ${source} | discarding email ${email.id} (age: ${Math.round(age / 60000)}min)`);
            await email.update({ status: 'discarded' });
          }
        }
      }
    } catch (error) {
      console.error(`[${ts()}] [PostMail API] resolvePendingEmails | source: ${source} | batch search failed for mailbox ${mailboxId}:`, error);
    }
  }

  if (resolved > 0) {
    console.log(`[${ts()}] [PostMail API] resolvePendingEmails | source: ${source} | resolved ${resolved} pending email(s)`);
  }

  return resolved;
}
