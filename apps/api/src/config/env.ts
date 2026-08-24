import dotenv from 'dotenv';
import path from 'path';

// Load .env from repo root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3005', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // PostgreSQL
  databaseUrl: process.env.DATABASE_URL || 'postgres://postmail:postmail_dev@localhost:5432/postmail',

  // JWT
  jwtSecret: process.env.JWT_SECRET || '',

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3006/oauth/callback',

  // CORS
  dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:3006',
} as const;
