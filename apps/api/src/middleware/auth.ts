import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { User, UserSetting } from '../db/models';

/**
 * Supabase JWT payload structure.
 * The 'sub' claim contains the Supabase user UUID.
 * The 'email' claim contains the user's email.
 */
interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
  };
  aud: string;
  exp: number;
  iat: number;
}

// Extend Express Request to include our user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;         // Our internal user UUID
        supabaseId: string;  // Supabase auth UUID
        email: string;
      };
    }
  }
}

/**
 * Auth middleware: verifies the Supabase JWT from the Authorization header,
 * then finds or creates a local user record.
 *
 * This handles DASHBOARD LOGIN auth only. It uses basic profile scopes.
 * Mailbox access OAuth (Gmail scopes) is a completely separate flow
 * that will be built later — NOT through this middleware.
 *
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Verify JWT using SUPABASE_JWT_SECRET
 * 3. Find or create local user by supabase_id
 * 4. Attach user to req.user
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice(7);

    if (!config.supabaseJwtSecret) {
      console.error('[PostMail API] SUPABASE_JWT_SECRET not configured');
      res.status(500).json({ error: 'Auth not configured' });
      return;
    }

    // Verify the JWT
    let payload: SupabaseJwtPayload;
    try {
      payload = jwt.verify(token, config.supabaseJwtSecret) as SupabaseJwtPayload;
    } catch (err) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    if (!payload.sub) {
      res.status(401).json({ error: 'Invalid token: missing sub claim' });
      return;
    }

    // Find or create local user
    const email = payload.email || '';
    const displayName = payload.user_metadata?.full_name || payload.user_metadata?.name || null;

    let user = await User.findOne({ where: { supabaseId: payload.sub } });

    if (!user) {
      user = await User.create({
        supabaseId: payload.sub,
        email,
        displayName,
      });

      // Also create default user settings
      await UserSetting.create({ userId: user.id });

      console.log(`[PostMail API] New user created: ${email} (${user.id})`);
    } else if (user.email !== email || (displayName && user.displayName !== displayName)) {
      // Update email/name if changed (e.g., user updated their Google profile)
      await user.update({
        email: email || user.email,
        displayName: displayName || user.displayName,
      });
    }

    req.user = {
      id: user.id,
      supabaseId: user.supabaseId,
      email: user.email,
    };

    next();
  } catch (error) {
    console.error('[PostMail API] Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
