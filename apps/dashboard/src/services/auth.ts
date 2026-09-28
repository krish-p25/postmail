const API_URL = import.meta.env.VITE_API_URL || 'https://postmail.krishrp.xyz/api';
const TOKEN_KEY = 'postmail_token';

/**
 * CSRF protection for the two sign-in flows (Google/Microsoft), where no
 * session exists yet to bind a server-issued state to (contrast with the
 * mailbox-connect flows' services/oauth-state.ts on the API). Without this,
 * an attacker can start their own sign-in, capture the resulting `code`, and
 * hand the callback URL to a victim — whose browser would complete it as if
 * it were their own login. See docs/security-review.md #6.
 *
 * sessionStorage survives the redirect to the provider and back, since it's
 * scoped to the tab + origin, not to any single page load.
 */
const OAUTH_NONCE_KEY = 'postmail_oauth_nonce';
const OAUTH_NEXT_KEY = 'postmail_oauth_next';

function startOAuthNonce(next?: string | null): string {
  const nonce = crypto.randomUUID();
  sessionStorage.setItem(OAUTH_NONCE_KEY, nonce);
  if (next) sessionStorage.setItem(OAUTH_NEXT_KEY, next);
  else sessionStorage.removeItem(OAUTH_NEXT_KEY);
  return nonce;
}

/**
 * Single-use: always clears the stored nonce/next, whether or not `returnedState`
 * matches, so a callback URL can never be replayed. `valid: false` means the code
 * must never be exchanged — this browser never issued that nonce.
 */
