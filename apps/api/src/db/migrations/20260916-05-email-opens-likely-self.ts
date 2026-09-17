import { QueryInterface } from 'sequelize';

/** Opens loaded by a browser tab signed in to one of the owner's linked mailboxes. */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    'ALTER TABLE email_opens ADD COLUMN IF NOT EXISTS likely_self BOOLEAN NOT NULL DEFAULT false',
  );
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('ALTER TABLE email_opens DROP COLUMN IF EXISTS likely_self');
}
