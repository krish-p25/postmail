import { QueryInterface } from 'sequelize';
import { CHALLENGE_PURPOSES } from '../../services/challenge-purposes';

/** Emailed verification codes (see services/challenges.ts). Safe to run after sync() created the table. */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const purposes = CHALLENGE_PURPOSES.map((p) => `'${p}'`).join(', ');
  await queryInterface.sequelize.query(`
    CREATE TABLE IF NOT EXISTS email_challenges (
      id uuid PRIMARY KEY,
      purpose varchar(32) NOT NULL,
      email text NOT NULL,
      user_id uuid NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash char(64) NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}',
      attempts integer NOT NULL DEFAULT 0,
      send_count integer NOT NULL DEFAULT 1,
      last_sent_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS email_challenges_email_purpose_created_at
      ON email_challenges (email, purpose, created_at);
    ALTER TABLE email_challenges DROP CONSTRAINT IF EXISTS email_challenges_purpose_check;
    ALTER TABLE email_challenges ADD CONSTRAINT email_challenges_purpose_check CHECK (purpose IN (${purposes}));
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('DROP TABLE IF EXISTS email_challenges');
}
