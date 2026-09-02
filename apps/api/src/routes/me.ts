import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { User } from '../db/models';
import { sendPasswordChangedEmail } from '../services/email';

const router = Router();
const SALT_ROUNDS = 10;

/**
 * GET /me
 * Returns the authenticated user's profile with auth method flags.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      hasPassword: !!user.passwordHash,
      hasGoogle: !!user.googleId,
    });
  } catch (error) {
    console.error('[PostMail API] Error in GET /me:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

/**
 * POST /me/set-password
 * Allows a user (e.g. Google-only) to add or change their password.
 * Body: { password }
 */
router.post('/set-password', async (req: Request, res: Response) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await user.update({ passwordHash });

    sendPasswordChangedEmail(user.email).catch((err) =>
      console.error('[PostMail API] Failed to send password changed email:', err),
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Error in POST /me/set-password:', error);
    res.status(500).json({ error: 'Failed to set password' });
  }
});

/**
 * POST /me/change-password
 * Changes password for a user who already has one.
 * Body: { currentPassword, newPassword }
 */
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }

    const user = await User.findByPk(req.user!.id);
    if (!user || !user.passwordHash) {
      res.status(400).json({ error: 'No password set on this account' });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.update({ passwordHash });

    sendPasswordChangedEmail(user.email).catch((err) =>
      console.error('[PostMail API] Failed to send password changed email:', err),
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Error in POST /me/change-password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
