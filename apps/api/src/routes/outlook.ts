import { Router, Request, Response } from 'express';
import { config } from '../config/env';
import { LinkedMailbox } from '../db/models';
import { lookupTrackingByMessageIds } from '../services/tracking-lookup';
import { resolvePendingEmails } from '../services/resolve-pending';

const router = Router();

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_GRAPH_URL = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'offline_access Mail.Read User.Read';

/**
 * Find the Outlook LinkedMailbox — by mailboxId if provided, otherwise first Outlook mailbox for the user.
 */
async function findOutlookMailbox(userId: string, mailboxId?: string): Promise<LinkedMailbox | null> {
  if (mailboxId) {
    return LinkedMailbox.findOne({
      where: { id: mailboxId, userId, provider: 'outlook' },
    });
  }
  return LinkedMailbox.findOne({
    where: { userId, provider: 'outlook' },
    order: [['createdAt', 'ASC']],
  });
}

/**
 * Refresh the access token using the stored refresh token on a LinkedMailbox.
 */
async function refreshAccessToken(mailbox: LinkedMailbox): Promise<string | null> {
  if (!mailbox.refreshToken) return null;

  const tokenRes = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.microsoftClientId,
      client_secret: config.microsoftClientSecret,
      refresh_token: mailbox.refreshToken,
      grant_type: 'refresh_token',
      scope: SCOPES,
    }),
  });

  if (!tokenRes.ok) return null;

  const tokens = await tokenRes.json();

  await mailbox.update({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || mailbox.refreshToken,
    tokenExpiry: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null,
  });

  return tokens.access_token;
}

/**
 * Get a valid access token for a LinkedMailbox, refreshing if needed.
 */
async function getAccessToken(mailbox: LinkedMailbox): Promise<string | null> {
  let accessToken = mailbox.accessToken;
  if (!accessToken || (mailbox.tokenExpiry && mailbox.tokenExpiry.getTime() < Date.now())) {
    accessToken = await refreshAccessToken(mailbox);
  }
  return accessToken || null;
}

/**
 * GET /api/outlook/connect
 * Returns the Microsoft OAuth consent URL.
 */
router.get('/connect', async (_req: Request, res: Response) => {
  try {
    // Use the same redirect URI as sign-in (/microsoft/callback) with state=connect-mailbox
    // so only one redirect URI needs to be registered in Azure.
    const redirectUri = config.dashboardUrl + '/microsoft/callback';
    const params = new URLSearchParams({
      client_id: config.microsoftClientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPES,
      response_mode: 'query',
      prompt: 'consent',
      state: 'connect-mailbox',
    });
    res.json({ url: `${MS_AUTH_URL}?${params.toString()}` });
  } catch (error) {
    console.error('[PostMail API] Outlook connect error:', error);
    res.status(500).json({ error: 'Failed to generate Outlook auth URL' });
  }
});

/**
 * POST /api/outlook/callback
 * Body: { code }
 * Exchanges the authorization code for tokens and creates/updates a LinkedMailbox.
 */
