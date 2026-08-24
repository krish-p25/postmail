import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { User } from '../db/models';

interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

// Extend Express Request to include our user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

/**
 * Auth middleware: verifies our own JWT from the Authorization header,
 * then loads the local user record.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice(7);

    if (!config.jwtSecret) {
      console.error('[PostMail API] JWT_SECRET not configured');
      res.status(500).json({ error: 'Auth not configured' });
      return;
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const user = await User.findByPk(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (error) {
    console.error('[PostMail API] Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
