import { useEffect, useRef, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../services/auth';
import { useAuth } from '../contexts/AuthContext';
import VerifyCodeForm from '../components/VerifyCodeForm';
import LoadingScreen from '../components/LoadingScreen';

export default function MicrosoftAuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [linkState, setLinkState] = useState<{ email: string; accessToken: string; refreshToken: string | null; tokenExpiry: string | null } | null>(null);
  const [password, setPassword] = useState('');
  const [linking, setLinking] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorParam = params.get('error');
    const errorDesc = params.get('error_description');

    console.log('[Microsoft OAuth] Callback received', {
      hasCode: !!code,
      error: errorParam,
      errorDesc,
      fullUrl: window.location.href,
    });

    if (errorParam) {
      const msg = errorDesc || errorParam;
      console.error('[Microsoft OAuth] Error from Microsoft:', msg);
      setError(`Microsoft sign-in failed: ${msg}`);
      return;
    }

    if (!code) {
      console.error('[Microsoft OAuth] No authorization code in URL');
      setError('No authorization code received from Microsoft');
      return;
    }

    console.log('[Microsoft OAuth] Exchanging code with API...');
    auth
      .microsoftLogin(code)
      .then((data) => {
        if ('requiresPassword' in data) {
          console.log('[Microsoft OAuth] Account exists, requires password to link');
          setLinkState({ email: data.email, accessToken: data.accessToken, refreshToken: data.refreshToken, tokenExpiry: data.tokenExpiry });
        } else {
          console.log('[Microsoft OAuth] Login successful, redirecting to dashboard');
          setUser(data.user);
          navigate('/dashboard', { replace: true });
        }
      })
      .catch((err) => {
        console.error('[Microsoft OAuth] API error:', err);
        setError(err instanceof Error ? err.message : 'Microsoft sign-in failed');
      });
  }, [navigate, setUser]);

  async function handleLink(e: FormEvent) {
    e.preventDefault();
    if (!linkState) return;
    setError(null);
    setLinking(true);
    try {
      await auth.microsoftLink(linkState.accessToken, password, linkState.refreshToken, linkState.tokenExpiry);
      setVerifyEmail(linkState.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link account');
    } finally {
      setLinking(false);
    }
  }

  if (verifyEmail) {
    return (
      <VerifyCodeForm
        email={verifyEmail}
        error={verifyError}
        onVerify={async (code) => {
          setVerifyError(null);
          try {
            const data = await auth.verifyEmail(verifyEmail, code, 'microsoft-link');
            setUser(data.user);
            navigate('/dashboard', { replace: true });
          } catch (err) {
            setVerifyError(err instanceof Error ? err.message : 'Verification failed');
          }
        }}
      />
    );
  }

  if (linkState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Account already exists</h2>
          <p className="mt-2 text-sm text-gray-600">
            An account with <span className="font-medium">{linkState.email}</span> already exists.
            Enter your password to link your Microsoft account.
          </p>

          <form onSubmit={handleLink} className="mt-6 space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              autoFocus
            />

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={linking || !password}
              className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {linking ? 'Linking...' : 'Link account'}
            </button>
          </form>

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

  return <LoadingScreen visible />;
}
