import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export function signToken(user: { id: string; email: string; tokenVersion: number }): string {
  return jwt.sign({ sub: user.id, email: user.email, ver: user.tokenVersion }, config.jwtSecret, {
    expiresIn: '7d',
  });
}
