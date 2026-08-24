import dotenv from 'dotenv';
import path from 'path';

// Load .env from repo root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // PostgreSQL
  databaseUrl: process.env.DATABASE_URL || 'postgres://postmail:postmail_dev@localhost:5432/postmail',

  // Supabase (for JWT verification only — NOT for mailbox OAuth)
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET || '',

  // CORS
  dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:5173',
} as const;
