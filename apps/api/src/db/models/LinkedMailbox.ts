import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../sequelize';

interface LinkedMailboxAttributes {
  id: string;
  userId: string;
  provider: 'gmail' | 'outlook';
  email: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LinkedMailboxCreation extends Optional<LinkedMailboxAttributes, 'id' | 'accessToken' | 'refreshToken' | 'tokenExpiry' | 'createdAt' | 'updatedAt'> {}

class LinkedMailbox extends Model<LinkedMailboxAttributes, LinkedMailboxCreation> implements LinkedMailboxAttributes {
  declare id: string;
  declare userId: string;
  declare provider: 'gmail' | 'outlook';
  declare email: string;
  declare accessToken: string | null;
  declare refreshToken: string | null;
  declare tokenExpiry: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

LinkedMailbox.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'id' },
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    accessToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'access_token',
    },
    refreshToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'refresh_token',
    },
    tokenExpiry: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'token_expiry',
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'linked_mailboxes',
    underscored: true,
  },
);

export default LinkedMailbox;
