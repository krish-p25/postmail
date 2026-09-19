import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, LinkedMailboxInfo } from '../services/api';
import { auth } from '../services/auth';
import ConnectMailboxCard from '../components/ConnectMailboxCard';
import { PasswordInput, PasswordStrengthMeter, getPasswordStrength } from '../components/PasswordInput';
import VerifyCodeForm from '../components/VerifyCodeForm';
import StepMorph from '../components/StepMorph';
import HighlightPing from '../components/HighlightPing';

const HIGHLIGHT_TARGETS = ['mailbox', 'password'] as const;
type HighlightTarget = (typeof HIGHLIGHT_TARGETS)[number];

function isHighlightTarget(value: string | null): value is HighlightTarget {
  return value !== null && (HIGHLIGHT_TARGETS as readonly string[]).includes(value);
}

export default function Settings() {
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [linkedMailboxes, setLinkedMailboxes] = useState<LinkedMailboxInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Highlight mailbox card when navigating from Setup
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlighted, setHighlighted] = useState<HighlightTarget | null>(null);
  const mailboxRef = useRef<HTMLDivElement>(null);
  const passwordSectionRef = useRef<HTMLDivElement>(null);

  // Account security state
  const [hasPassword, setHasPassword] = useState(false);
  const [hasGoogle, setHasGoogle] = useState(false);
  const [hasMicrosoft, setHasMicrosoft] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [accountMessage, setAccountMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  // Callback ref, not useRef: the whole section mounts after `loading` flips, so an
  // effect running on mount would find no node and never attach the observer below.
  const [passwordContent, setPasswordContent] = useState<HTMLDivElement | null>(null);
  const [passwordHeight, setPasswordHeight] = useState(0);
  const [passwordChallenge, setPasswordChallenge] = useState<{ challengeId: string; email: string } | null>(null);
  const [passwordTicket, setPasswordTicket] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const measurePasswordHeight = useCallback(() => {
    if (passwordContent) setPasswordHeight(passwordContent.scrollHeight);
  }, [passwordContent]);

  useEffect(() => {
    if (passwordOpen) measurePasswordHeight();
  }, [passwordOpen, newPassword, confirmPassword, currentPassword, passwordSaving, accountMessage, passwordChallenge, passwordTicket, codeError, measurePasswordHeight]);

  // The step morph resizes over ~2s, so follow the panel's real height rather than
  // sampling it at a few known moments.
  useEffect(() => {
    if (!passwordContent || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setPasswordHeight(passwordContent.scrollHeight));
    observer.observe(passwordContent);
    return () => observer.disconnect();
  }, [passwordContent]);

  function resetPasswordFlow() {
    setPasswordChallenge(null);
    setPasswordTicket(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setCodeError(null);
  }

  const settingsFetched = useRef(false);
  useEffect(() => {
    if (settingsFetched.current) return;
    settingsFetched.current = true;

    Promise.all([api.getSettings(), api.getMe()])
      .then(([settings, me]) => {
        setDiscordWebhookUrl(settings.discordWebhookUrl ?? '');
        setLinkedMailboxes(settings.linkedMailboxes || []);
        setHasPassword(me.hasPassword);
        setHasGoogle(me.hasGoogle);
        setHasMicrosoft(me.hasMicrosoft);
      })
      .catch(() => {
        setMessage({ type: 'error', text: 'Failed to load settings.' });
      })
      .finally(() => setLoading(false));
  }, []);

  // Scroll to a deep-linked section and ping it: ?highlight=mailbox | password
  useEffect(() => {
    const target = searchParams.get('highlight');
    if (loading || !isHighlightTarget(target)) return;

    // The password panel has to be open before it is worth scrolling to.
    if (target === 'password') setPasswordOpen(true);
    const sectionRef = target === 'password' ? passwordSectionRef : mailboxRef;
    // Wait out the accordion's 300ms open transition so the section is at its final height.
    const scrollDelay = target === 'password' ? 350 : 100;

    const scrollTimer = setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, scrollDelay);

    const highlightTimer = setTimeout(() => {
      setHighlighted(target);
      setSearchParams({}, { replace: true });
    }, scrollDelay + 500);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(highlightTimer);
    };
  }, [loading, searchParams, setSearchParams]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await api.updateSettings({
        discordWebhookUrl: discordWebhookUrl.trim() || null,
      });
      setMessage({ type: 'success', text: 'Settings saved.' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Settings</h2>
      <p className="mt-1 text-sm text-gray-600">
        Configure notifications and integrations.
      </p>

      <div className="mt-8 space-y-8">
        {/* Discord webhook */}
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-6">
          <h3 className="text-lg font-medium text-gray-900">
            Discord Notifications
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Receive a Discord message whenever a tracked email is opened.
          </p>

          <form onSubmit={handleSave} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="discordWebhookUrl"
                className="block text-sm font-medium text-gray-700"
              >
                Webhook URL
              </label>
              <input
                id="discordWebhookUrl"
                type="url"
                value={discordWebhookUrl}
                onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                disabled={loading}
                placeholder="https://discord.com/api/webhooks/..."
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            {message && (
              <div
                className={`rounded-lg p-3 text-sm ${
                  message.type === 'success'
                    ? 'bg-green-50 text-green-600'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || loading}
              className="min-h-[44px] rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </form>
        </div>

        {/* Account security */}
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-6">
          <h3 className="text-lg font-medium text-gray-900">Account Security</h3>
          <p className="mt-1 text-sm text-gray-500">
            Manage your sign-in methods.
          </p>

          {loading ? (
            <div className="mt-4 space-y-3">
              <div className="h-10 w-full animate-[shimmer_1.5s_infinite] rounded-lg bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" />
              <div className="h-10 w-full animate-[shimmer_1.5s_infinite] rounded-lg bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {/* Sign-in method indicator */}
              {hasGoogle && (
                <div className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-3 sm:px-4">
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <p className="text-sm text-gray-700">Logged in through Google</p>
                </div>
              )}

              {hasMicrosoft && (
                <div className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-3 sm:px-4">
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 21 21">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                  </svg>
                  <p className="text-sm text-gray-700">Logged in through Microsoft</p>
                </div>
              )}

              {/* Password section */}
              <div ref={passwordSectionRef} className="relative">
                {highlighted === 'password' && <HighlightPing rounded="rounded-lg" onDone={() => setHighlighted(null)} />}
                <div className="overflow-hidden rounded-lg border border-gray-200">
                <button
                  type="button"
                  onClick={() => setPasswordOpen((prev) => !prev)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-gray-50 sm:px-4"
                >
                  <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  <p className="flex-1 text-sm font-medium text-gray-900">
                    {hasPassword ? 'Change Password' : 'Create Password'}
                  </p>
                  <svg
                    className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${passwordOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                <div
                  className="overflow-hidden transition-[height] duration-300 ease-in-out"
                  style={{ height: passwordOpen ? `${passwordHeight}px` : '0px' }}
                >
                  <div ref={setPasswordContent}>
                    {!passwordChallenge ? (
                      <form
                        className="space-y-3 border-t border-gray-100 px-3 py-3 sm:px-4"
                        onSubmit={async (e: FormEvent) => {
                          e.preventDefault();
                          if (passwordSaving || (hasPassword && currentPassword.length === 0)) return;
                          setAccountMessage(null);
                          setPasswordSaving(true);
                          try {
                            const challenge = await api.requestPasswordChange(hasPassword ? currentPassword : undefined);
                            setCodeError(null);
                            setPasswordChallenge(challenge);
                          } catch (err) {
                            setAccountMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to send verification code.' });
                          } finally {
                            setPasswordSaving(false);
                          }
                        }}
                      >
                        <p className="text-xs text-gray-500">
                          {hasPassword
                            ? 'Confirm your current password and we will email you a 6-digit code.'
                            : 'We will email you a 6-digit code to confirm it is you.'}
                        </p>
                        {hasPassword && (
                          <PasswordInput
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Current password"
                            className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-9 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        )}
                        <button
                          type="submit"
                          disabled={passwordSaving || (hasPassword && currentPassword.length === 0)}
                          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {passwordSaving ? 'Sending code...' : 'Send verification code'}
                        </button>
                      </form>
                    ) : (
                      <div className="border-t border-gray-100 px-3 py-3 sm:px-4">
                        <StepMorph
                          surface="plain"
                          showSecond={passwordTicket !== null}
                          onStageChange={measurePasswordHeight}
                          first={
                            <VerifyCodeForm
                              variant="inline"
                              email={passwordChallenge.email}
                              error={codeError}
                              onResend={() => auth.resendCode(passwordChallenge.challengeId)}
                              onVerify={async (code) => {
                                setCodeError(null);
                                try {
                                  setPasswordTicket(await api.verifyPasswordChange(passwordChallenge.challengeId, code));
                                } catch (err) {
                                  setCodeError(err instanceof Error ? err.message : 'Verification failed');
                                }
                              }}
                            />
                          }
                          second={(() => {
                            const isStrong = getPasswordStrength(newPassword).label === 'Strong';
                            const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
                            const showMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
                            const canSubmit = isStrong && passwordsMatch && !passwordSaving;

                            return (
                              <form
                                className="space-y-3"
                                onSubmit={async (e: FormEvent) => {
                                  e.preventDefault();
                                  if (!canSubmit || !passwordTicket) return;
                                  setAccountMessage(null);
                                  setPasswordSaving(true);
                                  try {
                                    const { token } = await api.applyPasswordChange(passwordTicket, newPassword);
                                    auth.storeToken(token);
                                    const created = !hasPassword;
                                    resetPasswordFlow();
                                    setHasPassword(true);
                                    setAccountMessage({
                                      type: 'success',
                                      text: created
                                        ? 'Password created successfully.'
                                        : 'Password changed successfully. Other sessions were signed out.',
                                    });
                                  } catch (err) {
                                    setAccountMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update password.' });
                                  } finally {
                                    setPasswordSaving(false);
                                  }
                                }}
                              >
                                <p className="text-xs text-gray-500">Verified. Choose your new password.</p>
                                <PasswordInput
                                  value={newPassword}
                                  onChange={(e) => setNewPassword(e.target.value)}
                                  placeholder="New password"
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
                                {showMismatch && <p className="-mt-1 text-xs text-red-500">Passwords do not match</p>}
                                {passwordsMatch && <p className="-mt-1 text-xs text-green-500">Passwords match</p>}
                                <button
                                  type="submit"
                                  disabled={!canSubmit}
                                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {passwordSaving ? 'Saving...' : hasPassword ? 'Change password' : 'Create password'}
                                </button>
                              </form>
                            );
                          })()}
                        />
                      </div>
                    )}
                  </div>
                </div>
                </div>
              </div>

              {accountMessage && (
                <div
                  className={`rounded-lg p-3 text-sm ${
                    accountMessage.type === 'success'
                      ? 'bg-green-50 text-green-600'
                      : 'bg-red-50 text-red-600'
                  }`}
                >
                  {accountMessage.text}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Connect mailbox */}
        <div ref={mailboxRef} className="relative z-[60]">
          {highlighted === 'mailbox' && <HighlightPing onDone={() => setHighlighted(null)} />}
          <ConnectMailboxCard
            linkedMailboxes={linkedMailboxes}
            loading={loading}
            onDisconnect={(mailboxId) => {
              setLinkedMailboxes((prev) => prev.filter((m) => m.id !== mailboxId));
            }}
          />
        </div>
      </div>
    </div>
  );
}