router.post('/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    // Must match the redirect_uri used in /connect (the sign-in callback URL)
    const redirectUri = config.dashboardUrl + '/microsoft/callback';
    const tokenRes = await fetch(MS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.microsoftClientId,
        client_secret: config.microsoftClientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: SCOPES,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[PostMail API] Microsoft token exchange failed:', err);
      res.status(400).json({ error: 'Failed to exchange code for tokens' });
      return;
    }

    const tokens = await tokenRes.json();

    if (!tokens.access_token || !tokens.refresh_token) {
      res.status(400).json({ error: 'Failed to get tokens from Microsoft' });
      return;
    }

    // Fetch the Outlook email address
    let mailboxEmail: string | null = null;
    try {
      const profileRes = await fetch(`${MS_GRAPH_URL}/me?$select=mail,userPrincipalName`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        mailboxEmail = profile.mail || profile.userPrincipalName || null;
      }
    } catch (err) {
      console.error('[PostMail API] Failed to fetch Outlook profile email:', err);
    }

    if (!mailboxEmail) {
      res.status(400).json({ error: 'Could not determine Outlook email address' });
      return;
    }

    // Create or update LinkedMailbox
    const [mailbox, created] = await LinkedMailbox.findOrCreate({
      where: { userId: req.user!.id, email: mailboxEmail },
      defaults: {
        userId: req.user!.id,
        provider: 'outlook',
        email: mailboxEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
      },
    });

    if (!created) {
      await mailbox.update({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Outlook callback error:', error);
    res.status(500).json({ error: 'Failed to connect Outlook' });
  }
});

/**
 * GET /api/outlook/emails
 * Fetches sent emails from the user's Outlook via Microsoft Graph.
 * Accepts ?mailboxId= to scope to a specific mailbox.
 */
router.get('/emails', async (req: Request, res: Response) => {
  try {
    // Resolve any pending tracked emails before loading the list
    await resolvePendingEmails(req.user!.id);

    const mailbox = await findOutlookMailbox(req.user!.id, req.query.mailboxId as string | undefined);

    if (!mailbox || !mailbox.refreshToken) {
      res.status(400).json({ error: 'Outlook not connected' });
      return;
    }

    let accessToken = await getAccessToken(mailbox);
    if (!accessToken) {
      res.status(401).json({ error: 'Failed to refresh Outlook token. Please reconnect.' });
      return;
    }

    const pageSize = 25;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const skip = (page - 1) * pageSize;
    const searchQuery = (req.query.q as string) || '';

    const params = new URLSearchParams({
      $top: String(pageSize),
      $skip: String(skip),
      $select: 'id,subject,toRecipients,sentDateTime,hasAttachments',
    });
    if (searchQuery) {
      params.set('$search', `"${searchQuery}"`);
    } else {
      params.set('$orderby', 'sentDateTime desc');
    }

    const graphUrl = `${MS_GRAPH_URL}/me/mailFolders/SentItems/messages?${params.toString()}`;

    let graphRes = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!graphRes.ok) {
      if (graphRes.status === 401) {
        accessToken = await refreshAccessToken(mailbox);
        if (!accessToken) {
          res.status(401).json({ error: 'Outlook session expired. Please reconnect.' });
          return;
        }
        const retryRes = await fetch(graphUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!retryRes.ok) {
          res.status(500).json({ error: 'Failed to fetch Outlook emails' });
          return;
        }
        const retryData = await retryRes.json();
        const emails = formatMessages(retryData.value || []);
        const ids = emails.map((e) => e.id);
        const trackingMap = await lookupTrackingByMessageIds(ids, req.user!.id);
        const enriched = emails.map((e) => ({ ...e, tracking: trackingMap.get(e.id) || null }));
        res.json({ emails: enriched, page, hasMore: emails.length === pageSize });
        return;
      }
      res.status(500).json({ error: 'Failed to fetch Outlook emails' });
      return;
    }

    const data = await graphRes.json();
    const emails = formatMessages(data.value || []);
    const ids = emails.map((e) => e.id);
    const trackingMap = await lookupTrackingByMessageIds(ids, req.user!.id);
    const enriched = emails.map((e) => ({ ...e, tracking: trackingMap.get(e.id) || null }));
    res.json({ emails: enriched, page, hasMore: emails.length === pageSize });
  } catch (error) {
    console.error('[PostMail API] Outlook emails error:', error);
    res.status(500).json({ error: 'Failed to fetch Outlook emails' });
  }
});

interface GraphMessage {
  id: string;
  subject: string | null;
  toRecipients: Array<{
    emailAddress: { name?: string; address: string };
  }>;
  sentDateTime: string | null;
  hasAttachments?: boolean;
}

function formatMessages(messages: GraphMessage[]) {
  return messages.map((msg) => ({
    id: msg.id,
    subject: msg.subject || '(No subject)',
    recipients: msg.toRecipients.map((r) =>
      r.emailAddress.name
        ? `${r.emailAddress.name} <${r.emailAddress.address}>`
        : r.emailAddress.address,
    ),
    sentAt: msg.sentDateTime ? new Date(msg.sentDateTime).toISOString() : null,
    hasAttachments: msg.hasAttachments || false,
  }));
}

