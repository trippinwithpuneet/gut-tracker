# 🌿 Gut Reset — Elimination Tracker

A private, offline tracker for running a 2-week elimination diet and pinning down what actually makes gut gas worse. No accounts, no server, no analytics — your data lives in your browser and nowhere else.

Built as a single `index.html` file with zero dependencies. Drop it on any static host and it works.

## Why

Foul, rotten-egg gas is usually hydrogen sulfide produced when gut bacteria ferment sulfur-rich foods and undigested protein. The only reliable way to find *your* triggers is to eliminate the usual suspects, then reintroduce them one at a time and watch what spikes. This app makes that process trackable and turns your logs into a ranked suspect list.

## Features

- **Daily log** — meals, trigger foods, a 1–5 smell scale, symptoms, and enzyme timing.
- **Two-phase protocol** — Days 1–7 eliminate, Days 8–14 reintroduce. Phase auto-tracks from your first entry.
- **Insights** — average smell for home vs outside food, plus a suspect ranking that sorts each trigger food by how bad the gas was on days you ate it.
- **Red-flag awareness** — flags symptoms (e.g. greasy/floating stools) that warrant a doctor rather than more diet tweaks.
- **Export / import** — back up your data as JSON or move it between devices.
- **Fully offline & private** — all data stored in `localStorage`, never transmitted.

## Run locally

It's a static file. Any of these work:

```bash
# simplest — just open it
open index.html          # macOS
xdg-open index.html      # Linux

# or serve it
python3 -m http.server 8000    # then visit http://localhost:8000
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, branch **main**, folder **/ (root)**.
4. Save. Your site goes live at `https://<username>.github.io/gut-tracker/` within a minute or two.

## Data & privacy

Entries are stored under the `gutreset:` key prefix in your browser's `localStorage`. They are tied to that specific browser and origin — clearing site data wipes them, and they don't sync between devices unless you use **Export / Import**. Nothing is ever sent anywhere.

## Disclaimer

This is a self-tracking tool, not medical advice or a diagnosis. Persistent or worsening symptoms — especially greasy/floating stools, unexplained weight loss, blood, or ongoing pain — should be reviewed by a doctor.

## License

MIT — see [LICENSE](LICENSE). Fork it, adapt it, ship your own version.
