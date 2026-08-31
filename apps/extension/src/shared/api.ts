import { getApiToken } from './storage';

const API_URL = 'https://postmail.krishrp.xyz';

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getApiToken();
  console.log(`[PostMail][API] ${options.method || 'GET'} ${path} | token=${token ? 'present' : 'MISSING'}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  console.log(`[PostMail][API] ${options.method || 'GET'} ${path} → ${res.status}`);
  return res;
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
    return { ok: false, reason: 'no_token', detail: 'No JWT found in extension storage. Visit the PostMail dashboard while logged in to sync your session.' };
  }

  let res: Response;
  try {
    res = await authFetch('/api/track/preflight');
  } catch (err) {
    return { ok: false, reason: 'server_unreachable', detail: `Could not reach API server at ${API_URL}. Is it running?` };
  }

  if (res.status === 401) {
    return { ok: false, reason: 'token_invalid', detail: 'JWT was rejected by the server. Try logging out and back in on the dashboard.' };
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
): Promise<{ id: string; trackingToken: string; status: string; authError?: boolean }> {
  const res = await authFetch('/api/track/register', {
    method: 'POST',
    body: JSON.stringify({ trackingToken, recipients, subject }),
  });
  if (res.status === 401) {
    console.error(`[PostMail][API] Register: 401 — token missing or invalid`);
    return { id: '', trackingToken, status: 'failed', authError: true };
  }
  if (!res.ok) {
    const text = await res.text();
    console.error(`[PostMail][API] Register failed: ${res.status} ${text}`);
    throw new Error(`Failed to register tracked email: ${res.status}`);
  }
  return res.json();
}

export async function confirmEmailSent(
  trackingToken: string,
): Promise<{ success: boolean }> {
  const res = await authFetch('/api/track/confirm-sent', {
    method: 'POST',
    body: JSON.stringify({ trackingToken }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[PostMail][API] Confirm-sent failed: ${res.status} ${text}`);
    throw new Error(`Failed to confirm sent: ${res.status}`);
  }
  return res.json();
}

export async function updateTrackedEmail(
  trackingToken: string,
  recipients: string[],
  subject: string,
): Promise<{ success: boolean }> {
  const res = await authFetch('/api/track/update', {
    method: 'POST',
    body: JSON.stringify({ trackingToken, recipients, subject }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[PostMail][API] Update failed: ${res.status} ${text}`);
    throw new Error(`Failed to update tracked email: ${res.status}`);
  }
  return res.json();
}

export async function discardTrackedEmail(
  trackingToken: string,
): Promise<{ success: boolean }> {
  const res = await authFetch('/api/track/discard', {
    method: 'POST',
    body: JSON.stringify({ trackingToken }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[PostMail][API] Discard failed: ${res.status} ${text}`);
    throw new Error(`Failed to discard: ${res.status}`);
  }
  return res.json();
}

export async function verifyEmailSent(
  trackingToken: string,
): Promise<{ found: boolean; authError?: boolean }> {
  const res = await authFetch('/api/track/verify-sent', {
    method: 'POST',
    body: JSON.stringify({ trackingToken }),
  });
  if (res.status === 401) {
    console.error(`[PostMail][API] Verify-sent: 401 — token missing or invalid`);
    return { found: false, authError: true };
  }
  if (!res.ok) {
    const text = await res.text();
    console.error(`[PostMail][API] Verify-sent failed: ${res.status} ${text}`);
    throw new Error(`Failed to verify: ${res.status}`);
  }
  return res.json();
}
