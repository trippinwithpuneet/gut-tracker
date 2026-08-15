/**
 * Generates the library seed migration from src/lib/library.ts, so the TypeScript
 * the app reads and the SQL the database holds can never drift apart.
 *
 * Run: npm run db:gen-seed
 *
 * The generated file is overwritten in place. That is fine before launch. Once a
 * migration has been applied to a live database, add new library rows in a NEW
 * migration instead of regenerating this one.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CURATED_FOOD_TAGS, CURATED_SYMPTOM_TYPES } from '../src/lib/library';

const OUT = path.join(process.cwd(), 'supabase', 'migrations', '20260815120100_seed_libraries.sql');

const sqlString = (value: string | null): string =>
  value === null ? 'null' : `'${value.replace(/'/g, "''")}'`;

const sqlArray = (values: string[]): string =>
  values.length === 0
    ? `'{}'`
    : `array[${values.map((v) => sqlString(v)).join(', ')}]::text[]`;

const header = `-- GENERATED FILE — do not edit by hand.
-- Source: src/lib/library.ts   Regenerate: npm run db:gen-seed
--
-- Curated libraries ship as a migration rather than a seed file so that self-hosted
-- instances get them from \`supabase db push\` too. These rows have user_id IS NULL,
-- are readable by every authenticated user, and are not writable through the API.
--
-- The ids are UUIDv5 values derived from the slug (see src/lib/uuid.ts), which is what
-- lets a meal tagged offline point at the same row once it syncs to the server.
`;

const symptomRows = CURATED_SYMPTOM_TYPES.map(
  (s) =>
    `  (${sqlString(s.id)}::uuid, null, ${sqlString(s.slug)}, ${sqlString(s.name)}, ` +
    `${sqlString(s.description)}, ${sqlString(s.category)}, ${sqlString(s.scale)}, ` +
    `${s.isRedFlag}, ${s.sortOrder})`
).join(',\n');

const tagRows = CURATED_FOOD_TAGS.map(
  (t) =>
    `  (${sqlString(t.id)}::uuid, null, ${sqlString(t.slug)}, ${sqlString(t.name)}, ` +
    `${sqlString(t.description)}, ${sqlString(t.category)}, ${sqlArray(t.aliases)}, ${t.sortOrder})`
).join(',\n');

// on conflict (id) do update keeps re-running the generator idempotent during
// development, and lets a label or description be corrected by a later migration.
const sql = `${header}
insert into public.symptom_types
  (id, user_id, slug, name, description, category, scale, is_red_flag, sort_order)
values
${symptomRows}
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  scale = excluded.scale,
  is_red_flag = excluded.is_red_flag,
  sort_order = excluded.sort_order;

insert into public.food_tags
  (id, user_id, slug, name, description, category, aliases, sort_order)
values
${tagRows}
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  aliases = excluded.aliases,
  sort_order = excluded.sort_order;
`;

writeFile(OUT, sql, 'utf8')
  .then(() => {
    console.log(
      `Wrote ${path.relative(process.cwd(), OUT)} — ` +
        `${CURATED_SYMPTOM_TYPES.length} symptom types, ${CURATED_FOOD_TAGS.length} food tags.`
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
