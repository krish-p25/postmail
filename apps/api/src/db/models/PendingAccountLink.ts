import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../sequelize';

export type LinkProvider = 'google' | 'microsoft';

interface PendingAccountLinkAttributes {
  id: string;
  provider: LinkProvider;
  userId: string;
  payload: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
}

interface PendingAccountLinkCreation extends Optional<PendingAccountLinkAttributes, 'id' | 'payload' | 'createdAt'> {}

/**
 * Holds an OAuth token set server-side between the OAuth callback and the
 * password-confirmation step, so the tokens never sit in browser JS (see
 * docs/security-review.md #4). The browser only ever holds this row's id.
 *
 * Only services/account-links.ts may query this model (enforced by the
 * data-access guard test).
 */
class PendingAccountLink extends Model<PendingAccountLinkAttributes, PendingAccountLinkCreation> implements PendingAccountLinkAttributes {
  declare id: string;
  declare provider: LinkProvider;
  declare userId: string;
  declare payload: Record<string, unknown>;
  declare expiresAt: Date;
  declare createdAt: Date;
}

PendingAccountLink.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    provider: { type: DataTypes.STRING(16), allowNull: false, validate: { isIn: [['google', 'microsoft']] } },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    createdAt: { type: DataTypes.DATE, field: 'created_at' },
  },
  {
    sequelize,
    tableName: 'pending_account_links',
    underscored: true,
    updatedAt: false,
  },
);

export default PendingAccountLink;
