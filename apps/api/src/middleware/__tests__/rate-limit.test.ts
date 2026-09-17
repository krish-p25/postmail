import request from 'supertest';
import app from '../../app';
import { resetDatabase, closeDatabase } from '../../test/helpers';

beforeAll(resetDatabase);
afterAll(closeDatabase);

// supertest always connects from 127.0.0.1, just like requests arriving through Docker.
const login = (email: string, clientIp: string) =>
  request(app)
    .post('/api/auth/login')
    .set('CF-Connecting-IP', clientIp)
    .send({ email, password: 'wrong-password' });

it('locks an email after 10 failed logins, even if the caller rotates IPs', async () => {
  for (let i = 0; i < 10; i++) {
    expect((await login('target@example.com', `192.0.2.${i}`)).status).toBe(401);
  }
  const blocked = await login('target@example.com', '192.0.2.99');
  expect(blocked.status).toBe(429);
  expect(blocked.body.error).toMatch(/too many/i);
});

it('does not lock other emails', async () => {
  expect((await login('someone-else@example.com', '192.0.2.200')).status).toBe(401);
});

it('limits per real client IP, so one client cannot lock out others behind the same proxy', async () => {
  for (let i = 0; i < 30; i++) {
    expect((await login(`spray${i}@example.com`, '203.0.113.7')).status).toBe(401);
  }
  expect((await login('spray-final@example.com', '203.0.113.7')).status).toBe(429);
  expect((await login('other-client@example.com', '198.51.100.9')).status).toBe(401);
});
