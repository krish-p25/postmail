jest.mock('../../services/email', () => ({
  sendChallengeEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
}));

// Mutable so each test can sign in as a distinct Google identity — the DB is
// only reset once for the whole file (beforeAll), so reusing 'google-123'
// across tests would find the previous test's already-linked account and
// skip the password-confirmation flow this file is testing.
let mockGooglePayload = { sub: 'google-123', email: 'linker@example.com', email_verified: true, name: 'Linker' };

jest.mock('google-auth-library', () => ({
  ...jest.requireActual('google-auth-library'),
  OAuth2Client: jest.fn().mockImplementation(() => ({
    getToken: jest.fn().mockResolvedValue({ tokens: { id_token: 'id-token' } }),
    revokeToken: jest.fn(),
    verifyIdToken: jest.fn().mockImplementation(async () => ({ getPayload: () => mockGooglePayload })),
  })),
}));

import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../app';
import { LinkedMailbox, PendingAccountLink } from '../../db/models';
import { sendChallengeEmail } from '../../services/email';
import { resetDatabase, createUser, closeDatabase, lastEmailedCode } from '../../test/helpers';

const mockSend = sendChallengeEmail as jest.Mock;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Same reason as mockGooglePayload above: each test needs its own Microsoft identity. */
function mockMicrosoftFetch(profile: { id: string; mail: string; userPrincipalName: string; displayName: string }) {
  return jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/token')) {
      return jsonResponse({ access_token: 'ms-access', refresh_token: 'ms-refresh', expires_in: 3600 });
    }
    if (url.startsWith('https://graph.microsoft.com/v1.0/me')) {
      return jsonResponse(profile);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

beforeAll(resetDatabase);
afterAll(closeDatabase);

it('links Google after the emailed code is confirmed, and never sends the idToken to the browser', async () => {
  const user = await createUser({ email: 'linker@example.com', passwordHash: await bcrypt.hash('Link-pass-123', 4) });
  mockGooglePayload = { sub: 'google-1', email: 'linker@example.com', email_verified: true, name: 'Linker' };

  const signIn = await request(app).post('/api/auth/google').send({ code: 'fake-code' });
  expect(signIn.status).toBe(200);
  expect(signIn.body).toEqual({ requiresPassword: true, email: 'linker@example.com', linkId: expect.any(String) });
  expect(JSON.stringify(signIn.body)).not.toContain('id-token');

  const link = await request(app).post('/api/auth/google/link').send({ linkId: signIn.body.linkId, password: 'Link-pass-123' });
  expect(link.status).toBe(200);
  expect(link.body).toEqual({ requiresVerification: true, email: 'linker@example.com', challengeId: expect.any(String) });
  await user.reload();
  expect(user.googleId).toBeNull();

  const code = lastEmailedCode(mockSend, 'linker@example.com');
  const verify = await request(app).post('/api/auth/verify').send({ challengeId: link.body.challengeId, code });
  expect(verify.status).toBe(200);
  await user.reload();
  expect(user.googleId).toBe('google-1');
});

it('a Google linkId is single-use', async () => {
  await createUser({ email: 'linker2@example.com', passwordHash: await bcrypt.hash('Link-pass-123', 4) });
  mockGooglePayload = { sub: 'google-2', email: 'linker2@example.com', email_verified: true, name: 'Linker Two' };

  const signIn = await request(app).post('/api/auth/google').send({ code: 'fake-code' });
  const linkId = signIn.body.linkId;
  expect(linkId).toEqual(expect.any(String));

  const first = await request(app).post('/api/auth/google/link').send({ linkId, password: 'wrong-password' });
  expect(first.status).toBe(401);

  // Even a failed password attempt consumes the linkId — replaying it must fail, not retry.
  const replay = await request(app).post('/api/auth/google/link').send({ linkId, password: 'Link-pass-123' });
  expect(replay.status).toBe(400);
  expect(replay.body.error).toMatch(/expired/i);
});

it('rejects an unknown or malformed Google linkId', async () => {
  const unknown = await request(app).post('/api/auth/google/link').send({ linkId: '00000000-0000-0000-0000-000000000000', password: 'x' });
  expect(unknown.status).toBe(400);

  const malformed = await request(app).post('/api/auth/google/link').send({ linkId: 'not-a-uuid', password: 'x' });
  expect(malformed.status).toBe(400);
});

it('links Microsoft after the emailed code is confirmed, and never sends the tokens to the browser', async () => {
  const user = await createUser({ email: 'ms-linker@contoso.com', passwordHash: await bcrypt.hash('Link-pass-123', 4) });
  const fetchSpy = mockMicrosoftFetch({ id: 'ms-1', mail: 'ms-linker@contoso.com', userPrincipalName: 'ms-linker@contoso.com', displayName: 'MS Linker' });

  const signIn = await request(app).post('/api/auth/microsoft').send({ code: 'fake-code' });
  expect(signIn.status).toBe(200);
  expect(signIn.body).toEqual({ requiresPassword: true, email: 'ms-linker@contoso.com', linkId: expect.any(String) });
  expect(JSON.stringify(signIn.body)).not.toMatch(/ms-access|ms-refresh/);

  const link = await request(app).post('/api/auth/microsoft/link').send({ linkId: signIn.body.linkId, password: 'Link-pass-123' });
  expect(link.status).toBe(200);
  expect(link.body.challengeId).toEqual(expect.any(String));

  const code = lastEmailedCode(mockSend, 'ms-linker@contoso.com');
  const verify = await request(app).post('/api/auth/verify').send({ challengeId: link.body.challengeId, code });
  expect(verify.status).toBe(200);
  await user.reload();
  expect(user.microsoftId).toBe('ms-1');
  expect(await LinkedMailbox.count({ where: { userId: user.id, provider: 'outlook' } })).toBe(1);
  fetchSpy.mockRestore();
});

it('a Microsoft linkId is single-use and scoped to its own provider', async () => {
  await createUser({ email: 'ms-linker2@contoso.com', passwordHash: await bcrypt.hash('Link-pass-123', 4) });
  const fetchSpy = mockMicrosoftFetch({ id: 'ms-2', mail: 'ms-linker2@contoso.com', userPrincipalName: 'ms-linker2@contoso.com', displayName: 'MS Linker Two' });

  const signIn = await request(app).post('/api/auth/microsoft').send({ code: 'fake-code' });
  const linkId = signIn.body.linkId;
  expect(linkId).toEqual(expect.any(String));

  // A Microsoft linkId must not be usable against the Google link endpoint.
  const wrongProvider = await request(app).post('/api/auth/google/link').send({ linkId, password: 'Link-pass-123' });
  expect(wrongProvider.status).toBe(400);

  const ok = await request(app).post('/api/auth/microsoft/link').send({ linkId, password: 'Link-pass-123' });
  expect(ok.status).toBe(200);

  const replay = await request(app).post('/api/auth/microsoft/link').send({ linkId, password: 'Link-pass-123' });
  expect(replay.status).toBe(400);

  fetchSpy.mockRestore();
});

it('rejects an expired pending link, which is then purged on the next one created', async () => {
  const user = await createUser({ email: 'expired-linker@example.com', passwordHash: await bcrypt.hash('Link-pass-123', 4) });
  const stale = await PendingAccountLink.create({
    provider: 'google',
    userId: user.id,
    payload: { idToken: 'id-token' },
    expiresAt: new Date(Date.now() - 1000),
  });

  const res = await request(app).post('/api/auth/google/link').send({ linkId: stale.id, password: 'Link-pass-123' });
  expect(res.status).toBe(400);
  // consumePendingLink's DELETE only matches unexpired rows, so the stale row
  // is left for the opportunistic purge in the next createPendingLink() call.
  expect(await PendingAccountLink.findByPk(stale.id)).not.toBeNull();

  mockGooglePayload = { sub: 'google-3', email: 'expired-linker@example.com', email_verified: true, name: 'Expired Linker' };
  await request(app).post('/api/auth/google').send({ code: 'fake-code' });
  expect(await PendingAccountLink.findByPk(stale.id)).toBeNull();
});
