import { getApiToken } from './storage';

const API_URL = 'https://api.postmail.krishrp.xyz';

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getApiToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${API_URL}${path}`, { ...options, headers });
}

export type PreflightReason = 'no_token' | 'token_invalid' | 'server_unreachable' | 'server_error';

export interface PreflightResult {
  ok: boolean;
  reason?: PreflightReason;
  detail?: string;
}

export async function checkAuth(): Promise<PreflightResult> {
  const token = await getApiToken();

  if (!token) {
    return { ok: false, reason: 'no_token' };
  }

  let res: Response;
  try {
    res = await authFetch('/track/preflight');
  } catch {
    return { ok: false, reason: 'server_unreachable' };
  }

  if (res.status === 401) {
    return { ok: false, reason: 'token_invalid' };
  }

  if (!res.ok) {
    return { ok: false, reason: 'server_error', detail: `Server returned ${res.status}` };
  }

  return { ok: true };
}

export async function registerTrackedEmail(
  trackingToken: string,
  recipients: string[],
  subject: string,
  senderEmail: string | null,
  provider: string,
): Promise<{ id: string; trackingToken: string; status: string; authError?: boolean }> {
  const res = await authFetch('/track/register', {
    method: 'POST',
    body: JSON.stringify({ trackingToken, recipients, subject, senderEmail, provider }),
  });
  if (res.status === 401) {
    return { id: '', trackingToken, status: 'failed', authError: true };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to register tracked email: ${res.status} ${text}`);
  }
  return res.json();
}

export async function confirmEmailSent(
  trackingToken: string,
): Promise<{ success: boolean }> {
  const res = await authFetch('/track/confirm-sent', {
    method: 'POST',
    body: JSON.stringify({ trackingToken }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to confirm sent: ${res.status} ${text}`);
  }
  return res.json();
}

export async function updateTrackedEmail(
  trackingToken: string,
  recipients: string[],
  subject: string,
  senderEmail: string | null,
  provider: string,
): Promise<{ success: boolean }> {
  const res = await authFetch('/track/update', {
    method: 'POST',
    body: JSON.stringify({ trackingToken, recipients, subject, senderEmail, provider }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update tracked email: ${res.status} ${text}`);
  }
  return res.json();
}

export async function discardTrackedEmail(
  trackingToken: string,
): Promise<{ success: boolean }> {
  const res = await authFetch('/track/discard', {
    method: 'POST',
    body: JSON.stringify({ trackingToken }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to discard: ${res.status} ${text}`);
  }
  return res.json();
}

export async function verifyEmailSent(
  trackingToken: string,
  senderEmail: string | null,
  provider: string,
): Promise<{ found: boolean; authError?: boolean }> {
  const res = await authFetch('/track/verify-sent', {
    method: 'POST',
    body: JSON.stringify({ trackingToken, senderEmail, provider }),
  });
  if (res.status === 401) {
    return { found: false, authError: true };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to verify: ${res.status} ${text}`);
  }
  return res.json();
}
