import { Router, Request, Response } from 'express';
import { TrackedEmail, EmailOpen } from '../db/models';
import { withRLS } from '../middleware/rls';

const router = Router();

/**
 * GET /api/emails
 * Returns all tracked emails for the authenticated user.
 * Uses RLS to ensure tenant isolation.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const emails = await withRLS(req.user!.id, async (transaction) => {
      return TrackedEmail.findAll({
        transaction,
        order: [['created_at', 'DESC']],
        include: [
          {
            model: EmailOpen,
            as: 'opens',
            attributes: ['id', 'opened_at', 'user_agent', 'ip_address'],
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
      return TrackedEmail.findByPk(req.params.id, {
        transaction,
        include: [
          {
            model: EmailOpen,
            as: 'opens',
            attributes: ['id', 'opened_at', 'user_agent', 'ip_address'],
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

export default router;
