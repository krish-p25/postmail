import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../sequelize';

interface TrustedDeviceAttributes {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  lastUsedAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

interface TrustedDeviceCreation extends Optional<TrustedDeviceAttributes, 'id' | 'userAgent' | 'createdAt'> {}

class TrustedDevice extends Model<TrustedDeviceAttributes, TrustedDeviceCreation> implements TrustedDeviceAttributes {
  declare id: string;
  declare userId: string;
  declare tokenHash: string;
  declare userAgent: string | null;
  declare lastUsedAt: Date;
  declare expiresAt: Date;
  declare createdAt: Date;
}

TrustedDevice.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    // Named unique index below instead of `unique: true`, which sync({ alter }) duplicates on every boot.
    tokenHash: { type: DataTypes.CHAR(64), allowNull: false, field: 'token_hash' },
    userAgent: { type: DataTypes.TEXT, allowNull: true, field: 'user_agent' },
    lastUsedAt: { type: DataTypes.DATE, allowNull: false, field: 'last_used_at' },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    createdAt: { type: DataTypes.DATE, field: 'created_at' },
  },
  {
    sequelize,
    tableName: 'trusted_devices',
    underscored: true,
    updatedAt: false,
    indexes: [
      { unique: true, name: 'trusted_devices_token_hash_unique', fields: ['token_hash'] },
      { name: 'trusted_devices_user_id', fields: ['user_id'] },
    ],
  },
);

export default TrustedDevice;
