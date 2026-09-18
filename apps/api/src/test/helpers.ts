import { sequelize } from '../db/sequelize';
import { User } from '../db/models';
import { signToken } from '../services/tokens';

let counter = 0;

/** Drop and recreate every table in the test database. */
export async function resetDatabase(): Promise<void> {
  await sequelize.sync({ force: true });
}

export async function createUser(overrides: { email?: string; passwordHash?: string | null } = {}): Promise<User> {
  counter += 1;
  return User.create({
    email: overrides.email ?? `user${counter}-${Date.now()}@example.com`,
    passwordHash: overrides.passwordHash ?? null,
  });
}

export function bearer(user: User): string {
  return `Bearer ${signToken(user)}`;
}

export async function closeDatabase(): Promise<void> {
  await sequelize.close();
}

/** Latest code passed to a mocked sendChallengeEmail for this address. */
export function lastEmailedCode(sendMock: jest.Mock, email: string): string {
  const calls = sendMock.mock.calls.filter((call) => call[1] === email.toLowerCase());
  if (calls.length === 0) throw new Error(`No code was emailed to ${email}`);
  return calls[calls.length - 1][2] as string;
}

/** A 6-digit code guaranteed to differ from `code`. */
export function wrongCode(code: string): string {
  return code === '000000' ? '111111' : '000000';
}
