import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import { sequelize } from './db/sequelize';
import { runMigrations } from './db/migrate';
import { validateSchema } from './db/validate-schema';
import './db/models'; // Register all models and associations
import { errorHandler } from './middleware/errors';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import meRoutes from './routes/me';
import emailRoutes from './routes/emails';
import settingsRoutes from './routes/settings';
import gmailRoutes from './routes/gmail';
import outlookRoutes from './routes/outlook';
import pixelRoutes from './routes/pixel';
import trackRoutes from './routes/track';

const app = express();

// Trust proxy so req.ip reads X-Forwarded-For behind reverse proxies
app.set('trust proxy', true);

// Pixel tracking route — mounted before helmet/CORS/auth
// because email clients fetch this without CORS headers
app.use('/o', pixelRoutes);

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

// API info
app.get('/', (_req, res) => {
  res.json({ name: 'PostMail API', version: '0.1.0' });
});

// Public auth routes (no middleware)
app.use('/auth', authRoutes);

// Authenticated API routes
app.use('/me', authMiddleware, meRoutes);
app.use('/emails', authMiddleware, emailRoutes);
app.use('/settings', authMiddleware, settingsRoutes);
app.use('/gmail', authMiddleware, gmailRoutes);
app.use('/outlook', authMiddleware, outlookRoutes);
app.use('/track', authMiddleware, trackRoutes);

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

    // Validate database schema matches expected models
    await validateSchema();

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
