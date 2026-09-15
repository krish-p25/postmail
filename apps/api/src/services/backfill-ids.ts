import { Op } from 'sequelize';
import { TrackedEmail, LinkedMailbox } from '../db/models';
import { batchSearchSentFolder } from './sent-folder-search';

function ts(): string {
  return new Date().toISOString();
}

/**
 * Backfill missing IDs for all sent tracked emails on API startup.
 *
 * Handles two cases:
 *  1. Emails with no messageId/threadId/conversationId — searches sent folder
 *     by tracking token to find the message and extract all IDs.
 *  2. Emails with no mailboxId — looks up the user's linked mailbox by userId.
 */
export async function backfillAllIds(): Promise<void> {
  try {
    const emails = await TrackedEmail.findAll({
      where: {
        status: 'sent',
        [Op.or]: [
          { messageId: { [Op.is]: null as any } },
          { threadId: { [Op.is]: null as any } },
          { conversationId: { [Op.is]: null as any } },
        ],
      },
    });

    if (emails.length === 0) {
      console.log(`[${ts()}] [PostMail API] ID backfill: all emails up to date`);
      return;
    }

    console.log(`[${ts()}] [PostMail API] ID backfill: ${emails.length} emails to process`);

    // For emails missing mailboxId, resolve via userId → LinkedMailbox
    const userMailboxCache = new Map<string, LinkedMailbox | null>();

    async function getMailboxForEmail(email: TrackedEmail): Promise<LinkedMailbox | null> {
      if (email.mailboxId) {
        const cached = userMailboxCache.get(email.mailboxId);
        if (cached !== undefined) return cached;
        const mb = await LinkedMailbox.findByPk(email.mailboxId);
        userMailboxCache.set(email.mailboxId, mb);
        return mb;
      }

      // No mailboxId — find one via userId
      const cacheKey = `user:${email.userId}`;
      const cached = userMailboxCache.get(cacheKey);
      if (cached !== undefined) return cached;

      const mb = await LinkedMailbox.findOne({
        where: { userId: email.userId },
        order: [['createdAt', 'ASC']],
      });
      userMailboxCache.set(cacheKey, mb);
      return mb;
    }

    // Group emails by mailbox for batch sent folder searches
    const byMailbox = new Map<string, TrackedEmail[]>();

    for (const email of emails) {
      const mailbox = await getMailboxForEmail(email);
      if (!mailbox) continue;

      // Assign mailboxId if missing
      if (!email.mailboxId) {
        await email.update({ mailboxId: mailbox.id });
      }

      const group = byMailbox.get(mailbox.id) || [];
      group.push(email);
      byMailbox.set(mailbox.id, group);
    }

    // Fetch all mailboxes
    const mailboxIds = [...byMailbox.keys()];
    const mailboxes = await LinkedMailbox.findAll({
      where: { id: { [Op.in]: mailboxIds } },
    });
    const mailboxMap = new Map(mailboxes.map(m => [m.id, m]));

    let updated = 0;

    for (const [mailboxId, emailGroup] of byMailbox) {
      const mailbox = mailboxMap.get(mailboxId);
      if (!mailbox) continue;

      try {
        // Batch search sent folder for all tokens that need IDs
        const tokens = emailGroup.map(e => e.trackingToken);
        const matches = await batchSearchSentFolder(mailbox, tokens);

        for (const email of emailGroup) {
          const match = matches.get(email.trackingToken);
          if (!match?.found) continue;

          const updates: Record<string, unknown> = {};
          if (match.messageId && !email.messageId) updates.messageId = match.messageId;
          if (match.threadId && !email.threadId) updates.threadId = match.threadId;
          if (match.conversationId && !email.conversationId) updates.conversationId = match.conversationId;
          if (match.sentAt && !email.sentAt) updates.sentAt = match.sentAt;

          if (Object.keys(updates).length > 0) {
            await email.update(updates);
            updated++;
          }
        }
      } catch (error) {
        console.error(`[${ts()}] [PostMail API] ID backfill failed for mailbox ${mailboxId}:`, error);
      }
    }

    console.log(`[${ts()}] [PostMail API] ID backfill complete: ${updated}/${emails.length} updated`);
  } catch (error) {
    console.error(`[${ts()}] [PostMail API] ID backfill failed:`, error);
  }
}
