import { Router, Request, Response } from 'express';
import { TrackedEmail, EmailOpen } from '../db/models';
import { withRLS } from '../middleware/rls';
import { resolvePendingEmails } from '../services/resolve-pending';

const router = Router();

const OPEN_ATTRIBUTES = ['id', 'opened_at', 'user_agent', 'ip_address', 'dismissed'] as const;

/**
 * GET /api/emails
 * Returns all tracked emails for the authenticated user.
 * Before returning, resolves any pending tracked emails by searching sent folders.
 * Uses RLS to ensure tenant isolation.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Resolve pending emails before loading dashboard data
    await resolvePendingEmails(req.user!.id);

    const emails = await withRLS(req.user!.id, async (transaction) => {
      return TrackedEmail.findAll({
        where: { userId: req.user!.id },
        transaction,
        order: [['created_at', 'DESC']],
        include: [
          {
            model: EmailOpen,
            as: 'opens',
            attributes: [...OPEN_ATTRIBUTES],
          },
        ],
      });
    });

    res.json({ emails });
  } catch (error) {
    console.error('[PostMail API] Error in GET /api/emails:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

/**
 * GET /api/emails/:id
 * Returns a single tracked email with its open events.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const email = await withRLS(req.user!.id, async (transaction) => {
      return TrackedEmail.findOne({
        where: { id: req.params.id, userId: req.user!.id },
        transaction,
        include: [
          {
            model: EmailOpen,
            as: 'opens',
            attributes: [...OPEN_ATTRIBUTES],
          },
        ],
      });
    });

    if (!email) {
      res.status(404).json({ error: 'Email not found' });
      return;
    }

    res.json({ email });
  } catch (error) {
    console.error('[PostMail API] Error in GET /api/emails/:id:', error);
    res.status(500).json({ error: 'Failed to fetch email' });
  }
});

/**
 * POST /api/emails/opens/:openId/dismiss
 * Marks an open event as dismissed (e.g. "this was me").
 */
router.post('/opens/:openId/dismiss', async (req: Request, res: Response) => {
  try {
    const open = await EmailOpen.findOne({
      where: { id: req.params.openId, userId: req.user!.id },
    });

    if (!open) {
      res.status(404).json({ error: 'Open not found' });
      return;
    }

    await open.update({ dismissed: true });
    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Error dismissing open:', error);
    res.status(500).json({ error: 'Failed to dismiss open' });
  }
});

export default router;
