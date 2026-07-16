/* ─────────────────────────────────────────────────────────────────
   F1 Race Results  –  app.js
   API: Jolpica (Ergast-compatible)  https://api.jolpi.ca/ergast/f1/
   ───────────────────────────────────────────────────────────────── */

const CURRENT_YEAR = new Date().getFullYear();
let   SEASON       = CURRENT_YEAR;
let   BASE         = `https://api.jolpi.ca/ergast/f1/${SEASON}`;

// ── Team colours (constructor IDs → hex) ─────────────────────────
const TEAM_COLORS = {
  red_bull:           '#3671C6',
  ferrari:            '#E8002D',
  mercedes:           '#27F4D2',
  mclaren:            '#FF8000',
  aston_martin:       '#229971',
  alpine:             '#FF87BC',
  haas:               '#B6BABD',
  williams:           '#64C4FF',
  rb:                 '#6692FF',
  kick_sauber:        '#52E252',
  sauber:             '#52E252',
  alphatauri:         '#5E8FAA',
  alfa:               '#900000',
  racing_point:       '#F596C8',
  renault:            '#FFF500',
  toro_rosso:         '#469BFF',
  force_india:        '#FF80C7',
  manor:              '#323232',
  lotus_f1:           '#FFB800',
  marussia:           '#6E0000',
  caterham:           '#005030',
};

function teamColor(constructorId) {
  return TEAM_COLORS[constructorId] || '#888';
}

