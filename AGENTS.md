<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Gut Tracker — context for agents

An open-source food and symptom tracker that finds which foods statistically track with a user's symptoms. Next.js App Router, TypeScript, Tailwind v4, Supabase.

Read this before changing anything. The constraints below exist for reasons that are not obvious from the code alone.

## The thing that makes this app different

Anyone can average symptom scores by food. This app's entire value is that it does **not** overclaim. Before changing anything in `src/lib/analysis/`, understand these four rules — each one is load-bearing, and breaking any of them turns the app into a confident random-food generator:

1. **A day the user didn't log is missing data, not a symptom-free day.** `outcomeFor()` returns `null` for unobserved days and callers drop them. Score them as zero and a two-week holiday reads as a fortnight of relief from whatever they stopped eating.
2. **The unit of analysis is a day, not a meal.** Three meals share one evening of symptoms. Treating each as independent is pseudo-replication and inflates significance until everything looks like a trigger.
3. **Multiple-comparison correction is not optional.** Testing 15 foods at p < 0.05 produces a false culprit about half the time. `benjaminiHochberg()` runs across the whole family of (tag, lag) hypotheses per symptom.
4. **Results must be deterministic.** The permutation test is seeded from the hypothesis identity. A user who refreshes and sees a verdict flip learns, correctly, not to trust the app.

`npm test` guards all four with planted-signal fixtures and false-positive control. If a change makes those tests fail, the change is wrong, not the tests.

## Layout

```
src/lib/analysis/    Pure TS engine. No React, no Supabase imports. Fully unit-tested.
src/lib/store/       DataStore interface + LocalStore (IndexedDB) and CloudStore (Supabase).
src/lib/library.ts   Curated symptoms and food tags — the single source of truth.
src/lib/uuid.ts      Deterministic UUIDv5 so local and cloud ids match.
src/app/             Routes: / (log), /insights, /tests, /you, /onboarding, /privacy.
supabase/migrations/ Schema + RLS. The seed migration is GENERATED — do not hand-edit.
legacy/              The original single-file app. Still works. Its exports still import.
```

## Rules that will bite you

- **The library seed is generated.** Edit `src/lib/library.ts`, then run `npm run db:gen-seed`. Never edit `supabase/migrations/*_seed_libraries.sql` by hand.
- **Slugs are permanent identity.** Row ids are UUIDv5 hashes of the slug, so renaming a slug orphans every entry tagged with it. Labels and descriptions are free to change.
- **Local mode is a first-class path, not a fallback.** Every feature works signed out. `isSupabaseConfigured` being false is a supported state — never assume a Supabase client exists.
- **Both stores must stay interchangeable.** Anything added to the `DataStore` interface needs a real implementation in `local.ts` *and* `cloud.ts`, or sign-in migration silently drops data.
- **Every cloud write stamps `user_id`.** That is also what RLS checks, so getting it wrong fails closed rather than leaking across accounts.
- **Dates are local-calendar, never UTC.** Use the helpers in `src/lib/dates.ts`. `toISOString().slice(0,10)` files an 11pm meal in Asia under the next day and corrupts the exposure windows.
- **Never claim causation.** Copy lives in `src/lib/analysis/copy.ts`. "Tracks with", "on days you ate", "looks clear" — never "you are intolerant to", never a recommendation about what to eat. Red-flag symptoms point at a doctor.
- **No analytics, no telemetry, no third-party scripts.** This stores health data. Adding a tracker is not a judgement call.

## Design

Dark by design, not preference — used at night, one-handed, right after a meal. Tokens are in `src/app/globals.css` under `@theme`; derive new colours from them. Tap targets clear 44px, inputs stay at 16px so iOS doesn't zoom. There is deliberately no light mode.

## Commands

```bash
npm run dev
npm test             # analysis engine — the important one
npm run typecheck
npm run build
npm run db:check     # migrations against in-process Postgres, verifies RLS is on everywhere
npm run db:gen-seed  # regenerate the library seed after editing library.ts
```

`db:check` needs no Docker and no Supabase project, so there is no excuse for shipping broken SQL.

## Testing a change end to end

Open the app signed out, complete onboarding, log a meal and a symptom, and check `/insights`. To exercise the full insights UI without weeks of logging, generate a synthetic export with `src/lib/analysis/fixtures.ts` and import it from the You tab.
