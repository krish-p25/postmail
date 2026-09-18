jest.mock('../../services/email', () => ({
  sendChallengeEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import app from '../../app';
import { EmailChallenge, User, UserSetting } from '../../db/models';
import { sendChallengeEmail } from '../../services/email';
import { resetDatabase, createUser, closeDatabase, lastEmailedCode, wrongCode } from '../../test/helpers';

const mockSend = sendChallengeEmail as jest.Mock;

beforeAll(resetDatabase);
afterAll(closeDatabase);

it('creates the account only after the emailed code is confirmed, and only once', async () => {
  const res = await request(app).post('/api/auth/register').send({ email: 'new@example.com', password: 'Strong-pass-123' });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ requiresVerification: true, email: 'new@example.com', challengeId: expect.any(String) });
  expect(await User.findOne({ where: { email: 'new@example.com' } })).toBeNull();

  const code = lastEmailedCode(mockSend, 'new@example.com');
  const verify = await request(app).post('/api/auth/verify').send({ challengeId: res.body.challengeId, code });
  expect(verify.status).toBe(201);
  expect(verify.body.token).toEqual(expect.any(String));

  const user = await User.findOne({ where: { email: 'new@example.com' } });
  expect(user).not.toBeNull();
  expect(await UserSetting.count({ where: { userId: user!.id } })).toBe(1);

  const reuse = await request(app).post('/api/auth/verify').send({ challengeId: res.body.challengeId, code });
  expect(reuse.status).toBe(400);
  expect(reuse.body.code).toBe('invalid_or_expired');
});

it('returns 409 ACCOUNT_EXISTS without emailing a code', async () => {
  await createUser({ email: 'taken@example.com' });
  mockSend.mockClear();
  const res = await request(app).post('/api/auth/register').send({ email: 'taken@example.com', password: 'Strong-pass-123' });
  expect(res.status).toBe(409);
  expect(res.body).toEqual({ error: 'An account with this email already exists', code: 'ACCOUNT_EXISTS' });
  expect(mockSend).not.toHaveBeenCalled();
});

it('requires passwords of at least 8 characters', async () => {
  const res = await request(app).post('/api/auth/register').send({ email: 'short@example.com', password: 'Short-1' });
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('Password must be at least 8 characters');
});

it('reports attempts remaining for a wrong code', async () => {
  const res = await request(app).post('/api/auth/register').send({ email: 'wrong@example.com', password: 'Strong-pass-123' });
  const code = lastEmailedCode(mockSend, 'wrong@example.com');
  const verify = await request(app).post('/api/auth/verify').send({ challengeId: res.body.challengeId, code: wrongCode(code) });
  expect(verify.status).toBe(400);
  expect(verify.body).toEqual({ error: 'Incorrect code. 4 attempts remaining.', code: 'incorrect_code', attemptsRemaining: 4 });
});

it('resends a code after the cooldown', async () => {
  const res = await request(app).post('/api/auth/register').send({ email: 'resend@example.com', password: 'Strong-pass-123' });
  const tooSoon = await request(app).post(`/api/auth/challenges/${res.body.challengeId}/resend`);
  expect(tooSoon.status).toBe(429);
  expect(tooSoon.body.code).toBe('resend_too_soon');

  await EmailChallenge.update({ lastSentAt: new Date(Date.now() - 61_000) }, { where: { id: res.body.challengeId } });
  mockSend.mockClear();
  const ok = await request(app).post(`/api/auth/challenges/${res.body.challengeId}/resend`);
  expect(ok.status).toBe(200);
  expect(ok.body).toEqual({ ok: true });
  expect(mockSend).toHaveBeenCalledTimes(1);
});
