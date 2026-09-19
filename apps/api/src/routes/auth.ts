import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';
import { User } from '../db/models';
import { signToken } from '../services/tokens';
import { forUser } from '../db/scoped';
import {
  loginIpLimiter,
  loginEmailLimiter,
  registerLimiter,
  codeConfirmLimiter,
  resendLimiter,
  oauthLimiter,
  linkLimiter,
  resetRequestIpLimiter,
  resetRequestEmailLimiter,
  passwordApplyLimiter,
} from '../middleware/rate-limit';
import { verifiedGoogleEmail, verifiedMicrosoftEmail, microsoftMailboxEmail } from '../services/identity';
import type { ChallengePurpose } from '../services/challenge-purposes';
import { createChallenge, confirmChallenge, resendChallenge, sendCodeInBackground, ChallengeError } from '../services/challenges';
import { applyPasswordHash, hashPassword, validateNewPassword } from '../services/passwords';
import { handleRouteError } from './respond';
import { issuePasswordTicket, readPasswordTicket } from '../services/password-tickets';
import { DEVICE_COOKIE, deviceCookieOptions, isTrustedDevice, trustDevice } from '../services/devices';

const router = Router();

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
 * Emails a sign-up code. The account is created by POST /auth/verify.
 * Returns { requiresVerification: true, email, challengeId }, or 409 ACCOUNT_EXISTS.
 */
router.post('/register', registerLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const passwordProblem = validateNewPassword(password);
    if (passwordProblem) {
      res.status(400).json({ error: passwordProblem });
      return;
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists', code: 'ACCOUNT_EXISTS' });
      return;
    }

    const { challenge, code } = await createChallenge({
      purpose: 'register',
      email,
      userId: null,
      payload: { email, passwordHash: await hashPassword(password), displayName: displayName || null },
    });
    sendCodeInBackground(challenge, code);

    res.json({ requiresVerification: true, email, challengeId: challenge.id });
  } catch (error) {
    handleRouteError(res, error, 'Register error', 'Registration failed');
  }
});

const VERIFY_PURPOSES: ChallengePurpose[] = ['register', 'google-link', 'microsoft-link'];

/**
 * POST /auth/verify
 * Body: { challengeId, code }
 *
 * Confirms a sign-up or account-link code and completes that action.
 */
