import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { config } from '../config/env';
import TrackedEmail from '../db/models/TrackedEmail';
import User from '../db/models/User';
import { UserSetting } from '../db/models';

const router = Router();

const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_GRAPH_URL = 'https://graph.microsoft.com/v1.0';

/** Refresh Outlook access token using stored refresh token. */
async function refreshOutlookToken(user: User): Promise<string | null> {
  if (!user.outlookRefreshToken) return null;

  const tokenRes = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.microsoftClientId,
      client_secret: config.microsoftClientSecret,
      refresh_token: user.outlookRefreshToken,
      grant_type: 'refresh_token',
      scope: 'offline_access Mail.Read User.Read',
    }),
  });

  if (!tokenRes.ok) return null;

  const tokens = await tokenRes.json();
  await user.update({
    outlookAccessToken: tokens.access_token,
    outlookRefreshToken: tokens.refresh_token || user.outlookRefreshToken,
    outlookTokenExpiry: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null,
  });

  return tokens.access_token;
}

/** Get a valid Outlook access token, refreshing if needed. */
async function getOutlookAccessToken(user: User): Promise<string | null> {
  let accessToken = user.outlookAccessToken;
  if (!accessToken || (user.outlookTokenExpiry && user.outlookTokenExpiry.getTime() < Date.now())) {
    accessToken = await refreshOutlookToken(user);
  }
  return accessToken || null;
}

/**
 * GET /api/track/preflight
 * Lightweight auth check — if you reach this handler, the JWT is valid.
 */
