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
let cachedSchedule    = null;
let cachedStandings   = null;
let cachedResults     = {};   // keyed by round
let cachedWinners     = {};   // keyed by round → driver name


function resetCaches() {
  cachedSchedule  = null;
  cachedStandings = null;
  cachedResults   = {};
  cachedWinners   = {};
}


// ── DOM refs ─────────────────────────────────────────────────────
const viewSchedule  = document.getElementById('viewSchedule');
const viewDetail    = document.getElementById('viewDetail');
const viewStandings = document.getElementById('viewStandings');

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

const navSchedule  = document.getElementById('navSchedule');
const navStandings = document.getElementById('navStandings');
const backBtn      = document.getElementById('backBtn');
const seasonLabel  = document.getElementById('seasonLabel');
const seasonSelect = document.getElementById('seasonSelect');

// ── View management ──────────────────────────────────────────────
function showView(name) {
  viewSchedule.hidden  = name !== 'schedule';
  viewDetail.hidden    = name !== 'detail';
  viewStandings.hidden = name !== 'standings';
  navSchedule.classList.toggle('active',  name === 'schedule' || name === 'detail');
  navStandings.classList.toggle('active', name === 'standings');
  navSchedule.setAttribute('aria-pressed',  String(name === 'schedule' || name === 'detail'));
  navStandings.setAttribute('aria-pressed', String(name === 'standings'));
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

// ── Navigation ───────────────────────────────────────────────────
navSchedule.addEventListener('click', () => {
  showView('schedule');
  loadSchedule();
});

navStandings.addEventListener('click', () => {
  showView('standings');
  loadStandings();
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
