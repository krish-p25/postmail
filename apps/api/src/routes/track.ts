import { Router, Request, Response } from 'express';
import { Attributes, Op, WhereOptions } from 'sequelize';
import type { LinkedMailbox, TrackedEmail } from '../db/models';
import { forUser, UserScope } from '../db/scoped';
import { selfViewLimiter } from '../middleware/rate-limit';
import { searchSentFolder } from '../services/sent-folder-search';

const router = Router();

/**
 * Resolve the LinkedMailbox for a tracking operation.
 * Priority: 1) existing mailboxId on TrackedEmail, 2) senderEmail+provider lookup,
 * 3) first mailbox for the provider, 4) first mailbox for the user.
 */
type Provider = 'gmail' | 'outlook';

async function resolveMailbox(
  scope: UserScope,
  senderEmail?: string,
  provider?: string,
  trackedEmail?: TrackedEmail | null,
): Promise<LinkedMailbox | null> {
  // 1. If TrackedEmail already has a mailboxId, use it
  if (trackedEmail?.mailboxId) {
    const mailbox = await scope.linkedMailboxes.findById(trackedEmail.mailboxId);
    if (mailbox) return mailbox;
  }

  // 2. If senderEmail is provided, look up by email (+ provider)
  if (senderEmail) {
    const where: WhereOptions<Attributes<LinkedMailbox>> = provider
      ? { email: senderEmail, provider: provider as Provider }
      : { email: senderEmail };
    const mailbox = await scope.linkedMailboxes.findOne({ where });
    if (mailbox) return mailbox;
  }

  // 3. Fallback: first mailbox matching the provider
  if (provider) {
    const mailbox = await scope.linkedMailboxes.findOne({
      where: { provider: provider as Provider },
      order: [['createdAt', 'ASC']],
    });
    if (mailbox) return mailbox;
  }

  // 4. Fallback: first mailbox for the user
  return scope.linkedMailboxes.findOne({ order: [['createdAt', 'ASC']] });
}

/**
 * GET /api/track/preflight
 * Lightweight auth check — if you reach this handler, the JWT is valid.
 */
router.get('/preflight', async (req: Request, res: Response) => {
  try {
    const mailboxes = await forUser(req.user!.id).linkedMailboxes.findAll({ attributes: ['email'] });
    res.json({ ok: true, linkedEmails: mailboxes.map((m) => m.email) });
  } catch {
    res.json({ ok: true, linkedEmails: [] });
  }
});

/**
 * POST /api/track/register
 * Register a new tracked email when the extension injects a pixel.
 * Accepts optional senderEmail and provider for mailbox resolution.
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { trackingToken, recipients, subject, senderEmail, provider } = req.body;

    if (!trackingToken) {
      res.status(400).json({ error: 'trackingToken is required' });
      return;
    }

    const recipient = Array.isArray(recipients)
      ? recipients.join(', ')
      : recipients || null;

    const scope = forUser(req.user!.id);

    // Resolve mailbox
    let mailboxId: string | null = null;
    if (senderEmail || provider) {
      const mailbox = await resolveMailbox(scope, senderEmail, provider);
      if (mailbox) mailboxId = mailbox.id;
    }

    const trackedEmail = await scope.trackedEmails.create({
      trackingToken,
      recipient,
      subject: subject || null,
      status: 'pending',
      mailboxId,
    });

    res.json({
      id: trackedEmail.id,
      trackingToken: trackedEmail.trackingToken,
      status: trackedEmail.status,
    });
  } catch (error) {
    console.error('[PostMail API] Error in POST /api/track/register:', error);
    res.status(500).json({ error: 'Failed to register tracked email' });
  }
});

/**
 * POST /api/track/update
 * Update a tracked email's subject, recipients, and mailboxId.
 * Accepts optional senderEmail and provider for mailbox resolution.
 */
