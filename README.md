# Gut Tracker

Log what you eat and how you feel. After a few weeks, find out which foods actually track with your symptoms — and which ones are in the clear.

Open source, works without an account, and honest about what it doesn't know.

## Why this exists

Most food diaries stop at "here's what you ate". The few that attempt analysis do the naive thing: average your symptom score on days a food appeared and rank the result. That method will tell almost anyone that onions are their problem, because onions are in most meals. It has no idea what a coincidence looks like.

This one is built around that gap:

- **It knows what a fluke looks like.** Every food is tested with a permutation test — your own data, reshuffled two thousand times, asking how often a gap this size shows up by chance.
- **It corrects for asking many questions.** Testing fifteen foods at the usual threshold produces a false culprit about half the time. A Benjamini–Hochberg correction runs across the whole set, so "strong signal" means something.
- **It says when it can't tell.** If onion and garlic went in the same pan every time, no amount of logging separates them. The app says so, and proposes the one meal that would settle it.
- **A skipped day is missing data, not a good day.** Days you didn't log are dropped rather than scored as symptom-free, which is the flaw that makes most self-tracking apps congratulate you for going on holiday.
- **It reports safe foods too.** Knowing what you can eat matters as much as knowing what you can't.

It is a tracker, not a diagnosis, and it never tells you what to eat.

## Any symptom, any diet

Nothing here is hardcoded to one person's problem. During setup you pick which symptoms you care about — foul-smelling gas, constipation, bloating, reflux, skin flares, brain fog, joint pain, twenty-four to choose from — or type your own. Then you pick which food groups to watch, from thirty-seven curated ones plus anything you add.

Each symptom is analysed separately, because the food behind your bloating may not be the food behind your constipation.

## Try it

Sign-in is optional. Open the app and start logging; everything is stored in your browser until you decide otherwise. Signing in with Google syncs across devices and offers to carry your local data across.

## Run it yourself

```bash
git clone https://github.com/trippinwithpuneet/gut-tracker
cd gut-tracker
npm install
npm run dev
```

That's it. With no Supabase project configured the app runs local-only, storing everything in IndexedDB, and hides sign-in. It's fully functional this way.

To add accounts and cross-device sync, see [Self-hosting](docs/SELF_HOSTING.md).

## How the analysis works

The engine lives in `src/lib/analysis/` as pure TypeScript with no React and no database imports. It runs in the browser — a year of logging is a few thousand rows and the whole thing takes milliseconds.

For each symptom, it builds one observation per logged day, then for every food tag and each of two lags (same day, next day) it splits your days into "ate it" and "didn't", takes the difference in mean severity, and asks how likely that gap is by chance.

| Verdict | What it means |
| --- | --- |
| **Strong signal** | Survives correction for every other food tested. About one in ten of these will still be wrong. |
| **Possible** | Real enough to notice, not yet enough to rule out coincidence. |
| **No signal** | Tested, nothing found. |
| **Collecting** | Not enough days with *and* without it to compare. |

The unit of analysis is a day, not a meal, on purpose: three meals share one evening of symptoms, and counting them separately inflates significance until everything looks like a trigger. Timestamps are still used where they carry information — a symptom logged at 11am can't have been caused by an 8pm dinner.

Full reasoning is in the comments of `src/lib/analysis/stats.ts` and `observations.ts`.

## Development

```bash
npm run dev         # dev server
npm test            # analysis engine tests (planted signals, false-positive control)
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm run db:check    # apply migrations to an in-process Postgres and verify RLS
npm run db:gen-seed # regenerate the library seed from src/lib/library.ts
```

`npm run db:check` runs every migration against PGlite with a stubbed auth schema, so SQL errors and missing row-level security surface locally without Docker or a Supabase project.

## Privacy

Health data, treated as such:

- Local mode transmits nothing. Ever.
- Signed in, every table is protected by row-level security keyed to your user id. The service-role key is not used anywhere in this codebase.
- Export everything to JSON at any time. Delete everything from the You tab.
- No analytics, no tracking, no third-party scripts.

## Where it came from

This started as `legacy/index.html` — a single 528-line file, one person's two-week elimination diet, nine hardcoded trigger foods and a smell scale. It's still in the repo, still works offline, and its exports import cleanly into this version.

## Contributing

Adding a food group or symptom is one entry in `src/lib/library.ts` followed by `npm run db:gen-seed`. Slugs are permanent identity — labels can change freely, slugs cannot, since entry ids are derived from them.

## Disclaimer

This finds associations in your own log. It does not diagnose, does not establish cause, and is not medical advice. Persistent or worsening symptoms — especially blood in stool, greasy or floating stools, or unexplained weight loss — should be looked at by a doctor.

## License

MIT — see [LICENSE](LICENSE).
