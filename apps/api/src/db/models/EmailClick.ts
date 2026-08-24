import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../sequelize';

interface EmailClickAttributes {
  id: string;
  trackedEmailId: string;
  userId: string;
  url: string;
  clickedAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

interface EmailClickCreation extends Optional<EmailClickAttributes, 'id' | 'clickedAt' | 'userAgent' | 'ipAddress' | 'createdAt'> {}

class EmailClick extends Model<EmailClickAttributes, EmailClickCreation> implements EmailClickAttributes {
  declare id: string;
  declare trackedEmailId: string;
  declare userId: string;
  declare url: string;
  declare clickedAt: Date;
  declare userAgent: string | null;
  declare ipAddress: string | null;
  declare createdAt: Date;
}

EmailClick.init(
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
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    clickedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'clicked_at',
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
    tableName: 'email_clicks',
    underscored: true,
    updatedAt: false,
  },
);

export default EmailClick;
