import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../sequelize';

interface UserSettingAttributes {
  id: string;
  userId: string;
  discordWebhookUrl: string | null;
  mailboxConnected: boolean;
  mailboxProvider: string | null;
  mailboxConnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface UserSettingCreation extends Optional<UserSettingAttributes, 'id' | 'discordWebhookUrl' | 'mailboxConnected' | 'mailboxProvider' | 'mailboxConnectedAt' | 'createdAt' | 'updatedAt'> {}

class UserSetting extends Model<UserSettingAttributes, UserSettingCreation> implements UserSettingAttributes {
  declare id: string;
  declare userId: string;
  declare discordWebhookUrl: string | null;
  declare mailboxConnected: boolean;
  declare mailboxProvider: string | null;
  declare mailboxConnectedAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

UserSetting.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'user_id',
      references: { model: 'users', key: 'id' },
    },
    discordWebhookUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'discord_webhook_url',
    },
    mailboxConnected: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'mailbox_connected',
    },
    mailboxProvider: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'mailbox_provider',
    },
    mailboxConnectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'mailbox_connected_at',
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
    tableName: 'user_settings',
    underscored: true,
  },
);

export default UserSetting;
