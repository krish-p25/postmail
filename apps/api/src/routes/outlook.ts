import { Router, Request, Response } from 'express';
import { config } from '../config/env';
import User from '../db/models/User';
import { UserSetting } from '../db/models';
import { withRLS } from '../middleware/rls';

const router = Router();

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_GRAPH_URL = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'offline_access Mail.Read User.Read';

/**
 * GET /api/outlook/connect
 * Returns the Microsoft OAuth consent URL.
 */
router.get('/connect', async (_req: Request, res: Response) => {
  try {
    const params = new URLSearchParams({
      client_id: config.microsoftClientId,
      response_type: 'code',
      redirect_uri: config.microsoftRedirectUri,
      scope: SCOPES,
      response_mode: 'query',
      prompt: 'consent',
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
 * Exchanges the authorization code for tokens and stores them.
 */
router.post('/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    // Exchange code for tokens
    const tokenRes = await fetch(MS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.microsoftClientId,
        client_secret: config.microsoftClientSecret,
        code,
        redirect_uri: config.microsoftRedirectUri,
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

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await user.update({
      outlookAccessToken: tokens.access_token,
      outlookRefreshToken: tokens.refresh_token,
      outlookTokenExpiry: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
    });

    await withRLS(req.user!.id, async (transaction) => {
      await UserSetting.update(
        {
          mailboxConnected: true,
          mailboxProvider: 'outlook',
          mailboxConnectedAt: new Date(),
        },
        { where: { userId: req.user!.id }, transaction },
      );
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[PostMail API] Outlook callback error:', error);
    res.status(500).json({ error: 'Failed to connect Outlook' });
  }
});

/**
 * Refresh the access token using the stored refresh token.
 * Returns the new access token or null on failure.
 */
async function refreshAccessToken(user: User): Promise<string | null> {
  if (!user.outlookRefreshToken) return null;

  const tokenRes = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.microsoftClientId,
      client_secret: config.microsoftClientSecret,
      refresh_token: user.outlookRefreshToken,
      grant_type: 'refresh_token',
      scope: SCOPES,
    }),
  });

  if (!tokenRes.ok) return null;

  const tokens = await tokenRes.json();

  await user.update({
    outlookAccessToken: tokens.access_token,
    outlookRefreshToken: tokens.refresh_token || user.outlookRefreshToken,
    outlookTokenExpiry: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null,
  });

  return tokens.access_token;
}

/**
 * GET /api/outlook/emails
 * Fetches sent emails from the user's Outlook via Microsoft Graph.
 */
router.get('/emails', async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.user!.id);

    if (!user || !user.outlookRefreshToken) {
      res.status(400).json({ error: 'Outlook not connected' });
      return;
    }

    // Refresh token if expired
    let accessToken = user.outlookAccessToken;
    if (!accessToken || (user.outlookTokenExpiry && user.outlookTokenExpiry.getTime() < Date.now())) {
      accessToken = await refreshAccessToken(user);
      if (!accessToken) {
        res.status(401).json({ error: 'Failed to refresh Outlook token. Please reconnect.' });
        return;
      }
    }

    // Fetch sent emails from Microsoft Graph
    const graphRes = await fetch(
      `${MS_GRAPH_URL}/me/mailFolders/SentItems/messages?$top=50&$select=id,subject,toRecipients,sentDateTime&$orderby=sentDateTime desc`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!graphRes.ok) {
      // If 401, try refresh once
      if (graphRes.status === 401) {
        accessToken = await refreshAccessToken(user);
        if (!accessToken) {
          res.status(401).json({ error: 'Outlook session expired. Please reconnect.' });
          return;
        }
        const retryRes = await fetch(
          `${MS_GRAPH_URL}/me/mailFolders/SentItems/messages?$top=50&$select=id,subject,toRecipients,sentDateTime&$orderby=sentDateTime desc`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (!retryRes.ok) {
          res.status(500).json({ error: 'Failed to fetch Outlook emails' });
          return;
        }
        const retryData = await retryRes.json();
        res.json({ emails: formatMessages(retryData.value || []) });
        return;
      }
      res.status(500).json({ error: 'Failed to fetch Outlook emails' });
      return;
    }

    const data = await graphRes.json();
    res.json({ emails: formatMessages(data.value || []) });
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
    tracked: false,
  }));
}

