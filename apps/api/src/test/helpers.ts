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
