import { Sequelize } from 'sequelize';
import { config } from '../config/env';

/**
 * Sequelize instance connected to PostgreSQL.
 *
 * RLS Strategy:
 * Every tenant-scoped query must run inside a transaction that first calls
 * SET LOCAL app.current_user_id = '<uuid>'. The SET LOCAL is scoped to the
 * transaction and automatically resets when the transaction commits/rolls back.
 * This ensures connection-pool safety — no user context leaks between requests.
 */
export const sequelize = new Sequelize(config.databaseUrl, {
  dialect: 'postgres',
  logging: false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});
