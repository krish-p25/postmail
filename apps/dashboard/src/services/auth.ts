const API_URL = import.meta.env.VITE_API_URL || 'https://api.postmail.krishrp.xyz';
const TOKEN_KEY = 'postmail_token';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

async function handleResponse(res: Response): Promise<AuthResponse> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const auth = {
  async register(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await handleResponse(res);
    localStorage.setItem(TOKEN_KEY, data.token);
    return data;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await handleResponse(res);
    localStorage.setItem(TOKEN_KEY, data.token);
    return data;
  },

  async googleLogin(code: string): Promise<AuthResponse | { requiresPassword: true; email: string; idToken: string }> {
    const res = await fetch(`${API_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Google sign-in failed');
    if (data.requiresPassword) {
      return { requiresPassword: true, email: data.email, idToken: data.idToken };
    }
    localStorage.setItem(TOKEN_KEY, data.token);
    return data;
  },

  async googleLink(idToken: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_URL}/auth/google/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, password }),
    });
    const data = await handleResponse(res);
    localStorage.setItem(TOKEN_KEY, data.token);
    return data;
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  },

  /** Build Google OAuth consent URL and redirect the browser to it. */
  redirectToGoogle(): void {
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
      `&prompt=consent`;
    window.location.href = url;
  },
};
