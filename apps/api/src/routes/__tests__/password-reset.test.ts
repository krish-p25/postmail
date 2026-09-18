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

/** Request → resend → five wrong codes → sixth attempt. Returns status + body for every step. */
async function runResetFlow(email: string): Promise<Step[]> {
  const steps: Step[] = [];

  const req = await request(app).post('/api/auth/password-reset/request').send({ email });
  const { challengeId, ...rest } = req.body;
  steps.push([req.status, { ...rest, challengeId: typeof challengeId }]);

  await EmailChallenge.update({ lastSentAt: new Date(Date.now() - 61_000) }, { where: { id: challengeId } });
  const resend = await request(app).post(`/api/auth/challenges/${challengeId}/resend`);
  steps.push([resend.status, resend.body]);

  let wrong = '000000';
  const calls = mockSend.mock.calls.filter((call) => call[1] === email.toLowerCase());
  if (calls.length > 0) wrong = wrongCode(calls[calls.length - 1][2]);

  for (let i = 0; i < 6; i++) {
    const confirm = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({ challengeId, code: wrong, newPassword: NEW_PASSWORD });
    steps.push([confirm.status, confirm.body]);
  }
  return steps;
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

  const req = await request(app).post('/api/auth/password-reset/request').send({ email: 'resetter@example.com' });
  const code = lastEmailedCode(mockSend, 'resetter@example.com');
  const confirm = await request(app)
    .post('/api/auth/password-reset/confirm')
    .send({ challengeId: req.body.challengeId, code, newPassword: NEW_PASSWORD });

  expect(confirm.status).toBe(200);
  expect(confirm.body).toEqual({ token: expect.any(String), user: { id: user.id, email: user.email, displayName: null } });
  const reloaded = await User.findByPk(user.id);
  expect(await bcrypt.compare(NEW_PASSWORD, reloaded!.passwordHash!)).toBe(true);
  expect((await request(app).get('/api/me').set('Authorization', oldAuth)).status).toBe(401);
});

it('does not wait for the email to send', async () => {
  await createUser({ email: 'slow-mail@example.com' });
  mockSend.mockImplementationOnce(() => new Promise(() => {}));
  const res = await request(app).post('/api/auth/password-reset/request').send({ email: 'slow-mail@example.com' });
  expect(res.status).toBe(200);
});
