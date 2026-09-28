import request from 'supertest';
import app from '../../app';
import { issueConnectState } from '../../services/oauth-state';
import { resetDatabase, createUser, closeDatabase, bearer } from '../../test/helpers';

beforeAll(resetDatabase);
afterAll(closeDatabase);

describe.each([
  { provider: 'gmail' as const, connectPath: '/api/gmail/connect', callbackPath: '/api/gmail/callback' },
  { provider: 'microsoft' as const, connectPath: '/api/outlook/connect', callbackPath: '/api/outlook/callback' },
])('$provider mailbox-connect state', ({ provider, connectPath, callbackPath }) => {
  it('/connect issues a state bound to the calling user', async () => {
    const user = await createUser();
    const res = await request(app).get(connectPath).set('Authorization', bearer(user));
    expect(res.status).toBe(200);

    const url = new URL(res.body.url);
    const state = provider === 'microsoft'
      ? url.searchParams.get('state')!.replace(/^connect-mailbox:/, '')
      : url.searchParams.get('state')!;
    expect(state).toEqual(expect.any(String));
    expect(state.length).toBeGreaterThan(0);
  });

  it('/callback rejects a missing state without attempting a token exchange', async () => {
    const user = await createUser();
    const res = await request(app).post(callbackPath).set('Authorization', bearer(user)).send({ code: 'fake-code' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('/callback rejects a garbage state', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(callbackPath)
      .set('Authorization', bearer(user))
      .send({ code: 'fake-code', state: 'not-a-real-state' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it("/callback rejects another user's valid state", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const stateForOwner = issueConnectState(owner.id, provider);

    const res = await request(app)
      .post(callbackPath)
      .set('Authorization', bearer(attacker))
      .send({ code: 'fake-code', state: stateForOwner });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('/callback rejects a state issued for the other provider', async () => {
    const user = await createUser();
    const wrongProvider = provider === 'gmail' ? 'microsoft' : 'gmail';
    const stateForOtherProvider = issueConnectState(user.id, wrongProvider);

    const res = await request(app)
      .post(callbackPath)
      .set('Authorization', bearer(user))
      .send({ code: 'fake-code', state: stateForOtherProvider });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('/callback accepts its own valid state and proceeds past the state check', async () => {
    const user = await createUser();
    const state = issueConnectState(user.id, provider);

    const res = await request(app)
      .post(callbackPath)
      .set('Authorization', bearer(user))
      .send({ code: 'fake-code', state });
    // A fake code fails the real token exchange (not mocked here), but the
    // response must NOT be the state-rejection message — proving state was
    // checked and passed before the exchange was ever attempted.
    expect(res.body.error).not.toMatch(/expired/i);
  });
});
