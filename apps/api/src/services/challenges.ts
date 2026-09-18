import crypto from 'crypto';
import { Op, Transaction } from 'sequelize';
import { config } from '../config/env';
import { sequelize } from '../db/sequelize';
import { EmailChallenge } from '../db/models';
import type { ChallengePurpose } from './challenge-purposes';
import { sendChallengeEmail } from './email';

/**
 * Emailed 6-digit codes guarding sign-up, password changes, password resets,
 * new-device sign-in and account linking.
 *
 * - Codes are stored as HMAC-SHA256(JWT_SECRET, "<id>:<code>").
 * - Attempts are counted atomically in Postgres; a correct code is consumed by DELETE … RETURNING.
 * - A password-reset challenge with no user ("dead") follows the same paths but never matches,
 *   so responses don't reveal whether an account exists.
 */

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_SENDS_PER_HOUR = 5;
const ONE_HOUR_MS = 60 * 60 * 1000;
const PURGE_AFTER_MS = 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ChallengeErrorCode =
  | 'invalid_or_expired'
  | 'incorrect_code'
  | 'too_many_attempts'
  | 'resend_too_soon'
  | 'send_limit_reached';

export interface ChallengeErrorDetails {
  attemptsRemaining?: number;
  retryAfterSeconds?: number;
}

function messageFor(code: ChallengeErrorCode, details: ChallengeErrorDetails): string {
  switch (code) {
    case 'invalid_or_expired':
      return 'This code is invalid or has expired. Request a new one.';
    case 'incorrect_code': {
      const n = details.attemptsRemaining ?? 0;
      return `Incorrect code. ${n} attempt${n === 1 ? '' : 's'} remaining.`;
    }
    case 'too_many_attempts':
      return 'Too many incorrect attempts. Request a new code.';
    case 'resend_too_soon':
      return `Please wait ${details.retryAfterSeconds} seconds before requesting another code.`;
    case 'send_limit_reached':
      return 'Too many codes requested. Please try again later.';
  }
}

export class ChallengeError extends Error {
  constructor(
    readonly code: ChallengeErrorCode,
    readonly details: ChallengeErrorDetails = {},
  ) {
    super(messageFor(code, details));
    this.name = 'ChallengeError';
  }

  get status(): number {
    return this.code === 'resend_too_soon' || this.code === 'send_limit_reached' ? 429 : 400;
  }

  toJSON(): Record<string, unknown> {
    return { error: this.message, code: this.code, ...this.details };
  }
}

export interface ConfirmedChallenge {
  id: string;
  purpose: ChallengePurpose;
  email: string;
  userId: string | null;
  payload: Record<string, unknown>;
}

type ChallengeRef = Pick<EmailChallenge, 'id' | 'purpose' | 'email' | 'userId'>;

export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashCode(challengeId: string, code: string): string {
  return crypto.createHmac('sha256', config.jwtSecret).update(`${challengeId}:${code}`).digest('hex');
}

function isDead(challenge: { purpose: string; userId: string | null }): boolean {
  return challenge.purpose === 'password-reset' && challenge.userId === null;
}

async function assertUnderHourlyCap(email: string): Promise<void> {
  const sent = await EmailChallenge.sum('sendCount', {
    where: { email, lastSentAt: { [Op.gt]: new Date(Date.now() - ONE_HOUR_MS) } },
  });
  if ((Number(sent) || 0) >= MAX_SENDS_PER_HOUR) {
    throw new ChallengeError('send_limit_reached');
  }
}

export async function createChallenge(input: {
  purpose: ChallengePurpose;
  email: string;
  userId: string | null;
  payload?: Record<string, unknown>;
}): Promise<{ challenge: EmailChallenge; code: string }> {
  const email = input.email.trim().toLowerCase();
  const now = Date.now();

  await EmailChallenge.destroy({ where: { expiresAt: { [Op.lt]: new Date(now - PURGE_AFTER_MS) } } });
  await assertUnderHourlyCap(email);

  // Supersede older open challenges: lock them, but keep the rows so they still count toward the hourly cap.
  await EmailChallenge.update(
    { attempts: MAX_ATTEMPTS, expiresAt: new Date(now) },
    { where: { email, purpose: input.purpose, expiresAt: { [Op.gt]: new Date(now) } } },
  );

  const id = crypto.randomUUID();
  const code = generateCode();
  const challenge = await EmailChallenge.create({
    id,
    purpose: input.purpose,
    email,
    userId: input.userId,
    codeHash: hashCode(id, code),
    payload: input.payload ?? {},
    attempts: 0,
    sendCount: 1,
    lastSentAt: new Date(now),
    expiresAt: new Date(now + CODE_TTL_MS),
  });

  return { challenge, code };
}

interface AttemptRow {
  code_hash: string;
  attempts: number;
  purpose: ChallengePurpose;
  email: string;
  user_id: string | null;
  payload: Record<string, unknown> | null;
}

