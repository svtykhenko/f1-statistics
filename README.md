# F1 Race Results

A lightweight, zero-dependency web app for browsing Formula 1 race results, standings, circuits, and driver career stats across every season from 1950 to the present.

## Features

- **Season Schedule** — full race calendar for any F1 season with round status badges (Completed / Next Race / Upcoming)
- **Race Results** — detailed finishing order per race: position, driver number, team, grid slot, time/gap/DNF/DSQ, and points scored
- **Driver Standings** — championship table showing points, wins, nationality, and team after the latest completed round
- **Constructor Standings** — team championship table displayed alongside driver standings, showing constructor points and wins
- **Circuits** — browsable grid of all F1 circuits, sorted by country, with locality, lap records, and track lengths
- **Drivers** — season driver grid with number, code, nationality, date of birth, team, points, and wins
- **Driver Career Modal** — click any driver card to open a modal overlay with full career statistics: championships, wins, podiums (P2/P3), poles, seasons active, total points, average points per race, and a per-season standings breakdown
- **Winner preview** — race cards show the race winner (prefetched in the background) without needing to open the detail view
- **Season selector** — browse historical data from 1950 through the current year
- **Team colours** — colour-coded team dots matching official 2025 livery, with fallbacks for legacy constructors
- **Dark theme** — F1-inspired dark UI with red accents, gold/silver/bronze podium highlights, and animated loading spinners
- **Responsive** — single-column layout on narrow screens; sticky header at all viewport sizes
- **Accessible** — semantic HTML, `aria-label`, `aria-pressed`, keyboard navigation on race cards (`Enter` / `Space`); modal dismissible via Escape key, backdrop click, or close button

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Markup | Vanilla HTML5 |
| Styling | Vanilla CSS3 (CSS custom properties, grid, flexbox) |
| Logic | Vanilla JavaScript (ES2020+, `async/await`, `fetch`) |
| Data | [Jolpica F1 API](https://jolpi.ca/ergast) — free, Ergast-compatible REST API |
| CI/CD | GitHub Actions → Cloudflare Pages |
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
├── .github/
│   └── workflows/
│       └── main.yml  # GitHub Actions CI/CD → Cloudflare Pages deployment
├── index.html        # Single-page shell — five view sections, modal overlay, sticky header, footer
├── app.js            # All application logic: fetch, cache, render, navigation, career modal
├── style.css         # Dark theme, responsive grid, tables, modal, animations
└── package.json      # npm scripts and dev-server dependency
```

## How It Works

1. **Bootstrap** — on page load, [`app.js`](app.js) populates the season `<select>` (1950 → current year) and calls `loadSchedule()`.
2. **Schedule view** — fetches `/races.json` for the selected season and renders a responsive card grid. Past races get a green "Completed" badge; the nearest upcoming race gets a red "Next race" badge.
3. **Winner prefetch** — after the schedule renders, `prefetchWinners()` silently fetches the P1 result for every completed race and patches the cards in-place.
4. **Race detail** — clicking a completed race card calls `loadDetail()`, which fetches `/results.json` for that round and renders a results table.
5. **Driver standings** — the "Driver Standings" nav button calls `loadStandings()` and `loadConstructorStandings()` in parallel, rendering both driver and constructor championship tables side-by-side.
6. **Circuits** — the "Circuits" nav button calls `loadCircuits()`, which fetches all circuits and merges static lap record and track length data before rendering a card grid sorted by country.
7. **Drivers** — the "Drivers" nav button calls `loadDrivers()`, which fetches season drivers, pre-fetches driver standings for points/wins, and renders a card grid sorted by given name.
8. **Driver career modal** — clicking a driver card opens a modal that fires parallel requests for wins, podiums, poles, seasons, per-season standings, and paginates all race results to compute total points and average points per race. Results are cached per `driverId` in `cachedCareer` and cleared on season change.
9. **Caching** — schedule, standings, circuits, drivers, and per-round results are stored in module-level variables so repeat visits within the same session make no extra requests. All caches are cleared when the user changes season.

## API Reference

All data comes from the **Jolpica F1 API** (Ergast-compatible):

| Endpoint | Used for |
|----------|---------|
| `GET /ergast/f1/{season}/races.json?limit=30` | Season calendar |
| `GET /ergast/f1/{season}/{round}/results.json?limit=25` | Race finishing order |
| `GET /ergast/f1/{season}/driverstandings.json?limit=25` | Driver championship standings |
| `GET /ergast/f1/{season}/constructorstandings.json?limit=25` | Constructor championship standings |
| `GET /ergast/f1/circuits.json?limit=100` | All F1 circuits |
| `GET /ergast/f1/{season}/drivers.json?limit=50` | Season drivers |
| `GET /ergast/f1/drivers/{driverId}/results.json?limit=100&offset=N` | Driver career race results (paginated) |
| `GET /ergast/f1/drivers/{driverId}/driverstandings.json?limit=100` | Driver per-season standings |

API base: `https://api.jolpi.ca/ergast/f1/`

## Deployment

The app is deployed automatically to **Cloudflare Pages** via GitHub Actions on every push to `main`. The workflow file is at [`.github/workflows/main.yml`](.github/workflows/main.yml).

## License

[MIT](LICENSE)