// ── Utilities ────────────────────────────────────────────────────
function fmt(dateStr) {
  if (!dateStr) return '–';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function flag(country) {
  const map = {
    'Australia':'🇦🇺','Bahrain':'🇧🇭','Saudi Arabia':'🇸🇦','Japan':'🇯🇵',
    'China':'🇨🇳','USA':'🇺🇸','United States':'🇺🇸','Miami':'🇺🇸',
    'Italy':'🇮🇹','Monaco':'🇲🇨','Canada':'🇨🇦','Spain':'🇪🇸',
    'Austria':'🇦🇹','UK':'🇬🇧','United Kingdom':'🇬🇧','Hungary':'🇭🇺',
    'Belgium':'🇧🇪','Netherlands':'🇳🇱','Azerbaijan':'🇦🇿','Singapore':'🇸🇬',
    'Mexico':'🇲🇽','Brazil':'🇧🇷','Las Vegas':'🇺🇸','Qatar':'🇶🇦',
    'Abu Dhabi':'🇦🇪',
  };
  return map[country] || '🏁';
}

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} – ${res.statusText}`);
  return res.json();
}

// ── State ────────────────────────────────────────────────────────
let cachedSchedule              = null;
let cachedStandings             = null;
let cachedConstructorStandings  = null;
let cachedCircuits              = null;
let cachedDrivers               = null;
let cachedResults               = {};   // keyed by round
let cachedWinners               = {};   // keyed by round → driver name


function resetCaches() {
  cachedSchedule             = null;
  cachedStandings            = null;
  cachedConstructorStandings = null;
  cachedCircuits             = null;
  cachedDrivers              = null;
  cachedResults              = {};
  cachedWinners              = {};
  Object.keys(cachedCareer).forEach(k => delete cachedCareer[k]);
}


// ── DOM refs ─────────────────────────────────────────────────────
const viewSchedule  = document.getElementById('viewSchedule');
const viewDetail    = document.getElementById('viewDetail');
const viewStandings = document.getElementById('viewStandings');
const viewCircuits  = document.getElementById('viewCircuits');
const viewDrivers   = document.getElementById('viewDrivers');

const raceGrid       = document.getElementById('raceGrid');
const scheduleLoader = document.getElementById('scheduleLoader');
const scheduleError  = document.getElementById('scheduleError');

const raceDetailHeader  = document.getElementById('raceDetailHeader');
const raceResultsTable  = document.getElementById('raceResultsTable');
const detailLoader      = document.getElementById('detailLoader');
const detailError       = document.getElementById('detailError');

const standingsTable  = document.getElementById('standingsTable');
const standingsLoader = document.getElementById('standingsLoader');
const standingsError  = document.getElementById('standingsError');

const constructorTable  = document.getElementById('constructorTable');
const constructorLoader = document.getElementById('constructorLoader');
const constructorError  = document.getElementById('constructorError');

const navSchedule  = document.getElementById('navSchedule');
const navStandings = document.getElementById('navStandings');
const navCircuits  = document.getElementById('navCircuits');
const navDrivers   = document.getElementById('navDrivers');
const backBtn      = document.getElementById('backBtn');

const circuitsGrid   = document.getElementById('circuitsGrid');
const circuitsLoader = document.getElementById('circuitsLoader');
const circuitsError  = document.getElementById('circuitsError');

const driversGrid   = document.getElementById('driversGrid');
const driversLoader = document.getElementById('driversLoader');
const driversError  = document.getElementById('driversError');
const seasonLabel  = document.getElementById('seasonLabel');
const seasonSelect = document.getElementById('seasonSelect');

// ── View management ──────────────────────────────────────────────
function showView(name) {
  viewSchedule.hidden  = name !== 'schedule';
  viewDetail.hidden    = name !== 'detail';
  viewStandings.hidden = name !== 'standings';
  viewCircuits.hidden  = name !== 'circuits';
  viewDrivers.hidden   = name !== 'drivers';
  navSchedule.classList.toggle('active',  name === 'schedule' || name === 'detail');
  navStandings.classList.toggle('active', name === 'standings');
  navCircuits.classList.toggle('active',  name === 'circuits');
  navDrivers.classList.toggle('active',   name === 'drivers');
  navSchedule.setAttribute('aria-pressed',  String(name === 'schedule' || name === 'detail'));
  navStandings.setAttribute('aria-pressed', String(name === 'standings'));
  navCircuits.setAttribute('aria-pressed',  String(name === 'circuits'));
  navDrivers.setAttribute('aria-pressed',   String(name === 'drivers'));
}

function showError(el, msg) {
  el.hidden = false;
  el.textContent = `⚠ ${msg}`;
}

// ── Schedule ────────────────────────────────────────────────────
async function loadSchedule() {
  if (cachedSchedule) { renderSchedule(cachedSchedule); return; }
  scheduleLoader.hidden = false;
  scheduleError.hidden  = true;
  raceGrid.innerHTML    = '';

  try {
    const data = await fetchJSON(`${BASE}/races.json?limit=30`);
    cachedSchedule = data.MRData.RaceTable.Races;
    scheduleLoader.hidden = true;
    renderSchedule(cachedSchedule);
    // Pre-load winners for completed races
    prefetchWinners(cachedSchedule);
  } catch (err) {
    scheduleLoader.hidden = true;
    showError(scheduleError, `Could not load schedule: ${err.message}`);
  }
}

async function prefetchWinners(races) {
  const today = new Date();
  for (const race of races) {
    const raceDate = new Date(race.date + 'T00:00:00');
    if (raceDate > today) break;
    const round = race.round;
    if (cachedWinners[round] !== undefined) continue;

    try {
      const data = await fetchJSON(`${BASE}/${round}/results.json?limit=1`);
      const res  = data.MRData.RaceTable.Races[0]?.Results?.[0];
      if (res) {
        const name = `${res.Driver.givenName} ${res.Driver.familyName}`;
        cachedWinners[round] = { name, constructorId: res.Constructor.constructorId };
        // Patch card if already rendered
        const card = document.querySelector(`[data-round="${round}"]`);
        if (card) {
          const winnerEl = card.querySelector('.card-winner');
          if (winnerEl) winnerEl.innerHTML = winnerHTML(name);
        }
      }
    } catch (_) { /* best-effort */ }
  }
}

function winnerHTML(name) {
  return `<span>🏆</span><span>${esc(name)}</span>`;
}

function renderSchedule(races) {
  const today = new Date();
  let nextRound = null;

  races.forEach(race => {
    const raceDate  = new Date(race.date + 'T00:00:00');
    const completed = raceDate < today;
    if (!completed && nextRound === null) nextRound = race.round;
  });

  const completed = races.filter(r => new Date(r.date + 'T00:00:00') < today).length;
  document.getElementById('scheduleMeta').textContent =
    `${races.length} rounds  ·  ${completed} completed`;
  document.getElementById('scheduleTitle').textContent = `${SEASON} Race Calendar`;
  seasonLabel.textContent = `${SEASON} Season`;

  raceGrid.innerHTML = '';
  races.forEach(race => {
    const raceDate   = new Date(race.date + 'T00:00:00');
    const isCompleted = raceDate < today;
    const isNext      = race.round === nextRound;

    let statusClass, badgeClass, badgeText;
    if (isCompleted) { statusClass='completed'; badgeClass='badge-completed'; badgeText='Results ↗'; }
    else if (isNext) { statusClass='next';      badgeClass='badge-next';      badgeText='Next race'; }
    else             { statusClass='upcoming';  badgeClass='badge-upcoming';  badgeText='Upcoming'; }

    const winnerEntry = cachedWinners[race.round];
    const winnerSnippet = winnerEntry
      ? `<div class="card-winner">${winnerHTML(winnerEntry.name)}</div>`
      : isCompleted
        ? `<div class="card-winner" data-waiting="1"><span style="color:var(--muted);font-size:.75rem;">Loading winner…</span></div>`
        : '';

    const card = document.createElement('div');
    card.className = `race-card ${statusClass}`;
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('data-round', race.round);
    card.setAttribute('aria-label', `Round ${race.round}: ${race.raceName}`);

    card.innerHTML = `
      <div class="card-round">Round ${esc(race.round)}</div>
      <div class="card-name">${esc(race.raceName)}</div>
      <div class="card-circuit">${esc(race.Circuit.circuitName)}</div>
      <div class="card-meta">
        <span class="card-date">${flag(race.Circuit.Location.country)} ${esc(race.Circuit.Location.country)} · ${fmt(race.date)}</span>
        <span class="card-badge ${badgeClass}">${badgeText}</span>
      </div>
      ${winnerSnippet}
    `;

    if (isCompleted) {
      card.addEventListener('click', () => loadDetail(race));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') loadDetail(race); });
    }

    raceGrid.appendChild(card);
  });
}

// ── Race Detail ─────────────────────────────────────────────────
async function loadDetail(race) {
  showView('detail');
  detailLoader.hidden  = false;
  detailError.hidden   = true;
  raceResultsTable.innerHTML = '';
  raceDetailHeader.innerHTML = '';

  raceDetailHeader.innerHTML = `
    <div class="detail-round">Round ${esc(race.round)} · ${SEASON}</div>
    <div class="detail-name">${esc(race.raceName)}</div>
    <div class="detail-meta-row">
      <span class="detail-meta-item">${flag(race.Circuit.Location.country)} <strong>${esc(race.Circuit.Location.country)}</strong></span>
      <span class="detail-meta-item">🏟 <strong>${esc(race.Circuit.circuitName)}</strong></span>
      <span class="detail-meta-item">📅 <strong>${fmt(race.date)}</strong></span>
    </div>
  `;

  if (cachedResults[race.round]) {
    renderResults(cachedResults[race.round]);
    detailLoader.hidden = true;
    return;
  }

  try {
    const data    = await fetchJSON(`${BASE}/${race.round}/results.json?limit=25`);
    const results = data.MRData.RaceTable.Races[0]?.Results ?? [];
    cachedResults[race.round] = results;
    detailLoader.hidden = true;
    renderResults(results);
  } catch (err) {
    detailLoader.hidden = true;
    showError(detailError, `Could not load results: ${err.message}`);
  }
}

function renderResults(results) {
  if (!results.length) {
    raceResultsTable.innerHTML = '<p style="color:var(--muted);padding:20px 0">No result data available yet.</p>';
    return;
  }

  const laps      = results[0]?.laps ?? '–';
  const totalTime = results[0]?.Time?.time ?? '–';
  const totalLaps = document.querySelector('.detail-meta-row');
  if (totalLaps) {
    totalLaps.insertAdjacentHTML('beforeend',
      `<span class="detail-meta-item">🔄 <strong>${esc(String(laps))} laps</strong></span>` +
      `<span class="detail-meta-item">⏱ <strong>${esc(totalTime)}</strong> (winner)</span>`
    );
  }

  const rows = results.map(r => {
    const pos       = parseInt(r.position, 10);
    const posClass  = pos <= 3 ? `pos-${pos}` : '';
    const name      = `${r.Driver.givenName} ${r.Driver.familyName}`;
    const team      = r.Constructor.name;
    const cid       = r.Constructor.constructorId;
    const color     = teamColor(cid);
    const time      = r.Time?.time ?? null;
    const status    = r.status;
    const pts       = r.points;
    const grid      = r.grid;

    let timeCell;
    if (pos === 1 && time) {
      timeCell = `<span class="time-cell">${esc(time)}</span>`;
    } else if (time) {
      timeCell = `<span class="time-cell">+${esc(time)}</span>`;
    } else if (status === 'Finished') {
      timeCell = `<span class="time-cell">–</span>`;
    } else if (/DSQ/i.test(status)) {
      timeCell = `<span class="status-dsq">DSQ</span>`;
    } else {
      timeCell = `<span class="status-dnf">DNF <small>(${esc(status)})</small></span>`;
    }

    return `
      <tr>
        <td class="pos-cell ${posClass}">${esc(r.position)}</td>
        <td class="driver-cell"><span class="driver-num">${esc(r.number)}</span>${esc(name)}</td>
        <td class="team-cell">
          <span class="team-dot" style="background:${color}"></span>${esc(team)}
        </td>
        <td>${esc(String(grid))}</td>
        <td>${timeCell}</td>
        <td class="pts-cell">${esc(pts)}</td>
      </tr>`;
  }).join('');

  raceResultsTable.innerHTML = `
    <table aria-label="Race results">
      <thead>
        <tr>
          <th>Pos</th>
          <th>Driver</th>
          <th>Team</th>
          <th>Grid</th>
          <th>Time / Status</th>
          <th>Pts</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Driver Standings ─────────────────────────────────────────────
