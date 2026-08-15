/**
 * Applies every migration in supabase/migrations to a throwaway in-process
 * Postgres (PGlite), so SQL errors surface here instead of on a real project.
 *
 * PGlite has no Supabase auth schema, so we stub the pieces the migrations
 * reference: auth.users, auth.uid(), and the `authenticated` role. Everything
 * else is real Postgres, which is the point — constraints, triggers, indexes
 * and policies are all genuinely parsed and executed.
 *
 * Run: npm run db:check
 */
import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

const AUTH_STUB = `
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create or replace function auth.uid() returns uuid
    language sql stable as $$ select current_setting('request.jwt.claim.sub', true)::uuid $$;
  do $$ begin
    create role authenticated;
  exception when duplicate_object then null;
  end $$;
`;

async function main() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);

  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
      console.log(`  ok  ${file}`);
    } catch (err) {
      console.error(`\nFAILED ${file}\n${err.message}\n`);
      process.exit(1);
    }
  }

  // Sanity-check the seed actually landed and RLS is on everywhere.
  const symptoms = await db.query('select count(*)::int as n from public.symptom_types');
  const tags = await db.query('select count(*)::int as n from public.food_tags');
  const unprotected = await db.query(`
    select tablename from pg_tables
    where schemaname = 'public' and rowsecurity = false
  `);

  console.log(`\n  ${symptoms.rows[0].n} symptom types, ${tags.rows[0].n} food tags seeded`);

  if (unprotected.rows.length > 0) {
    console.error(
      `\nFAILED: RLS is disabled on: ${unprotected.rows.map((r) => r.tablename).join(', ')}\n`
    );
    process.exit(1);
  }
  console.log('  row-level security enabled on every public table');
  console.log('\nMigrations are clean.\n');
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
