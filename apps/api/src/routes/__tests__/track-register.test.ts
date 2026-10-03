import request from 'supertest';
import app from '../../app';
import { TrackedEmail } from '../../db/models';
import { resetDatabase, createUser, closeDatabase, bearer } from '../../test/helpers';

beforeAll(resetDatabase);
afterAll(closeDatabase);

it('registers an email with a long subject and a large recipient list', async () => {
  const user = await createUser();
  const subject = 'S'.repeat(300);
  const recipients = Array.from({ length: 60 }, (_, i) => `recipient-${i}@example.com`);

  const res = await request(app)
    .post('/api/track/register')
    .set('Authorization', bearer(user))
    .send({ trackingToken: 'long-fields-token', recipients, subject });

  expect(res.status).toBe(200);
  const row = await TrackedEmail.findOne({ where: { trackingToken: 'long-fields-token' } });
  expect(row?.subject).toBe(subject);
  expect(row?.recipient).toBe(recipients.join(', '));
});
