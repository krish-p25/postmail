import { Router, Request, Response } from 'express';
import { UserSetting, LinkedMailbox } from '../db/models';
import { withRLS } from '../middleware/rls';

const router = Router();

/**
 * GET /api/settings
 * Returns the authenticated user's settings.
 * Mailbox state is derived from LinkedMailbox table.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const [settings, mailboxes] = await Promise.all([
      withRLS(req.user!.id, async (transaction) => {
        return UserSetting.findOne({
          where: { userId: req.user!.id },
          transaction,
        });
      }),
      LinkedMailbox.findAll({
        where: { userId: req.user!.id },
        attributes: ['id', 'provider', 'email'],
        order: [['createdAt', 'ASC']],
      }),
    ]);

    const firstMailbox = mailboxes[0] || null;

    const data = {
      discordWebhookUrl: settings?.discordWebhookUrl ?? null,
      // Backward compat: derived from LinkedMailbox
      mailboxConnected: mailboxes.length > 0,
      mailboxProvider: firstMailbox?.provider ?? null,
      mailboxEmail: firstMailbox?.email ?? null,
      // New: full list
      linkedMailboxes: mailboxes.map((m) => ({
        id: m.id,
        provider: m.provider,
        email: m.email,
      })),
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
