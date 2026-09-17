import { QueryInterface } from 'sequelize';

/**
 * Remove Postgres row-level security.
 *
 * RLS never took effect (the app connected as a superuser) and most queries
 * did not set app.current_user_id. Tenant isolation is enforced by forUser()
 * (src/db/scoped.ts), the data-access guard test, and the tenant-isolation tests.
 */
const TABLES = ['tracked_emails', 'email_opens', 'email_clicks', 'user_settings', 'linked_mailboxes'];

export async function up(queryInterface: QueryInterface): Promise<void> {
  for (const table of TABLES) {
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF to_regclass('public.${table}') IS NOT NULL THEN
          EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_${table} ON public.${table}';
          EXECUTE 'ALTER TABLE public.${table} NO FORCE ROW LEVEL SECURITY';
          EXECUTE 'ALTER TABLE public.${table} DISABLE ROW LEVEL SECURITY';
        END IF;
      END $$;
    `);
  }
}

export async function down(): Promise<void> {
  // Intentionally a no-op: RLS was removed by design.
}
