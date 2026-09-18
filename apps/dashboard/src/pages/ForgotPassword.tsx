import { useState, FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../services/auth';
import VerifyCodeForm from '../components/VerifyCodeForm';
import { PasswordInput, PasswordStrengthMeter, getPasswordStrength } from '../components/PasswordInput';
import LoadingScreen from '../components/LoadingScreen';

export default function ForgotPassword() {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  if (challengeId) {
    const isStrong = getPasswordStrength(newPassword).label === 'Strong';
    const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
    const showMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

    return (
      <VerifyCodeForm
        email={email}
        message={
          <>
            If you have an account with us, a verification code has been sent to{' '}
            <span className="font-medium text-gray-900">{email}</span>.
          </>
        }
        error={error}
        autoSubmit={false}
        canSubmit={isStrong && passwordsMatch}
        submitLabel="Reset password"
        onResend={() => auth.resendCode(challengeId)}
        onVerify={async (code) => {
          setError(null);
          try {
            const data = await auth.confirmPasswordReset(challengeId, code, newPassword);
            setUser(data.user);
            navigate('/dashboard', { replace: true });
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Password reset failed');
          }
        }}
      >
        <div className="mt-6 space-y-3 text-left">
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-9 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <PasswordStrengthMeter password={newPassword} />
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            className={`block w-full rounded-lg border px-3 py-2 pr-9 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 ${
              showMismatch
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : passwordsMatch
                  ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
                  : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500'
            }`}
          />
          {showMismatch && <p className="text-xs text-red-500">Passwords do not match</p>}
        </div>
      </VerifyCodeForm>
    );
  }

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const challenge = await auth.requestPasswordReset(email.trim());
      setChallengeId(challenge.challengeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start password reset');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <LoadingScreen visible={loading} />
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900">PostMail</h1>
            <p className="mt-2 text-sm text-gray-600">Reset your password</p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200 sm:p-8">
            <form onSubmit={handleRequest} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="you@example.com"
                />
              </div>

              {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

              <button
                type="submit"
                disabled={submitting || !email}
                className="w-full rounded-lg bg-primary-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Sending code...' : 'Send verification code'}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-gray-600">
            Remembered it?{' '}
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
