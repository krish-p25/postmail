import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../services/auth';
import { useAuth } from '../contexts/AuthContext';

/**
 * Handles the Google OAuth callback.
 *
 * Google redirects here with ?code=... after the user consents.
 * We send the code to our API which exchanges it for user info
 * and returns a JWT.
 */
export default function OAuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorParam = params.get('error');

    if (errorParam) {
      setError(`Google sign-in was cancelled or failed: ${errorParam}`);
      return;
    }

    if (code) {
      auth
        .googleLogin(code)
        .then((data) => {
          setUser(data.user);
          navigate('/dashboard', { replace: true });
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Google sign-in failed');
        });
    } else {
      setError('No authorization code received from Google');
    }
  }, [navigate, setUser]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Sign-in failed</h2>
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <a
            href="/login"
            className="mt-4 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
    </div>
  );
}
