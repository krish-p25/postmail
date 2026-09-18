jest.mock('../email', () => ({
  sendChallengeEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
}));

import { EmailChallenge } from '../../db/models';
import { sendChallengeEmail } from '../email';
import {
  ChallengeError,
  confirmChallenge,
  createChallenge,
  discardChallengesForUser,
  generateCode,
  resendChallenge,
  sendCodeInBackground,
} from '../challenges';
import { resetDatabase, createUser, closeDatabase, wrongCode } from '../../test/helpers';

const mockSend = sendChallengeEmail as jest.Mock;

beforeEach(async () => {
  await resetDatabase();
  mockSend.mockClear();
});
afterAll(closeDatabase);

async function expectChallengeError(promise: Promise<unknown>, code: string, details: Record<string, unknown> = {}) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(ChallengeError);
  expect((error as ChallengeError).code).toBe(code);
  expect((error as ChallengeError).details).toEqual(expect.objectContaining(details));
}

const backdate = (id: string, ms: number) =>
  EmailChallenge.update({ lastSentAt: new Date(Date.now() - ms) }, { where: { id } });

it('generates zero-padded 6-digit codes', () => {
  for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/);
});

it('stores only a hash of the code and lowercases the email', async () => {
  const { challenge, code } = await createChallenge({ purpose: 'register', email: 'Mixed@Example.com', userId: null });
  expect(challenge.email).toBe('mixed@example.com');
  expect(challenge.codeHash).toMatch(/^[0-9a-f]{64}$/);
  expect(challenge.codeHash).not.toContain(code);
});

it('confirms once, returns the payload, then the code is gone', async () => {
  const { challenge, code } = await createChallenge({ purpose: 'register', email: 'a@example.com', userId: null, payload: { hello: 'world' } });
  const confirmed = await confirmChallenge(challenge.id, 'register', code);
  expect(confirmed.payload).toEqual({ hello: 'world' });
  await expectChallengeError(confirmChallenge(challenge.id, 'register', code), 'invalid_or_expired');
});

it('counts wrong codes and locks after 5 attempts, even for the right code', async () => {
  const { challenge, code } = await createChallenge({ purpose: 'login', email: 'b@example.com', userId: null });
  for (let remaining = 4; remaining >= 0; remaining--) {
    await expectChallengeError(confirmChallenge(challenge.id, 'login', wrongCode(code)), 'incorrect_code', { attemptsRemaining: remaining });
  }
  await expectChallengeError(confirmChallenge(challenge.id, 'login', code), 'too_many_attempts');
});

it('rejects expired codes, wrong purposes, malformed ids and other users', async () => {
  const user = await createUser();
  const { challenge, code } = await createChallenge({ purpose: 'set-password', email: user.email, userId: user.id });
  await expectChallengeError(confirmChallenge(challenge.id, 'login', code), 'invalid_or_expired');
  await expectChallengeError(confirmChallenge('not-a-uuid', 'set-password', code), 'invalid_or_expired');
  const other = await createUser();
  await expectChallengeError(confirmChallenge(challenge.id, 'set-password', code, { userId: other.id }), 'invalid_or_expired');
  await EmailChallenge.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: challenge.id } });
  await expectChallengeError(confirmChallenge(challenge.id, 'set-password', code, { userId: user.id }), 'invalid_or_expired');
});

it('lets exactly one of two concurrent confirms succeed', async () => {
  const { challenge, code } = await createChallenge({ purpose: 'register', email: 'race@example.com', userId: null });
  const results = await Promise.allSettled([
    confirmChallenge(challenge.id, 'register', code),
    confirmChallenge(challenge.id, 'register', code),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});

it('supersedes the previous challenge for the same email and purpose', async () => {
  const first = await createChallenge({ purpose: 'password-reset', email: 'c@example.com', userId: null });
  await createChallenge({ purpose: 'password-reset', email: 'c@example.com', userId: null });
  await expectChallengeError(confirmChallenge(first.challenge.id, 'password-reset', first.code), 'invalid_or_expired');
});

it('enforces the 60 second resend cooldown and keeps attempts', async () => {
  const { challenge, code } = await createChallenge({ purpose: 'login', email: 'd@example.com', userId: null });
  await expectChallengeError(confirmChallenge(challenge.id, 'login', wrongCode(code)), 'incorrect_code', { attemptsRemaining: 4 });
  await expectChallengeError(resendChallenge(challenge.id), 'resend_too_soon');

  await backdate(challenge.id, 61_000);
  const resent = await resendChallenge(challenge.id);
  expect(resent.challenge.sendCount).toBe(2);
  await expectChallengeError(confirmChallenge(challenge.id, 'login', wrongCode(resent.code)), 'incorrect_code', { attemptsRemaining: 3 });
  await confirmChallenge(challenge.id, 'login', resent.code);
});

it('caps codes at 5 per email per hour across creates and resends', async () => {
  const { challenge } = await createChallenge({ purpose: 'login', email: 'e@example.com', userId: null });
  for (let i = 0; i < 4; i++) {
    await backdate(challenge.id, 61_000);
    await resendChallenge(challenge.id);
  }
  await backdate(challenge.id, 61_000);
  await expectChallengeError(resendChallenge(challenge.id), 'send_limit_reached');
  await expectChallengeError(createChallenge({ purpose: 'register', email: 'e@example.com', userId: null }), 'send_limit_reached');
});

it('treats an unknown-email reset as a challenge that can never be confirmed', async () => {
  const { challenge, code } = await createChallenge({ purpose: 'password-reset', email: 'nobody@example.com', userId: null });
  await expectChallengeError(confirmChallenge(challenge.id, 'password-reset', code), 'incorrect_code', { attemptsRemaining: 4 });
  sendCodeInBackground(challenge, code);
  expect(mockSend).not.toHaveBeenCalled();
});

it('sends real challenge codes in the background', async () => {
  const user = await createUser();
  const { challenge, code } = await createChallenge({ purpose: 'password-reset', email: user.email, userId: user.id });
  sendCodeInBackground(challenge, code);
  expect(mockSend).toHaveBeenCalledWith('password-reset', user.email.toLowerCase(), code);
});

it('discards open challenges for a user', async () => {
  const user = await createUser();
  const { challenge, code } = await createChallenge({ purpose: 'set-password', email: user.email, userId: user.id });
  await discardChallengesForUser(user.id);
  await expectChallengeError(confirmChallenge(challenge.id, 'set-password', code), 'invalid_or_expired');
});

it('serialises errors for HTTP', () => {
  expect(new ChallengeError('incorrect_code', { attemptsRemaining: 1 }).toJSON()).toEqual({
    error: 'Incorrect code. 1 attempt remaining.',
    code: 'incorrect_code',
    attemptsRemaining: 1,
  });
  expect(new ChallengeError('resend_too_soon', { retryAfterSeconds: 42 }).status).toBe(429);
  expect(new ChallengeError('invalid_or_expired').status).toBe(400);
});
