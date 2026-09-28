import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import { issueConnectState, verifyConnectState } from '../oauth-state';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

it('verifies a state for the exact user and provider it was issued to', () => {
  const state = issueConnectState(USER_ID, 'gmail');
  expect(verifyConnectState(state, 'gmail', USER_ID)).toBe(true);
});

it('rejects a state presented for a different user', () => {
  const state = issueConnectState(USER_ID, 'gmail');
  expect(verifyConnectState(state, 'gmail', OTHER_USER_ID)).toBe(false);
});

it('rejects a state presented for a different provider', () => {
  const state = issueConnectState(USER_ID, 'gmail');
  expect(verifyConnectState(state, 'microsoft', USER_ID)).toBe(false);
});

it('rejects junk, empty and non-string state', () => {
  expect(verifyConnectState('not-a-jwt', 'gmail', USER_ID)).toBe(false);
  expect(verifyConnectState('', 'gmail', USER_ID)).toBe(false);
  expect(verifyConnectState(undefined, 'gmail', USER_ID)).toBe(false);
  expect(verifyConnectState({ sub: USER_ID }, 'gmail', USER_ID)).toBe(false);
});

it('rejects an expired state', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
  const state = issueConnectState(USER_ID, 'gmail');
  jest.setSystemTime(new Date(Date.now() + 11 * 60 * 1000));
  expect(verifyConnectState(state, 'gmail', USER_ID)).toBe(false);
  jest.useRealTimers();
});

it('cannot be verified with JWT_SECRET, so it is useless as a session token', () => {
  const state = issueConnectState(USER_ID, 'gmail');
  expect(() => jwt.verify(state, config.jwtSecret)).toThrow();
});

it('does not accept a session token in place of a state', () => {
  const sessionToken = jwt.sign({ sub: USER_ID, email: 'a@b.com', ver: 0 }, config.jwtSecret, { expiresIn: '7d' });
  expect(verifyConnectState(sessionToken, 'gmail', USER_ID)).toBe(false);
});
