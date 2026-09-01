import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';
import { User, UserSetting } from '../db/models';
import { createVerification, verifyCode } from '../services/verification';
import { sendVerificationEmail } from '../services/email';

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
 * POST /auth/register
 * Body: { email, password, displayName? }
 *
 * Validates input, stores pending registration, sends verification code.
 * Returns { requiresVerification: true, email }.
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
    const code = createVerification(email, 'register', {
      email,
      passwordHash,
      displayName: displayName || null,
    });

    await sendVerificationEmail(email, code);
    res.json({ requiresVerification: true, email });
  } catch (error) {
    console.error('[PostMail API] Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /auth/verify
 * Body: { email, code, type: 'register' | 'google-link' }
 *
 * Verifies the emailed code and completes the pending action.
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { email, code, type } = req.body;

    if (!email || !code || !type) {
      res.status(400).json({ error: 'Email, code, and type are required' });
      return;
    }

    const result = verifyCode(email, code, type);
    if (!result.valid) {
      res.status(400).json({ error: result.error });
      return;
    }

    if (type === 'register') {
      const { passwordHash, displayName } = result.data as {
        email: string;
        passwordHash: string;
        displayName: string | null;
      };

      // Re-check for race condition
      const existing = await User.findOne({ where: { email } });
      if (existing) {
        res.status(409).json({ error: 'An account with this email already exists' });
        return;
      }

      const user = await User.create({ email, passwordHash, displayName });
      await UserSetting.create({ userId: user.id });

      const token = signToken(user);
      res.status(201).json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
    } else if (type === 'google-link') {
      const { idToken: storedIdToken } = result.data as { idToken: string };

      const ticket = await googleClient.verifyIdToken({
        idToken: storedIdToken,
        audience: config.googleClientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        res.status(400).json({ error: 'Google token expired. Please try again.' });
        return;
      }

      const user = await User.findOne({ where: { email: payload.email } });
      if (!user) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }

      await user.update({ googleId: payload.sub, displayName: payload.name || user.displayName });

      const token = signToken(user);
      res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
    } else {
      res.status(400).json({ error: 'Invalid verification type' });
    }
  } catch (error) {
    console.error('[PostMail API] Verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

/**
 * POST /auth/login
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
 * POST /auth/google
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
      user = await User.findOne({ where: { email } });

      if (user) {
        if (user.passwordHash) {
          // Existing password account — require password confirmation to link
          res.json({ requiresPassword: true, email, idToken });
          return;
        }
        // No password set — safe to auto-link
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

/**
 * POST /auth/google/link
 * Body: { idToken, password }
 *
 * Validates the password, then sends a verification code.
 * Returns { requiresVerification: true, email }.
 */
router.post('/google/link', async (req: Request, res: Response) => {
  try {
    const { idToken: rawIdToken, password } = req.body;

    if (!rawIdToken || !password) {
      res.status(400).json({ error: 'ID token and password are required' });
      return;
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: rawIdToken,
      audience: config.googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(400).json({ error: 'Invalid Google token' });
      return;
    }

    const user = await User.findOne({ where: { email: payload.email } });
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Account not found' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }

    const code = createVerification(payload.email, 'google-link', { idToken: rawIdToken });
    await sendVerificationEmail(payload.email, code);

    res.json({ requiresVerification: true, email: payload.email });
  } catch (error) {
    console.error('[PostMail API] Google link error:', error);
    res.status(500).json({ error: 'Failed to link Google account' });
  }
});

export default router;
