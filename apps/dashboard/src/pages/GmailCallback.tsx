import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import LoadingScreen from '../components/LoadingScreen';

export default function GmailCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorParam = params.get('error');

    if (errorParam) {
      setError(`Gmail authorization was cancelled or failed: ${errorParam}`);
      return;
    }

    if (code) {
      api
        .gmailCallback(code)
        .then(() => {
          navigate('/dashboard/emails', { replace: true });
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to connect Gmail');
        });
    } else {
      setError('No authorization code received from Google');
    }
  }, [navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Connection failed</h2>
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <Link
            to="/dashboard/settings"
            className="mt-4 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Back to settings
          </Link>
        </div>
      </div>
    );
  }

  return <LoadingScreen visible message="Connecting Gmail..." />;
}
