jest.mock('../../services/email', () => ({
  sendChallengeEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../app';
import { EmailChallenge, User } from '../../db/models';
import { sendChallengeEmail } from '../../services/email';
import { resetDatabase, createUser, bearer, closeDatabase, lastEmailedCode, wrongCode } from '../../test/helpers';

const mockSend = sendChallengeEmail as jest.Mock;
const NEW_PASSWORD = 'Brand-new-pass-1';

beforeAll(resetDatabase);
afterAll(closeDatabase);

type Step = [number, unknown];

// Reset requests are capped at 5 per IP per 15 minutes, so each test declares its own
// client IP the same way middleware/__tests__/rate-limit.test.ts does.
let clientIp = 0;
const nextIp = () => `198.51.100.${(clientIp += 1)}`;

/** Request → resend → five wrong codes → sixth attempt. Returns status + body for every step. */
async function runResetFlow(email: string): Promise<Step[]> {
  const steps: Step[] = [];
  const ip = nextIp();

  const req = await request(app).post('/api/auth/password-reset/request').set('CF-Connecting-IP', ip).send({ email });
  const { challengeId, ...rest } = req.body;
  steps.push([req.status, { ...rest, challengeId: typeof challengeId }]);

  await EmailChallenge.update({ lastSentAt: new Date(Date.now() - 61_000) }, { where: { id: challengeId } });
  const resend = await request(app).post(`/api/auth/challenges/${challengeId}/resend`);
  steps.push([resend.status, resend.body]);

  let wrong = '000000';
  const calls = mockSend.mock.calls.filter((call) => call[1] === email.toLowerCase());
  if (calls.length > 0) wrong = wrongCode(calls[calls.length - 1][2]);

  for (let i = 0; i < 6; i++) {
    const verify = await request(app)
      .post('/api/auth/password-reset/verify')
      .set('CF-Connecting-IP', ip)
      .send({ challengeId, code: wrong });
    steps.push([verify.status, verify.body]);
  }
  return steps;
}

/** request → verify, returning the ticket. */
async function ticketFor(email: string): Promise<string> {
  const ip = nextIp();
  const req = await request(app).post('/api/auth/password-reset/request').set('CF-Connecting-IP', ip).send({ email });
  const verify = await request(app)
    .post('/api/auth/password-reset/verify')
    .set('CF-Connecting-IP', ip)
    .send({ challengeId: req.body.challengeId, code: lastEmailedCode(mockSend, email) });
  return verify.body.ticket;
}

it('responds identically for known and unknown emails at every step', async () => {
  await createUser({ email: 'known@example.com', passwordHash: await bcrypt.hash('Old-pass-1234', 4) });
  mockSend.mockClear();

  const known = await runResetFlow('known@example.com');
  const unknown = await runResetFlow('nobody@example.com');

  expect(unknown).toEqual(known);
  expect(known[0]).toEqual([200, { challengeId: 'string' }]);
  expect(known[2]).toEqual([400, { error: 'Incorrect code. 4 attempts remaining.', code: 'incorrect_code', attemptsRemaining: 4 }]);
  expect(known[7]).toEqual([400, { error: 'Too many incorrect attempts. Request a new code.', code: 'too_many_attempts' }]);

  expect(mockSend.mock.calls.some((call) => call[1] === 'nobody@example.com')).toBe(false);
  expect(mockSend.mock.calls.filter((call) => call[1] === 'known@example.com')).toHaveLength(2);
});

it('resets the password, signs the user in and revokes old sessions', async () => {
  const user = await createUser({ email: 'resetter@example.com', passwordHash: await bcrypt.hash('Old-pass-1234', 4) });
  const oldAuth = bearer(user);

  const ticket = await ticketFor('resetter@example.com');
  expect(ticket).toEqual(expect.any(String));

  const applied = await request(app).post('/api/auth/password-reset/apply').send({ ticket, newPassword: NEW_PASSWORD });
  expect(applied.status).toBe(200);
  expect(applied.body).toEqual({ token: expect.any(String), user: { id: user.id, email: user.email, displayName: null } });

  const reloaded = await User.findByPk(user.id);
  expect(await bcrypt.compare(NEW_PASSWORD, reloaded!.passwordHash!)).toBe(true);
  expect((await request(app).get('/api/me').set('Authorization', oldAuth)).status).toBe(401);
});

it('rejects a tampered, junk or already-spent ticket', async () => {
  await createUser({ email: 'spender@example.com', passwordHash: await bcrypt.hash('Old-pass-1234', 4) });
  const ticket = await ticketFor('spender@example.com');

  const junk = await request(app).post('/api/auth/password-reset/apply').send({ ticket: 'not-a-ticket', newPassword: NEW_PASSWORD });
  expect(junk.status).toBe(400);
  expect(junk.body.code).toBe('ticket_invalid');

  const tampered = await request(app)
    .post('/api/auth/password-reset/apply')
    .send({ ticket: `${ticket.slice(0, -2)}xy`, newPassword: NEW_PASSWORD });
  expect(tampered.status).toBe(400);

  expect((await request(app).post('/api/auth/password-reset/apply').send({ ticket, newPassword: NEW_PASSWORD })).status).toBe(200);
  const replay = await request(app).post('/api/auth/password-reset/apply').send({ ticket, newPassword: 'Another-pass-99' });
  expect(replay.status).toBe(400);
  expect(replay.body.code).toBe('ticket_invalid');
});

it('rejects a short password without spending the ticket', async () => {
  await createUser({ email: 'shorty@example.com', passwordHash: await bcrypt.hash('Old-pass-1234', 4) });
  const ticket = await ticketFor('shorty@example.com');

  const short = await request(app).post('/api/auth/password-reset/apply').send({ ticket, newPassword: 'Short-1' });
  expect(short.status).toBe(400);
  expect(short.body.error).toBe('Password must be at least 8 characters');

  expect((await request(app).post('/api/auth/password-reset/apply').send({ ticket, newPassword: NEW_PASSWORD })).status).toBe(200);
});

it('does not wait for the email to send', async () => {
  await createUser({ email: 'slow-mail@example.com' });
  mockSend.mockImplementationOnce(() => new Promise(() => {}));
  const res = await request(app)
    .post('/api/auth/password-reset/request')
    .set('CF-Connecting-IP', nextIp())
    .send({ email: 'slow-mail@example.com' });
  expect(res.status).toBe(200);
});

it('no longer exposes the combined confirm endpoint', async () => {
  const res = await request(app).post('/api/auth/password-reset/confirm').send({ challengeId: 'x', code: '000000', newPassword: NEW_PASSWORD });
  expect(res.status).toBe(404);
});
