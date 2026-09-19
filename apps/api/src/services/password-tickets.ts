import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

/**
 * Short-lived proof that an emailed code was confirmed, letting the user choose
 * a password on a later request than the one that verified their identity.
 *
 * - Signed with a key *derived* from JWT_SECRET, never JWT_SECRET itself: the auth
 *   middleware accepts any JWT signed with that secret whose `sub`/`ver` line up,
 *   so a ticket signed with it would double as a session token.
 * - Single use comes from `ver`: applyPasswordHash() increments the user's
 *   token_version, so a ticket stops matching the moment it is spent.
 */

export const TICKET_TTL_SECONDS = 10 * 60;

export type TicketPurpose = 'set-password' | 'password-reset';

interface TicketPayload {
  sub: string;
  pw: TicketPurpose;
  ver: number;
}

const ticketKey = crypto.createHmac('sha256', config.jwtSecret).update('password-ticket-v1').digest('hex');

export function issuePasswordTicket(input: { userId: string; purpose: TicketPurpose; tokenVersion: number }): string {
  const payload: TicketPayload = { sub: input.userId, pw: input.purpose, ver: input.tokenVersion };
  return jwt.sign(payload, ticketKey, { expiresIn: TICKET_TTL_SECONDS });
}

/** Returns the ticket's claims, or null if it is invalid, expired or for another purpose. */
export function readPasswordTicket(raw: unknown, purpose: TicketPurpose): TicketPayload | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const payload = jwt.verify(raw, ticketKey) as TicketPayload;
    if (payload.pw !== purpose || typeof payload.sub !== 'string' || typeof payload.ver !== 'number') return null;
    return payload;
  } catch {
    return null;
  }
}
