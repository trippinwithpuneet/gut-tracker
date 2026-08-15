/**
 * Supabase connection details, read from the environment.
 *
 * Both variables are safe to expose — the anon/publishable key only grants what
 * row-level security allows, which for this app is "your own rows and the curated
 * libraries". The service-role key is never used anywhere in this codebase.
 *
 * The app is designed to run without these set: no configuration means no cloud
 * backend, and the UI stays in local-only mode instead of crashing. That is what
 * makes `git clone && npm run dev` work for a contributor with no Supabase project.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  '';

/** False when the app is running without a backend; sign-in is hidden in that case. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
