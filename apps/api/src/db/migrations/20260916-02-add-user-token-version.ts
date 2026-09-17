import { QueryInterface } from 'sequelize';

/** Per-user counter embedded in JWTs as `ver`; bumping it revokes all older tokens. */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0',
  );
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('ALTER TABLE users DROP COLUMN IF EXISTS token_version');
}
