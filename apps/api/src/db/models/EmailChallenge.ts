import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../sequelize';
import { CHALLENGE_PURPOSES, ChallengePurpose } from '../../services/challenge-purposes';

interface EmailChallengeAttributes {
  id: string;
  purpose: ChallengePurpose;
  email: string;
  userId: string | null;
  codeHash: string;
  payload: Record<string, unknown>;
  attempts: number;
  sendCount: number;
  lastSentAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

interface EmailChallengeCreation
  extends Optional<EmailChallengeAttributes, 'id' | 'userId' | 'payload' | 'attempts' | 'sendCount' | 'createdAt'> {}

/** Only services/challenges.ts may query this model (enforced by the data-access guard test). */
class EmailChallenge extends Model<EmailChallengeAttributes, EmailChallengeCreation> implements EmailChallengeAttributes {
  declare id: string;
  declare purpose: ChallengePurpose;
  declare email: string;
  declare userId: string | null;
  declare codeHash: string;
  declare payload: Record<string, unknown>;
  declare attempts: number;
  declare sendCount: number;
  declare lastSentAt: Date;
  declare expiresAt: Date;
  declare createdAt: Date;
}

EmailChallenge.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    purpose: { type: DataTypes.STRING(32), allowNull: false, validate: { isIn: [[...CHALLENGE_PURPOSES]] } },
    email: { type: DataTypes.TEXT, allowNull: false },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    codeHash: { type: DataTypes.CHAR(64), allowNull: false, field: 'code_hash' },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sendCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'send_count' },
    lastSentAt: { type: DataTypes.DATE, allowNull: false, field: 'last_sent_at' },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    createdAt: { type: DataTypes.DATE, field: 'created_at' },
  },
  {
    sequelize,
    tableName: 'email_challenges',
    underscored: true,
    updatedAt: false,
    indexes: [{ name: 'email_challenges_email_purpose_created_at', fields: ['email', 'purpose', 'created_at'] }],
  },
);

export default EmailChallenge;
