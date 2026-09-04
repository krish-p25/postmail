import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';
import { User, UserSetting } from '../db/models';
import { createVerification, verifyCode } from '../services/verification';
import { sendVerificationEmail } from '../services/email';
import { withRLS } from '../middleware/rls';

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
 * Store Outlook tokens on the user and auto-connect their mailbox
 * if no mailbox is currently connected.
 */
async function storeOutlookTokensAndConnect(
  user: User,
  tokens: { accessToken: string; refreshToken: string | null; tokenExpiry: Date | null },
  mailboxEmail: string,
) {
  await user.update({
    outlookAccessToken: tokens.accessToken,
    outlookRefreshToken: tokens.refreshToken,
    outlookTokenExpiry: tokens.tokenExpiry,
  });

  const settings = await UserSetting.findOne({ where: { userId: user.id } });
  if (settings && !settings.mailboxConnected) {
    await withRLS(user.id, async (transaction) => {
      await UserSetting.update(
        {
          mailboxConnected: true,
          mailboxProvider: 'outlook',
          mailboxEmail,
          mailboxConnectedAt: new Date(),
        },
        { where: { userId: user.id }, transaction },
      );
    });
  }
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
    } else if (type === 'microsoft-link') {
      const {
        microsoftId: storedMicrosoftId,
        displayName: storedDisplayName,
        accessToken: storedAccessToken,
        refreshToken: storedRefreshToken,
        tokenExpiry: storedTokenExpiry,
      } = result.data as {
        microsoftId: string;
        displayName: string | null;
        accessToken: string;
        refreshToken: string | null;
        tokenExpiry: string | null;
      };

      const user = await User.findOne({ where: { email } });
      if (!user) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }

      await user.update({ microsoftId: storedMicrosoftId, displayName: storedDisplayName || user.displayName });
      await storeOutlookTokensAndConnect(
        user,
        {
          accessToken: storedAccessToken,
          refreshToken: storedRefreshToken,
          tokenExpiry: storedTokenExpiry ? new Date(storedTokenExpiry) : null,
        },
        email,
      );

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

/**
 * POST /auth/microsoft
 * Body: { code }
 *
 * Exchanges a Microsoft OAuth authorization code for tokens,
 * calls Graph API to get user info, finds or creates the local user,
 * and returns a JWT.
 */
router.post('/microsoft', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    const redirectUri = config.dashboardUrl + '/microsoft/callback';

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.microsoftClientId,
        client_secret: config.microsoftClientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'openid email profile User.Read Mail.Read offline_access',
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error('[PostMail API] Microsoft token exchange failed:', tokenData);
      res.status(400).json({ error: tokenData.error_description || 'Failed to exchange Microsoft authorization code' });
      return;
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const tokenExpiry = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    // Call Graph API to get user profile
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      const profileError = await profileRes.text();
      console.error('[PostMail API] Microsoft Graph /me failed:', profileError);
      res.status(400).json({ error: 'Failed to get user info from Microsoft' });
      return;
    }

    const profile = await profileRes.json();
    const microsoftId = profile.id;
    const email: string = (profile.mail || profile.userPrincipalName || '').toLowerCase();
    const displayName: string | null = profile.displayName || null;

    if (!email) {
      res.status(400).json({ error: 'Could not retrieve email from Microsoft account' });
      return;
    }

    // Find by microsoftId first, then by email
    let user = await User.findOne({ where: { microsoftId } });

    if (!user) {
      user = await User.findOne({ where: { email } });

      if (user) {
        if (user.passwordHash) {
          // Existing password account — require password confirmation to link
          res.json({ requiresPassword: true, email, accessToken, refreshToken, tokenExpiry: tokenExpiry?.toISOString() || null });
          return;
        }
        // No password set — safe to auto-link
        await user.update({ microsoftId, displayName: displayName || user.displayName });
        await storeOutlookTokensAndConnect(user, { accessToken, refreshToken, tokenExpiry }, email);
      } else {
        // Create new user with Outlook tokens
        user = await User.create({
          email, microsoftId, displayName,
          outlookAccessToken: accessToken,
          outlookRefreshToken: refreshToken,
          outlookTokenExpiry: tokenExpiry,
        });
        await UserSetting.create({
          userId: user.id,
          mailboxConnected: true,
          mailboxProvider: 'outlook',
          mailboxEmail: email,
          mailboxConnectedAt: new Date(),
        });
      }
    } else {
      // Returning user — refresh tokens and display name
      if (displayName && user.displayName !== displayName) {
        await user.update({ displayName });
      }
      await storeOutlookTokensAndConnect(user, { accessToken, refreshToken, tokenExpiry }, email);
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
  } catch (error) {
    console.error('[PostMail API] Microsoft auth error:', error);
    res.status(500).json({ error: 'Microsoft authentication failed' });
  }
});

/**
 * POST /auth/microsoft/link
 * Body: { accessToken, password }
 *
 * Validates the password using a previously obtained access token,
 * then sends a verification code.
 */
router.post('/microsoft/link', async (req: Request, res: Response) => {
  try {
    const { accessToken, password, refreshToken, tokenExpiry } = req.body;

    if (!accessToken || !password) {
      res.status(400).json({ error: 'Access token and password are required' });
      return;
    }

    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      res.status(400).json({ error: 'Microsoft token expired. Please try again.' });
      return;
    }

    const profile = await profileRes.json();
    const email: string = (profile.mail || profile.userPrincipalName || '').toLowerCase();

    if (!email) {
      res.status(400).json({ error: 'Could not retrieve email from Microsoft account' });
      return;
    }

    const user = await User.findOne({ where: { email } });
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Account not found' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }

    const code = createVerification(email, 'microsoft-link', {
      microsoftId: profile.id,
      displayName: profile.displayName || null,
      accessToken,
      refreshToken: refreshToken || null,
      tokenExpiry: tokenExpiry || null,
    });
    await sendVerificationEmail(email, code);

    res.json({ requiresVerification: true, email });
  } catch (error) {
    console.error('[PostMail API] Microsoft link error:', error);
    res.status(500).json({ error: 'Failed to link Microsoft account' });
  }
});

export default router;
