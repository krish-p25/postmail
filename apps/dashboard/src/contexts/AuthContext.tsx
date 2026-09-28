import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { auth, AuthUser } from '../services/auth';
import { api } from '../services/api';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  setUser: (user: AuthUser | null) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    // Check for an existing token and load the user. Goes through api.getMe(),
    // not a raw fetch — its authFetch already knows how to silently refresh an
    // expired access token via the httpOnly cookie and retry once before this
    // throws, so a merely-expired (not actually invalid) token doesn't sign
    // the user out here.
    //
    // Nothing extension-related happens on mount: the extension's own token is
    // handed over once, at actual login (see auth.syncExtensionToken), and
    // persists on its own in chrome.storage.local — there's nothing new to
    // tell it on a mere page reload.
    if (auth.getToken()) {
      api
        .getMe()
        .then((data) => setUser({ id: data.id, email: data.email, displayName: data.displayName ?? null }))
        .catch(() => auth.clearToken())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(() => {
    auth.clearToken();
    auth.syncExtensionToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, signOut }}>
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
