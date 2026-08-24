import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[PostMail] Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  );
}

/**
 * Supabase client for DASHBOARD AUTH ONLY.
 *
 * This client handles:
 * - Sign in with Google (social OAuth)
 * - Sign in with email/password
 * - Session management
 *
 * It does NOT handle mailbox access OAuth (Gmail API scopes).
 * That will be a separate custom OAuth flow built later.
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
);
