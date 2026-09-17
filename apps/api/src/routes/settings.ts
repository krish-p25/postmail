import { Router, Request, Response } from 'express';
import { forUser } from '../db/scoped';

const router = Router();

/**
 * GET /api/settings
 * Returns the authenticated user's settings.
 * Mailbox state is derived from LinkedMailbox table.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const scope = forUser(req.user!.id);
    const [settings, mailboxes] = await Promise.all([
      scope.userSettings.findOne(),
      scope.linkedMailboxes.findAll({
        attributes: ['id', 'provider', 'email'],
        order: [['createdAt', 'ASC']],
      }),
    ]);

    const firstMailbox = mailboxes[0] || null;

    res.json({
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
    });
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

    const [settings] = await forUser(req.user!.id).userSettings.upsert({
      discordWebhookUrl: discordWebhookUrl ?? null,
    });

    res.json({ settings });
  } catch (error) {
    console.error('[PostMail API] Error in PUT /api/settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
