import { useEffect, useRef, useState, KeyboardEvent, ClipboardEvent, ReactNode } from 'react';

interface VerifyCodeFormProps {
  email: string;
  onVerify: (code: string) => Promise<void>;
  /** Request a new code. Omit to hide the resend button. Throw to show an error. */
  onResend?: () => Promise<void>;
  error: string | null;
  /** 'page' renders a full-screen card; 'inline' renders only the form (e.g. inside Settings). */
  variant?: 'page' | 'inline';
  /** Replaces the default "We sent a 6-digit code to …" line. */
  message?: ReactNode;
  /** Extra fields shown under the code inputs (e.g. new password, remember device). */
  children?: ReactNode;
  submitLabel?: string;
  /** Extra condition required before submitting (e.g. the new password is valid). */
  canSubmit?: boolean;
  /** Submit automatically once all 6 digits are entered. Turn off when other fields follow. */
  autoSubmit?: boolean;
}

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyCodeForm({
  email,
  onVerify,
  onResend,
  error,
  variant = 'page',
  message,
  children,
  submitLabel = 'Verify',
  canSubmit = true,
  autoSubmit = true,
}: VerifyCodeFormProps) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_SECONDS);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const code = digits.join('');
  const isComplete = code.length === CODE_LENGTH && digits.every((d) => d !== '');
  const ready = isComplete && canSubmit && !verifying;

  async function verify(fullCode: string) {
    setVerifying(true);
    try {
      await onVerify(fullCode);
    } finally {
      setVerifying(false);
    }
  }

  function submit() {
    if (ready) void verify(code);
  }

  async function resend() {
    if (!onResend || resendIn > 0) return;
    setResendMessage(null);
    try {
      await onResend();
      setDigits(Array(CODE_LENGTH).fill(''));
      setResendMessage('A new code is on its way.');
      setResendIn(RESEND_COOLDOWN_SECONDS);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setResendMessage(err instanceof Error ? err.message : 'Could not resend the code.');
    }
  }

  function updateDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (autoSubmit && canSubmit && digit && index === CODE_LENGTH - 1 && next.every((d) => d !== '')) {
      setTimeout(() => void verify(next.join('')), 100);
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = [...digits];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();

    if (autoSubmit && canSubmit && pasted.length === CODE_LENGTH) {
      setTimeout(() => void verify(next.join('')), 100);
    }
  }

  const form = (
    <>
      <p className="mt-2 text-center text-sm text-gray-600">
        {message ?? (
          <>
            We sent a 6-digit code to <span className="font-medium text-gray-900">{email}</span>
          </>
        )}
      </p>

      <div className="mt-8 flex justify-center gap-2 sm:gap-2.5">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={digit}
            onChange={(e) => updateDigit(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            autoFocus={i === 0}
            disabled={verifying}
            aria-label={`Digit ${i + 1}`}
            className="h-12 w-10 rounded-lg border border-gray-300 text-center text-lg font-semibold text-gray-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400 sm:w-11"
          />
        ))}
      </div>

      {children}

      {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={!ready}
        className="mt-6 w-full rounded-lg bg-primary-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {verifying ? 'Verifying...' : submitLabel}
      </button>

      <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
        <span>Code expires in 10 minutes</span>
        {onResend && (
          <button
            type="button"
            onClick={resend}
            disabled={resendIn > 0}
            className="font-medium text-primary-600 hover:text-primary-700 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
          </button>
        )}
      </div>

      {resendMessage && <p className="mt-2 text-center text-xs text-gray-500">{resendMessage}</p>}
    </>
  );

  if (variant === 'inline') {
    return <div>{form}</div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">PostMail</h1>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200 sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-50">
            <svg className="h-7 w-7 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
          </div>

          <h2 className="mt-4 text-center text-lg font-semibold text-gray-900">Check your email</h2>
          {form}
        </div>
      </div>
    </div>
  );
}
