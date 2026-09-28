import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import { signAccessToken, signExtensionToken, signRefreshToken, verifyRefreshToken, REFRESH_TTL_SECONDS } from '../tokens';

const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.com', tokenVersion: 3 };

function decode(token: string) {
  return jwt.verify(token, config.jwtSecret) as { sub: string; email: string; ver: number; iat: number; exp: number };
}

it('access and extension tokens both verify with JWT_SECRET, carrying the same claims', () => {
  for (const token of [signAccessToken(USER), signExtensionToken(USER)]) {
    const payload = decode(token);
    expect(payload).toEqual(expect.objectContaining({ sub: USER.id, email: USER.email, ver: USER.tokenVersion }));
  }
});

it('the extension token carries no expiry claim, unlike the access token', () => {
  const access = decode(signAccessToken(USER));
  const extension = decode(signExtensionToken(USER));
  expect(access.exp).toEqual(expect.any(Number));
  expect(extension.exp).toBeUndefined();
});

it('an extension token issued years ago still verifies (no expiry to time out)', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
  const token = signExtensionToken(USER);
  jest.setSystemTime(new Date('2036-01-01T00:00:00Z'));
  expect(() => jwt.verify(token, config.jwtSecret)).not.toThrow();
  jest.useRealTimers();
});

it('an access token expired by time is rejected by jwt.verify itself', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
  const token = signAccessToken(USER);
  jest.setSystemTime(new Date(Date.now() + 16 * 60 * 1000));
  expect(() => jwt.verify(token, config.jwtSecret)).toThrow();
  jest.useRealTimers();
});

describe('refresh token', () => {
  it('round-trips for the exact user and version it was issued to', () => {
    const token = signRefreshToken(USER);
    expect(verifyRefreshToken(token)).toEqual(expect.objectContaining({ sub: USER.id, ver: USER.tokenVersion }));
  });

  it('does not verify with JWT_SECRET, so it is useless as an access/extension token', () => {
    const token = signRefreshToken(USER);
    expect(() => jwt.verify(token, config.jwtSecret)).toThrow();
  });

  it('an access token is rejected by verifyRefreshToken (different signing key)', () => {
    const token = signAccessToken(USER);
    expect(verifyRefreshToken(token)).toBeNull();
  });

  it('rejects junk, empty and non-string input', () => {
    expect(verifyRefreshToken('not-a-jwt')).toBeNull();
    expect(verifyRefreshToken('')).toBeNull();
    expect(verifyRefreshToken(undefined)).toBeNull();
    expect(verifyRefreshToken({ sub: USER.id })).toBeNull();
  });

  it('rejects an expired refresh token', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = signRefreshToken(USER);
    jest.setSystemTime(new Date(Date.now() + (REFRESH_TTL_SECONDS + 5) * 1000));
    expect(verifyRefreshToken(token)).toBeNull();
    jest.useRealTimers();
  });
});
