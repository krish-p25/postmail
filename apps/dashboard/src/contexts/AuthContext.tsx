import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { auth, AuthUser, ApiError } from '../services/auth';
import { api } from '../services/api';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  /** The stored session couldn't be checked (network error or 5xx) — it may still be valid. */
  sessionError: boolean;
  retrySession: () => void;
  setUser: (user: AuthUser | null) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const fetched = useRef(false);

  // Goes through api.getMe(), whose authFetch silently refreshes an expired
  // access token via the httpOnly cookie before giving up. Nothing
  // extension-related happens here: the extension's own token is handed over
  // once at login (auth.syncExtensionToken) and persists in chrome.storage.local.
  const loadUser = useCallback(() => {
    if (!auth.getToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setSessionError(false);
    api
      .getMe()
      .then((data) => setUser({ id: data.id, email: data.email, displayName: data.displayName ?? null }))
      .catch((err) => {
        // Only a 401 means the session is really gone. A network blip or a 5xx
        // keeps the token, so a brief outage doesn't sign the user out.
        if (err instanceof ApiError && err.status === 401) auth.clearToken();
        else setSessionError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    loadUser();
  }, [loadUser]);

  const signOut = useCallback(() => {
    auth.clearToken();
    auth.syncExtensionToken(null);
    setUser(null);
    setSessionError(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, sessionError, retrySession: loadUser, setUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
