import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../sequelize';

interface UserAttributes {
  id: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  displayName: string | null;
  gmailAccessToken: string | null;
  gmailRefreshToken: string | null;
  gmailTokenExpiry: Date | null;
  outlookAccessToken: string | null;
  outlookRefreshToken: string | null;
  outlookTokenExpiry: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'passwordHash' | 'googleId' | 'displayName' | 'gmailAccessToken' | 'gmailRefreshToken' | 'gmailTokenExpiry' | 'outlookAccessToken' | 'outlookRefreshToken' | 'outlookTokenExpiry' | 'createdAt' | 'updatedAt'> {}

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare email: string;
  declare passwordHash: string | null;
  declare googleId: string | null;
  declare displayName: string | null;
  declare gmailAccessToken: string | null;
  declare gmailRefreshToken: string | null;
  declare gmailTokenExpiry: Date | null;
  declare outlookAccessToken: string | null;
  declare outlookRefreshToken: string | null;
  declare outlookTokenExpiry: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'password_hash',
    },
    googleId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      field: 'google_id',
    },
    displayName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'display_name',
    },
    gmailAccessToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'gmail_access_token',
    },
    gmailRefreshToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'gmail_refresh_token',
    },
    gmailTokenExpiry: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'gmail_token_expiry',
    },
    outlookAccessToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'outlook_access_token',
    },
    outlookRefreshToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'outlook_refresh_token',
    },
    outlookTokenExpiry: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'outlook_token_expiry',
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
    tableName: 'users',
    underscored: true,
  },
);

export default User;
