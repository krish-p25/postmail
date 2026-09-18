/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('google-auth-library', () => {
  const payload = { sub: 'google-attacker', email: 'victim@example.com', email_verified: false, name: 'Attacker' };
  return {
    // Keep the real exports: googleapis imports other classes from this package.
    ...jest.requireActual('google-auth-library'),
    OAuth2Client: jest.fn().mockImplementation(() => ({
      getToken: jest.fn().mockResolvedValue({ tokens: { id_token: 'fake-id-token' } }),
      verifyIdToken: jest.fn().mockResolvedValue({ getPayload: () => payload }),
      revokeToken: jest.fn(),
    })),
  };
});

jest.mock('../../services/email', () => ({
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
  sendChallengeEmail: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import app from '../../app';
import { User } from '../../db/models';
import { resetDatabase, createUser, closeDatabase } from '../../test/helpers';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let fetchSpy: jest.SpyInstance | undefined;

beforeEach(resetDatabase);
afterAll(closeDatabase);
// Restore only the fetch spy: restoreAllMocks would also wipe the OAuth2Client
// mock instance that auth.ts created at import time.
afterEach(() => fetchSpy?.mockRestore());

it('Google sign-in with an unverified email does not link to an existing account', async () => {
  const victim = await createUser({ email: 'victim@example.com' });

  const res = await request(app).post('/api/auth/google').send({ code: 'code' });

  expect(res.status).toBe(400);
  await victim.reload();
  expect(victim.googleId).toBeNull();
});

it('Microsoft sign-in ignores a forged mail attribute', async () => {
  const victim = await createUser({ email: 'victim@example.com' });

  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/oauth2/v2.0/token')) {
      return jsonResponse({ access_token: 'ms-access', refresh_token: 'ms-refresh', expires_in: 3600 });
    }
    if (url.startsWith('https://graph.microsoft.com/v1.0/me')) {
      return jsonResponse({
        id: 'ms-attacker',
        mail: 'victim@example.com',
        userPrincipalName: 'attacker@evil.onmicrosoft.com',
        displayName: 'Attacker',
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  const res = await request(app).post('/api/auth/microsoft').send({ code: 'code' });

  expect(res.status).toBe(200);
  await victim.reload();
  expect(victim.microsoftId).toBeNull();
  const attackerAccount = await User.findOne({ where: { microsoftId: 'ms-attacker' } });
  expect(attackerAccount!.email).toBe('attacker@evil.onmicrosoft.com');
});
