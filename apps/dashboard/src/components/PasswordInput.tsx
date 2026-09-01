import { useState, InputHTMLAttributes } from 'react';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function PasswordInput({ value, onChange, className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        className={className}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 transition hover:text-gray-600"
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? (
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        ) : (
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        )}
      </button>
    </div>
  );
}

interface StrengthCheck {
  label: string;
  met: boolean;
}

export function getPasswordStrength(password: string): { score: number; label: string; checks: StrengthCheck[] } {
  const checks: StrengthCheck[] = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Number', met: /\d/.test(password) },
    { label: 'Special character', met: /[^A-Za-z0-9]/.test(password) },
  ];

  const score = checks.filter((c) => c.met).length;

  let label: string;
  if (password.length === 0) label = '';
  else if (password.length < 6) label = 'Too short';
  else if (score <= 1) label = 'Weak';
  else if (score <= 2) label = 'Fair';
  else if (score <= 3) label = 'Good';
  else label = 'Strong';

  return { score, label, checks };
}

const STRENGTH_CONFIG: Record<string, { color: string; bg: string; width: string }> = {
  '': { color: 'text-gray-400', bg: 'bg-gray-200', width: 'w-0' },
  'Too short': { color: 'text-red-500', bg: 'bg-red-400', width: 'w-1/6' },
  'Weak': { color: 'text-red-500', bg: 'bg-red-400', width: 'w-2/6' },
  'Fair': { color: 'text-orange-500', bg: 'bg-orange-400', width: 'w-3/6' },
  'Good': { color: 'text-blue-500', bg: 'bg-blue-400', width: 'w-4/6' },
  'Strong': { color: 'text-green-500', bg: 'bg-green-400', width: 'w-full' },
};

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { label, checks } = getPasswordStrength(password);
  const config = STRENGTH_CONFIG[label] || STRENGTH_CONFIG[''];

  return (
    <div className="space-y-2">
      {/* Bar */}
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${config.bg} ${config.width}`}
          />
        </div>
        {label && (
          <span className={`text-xs font-medium transition-colors duration-300 ${config.color} min-w-[60px] text-right`}>
            {label}
          </span>
        )}
      </div>

      {/* Criteria checklist */}
      {password.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {checks.map((check) => (
            <div key={check.label} className="flex items-center gap-1.5">
              <svg
                className={`h-3 w-3 flex-shrink-0 transition-colors duration-300 ${check.met ? 'text-green-500' : 'text-gray-300'}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
              >
                {check.met ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                ) : (
                  <circle cx="12" cy="12" r="8" />
                )}
              </svg>
              <span className={`text-xs transition-colors duration-300 ${check.met ? 'text-gray-600' : 'text-gray-400'}`}>
                {check.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
