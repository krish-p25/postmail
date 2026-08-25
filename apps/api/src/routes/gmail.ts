import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { config } from '../config/env';
import User from '../db/models/User';
import { UserSetting } from '../db/models';
import { withRLS } from '../middleware/rls';

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

function createOAuth2Client(): OAuth2Client {
  return new OAuth2Client(
    config.gmailClientId,
    config.gmailClientSecret,
    config.gmailRedirectUri,
  );
}

/**
 * GET /api/gmail/connect
 * Returns the Google OAuth consent URL for Gmail access.
 */
router.get('/connect', async (_req: Request, res: Response) => {
  try {
    const client = createOAuth2Client();
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    });
    res.json({ url });
  } catch (error) {
    console.error('[PostMail API] Gmail connect error:', error);
    res.status(500).json({ error: 'Failed to generate Gmail auth URL' });
  }
});

/**
 * POST /api/gmail/callback
 * Body: { code }
 * Exchanges the authorization code for tokens and stores them.
 */
router.post('/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      res.status(400).json({ error: 'Failed to get tokens from Google' });
      return;
    }

    // Store tokens on user (users table is NOT RLS-protected)
    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await user.update({
      gmailAccessToken: tokens.access_token,
      gmailRefreshToken: tokens.refresh_token,
      gmailTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    });

    // Update user_settings (RLS-protected)
    await withRLS(req.user!.id, async (transaction) => {
      await UserSetting.update(
        {
          mailboxConnected: true,
          mailboxProvider: 'gmail',
          mailboxConnectedAt: new Date(),
        },
        { where: { userId: req.user!.id }, transaction },
      );
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Gmail callback error:', error);
    res.status(500).json({ error: 'Failed to connect Gmail' });
  }
});

/**
 * GET /api/gmail/emails
 * Fetches sent emails from the user's Gmail.
 */
router.get('/emails', async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.user!.id);

    if (!user || !user.gmailRefreshToken) {
      res.status(400).json({ error: 'Gmail not connected' });
      return;
    }

    const client = createOAuth2Client();
    client.setCredentials({
      access_token: user.gmailAccessToken,
      refresh_token: user.gmailRefreshToken,
      expiry_date: user.gmailTokenExpiry ? user.gmailTokenExpiry.getTime() : undefined,
    });

    // Persist refreshed tokens when they occur
    client.on('tokens', async (tokens) => {
      const updates: Partial<{ gmailAccessToken: string; gmailTokenExpiry: Date }> = {};
      if (tokens.access_token) updates.gmailAccessToken = tokens.access_token;
      if (tokens.expiry_date) updates.gmailTokenExpiry = new Date(tokens.expiry_date);
      if (Object.keys(updates).length > 0) {
        await User.update(updates, { where: { id: user.id } });
      }
    });

    const gmail = google.gmail({ version: 'v1', auth: client as any });

    // List sent messages
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['SENT'],
      maxResults: 50,
    });

    const messageIds = listRes.data.messages || [];

    if (messageIds.length === 0) {
      res.json({ emails: [] });
      return;
    }

    // Fetch metadata for each message in parallel
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

        // Parse recipients from To header (e.g. "Name <email>, Name2 <email2>")
        const recipients = to
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean);

        // Check for attachments in payload parts
        const hasAttachments = checkForAttachments(detail.data.payload);

        return {
          id: msg.id,
          subject,
          recipients,
          sentAt: date ? new Date(date).toISOString() : null,
          tracked: false,
          hasAttachments,
        };
      }),
    );

    res.json({ emails });
  } catch (error) {
    console.error('[PostMail API] Gmail emails error:', error);
    res.status(500).json({ error: 'Failed to fetch Gmail emails' });
  }
});

/**
 * GET /api/gmail/emails/:id
 * Fetches the full thread for a specific email.
 */
