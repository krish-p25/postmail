import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { User } from '../db/models';
import { confirmChallenge, createChallenge, sendCodeInBackground } from '../services/challenges';
import { applyPasswordHash, hashPassword, validateNewPassword } from '../services/passwords';
import { codeConfirmLimiter, passwordLimiter } from '../middleware/rate-limit';
import { handleRouteError } from './respond';

const router = Router();

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
      hasMicrosoft: !!user.microsoftId,
    });
  } catch (error) {
    console.error('[PostMail API] Error in GET /me:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

/**
 * POST /me/password/request
 * Body: { newPassword, currentPassword? }
 *
 * Emails a code to confirm creating (no existing password) or changing a password.
 * currentPassword is required when the account already has one.
 */
router.post('/password/request', passwordLimiter, async (req: Request, res: Response) => {
  try {
    const { newPassword, currentPassword } = req.body;

    const passwordProblem = validateNewPassword(newPassword);
    if (passwordProblem) {
      res.status(400).json({ error: passwordProblem });
      return;
    }

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.passwordHash) {
      const valid = typeof currentPassword === 'string' && (await bcrypt.compare(currentPassword, user.passwordHash));
      if (!valid) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }
    }

    const { challenge, code } = await createChallenge({
      purpose: 'set-password',
      email: user.email,
      userId: user.id,
      payload: { passwordHash: await hashPassword(newPassword) },
    });
    sendCodeInBackground(challenge, code);

    res.json({ challengeId: challenge.id, email: user.email });
  } catch (error) {
    handleRouteError(res, error, 'Error in POST /me/password/request', 'Failed to send verification code');
  }
});

/**
 * POST /me/password/confirm
 * Body: { challengeId, code }
 *
 * Applies the pending password, signs out other sessions, and returns a fresh token.
 */
router.post('/password/confirm', codeConfirmLimiter, async (req: Request, res: Response) => {
  try {
    const { challengeId, code } = req.body;
    if (!challengeId || !code) {
      res.status(400).json({ error: 'challengeId and code are required' });
      return;
    }

    const challenge = await confirmChallenge(String(challengeId), 'set-password', String(code), { userId: req.user!.id });

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const token = await applyPasswordHash(user, String(challenge.payload.passwordHash));
    res.json({ success: true, token });
  } catch (error) {
    handleRouteError(res, error, 'Error in POST /me/password/confirm', 'Failed to update password');
  }
});

export default router;
