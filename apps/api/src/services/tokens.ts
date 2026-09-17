import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export function signToken(user: { id: string; email: string }): string {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: '7d',
  });
}
