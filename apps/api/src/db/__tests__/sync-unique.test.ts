import { sequelize } from '../sequelize';
import '../models';
import { closeDatabase } from '../../test/helpers';

afterAll(closeDatabase);

// sync({ alter: true }) runs on every boot and re-adds a UNIQUE constraint for each column-level
// `unique: true`, so unique columns must be declared as named indexes instead.
const UNIQUE_COLUMNS: Array<[table: string, column: string]> = [
  ['users', 'email'],
  ['users', 'google_id'],
  ['users', 'microsoft_id'],
  ['tracked_emails', 'tracking_token'],
  ['trusted_devices', 'token_hash'],
];

async function uniqueIndexCount(table: string, column: string): Promise<number> {
  const [rows] = await sequelize.query(
    `SELECT count(*)::int AS n FROM pg_indexes
     WHERE tablename = :table AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE :suffix`,
    { replacements: { table, suffix: `%(${column})` } },
  );
  return (rows as Array<{ n: number }>)[0].n;
}

it('keeps exactly one unique index per unique column across repeated alter syncs', async () => {
  await sequelize.sync({ force: true });
  await sequelize.sync({ alter: true });
  await sequelize.sync({ alter: true });

  for (const [table, column] of UNIQUE_COLUMNS) {
    expect({ [`${table}.${column}`]: await uniqueIndexCount(table, column) }).toEqual({ [`${table}.${column}`]: 1 });
  }
});