/**
 * GET /api/outlook/emails/:id
 * Fetches the full conversation thread for a specific email.
 */
router.get('/emails/:id', async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.user!.id);

    if (!user || !user.outlookRefreshToken) {
      res.status(400).json({ error: 'Outlook not connected' });
      return;
    }

    let accessToken = user.outlookAccessToken;
    if (!accessToken || (user.outlookTokenExpiry && user.outlookTokenExpiry.getTime() < Date.now())) {
      accessToken = await refreshAccessToken(user);
      if (!accessToken) {
        res.status(401).json({ error: 'Failed to refresh Outlook token. Please reconnect.' });
        return;
      }
    }

    // First get the message to find its conversationId
    const msgRes = await fetch(
      `${MS_GRAPH_URL}/me/messages/${req.params.id}?$select=id,conversationId,subject,from,toRecipients,ccRecipients,sentDateTime,body`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!msgRes.ok) {
      if (msgRes.status === 401) {
        accessToken = await refreshAccessToken(user);
        if (!accessToken) {
          res.status(401).json({ error: 'Outlook session expired. Please reconnect.' });
          return;
        }
      } else {
        res.status(500).json({ error: 'Failed to fetch email details' });
        return;
      }
    }

    const message = await msgRes.json();
    const conversationId = message.conversationId;

    // Fetch all messages in the conversation
    const convRes = await fetch(
      `${MS_GRAPH_URL}/me/messages?$filter=conversationId eq '${conversationId}'&$select=id,subject,from,toRecipients,ccRecipients,sentDateTime,body&$orderby=sentDateTime asc`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!convRes.ok) {
      res.status(500).json({ error: 'Failed to fetch conversation' });
      return;
    }

    const convData = await convRes.json();
    const messages = (convData.value || []).map((msg: {
      id: string;
      subject: string | null;
      from: { emailAddress: { name?: string; address: string } };
      toRecipients: Array<{ emailAddress: { name?: string; address: string } }>;
      ccRecipients: Array<{ emailAddress: { name?: string; address: string } }>;
      sentDateTime: string | null;
      body: { contentType: string; content: string };
    }) => {
      let bodyContent = msg.body?.content || '';

      // Strip Outlook quoted replies
      if (msg.body?.contentType === 'html') {
        // Outlook uses <div id="appendonsend"> to mark the boundary
        bodyContent = bodyContent.replace(/<div[^>]*id="appendonsend"[^>]*>[\s\S]*$/i, '');
        // <hr> followed by "From:" reply headers
        bodyContent = bodyContent.replace(/<hr[^>]*>\s*<div[^>]*id="divRplyFwdMsg"[^>]*>[\s\S]*$/i, '');
        // border-top separator used in reply chains
        bodyContent = bodyContent.replace(/<div[^>]*style="[^"]*border-top:\s*solid[^"]*"[^>]*>[\s\S]*$/i, '');
        // Forwarded message marker
        bodyContent = bodyContent.replace(/<div[^>]*>-{5,}\s*Forwarded message\s*-{5,}[\s\S]*$/i, '');
        // Outlook blockquote with cite
        bodyContent = bodyContent.replace(/<blockquote[^>]*(?:type="cite"|style="[^"]*border-left[^"]*")[^>]*>[\s\S]*$/i, '');
        // "From: ... Sent: ... To: ... Subject: ..." header block (plain-style quoting)
        bodyContent = bodyContent.replace(/<p[^>]*>\s*<b>From:<\/b>[\s\S]*$/i, '');
        bodyContent = bodyContent.replace(/<div[^>]*>\s*<b>From:<\/b>[\s\S]*$/i, '');
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
      };
    });

    res.json({ messages });
  } catch (error) {
    console.error('[PostMail API] Outlook email detail error:', error);
    res.status(500).json({ error: 'Failed to fetch email details' });
  }
});

/**
 * POST /api/outlook/disconnect
 * Removes stored Outlook tokens and marks mailbox as disconnected.
 */
router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await user.update({
      outlookAccessToken: null,
      outlookRefreshToken: null,
      outlookTokenExpiry: null,
    });

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
    console.error('[PostMail API] Outlook disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Outlook' });
  }
});

export default router;
