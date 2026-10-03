import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import type { LinkedMailbox } from '../db/models';
import { forUser } from '../db/scoped';
import { lookupTrackingByMessageIds } from '../services/tracking-lookup';
import { resolvePendingEmails } from '../services/resolve-pending';
import { issueConnectState, verifyConnectState } from '../services/oauth-state';
import { attachmentContentDisposition } from '../utils/attachment-headers';
import { createGmailOAuthClient, createAuthenticatedGmailClient } from '../services/gmail-client';

const router = Router();

/**
 * Strips quoted/forwarded content from Gmail HTML.
 * Gmail uses various patterns to embed previous replies.
 */
function stripGmailQuotes(html: string): string {
  let cleaned = html;

  // Gmail-specific class-based patterns (safest, most targeted)
  cleaned = cleaned.replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*$/i, '');
  cleaned = cleaned.replace(/<div[^>]*class="[^"]*gmail_extra[^"]*"[^>]*>[\s\S]*$/i, '');
  cleaned = cleaned.replace(/<div[^>]*class="[^"]*gmail_(?:attr|quote_attribution)[^"]*"[^>]*>[\s\S]*$/i, '');

  // <blockquote type="cite"> — standard email quoting
  cleaned = cleaned.replace(/<blockquote[^>]*type="cite"[^>]*>[\s\S]*$/i, '');

  // "---------- Forwarded message ---------"
  cleaned = cleaned.replace(/<div[^>]*>-{5,}\s*Forwarded message\s*-{5,}[\s\S]*$/i, '');

  // If stripping removed all visible content, return original
  const textOnly = cleaned.replace(/<[^>]*>/g, '').trim();
  if (!textOnly) return html;

  return cleaned;
}

interface AttachmentInfo {
  attachmentId: string;
  messageId: string;
  filename: string;
  mimeType: string;
  size: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkForAttachments(payload: any): boolean {
  if (!payload) return false;
  if (payload.filename && payload.body?.attachmentId) return true;
  if (payload.parts) {
    return payload.parts.some((p: typeof payload) => checkForAttachments(p));
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAttachments(payload: any, messageId: string): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];
  function walk(part: typeof payload) {
    if (!part) return;
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        attachmentId: part.body.attachmentId,
        messageId,
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || 0,
      });
    }
    if (part.parts) {
      for (const sub of part.parts) walk(sub);
    }
  }
  walk(payload);
  return attachments;
}

/**
 * Find the Gmail LinkedMailbox — by mailboxId if provided, otherwise first Gmail mailbox for the user.
 */
async function findGmailMailbox(userId: string, mailboxId?: string): Promise<LinkedMailbox | null> {
  const scope = forUser(userId);
  if (mailboxId) {
    return scope.linkedMailboxes.findOne({ where: { id: mailboxId, provider: 'gmail' } });
  }
  return scope.linkedMailboxes.findOne({
    where: { provider: 'gmail' },
    order: [['createdAt', 'ASC']],
  });
}

/**
 * GET /api/gmail/connect
 * Returns the Google OAuth consent URL for Gmail access.
 *
 * `state` binds the resulting authorization code to this user (see
 * services/oauth-state.ts) — otherwise an attacker's own code, handed to a
 * logged-in victim, would get the attacker's Gmail linked to the victim's account.
 */
router.get('/connect', async (req: Request, res: Response) => {
  try {
    const client = createGmailOAuthClient();
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
      state: issueConnectState(req.user!.id, 'gmail'),
    });
    res.json({ url });
  } catch (error) {
    console.error('[PostMail API] Gmail connect error:', error);
    res.status(500).json({ error: 'Failed to generate Gmail auth URL' });
  }
});

/**
 * POST /api/gmail/callback
 * Body: { code, state }
 * Exchanges the authorization code for tokens and creates/updates a LinkedMailbox.
 */