async function loadStandings() {
  if (cachedStandings) { renderStandings(cachedStandings); return; }
  standingsLoader.hidden = false;
  standingsError.hidden  = true;
  standingsTable.innerHTML = '';

  try {
    const data = await fetchJSON(`${BASE}/driverstandings.json?limit=25`);
    const list = data.MRData.StandingsTable.StandingsLists[0];
    cachedStandings = list;
    standingsLoader.hidden = true;
    renderStandings(list);
  } catch (err) {
    standingsLoader.hidden = true;
    showError(standingsError, `Could not load standings: ${err.message}`);
  }
}

// ── Constructor Standings ─────────────────────────────────────────
async function loadConstructorStandings() {
  if (cachedConstructorStandings) { renderConstructorStandings(cachedConstructorStandings); return; }
  constructorLoader.hidden = false;
  constructorError.hidden  = true;
  constructorTable.innerHTML = '';

  try {
    const data = await fetchJSON(`${BASE}/constructorstandings.json?limit=15`);
    const list = data.MRData.StandingsTable.StandingsLists[0];
    cachedConstructorStandings = list;
    constructorLoader.hidden = true;
    renderConstructorStandings(list);
  } catch (err) {
    constructorLoader.hidden = true;
    showError(constructorError, `Could not load constructor standings: ${err.message}`);
  }
}

