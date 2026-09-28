import request from 'supertest';
import app from '../../app';
import { TrackedEmail } from '../../db/models';
import { resetDatabase, createUser, closeDatabase } from '../../test/helpers';

beforeAll(resetDatabase);
afterAll(closeDatabase);

it('always returns a valid transparent GIF, even for an unknown token', async () => {
  const res = await request(app).get('/api/o/no-such-token');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe('image/gif');
});

it('rate-limits a single token past its per-window cap', async () => {
  const user = await createUser({ email: 'pixel-owner@example.com' });
  await TrackedEmail.create({ userId: user.id, trackingToken: 'hammered-token', status: 'sent' });

  const statuses: number[] = [];
  for (let i = 0; i < 130; i++) {
    const res = await request(app).get('/api/o/hammered-token').set('User-Agent', `agent-${i}`);
    statuses.push(res.status);
  }

  expect(statuses.filter((s) => s === 200).length).toBe(120);
  expect(statuses.filter((s) => s === 429).length).toBe(10);
});

it('rate-limits per token, not globally — a different token is unaffected', async () => {
  const user = await createUser({ email: 'pixel-owner-2@example.com' });
  await TrackedEmail.create({ userId: user.id, trackingToken: 'fresh-token', status: 'sent' });

  const res = await request(app).get('/api/o/fresh-token');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe('image/gif');
});
