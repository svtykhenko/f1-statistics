# F1 Race Results

A lightweight, zero-dependency web app for browsing Formula 1 race results, standings, circuits, and driver career stats across every season from 1950 to the present.

## Features

- **Season Schedule** — full race calendar for any F1 season with round status badges (Completed / Next Race / Upcoming)
- **Race Weekend Tabs** — each completed race exposes tabbed session views:
  - 🏁 **Race** — finishing order, grid position, time/gap/DNF/DSQ, and points
  - ⏱ **Qualifying** — Q1/Q2/Q3 times per driver
  - 🏃 **Sprint** & 🔥 **Sprint Shoot-out** — shown only for sprint-format weekends
  - **FP1 / FP2 / FP3** — best lap times and gaps from OpenF1 live timing data
- **Driver Standings** — championship table showing points, wins, nationality, and team after the latest completed round
- **Constructor Standings** — team championship table displayed alongside driver standings
- **Circuits** — browsable grid of all F1 circuits, sorted by country, with locality, lap records, and track lengths
- **Drivers** — season driver grid with number, code, nationality, date of birth, team, points, and wins
- **Driver Career Modal** — click any driver card to open a modal overlay with full career statistics: championships, wins, podiums, poles, seasons active, total points, and average points per race
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
| Primary data | [Jolpica F1 API](https://jolpi.ca/ergast) — free, Ergast-compatible REST API |
| Fallback data | [Ergast API](https://ergast.com/mrd/) — automatic fallback if Jolpica is unreachable |
| Practice data | [OpenF1 API](https://openf1.org) — live timing for practice sessions |
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

Alternatively, just open `index.html` directly in a browser — the app makes all requests to public APIs, so no local backend is required.

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
2. **Schedule view** — fetches `/races.json` for the selected season and renders a responsive card grid. Past races get a "Completed" badge; the nearest upcoming race gets a "Next race" badge.
3. **Winner prefetch** — after the schedule renders, `prefetchWinners()` silently fetches the P1 result for every completed race and patches the cards in-place. Requests are processed one at a time through the shared rate-limit queue.
4. **Race detail** — clicking a completed race card calls `loadDetail()`, which builds session tabs for the weekend (Race, Qualifying, Sprint where applicable, and practice sessions).
5. **Session data** — `switchSession()` lazy-loads data on first tab click and caches the result. Race and qualifying data come from Jolpica; practice session data (best lap per driver) comes from the OpenF1 API.
6. **Driver standings** — the "Championship Standings" nav button calls `loadStandings()` and `loadConstructorStandings()` in parallel, rendering both driver and constructor tables side-by-side.
7. **Circuits** — the "Circuits" nav button calls `loadCircuits()`, which fetches all circuits and merges static lap record and track length data before rendering a card grid sorted by country.
8. **Drivers** — the "Drivers" nav button calls `loadDrivers()`, which fetches season drivers and pre-fetches driver standings for points/wins, then renders a card grid sorted by given name.
9. **Driver career modal** — clicking a driver card opens a modal that fetches wins, podiums, poles, seasons, per-season standings (in batches), and all race results (paginated in batches) to compute total points and average points per race. Results are cached per `driverId` in `cachedCareer` and cleared on season change.
10. **Caching** — all responses are stored at two levels: module-level variables (for the current session) and `localStorage` with a TTL (across page reloads). All caches are cleared when the user changes season.

## Rate Limiting & Caching

The Jolpica API is a free service with limits of **4 requests per second** (burst) and **500 requests per hour** (sustained). The app is designed to stay well within these bounds.

### Request queue

All Jolpica and Ergast API calls are routed through a shared throttled queue (`queuedFetch`):

- **Max 2 concurrent** requests at any time
- **≥300 ms gap** between dispatches (~3 req/s ceiling)
- **HTTP 429 retry** — when a `429 Too Many Requests` response is received, the request is re-queued at the front with exponential back-off (respects the `Retry-After` header; falls back to `1 s × 2ⁿ`, up to 3 retries)

OpenF1 requests (`loadPractice`, `resolveMeetingKey`) bypass this queue — they hit a different API with independent limits.

### Batched parallel requests

The driver career modal previously fired all per-season standing lookups simultaneously (`Promise.all` over an unbounded array). For drivers like Hamilton (18 seasons) or Alonso (20+ seasons) this could launch 20+ requests at once. The app now uses `batchedAll()` to cap concurrency:

- **Phase 2** (per-season standings for championship count): **4 at a time**
- **Phase 3** (career result pagination): **3 pages at a time**

### localStorage cache

Every successful queued response is written to `localStorage` with a URL-keyed entry and a timestamp:

| Data type | TTL |
|-----------|-----|
| Current season (`/f1/{currentYear}/...`) | 4 hours |
| Historical seasons | 30 days |

On subsequent page loads, valid cache entries are returned immediately without hitting the network. The cache is bypassed (and re-populated) once the TTL expires.

## API Reference

### Jolpica F1 API (primary) · `https://api.jolpi.ca/ergast/f1/`

| Endpoint | Used for |
|----------|---------|
| `GET /{season}/races.json?limit=30` | Season calendar |
| `GET /{season}/{round}/results.json?limit=25` | Race finishing order |
| `GET /{season}/{round}/qualifying.json?limit=25` | Qualifying results |
| `GET /{season}/{round}/sprint.json?limit=25` | Sprint race results |
| `GET /{season}/{round}/sprintqualifying.json?limit=25` | Sprint shoot-out results |
| `GET /{season}/driverstandings.json?limit=25` | Driver championship standings |
| `GET /{season}/constructorstandings.json?limit=25` | Constructor championship standings |
| `GET /circuits.json?limit=1000` | All F1 circuits |
| `GET /{season}/drivers.json?limit=100` | Season drivers |
| `GET /drivers/{id}/results/1.json?limit=1` | Career win count |
| `GET /drivers/{id}/results.json?limit=100&offset=N` | Career race results (paginated) |
| `GET /{season}/drivers/{id}/driverstandings.json?limit=1` | Per-season final standing |

If any Jolpica request fails, the equivalent path is automatically retried against the **Ergast fallback** (`https://ergast.com/api/f1/`).

### OpenF1 API · `https://api.openf1.org/v1/`

| Endpoint | Used for |
|----------|---------|
| `GET /meetings?year={season}` | Resolve meeting key for a race weekend |
| `GET /sessions?meeting_key={key}&session_name=Practice+N` | Resolve session key for a practice session |
| `GET /laps?session_key={key}` | All lap times for the session |
| `GET /drivers?session_key={key}` | Driver metadata (name, team, colour) |

## Deployment

The app is deployed automatically to **Cloudflare Pages** via GitHub Actions on every push to `main`. The workflow file is at [`.github/workflows/main.yml`](.github/workflows/main.yml).

## License

[MIT](LICENSE)
