import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import { sequelize } from './db/sequelize';
import { runMigrations } from './db/migrate';
import './db/models'; // Register all models and associations
import { errorHandler } from './middleware/errors';

const app = express();

// Security
app.use(helmet());

// CORS — allow dashboard origin
app.use(cors({
  origin: config.dashboardUrl,
  credentials: true,
}));

// Body parsing
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Placeholder for routes (added in later tasks)
app.get('/api', (_req, res) => {
  res.json({ name: 'PostMail API', version: '0.1.0' });
});

// Error handler (must be last middleware)
app.use(errorHandler);

// Initialize database and start server
async function start(): Promise<void> {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('[PostMail API] Database connected');

    // Run pending migrations
    await runMigrations();

    // Start HTTP server
    app.listen(config.port, () => {
      console.log(`[PostMail API] Server running on port ${config.port}`);
      console.log(`[PostMail API] Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('[PostMail API] Failed to start:', error);
    process.exit(1);
  }
}

start();

export default app;
