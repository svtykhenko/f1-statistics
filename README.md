# 🏎 F1 Race Results

A lightweight, zero-dependency web app for browsing Formula 1 race results and driver championship standings across every season from 1950 to the present.

## Features

- **Season Schedule** — full race calendar for any F1 season with round status badges (Completed / Next Race / Upcoming)
- **Race Results** — detailed finishing order per race: position, driver number, team, grid slot, time/gap/DNF/DSQ, and points scored
- **Driver Standings** — championship table showing points, wins, nationality, and team after the latest completed round
- **Winner preview** — race cards show the race winner (prefetched in the background) without needing to open the detail view
- **Season selector** — browse historical data from 1950 through the current year
- **Team colours** — colour-coded team dots matching official 2025 livery, with fallbacks for legacy constructors
- **Dark theme** — F1-inspired dark UI with red accents, gold/silver/bronze podium highlights, and animated loading spinners
- **Responsive** — single-column layout on narrow screens; sticky header at all viewport sizes
- **Accessible** — semantic HTML, `aria-label`, `aria-pressed`, keyboard navigation on race cards (`Enter` / `Space`)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Markup | Vanilla HTML5 |
| Styling | Vanilla CSS3 (CSS custom properties, grid, flexbox) |
| Logic | Vanilla JavaScript (ES2020+, `async/await`, `fetch`) |
| Data | [Jolpica F1 API](https://jolpi.ca/ergast) — free, Ergast-compatible REST API |
| Dev server | [`serve`](https://github.com/vercel/serve) (via `npx`) |

No bundler, no framework, no build step.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ (only needed to run the local dev server)

### Run locally

```bash
# 1. Clone or download the project
git clone <repo-url>
cd f1-statistics

# 2. Install the dev server
npm install

# 3. Start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Alternatively, just open `index.html` directly in a browser — the app makes all requests to the public Jolpica API, so no local backend is required.

## Project Structure

```
f1-statistics/
├── index.html   # Single-page shell — three view sections, sticky header, footer
├── app.js       # All application logic: fetch, cache, render, navigation
├── style.css    # Dark theme, responsive grid, tables, animations
└── package.json # npm scripts and dev-server dependency
```

## How It Works

1. **Bootstrap** — on page load, [`app.js`](app.js) populates the season `<select>` (1950 → current year) and calls `loadSchedule()`.
2. **Schedule view** — fetches `/races.json` for the selected season and renders a responsive card grid. Past races get a green "Completed" badge; the nearest upcoming race gets a red "Next race" badge.
3. **Winner prefetch** — after the schedule renders, `prefetchWinners()` silently fetches the P1 result for every completed race and patches the cards in-place.
4. **Race detail** — clicking a completed race card calls `loadDetail()`, which fetches `/results.json` for that round and renders a sortable-looking results table.
5. **Driver standings** — the "Driver Standings" nav button calls `loadStandings()`, which fetches `/driverstandings.json` and renders the championship table.
6. **Caching** — schedule, standings, and per-round results are stored in module-level variables so repeat visits within the same session make no extra requests. Cache is cleared when the user changes season.

## API Reference

All data comes from the **Jolpica F1 API** (Ergast-compatible):

| Endpoint | Used for |
|----------|---------|
| `GET /ergast/f1/{season}/races.json?limit=30` | Season calendar |
| `GET /ergast/f1/{season}/{round}/results.json?limit=25` | Race finishing order |
| `GET /ergast/f1/{season}/driverstandings.json?limit=25` | Championship standings |

API base: `https://api.jolpi.ca/ergast/f1/`

## License

[MIT](LICENSE)
