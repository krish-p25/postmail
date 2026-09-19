import { useState, FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../services/auth';
import VerifyCodeForm from '../components/VerifyCodeForm';
import StepMorph from '../components/StepMorph';
import { PasswordInput, PasswordStrengthMeter, getPasswordStrength } from '../components/PasswordInput';
import LoadingScreen from '../components/LoadingScreen';

/**
 * Three steps on one route: email → emailed code → new password. The code and the
 * password are deliberately separate screens; StepMorph animates between them.
 */
export default function ForgotPassword() {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
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

  const isStrong = getPasswordStrength(newPassword).label === 'Strong';
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const showMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmitPassword = isStrong && passwordsMatch && !submitting;

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    if (!ticket || !canSubmitPassword) return;
    setError(null);
    setSubmitting(true);
    try {
      const data = await auth.applyPasswordReset(ticket, newPassword);
      setUser(data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setSubmitting(false);
    }
  }

  const shell = (title: string, subtitle: string, body: JSX.Element, footer?: JSX.Element) => (
    <>
      <LoadingScreen visible={loading} />
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
            <p className="mt-2 text-sm text-gray-600">{subtitle}</p>
          </div>
          {body}
          {footer}
        </div>
      </div>
    </>
  );

  // Step 2 and 3: the code, then the new password, inside one morphing box.
  if (challengeId) {
    return shell(
      'PostMail',
      ticket ? 'Choose a new password' : 'Verify it is you',
      <StepMorph
        showSecond={ticket !== null}
        first={
          <VerifyCodeForm
            variant="inline"
            email={email}
            error={codeError}
            message={
              <>
                If you have an account with us, a verification code has been sent to{' '}
                <span className="font-medium text-gray-900">{email}</span>.
              </>
            }
            onResend={() => auth.resendCode(challengeId)}
            onVerify={async (code) => {
              setCodeError(null);
              try {
                setTicket(await auth.verifyPasswordReset(challengeId, code));
              } catch (err) {
                setCodeError(err instanceof Error ? err.message : 'Verification failed');
              }
            }}
          />
        }
        second={
          <form onSubmit={handleReset} className="space-y-3">
            <p className="text-center text-sm text-gray-600">
              Verified. Set a new password for <span className="font-medium text-gray-900">{email}</span>.
            </p>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              autoFocus
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-9 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <PasswordStrengthMeter password={newPassword} showChecksWhenEmpty />
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={!canSubmitPassword}
              className="w-full rounded-lg bg-primary-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Reset password'}
            </button>
          </form>
        }
      />,
    );
  }

  // Step 1: which account.
  return shell(
    'PostMail',
    'Reset your password',
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
    </div>,
    <p className="mt-6 text-center text-sm text-gray-600">
      Remembered it?{' '}
      <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
        Back to sign in
      </Link>
    </p>,
  );
}
