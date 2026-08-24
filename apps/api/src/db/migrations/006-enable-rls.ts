import { QueryInterface } from 'sequelize';

/**
 * Enable Row-Level Security (RLS) on all tenant-scoped tables.
 *
 * How RLS works here:
 * 1. Each tenant-scoped table has RLS enabled with a policy checking user_id.
 * 2. Before running queries, the API middleware sets a PostgreSQL session variable:
 *    SET LOCAL app.current_user_id = '<uuid>'
 * 3. The RLS policy compares each row's user_id against this session variable.
 * 4. SET LOCAL is transaction-scoped — it auto-resets after COMMIT/ROLLBACK.
 * 5. This ensures no user can ever see another user's data, even if application
 *    code has a bug — the database enforces isolation.
 *
 * The 'users' table is NOT RLS-protected because user lookup happens during
 * auth middleware (before the user_id context is set).
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const tenantTables = ['tracked_emails', 'email_opens', 'email_clicks', 'user_settings'];

  for (const table of tenantTables) {
    // Enable RLS on the table
    await queryInterface.sequelize.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);

    // Force RLS even for table owners (important for security)
    await queryInterface.sequelize.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

    // Create policy: users can only see/modify their own rows
    // Uses current_setting('app.current_user_id') which is set per-transaction
    await queryInterface.sequelize.query(`
      CREATE POLICY tenant_isolation_${table} ON ${table}
        USING (user_id = current_setting('app.current_user_id', true)::uuid)
        WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid)
    `);
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tenantTables = ['tracked_emails', 'email_opens', 'email_clicks', 'user_settings'];

  for (const table of tenantTables) {
    await queryInterface.sequelize.query(`DROP POLICY IF EXISTS tenant_isolation_${table} ON ${table}`);
    await queryInterface.sequelize.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
  }
}
