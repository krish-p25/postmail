const API_URL = import.meta.env.VITE_API_URL || 'https://postmail.krishrp.xyz/api';
const TOKEN_KEY = 'postmail_token';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthResponse {
  token: string;
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

  async googleLogin(code: string): Promise<AuthResponse | { requiresPassword: true; email: string; idToken: string }> {
    const data = await postJson<AuthResponse | { requiresPassword: true; email: string; idToken: string }>(
      '/auth/google',
      { code },
      'Google sign-in failed',
    );
    return 'requiresPassword' in data ? data : signIn(data);
  },

  async googleLink(idToken: string, password: string): Promise<CodeChallenge> {
    const data = await postJson<CodeChallenge>('/auth/google/link', { idToken, password }, 'Failed to link Google account');
    return { challengeId: data.challengeId, email: data.email };
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  },

  /** Replace the stored JWT (e.g. after a password change) and hand it to the extension. */
  storeToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    document.dispatchEvent(new CustomEvent('postmail-token-sync', { detail: token }));
  },

  /** Exchange Microsoft authorization code for user info via API. */
  async microsoftLogin(code: string): Promise<AuthResponse | { requiresPassword: true; email: string; accessToken: string; refreshToken: string | null; tokenExpiry: string | null }> {
    const data = await postJson<AuthResponse | { requiresPassword: true; email: string; accessToken: string; refreshToken: string | null; tokenExpiry: string | null }>(
      '/auth/microsoft',
      { code },
      'Microsoft sign-in failed',
    );
    return 'requiresPassword' in data ? data : signIn(data);
  },

  async microsoftLink(accessToken: string, password: string, refreshToken?: string | null, tokenExpiry?: string | null): Promise<CodeChallenge> {
    const data = await postJson<CodeChallenge>(
      '/auth/microsoft/link',
      { accessToken, password, refreshToken, tokenExpiry },
      'Failed to link Microsoft account',
    );
    return { challengeId: data.challengeId, email: data.email };
  },

  /**
   * Build Google OAuth consent URL and redirect the browser to it.
   *
   * `next` travels in `state`, never in redirect_uri: the API re-sends a fixed
   * redirect_uri when exchanging the code, and the two must match exactly.
   */
  redirectToGoogle(next?: string | null): void {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = encodeURIComponent(window.location.origin + '/oauth/callback');
    const scope = encodeURIComponent('openid email profile');
    const url =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${clientId}` +
      `&redirect_uri=${redirectUri}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&access_type=offline` +
      `&prompt=consent` +
      (next ? `&state=${encodeURIComponent(next)}` : '');
    window.location.href = url;
  },

  /**
   * Build Microsoft OAuth consent URL and redirect the browser to it.
   *
   * `state` is shared with the mailbox-connect flow, which sends the literal
   * 'connect-mailbox'. Handover values always start with '/', so they cannot collide.
   */
  redirectToMicrosoft(next?: string | null): void {
    const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
    const redirectUri = encodeURIComponent(window.location.origin + '/microsoft/callback');
    const scope = encodeURIComponent('openid email profile User.Read Mail.Read offline_access');
    const url =
      `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` +
      `?client_id=${clientId}` +
      `&redirect_uri=${redirectUri}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&response_mode=query` +
      (next ? `&state=${encodeURIComponent(next)}` : '');
    window.location.href = url;
  },
};
