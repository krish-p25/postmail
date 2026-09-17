import request from 'supertest';
import app from '../app';
import { TrackedEmail, EmailOpen, LinkedMailbox, UserSetting, User } from '../db/models';
import { resetDatabase, createUser, bearer, closeDatabase } from '../test/helpers';

describe("tenant isolation: Bob cannot reach Alice's data", () => {
  let alice: User;
  let bob: User;
  let asAlice: string;
  let asBob: string;
  let email: TrackedEmail;
  let open: EmailOpen;
  let gmailBox: LinkedMailbox;
  let outlookBox: LinkedMailbox;
  const token = '11111111-1111-4111-8111-111111111111';

  beforeAll(async () => {
    await resetDatabase();
    alice = await createUser();
    bob = await createUser();
    asAlice = bearer(alice);
    asBob = bearer(bob);

    gmailBox = await LinkedMailbox.create({ userId: alice.id, provider: 'gmail', email: 'alice@gmail.com', refreshToken: 'r' });
    outlookBox = await LinkedMailbox.create({ userId: alice.id, provider: 'outlook', email: 'alice@outlook.com', refreshToken: 'r' });
    email = await TrackedEmail.create({
      userId: alice.id,
      trackingToken: token,
      subject: 'Secret',
      status: 'sent',
      mailboxId: gmailBox.id,
      messageId: 'gmail-msg-1',
      sentAt: new Date(),
    });
    open = await EmailOpen.create({ trackedEmailId: email.id, userId: alice.id, ipAddress: '1.2.3.4' });
    await UserSetting.create({ userId: alice.id, discordWebhookUrl: 'https://discord.com/api/webhooks/alice' });
  });

  afterAll(closeDatabase);

  it('control: Alice can read her own email (suite is not vacuous)', async () => {
    const res = await request(app).get(`/api/emails/${email.id}`).set('Authorization', asAlice);
    expect(res.status).toBe(200);
    expect(res.body.email.id).toBe(email.id);
  });

  it("GET /api/emails lists none of Alice's emails", async () => {
    const res = await request(app).get('/api/emails').set('Authorization', asBob);
    expect(res.status).toBe(200);
    expect(res.body.emails).toEqual([]);
  });

  it('GET /api/emails/:id returns 404', async () => {
    const res = await request(app).get(`/api/emails/${email.id}`).set('Authorization', asBob);
    expect(res.status).toBe(404);
  });

  it('POST /api/emails/opens/:openId/dismiss returns 404 and changes nothing', async () => {
    const res = await request(app).post(`/api/emails/opens/${open.id}/dismiss`).set('Authorization', asBob);
    expect(res.status).toBe(404);
    await open.reload();
    expect(open.dismissed).toBe(false);
  });

  it("GET /api/mailboxes returns none of Alice's mailboxes", async () => {
    const res = await request(app).get('/api/mailboxes').set('Authorization', asBob);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('DELETE /api/mailboxes/:id returns 404 and keeps the mailbox', async () => {
    const res = await request(app).delete(`/api/mailboxes/${gmailBox.id}`).set('Authorization', asBob);
    expect(res.status).toBe(404);
    expect(await LinkedMailbox.findByPk(gmailBox.id)).not.toBeNull();
  });

  it("GET /api/settings exposes none of Alice's settings", async () => {
    const res = await request(app).get('/api/settings').set('Authorization', asBob);
    expect(res.status).toBe(200);
    expect(res.body.discordWebhookUrl).toBeNull();
    expect(res.body.linkedMailboxes).toEqual([]);
  });

  it("PUT /api/settings does not touch Alice's row", async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', asBob)
      .send({ discordWebhookUrl: 'https://discord.com/api/webhooks/bob' });
    expect(res.status).toBe(200);
    const aliceSetting = await UserSetting.findOne({ where: { userId: alice.id } });
    expect(aliceSetting!.discordWebhookUrl).toBe('https://discord.com/api/webhooks/alice');
  });

  it("GET /api/track/preflight lists none of Alice's linked emails", async () => {
    const res = await request(app).get('/api/track/preflight').set('Authorization', asBob);
    expect(res.status).toBe(200);
    expect(res.body.linkedEmails).toEqual([]);
  });

  it('POST /api/track/update returns 404 and changes nothing', async () => {
    const res = await request(app).post('/api/track/update').set('Authorization', asBob).send({ trackingToken: token, subject: 'pwned' });
    expect(res.status).toBe(404);
    await email.reload();
    expect(email.subject).toBe('Secret');
  });

  it('POST /api/track/discard returns 404 and changes nothing', async () => {
    const res = await request(app).post('/api/track/discard').set('Authorization', asBob).send({ trackingToken: token });
    expect(res.status).toBe(404);
    await email.reload();
    expect(email.status).toBe('sent');
  });

  it('POST /api/track/self-view ignores another user\'s token', async () => {
    const res = await request(app)
      .post('/api/track/self-view')
      .set('Authorization', asBob)
      .send({ trackingToken: token, accountEmail: 'alice@gmail.com' });
    expect(res.status).toBe(204);
    await open.reload();
    expect(open.likelySelf).toBe(false);
  });

  it('POST /api/track/verify-sent reports not found and changes nothing', async () => {
    const res = await request(app).post('/api/track/verify-sent').set('Authorization', asBob).send({ trackingToken: token, provider: 'gmail' });
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(false);
    await email.reload();
    expect(email.mailboxId).toBe(gmailBox.id);
  });

  it.each([
    ['gmail list', () => `/api/gmail/emails?mailboxId=${gmailBox.id}`],
    ['gmail detail', () => `/api/gmail/emails/gmail-msg-1?mailboxId=${gmailBox.id}`],
    ['gmail attachment', () => `/api/gmail/emails/gmail-msg-1/attachments/att-1?mailboxId=${gmailBox.id}`],
    ['outlook list', () => `/api/outlook/emails?mailboxId=${outlookBox.id}`],
    ['outlook detail', () => `/api/outlook/emails/msg-1?mailboxId=${outlookBox.id}`],
    ['outlook attachment', () => `/api/outlook/emails/msg-1/attachments/att-1?mailboxId=${outlookBox.id}`],
  ])("GET %s with Alice's mailboxId returns 400 (mailbox not found for Bob)", async (_label, url) => {
    const res = await request(app).get(url()).set('Authorization', asBob);
    expect(res.status).toBe(400);
  });

  it.each(['gmail', 'outlook'])("POST /api/%s/disconnect leaves Alice's mailboxes alone", async (provider) => {
    const res = await request(app).post(`/api/${provider}/disconnect`).set('Authorization', asBob);
    expect(res.status).toBe(200);
    expect(await LinkedMailbox.count({ where: { userId: alice.id } })).toBe(2);
  });
});
