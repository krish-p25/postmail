import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Authenticated API client.
 * Automatically attaches the Supabase JWT as a Bearer token.
 */
async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (session?.access_token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${session.access_token}`;
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