router.get('/emails/:id', async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.user!.id);

    if (!user || !user.gmailRefreshToken) {
      res.status(400).json({ error: 'Gmail not connected' });
      return;
    }

    const client = createOAuth2Client();
    client.setCredentials({
      access_token: user.gmailAccessToken,
      refresh_token: user.gmailRefreshToken,
      expiry_date: user.gmailTokenExpiry ? user.gmailTokenExpiry.getTime() : undefined,
    });

    client.on('tokens', async (tokens) => {
      const updates: Partial<{ gmailAccessToken: string; gmailTokenExpiry: Date }> = {};
      if (tokens.access_token) updates.gmailAccessToken = tokens.access_token;
      if (tokens.expiry_date) updates.gmailTokenExpiry = new Date(tokens.expiry_date);
      if (Object.keys(updates).length > 0) {
        await User.update(updates, { where: { id: user.id } });
      }
    });

    const gmail = google.gmail({ version: 'v1', auth: client as any });

    // Get the message to find its threadId and subject
    const msgRes = await gmail.users.messages.get({
      userId: 'me',
      id: req.params.id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'To', 'From', 'Date', 'Cc'],
    });

    const threadId = msgRes.data.threadId;

    // Fetch the full thread
    const threadRes = await gmail.users.threads.get({
      userId: 'me',
      id: threadId!,
      format: 'full',
    });

    const rawMessages = threadRes.data.messages || [];

    const messages = rawMessages.map((msg) => {
      const headers = msg.payload?.headers || [];
      const getHeader = (name: string) => headers.find((h) => h.name === name)?.value || '';

      // Extract body from parts
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
        // Strip plain-text quoted replies (lines starting with >)
        const lines = plainBody.split('\n');
        const cleaned: string[] = [];
        for (const line of lines) {
          if (line.startsWith('>') || line.match(/^On .+ wrote:\s*$/)) break;
          cleaned.push(line);
        }
        body = cleaned.join('\n').replace(/\n/g, '<br>');
      }

      // Extract attachments
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
 */
router.get('/emails/:messageId/attachments/:attachmentId', async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.user!.id);

    if (!user || !user.gmailRefreshToken) {
      res.status(400).json({ error: 'Gmail not connected' });
      return;
    }

    const client = createOAuth2Client();
    client.setCredentials({
      access_token: user.gmailAccessToken,
      refresh_token: user.gmailRefreshToken,
      expiry_date: user.gmailTokenExpiry ? user.gmailTokenExpiry.getTime() : undefined,
    });

    client.on('tokens', async (tokens) => {
      const updates: Partial<{ gmailAccessToken: string; gmailTokenExpiry: Date }> = {};
      if (tokens.access_token) updates.gmailAccessToken = tokens.access_token;
      if (tokens.expiry_date) updates.gmailTokenExpiry = new Date(tokens.expiry_date);
      if (Object.keys(updates).length > 0) {
        await User.update(updates, { where: { id: user.id } });
      }
    });

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

    // Get filename from the message metadata
    const msgDetail = await gmail.users.messages.get({
      userId: 'me',
      id: req.params.messageId,
      format: 'metadata',
    });
    const attachments = extractAttachments(msgDetail.data.payload, req.params.messageId);
    const meta = attachments.find((a) => a.attachmentId === req.params.attachmentId);

    const buffer = Buffer.from(attachment.data.data, 'base64url');
    res.setHeader('Content-Type', meta?.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${meta?.filename || 'download'}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (error) {
    console.error('[PostMail API] Gmail attachment download error:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

/**
 * POST /api/gmail/disconnect
 * Removes stored Gmail tokens and marks mailbox as disconnected.
 */
router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Revoke token (best effort)
    if (user.gmailRefreshToken) {
      try {
        const client = createOAuth2Client();
        await client.revokeToken(user.gmailRefreshToken);
      } catch {
        // Revocation failure is non-critical
      }
    }

    // Clear tokens (users table is NOT RLS-protected)
    await user.update({
      gmailAccessToken: null,
      gmailRefreshToken: null,
      gmailTokenExpiry: null,
    });

    // Update user_settings (RLS-protected)
    await withRLS(req.user!.id, async (transaction) => {
      await UserSetting.update(
        {
          mailboxConnected: false,
          mailboxProvider: null,
          mailboxConnectedAt: null,
        },
        { where: { userId: req.user!.id }, transaction },
      );
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Gmail disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Gmail' });
  }
});

export default router;
