import { Router, Request, Response } from 'express';
import { UserSetting } from '../db/models';
import { withRLS } from '../middleware/rls';

const router = Router();

/**
 * GET /api/settings
 * Returns the authenticated user's settings.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const settings = await withRLS(req.user!.id, async (transaction) => {
      return UserSetting.findOne({
        where: { userId: req.user!.id },
        transaction,
      });
    });

    const data = settings || {
      discordWebhookUrl: null,
      mailboxConnected: false,
      mailboxProvider: null,
      mailboxEmail: null,
    };
    res.json(data);
  } catch (error) {
    console.error('[PostMail API] Error in GET /api/settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * PUT /api/settings
 * Updates the authenticated user's settings.
 * Currently only supports discord_webhook_url.
 *
 * NOTE: mailbox connection will be handled by a separate OAuth flow
 * in the future — NOT through this endpoint.
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const { discordWebhookUrl } = req.body;

    const settings = await withRLS(req.user!.id, async (transaction) => {
      const [setting] = await UserSetting.upsert(
        {
          userId: req.user!.id,
          discordWebhookUrl: discordWebhookUrl ?? null,
        },
        { transaction },
      );
      return setting;
    });

    res.json({ settings });
  } catch (error) {
    console.error('[PostMail API] Error in PUT /api/settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