router.post('/update', async (req: Request, res: Response) => {
  try {
    const { trackingToken, recipients, subject, senderEmail, provider } = req.body;

    if (!trackingToken) {
      res.status(400).json({ error: 'trackingToken is required' });
      return;
    }

    const scope = forUser(req.user!.id);
    const trackedEmail = await scope.trackedEmails.findOne({ where: { trackingToken } });

    if (!trackedEmail) {
      res.status(404).json({ error: 'Tracked email not found' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (subject) updates.subject = subject;
    if (recipients) {
      updates.recipient = Array.isArray(recipients)
        ? recipients.join(', ')
        : recipients;
    }

    // Resolve mailboxId if not already set
    if (!trackedEmail.mailboxId && (senderEmail || provider)) {
      const mailbox = await resolveMailbox(scope, senderEmail, provider, trackedEmail);
      if (mailbox) updates.mailboxId = mailbox.id;
    }

    if (Object.keys(updates).length > 0) {
      await trackedEmail.update(updates);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Error in POST /api/track/update:', error);
    res.status(500).json({ error: 'Failed to update tracked email' });
  }
});

/**
 * POST /api/track/discard
 * Mark a tracked email as discarded.
 */
router.post('/discard', async (req: Request, res: Response) => {
  try {
    const { trackingToken } = req.body;

    if (!trackingToken) {
      res.status(400).json({ error: 'trackingToken is required' });
      return;
    }

    const trackedEmail = await forUser(req.user!.id).trackedEmails.findOne({ where: { trackingToken } });

    if (!trackedEmail) {
      res.status(404).json({ error: 'Tracked email not found' });
      return;
    }

    await trackedEmail.update({ status: 'discarded' });

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Error in POST /api/track/discard:', error);
    res.status(500).json({ error: 'Failed to discard tracked email' });
  }
});

/**
 * POST /api/track/verify-sent
 * Checks whether the tracked email was actually sent by searching the
 * user's sent-mail folder via the appropriate provider API.
 * Accepts optional senderEmail and provider for mailbox resolution.
 */
router.post('/verify-sent', async (req: Request, res: Response) => {
  try {
    const { trackingToken, senderEmail, provider } = req.body;

    if (!trackingToken) {
      res.status(400).json({ error: 'trackingToken is required' });
      return;
    }

    const scope = forUser(req.user!.id);
    const trackedEmail = await scope.trackedEmails.findOne({ where: { trackingToken } });

    // Resolve mailbox
    const mailbox = await resolveMailbox(scope, senderEmail, provider, trackedEmail);

    if (!mailbox) {
      res.json({ found: false });
      return;
    }

    // Update trackedEmail's mailboxId if not set
    if (trackedEmail && !trackedEmail.mailboxId) {
      await trackedEmail.update({ mailboxId: mailbox.id });
    }

    await verifySentEmail(mailbox, trackingToken, trackedEmail, res);
  } catch (error) {
    console.error('[PostMail API] Error in POST /api/track/verify-sent:', error);
    res.status(500).json({ error: 'Failed to verify sent email' });
  }
});

/**
 * Delete any EmailOpen records that were logged before the email was
 * actually sent.  These are false opens caused by mail-client previews
 * or image-proxy pre-fetches while the email sat in drafts.
 */
async function purgePreSendOpens(trackedEmail: TrackedEmail, sentAt: Date): Promise<number> {
  return forUser(trackedEmail.userId).emailOpens.destroy({
    where: {
      trackedEmailId: trackedEmail.id,
      openedAt: { [Op.lt]: sentAt },
    },
  });
}

/**
 * Verify a tracked email was sent by searching the mailbox sent folder.
 * Uses the shared sent-folder-search service.
 */
async function verifySentEmail(
  mailbox: LinkedMailbox,
  trackingToken: string,
  trackedEmail: TrackedEmail | null,
  res: Response,
): Promise<void> {
  const result = await searchSentFolder(mailbox, trackingToken, {
    subject: trackedEmail?.subject || undefined,
    newerThan: '1h',
  });

  if (result.authError) {
    res.json({ found: false, authError: true });
    return;
  }

  if (result.found && trackedEmail) {
    const updates: Record<string, unknown> = {};

    // Transition pending/discarded → sent
    if (trackedEmail.status === 'pending' || trackedEmail.status === 'discarded') {
      updates.status = 'sent';
      updates.sentAt = result.sentAt || new Date();
    }

    // Always backfill missing IDs, even if already sent
    if (result.messageId && !trackedEmail.messageId) updates.messageId = result.messageId;
    if (result.threadId && !trackedEmail.threadId) updates.threadId = result.threadId;
    if (result.conversationId && !trackedEmail.conversationId) updates.conversationId = result.conversationId;

    if (Object.keys(updates).length > 0) {
      await trackedEmail.update(updates);
    }

    if (updates.sentAt) {
      await purgePreSendOpens(trackedEmail, updates.sentAt as Date);
    }
  }

  res.json({ found: result.found });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Window around the report (server time) in which opens are labelled. Opens are stored ~45 ms before the extension reports. */
const SELF_VIEW_LOOKBACK_MS = 15_000;
const SELF_VIEW_LOOKAHEAD_MS = 1_000;

/**
 * POST /api/track/self-view
 * Body: { trackingToken, accountEmail }
 *
 * Sent by the extension when a tab signed in to a linked mailbox completed a request
 * for one of this user's pixels. Labels that token's recent opens "Likely You".
 * 204 when the token isn't the user's or the account isn't one of their linked mailboxes.
 */
router.post('/self-view', selfViewLimiter, async (req: Request, res: Response) => {
  try {
    const { trackingToken, accountEmail } = req.body ?? {};
    if (
      typeof trackingToken !== 'string' ||
      !UUID_RE.test(trackingToken) ||
      typeof accountEmail !== 'string' ||
      !accountEmail.includes('@') ||
      accountEmail.length > 320
    ) {
      res.status(400).json({ error: 'trackingToken (uuid) and accountEmail are required' });
      return;
    }

    const scope = forUser(req.user!.id);

    const trackedEmail = await scope.trackedEmails.findOne({ where: { trackingToken }, attributes: ['id'] });
    if (!trackedEmail) {
      res.status(204).end();
      return;
    }

    const mailboxes = await scope.linkedMailboxes.findAll({ attributes: ['email'] });
    const account = accountEmail.trim().toLowerCase();
    if (!mailboxes.some((m) => m.email.toLowerCase() === account)) {
      res.status(204).end();
      return;
    }

    const now = Date.now();
    const [labelled] = await scope.emailOpens.update(
      { likelySelf: true },
      {
        where: {
          trackedEmailId: trackedEmail.id,
          likelySelf: false,
          openedAt: { [Op.between]: [new Date(now - SELF_VIEW_LOOKBACK_MS), new Date(now + SELF_VIEW_LOOKAHEAD_MS)] },
        },
      },
    );

    res.json({ labelled });
  } catch (error) {
    console.error('[PostMail API] Error in POST /api/track/self-view:', error);
    res.status(500).json({ error: 'Failed to record self view' });
  }
});

export default router;
