import { Op } from 'sequelize';
import { Router, Request, Response } from 'express';
import TrackedEmail from '../db/models/TrackedEmail';
import EmailOpen from '../db/models/EmailOpen';
import { notifyEmailOpened } from '../services/notifications';

const router = Router();

/**
 * GET /o/:token
 * Tracking pixel endpoint — no auth required (email clients fetch this).
 * Records an open event and returns 204 No Content.
 * Deduplicates opens from the same IP + user agent within 60 seconds.
 */
router.get('/:token', async (req: Request, res: Response) => {
  // Always return 204 with no-cache headers, regardless of outcome
  res.set({
    'Cache-Control': 'no-store, no-cache',
    'Pragma': 'no-cache',
  });

  try {
    const trackedEmail = await TrackedEmail.findOne({
      where: { trackingToken: req.params.token },
    });

    if (!trackedEmail) {
      res.status(204).end();
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
      res.status(204).end();
      return;
    }

    const open = await EmailOpen.create({
      trackedEmailId: trackedEmail.id,
      userId: trackedEmail.userId,
      userAgent,
      ipAddress,
    });

    res.status(204).end();

    // Fire notification async — don't block the response
    notifyEmailOpened(trackedEmail, open).catch((err) =>
      console.error('[PostMail Pixel] Notification error:', err),
    );
  } catch (err) {
    console.error('[PostMail Pixel] Error recording open:', err);
    res.status(204).end();
  }
});

export default router;
