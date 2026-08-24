import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';
import { User, UserSetting } from '../db/models';

const router = Router();

const SALT_ROUNDS = 10;

const googleClient = new OAuth2Client(
  config.googleClientId,
  config.googleClientSecret,
  config.googleRedirectUri,
);

function signToken(user: { id: string; email: string }): string {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: '7d',
  });
}

/**
 * POST /api/auth/register
 * Body: { email, password, displayName? }
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ email, passwordHash, displayName: displayName || null });
    await UserSetting.create({ userId: user.id });

    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
  } catch (error) {
    console.error('[PostMail API] Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await User.findOne({ where: { email } });
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
  } catch (error) {
    console.error('[PostMail API] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/google
 * Body: { code }
 *
 * Exchanges a Google OAuth authorization code for user info,
 * finds or creates the local user, and returns a JWT.
 */
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    // Exchange code for tokens
    const { tokens } = await googleClient.getToken(code);
    const idToken = tokens.id_token;

    if (!idToken) {
      res.status(400).json({ error: 'Failed to get ID token from Google' });
      return;
    }

    // Verify and decode the ID token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: config.googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(400).json({ error: 'Failed to get user info from Google' });
      return;
    }

    const googleId = payload.sub;
    const email = payload.email;
    const displayName = payload.name || null;

    // Find by googleId first, then by email
    let user = await User.findOne({ where: { googleId } });

    if (!user) {
      // Check if email account exists (email/password user linking Google)
      user = await User.findOne({ where: { email } });

      if (user) {
        // Link Google to existing account
        await user.update({ googleId });
      } else {
        // Create new user
        user = await User.create({ email, googleId, displayName });
        await UserSetting.create({ userId: user.id });
      }
    } else if (displayName && user.displayName !== displayName) {
      await user.update({ displayName });
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
  } catch (error) {
    console.error('[PostMail API] Google auth error:', error);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

export default router;
