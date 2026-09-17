import { forUser } from '../scoped';
import { TrackedEmail, LinkedMailbox } from '../models';
import { resetDatabase, createUser, closeDatabase } from '../../test/helpers';

describe('forUser', () => {
  let a: string;
  let b: string;

  beforeAll(async () => {
    await resetDatabase();
    a = (await createUser()).id;
    b = (await createUser()).id;
    await TrackedEmail.create({ userId: a, trackingToken: 'token-a', status: 'sent' });
  });

  afterAll(closeDatabase);

  it("findOne never returns another user's row", async () => {
    expect(await forUser(b).trackedEmails.findOne({ where: { trackingToken: 'token-a' } })).toBeNull();
    expect(await forUser(a).trackedEmails.findOne({ where: { trackingToken: 'token-a' } })).not.toBeNull();
  });

  it('a caller-supplied userId cannot widen the scope', async () => {
    const rows = await forUser(b).trackedEmails.findAll({ where: { userId: a } });
    expect(rows).toHaveLength(0);
  });

  it('findById is scoped', async () => {
    const row = await TrackedEmail.findOne({ where: { trackingToken: 'token-a' } });
    expect(await forUser(b).trackedEmails.findById(row!.id)).toBeNull();
    expect(await forUser(a).trackedEmails.findById(row!.id)).not.toBeNull();
  });

  it('create stamps the scoped userId', async () => {
    const row = await forUser(b).trackedEmails.create({ trackingToken: 'token-b' });
    expect(row.userId).toBe(b);
  });

  it('findOrCreate stamps and scopes userId', async () => {
    const [box, created] = await forUser(b).linkedMailboxes.findOrCreate({
      where: { email: 'shared@example.com' },
      defaults: { provider: 'gmail', email: 'shared@example.com' },
    });
    expect(created).toBe(true);
    expect(box.userId).toBe(b);
    const [, createdForA] = await forUser(a).linkedMailboxes.findOrCreate({
      where: { email: 'shared@example.com' },
      defaults: { provider: 'gmail', email: 'shared@example.com' },
    });
    expect(createdForA).toBe(true);
    expect(await LinkedMailbox.count({ where: { email: 'shared@example.com' } })).toBe(2);
  });

  it('update and destroy only touch the scoped user', async () => {
    const [updated] = await forUser(b).trackedEmails.update({ subject: 'hijack' }, { where: { trackingToken: 'token-a' } });
    expect(updated).toBe(0);
    const destroyed = await forUser(b).trackedEmails.destroy({ where: { trackingToken: 'token-a' } });
    expect(destroyed).toBe(0);
    expect(await TrackedEmail.count({ where: { trackingToken: 'token-a' } })).toBe(1);
  });

  it('rejects an empty userId', () => {
    expect(() => forUser('')).toThrow('forUser requires a userId');
  });
});