/**
 * GET /api/outlook/emails/:id
 * Fetches the full conversation thread for a specific email.
 * Accepts ?mailboxId= to scope to a specific mailbox.
 */
router.get('/emails/:id', async (req: Request, res: Response) => {
  try {
    const mailbox = await findOutlookMailbox(req.user!.id, req.query.mailboxId as string | undefined);

    if (!mailbox || !mailbox.refreshToken) {
      res.status(400).json({ error: 'Outlook not connected' });
      return;
    }

    let accessToken = await getAccessToken(mailbox);
    if (!accessToken) {
      res.status(401).json({ error: 'Failed to refresh Outlook token. Please reconnect.' });
      return;
    }

    // First get the message to find its conversationId
    const msgRes = await fetch(
      `${MS_GRAPH_URL}/me/messages/${req.params.id}?$select=id,conversationId,subject,from,toRecipients,ccRecipients,sentDateTime,body`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    let msgData = msgRes;
    if (!msgData.ok) {
      if (msgData.status === 401) {
        accessToken = await refreshAccessToken(mailbox);
        if (!accessToken) {
          res.status(401).json({ error: 'Outlook session expired. Please reconnect.' });
          return;
        }
        msgData = await fetch(
          `${MS_GRAPH_URL}/me/messages/${req.params.id}?$select=id,conversationId,subject,from,toRecipients,ccRecipients,sentDateTime,body`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!msgData.ok) {
          res.status(500).json({ error: 'Failed to fetch email details after token refresh' });
          return;
        }
      } else {
        res.status(500).json({ error: 'Failed to fetch email details' });
        return;
      }
    }

    const message = await msgData.json();
    const conversationId = message.conversationId;

    // Fetch all messages in the conversation
    const escapedConvId = conversationId?.replace(/'/g, "''") || '';
    const convParams = new URLSearchParams({
      $filter: `conversationId eq '${escapedConvId}'`,
      $select: 'id,subject,from,toRecipients,ccRecipients,sentDateTime,body,hasAttachments',
    });
    const convUrl = `${MS_GRAPH_URL}/me/messages?${convParams.toString()}`;

    let convRes = await fetch(convUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (convRes.status === 401) {
      accessToken = await refreshAccessToken(mailbox);
      if (accessToken) {
        convRes = await fetch(convUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
    }

    let convMessages: any[];
    if (!convRes.ok) {
      console.warn(`[PostMail API] Outlook conversation fetch failed (${convRes.status}), falling back to single message`);
      convMessages = [message];
    } else {
      const convData = await convRes.json();
      convMessages = convData.value || [message];
      convMessages.sort((a: any, b: any) =>
        new Date(a.sentDateTime || 0).getTime() - new Date(b.sentDateTime || 0).getTime(),
      );
    }

    const messages = await Promise.all(convMessages.map(async (msg: {
      id: string;
      subject: string | null;
      from: { emailAddress: { name?: string; address: string } };
      toRecipients: Array<{ emailAddress: { name?: string; address: string } }>;
      ccRecipients: Array<{ emailAddress: { name?: string; address: string } }>;
      sentDateTime: string | null;
      body: { contentType: string; content: string };
      hasAttachments?: boolean;
    }) => {
      let bodyContent = msg.body?.content || '';

      if (msg.body?.contentType === 'html') {
        bodyContent = bodyContent.replace(/<div[^>]*id="appendonsend"[^>]*>[\s\S]*$/i, '');
        bodyContent = bodyContent.replace(/<hr[^>]*>\s*<div[^>]*id="divRplyFwdMsg"[^>]*>[\s\S]*$/i, '');
        bodyContent = bodyContent.replace(/<div[^>]*style="[^"]*border-top:\s*solid[^"]*"[^>]*>[\s\S]*$/i, '');
        bodyContent = bodyContent.replace(/<div[^>]*>-{5,}\s*Forwarded message\s*-{5,}[\s\S]*$/i, '');
        bodyContent = bodyContent.replace(/<blockquote[^>]*(?:type="cite"|style="[^"]*border-left[^"]*")[^>]*>[\s\S]*$/i, '');
        bodyContent = bodyContent.replace(/<p[^>]*>\s*<b>From:<\/b>[\s\S]*$/i, '');
        bodyContent = bodyContent.replace(/<div[^>]*>\s*<b>From:<\/b>[\s\S]*$/i, '');
      }

      let attachments: Array<{ attachmentId: string; messageId: string; filename: string; mimeType: string; size: number }> = [];
      if (msg.hasAttachments) {
        try {
          const attRes = await fetch(
            `${MS_GRAPH_URL}/me/messages/${msg.id}/attachments?$select=id,name,contentType,size`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (attRes.ok) {
            const attData = await attRes.json();
            attachments = (attData.value || [])
              .filter((a: { '@odata.type': string }) => a['@odata.type'] === '#microsoft.graph.fileAttachment')
              .map((a: { id: string; name: string; contentType: string; size: number }) => ({
                attachmentId: a.id,
                messageId: msg.id,
                filename: a.name,
                mimeType: a.contentType || 'application/octet-stream',
                size: a.size || 0,
              }));
          }
        } catch {
          // Non-critical
        }
      }

      return {
        id: msg.id,
        threadId: conversationId,
        subject: msg.subject || '(No subject)',
        from: msg.from?.emailAddress
          ? (msg.from.emailAddress.name
            ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>`
            : msg.from.emailAddress.address)
          : '',
        to: msg.toRecipients?.map((r) =>
          r.emailAddress.name
            ? `${r.emailAddress.name} <${r.emailAddress.address}>`
            : r.emailAddress.address,
        ).join(', ') || '',
        cc: msg.ccRecipients?.length
          ? msg.ccRecipients.map((r) =>
            r.emailAddress.name
              ? `${r.emailAddress.name} <${r.emailAddress.address}>`
              : r.emailAddress.address,
          ).join(', ')
          : null,
        date: msg.sentDateTime ? new Date(msg.sentDateTime).toISOString() : null,
        body: bodyContent,
        snippet: '',
        attachments,
      };
    }));

    res.json({ messages });
  } catch (error) {
    console.error('[PostMail API] Outlook email detail error:', error);
    res.status(500).json({ error: 'Failed to fetch email details' });
  }
});

/**
 * GET /api/outlook/emails/:messageId/attachments/:attachmentId
 * Downloads a specific attachment.
 * Accepts ?mailboxId= to scope to a specific mailbox.
 */
router.get('/emails/:messageId/attachments/:attachmentId', async (req: Request, res: Response) => {
  try {
    const mailbox = await findOutlookMailbox(req.user!.id, req.query.mailboxId as string | undefined);

    if (!mailbox || !mailbox.refreshToken) {
      res.status(400).json({ error: 'Outlook not connected' });
      return;
    }

    let accessToken = await getAccessToken(mailbox);
    if (!accessToken) {
      res.status(401).json({ error: 'Failed to refresh Outlook token.' });
      return;
    }

    const attRes = await fetch(
      `${MS_GRAPH_URL}/me/messages/${req.params.messageId}/attachments/${req.params.attachmentId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!attRes.ok) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    const attData = await attRes.json();
    const buffer = Buffer.from(attData.contentBytes, 'base64');
    res.setHeader('Content-Type', attData.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${attData.name || 'download'}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (error) {
    console.error('[PostMail API] Outlook attachment download error:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

/**
 * POST /api/outlook/disconnect
 * Removes all Outlook LinkedMailboxes for this user.
 * Kept for backward compatibility — prefer DELETE /api/mailboxes/:id.
 */
router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const mailboxes = await LinkedMailbox.findAll({
      where: { userId: req.user!.id, provider: 'outlook' },
    });

    for (const mailbox of mailboxes) {
      await mailbox.destroy();
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Outlook disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Outlook' });
  }
});

export default router;
