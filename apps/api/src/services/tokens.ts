import crypto from 'crypto';
import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

/**
 * Three JWTs, all carrying the same {sub, email, ver} shape and checked by the
 * exact same authMiddleware — they differ only in who holds them and how long
 * they live, chosen for what each holder's storage can and can't leak:
 *
 * - Access token (short, 15m): what the dashboard keeps in localStorage and
 *   sends as Authorization: Bearer. Short-lived so a script running on the
 *   dashboard (an XSS, e.g. #3 before it was fixed) that reads localStorage
 *   only gets a few minutes of access, not up to 7 days of it.
 * - Extension token (no expiry): handed to the extension once, at login, over
 *   a DOM event — never written to localStorage. It's kept in
 *   chrome.storage.local, which dashboard-page JavaScript cannot read at all
 *   (a real isolation boundary, not just a different key) — the XSS blast
 *   radius this whole split defends against never applied to it, so there's
 *   no reason to expire it on a timer. It dies only when `tokenVersion` is
 *   bumped (password change) or the user disconnects the extension.
 * - Refresh token (30d): an httpOnly cookie, so no JavaScript anywhere can
 *   read it. Used only to mint a fresh access token via POST /auth/refresh,
 *   letting the dashboard keep working without the user noticing the access
 *   token expired. Signed with a key *derived* from JWT_SECRET, never the
 *   secret itself — same reasoning as password-tickets.ts: a token signed
 *   with the real secret would double as a session token for authMiddleware.
 *
 * See docs/security-review.md #8e.
 */

const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

interface SessionUser {
  id: string;
  email: string;
  tokenVersion: number;
}

function sign(user: SessionUser, expiresIn?: number): string {
  const payload = { sub: user.id, email: user.email, ver: user.tokenVersion };
  return expiresIn === undefined ? jwt.sign(payload, config.jwtSecret) : jwt.sign(payload, config.jwtSecret, { expiresIn });
}

export function signAccessToken(user: SessionUser): string {
  return sign(user, ACCESS_TTL_SECONDS);
}

export function signExtensionToken(user: SessionUser): string {
  return sign(user);
}

const refreshKey = crypto.createHmac('sha256', config.jwtSecret).update('refresh-token-v1').digest('hex');

interface RefreshPayload {
  sub: string;
  ver: number;
}

export function signRefreshToken(user: SessionUser): string {
  const payload: RefreshPayload = { sub: user.id, ver: user.tokenVersion };
  return jwt.sign(payload, refreshKey, { expiresIn: REFRESH_TTL_SECONDS });
}

/** Returns the refresh token's claims, or null if invalid, expired, or malformed. */
export function verifyRefreshToken(raw: unknown): RefreshPayload | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const payload = jwt.verify(raw, refreshKey) as RefreshPayload;
    if (typeof payload.sub !== 'string' || typeof payload.ver !== 'number') return null;
    return payload;
  } catch {
    return null;
  }
}

/** Same shape as devices.ts's DEVICE_COOKIE — httpOnly so no script can ever read it. */
export const REFRESH_COOKIE = 'pm_refresh';

export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: REFRESH_TTL_SECONDS * 1000,
  };
}
