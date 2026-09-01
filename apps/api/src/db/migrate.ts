import { Umzug, SequelizeStorage } from 'umzug';
import { sequelize } from './sequelize';

const migrationExt = __filename.endsWith('.ts') ? 'ts' : 'js';

export const umzug = new Umzug({
  migrations: {
    glob: [`migrations/*.${migrationExt}`, { cwd: __dirname }],
    resolve: ({ name, path: migrationPath }) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const migration = require(migrationPath!);
      // Strip extension so migration names are consistent between dev (.ts) and prod (.js)
      const baseName = name.replace(/\.[tj]s$/, '');
      return {
        name: baseName,
        up: async () => migration.up(sequelize.getQueryInterface()),
        down: async () => migration.down(sequelize.getQueryInterface()),
      };
    },
  },
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

/**
 * Run all pending migrations.
 * Called on server startup to ensure the database schema is up to date.
 */
export async function runMigrations(): Promise<void> {
  console.log('[PostMail API] Running database migrations...');

  // Normalize any old entries that were stored with .ts or .js extensions
  await sequelize.query(
    `INSERT INTO "SequelizeMeta" (name) SELECT DISTINCT regexp_replace(name, '\\.[tj]s$', '') FROM "SequelizeMeta" WHERE name ~ '\\.[tj]s$' ON CONFLICT DO NOTHING`
  );
  await sequelize.query(
    `DELETE FROM "SequelizeMeta" WHERE name ~ '\\.[tj]s$'`
  );

  const pending = await umzug.pending();

  if (pending.length === 0) {
    console.log('[PostMail API] No pending migrations');
    return;
  }

  console.log(`[PostMail API] ${pending.length} pending migration(s):`);
  for (const m of pending) {
    console.log(`  - ${m.name}`);
  }

  await umzug.up();
  console.log('[PostMail API] Migrations complete');
}
