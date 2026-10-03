jest.mock('../sent-folder-search', () => ({
  batchSearchSentFolder: jest.fn().mockResolvedValue(new Map()),
}));

import { sequelize } from '../../db/sequelize';
import { LinkedMailbox, TrackedEmail } from '../../db/models';
import { batchSearchSentFolder } from '../sent-folder-search';
import { backfillAllIds } from '../backfill-ids';
import { resetDatabase, createUser, closeDatabase } from '../../test/helpers';

const mockSearch = batchSearchSentFolder as jest.Mock;

beforeAll(resetDatabase);
afterAll(closeDatabase);

async function ageRow(id: string, days: number) {
  await sequelize.query(`UPDATE tracked_emails SET created_at = NOW() - INTERVAL '${days} days' WHERE id = :id`, {
    replacements: { id },
  });
}

it('only searches for recent sent emails that are genuinely missing provider IDs', async () => {
  const user = await createUser();
  const mailbox = await LinkedMailbox.create({ userId: user.id, provider: 'gmail', email: 'me@gmail.com', refreshToken: 'r' });
  const base = { userId: user.id, mailboxId: mailbox.id, status: 'sent' as const };

  await TrackedEmail.create({ ...base, trackingToken: 'needs-message-id' });
  await TrackedEmail.create({ ...base, trackingToken: 'gmail-complete', messageId: 'm1', threadId: 't1' });
  await TrackedEmail.create({ ...base, trackingToken: 'outlook-complete', messageId: 'm2', conversationId: 'c2' });
  const old = await TrackedEmail.create({ ...base, trackingToken: 'too-old' });
  await ageRow(old.id, 3);

  await backfillAllIds();

  expect(mockSearch).toHaveBeenCalledTimes(1);
  expect(mockSearch.mock.calls[0][1]).toEqual(['needs-message-id']);
});
