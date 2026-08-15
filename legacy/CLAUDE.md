# CLAUDE.md — context for Claude Code

Guidance for working in this repo. Read before making changes.

## What this is

A single-file, dependency-free, offline web app: a 2-week elimination-diet tracker
for identifying foods that worsen gut gas. Everything lives in `index.html`.

## Hard constraints — keep these true

- **Single file.** All HTML, CSS, and JS stay inline in `index.html`. Do not add a
  build step, framework, bundler, or `package.json`. The only external requests are
  Google Fonts (Fraunces + Inter) via `<link>`; the app must remain fully functional
  offline if those fail.
- **No dependencies.** Vanilla JS only. No React, no libraries, no CDN scripts.
- **No network calls for data.** All persistence is local. Never add a backend,
  analytics, telemetry, or any `fetch` that sends user data anywhere.
- **Preserve the medical disclaimer** in the footer and README, and the red-flag
  note logic. This is a tracker, not medical advice — don't add anything that
  gives dosages, diagnoses, or treatment instructions.

## Storage model

- Persistence is `localStorage` with an in-memory fallback (for sandboxed contexts
  where `localStorage` throws). See the `sGet/sSet/sDel/sListDays` helpers.
- All keys are namespaced with `NS = 'gutreset:'`.
- Each day is one key: `gutreset:day:YYYY-MM-DD` → JSON of the entry object:
  `{ date, meals, outside, triggers[], sev, symptoms[], enzymes, notes }`.
- Export/import round-trips the same entry objects as a JSON file.
- If you change the entry shape, keep backward-compat on read (old entries must
  still load) and bump the export `version`.

## Code map (within index.html)

- `TRIGGERS` — the trigger-food list. Add/edit foods here; `id` must be stable
  (it's persisted in entries) and `outside:true` marks restaurant-only items.
- `SEV_COLORS` — 1–5 smell-scale colour ramp, reused by pills and bars.
- Trigger chips, severity scale, red-flag reveal — wired up near the top of the script.
- `render()` → `updatePhase()`, `renderHistory()`, `renderInsights()`. Call `render()`
  after any data change.
- `renderInsights()` — home-vs-outside averages + suspect ranking (avg severity on
  days a trigger appeared, min 2 days to show).

## Conventions

- Design tokens are CSS custom properties in `:root` (pine/amber/brick palette).
  Derive new colours from these; don't introduce a competing palette.
- Escape any user-entered text with `escapeHtml()` before inserting into the DOM.
- Keep it responsive down to ~360px and keyboard-accessible (visible focus states
  already exist — preserve them).

## Testing a change

Open `index.html` in a browser (or `python3 -m http.server 8000`). Log a couple of
days, confirm entries persist across reload, and confirm export → import round-trips.
