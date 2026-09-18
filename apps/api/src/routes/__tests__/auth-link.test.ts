jest.mock('../../services/email', () => ({
  sendChallengeEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('google-auth-library', () => ({
  ...jest.requireActual('google-auth-library'),
  OAuth2Client: jest.fn().mockImplementation(() => ({
    getToken: jest.fn(),
    revokeToken: jest.fn(),
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => ({ sub: 'google-123', email: 'linker@example.com', email_verified: true, name: 'Linker' }),
    }),
  })),
}));

import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../app';
import { LinkedMailbox } from '../../db/models';
import { sendChallengeEmail } from '../../services/email';
import { resetDatabase, createUser, closeDatabase, lastEmailedCode } from '../../test/helpers';

const mockSend = sendChallengeEmail as jest.Mock;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeAll(resetDatabase);
afterAll(closeDatabase);

it('links Google after the emailed code is confirmed', async () => {
  const user = await createUser({ email: 'linker@example.com', passwordHash: await bcrypt.hash('Link-pass-123', 4) });

  const link = await request(app).post('/api/auth/google/link').send({ idToken: 'id-token', password: 'Link-pass-123' });
  expect(link.status).toBe(200);
  expect(link.body).toEqual({ requiresVerification: true, email: 'linker@example.com', challengeId: expect.any(String) });
  await user.reload();
  expect(user.googleId).toBeNull();

  const code = lastEmailedCode(mockSend, 'linker@example.com');
  const verify = await request(app).post('/api/auth/verify').send({ challengeId: link.body.challengeId, code });
  expect(verify.status).toBe(200);
  await user.reload();
  expect(user.googleId).toBe('google-123');
});

it('links Microsoft after the emailed code is confirmed', async () => {
  const user = await createUser({ email: 'ms-linker@contoso.com', passwordHash: await bcrypt.hash('Link-pass-123', 4) });
  const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    if (String(input).startsWith('https://graph.microsoft.com/v1.0/me')) {
      return jsonResponse({ id: 'ms-123', mail: 'ms-linker@contoso.com', userPrincipalName: 'ms-linker@contoso.com', displayName: 'MS Linker' });
    }
    throw new Error(`Unexpected fetch: ${String(input)}`);
  });

  const link = await request(app).post('/api/auth/microsoft/link').send({ accessToken: 'ms-access', password: 'Link-pass-123', refreshToken: 'ms-refresh' });
  expect(link.status).toBe(200);
  expect(link.body.challengeId).toEqual(expect.any(String));

  const code = lastEmailedCode(mockSend, 'ms-linker@contoso.com');
  const verify = await request(app).post('/api/auth/verify').send({ challengeId: link.body.challengeId, code });
  expect(verify.status).toBe(200);
  await user.reload();
  expect(user.microsoftId).toBe('ms-123');
  expect(await LinkedMailbox.count({ where: { userId: user.id, provider: 'outlook' } })).toBe(1);
  fetchSpy.mockRestore();
});
