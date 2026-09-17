import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { User } from '../../db/models';
import { resetDatabase, createUser, bearer, closeDatabase } from '../../test/helpers';

jest.mock('../../services/email', () => ({
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
}));

beforeAll(resetDatabase);
afterAll(closeDatabase);

describe('POST /api/me/set-password', () => {
  it('refuses to overwrite an existing password (A5)', async () => {
    const user = await createUser({ passwordHash: await bcrypt.hash('original-pass-1', 4) });
    const res = await request(app)
      .post('/api/me/set-password')
      .set('Authorization', bearer(user))
      .send({ password: 'attacker-pass-1' });
    expect(res.status).toBe(409);
    await user.reload();
    expect(await bcrypt.compare('original-pass-1', user.passwordHash!)).toBe(true);
  });

  it('sets a first password, returns a new token, and revokes the old one', async () => {
    const user = await createUser();
    const oldAuth = bearer(user);
    const res = await request(app).post('/api/me/set-password').set('Authorization', oldAuth).send({ password: 'first-pass-12' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');

    expect((await request(app).get('/api/me').set('Authorization', oldAuth)).status).toBe(401);
    expect((await request(app).get('/api/me').set('Authorization', `Bearer ${res.body.token}`)).status).toBe(200);
  });
});

describe('POST /api/me/change-password', () => {
  it('returns a new token and revokes the old one', async () => {
    const user = await createUser({ passwordHash: await bcrypt.hash('current-pass-1', 4) });
    const oldAuth = bearer(user);
    const res = await request(app)
      .post('/api/me/change-password')
      .set('Authorization', oldAuth)
      .send({ currentPassword: 'current-pass-1', newPassword: 'next-pass-123' });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/me').set('Authorization', oldAuth)).status).toBe(401);
    expect((await request(app).get('/api/me').set('Authorization', `Bearer ${res.body.token}`)).status).toBe(200);
  });
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
