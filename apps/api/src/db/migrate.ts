import { Umzug, SequelizeStorage } from 'umzug';
import { sequelize } from './sequelize';

export const umzug = new Umzug({
  migrations: {
    glob: ['migrations/*.ts', { cwd: __dirname }],
    resolve: ({ name, path: migrationPath }) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const migration = require(migrationPath!);
      return {
        name,
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
