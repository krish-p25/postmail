import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { User } from '../db/models';
import { confirmChallenge, createChallenge, sendCodeInBackground } from '../services/challenges';
import { applyPasswordHash, hashPassword, validateNewPassword } from '../services/passwords';
import { issuePasswordTicket, readPasswordTicket } from '../services/password-tickets';
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
 * Body: { currentPassword? }
 *
 * Emails a code to confirm creating (no existing password) or changing a password.
 * currentPassword is required when the account already has one, so a hijacked
 * session cannot send codes. The new password is chosen later, at /password/apply.
 */
router.post('/password/request', passwordLimiter, async (req: Request, res: Response) => {
  try {
    const { currentPassword } = req.body;

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
    });
    sendCodeInBackground(challenge, code);

    res.json({ challengeId: challenge.id, email: user.email });
  } catch (error) {
    handleRouteError(res, error, 'Error in POST /me/password/request', 'Failed to send verification code');
  }
});

/**
 * POST /me/password/verify
 * Body: { challengeId, code }
 *
 * Confirms the emailed code and returns a ticket authorising one password write.
 */
router.post('/password/verify', codeConfirmLimiter, async (req: Request, res: Response) => {
  try {
    const { challengeId, code } = req.body;
    if (!challengeId || !code) {
      res.status(400).json({ error: 'challengeId and code are required' });
      return;
    }

    await confirmChallenge(String(challengeId), 'set-password', String(code), { userId: req.user!.id });

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      ticket: issuePasswordTicket({ userId: user.id, purpose: 'set-password', tokenVersion: user.tokenVersion }),
    });
  } catch (error) {
    handleRouteError(res, error, 'Error in POST /me/password/verify', 'Failed to verify code');
  }
});

/**
 * POST /me/password/apply
 * Body: { ticket, newPassword }
 *
 * Sets the password, signs out other sessions, and returns a fresh token.
 */
router.post('/password/apply', passwordLimiter, async (req: Request, res: Response) => {
  try {
    const { ticket, newPassword } = req.body;

    // Validate the password first so a weak one doesn't burn the ticket.
    const passwordProblem = validateNewPassword(newPassword);
    if (passwordProblem) {
      res.status(400).json({ error: passwordProblem });
      return;
    }

    const claims = readPasswordTicket(ticket, 'set-password');
    const user = claims && claims.sub === req.user!.id ? await User.findByPk(claims.sub) : null;
    // A spent ticket no longer matches token_version, because applying a password bumps it.
    if (!user || !claims || claims.ver !== user.tokenVersion) {
      res.status(400).json({ error: 'This verification has expired. Request a new code.', code: 'ticket_invalid' });
      return;
    }

    const token = await applyPasswordHash(user, await hashPassword(newPassword));
    res.json({ success: true, token });
  } catch (error) {
    handleRouteError(res, error, 'Error in POST /me/password/apply', 'Failed to update password');
  }
});

export default router;
