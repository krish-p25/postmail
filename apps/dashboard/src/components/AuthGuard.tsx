import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingScreen from './LoadingScreen';

/**
 * Protects routes that require authentication.
 * Redirects to /login, handing over where the user was heading so sign-in can
 * finish the journey. Unknown routes still fall through to the home page.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (!loading && !user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return (
    <>
      {!loading && user && children}
      <LoadingScreen visible={loading} />
    </>
  );
}
