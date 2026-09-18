import { sequelize } from '../sequelize';
import { EmailChallenge, TrustedDevice } from '../models';
import { forUser } from '../scoped';
import { up as upChallenges } from '../migrations/20260916-06-email-challenges';
import { up as upDevices } from '../migrations/20260916-07-trusted-devices';
import { resetDatabase, createUser, closeDatabase } from '../../test/helpers';

beforeAll(async () => {
  await resetDatabase();
  // sync() creates the tables; the migrations must still apply cleanly on top
  // (they add the CHECK constraint the models can only enforce in JS).
  await upChallenges(sequelize.getQueryInterface());
  await upDevices(sequelize.getQueryInterface());
});
afterAll(closeDatabase);

it('migrations are idempotent', async () => {
  const qi = sequelize.getQueryInterface();
  await expect(upChallenges(qi)).resolves.toBeUndefined();
  await expect(upDevices(qi)).resolves.toBeUndefined();
});

it('rejects unknown challenge purposes at the database level', async () => {
  await expect(
    sequelize.query(
      "INSERT INTO email_challenges (id, purpose, email, code_hash, last_sent_at, expires_at, created_at) VALUES (gen_random_uuid(), 'bogus', 'a@b.com', repeat('0', 64), now(), now(), now())",
    ),
  ).rejects.toThrow(/email_challenges_purpose_check/);
});

it('deletes challenges and devices with their user', async () => {
  const user = await createUser();
  await EmailChallenge.create({
    purpose: 'login',
    email: user.email,
    userId: user.id,
    codeHash: '0'.repeat(64),
    lastSentAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  await forUser(user.id).trustedDevices.create({
    tokenHash: '1'.repeat(64),
    userAgent: null,
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  await user.destroy();
  expect(await EmailChallenge.count({ where: { userId: user.id } })).toBe(0);
  expect(await TrustedDevice.count({ where: { userId: user.id } })).toBe(0);
});

it('scopes trusted devices per user', async () => {
  const a = await createUser();
  const b = await createUser();
  await forUser(a.id).trustedDevices.create({
    tokenHash: '2'.repeat(64),
    userAgent: 'test',
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  expect(await forUser(b.id).trustedDevices.count()).toBe(0);
  expect(await forUser(a.id).trustedDevices.count()).toBe(1);
});
