import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';
import { User } from '../db/models';
import { createVerification, verifyCode } from '../services/verification';
import { sendVerificationEmail } from '../services/email';
import { signToken } from '../services/tokens';
import { forUser } from '../db/scoped';
import {
  loginIpLimiter,
  loginEmailLimiter,
  registerLimiter,
  verifyLimiter,
  oauthLimiter,
  linkLimiter,
} from '../middleware/rate-limit';
import { verifiedGoogleEmail, verifiedMicrosoftEmail, microsoftMailboxEmail } from '../services/identity';

const router = Router();

const SALT_ROUNDS = 10;

const googleClient = new OAuth2Client(
  config.googleClientId,
  config.googleClientSecret,
  config.googleRedirectUri,
);

/**
 * Store Outlook tokens in LinkedMailbox and auto-connect the mailbox
 * in UserSettings if no mailbox is currently connected.
 */
async function storeOutlookTokensAndConnect(
  user: User,
  tokens: { accessToken: string; refreshToken: string | null; tokenExpiry: Date | null },
  mailboxEmail: string,
) {
  const scope = forUser(user.id);
  const [mailbox] = await scope.linkedMailboxes.findOrCreate({
    where: { email: mailboxEmail },
    defaults: {
      provider: 'outlook',
      email: mailboxEmail,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiry: tokens.tokenExpiry,
    },
  });

  // Always refresh tokens on the existing mailbox
  await mailbox.update({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || mailbox.refreshToken,
    tokenExpiry: tokens.tokenExpiry,
  });

  const settings = await scope.userSettings.findOne();
  if (settings && !settings.mailboxConnected) {
    await settings.update({
      mailboxConnected: true,
      mailboxProvider: 'outlook',
      mailboxEmail,
      mailboxConnectedAt: new Date(),
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
router.post('/register', registerLimiter, async (req: Request, res: Response) => {
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
router.post('/verify', verifyLimiter, async (req: Request, res: Response) => {
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
      await forUser(user.id).userSettings.create({});

      const token = signToken(user);
      res.status(201).json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
    } else if (type === 'google-link') {
      const { idToken: storedIdToken } = result.data as { idToken: string };

      const ticket = await googleClient.verifyIdToken({
        idToken: storedIdToken,
        audience: config.googleClientId,
      });

      const payload = ticket.getPayload();
      const googleEmail = verifiedGoogleEmail(payload);
      if (!payload || !googleEmail) {
        res.status(400).json({ error: 'Google token expired or email not verified. Please try again.' });
        return;
      }

      const user = await User.findOne({ where: { email: googleEmail } });
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
        mailboxEmail: storedMailboxEmail,
      } = result.data as {
        microsoftId: string;
        displayName: string | null;
        accessToken: string;
        refreshToken: string | null;
        tokenExpiry: string | null;
        mailboxEmail: string | null;
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
        storedMailboxEmail || email,
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
router.post('/login', loginIpLimiter, loginEmailLimiter, async (req: Request, res: Response) => {
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
router.post('/google', oauthLimiter, async (req: Request, res: Response) => {
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
    const email = verifiedGoogleEmail(payload);
    if (!payload || !email) {
      res.status(400).json({ error: 'Your Google account email is not verified' });
      return;
    }

    const googleId = payload.sub;
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
        await forUser(user.id).userSettings.create({});
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
router.post('/google/link', linkLimiter, async (req: Request, res: Response) => {
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
    const googleEmail = verifiedGoogleEmail(payload);
    if (!payload || !googleEmail) {
      res.status(400).json({ error: 'Invalid Google token or unverified email' });
      return;
    }

    const user = await User.findOne({ where: { email: googleEmail } });
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Account not found' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }

    const code = createVerification(googleEmail, 'google-link', { idToken: rawIdToken });
    await sendVerificationEmail(googleEmail, code);

    res.json({ requiresVerification: true, email: googleEmail });
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
router.post('/microsoft', oauthLimiter, async (req: Request, res: Response) => {
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
    const email = verifiedMicrosoftEmail(profile);
    const displayName: string | null = profile.displayName || null;

    if (!email) {
      res.status(400).json({ error: 'Could not verify the email on this Microsoft account' });
      return;
    }

    // Identity uses the verified UPN; the mailbox keeps its real SMTP address.
    const mailboxEmail = microsoftMailboxEmail(profile) ?? email;

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
        await storeOutlookTokensAndConnect(user, { accessToken, refreshToken, tokenExpiry }, mailboxEmail);
      } else {
        // Create new user and store tokens in LinkedMailbox
        user = await User.create({ email, microsoftId, displayName });
        const scope = forUser(user.id);
        await scope.linkedMailboxes.create({
          provider: 'outlook',
          email: mailboxEmail,
          accessToken,
          refreshToken,
          tokenExpiry,
        });
        await scope.userSettings.create({
          mailboxConnected: true,
          mailboxProvider: 'outlook',
          mailboxEmail,
          mailboxConnectedAt: new Date(),
        });
      }
    } else {
      // Returning user — refresh tokens and display name
      if (displayName && user.displayName !== displayName) {
        await user.update({ displayName });
      }
      await storeOutlookTokensAndConnect(user, { accessToken, refreshToken, tokenExpiry }, mailboxEmail);
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
router.post('/microsoft/link', linkLimiter, async (req: Request, res: Response) => {
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
    const email = verifiedMicrosoftEmail(profile);

    if (!email) {
      res.status(400).json({ error: 'Could not verify the email on this Microsoft account' });
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
      mailboxEmail: microsoftMailboxEmail(profile),
    });
    await sendVerificationEmail(email, code);

    res.json({ requiresVerification: true, email });
  } catch (error) {
    console.error('[PostMail API] Microsoft link error:', error);
    res.status(500).json({ error: 'Failed to link Microsoft account' });
  }
});

export default router;