router.post('/verify', codeConfirmLimiter, async (req: Request, res: Response) => {
  try {
    const { challengeId, code } = req.body;

    if (!challengeId || !code) {
      res.status(400).json({ error: 'challengeId and code are required' });
      return;
    }

    const challenge = await confirmChallenge(String(challengeId), VERIFY_PURPOSES, String(code));

    if (challenge.purpose === 'register') {
      const { email, passwordHash, displayName } = challenge.payload as {
        email: string;
        passwordHash: string;
        displayName: string | null;
      };

      // Re-check for race condition
      const existing = await User.findOne({ where: { email } });
      if (existing) {
        res.status(409).json({ error: 'An account with this email already exists', code: 'ACCOUNT_EXISTS' });
        return;
      }

      const user = await User.create({ email, passwordHash, displayName });
      await forUser(user.id).userSettings.create({});

      const token = signToken(user);
      res.status(201).json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
      return;
    }

    const user = challenge.userId ? await User.findByPk(challenge.userId) : null;
    if (!user) {
      throw new ChallengeError('invalid_or_expired');
    }

    if (challenge.purpose === 'google-link') {
      const { idToken } = challenge.payload as { idToken: string };
      const ticket = await googleClient.verifyIdToken({ idToken, audience: config.googleClientId });
      const payload = ticket.getPayload();
      const googleEmail = verifiedGoogleEmail(payload);
      if (!payload || !googleEmail || googleEmail !== user.email) {
        res.status(400).json({ error: 'Google token expired or email not verified. Please try again.' });
        return;
      }

      await user.update({ googleId: payload.sub, displayName: payload.name || user.displayName });
    } else {
      const { microsoftId, displayName, accessToken, refreshToken, tokenExpiry, mailboxEmail } = challenge.payload as {
        microsoftId: string;
        displayName: string | null;
        accessToken: string;
        refreshToken: string | null;
        tokenExpiry: string | null;
        mailboxEmail: string | null;
      };

      await user.update({ microsoftId, displayName: displayName || user.displayName });
      await storeOutlookTokensAndConnect(
        user,
        { accessToken, refreshToken, tokenExpiry: tokenExpiry ? new Date(tokenExpiry) : null },
        mailboxEmail || challenge.email,
      );
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
  } catch (error) {
    handleRouteError(res, error, 'Verify error', 'Verification failed');
  }
});

/**
 * POST /auth/challenges/:id/resend
 * Emails a new code for any challenge (same response whether or not an email was sent).
 */
router.post('/challenges/:id/resend', resendLimiter, async (req: Request, res: Response) => {
  try {
    const { challenge, code } = await resendChallenge(req.params.id);
    sendCodeInBackground(challenge, code);
    res.json({ ok: true });
  } catch (error) {
    handleRouteError(res, error, 'Resend code error', 'Failed to resend code');
  }
});

/**
 * POST /auth/login
 * Body: { email, password }
 *
 * Returns { token, user } for a remembered browser; otherwise emails a code and
 * returns { requiresCode: true, challengeId, email }. Wrong passwords never send email.
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

    if (await isTrustedDevice(user.id, req.cookies?.[DEVICE_COOKIE])) {
      const token = signToken(user);
      res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
      return;
    }

    const { challenge, code } = await createChallenge({ purpose: 'login', email: user.email, userId: user.id });
    sendCodeInBackground(challenge, code);
    res.json({ requiresCode: true, challengeId: challenge.id, email: user.email });
  } catch (error) {
    handleRouteError(res, error, 'Login error', 'Login failed');
  }
});

/**
 * POST /auth/login/confirm
 * Body: { challengeId, code, rememberDevice }
 */
router.post('/login/confirm', codeConfirmLimiter, async (req: Request, res: Response) => {
  try {
    const { challengeId, code, rememberDevice } = req.body;

    const challenge = await confirmChallenge(String(challengeId ?? ''), 'login', String(code ?? ''));
    const user = challenge.userId ? await User.findByPk(challenge.userId) : null;
    if (!user) {
      throw new ChallengeError('invalid_or_expired');
    }

    if (rememberDevice === true) {
      const deviceToken = await trustDevice(user.id, req.headers['user-agent']);
      res.cookie(DEVICE_COOKIE, deviceToken, deviceCookieOptions());
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
  } catch (error) {
    handleRouteError(res, error, 'Login confirm error', 'Sign in failed');
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

    const { challenge, code } = await createChallenge({
      purpose: 'google-link',
      email: googleEmail,
      userId: user.id,
      payload: { idToken: rawIdToken },
    });
    sendCodeInBackground(challenge, code);

    res.json({ requiresVerification: true, email: googleEmail, challengeId: challenge.id });
  } catch (error) {
    handleRouteError(res, error, 'Google link error', 'Failed to link Google account');
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

    const { challenge, code } = await createChallenge({
      purpose: 'microsoft-link',
      email,
      userId: user.id,
      payload: {
        microsoftId: profile.id,
        displayName: profile.displayName || null,
        accessToken,
        refreshToken: refreshToken || null,
        tokenExpiry: tokenExpiry || null,
        mailboxEmail: microsoftMailboxEmail(profile),
      },
    });
    sendCodeInBackground(challenge, code);

    res.json({ requiresVerification: true, email, challengeId: challenge.id });
  } catch (error) {
    handleRouteError(res, error, 'Microsoft link error', 'Failed to link Microsoft account');
  }
});

/**
 * POST /auth/password-reset/request
 * Body: { email }
 *
 * Always returns 200 { challengeId }. A code is emailed only if the account exists;
 * otherwise the challenge can never be confirmed but behaves identically.
 */
router.post('/password-reset/request', resetRequestIpLimiter, resetRequestEmailLimiter, async (req: Request, res: Response) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'A valid email is required' });
      return;
    }

    const user = await User.findOne({ where: { email } });
    const { challenge, code } = await createChallenge({ purpose: 'password-reset', email, userId: user?.id ?? null });
    sendCodeInBackground(challenge, code);

    res.json({ challengeId: challenge.id });
  } catch (error) {
    handleRouteError(res, error, 'Password reset request error', 'Could not start password reset');
  }
});

/**
 * POST /auth/password-reset/verify
 * Body: { challengeId, code }
 *
 * Confirms the emailed code and returns a ticket authorising one password write.
 * A reset challenge for an unknown address can never match, so this responds the
 * same way whether or not the account exists.
 */
router.post('/password-reset/verify', codeConfirmLimiter, async (req: Request, res: Response) => {
  try {
    const { challengeId, code } = req.body;

    const challenge = await confirmChallenge(String(challengeId ?? ''), 'password-reset', String(code ?? ''));
    const user = challenge.userId ? await User.findByPk(challenge.userId) : null;
    if (!user) {
      throw new ChallengeError('invalid_or_expired');
    }

    res.json({
      ticket: issuePasswordTicket({ userId: user.id, purpose: 'password-reset', tokenVersion: user.tokenVersion }),
    });
  } catch (error) {
    handleRouteError(res, error, 'Password reset verify error', 'Password reset failed');
  }
});

/**
 * POST /auth/password-reset/apply
 * Body: { ticket, newPassword }
 *
 * Sets the new password, signs out other sessions, and signs this browser in.
 */
router.post('/password-reset/apply', passwordApplyLimiter, async (req: Request, res: Response) => {
  try {
    const { ticket, newPassword } = req.body;

    // Validate the password first so a weak one doesn't burn the ticket.
    const passwordProblem = validateNewPassword(newPassword);
    if (passwordProblem) {
      res.status(400).json({ error: passwordProblem });
      return;
    }

    const claims = readPasswordTicket(ticket, 'password-reset');
    const user = claims ? await User.findByPk(claims.sub) : null;
    // A spent ticket no longer matches token_version, because applying a password bumps it.
    if (!user || !claims || claims.ver !== user.tokenVersion) {
      res.status(400).json({ error: 'This verification has expired. Request a new code.', code: 'ticket_invalid' });
      return;
    }

    const token = await applyPasswordHash(user, await hashPassword(newPassword));
    res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
  } catch (error) {
    handleRouteError(res, error, 'Password reset apply error', 'Password reset failed');
  }
});

export default router;
