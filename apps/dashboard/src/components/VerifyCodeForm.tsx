import { useState, useRef, KeyboardEvent, ClipboardEvent } from 'react';

interface VerifyCodeFormProps {
  email: string;
  onVerify: (code: string) => Promise<void>;
  error: string | null;
}

const CODE_LENGTH = 6;

export default function VerifyCodeForm({ email, onVerify, error }: VerifyCodeFormProps) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join('');
  const isComplete = code.length === CODE_LENGTH && digits.every((d) => d !== '');

  async function submit() {
    if (!isComplete || verifying) return;
    setVerifying(true);
    try {
      await onVerify(code);
    } finally {
      setVerifying(false);
    }
  }

  function updateDigit(index: number, value: string) {
    // Only allow single digit
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when last digit entered
    if (digit && index === CODE_LENGTH - 1 && next.every((d) => d !== '')) {
      setTimeout(() => {
        const fullCode = next.join('');
        if (fullCode.length === CODE_LENGTH) {
          setVerifying(true);
          onVerify(fullCode).finally(() => setVerifying(false));
        }
      }, 100);
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
    const focusIndex = Math.min(pasted.length, CODE_LENGTH - 1);
    inputRefs.current[focusIndex]?.focus();

    // Auto-submit if full code pasted
    if (pasted.length === CODE_LENGTH) {
      setTimeout(() => {
        setVerifying(true);
        onVerify(next.join('')).finally(() => setVerifying(false));
      }, 100);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">PostMail</h1>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200 sm:p-8">
          {/* Email icon */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-50">
            <svg className="h-7 w-7 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
          </div>

          <h2 className="mt-4 text-center text-lg font-semibold text-gray-900">Check your email</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            We sent a 6-digit code to <span className="font-medium text-gray-900">{email}</span>
          </p>

          {/* Code inputs */}
          <div className="mt-8 flex justify-center gap-2 sm:gap-2.5">
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => updateDigit(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                autoFocus={i === 0}
                disabled={verifying}
                className="h-12 w-10 rounded-lg border border-gray-300 text-center text-lg font-semibold text-gray-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400 sm:w-11"
              />
            ))}
          </div>

          {error && (
            <p className="mt-4 text-center text-sm text-red-600">{error}</p>
          )}

          <button
            onClick={submit}
            disabled={!isComplete || verifying}
            className="mt-6 w-full rounded-lg bg-primary-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifying ? 'Verifying...' : 'Verify'}
          </button>

          <p className="mt-4 text-center text-xs text-gray-400">
            Code expires in 10 minutes
          </p>
        </div>
      </div>
    </div>
  );
}
