/**
 * Runs before every test file (jest setupFiles), before config/env.ts is imported.
 * dotenv never overrides variables that are already set, so these win over .env.
 */
const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/postmail_test';

// Tests call sequelize.sync({ force: true }) — refuse anything that isn't a *_test database.
if (!/\/[^/?]+_test(\?|$)/.test(url)) {
  throw new Error(`Refusing to run tests against non-test database: ${url}`);
}

process.env.DATABASE_URL = url;
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

process.env.SMTP_USER = 'test-sender@gmail.com';
process.env.SMTP_PASS = 'test-app-password';
process.env.SMTP_FROM = 'PostMail <test-sender@gmail.com>';
