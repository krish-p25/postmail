import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import type { User } from '../db/models';

export function signToken(user: { id: string; email: string; tokenVersion: number }): string {
  return jwt.sign({ sub: user.id, email: user.email, ver: user.tokenVersion }, config.jwtSecret, {
    expiresIn: '7d',
  });
}

/** Revoke every token issued so far for this user and return a fresh one. */
export async function rotateTokens(user: User): Promise<string> {
  await user.increment('tokenVersion');
  await user.reload();
  return signToken(user);
}
