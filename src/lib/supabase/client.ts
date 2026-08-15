'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './env';

let client: SupabaseClient | null = null;

/**
 * Browser Supabase client, created once per tab.
 *
 * Returns null when no backend is configured, which is a supported state: the app
 * runs local-only and never offers sign-in. Callers must handle null rather than
 * assume a client exists.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
