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

function requestCode(auth: string, body: Record<string, string> = {}) {
  return request(app).post('/api/me/password/request').set('Authorization', auth).send(body);
}

function verifyCode(auth: string, challengeId: string, code: string) {
  return request(app).post('/api/me/password/verify').set('Authorization', auth).send({ challengeId, code });
}

function applyPassword(auth: string, ticket: string, newPassword: string) {
  return request(app).post('/api/me/password/apply').set('Authorization', auth).send({ ticket, newPassword });
}

/** request -> verify, returning the ticket. */
async function ticketFor(auth: string, email: string, body: Record<string, string> = {}): Promise<string> {
  const req = await requestCode(auth, body);
  const verified = await verifyCode(auth, req.body.challengeId, lastEmailedCode(mockSend, email));
  return verified.body.ticket;
}

it('lets an OAuth-only user create a password after confirming the code', async () => {
  const user = await createUser({ email: 'oauth-only@example.com' });
  const oldAuth = bearer(user);

  const req = await requestCode(oldAuth);
  expect(req.status).toBe(200);
  expect(req.body).toEqual({ challengeId: expect.any(String), email: 'oauth-only@example.com' });

  const verified = await verifyCode(oldAuth, req.body.challengeId, lastEmailedCode(mockSend, user.email));
  expect(verified.status).toBe(200);
  expect(verified.body).toEqual({ ticket: expect.any(String) });
  await user.reload();
  expect(user.passwordHash).toBeNull(); // still not set until apply

  const applied = await applyPassword(oldAuth, verified.body.ticket, 'First-pass-123');
  expect(applied.status).toBe(200);
  expect(applied.body.token).toEqual(expect.any(String));

  await user.reload();
  expect(await bcrypt.compare('First-pass-123', user.passwordHash!)).toBe(true);
  expect((await request(app).get('/api/me').set('Authorization', oldAuth)).status).toBe(401);
  expect((await request(app).get('/api/me').set('Authorization', `Bearer ${applied.body.token}`)).status).toBe(200);
});

it('requires the current password before emailing a code', async () => {
  const user = await createUser({ email: 'has-pass@example.com', passwordHash: await bcrypt.hash('Current-pass-1', 4) });
  mockSend.mockClear();

  expect((await requestCode(bearer(user), { currentPassword: 'nope-nope-nope' })).status).toBe(401);
  expect((await requestCode(bearer(user))).status).toBe(401);
  expect(mockSend).not.toHaveBeenCalled();
});

it('changes an existing password, signs out old sessions and forgets trusted devices', async () => {
  const user = await createUser({ email: 'changer@example.com', passwordHash: await bcrypt.hash('Current-pass-1', 4) });
  const oldAuth = bearer(user);
  await forUser(user.id).trustedDevices.create({
    tokenHash: 'a'.repeat(64), userAgent: 'test', lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
  });

  const ticket = await ticketFor(oldAuth, user.email, { currentPassword: 'Current-pass-1' });
  expect((await applyPassword(oldAuth, ticket, 'Next-pass-1234')).status).toBe(200);

  await user.reload();
  expect(await bcrypt.compare('Next-pass-1234', user.passwordHash!)).toBe(true);
  expect(await TrustedDevice.count({ where: { userId: user.id } })).toBe(0);
  expect((await request(app).get('/api/me').set('Authorization', oldAuth)).status).toBe(401);
});

it("rejects another user's challenge and leaves it usable by its owner", async () => {
  const owner = await createUser({ email: 'owner@example.com' });
  const intruder = await createUser({ email: 'intruder@example.com' });
  const req = await requestCode(bearer(owner));
  const code = lastEmailedCode(mockSend, owner.email);

  const stolen = await verifyCode(bearer(intruder), req.body.challengeId, code);
  expect(stolen.status).toBe(400);
  expect(stolen.body.code).toBe('invalid_or_expired');

  expect((await verifyCode(bearer(owner), req.body.challengeId, code)).status).toBe(200);
});

it('will not spend a ticket on a password that is too short', async () => {
  const user = await createUser({ email: 'short-pass@example.com' });
  const auth = bearer(user);
  const ticket = await ticketFor(auth, user.email);

  const short = await applyPassword(auth, ticket, 'Short-1');
  expect(short.status).toBe(400);
  expect(short.body.error).toBe('Password must be at least 8 characters');

  // The ticket survived the rejected attempt.
  expect((await applyPassword(auth, ticket, 'Long-enough-123')).status).toBe(200);
});

it('refuses to spend the same ticket twice', async () => {
  const user = await createUser({ email: 'replay@example.com' });
  const auth = bearer(user);
  const ticket = await ticketFor(auth, user.email);

  const first = await applyPassword(auth, ticket, 'First-pass-123');
  expect(first.status).toBe(200);

  // The old session is revoked, so replay with the session the change returned.
  const replay = await applyPassword(`Bearer ${first.body.token}`, ticket, 'Second-pass-123');
  expect(replay.status).toBe(400);
  expect(replay.body.code).toBe('ticket_invalid');
  const reloaded = await User.findByPk(user.id);
  expect(await bcrypt.compare('First-pass-123', reloaded!.passwordHash!)).toBe(true);
});

it('does not accept a ticket as a session token', async () => {
  const user = await createUser({ email: 'ticket-as-token@example.com' });
  const ticket = await ticketFor(bearer(user), user.email);
  expect((await request(app).get('/api/me').set('Authorization', `Bearer ${ticket}`)).status).toBe(401);
});

it('rejects junk tickets and the removed endpoints', async () => {
  const user = await createUser();
  const auth = bearer(user);
  expect((await applyPassword(auth, 'not-a-ticket', 'Whatever-123')).status).toBe(400);
  expect((await request(app).post('/api/me/password/confirm').set('Authorization', auth).send({})).status).toBe(404);
  expect((await request(app).post('/api/me/set-password').set('Authorization', auth).send({ password: 'Whatever-123' })).status).toBe(404);
  expect((await request(app).post('/api/me/change-password').set('Authorization', auth).send({})).status).toBe(404);
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
