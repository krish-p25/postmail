import { Sequelize } from 'sequelize';
import { config } from '../config/env';

/**
 * Sequelize instance connected to PostgreSQL.
 *
 * Tenant isolation is enforced in application code: access user-owned
 * tables through forUser() in ./scoped.ts, never through the models directly.
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
