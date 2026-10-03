import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../sequelize';

interface TrackedEmailAttributes {
  id: string;
  userId: string;
  trackingToken: string;
  recipient: string | null;
  subject: string | null;
  status: 'pending' | 'sent' | 'discarded' | 'failed';
  sentAt: Date | null;
  mailboxId: string | null;
  messageId: string | null;
  threadId: string | null;
  conversationId: string | null;
  resolveAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}

interface TrackedEmailCreation extends Optional<TrackedEmailAttributes, 'id' | 'recipient' | 'subject' | 'status' | 'sentAt' | 'mailboxId' | 'messageId' | 'threadId' | 'conversationId' | 'resolveAttempts' | 'createdAt' | 'updatedAt'> {}

class TrackedEmail extends Model<TrackedEmailAttributes, TrackedEmailCreation> implements TrackedEmailAttributes {
  declare id: string;
  declare userId: string;
  declare trackingToken: string;
  declare recipient: string | null;
  declare subject: string | null;
  declare status: 'pending' | 'sent' | 'discarded' | 'failed';
  declare sentAt: Date | null;
  declare mailboxId: string | null;
  declare messageId: string | null;
  declare threadId: string | null;
  declare conversationId: string | null;
  declare resolveAttempts: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

TrackedEmail.init(
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
    trackingToken: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'tracking_token',
    },
    // TEXT, not varchar(255): long subjects and large To/CC lists must not fail registration.
    recipient: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    subject: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'discarded', 'failed'),
      defaultValue: 'pending',
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'sent_at',
    },
    mailboxId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'mailbox_id',
      references: { model: 'linked_mailboxes', key: 'id' },
    },
    messageId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'message_id',
    },
    threadId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'thread_id',
    },
    conversationId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'conversation_id',
    },
    resolveAttempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'resolve_attempts',
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
    tableName: 'tracked_emails',
    underscored: true,
    // Named unique index instead of `unique: true`, which sync({ alter }) duplicates on every boot.
    indexes: [
      { unique: true, name: 'tracked_emails_tracking_token_key', fields: ['tracking_token'] },
      { name: 'tracked_emails_user_id', fields: ['user_id'] },
      { name: 'tracked_emails_message_id', fields: ['message_id'] },
    ],
  },
);

export default TrackedEmail;
