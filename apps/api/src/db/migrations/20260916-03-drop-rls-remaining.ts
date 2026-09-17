import { QueryInterface } from 'sequelize';

/**
 * Found after 20260916-01 ran in production: `users` and `SequelizeMeta` still had
 * RLS enabled (with no policy), left over from earlier experiments. A table with RLS
 * enabled and no policy returns zero rows to any role that does not bypass RLS, so
 * this would break logins the moment the app stopped connecting as a superuser.
 */
const TABLES = ['users', 'SequelizeMeta'];

export async function up(queryInterface: QueryInterface): Promise<void> {
  for (const table of TABLES) {
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF to_regclass('public."${table}"') IS NOT NULL THEN
          EXECUTE 'ALTER TABLE public."${table}" NO FORCE ROW LEVEL SECURITY';
          EXECUTE 'ALTER TABLE public."${table}" DISABLE ROW LEVEL SECURITY';
        END IF;
      END $$;
    `);
  }
}

export async function down(): Promise<void> {
  // Intentionally a no-op: RLS was removed by design.
}
