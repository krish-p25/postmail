import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { auth, AuthUser } from '../services/auth';

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

  useEffect(() => {
    // Check for existing token and load user
    const token = auth.getToken();
    if (token) {
      // Push token to extension via custom DOM event
      document.dispatchEvent(new CustomEvent('postmail-token-sync', { detail: token }));

      // Validate token by calling /api/me
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3005';
      fetch(`${API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error('Invalid token');
          return res.json();
        })
        .then((data) => setUser({ id: data.id, email: data.email, displayName: data.displayName ?? null }))
        .catch(() => auth.clearToken())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Whenever user state changes, sync token to extension
  useEffect(() => {
    const token = auth.getToken();
    if (user && token) {
      document.dispatchEvent(new CustomEvent('postmail-token-sync', { detail: token }));
    }
  }, [user]);

  const signOut = useCallback(() => {
    auth.clearToken();
    document.dispatchEvent(new CustomEvent('postmail-token-sync', { detail: null }));
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
