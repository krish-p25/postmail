import { sequelize } from '../sequelize';
import { up } from '../migrations/20260916-01-drop-rls';
import { up as upRemaining } from '../migrations/20260916-03-drop-rls-remaining';
import { resetDatabase, closeDatabase } from '../../test/helpers';

beforeAll(async () => {
  await resetDatabase();
  // Recreate the production state: policy + FORCE on one table, bare ENABLE on linked_mailboxes.
  await sequelize.query('ALTER TABLE tracked_emails ENABLE ROW LEVEL SECURITY');
  await sequelize.query('ALTER TABLE tracked_emails FORCE ROW LEVEL SECURITY');
  await sequelize.query(
    "CREATE POLICY tenant_isolation_tracked_emails ON tracked_emails USING (user_id = current_setting('app.current_user_id', true)::uuid)",
  );
  await sequelize.query('ALTER TABLE linked_mailboxes ENABLE ROW LEVEL SECURITY');
  // Seen in production: RLS enabled with no policy at all.
  await sequelize.query('ALTER TABLE users ENABLE ROW LEVEL SECURITY');
});

afterAll(closeDatabase);

it('removes policies and disables RLS on every tenant table, idempotently', async () => {
  await up(sequelize.getQueryInterface());
  await up(sequelize.getQueryInterface());
  await upRemaining(sequelize.getQueryInterface());
  await upRemaining(sequelize.getQueryInterface());

  const [policies] = await sequelize.query("SELECT policyname FROM pg_policies WHERE schemaname = 'public'");
  expect(policies).toEqual([]);

  const [rlsTables] = await sequelize.query(
    "SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND (relrowsecurity OR relforcerowsecurity)",
  );
  expect(rlsTables).toEqual([]);
});
