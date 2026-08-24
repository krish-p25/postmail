import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../sequelize';

interface EmailOpenAttributes {
  id: string;
  trackedEmailId: string;
  userId: string;
  openedAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

interface EmailOpenCreation extends Optional<EmailOpenAttributes, 'id' | 'openedAt' | 'userAgent' | 'ipAddress' | 'createdAt'> {}

class EmailOpen extends Model<EmailOpenAttributes, EmailOpenCreation> implements EmailOpenAttributes {
  declare id: string;
  declare trackedEmailId: string;
  declare userId: string;
  declare openedAt: Date;
  declare userAgent: string | null;
  declare ipAddress: string | null;
  declare createdAt: Date;
}

EmailOpen.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    trackedEmailId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'tracked_email_id',
      references: { model: 'tracked_emails', key: 'id' },
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'id' },
    },
    openedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'opened_at',
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent',
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address',
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
    },
  },
  {
    sequelize,
    tableName: 'email_opens',
    underscored: true,
    updatedAt: false,
  },
);

export default EmailOpen;
