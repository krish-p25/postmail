import { QueryInterface } from 'sequelize';

/** Browsers that skip the new-device sign-in code (see services/devices.ts). */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    CREATE TABLE IF NOT EXISTS trusted_devices (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash char(64) NOT NULL,
      user_agent text NULL,
      last_used_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS trusted_devices_token_hash_unique ON trusted_devices (token_hash);
    CREATE INDEX IF NOT EXISTS trusted_devices_user_id ON trusted_devices (user_id);
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('DROP TABLE IF EXISTS trusted_devices');
}