function consumeOAuthNonce(returnedState: string | null): { valid: boolean; next: string | null } {
  const expected = sessionStorage.getItem(OAUTH_NONCE_KEY);
  const next = sessionStorage.getItem(OAUTH_NEXT_KEY);
  sessionStorage.removeItem(OAUTH_NONCE_KEY);
  sessionStorage.removeItem(OAUTH_NEXT_KEY);
  const valid = !!expected && !!returnedState && returnedState === expected;
  return { valid, next: valid ? next : null };
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthResponse {
  token: string;
  /** Long-lived, for the extension only — see syncExtensionToken below. */
  extensionToken: string;
  user: AuthUser;
}

/** A pending emailed code. */
export interface CodeChallenge {
  challengeId: string;
  email: string;
}

/** API error with the server's machine-readable code (e.g. ACCOUNT_EXISTS, incorrect_code). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function postJson<T>(path: string, body: unknown, fallbackError: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin', // sends the pm_device cookie on /auth routes
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || fallbackError, res.status, data.code);
  return data as T;
}

function signIn(data: AuthResponse): AuthResponse {
  auth.storeToken(data.token);
  auth.syncExtensionToken(data.extensionToken);
  return data;
}

export const auth = {
  async register(email: string, password: string): Promise<CodeChallenge> {
    const data = await postJson<CodeChallenge>('/auth/register', { email, password }, 'Registration failed');
    return { challengeId: data.challengeId, email: data.email };
  },

  /** Confirm a sign-up, Google-link or Microsoft-link code. */
  async verifyEmail(challengeId: string, code: string): Promise<AuthResponse> {
    return signIn(await postJson<AuthResponse>('/auth/verify', { challengeId, code }, 'Verification failed'));
  },

  async resendCode(challengeId: string): Promise<void> {
    await postJson(`/auth/challenges/${encodeURIComponent(challengeId)}/resend`, {}, 'Could not resend the code');
  },

  async login(email: string, password: string): Promise<AuthResponse | ({ requiresCode: true } & CodeChallenge)> {
    const data = await postJson<AuthResponse | ({ requiresCode: true } & CodeChallenge)>(
      '/auth/login',
      { email, password },
      'Sign in failed',
    );
    return 'requiresCode' in data ? data : signIn(data);
  },

  async confirmLogin(challengeId: string, code: string, rememberDevice: boolean): Promise<AuthResponse> {
    return signIn(await postJson<AuthResponse>('/auth/login/confirm', { challengeId, code, rememberDevice }, 'Verification failed'));
  },

  async requestPasswordReset(email: string): Promise<CodeChallenge> {
    const data = await postJson<{ challengeId: string }>('/auth/password-reset/request', { email }, 'Could not start password reset');
    return { challengeId: data.challengeId, email };
  },

  /** Confirms the emailed code and returns a ticket authorising one password write. */
  async verifyPasswordReset(challengeId: string, code: string): Promise<string> {
    const data = await postJson<{ ticket: string }>('/auth/password-reset/verify', { challengeId, code }, 'Verification failed');
    return data.ticket;
  },

  async applyPasswordReset(ticket: string, newPassword: string): Promise<AuthResponse> {
    return signIn(await postJson<AuthResponse>('/auth/password-reset/apply', { ticket, newPassword }, 'Password reset failed'));
  },

  async googleLogin(code: string): Promise<AuthResponse | { requiresPassword: true; email: string; linkId: string }> {
    const data = await postJson<AuthResponse | { requiresPassword: true; email: string; linkId: string }>(
      '/auth/google',
      { code },
      'Google sign-in failed',
    );
    return 'requiresPassword' in data ? data : signIn(data);
  },

  /**
   * linkId references the idToken from googleLogin()'s response on the server
   * (see api/src/services/account-links.ts) — the token itself never reaches
   * this client.
   */
  async googleLink(linkId: string, password: string): Promise<CodeChallenge> {
    const data = await postJson<CodeChallenge>('/auth/google/link', { linkId, password }, 'Failed to link Google account');
    return { challengeId: data.challengeId, email: data.email };
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  },

  /**
   * Replace the dashboard's own access token. Only ever localStorage now — see
   * syncExtensionToken for what the extension gets, and why it's different.
   */
  storeToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },

  /**
   * Hand the extension its own, separate long-lived token over a DOM event —
   * never through localStorage, which page JavaScript (including an XSS) can
   * read. chrome.storage.local, where the content script persists this, is not
   * readable from the page at all. Call only at actual login/logout; the
   * extension's own storage already persists across dashboard page reloads,
   * so there's nothing to re-send on mere mount. See docs/security-review.md #8e.
   */
  syncExtensionToken(token: string | null): void {
    document.dispatchEvent(new CustomEvent('postmail-token-sync', { detail: token }));
  },

  /**
   * Silently renew the access token using the httpOnly refresh cookie — no
   * JavaScript, including this function, ever sees that cookie's value.
   * Returns the new token, or null if the refresh session itself is gone
   * (expired, or the user's password changed elsewhere), meaning the user
   * needs to sign in again.
   */
  async refreshAccessToken(): Promise<string | null> {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'same-origin' });
      if (!res.ok) return null;
      const data = (await res.json()) as { token: string };
      auth.storeToken(data.token);
      return data.token;
    } catch {
      return null;
    }
  },

  /** Exchange Microsoft authorization code for user info via API. */
  async microsoftLogin(code: string): Promise<AuthResponse | { requiresPassword: true; email: string; linkId: string }> {
    const data = await postJson<AuthResponse | { requiresPassword: true; email: string; linkId: string }>(
      '/auth/microsoft',
      { code },
      'Microsoft sign-in failed',
    );
    return 'requiresPassword' in data ? data : signIn(data);
  },

  /**
   * linkId references the Microsoft tokens from microsoftLogin()'s response
   * on the server (see api/src/services/account-links.ts) — they never reach
   * this client.
   */
  async microsoftLink(linkId: string, password: string): Promise<CodeChallenge> {
    const data = await postJson<CodeChallenge>('/auth/microsoft/link', { linkId, password }, 'Failed to link Microsoft account');
    return { challengeId: data.challengeId, email: data.email };
  },

  /**
   * Build Google OAuth consent URL and redirect the browser to it.
   *
   * `state` carries a per-attempt nonce, never `next` directly — see
   * startOAuthNonce/consumeOAuthNonce above.
   */
  redirectToGoogle(next?: string | null): void {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = encodeURIComponent(window.location.origin + '/oauth/callback');
    const scope = encodeURIComponent('openid email profile');
    const state = startOAuthNonce(next);
    const url =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${clientId}` +
      `&redirect_uri=${redirectUri}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${encodeURIComponent(state)}`;
    window.location.href = url;
  },

  /**
   * Build Microsoft OAuth consent URL and redirect the browser to it.
   *
   * `state` carries a per-attempt nonce, same as Google above. The
   * mailbox-connect flow uses this same callback page but sends its own
   * server-signed 'connect-mailbox:...' state instead — MicrosoftAuthCallback
   * checks for that prefix before ever treating a state as a sign-in nonce.
   */
  redirectToMicrosoft(next?: string | null): void {
    const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
    const redirectUri = encodeURIComponent(window.location.origin + '/microsoft/callback');
    const scope = encodeURIComponent('openid email profile User.Read Mail.Read offline_access');
    const state = startOAuthNonce(next);
    const url =
      `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` +
      `?client_id=${clientId}` +
      `&redirect_uri=${redirectUri}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&response_mode=query` +
      `&state=${encodeURIComponent(state)}`;
    window.location.href = url;
  },

  /** Exposed for the callback pages — see consumeOAuthNonce above. */
  consumeOAuthNonce,
};
