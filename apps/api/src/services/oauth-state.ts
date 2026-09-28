import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

/**
 * Binds a mailbox-connect OAuth flow to the user who started it, so the
 * `code` returned to /gmail/callback or /outlook/callback can only be
 * exchanged by the same account's session that requested it (see
 * docs/security-review.md #6 — without this, an attacker's own authorization
 * code, handed to a logged-in victim, gets *the attacker's* mailbox linked
 * into *the victim's* account).
 *
 * Sign-in (no session yet) uses a different mechanism — a client-generated
 * nonce round-tripped through sessionStorage — since there is no userId to
 * bind to yet; see auth.ts's startOAuthNonce/consumeOAuthNonce.
 *
 * Signed with a key *derived* from JWT_SECRET, never JWT_SECRET itself, same
 * reasoning as password-tickets.ts: a token signed with the real secret would
 * double as a session token for the auth middleware.
 */

const STATE_TTL_SECONDS = 10 * 60;

export type ConnectProvider = 'gmail' | 'microsoft';

interface StatePayload {
  sub: string;
  provider: ConnectProvider;
}

const stateKey = crypto.createHmac('sha256', config.jwtSecret).update('oauth-connect-state-v1').digest('hex');

export function issueConnectState(userId: string, provider: ConnectProvider): string {
  const payload: StatePayload = { sub: userId, provider };
  return jwt.sign(payload, stateKey, { expiresIn: STATE_TTL_SECONDS });
}

/** True only if `raw` is a live state issued to this exact user for this exact provider. */
export function verifyConnectState(raw: unknown, provider: ConnectProvider, userId: string): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  try {
    const payload = jwt.verify(raw, stateKey) as StatePayload;
    return payload.provider === provider && payload.sub === userId;
  } catch {
    return false;
  }
}
