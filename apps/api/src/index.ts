import app from './app';
import { config } from './config/env';
import { sequelize } from './db/sequelize';
import { runMigrations } from './db/migrate';
import { backfillAllIds } from './services/backfill-ids';
import { verifySmtp } from './services/email';

// Initialize database and start server
async function start(): Promise<void> {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('[PostMail API] Database connected');

    // Sync all models — creates tables if they don't exist, adds missing columns
    await sequelize.sync({ alter: true });
    console.log('[PostMail API] Database schema synced');

    // Run pending data migrations
    await runMigrations();

    // Start HTTP server
    app.listen(config.port, () => {
      console.log(`[PostMail API] Server running on port ${config.port}`);
      console.log(`[PostMail API] Environment: ${config.nodeEnv}`);

      // Backfill missing threadId/conversationId (non-blocking)
      backfillAllIds().catch(() => {});

      // Log clearly if Gmail SMTP is misconfigured (non-blocking)
      verifySmtp().catch(() => {});
    });
  } catch (error) {
    console.error('[PostMail API] Failed to start:', error);
    process.exit(1);
  }
}

start();
