import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';

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

// Start server
app.listen(config.port, () => {
  console.log(`[PostMail API] Server running on port ${config.port}`);
  console.log(`[PostMail API] Environment: ${config.nodeEnv}`);
});

export default app;
