import { Op } from 'sequelize';
import { Router, Request, Response } from 'express';
import TrackedEmail from '../db/models/TrackedEmail';
import EmailOpen from '../db/models/EmailOpen';
import { notifyEmailOpened } from '../services/notifications';

const router = Router();

// 1x1 transparent GIF (43 bytes) — smallest valid image for email tracking
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

/**
 * Extract the real client IP from request headers.
 * Checks multiple forwarding headers to handle various proxy setups
 * (Cloudflare, nginx, cloud load balancers, Docker).
 */
function getClientIp(req: Request): string | null {
  // Cloudflare
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return Array.isArray(cfIp) ? cfIp[0] : cfIp;

  // Standard proxy headers — take the first (leftmost = original client) IP
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const raw = Array.isArray(xff) ? xff[0] : xff;
    const first = raw.split(',')[0].trim();
    if (first) return first;
  }

  // nginx-style
  const realIp = req.headers['x-real-ip'];
  if (realIp) return Array.isArray(realIp) ? realIp[0] : realIp;

  // Fallback to Express req.ip (respects trust proxy)
  return req.ip || null;
}

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

    if (!trackedEmail) {
      sendPixel(res);
      return;
    }

    const userAgent = req.headers['user-agent'] || null;
    const ipAddress = getClientIp(req);
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
