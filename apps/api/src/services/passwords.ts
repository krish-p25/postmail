import bcrypt from 'bcrypt';
import { sequelize } from '../db/sequelize';
import type { User } from '../db/models';
import { forUser } from '../db/scoped';
import { discardChallengesForUser } from './challenges';
import { sendPasswordChangedEmail } from './email';
import { signToken } from './tokens';

export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const SALT_ROUNDS = 10;

/** Returns an error message, or null if the password is acceptable. */
export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Store a new password hash and end every other session:
 * bump token_version, forget trusted devices, discard open challenges.
 * Returns a fresh token for the caller.
 */
export async function applyPasswordHash(user: User, passwordHash: string): Promise<string> {
  await sequelize.transaction(async (transaction) => {
    await user.update({ passwordHash }, { transaction });
    await user.increment('tokenVersion', { transaction });
    await forUser(user.id).trustedDevices.destroy({ where: {}, transaction });
    await discardChallengesForUser(user.id, transaction);
  });
  await user.reload();

  sendPasswordChangedEmail(user.email).catch((error) =>
    console.error('[PostMail API] Failed to send password changed email:', error),
  );

  return signToken(user);
}
