jest.mock('../../services/email', () => ({
  sendChallengeEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../app';
import { User } from '../../db/models';
import { sendChallengeEmail } from '../../services/email';
import { applyPasswordHash, hashPassword } from '../../services/passwords';
import { resetDatabase, createUser, closeDatabase, lastEmailedCode } from '../../test/helpers';

const mockSend = sendChallengeEmail as jest.Mock;
const PASSWORD = 'Login-pass-123';

beforeAll(resetDatabase);
afterAll(closeDatabase);

async function makeUser(email: string): Promise<User> {
  return createUser({ email, passwordHash: await bcrypt.hash(PASSWORD, 4) });
}

async function signInWithCode(email: string, rememberDevice: boolean) {
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  const code = lastEmailedCode(mockSend, email);
  return request(app).post('/api/auth/login/confirm').send({ challengeId: login.body.challengeId, code, rememberDevice });
}

function deviceCookie(res: request.Response): string {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith('pm_device='));
  if (!cookie) throw new Error('pm_device cookie not set');
  return cookie;
}

it('asks an unrecognised browser for an emailed code', async () => {
  await makeUser('new-browser@example.com');
  const res = await request(app).post('/api/auth/login').send({ email: 'new-browser@example.com', password: PASSWORD });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ requiresCode: true, challengeId: expect.any(String), email: 'new-browser@example.com' });
  expect(res.body.token).toBeUndefined();
});

it('does not email a code for a wrong password', async () => {
  await makeUser('wrong-pass@example.com');
  mockSend.mockClear();
  const res = await request(app).post('/api/auth/login').send({ email: 'wrong-pass@example.com', password: 'not-the-password' });
  expect(res.status).toBe(401);
  expect(mockSend).not.toHaveBeenCalled();
});

it('remembers the browser when asked, then skips the code', async () => {
  await makeUser('remember@example.com');
  const confirm = await signInWithCode('remember@example.com', true);
  expect(confirm.status).toBe(200);
  expect(confirm.body.token).toEqual(expect.any(String));

  const cookie = deviceCookie(confirm);
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=Strict/i);
  expect(cookie).toMatch(/Path=\/api\/auth/);

  mockSend.mockClear();
  const again = await request(app)
    .post('/api/auth/login')
    .set('Cookie', cookie.split(';')[0])
    .send({ email: 'remember@example.com', password: PASSWORD });
  expect(again.status).toBe(200);
  expect(again.body.token).toEqual(expect.any(String));
  expect(mockSend).not.toHaveBeenCalled();
});

it("does not set a cookie without rememberDevice, and ignores another user's cookie", async () => {
  await makeUser('no-remember@example.com');
  const confirm = await signInWithCode('no-remember@example.com', false);
  expect(confirm.status).toBe(200);
  expect(confirm.headers['set-cookie']).toBeUndefined();

  await makeUser('cookie-owner@example.com');
  const ownerCookie = deviceCookie(await signInWithCode('cookie-owner@example.com', true)).split(';')[0];
  const res = await request(app)
    .post('/api/auth/login')
    .set('Cookie', ownerCookie)
    .send({ email: 'no-remember@example.com', password: PASSWORD });
  expect(res.body.requiresCode).toBe(true);
});

it('forgets remembered browsers after a password change', async () => {
  const user = await makeUser('forget@example.com');
  const cookie = deviceCookie(await signInWithCode('forget@example.com', true)).split(';')[0];

  await applyPasswordHash(user, await hashPassword('Changed-pass-123'));

  const res = await request(app).post('/api/auth/login').set('Cookie', cookie).send({ email: 'forget@example.com', password: 'Changed-pass-123' });
  expect(res.body.requiresCode).toBe(true);
});