router.get('/preflight', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/**
 * POST /api/track/register
 * Register a new tracked email when the extension injects a pixel.
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { trackingToken, recipients, subject } = req.body;

    if (!trackingToken) {
      res.status(400).json({ error: 'trackingToken is required' });
      return;
    }

    const recipient = Array.isArray(recipients)
      ? recipients.join(', ')
      : recipients || null;

    const trackedEmail = await TrackedEmail.create({
      userId: req.user!.id,
      trackingToken,
      recipient,
      subject: subject || null,
      status: 'pending',
    });

    res.json({
      id: trackedEmail.id,
      trackingToken: trackedEmail.trackingToken,
      status: trackedEmail.status,
    });
  } catch (error) {
    console.error('[PostMail API] Error in POST /api/track/register:', error);
    res.status(500).json({ error: 'Failed to register tracked email' });
  }
});

/**
 * POST /api/track/confirm-sent
 * Mark a tracked email as sent.
 */
router.post('/confirm-sent', async (req: Request, res: Response) => {
  try {
    const { trackingToken } = req.body;

    if (!trackingToken) {
      res.status(400).json({ error: 'trackingToken is required' });
      return;
    }

    const trackedEmail = await TrackedEmail.findOne({
      where: { trackingToken, userId: req.user!.id },
    });

    if (!trackedEmail) {
      res.status(404).json({ error: 'Tracked email not found' });
      return;
    }

    await trackedEmail.update({
      status: 'sent',
      sentAt: new Date(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Error in POST /api/track/confirm-sent:', error);
    res.status(500).json({ error: 'Failed to confirm sent' });
  }
});

/**
 * POST /api/track/update
 * Update a tracked email's subject and recipients (called when compose closes
 * since the user may have changed these after initial registration).
 */
router.post('/update', async (req: Request, res: Response) => {
  try {
    const { trackingToken, recipients, subject } = req.body;

    if (!trackingToken) {
      res.status(400).json({ error: 'trackingToken is required' });
      return;
    }

    const trackedEmail = await TrackedEmail.findOne({
      where: { trackingToken, userId: req.user!.id },
    });

    if (!trackedEmail) {
      res.status(404).json({ error: 'Tracked email not found' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (subject) updates.subject = subject;
    if (recipients) {
      updates.recipient = Array.isArray(recipients)
        ? recipients.join(', ')
        : recipients;
    }

    if (Object.keys(updates).length > 0) {
      await trackedEmail.update(updates);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Error in POST /api/track/update:', error);
    res.status(500).json({ error: 'Failed to update tracked email' });
  }
});

/**
 * POST /api/track/discard
 * Mark a tracked email as discarded.
 */
router.post('/discard', async (req: Request, res: Response) => {
  try {
    const { trackingToken } = req.body;

    if (!trackingToken) {
      res.status(400).json({ error: 'trackingToken is required' });
      return;
    }

    const trackedEmail = await TrackedEmail.findOne({
      where: { trackingToken, userId: req.user!.id },
    });

    if (!trackedEmail) {
      res.status(404).json({ error: 'Tracked email not found' });
      return;
    }

    await trackedEmail.update({ status: 'discarded' });

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Error in POST /api/track/discard:', error);
    res.status(500).json({ error: 'Failed to discard tracked email' });
  }
});

/**
 * POST /api/track/verify-sent
 * Checks whether the tracked email was actually sent by searching the
 * user's sent-mail folder via the appropriate provider API.
 */
router.post('/verify-sent', async (req: Request, res: Response) => {
  try {
    const { trackingToken } = req.body;

    if (!trackingToken) {
      res.status(400).json({ error: 'trackingToken is required' });
      return;
    }

    const trackedEmail = await TrackedEmail.findOne({
      where: { trackingToken, userId: req.user!.id },
    });

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.json({ found: false });
      return;
    }

    // Determine which provider to verify with
    const settings = await UserSetting.findOne({ where: { userId: user.id } });

    if (settings?.mailboxProvider === 'outlook' && user.outlookRefreshToken) {
      await verifyViaOutlook(user, trackingToken, trackedEmail, res);
    } else if (user.gmailAccessToken) {
      await verifyViaGmail(user, trackingToken, trackedEmail, res);
    } else {
      // No mailbox connected — can't verify, but don't error
      res.json({ found: false });
    }
  } catch (error) {
    console.error('[PostMail API] Error in POST /api/track/verify-sent:', error);
    res.status(500).json({ error: 'Failed to verify sent email' });
  }
});

/**
 * Verify via Outlook: fetch recent sent messages from Microsoft Graph
 * and check their HTML body for the tracking token.
 */
async function verifyViaOutlook(
  user: User,
  trackingToken: string,
  trackedEmail: TrackedEmail | null,
  res: Response,
): Promise<void> {
  const accessToken = await getOutlookAccessToken(user);
  if (!accessToken) {
    res.json({ found: false, authError: true });
    return;
  }

  const graphUrl = `${MS_GRAPH_URL}/me/mailFolders/SentItems/messages?$top=10&$orderby=sentDateTime desc&$select=body`;

  console.log(`[PostMail API] verify-sent (Outlook): searching for token ${trackingToken.substring(0, 8)}...`);

  let graphRes = await fetch(graphUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // If 401, refresh and retry once
  if (graphRes.status === 401) {
    const refreshed = await refreshOutlookToken(user);
    if (!refreshed) {
      res.json({ found: false, authError: true });
      return;
    }
    graphRes = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${refreshed}` },
    });
  }

  if (!graphRes.ok) {
    console.error(`[PostMail API] verify-sent (Outlook): Graph API returned ${graphRes.status}`);
    res.json({ found: false });
    return;
  }

  const data = await graphRes.json();
  let found = false;

  for (const msg of (data.value || [])) {
    const bodyContent: string = msg.body?.content || '';
    if (bodyContent.includes(trackingToken)) {
      found = true;
      break;
    }
  }

  console.log(`[PostMail API] verify-sent (Outlook): found=${found} for token ${trackingToken.substring(0, 8)}...`);

  if (found && trackedEmail && trackedEmail.status === 'pending') {
    await trackedEmail.update({ status: 'sent', sentAt: new Date() });
  }

  res.json({ found });
}

/**
 * Verify via Gmail: fetch recent sent messages and inspect their raw
 * source for the tracking token string.
 */
async function verifyViaGmail(
  user: User,
  trackingToken: string,
  trackedEmail: TrackedEmail | null,
  res: Response,
): Promise<void> {
  const oauth2Client = new OAuth2Client(
    config.gmailClientId,
    config.gmailClientSecret,
    config.gmailRedirectUri,
  );
  oauth2Client.setCredentials({
    access_token: user.gmailAccessToken,
    refresh_token: user.gmailRefreshToken,
    expiry_date: user.gmailTokenExpiry?.getTime(),
  });

  // Persist refreshed tokens
  oauth2Client.on('tokens', async (tokens) => {
    const updates: Record<string, unknown> = {};
    if (tokens.access_token) updates.gmailAccessToken = tokens.access_token;
    if (tokens.expiry_date) updates.gmailTokenExpiry = new Date(tokens.expiry_date);
    if (Object.keys(updates).length) {
      await User.update(updates, { where: { id: user.id } });
    }
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client as any });

  const subject = trackedEmail?.subject;
  const q = subject
    ? `in:sent subject:(${subject}) newer_than:1h`
    : `in:sent newer_than:1h`;

  console.log(`[PostMail API] verify-sent (Gmail): searching with q="${q}" for token ${trackingToken.substring(0, 8)}...`);

  const searchRes = await gmail.users.messages.list({
    userId: 'me',
    q,
    maxResults: 10,
  });

  let found = false;

  if (searchRes.data.messages && searchRes.data.messages.length > 0) {
    for (const msg of searchRes.data.messages) {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'raw',
      });
      const raw = full.data.raw || '';
      if (raw.includes(trackingToken)) {
        found = true;
        break;
      }
      try {
        const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
        if (decoded.includes(trackingToken)) {
          found = true;
          break;
        }
      } catch {
        // Ignore decode errors
      }
    }
  }

  console.log(`[PostMail API] verify-sent (Gmail): found=${found} for token ${trackingToken.substring(0, 8)}...`);

  if (found && trackedEmail && trackedEmail.status === 'pending') {
    await trackedEmail.update({ status: 'sent', sentAt: new Date() });
  }

  res.json({ found });
}

export default router;
