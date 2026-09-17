import { Router, Request, Response } from 'express';
import { forUser } from '../db/scoped';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';

const router = Router();

/**
 * GET /api/mailboxes
 * Returns all connected mailboxes for the authenticated user.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const mailboxes = await forUser(req.user!.id).linkedMailboxes.findAll({
      attributes: ['id', 'provider', 'email', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });

    res.json(mailboxes.map((m) => ({
      id: m.id,
      provider: m.provider,
      email: m.email,
      connectedAt: m.createdAt.toISOString(),
    })));
  } catch (error) {
    console.error('[PostMail API] Error in GET /api/mailboxes:', error);
    res.status(500).json({ error: 'Failed to fetch mailboxes' });
  }
});

/**
 * DELETE /api/mailboxes/:id
 * Disconnects a specific mailbox. Revokes OAuth tokens with the provider,
 * then deletes the LinkedMailbox row.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const mailbox = await forUser(req.user!.id).linkedMailboxes.findById(req.params.id);

    if (!mailbox) {
      res.status(404).json({ error: 'Mailbox not found' });
      return;
    }

    // Best-effort token revocation
    if (mailbox.provider === 'gmail' && mailbox.refreshToken) {
      try {
        const client = new OAuth2Client(config.gmailClientId, config.gmailClientSecret);
        await client.revokeToken(mailbox.refreshToken);
      } catch {
        // Revocation failure is non-critical
      }
    }

    await mailbox.destroy();

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Error in DELETE /api/mailboxes/:id:', error);
    res.status(500).json({ error: 'Failed to disconnect mailbox' });
  }
});

export default router;
