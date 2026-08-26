import { auth } from './auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3005';

export interface EmailAttachment {
  attachmentId: string;
  messageId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  cc: string | null;
  date: string | null;
  body: string;
  snippet: string;
  attachments: EmailAttachment[];
}

/**
 * Authenticated API client.
 * Attaches the stored JWT as a Bearer token.
 */
async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = auth.getToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
}

export const api = {
  async getMe() {
    const res = await authFetch('/api/me');
    if (!res.ok) throw new Error('Failed to fetch profile');
    return res.json();
  },

  async getEmails() {
    const res = await authFetch('/api/emails');
    if (!res.ok) throw new Error('Failed to fetch emails');
    return res.json();
  },

  async getEmail(id: string) {
    const res = await authFetch(`/api/emails/${id}`);
    if (!res.ok) throw new Error('Failed to fetch email');
    return res.json();
  },

  async getSettings() {
    const res = await authFetch('/api/settings');
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  async updateSettings(data: { discordWebhookUrl?: string | null }) {
    const res = await authFetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
  },

  async getGmailConnectUrl() {
    const res = await authFetch('/api/gmail/connect');
    if (!res.ok) throw new Error('Failed to get Gmail connect URL');
    return res.json() as Promise<{ url: string }>;
  },

  async gmailCallback(code: string) {
    const res = await authFetch('/api/gmail/callback', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error('Failed to connect Gmail');
    return res.json();
  },

  async getGmailEmails(pageToken?: string, q?: string) {
    const searchParams = new URLSearchParams();
    if (pageToken) searchParams.set('pageToken', pageToken);
    if (q) searchParams.set('q', q);
    const qs = searchParams.toString();
    const res = await authFetch(`/api/gmail/emails${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw new Error('Failed to fetch Gmail emails');
    return res.json() as Promise<{
      emails: Array<{
        id: string;
        subject: string;
        recipients: string[];
        sentAt: string | null;
        tracked: boolean;
        hasAttachments: boolean;
      }>;
      nextPageToken: string | null;
    }>;
  },

  async getGmailEmailDetail(id: string) {
    const res = await authFetch(`/api/gmail/emails/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Failed to fetch email details');
    return res.json() as Promise<{ messages: EmailMessage[] }>;
  },

  async disconnectGmail() {
    const res = await authFetch('/api/gmail/disconnect', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to disconnect Gmail');
    return res.json();
  },

  async getOutlookConnectUrl() {
    const res = await authFetch('/api/outlook/connect');
    if (!res.ok) throw new Error('Failed to get Outlook connect URL');
    return res.json() as Promise<{ url: string }>;
  },

  async outlookCallback(code: string) {
    const res = await authFetch('/api/outlook/callback', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error('Failed to connect Outlook');
    return res.json();
  },

  async getOutlookEmails(page?: number, q?: string) {
    const searchParams = new URLSearchParams();
    if (page && page > 1) searchParams.set('page', String(page));
    if (q) searchParams.set('q', q);
    const qs = searchParams.toString();
    const res = await authFetch(`/api/outlook/emails${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw new Error('Failed to fetch Outlook emails');
    return res.json() as Promise<{
      emails: Array<{
        id: string;
        subject: string;
        recipients: string[];
        sentAt: string | null;
        tracked: boolean;
        hasAttachments: boolean;
      }>;
      page: number;
      hasMore: boolean;
    }>;
  },

  async getOutlookEmailDetail(id: string) {
    const res = await authFetch(`/api/outlook/emails/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Failed to fetch email details');
    return res.json() as Promise<{ messages: EmailMessage[] }>;
  },

  async disconnectOutlook() {
    const res = await authFetch('/api/outlook/disconnect', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to disconnect Outlook');
    return res.json();
  },

  async getTrackedEmails() {
    const res = await authFetch('/api/emails');
    if (!res.ok) throw new Error('Failed to fetch tracked emails');
    return res.json() as Promise<{
      emails: Array<{
        id: string;
        trackingToken: string;
        recipient: string | null;
        subject: string | null;
        status: 'pending' | 'sent' | 'discarded' | 'failed';
        sentAt: string | null;
        createdAt: string;
        opens: Array<{
          id: string;
          opened_at: string;
          user_agent: string | null;
          ip_address: string | null;
        }>;
      }>;
    }>;
  },

  async getTrackedEmail(id: string) {
    const res = await authFetch(`/api/emails/${id}`);
    if (!res.ok) throw new Error('Failed to fetch tracked email');
    return res.json() as Promise<{
      email: {
        id: string;
        trackingToken: string;
        recipient: string | null;
        subject: string | null;
        status: 'pending' | 'sent' | 'discarded' | 'failed';
        sentAt: string | null;
        createdAt: string;
        opens: Array<{
          id: string;
          opened_at: string;
          user_agent: string | null;
          ip_address: string | null;
        }>;
      };
    }>;
  },
};
