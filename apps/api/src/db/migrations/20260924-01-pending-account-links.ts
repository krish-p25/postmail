import { QueryInterface } from 'sequelize';

/** OAuth tokens held server-side between the OAuth callback and password confirmation (see services/account-links.ts). */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    CREATE TABLE IF NOT EXISTS pending_account_links (
      id uuid PRIMARY KEY,
      provider varchar(16) NOT NULL,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payload jsonb NOT NULL DEFAULT '{}',
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS pending_account_links_user_id ON pending_account_links (user_id);
    ALTER TABLE pending_account_links DROP CONSTRAINT IF EXISTS pending_account_links_provider_check;
    ALTER TABLE pending_account_links ADD CONSTRAINT pending_account_links_provider_check CHECK (provider IN ('google', 'microsoft'));
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('DROP TABLE IF EXISTS pending_account_links');
}
