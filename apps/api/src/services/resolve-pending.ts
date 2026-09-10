import { Op } from 'sequelize';
import { TrackedEmail, EmailOpen, LinkedMailbox } from '../db/models';
import { searchSentFolder } from './sent-folder-search';

/**
 * Resolve pending tracked emails by searching the user's sent folders.
 * Groups pending emails by mailbox and searches for their tokens.
 * Called before dashboard email list loads so the user sees up-to-date status.
 */
export async function resolvePendingEmails(userId: string): Promise<number> {
  const pendingEmails = await TrackedEmail.findAll({
    where: { userId, status: 'pending' },
    order: [['created_at', 'ASC']],
  });

  if (pendingEmails.length === 0) return 0;

  // Group pending emails by mailboxId
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

  // For unassigned emails, try the user's first mailbox
  if (unassigned.length > 0) {
    const fallbackMailbox = await LinkedMailbox.findOne({
      where: { userId },
      order: [['createdAt', 'ASC']],
    });
    if (fallbackMailbox) {
      const group = byMailbox.get(fallbackMailbox.id) || [];
      group.push(...unassigned);
      byMailbox.set(fallbackMailbox.id, group);
    }
  }

  let resolved = 0;

  for (const [mailboxId, emails] of byMailbox) {
    const mailbox = await LinkedMailbox.findOne({
      where: { id: mailboxId, userId },
    });
    if (!mailbox) continue;

    for (const trackedEmail of emails) {
      try {
        const result = await searchSentFolder(mailbox, trackedEmail.trackingToken, {
          subject: trackedEmail.subject || undefined,
          newerThan: '7d',
        });

        if (result.found) {
          const sentAt = result.sentAt || new Date();
          const updates: Record<string, unknown> = { status: 'sent', sentAt };
          if (result.messageId) updates.messageId = result.messageId;
          if (!trackedEmail.mailboxId) updates.mailboxId = mailboxId;
          await trackedEmail.update(updates);

          // Purge false opens logged before send
          await EmailOpen.destroy({
            where: {
              trackedEmailId: trackedEmail.id,
              userId,
              openedAt: { [Op.lt]: sentAt },
            },
          });

          resolved++;
        }
      } catch (error) {
        console.error(`[PostMail API] Failed to resolve pending email ${trackedEmail.id}:`, error);
      }
    }
  }

  if (resolved > 0) {
    console.log(`[PostMail API] Resolved ${resolved} pending email(s) for user ${userId}`);
  }

  return resolved;
}
