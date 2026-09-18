jest.mock('../../services/email', () => ({
  sendChallengeEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { TrustedDevice, User } from '../../db/models';
import { forUser } from '../../db/scoped';
import { sendChallengeEmail } from '../../services/email';
import { resetDatabase, createUser, bearer, closeDatabase, lastEmailedCode } from '../../test/helpers';

const mockSend = sendChallengeEmail as jest.Mock;

beforeAll(resetDatabase);
afterAll(closeDatabase);

async function requestChange(auth: string, body: Record<string, string>) {
  return request(app).post('/api/me/password/request').set('Authorization', auth).send(body);
}

it('lets an OAuth-only user create a password after confirming the code', async () => {
  const user = await createUser({ email: 'oauth-only@example.com' });
  const oldAuth = bearer(user);

  const req = await requestChange(oldAuth, { newPassword: 'First-pass-123' });
  expect(req.status).toBe(200);
  expect(req.body).toEqual({ challengeId: expect.any(String), email: 'oauth-only@example.com' });
  await user.reload();
  expect(user.passwordHash).toBeNull();

  const code = lastEmailedCode(mockSend, user.email);
  const confirm = await request(app).post('/api/me/password/confirm').set('Authorization', oldAuth).send({ challengeId: req.body.challengeId, code });
  expect(confirm.status).toBe(200);
  expect(confirm.body.token).toEqual(expect.any(String));

  await user.reload();
  expect(await bcrypt.compare('First-pass-123', user.passwordHash!)).toBe(true);
  expect((await request(app).get('/api/me').set('Authorization', oldAuth)).status).toBe(401);
  expect((await request(app).get('/api/me').set('Authorization', `Bearer ${confirm.body.token}`)).status).toBe(200);
});

it('requires the current password before emailing a code', async () => {
  const user = await createUser({ email: 'has-pass@example.com', passwordHash: await bcrypt.hash('Current-pass-1', 4) });
  mockSend.mockClear();

  const wrong = await requestChange(bearer(user), { currentPassword: 'nope-nope-nope', newPassword: 'Next-pass-1234' });
  expect(wrong.status).toBe(401);
  expect(mockSend).not.toHaveBeenCalled();

  const missing = await requestChange(bearer(user), { newPassword: 'Next-pass-1234' });
  expect(missing.status).toBe(401);
});

it('changes an existing password, signs out old sessions and forgets trusted devices', async () => {
  const user = await createUser({ email: 'changer@example.com', passwordHash: await bcrypt.hash('Current-pass-1', 4) });
  const oldAuth = bearer(user);
  await forUser(user.id).trustedDevices.create({
    tokenHash: 'a'.repeat(64), userAgent: 'test', lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
  });

  const req = await requestChange(oldAuth, { currentPassword: 'Current-pass-1', newPassword: 'Next-pass-1234' });
  const code = lastEmailedCode(mockSend, user.email);
  const confirm = await request(app).post('/api/me/password/confirm').set('Authorization', oldAuth).send({ challengeId: req.body.challengeId, code });
  expect(confirm.status).toBe(200);

  await user.reload();
  expect(await bcrypt.compare('Next-pass-1234', user.passwordHash!)).toBe(true);
  expect(await TrustedDevice.count({ where: { userId: user.id } })).toBe(0);
  expect((await request(app).get('/api/me').set('Authorization', oldAuth)).status).toBe(401);
});

it("rejects another user's challenge and leaves it usable by its owner", async () => {
  const owner = await createUser({ email: 'owner@example.com' });
  const intruder = await createUser({ email: 'intruder@example.com' });
  const req = await requestChange(bearer(owner), { newPassword: 'Owner-pass-123' });
  const code = lastEmailedCode(mockSend, owner.email);

  const stolen = await request(app).post('/api/me/password/confirm').set('Authorization', bearer(intruder)).send({ challengeId: req.body.challengeId, code });
  expect(stolen.status).toBe(400);
  expect(stolen.body.code).toBe('invalid_or_expired');

  const legit = await request(app).post('/api/me/password/confirm').set('Authorization', bearer(owner)).send({ challengeId: req.body.challengeId, code });
  expect(legit.status).toBe(200);
});

it('rejects short passwords and removed endpoints', async () => {
  const user = await createUser();
  expect((await requestChange(bearer(user), { newPassword: 'Short-1' })).status).toBe(400);
  expect((await request(app).post('/api/me/set-password').set('Authorization', bearer(user)).send({ password: 'Whatever-123' })).status).toBe(404);
  expect((await request(app).post('/api/me/change-password').set('Authorization', bearer(user)).send({})).status).toBe(404);
});

describe('legacy tokens', () => {
  it('accepts a token without a ver claim while token_version is 0', async () => {
    const user = await createUser();
    const legacy = jwt.sign({ sub: user.id, email: user.email }, 'test-secret', { expiresIn: '1h' });
    expect((await request(app).get('/api/me').set('Authorization', `Bearer ${legacy}`)).status).toBe(200);
  });

  it('rejects a token without a ver claim once token_version has moved', async () => {
    const user = await createUser();
    const legacy = jwt.sign({ sub: user.id, email: user.email }, 'test-secret', { expiresIn: '1h' });
    await User.update({ tokenVersion: 1 }, { where: { id: user.id } });
    expect((await request(app).get('/api/me').set('Authorization', `Bearer ${legacy}`)).status).toBe(401);
  });
});