function renderConstructorStandings(list) {
  if (!list) {
    constructorTable.innerHTML = '<p style="color:var(--muted);padding:20px 0">Constructor standings not yet available for this season.</p>';
    return;
  }

  const rows = list.ConstructorStandings.map(s => {
    const pos      = parseInt(s.position, 10);
    const posClass = pos <= 3 ? `pos-${pos}` : '';
    const name     = s.Constructor.name;
    const cid      = s.Constructor.constructorId;
    const color    = teamColor(cid);
    const wins     = s.wins;
    const pts      = s.points;

    return `
      <tr>
        <td class="pos-cell ${posClass}">${esc(s.position)}</td>
        <td class="team-cell">
          <span class="team-dot" style="background:${color}"></span>${esc(name)}
        </td>
        <td class="pts-cell" style="text-align:center">${esc(wins)}</td>
        <td class="pts-cell">${esc(pts)}</td>
      </tr>`;
  }).join('');

  constructorTable.innerHTML = `
    <table aria-label="Constructor championship standings">
      <thead>
        <tr>
          <th>Pos</th>
          <th>Constructor</th>
          <th style="text-align:center">Wins</th>
          <th>Points</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderStandings(list) {
  if (!list) {
    standingsTable.innerHTML = '<p style="color:var(--muted);padding:20px 0">Standings not yet available for this season.</p>';
    return;
  }

  document.getElementById('standingsMeta').textContent =
    `After round ${list.round} · ${list.season} season`;

  const rows = list.DriverStandings.map(s => {
    const pos   = parseInt(s.position, 10);
    const posClass = pos <= 3 ? `pos-${pos}` : '';
    const name  = `${s.Driver.givenName} ${s.Driver.familyName}`;
    const nat   = s.Driver.nationality;
    const team  = s.Constructors[0]?.name ?? '–';
    const cid   = s.Constructors[0]?.constructorId ?? '';
    const color = teamColor(cid);
    const wins  = s.wins;
    const pts   = s.points;

    return `
      <tr>
        <td class="pos-cell ${posClass}">${esc(s.position)}</td>
        <td class="driver-cell">${esc(name)}</td>
        <td style="color:var(--muted);font-size:.8rem">${esc(nat)}</td>
        <td class="team-cell">
          <span class="team-dot" style="background:${color}"></span>${esc(team)}
        </td>
        <td class="pts-cell" style="text-align:center">${esc(wins)}</td>
        <td class="pts-cell">${esc(pts)}</td>
      </tr>`;
  }).join('');

  standingsTable.innerHTML = `
    <table aria-label="Driver championship standings">
      <thead>
        <tr>
          <th>Pos</th>
          <th>Driver</th>
          <th>Nationality</th>
          <th>Team</th>
          <th style="text-align:center">Wins</th>
          <th>Points</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Circuits ─────────────────────────────────────────────────────
async function loadCircuits() {
  if (cachedCircuits) { renderCircuits(cachedCircuits); return; }
  circuitsLoader.hidden = false;
  circuitsError.hidden  = true;
  circuitsGrid.innerHTML = '';

  try {
    // Fetch all circuits (API returns up to 1000 with limit=1000)
    const data = await fetchJSON('https://api.jolpi.ca/ergast/f1/circuits.json?limit=1000');
    cachedCircuits = data.MRData.CircuitTable.Circuits;
    circuitsLoader.hidden = true;
    renderCircuits(cachedCircuits);
  } catch (err) {
    circuitsLoader.hidden = true;
    showError(circuitsError, `Could not load circuits: ${err.message}`);
  }
}

// Static lap-record data for well-known circuits (circuitId → { time, driver, year })
const LAP_RECORDS = {
  albert_park:      { time: '1:20.235', driver: 'Charles Leclerc',    year: 2024 },
  bahrain:          { time: '1:31.447', driver: 'Pedro de la Rosa',   year: 2005 },
  jeddah:           { time: '1:27.511', driver: 'Lewis Hamilton',     year: 2021 },
  suzuka:           { time: '1:30.983', driver: 'Lewis Hamilton',     year: 2019 },
  shanghai:         { time: '1:32.238', driver: 'Michael Schumacher', year: 2004 },
  miami:            { time: '1:29.708', driver: 'Max Verstappen',     year: 2023 },
  imola:            { time: '1:15.484', driver: 'Valtteri Bottas',    year: 2020 },
  monaco:           { time: '1:12.909', driver: 'Rubens Barrichello', year: 2004 },
  villeneuve:       { time: '1:13.078', driver: 'Valtteri Bottas',    year: 2019 },
  catalunya:        { time: '1:18.149', driver: 'Max Verstappen',     year: 2023 },
  red_bull_ring:    { time: '1:05.619', driver: 'Carlos Sainz',       year: 2020 },
  silverstone:      { time: '1:27.097', driver: 'Max Verstappen',     year: 2020 },
  hungaroring:      { time: '1:16.627', driver: 'Lewis Hamilton',     year: 2020 },
  spa:              { time: '1:46.286', driver: 'Valtteri Bottas',    year: 2018 },
  zandvoort:        { time: '1:11.097', driver: 'Lewis Hamilton',     year: 2021 },
  monza:            { time: '1:21.046', driver: 'Rubens Barrichello', year: 2004 },
  baku:             { time: '1:43.009', driver: 'Charles Leclerc',    year: 2019 },
  marina_bay:       { time: '1:35.867', driver: 'Kevin Magnussen',    year: 2018 },
  rodriguez:        { time: '1:17.774', driver: 'Valtteri Bottas',    year: 2021 },
  interlagos:       { time: '1:10.540', driver: 'Valtteri Bottas',    year: 2018 },
  vegas:            { time: '1:35.119', driver: 'Oscar Piastri',      year: 2024 },
  losail:           { time: '1:24.319', driver: 'Max Verstappen',     year: 2023 },
  yas_marina:       { time: '1:26.103', driver: 'Max Verstappen',     year: 2021 },
  nurburgring:      { time: '1:29.919', driver: 'Michael Schumacher', year: 2004 },
  hockenheimring:   { time: '1:13.780', driver: 'Kimi Räikkönen',     year: 2004 },
  sepang:           { time: '1:34.223', driver: 'Juan Pablo Montoya', year: 2004 },
  istanbul:         { time: '1:24.770', driver: 'Max Verstappen',     year: 2020 },
  valencia:         { time: '1:38.683', driver: 'Timo Glock',         year: 2009 },
  yeongam:          { time: '1:38.678', driver: 'Sebastian Vettel',   year: 2011 },
  americas:         { time: '1:36.169', driver: 'Charles Leclerc',    year: 2019 },
  portimao:         { time: '1:19.912', driver: 'Valtteri Bottas',    year: 2020 },
  mugello:          { time: '1:17.939', driver: 'Lewis Hamilton',     year: 2020 },
  algarve:          { time: '1:19.912', driver: 'Valtteri Bottas',    year: 2020 },
};

// Static circuit-length data (km) for common circuits
const CIRCUIT_LENGTHS = {
  albert_park:    5.278, bahrain:       5.412, jeddah:        6.174,
  suzuka:         5.807, shanghai:      5.451, miami:         5.412,
  imola:          4.909, monaco:        3.337, villeneuve:    4.361,
  catalunya:      4.657, red_bull_ring: 4.318, silverstone:   5.891,
  hungaroring:    4.381, spa:           7.004, zandvoort:     4.259,
  monza:          5.793, baku:          6.003, marina_bay:    4.940,
  rodriguez:      4.304, interlagos:    4.309, vegas:         6.201,
  losail:         5.380, yas_marina:    5.281, nurburgring:   5.148,
  hockenheimring: 4.574, sepang:        5.543, istanbul:      5.338,
  valencia:       5.419, americas:      5.513, portimao:      4.653,
  mugello:        5.245,
};

function renderCircuits(circuits) {
  document.getElementById('circuitsMeta').textContent =
    `${circuits.length} circuits in the F1 database`;

  // Sort alphabetically by country then circuit name
  const sorted = [...circuits].sort((a, b) => {
    const cmp = a.Location.country.localeCompare(b.Location.country);
    return cmp !== 0 ? cmp : a.circuitName.localeCompare(b.circuitName);
  });

  circuitsGrid.innerHTML = sorted.map(c => {
    const cid    = c.circuitId;
    const rec    = LAP_RECORDS[cid];
    const len    = CIRCUIT_LENGTHS[cid];
    const recHtml = rec
      ? `<div class="circuit-stat"><span class="stat-label">Lap Record</span><span class="stat-value">${esc(rec.time)} <span class="stat-sub">${esc(rec.driver)}, ${rec.year}</span></span></div>`
      : '';
    const lenHtml = len
      ? `<div class="circuit-stat"><span class="stat-label">Length</span><span class="stat-value">${len.toFixed(3)} km</span></div>`
      : '';

    return `
      <div class="circuit-card">
        <div class="circuit-country">${flag(c.Location.country)} ${esc(c.Location.country)}</div>
        <div class="circuit-name">${esc(c.circuitName)}</div>
        <div class="circuit-locality">${esc(c.Location.locality)}</div>
        <div class="circuit-stats">
          ${lenHtml}
          ${recHtml}
        </div>
      </div>`;
  }).join('');
}

// ── Drivers ──────────────────────────────────────────────────────
async function loadDrivers() {
  if (cachedDrivers) { renderDrivers(cachedDrivers); return; }
  driversLoader.hidden = false;
  driversError.hidden  = true;
  driversGrid.innerHTML = '';

  try {
    const [driversData, standingsData] = await Promise.all([
      fetchJSON(`${BASE}/drivers.json?limit=100`),
      cachedStandings ? Promise.resolve(null) : fetchJSON(`${BASE}/driverstandings.json?limit=100`),
    ]);

    if (standingsData) {
      cachedStandings = standingsData.MRData.StandingsTable.StandingsLists[0];
    }

    const allDrivers = driversData.MRData.DriverTable.Drivers;
    const standingIds = new Set(
      (cachedStandings?.DriverStandings ?? []).map(s => s.Driver.driverId)
    );
    cachedDrivers = standingIds.size > 0
      ? allDrivers.filter(d => standingIds.has(d.driverId))
      : allDrivers;

    driversLoader.hidden = true;
    renderDrivers(cachedDrivers);
  } catch (err) {
    driversLoader.hidden = true;
    showError(driversError, `Could not load drivers: ${err.message}`);
  }
}

const NAT_FLAG = {
  'American':'🇺🇸','Australian':'🇦🇺','Austrian':'🇦🇹','Bahraini':'🇧🇭',
  'Belgian':'🇧🇪','Brazilian':'🇧🇷','British':'🇬🇧','Canadian':'🇨🇦',
  'Chinese':'🇨🇳','Colombian':'🇨🇴','Czech':'🇨🇿','Danish':'🇩🇰',
  'Dutch':'🇳🇱','Finnish':'🇫🇮','French':'🇫🇷','German':'🇩🇪',
  'Hungarian':'🇭🇺','Indian':'🇮🇳','Indonesian':'🇮🇩','Italian':'🇮🇹',
  'Japanese':'🇯🇵','Malaysian':'🇲🇾','Mexican':'🇲🇽','Monegasque':'🇲🇨',
  'New Zealander':'🇳🇿','Polish':'🇵🇱','Portuguese':'🇵🇹','Russian':'🇷🇺',
  'Saudi Arabian':'🇸🇦','Spanish':'🇪🇸','Swedish':'🇸🇪','Swiss':'🇨🇭',
  'Thai':'🇹🇭','Venezuelan':'🇻🇪',
};

function natFlag(nationality) {
  return NAT_FLAG[nationality] || '🏁';
}

function renderDrivers(drivers) {
  document.getElementById('driversMeta').textContent =
    `${drivers.length} driver${drivers.length !== 1 ? 's' : ''} · ${SEASON} season`;

  const sorted = [...drivers].sort((a, b) =>
    a.givenName.localeCompare(b.givenName)
  );

  // We also want to pull in current standings data for points/wins if available
  const standingsMap = {};
  if (cachedStandings && cachedStandings.DriverStandings) {
    cachedStandings.DriverStandings.forEach(s => {
      standingsMap[s.Driver.driverId] = s;
    });
  }

  driversGrid.innerHTML = sorted.map(d => {
    const name       = `${esc(d.givenName)} ${esc(d.familyName)}`;
    const nat        = d.nationality || '–';
    const dob        = d.dateOfBirth ? fmt(d.dateOfBirth) : '–';
    const num        = d.permanentNumber ? `#${esc(d.permanentNumber)}` : '';
    const code       = d.code ? `<span class="driver-code">${esc(d.code)}</span>` : '';
    const standing   = standingsMap[d.driverId];
    const pts        = standing ? standing.points : '–';
    const wins       = standing ? standing.wins   : '–';
    const team       = standing ? (standing.Constructors[0]?.name ?? '–') : '–';
    const cid        = standing ? (standing.Constructors[0]?.constructorId ?? '') : '';
    const color      = teamColor(cid);
    const teamDot    = cid ? `<span class="team-dot" style="background:${color}"></span>` : '';

    const statsHtml = standing ? `
      <div class="driver-stats">
        <div class="driver-stat"><span class="stat-label">Team</span><span class="stat-value">${teamDot}${esc(team)}</span></div>
        <div class="driver-stat"><span class="stat-label">Points</span><span class="stat-value">${esc(String(pts))}</span></div>
        <div class="driver-stat"><span class="stat-label">Wins</span><span class="stat-value">${esc(String(wins))}</span></div>
      </div>` : '';

    return `
      <div class="driver-card" role="button" tabindex="0" data-driver-id="${esc(d.driverId)}" style="cursor:pointer">
        <div class="driver-card-top">
          <span class="driver-num-badge">${num}</span>${code}
        </div>
        <div class="driver-name">${name}</div>
        <div class="driver-meta">
          <span class="driver-nat">${natFlag(nat)} ${esc(nat)}</span>
          <span class="driver-dob">Born ${dob}</span>
        </div>
        ${statsHtml}
      </div>`;
  }).join('');

  // Attach click (and keyboard) listeners to each card
  driversGrid.querySelectorAll('.driver-card').forEach(card => {
    const handler = () => openDriverModal(
      sorted.find(d => d.driverId === card.dataset.driverId),
      standingsMap[card.dataset.driverId] || null
    );
    card.addEventListener('click', handler);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
  });
}

// ── Driver stats modal ────────────────────────────────────────────

const driverModal  = document.getElementById('driverModal');
const modalClose   = document.getElementById('modalClose');
const modalLoader  = document.getElementById('modalLoader');
const modalError   = document.getElementById('modalError');
const modalStats   = document.getElementById('modalStats');

// Per-driver career cache  { driverId → { championships, seasons, races, wins, podiums, poles, avgPts } }
const cachedCareer = {};

function closeDriverModal() {
  driverModal.hidden = true;
  document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeDriverModal);
driverModal.addEventListener('click', e => { if (e.target === driverModal) closeDriverModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !driverModal.hidden) closeDriverModal(); });

