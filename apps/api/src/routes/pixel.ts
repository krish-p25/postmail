import { Op } from 'sequelize';
import { Router, Request, Response } from 'express';
import TrackedEmail from '../db/models/TrackedEmail';
import EmailOpen from '../db/models/EmailOpen';
import { notifyEmailOpened } from '../services/notifications';

const router = Router();

function logPixelRequest(req: Request, token: string, matched: boolean): void {
  const entry = {
    timestamp: new Date().toISOString(),
    token: token.substring(0, 12) + '...',
    matched,
    ip: req.ip,
    xForwardedFor: req.headers['x-forwarded-for'] || null,
    xRealIp: req.headers['x-real-ip'] || null,
    userAgent: req.headers['user-agent'] || null,
    referer: req.headers['referer'] || null,
    accept: req.headers['accept'] || null,
    acceptLanguage: req.headers['accept-language'] || null,
    acceptEncoding: req.headers['accept-encoding'] || null,
    cacheControl: req.headers['cache-control'] || null,
    connection: req.headers['connection'] || null,
    host: req.headers['host'] || null,
    via: req.headers['via'] || null,
    allHeaders: req.headers,
  };
  console.log('[PostMail Pixel] REQUEST:', JSON.stringify(entry, null, 2));
}

// 1x1 transparent GIF (43 bytes) — smallest valid image for email tracking
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

function sendPixel(res: Response): void {
  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': String(TRANSPARENT_GIF.length),
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.status(200).send(TRANSPARENT_GIF);
}

/**
 * GET /o/:token
 * Tracking pixel endpoint — no auth required (email clients fetch this).
 * Records an open event and returns a 1x1 transparent GIF.
 * Deduplicates opens from the same IP + user agent within 60 seconds.
 */
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const trackedEmail = await TrackedEmail.findOne({
      where: { trackingToken: req.params.token },
    });

    logPixelRequest(req, req.params.token, !!trackedEmail);

    if (!trackedEmail) {
      sendPixel(res);
      return;
    }

    const userAgent = req.headers['user-agent'] || null;
    const ipAddress = req.ip || null;
    const oneMinuteAgo = new Date(Date.now() - 60_000);

    // Skip duplicate: same tracked email + IP + user agent within the last minute
    const duplicate = await EmailOpen.findOne({
      where: {
        trackedEmailId: trackedEmail.id,
        ipAddress: ipAddress ?? '',
        userAgent: userAgent ?? '',
        openedAt: { [Op.gte]: oneMinuteAgo },
      },
    });

    if (duplicate) {
      sendPixel(res);
      return;
    }

    const open = await EmailOpen.create({
      trackedEmailId: trackedEmail.id,
      userId: trackedEmail.userId,
      userAgent,
      ipAddress,
    });

    sendPixel(res);

    // Fire notification async — don't block the response
    notifyEmailOpened(trackedEmail, open).catch((err) =>
      console.error('[PostMail Pixel] Notification error:', err),
    );
  } catch (err) {
    console.error('[PostMail Pixel] Error recording open:', err);
    sendPixel(res);
  }
});

export default router;
