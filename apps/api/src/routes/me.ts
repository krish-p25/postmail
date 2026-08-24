import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/me
 * Returns the authenticated user's profile.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    res.json({
      id: req.user!.id,
      email: req.user!.email,
      supabaseId: req.user!.supabaseId,
    });
  } catch (error) {
    console.error('[PostMail API] Error in GET /api/me:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

export default router;