async function openDriverModal(driver, standing) {
  // Populate static info immediately
  document.getElementById('modalNum').textContent  = driver.permanentNumber ? `#${driver.permanentNumber}` : '';
  document.getElementById('modalCode').textContent = driver.code || '';
  document.getElementById('modalDriverName').textContent = `${driver.givenName} ${driver.familyName}`;
  document.getElementById('modalNat').textContent  = `${natFlag(driver.nationality || '')} ${driver.nationality || '–'}`;
  document.getElementById('modalDob').textContent  = driver.dateOfBirth ? `Born ${fmt(driver.dateOfBirth)}` : '';

  const teamEl = document.getElementById('modalTeam');
  if (standing) {
    const cid   = standing.Constructors[0]?.constructorId ?? '';
    const tname = standing.Constructors[0]?.name ?? '–';
    const color = teamColor(cid);
    teamEl.innerHTML = cid
      ? `<span class="team-dot" style="background:${color}"></span>${esc(tname)}`
      : esc(tname);
  } else {
    teamEl.textContent = '';
  }

  // Show modal, reset inner state
  driverModal.hidden = false;
  document.body.style.overflow = 'hidden';
  modalLoader.hidden = false;
  modalError.hidden  = true;
  modalStats.hidden  = true;
  modalStats.innerHTML = '';

  try {
    const stats = await fetchCareerStats(driver.driverId);
    renderDriverModalStats(stats, standing);
  } catch (err) {
    modalLoader.hidden = true;
    showError(modalError, `Could not load career stats: ${err.message}`);
  }
}