router.post('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    if (!verifyConnectState(state, 'gmail', req.user!.id)) {
      res.status(400).json({ error: 'This connection request has expired. Please try again.' });
      return;
    }

    const client = createGmailOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      res.status(400).json({ error: 'Failed to get tokens from Google' });
      return;
    }

    // Fetch the connected Gmail address
    let mailboxEmail: string | null = null;
    try {
      client.setCredentials(tokens);
      const gmail = google.gmail({ version: 'v1', auth: client as any });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      mailboxEmail = profile.data.emailAddress || null;
    } catch (err) {
      console.error('[PostMail API] Failed to fetch Gmail profile email:', err);
    }

    if (!mailboxEmail) {
      res.status(400).json({ error: 'Could not determine Gmail email address' });
      return;
    }

    // Create or update LinkedMailbox
    const [mailbox, created] = await forUser(req.user!.id).linkedMailboxes.findOrCreate({
      where: { email: mailboxEmail },
      defaults: {
        provider: 'gmail',
        email: mailboxEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });

    if (!created) {
      await mailbox.update({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Gmail callback error:', error);
    res.status(500).json({ error: 'Failed to connect Gmail' });
  }
});

/**
 * GET /api/gmail/emails
 * Fetches sent emails from the user's Gmail.
 * Accepts ?mailboxId= to scope to a specific mailbox.
 */
router.get('/emails', async (req: Request, res: Response) => {
  try {
    // Resolve any pending tracked emails before loading the list
    await resolvePendingEmails(req.user!.id);

    const mailbox = await findGmailMailbox(req.user!.id, req.query.mailboxId as string | undefined);

    if (!mailbox || !mailbox.refreshToken) {
      res.status(400).json({ error: 'Gmail not connected' });
      return;
    }

    const client = createAuthenticatedGmailClient(mailbox);
    const gmail = google.gmail({ version: 'v1', auth: client as any });

    const pageSize = 25;
    const pageToken = (req.query.pageToken as string) || undefined;
    const searchQuery = (req.query.q as string) || '';

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['SENT'],
      maxResults: pageSize,
      pageToken,
      ...(searchQuery ? { q: searchQuery } : {}),
    });

    const messageIds = listRes.data.messages || [];
    const nextPageToken = listRes.data.nextPageToken || null;

    if (messageIds.length === 0) {
      res.json({ emails: [], nextPageToken: null });
      return;
    }

    const emails = await Promise.all(
      messageIds.map(async (msg) => {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['Subject', 'To', 'Date'],
        });

        const headers = detail.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === 'Subject')?.value || '(No subject)';
        const to = headers.find((h) => h.name === 'To')?.value || '';
        const date = headers.find((h) => h.name === 'Date')?.value || '';

        const recipients = to
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean);

        const hasAttachments = checkForAttachments(detail.data.payload);

        return {
          id: msg.id!,
          subject,
          recipients,
          sentAt: date ? new Date(date).toISOString() : null,
          hasAttachments,
        };
      }),
    );

    // Look up tracking data for all message IDs in one query
    const ids = emails.map((e) => e.id);
    const trackingMap = await lookupTrackingByMessageIds(ids, req.user!.id);

    const enriched = emails.map((email) => ({
      ...email,
      tracking: trackingMap.get(email.id) || null,
    }));

    res.json({ emails: enriched, nextPageToken });
  } catch (error) {
    console.error('[PostMail API] Gmail emails error:', error);
    res.status(500).json({ error: 'Failed to fetch Gmail emails' });
  }
});

/**
 * GET /api/gmail/emails/:id
 * Fetches the full thread for a specific email.
 * Accepts ?mailboxId= to scope to a specific mailbox.
 */
