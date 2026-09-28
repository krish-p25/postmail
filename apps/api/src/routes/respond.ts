import { Response } from 'express';
import { ChallengeError } from '../services/challenges';
import type { User } from '../db/models';
import { signAccessToken, signExtensionToken, signRefreshToken, REFRESH_COOKIE, refreshCookieOptions } from '../services/tokens';

/** Send a ChallengeError as its own status/body; anything else is logged and returned as a 500. */
export function handleRouteError(res: Response, error: unknown, context: string, fallbackMessage: string): void {
  if (error instanceof ChallengeError) {
    res.status(error.status).json(error.toJSON());
    return;
  }
  console.error(`[PostMail API] ${context}:`, error);
  res.status(500).json({ error: fallbackMessage });
}

/**
 * Every successful sign-in/verify/password-change response, in one place —
 * this used to be `res.json({ token, user: {...} })` copy-pasted at each of
 * these call sites (see the duplication note on GitHub issue #82). Sets the
 * refresh cookie and sends both the short-lived access token (for the
 * dashboard's own use) and the long-lived extension token (for the browser
 * extension to pick up over a DOM event — see services/tokens.ts).
 */
export function sendSession(res: Response, user: User, extra: Record<string, unknown> = {}): void {
  res.cookie(REFRESH_COOKIE, signRefreshToken(user), refreshCookieOptions());
  res.json({
    ...extra,
    token: signAccessToken(user),
    extensionToken: signExtensionToken(user),
    user: { id: user.id, email: user.email, displayName: user.displayName },
  });
}