async function fetchCareerStats(driverId) {
  if (cachedCareer[driverId]) return cachedCareer[driverId];

  const base = `https://api.jolpi.ca/ergast/f1/drivers/${driverId}`;

  // Phase 1: fetch aggregate totals + seasons list in parallel.
  // The filtered endpoints (results/1, grid/1, etc.) return just a `total`
  // count when limit=1, so these are tiny fast requests.
  const [winsRes, p2Res, p3Res, polesRes, seasonsRes] = await Promise.all([
    fetchJSON(`${base}/results/1.json?limit=1`),          // wins
    fetchJSON(`${base}/results/2.json?limit=1`),          // P2 finishes
    fetchJSON(`${base}/results/3.json?limit=1`),          // P3 finishes
    fetchJSON(`${base}/grid/1/results.json?limit=1`),     // pole positions
    fetchJSON(`${base}/seasons.json?limit=100`),          // career seasons
  ]);

  const wins    = parseInt(winsRes.MRData.total, 10);
  const p2      = parseInt(p2Res.MRData.total, 10);
  const p3      = parseInt(p3Res.MRData.total, 10);
  const podiums = wins + p2 + p3;
  const poles   = parseInt(polesRes.MRData.total, 10);
  const seasonList = seasonsRes.MRData.SeasonTable.Seasons ?? [];
  const seasons    = seasonList.length;

  // Phase 2: for each career season fetch the driver's final standing (position).
  // Championships = seasons where position === "1".
  // These are tiny single-driver responses; fire them all in parallel.
  const standingReqs = seasonList.map(s =>
    fetchJSON(`https://api.jolpi.ca/ergast/f1/${s.season}/drivers/${driverId}/driverstandings.json?limit=1`)
      .catch(() => null)   // ignore seasons where standing is not yet available
  );
  const standingPages = await Promise.all(standingReqs);
  const championships = standingPages.filter(res => {
    if (!res) return false;
    const sl = res.MRData?.StandingsTable?.StandingsLists?.[0];
    return sl?.DriverStandings?.[0]?.position === '1';
  }).length;

  // Phase 3: total races and career points — paginate results (max 100/page).
  const firstPage  = await fetchJSON(`${base}/results.json?limit=100&offset=0`);
  const totalRaces = parseInt(firstPage.MRData.total, 10);
  let   races      = [...(firstPage.MRData.RaceTable.Races ?? [])];

  if (totalRaces > 100) {
    const pagePromises = [];
    for (let offset = 100; offset < totalRaces; offset += 100) {
      pagePromises.push(fetchJSON(`${base}/results.json?limit=100&offset=${offset}`));
    }
    const pages = await Promise.all(pagePromises);
    pages.forEach(p => { races = races.concat(p.MRData.RaceTable.Races ?? []); });
  }

  let totalPoints = 0;
  races.forEach(race => {
    totalPoints += parseFloat(race.Results?.[0]?.points) || 0;
  });

  const avgPts = races.length > 0 ? (totalPoints / races.length).toFixed(2) : '–';

  const stats = { championships, seasons, totalRaces: races.length, wins, podiums, poles, totalPoints, avgPts };
  cachedCareer[driverId] = stats;
  return stats;
}

