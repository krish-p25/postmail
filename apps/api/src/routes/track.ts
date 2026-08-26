import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { config } from '../config/env';
import TrackedEmail from '../db/models/TrackedEmail';
import User from '../db/models/User';

const router = Router();

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
 * Uses the user's Gmail OAuth tokens to check if the tracked email was sent.
 *
 * Strategy: Gmail search does NOT index content inside HTML attributes (like
 * <img src="...token...">), so searching for the tracking token text won't
 * work. Instead we fetch recent sent messages and inspect their raw source
 * for the tracking token string.
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
    if (!user?.gmailAccessToken) {
      res.status(400).json({ error: 'Gmail not connected' });
      return;
    }

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

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Build a targeted search: use subject if we have a tracked email record
    const subject = trackedEmail?.subject;
    const q = subject
      ? `in:sent subject:(${subject}) newer_than:1h`
      : `in:sent newer_than:1h`;

    console.log(`[PostMail API] verify-sent: searching Gmail with q="${q}" for token ${trackingToken.substring(0, 8)}...`);

    const searchRes = await gmail.users.messages.list({
      userId: 'me',
      q,
      maxResults: 10,
    });

    let found = false;

    if (searchRes.data.messages && searchRes.data.messages.length > 0) {
      // Check each message's raw source for the tracking token
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
        // Also check base64url-decoded content (the token is a UUID, so it
        // won't be split across encoded boundaries in practice)
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

    console.log(`[PostMail API] verify-sent: found=${found} for token ${trackingToken.substring(0, 8)}...`);

    if (found && trackedEmail && trackedEmail.status === 'pending') {
      await trackedEmail.update({ status: 'sent', sentAt: new Date() });
    }

    res.json({ found });
  } catch (error) {
    console.error('[PostMail API] Error in POST /api/track/verify-sent:', error);
    res.status(500).json({ error: 'Failed to verify sent email' });
  }
});

export default router;
