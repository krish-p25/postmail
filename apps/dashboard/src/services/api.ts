import { auth } from './auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3005';

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
};