function renderDriverModalStats(stats, standing) {
  const seasonPts  = standing ? standing.points : null;
  const seasonPos  = standing ? standing.position : null;

  const boxes = [
    { label: 'Championships', value: stats.championships, cls: stats.championships > 0 ? 'champ' : '', sub: stats.championships > 0 ? '🏆' : '' },
    { label: 'Seasons',       value: stats.seasons,       sub: 'in F1' },
    { label: 'Races',         value: stats.totalRaces,    sub: 'career starts' },
    { label: 'Wins',          value: stats.wins,          sub: `${stats.podiums} podiums` },
    { label: 'Poles',         value: stats.poles,         sub: 'pole positions' },
    { label: 'Avg Points',    value: stats.avgPts,        sub: 'per race (career)' },
    ...(seasonPts !== null ? [{ label: `${SEASON} Points`, value: seasonPts, sub: seasonPos ? `P${seasonPos} in standings` : '' }] : []),
  ];

  modalStats.innerHTML = boxes.map(b => `
    <div class="modal-stat-box">
      <span class="modal-stat-label">${esc(b.label)}</span>
      <span class="modal-stat-value${b.cls ? ' ' + b.cls : ''}">${esc(String(b.value))}${b.sub && b.cls ? ' ' + esc(b.sub) : ''}</span>
      ${b.sub && !b.cls ? `<span class="modal-stat-sub">${esc(b.sub)}</span>` : ''}
    </div>`).join('');

  modalLoader.hidden = true;
  modalStats.hidden  = false;
}

