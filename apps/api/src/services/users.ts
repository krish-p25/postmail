import type { CreationAttributes, Transaction } from 'sequelize';
import { sequelize } from '../db/sequelize';
import { User, UserSetting } from '../db/models';
import { forUser } from '../db/scoped';

type SettingsValues = Omit<CreationAttributes<UserSetting>, 'userId'>;

/**
 * Create a user and their settings row atomically, so a failed second insert
 * can't leave an account without settings. `afterCreate` runs in the same transaction.
 */
export function createUserWithSettings(
  values: CreationAttributes<User>,
  settings: SettingsValues = {},
  afterCreate?: (user: User, transaction: Transaction) => Promise<unknown>,
): Promise<User> {
  return sequelize.transaction(async (transaction) => {
    const user = await User.create(values, { transaction });
    await forUser(user.id).userSettings.create(settings, { transaction });
    if (afterCreate) await afterCreate(user, transaction);
    return user;
  });
}
