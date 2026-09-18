import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { config } from './config/env';
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
import mailboxRoutes from './routes/mailboxes';

const app = express();

// Trust proxy so req.ip reads X-Forwarded-For behind reverse proxies
app.set('trust proxy', true);

// All routes live under /api so NPM can path-route to this service
const api = express.Router();

// Pixel tracking route — mounted before helmet/CORS/auth
// because email clients fetch this without CORS headers
api.use('/o', pixelRoutes);

// Security
api.use(helmet());

// CORS — allow dashboard origin (same origin in prod, but needed for local dev)
api.use(cors({
  origin: config.dashboardUrl,
  credentials: true,
}));

// Body parsing
api.use(express.json());

// Cookies (only pm_device on /api/auth is used)
api.use(cookieParser());

// Health check
api.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API info
api.get('/', (_req, res) => {
  res.json({ name: 'PostMail API', version: '0.1.0' });
});

// Public auth routes (no middleware)
api.use('/auth', authRoutes);

// Authenticated API routes
api.use('/me', authMiddleware, meRoutes);
api.use('/emails', authMiddleware, emailRoutes);
api.use('/settings', authMiddleware, settingsRoutes);
api.use('/gmail', authMiddleware, gmailRoutes);
api.use('/outlook', authMiddleware, outlookRoutes);
api.use('/track', authMiddleware, trackRoutes);
api.use('/mailboxes', authMiddleware, mailboxRoutes);

// Error handler (must be last middleware on the router)
api.use(errorHandler);

// Mount everything under /api
app.use('/api', api);

// ─── Dashboard static files (production only) ──────────────
// In production the built React SPA lives next to the API.
// Resolved path: /app/apps/api/dist/../../dashboard/dist → /app/apps/dashboard/dist
const dashboardDist = path.resolve(__dirname, '../../dashboard/dist');
app.use('/.well-known', express.static(path.join(dashboardDist, '.well-known')));
app.use(express.static(dashboardDist));

// SPA fallback — React Router handles 404s client-side
app.get('*', (_req, res) => {
  res.sendFile(path.join(dashboardDist, 'index.html'));
});

export default app;