// ── Navigation ───────────────────────────────────────────────────
navSchedule.addEventListener('click', () => {
  showView('schedule');
  loadSchedule();
});

navStandings.addEventListener('click', () => {
  showView('standings');
  loadStandings();
  loadConstructorStandings();
});

navCircuits.addEventListener('click', () => {
  showView('circuits');
  loadCircuits();
});

navDrivers.addEventListener('click', () => {
  showView('drivers');
  // Pre-fetch standings so points/wins data is available in the cards
  loadStandings().then(() => loadDrivers());
});

backBtn.addEventListener('click', () => {
  showView('schedule');
});

seasonSelect.addEventListener('change', () => {
  SEASON = parseInt(seasonSelect.value, 10);
  BASE   = `https://api.jolpi.ca/ergast/f1/${SEASON}`;
  resetCaches();
  showView('schedule');
  loadSchedule();
});

// ── Bootstrap ────────────────────────────────────────────────────

// Populate season selector (F1 World Championship started in 1950)
for (let y = CURRENT_YEAR; y >= 1950; y--) {
  const opt = document.createElement('option');
  opt.value = y;
  opt.textContent = y;
  if (y === CURRENT_YEAR) opt.selected = true;
  seasonSelect.appendChild(opt);
}

showView('schedule');
loadSchedule();