export async function confirmChallenge(
  challengeId: string,
  purposes: ChallengePurpose | ChallengePurpose[],
  code: string,
  options: { userId?: string } = {},
): Promise<ConfirmedChallenge> {
  const allowed = Array.isArray(purposes) ? purposes : [purposes];
  if (typeof challengeId !== 'string' || !UUID_RE.test(challengeId)) {
    throw new ChallengeError('invalid_or_expired');
  }

  const userClause = options.userId ? 'AND user_id = :userId' : '';
  const [rows] = (await sequelize.query(
    `UPDATE email_challenges
        SET attempts = attempts + 1
      WHERE id = :id
        AND purpose IN (:purposes)
        AND expires_at > now()
        AND attempts < :maxAttempts
        ${userClause}
      RETURNING code_hash, attempts, purpose, email, user_id, payload`,
    { replacements: { id: challengeId, purposes: allowed, maxAttempts: MAX_ATTEMPTS, userId: options.userId ?? null } },
  )) as [AttemptRow[], unknown];

  if (rows.length === 0) {
    const locked = await EmailChallenge.count({
      where: {
        id: challengeId,
        purpose: allowed,
        attempts: { [Op.gte]: MAX_ATTEMPTS },
        expiresAt: { [Op.gt]: new Date() },
        ...(options.userId ? { userId: options.userId } : {}),
      },
    });
    throw new ChallengeError(locked > 0 ? 'too_many_attempts' : 'invalid_or_expired');
  }

  const row = rows[0];
  const submitted = String(code ?? '');
  // Always hash and compare, even for dead challenges or malformed input, so every path does the same work.
  const hashesMatch = crypto.timingSafeEqual(
    Buffer.from(row.code_hash, 'hex'),
    Buffer.from(hashCode(challengeId, submitted), 'hex'),
  );
  const matches = hashesMatch && /^\d{6}$/.test(submitted) && !isDead({ purpose: row.purpose, userId: row.user_id });

  if (!matches) {
    throw new ChallengeError('incorrect_code', { attemptsRemaining: Math.max(0, MAX_ATTEMPTS - row.attempts) });
  }

  const [deleted] = (await sequelize.query('DELETE FROM email_challenges WHERE id = :id RETURNING id', {
    replacements: { id: challengeId },
  })) as [unknown[], unknown];
  if (deleted.length === 0) {
    throw new ChallengeError('invalid_or_expired'); // lost a race with a concurrent confirm
  }

  return { id: challengeId, purpose: row.purpose, email: row.email, userId: row.user_id, payload: row.payload ?? {} };
}

export async function resendChallenge(challengeId: string): Promise<{ challenge: EmailChallenge; code: string }> {
  if (typeof challengeId !== 'string' || !UUID_RE.test(challengeId)) {
    throw new ChallengeError('invalid_or_expired');
  }

  const challenge = await EmailChallenge.findByPk(challengeId);
  if (!challenge || challenge.attempts >= MAX_ATTEMPTS) {
    throw new ChallengeError('invalid_or_expired');
  }

  const elapsed = Date.now() - challenge.lastSentAt.getTime();
  if (elapsed < RESEND_COOLDOWN_MS) {
    throw new ChallengeError('resend_too_soon', { retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000) });
  }

  await assertUnderHourlyCap(challenge.email);

  const code = generateCode();
  const now = Date.now();
  // Conditional on lastSentAt so two simultaneous resends can't both go through.
  const [updated] = await EmailChallenge.update(
    {
      codeHash: hashCode(challenge.id, code),
      sendCount: challenge.sendCount + 1,
      lastSentAt: new Date(now),
      expiresAt: new Date(now + CODE_TTL_MS),
    },
    { where: { id: challenge.id, lastSentAt: challenge.lastSentAt, attempts: { [Op.lt]: MAX_ATTEMPTS } } },
  );
  if (updated === 0) {
    throw new ChallengeError('resend_too_soon', { retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000) });
  }

  await challenge.reload();
  return { challenge, code };
}

/** Invalidate every open challenge for a user (after their password changes). */
export async function discardChallengesForUser(userId: string, transaction?: Transaction): Promise<void> {
  await EmailChallenge.update(
    { attempts: MAX_ATTEMPTS, expiresAt: new Date() },
    { where: { userId, expiresAt: { [Op.gt]: new Date() } }, transaction },
  );
}

/**
 * Email the code without awaiting delivery, so response time never depends on
 * whether an email was sent. Dead challenges send nothing.
 */
export function sendCodeInBackground(challenge: ChallengeRef, code: string): void {
  if (isDead(challenge)) return;
  sendChallengeEmail(challenge.purpose, challenge.email, code).catch((error) =>
    console.error(`[PostMail API] Failed to email ${challenge.purpose} code (challenge ${challenge.id}):`, error),
  );
}