router.get('/emails/:id', async (req: Request, res: Response) => {
  try {
    const mailbox = await findGmailMailbox(req.user!.id, req.query.mailboxId as string | undefined);

    if (!mailbox || !mailbox.refreshToken) {
      res.status(400).json({ error: 'Gmail not connected' });
      return;
    }

    const client = createAuthenticatedGmailClient(mailbox);
    const gmail = google.gmail({ version: 'v1', auth: client as any });

    const msgRes = await gmail.users.messages.get({
      userId: 'me',
      id: req.params.id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'To', 'From', 'Date', 'Cc'],
    });

    const threadId = msgRes.data.threadId;

    const threadRes = await gmail.users.threads.get({
      userId: 'me',
      id: threadId!,
      format: 'full',
    });

    const rawMessages = threadRes.data.messages || [];

    const messages = rawMessages.map((msg) => {
      const headers = msg.payload?.headers || [];
      const getHeader = (name: string) => headers.find((h) => h.name === name)?.value || '';

      let htmlBody = '';
      let plainBody = '';
      function extractBody(part: typeof msg.payload): void {
        if (!part) return;
        if (part.mimeType === 'text/html' && part.body?.data && !htmlBody) {
          htmlBody = Buffer.from(part.body.data, 'base64url').toString('utf-8');
        }
        if (part.mimeType === 'text/plain' && part.body?.data && !plainBody) {
          plainBody = Buffer.from(part.body.data, 'base64url').toString('utf-8');
        }
        if (part.parts) {
          for (const subPart of part.parts) {
            extractBody(subPart as typeof msg.payload);
          }
        }
      }
      extractBody(msg.payload);

      let body = '';
      if (htmlBody) {
        body = stripGmailQuotes(htmlBody);
      } else if (plainBody) {
        const lines = plainBody.split('\n');
        const cleaned: string[] = [];
        for (const line of lines) {
          if (line.startsWith('>') || line.match(/^On .+ wrote:\s*$/)) break;
          cleaned.push(line);
        }
        body = cleaned.join('\n').replace(/\n/g, '<br>');
      }

      const attachments = extractAttachments(msg.payload, msg.id!);

      return {
        id: msg.id,
        threadId: msg.threadId,
        subject: getHeader('Subject') || '(No subject)',
        from: getHeader('From'),
        to: getHeader('To'),
        cc: getHeader('Cc') || null,
        date: getHeader('Date') ? new Date(getHeader('Date')).toISOString() : null,
        body,
        snippet: msg.snippet || '',
        attachments,
      };
    });

    res.json({ messages });
  } catch (error) {
    console.error('[PostMail API] Gmail email detail error:', error);
    res.status(500).json({ error: 'Failed to fetch email details' });
  }
});

/**
 * GET /api/gmail/emails/:messageId/attachments/:attachmentId
 * Downloads a specific attachment.
 * Accepts ?mailboxId= to scope to a specific mailbox.
 */
router.get('/emails/:messageId/attachments/:attachmentId', async (req: Request, res: Response) => {
  try {
    const mailbox = await findGmailMailbox(req.user!.id, req.query.mailboxId as string | undefined);

    if (!mailbox || !mailbox.refreshToken) {
      res.status(400).json({ error: 'Gmail not connected' });
      return;
    }

    const client = createAuthenticatedGmailClient(mailbox);
    const gmail = google.gmail({ version: 'v1', auth: client as any });

    const attachment = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: req.params.messageId,
      id: req.params.attachmentId,
    });

    if (!attachment.data.data) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    const msgDetail = await gmail.users.messages.get({
      userId: 'me',
      id: req.params.messageId,
      format: 'metadata',
    });
    const attachments = extractAttachments(msgDetail.data.payload, req.params.messageId);
    const meta = attachments.find((a) => a.attachmentId === req.params.attachmentId);

    const buffer = Buffer.from(attachment.data.data, 'base64url');
    const mimeType = meta?.mimeType || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', attachmentContentDisposition(meta?.filename || 'download', mimeType));
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (error) {
    console.error('[PostMail API] Gmail attachment download error:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

/**
 * POST /api/gmail/disconnect
 * Removes all Gmail LinkedMailboxes for this user.
 * Kept for backward compatibility — prefer DELETE /api/mailboxes/:id.
 */
router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const mailboxes = await forUser(req.user!.id).linkedMailboxes.findAll({ where: { provider: 'gmail' } });

    for (const mailbox of mailboxes) {
      if (mailbox.refreshToken) {
        try {
          const client = createGmailOAuthClient();
          await client.revokeToken(mailbox.refreshToken);
        } catch {
          // Revocation failure is non-critical
        }
      }
      await mailbox.destroy();
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Gmail disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Gmail' });
  }
});

export default router;
