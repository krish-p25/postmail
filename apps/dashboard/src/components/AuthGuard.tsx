import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingScreen from './LoadingScreen';

/**
 * Protects routes that require authentication.
 * Redirects to /login, handing over where the user was heading so sign-in can
 * finish the journey. Unknown routes still fall through to the home page.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, sessionError, retrySession } = useAuth();
  const location = useLocation();

  if (!loading && !user && sessionError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-gray-600">Couldn't reach PostMail. Check your connection and try again.</p>
        <button
          onClick={retrySession}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          Try again
        </button>
      </div>
    );
  }

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
