import crypto from 'crypto';

interface PendingVerification {
  code: string;
  expiresAt: number;
  type: 'register' | 'google-link' | 'microsoft-link';
  data: Record<string, unknown>;
  attempts: number;
}

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

const store = new Map<string, PendingVerification>();

function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

function cleanExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) store.delete(key);
  }
}

export function createVerification(
  email: string,
  type: 'register' | 'google-link' | 'microsoft-link',
  data: Record<string, unknown>,
): string {
  cleanExpired();
  const code = generateCode();
  store.set(email.toLowerCase(), {
    code,
    expiresAt: Date.now() + CODE_TTL_MS,
    type,
    data,
    attempts: 0,
  });
  return code;
}

export function verifyCode(
  email: string,
  code: string,
  expectedType: 'register' | 'google-link' | 'microsoft-link',
): { valid: true; data: Record<string, unknown> } | { valid: false; error: string } {
  const key = email.toLowerCase();
  const entry = store.get(key);

  if (!entry) {
    return { valid: false, error: 'No verification code found. Please try again.' };
  }

  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return { valid: false, error: 'Verification code has expired. Please try again.' };
  }

  if (entry.type !== expectedType) {
    return { valid: false, error: 'Invalid verification request.' };
  }

  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    store.delete(key);
    return { valid: false, error: 'Too many incorrect attempts. Please try again.' };
  }

  if (entry.code !== code) {
    return { valid: false, error: 'Incorrect verification code.' };
  }

  const { data } = entry;
  store.delete(key);
  return { valid: true, data };
}
