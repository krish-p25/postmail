import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { config } from '../config/env';
import { LinkedMailbox } from '../db/models';

const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_GRAPH_URL = 'https://graph.microsoft.com/v1.0';

export interface SentEmailMatch {
  found: boolean;
  messageId: string | null;
  sentAt?: Date;
  authError?: boolean;
}

/** Refresh Outlook access token on a LinkedMailbox. */
async function refreshOutlookToken(mailbox: LinkedMailbox): Promise<string | null> {
  if (!mailbox.refreshToken) return null;

  const tokenRes = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.microsoftClientId,
      client_secret: config.microsoftClientSecret,
      refresh_token: mailbox.refreshToken,
      grant_type: 'refresh_token',
      scope: 'offline_access Mail.Read User.Read',
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

/** Get a valid Outlook access token, refreshing if needed. */
async function getOutlookAccessToken(mailbox: LinkedMailbox): Promise<string | null> {
  let accessToken = mailbox.accessToken;
  if (!accessToken || (mailbox.tokenExpiry && mailbox.tokenExpiry.getTime() < Date.now())) {
    accessToken = await refreshOutlookToken(mailbox);
  }
  return accessToken || null;
}

/** Create an authenticated Gmail OAuth2 client for a mailbox. */
function createGmailClient(mailbox: LinkedMailbox) {
  const oauth2Client = new OAuth2Client(
    config.gmailClientId,
    config.gmailClientSecret,
    config.gmailRedirectUri,
  );
  oauth2Client.setCredentials({
    access_token: mailbox.accessToken,
    refresh_token: mailbox.refreshToken,
    expiry_date: mailbox.tokenExpiry?.getTime(),
  });

  oauth2Client.on('tokens', async (tokens) => {
    const updates: Record<string, unknown> = {};
    if (tokens.access_token) updates.accessToken = tokens.access_token;
    if (tokens.expiry_date) updates.tokenExpiry = new Date(tokens.expiry_date);
    if (Object.keys(updates).length) {
      await LinkedMailbox.update(updates, { where: { id: mailbox.id } });
    }
  });

  return oauth2Client;
}

/**
 * Sanitise a subject string for use inside a Gmail `subject:(…)` search operator.
 * Strips characters that Gmail treats as query operators so the search doesn't
 * silently return 0 results.
 */
function sanitizeSubjectForSearch(subject: string): string {
  // Remove Gmail operator chars: < > ( ) { } [ ] " | \ ~ * ?
  let cleaned = subject.replace(/[<>(){}[\]"|\\~*?]/g, ' ');
  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

/**
 * Recursively extract all decoded text from a Gmail message payload.
 * Handles nested multipart MIME structures and base64-encoded body parts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBodyText(payload: any): string {
  const parts: string[] = [];

  function walk(part: typeof payload): void {
    if (!part) return;
    if (part.body?.data) {
      try {
        parts.push(Buffer.from(part.body.data, 'base64url').toString('utf-8'));
      } catch {
        // Ignore decode errors
      }
    }
    if (part.parts) {
      for (const sub of part.parts) walk(sub);
    }
  }
  walk(payload);
  return parts.join('\n');
}

/**
 * Search Gmail sent folder messages for one containing the tracking token.
 * Uses format: 'full' so Gmail decodes MIME parts for us, then searches
 * the decoded body text for the token.
 */
async function scanMessagesForToken(
  gmail: ReturnType<typeof google.gmail>,
  messageIds: { id?: string | null }[],
  trackingToken: string,
): Promise<SentEmailMatch> {
  for (const msg of messageIds) {
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'full',
    });

    const bodyText = extractBodyText(full.data.payload);
    if (bodyText.includes(trackingToken)) {
      const sentAt = full.data.internalDate
        ? new Date(Number(full.data.internalDate))
        : undefined;
      return { found: true, messageId: msg.id!, sentAt };
    }
  }
  return { found: false, messageId: null };
}

/**
 * Search a Gmail sent folder for an email containing the given tracking token.
 * Optionally narrow the search with a subject and time window.
 * Falls back to a broader (no-subject) search if the subject-filtered search
 * returns zero candidates.
 */
export async function searchGmailSentFolder(
  mailbox: LinkedMailbox,
  trackingToken: string,
  options?: { subject?: string; newerThan?: string },
): Promise<SentEmailMatch> {
  const oauth2Client = createGmailClient(mailbox);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client as any });

  const newerThan = options?.newerThan || '1d';
  const subject = options?.subject;

  try {
    // First attempt: search with sanitized subject (if provided)
    if (subject) {
      const safeSubject = sanitizeSubjectForSearch(subject);
      const q = `in:sent subject:(${safeSubject}) newer_than:${newerThan}`;
      const searchRes = await gmail.users.messages.list({
        userId: 'me',
        q,
        maxResults: 15,
      });

      const messages = searchRes.data.messages || [];
      if (messages.length > 0) {
        const result = await scanMessagesForToken(gmail, messages, trackingToken);
        if (result.found) return result;
      }
    }

    // Fallback: broader search without subject filter
    const fallbackQ = `in:sent newer_than:${newerThan}`;
    const fallbackRes = await gmail.users.messages.list({
      userId: 'me',
      q: fallbackQ,
      maxResults: 25,
    });

    const fallbackMessages = fallbackRes.data.messages || [];
    if (fallbackMessages.length === 0) {
      return { found: false, messageId: null };
    }

    return scanMessagesForToken(gmail, fallbackMessages, trackingToken);
  } catch (error) {
    console.error('[PostMail API] Gmail sent folder search failed:', error);
    return { found: false, messageId: null, authError: true };
  }
}

/**
 * Search an Outlook sent folder for an email containing the given tracking token.
 */
export async function searchOutlookSentFolder(
  mailbox: LinkedMailbox,
  trackingToken: string,
): Promise<SentEmailMatch> {
  const accessToken = await getOutlookAccessToken(mailbox);
  if (!accessToken) {
    return { found: false, messageId: null, authError: true };
  }

  const graphUrl = `${MS_GRAPH_URL}/me/mailFolders/SentItems/messages?$top=15&$orderby=sentDateTime desc&$select=id,body,sentDateTime`;

  let graphRes = await fetch(graphUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (graphRes.status === 401) {
    const refreshed = await refreshOutlookToken(mailbox);
    if (!refreshed) {
      return { found: false, messageId: null, authError: true };
    }
    graphRes = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${refreshed}` },
    });
  }

  if (!graphRes.ok) {
    console.error(`[PostMail API] Outlook sent folder search returned ${graphRes.status}`);
    return { found: false, messageId: null };
  }

  const data = await graphRes.json();

  for (const msg of (data.value || [])) {
    const bodyContent: string = msg.body?.content || '';
    if (bodyContent.includes(trackingToken)) {
      const sentAt = msg.sentDateTime ? new Date(msg.sentDateTime) : undefined;
      return { found: true, messageId: msg.id || null, sentAt };
    }
  }

  return { found: false, messageId: null };
}

/**
 * Search the appropriate sent folder based on mailbox provider.
 */
export async function searchSentFolder(
  mailbox: LinkedMailbox,
  trackingToken: string,
  options?: { subject?: string; newerThan?: string },
): Promise<SentEmailMatch> {
  if (mailbox.provider === 'outlook') {
    return searchOutlookSentFolder(mailbox, trackingToken);
  }
  return searchGmailSentFolder(mailbox, trackingToken, options);
}
