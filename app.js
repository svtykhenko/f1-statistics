/* ─────────────────────────────────────────────────────────────────
   F1 Race Results  –  app.js
   Primary API  : Jolpica  https://api.jolpi.ca/ergast/f1/
   Fallback API : Ergast   https://ergast.com/api/f1/
   Rate limits  : 4 req/s burst · 500 req/hr sustained (unauthenticated)
   ───────────────────────────────────────────────────────────────── */

const CURRENT_YEAR   = new Date().getFullYear();
let   SEASON         = CURRENT_YEAR;
let   BASE           = `https://api.jolpi.ca/ergast/f1/${SEASON}`;
const ERGAST_BASE_ROOT = 'https://ergast.com/api/f1';

// ── Throttled request queue ───────────────────────────────────────
// Max 2 concurrent requests, ≥300 ms between dispatches.
// Keeps the app well under the 4 req/s burst limit even when many
// callers enqueue requests simultaneously (e.g. career stats modal).
// On HTTP 429 the failing request is re-queued with exponential back-off.
//
// OpenF1 requests bypass the queue via fetchJSON directly — they are
// rate-limited independently and not subject to Jolpica limits.

const QUEUE_CONCURRENCY = 2;
const QUEUE_INTERVAL_MS = 300;
const MAX_RETRIES       = 3;
const RETRY_BASE_MS     = 1000;

let _queueActive  = 0;
const _queuePending = [];
let _lastDispatch = 0;

function _dispatchNext() {
  if (_queueActive >= QUEUE_CONCURRENCY || _queuePending.length === 0) return;
  const now  = Date.now();
  const wait = Math.max(0, _lastDispatch + QUEUE_INTERVAL_MS - now);
  setTimeout(() => {
    if (_queueActive >= QUEUE_CONCURRENCY || _queuePending.length === 0) return;
    _queueActive++;
    _lastDispatch = Date.now();
    const task = _queuePending.shift();
    _runTask(task);
    _dispatchNext();
  }, wait);
}

async function _runTask({ url, resolve, reject, retries }) {
  try {
    const res = await fetch(url);

    if (res.status === 429) {
      // Respect Retry-After header when present; otherwise exponential back-off
      const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10);
      const delay = retryAfter > 0
        ? retryAfter * 1000
        : RETRY_BASE_MS * Math.pow(2, MAX_RETRIES - retries + 1);
      if (retries > 0) {
        setTimeout(() => {
          _queueActive--;
          _queuePending.unshift({ url, resolve, reject, retries: retries - 1 });
          _dispatchNext();
        }, delay);
        return;
      }
      _queueActive--;
      _dispatchNext();
      reject(new Error('Rate limited (HTTP 429). Please wait a moment and try again.'));
      return;
    }

    if (!res.ok) {
      _queueActive--;
      _dispatchNext();
      reject(new Error(`HTTP ${res.status} – ${res.statusText}`));
      return;
    }

    const json = await res.json();
    lsSet(url, json);
    _queueActive--;
    _dispatchNext();
    resolve(json);
  } catch (err) {
    _queueActive--;
    _dispatchNext();
    reject(err);
  }
}

// ── localStorage persistent cache with TTL ────────────────────────
// Historical season data never changes → 30-day TTL.
// Current-season data can update after each race → 4-hour TTL.
// OpenF1 URLs are not cached here (they use fetchJSON directly).

const LS_PREFIX     = 'f1stats_';
const LS_TTL_STATIC = 30 * 24 * 60 * 60 * 1000;  // 30 days
const LS_TTL_LIVE   =  4 * 60 * 60 * 1000;        // 4 hours

function _lsTtl(url) {
  return (url.includes(`/f1/${CURRENT_YEAR}/`) || url.includes(`/f1/${SEASON}/`))
    ? LS_TTL_LIVE
    : LS_TTL_STATIC;
}

function lsSet(url, data) {
  try {
    localStorage.setItem(LS_PREFIX + url, JSON.stringify({ ts: Date.now(), data }));
  } catch (_) { /* quota exceeded — skip silently */ }
}

function lsGet(url) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + url);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > _lsTtl(url)) {
      localStorage.removeItem(LS_PREFIX + url);
      return null;
    }
    return data;
  } catch (_) { return null; }
}

// ── Queued fetch for Jolpica/Ergast ──────────────────────────────
// Hits localStorage first; otherwise enqueues through the throttled queue.
// Use this for all Jolpica and Ergast API calls.
function queuedFetch(url) {
  const cached = lsGet(url);
  if (cached !== null) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    _queuePending.push({ url, resolve, reject, retries: MAX_RETRIES });
    _dispatchNext();
  });
}

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

// Plain fetch for non-Jolpica URLs (OpenF1). No queue, no LS cache.
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} – ${res.statusText}`);
  return res.json();
}

/**
 * Fetch from the primary Jolpica URL via the throttled queue.
 * On failure, retry the equivalent path on the Ergast fallback host.
 * Both APIs share the same path/query-string convention.
 *
 * @param {string} primaryUrl  - Full URL starting with BASE or api.jolpi.ca
 * @returns {Promise<any>}
 */
async function fetchWithFallback(primaryUrl) {
  try {
    return await queuedFetch(primaryUrl);
  } catch (primaryErr) {
    // Derive the fallback URL by replacing the Jolpica root with the Ergast root.
    // e.g. https://api.jolpi.ca/ergast/f1/2025/races.json?limit=30
    //   → https://ergast.com/api/f1/2025/races.json?limit=30
    const fallbackUrl = primaryUrl
      .replace(/^https?:\/\/api\.jolpi\.ca\/ergast\/f1/, ERGAST_BASE_ROOT);
    if (fallbackUrl === primaryUrl) throw primaryErr; // no substitution possible
    console.warn(`[F1] Primary source failed (${primaryErr.message}). Retrying via Ergast fallback…`);
    return await queuedFetch(fallbackUrl);
  }
}

// ── State ────────────────────────────────────────────────────────
let cachedSchedule              = null;
let cachedStandings             = null;
let cachedConstructorStandings  = null;
let cachedCircuits              = null;
let cachedDrivers               = null;
let cachedResults               = {};   // keyed by round
let cachedWinners               = {};   // keyed by round → driver name
let cachedSessions              = {};   // keyed by `${round}:sessionKey`
let cachedMeetingKeys           = {};   // keyed by round → OpenF1 meeting_key


function resetCaches() {
  cachedSchedule             = null;
  cachedStandings            = null;
  cachedConstructorStandings = null;
  cachedCircuits             = null;
  cachedDrivers              = null;
  cachedResults              = {};
  cachedWinners              = {};
  cachedSessions             = {};
  cachedMeetingKeys          = {};
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
    const data = await fetchWithFallback(`${BASE}/races.json?limit=30`);
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
      const data = await fetchWithFallback(`${BASE}/${round}/results.json?limit=1`);
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

const sessionTabs = document.getElementById('sessionTabs');

let currentRace = null; // the race object currently shown in detail view

async function loadDetail(race) {
  currentRace = race;
  showView('detail');
  raceResultsTable.innerHTML = '';
  raceDetailHeader.innerHTML = '';
  sessionTabs.innerHTML = '';
  detailLoader.hidden = true;
  detailError.hidden  = true;

  raceDetailHeader.innerHTML = `
    <div class="detail-round">Round ${esc(race.round)} · ${SEASON}</div>
    <div class="detail-name">${esc(race.raceName)}</div>
    <div class="detail-meta-row">
      <span class="detail-meta-item">${flag(race.Circuit.Location.country)} <strong>${esc(race.Circuit.Location.country)}</strong></span>
      <span class="detail-meta-item">🏟 <strong>${esc(race.Circuit.circuitName)}</strong></span>
      <span class="detail-meta-item">📅 <strong>${fmt(race.date)}</strong></span>
    </div>
  `;

  // Build the ordered list of sessions that exist for this weekend
  const isSprint = !!(race.Sprint);
  const sessions = [
    { key: 'race',   label: '🏁 Race' },
    { key: 'quali',  label: '⏱ Qualifying' },
    ...(isSprint ? [
      { key: 'sprint',      label: '🏃 Sprint' },
      { key: 'sprintquali', label: '🔥 Sprint Shoot-out' },
    ] : []),
    { key: 'fp1', label: 'FP1', disabled: !race.FirstPractice },
    ...(!isSprint ? [
      { key: 'fp2', label: 'FP2', disabled: !race.SecondPractice },
      { key: 'fp3', label: 'FP3', disabled: !race.ThirdPractice },
    ] : []),
  ];

  sessions.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'session-tab';
    btn.textContent = s.label;
    btn.dataset.session = s.key;
    btn.setAttribute('role', 'tab');
    if (s.disabled) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => switchSession(race, s.key));
    }
    sessionTabs.appendChild(btn);
  });

  switchSession(race, 'race');
}

function setActiveTab(key) {
  sessionTabs.querySelectorAll('.session-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.session === key);
    btn.setAttribute('aria-selected', String(btn.dataset.session === key));
  });
}

async function switchSession(race, sessionKey) {
  setActiveTab(sessionKey);
  raceResultsTable.innerHTML = '';
  detailError.hidden = true;

  const cacheKey = `${race.round}:${sessionKey}`;
  if (cachedSessions[cacheKey] !== undefined) {
    renderSession(sessionKey, cachedSessions[cacheKey], race);
    return;
  }

  detailLoader.hidden = false;

  try {
    let data;
    if (sessionKey === 'race') {
      data = await loadRaceResults(race);
    } else if (sessionKey === 'quali') {
      data = await loadQualifying(race);
    } else if (sessionKey === 'sprint') {
      data = await loadSprint(race);
    } else if (sessionKey === 'sprintquali') {
      data = await loadSprintQuali(race);
    } else if (sessionKey === 'fp1') {
      data = await loadPractice(race, 1);
    } else if (sessionKey === 'fp2') {
      data = await loadPractice(race, 2);
    } else if (sessionKey === 'fp3') {
      data = await loadPractice(race, 3);
    }
    cachedSessions[cacheKey] = data;
    detailLoader.hidden = true;
    renderSession(sessionKey, data, race);
  } catch (err) {
    detailLoader.hidden = true;
    showError(detailError, `Could not load session data: ${err.message}`);
  }
}

function renderSession(sessionKey, data, race) {
  if (sessionKey === 'race')        return renderResults(data, race);
  if (sessionKey === 'quali')       return renderQualifying(data);
  if (sessionKey === 'sprint')      return renderSprintResults(data);
  if (sessionKey === 'sprintquali') return renderSprintQuali(data);
  if (sessionKey === 'fp1' || sessionKey === 'fp2' || sessionKey === 'fp3')
    return renderPractice(data);
}

// ── Race Results ─────────────────────────────────────────────────
async function loadRaceResults(race) {
  const data    = await fetchWithFallback(`${BASE}/${race.round}/results.json?limit=25`);
  const results = data.MRData.RaceTable.Races[0]?.Results ?? [];
  // back-compat: also populate old cachedResults for prefetchWinners
  cachedResults[race.round] = results;
  return results;
}

function renderResults(results, race) {
  if (!results.length) {
    raceResultsTable.innerHTML = '<p style="color:var(--muted);padding:20px 0">No result data available yet.</p>';
    return;
  }

  const laps      = results[0]?.laps ?? '–';
  const totalTime = results[0]?.Time?.time ?? '–';
  const metaRow   = document.querySelector('.detail-meta-row');
  if (metaRow) {
    metaRow.insertAdjacentHTML('beforeend',
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
        <td class="team-cell"><span class="team-dot" style="background:${color}"></span>${esc(team)}</td>
        <td>${esc(String(grid))}</td>
        <td>${timeCell}</td>
        <td class="pts-cell">${esc(pts)}</td>
      </tr>`;
  }).join('');

  raceResultsTable.innerHTML = `
    <table aria-label="Race results">
      <thead><tr>
        <th>Pos</th><th>Driver</th><th>Team</th><th>Grid</th><th>Time / Status</th><th>Pts</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Qualifying ───────────────────────────────────────────────────
async function loadQualifying(race) {
  const data = await fetchWithFallback(`${BASE}/${race.round}/qualifying.json?limit=25`);
  return data.MRData.RaceTable.Races[0]?.QualifyingResults ?? [];
}

function renderQualifying(results) {
  if (!results.length) {
    raceResultsTable.innerHTML = '<p style="color:var(--muted);padding:20px 0">Qualifying data not yet available.</p>';
    return;
  }
  const rows = results.map(r => {
    const pos      = parseInt(r.position, 10);
    const posClass = pos <= 3 ? `pos-${pos}` : '';
    const name     = `${r.Driver.givenName} ${r.Driver.familyName}`;
    const cid      = r.Constructor.constructorId;
    const color    = teamColor(cid);
    const q1       = r.Q1 || '–';
    const q2       = r.Q2 || '–';
    const q3       = r.Q3 || '–';
    return `
      <tr>
        <td class="pos-cell ${posClass}">${esc(r.position)}</td>
        <td class="driver-cell"><span class="driver-num">${esc(r.number)}</span>${esc(name)}</td>
        <td class="team-cell"><span class="team-dot" style="background:${color}"></span>${esc(r.Constructor.name)}</td>
        <td class="time-cell">${esc(q1)}</td>
        <td class="time-cell">${esc(q2)}</td>
        <td class="time-cell">${esc(q3)}</td>
      </tr>`;
  }).join('');
  raceResultsTable.innerHTML = `
    <table aria-label="Qualifying results">
      <thead><tr>
        <th>Pos</th><th>Driver</th><th>Team</th><th>Q1</th><th>Q2</th><th>Q3</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Sprint Race ──────────────────────────────────────────────────
async function loadSprint(race) {
  const data = await fetchWithFallback(`${BASE}/${race.round}/sprint.json?limit=25`);
  return data.MRData.RaceTable.Races[0]?.SprintResults ?? [];
}

function renderSprintResults(results) {
  if (!results.length) {
    raceResultsTable.innerHTML = '<p style="color:var(--muted);padding:20px 0">Sprint data not yet available.</p>';
    return;
  }
  const rows = results.map(r => {
    const pos       = parseInt(r.position, 10);
    const posClass  = pos <= 3 ? `pos-${pos}` : '';
    const name      = `${r.Driver.givenName} ${r.Driver.familyName}`;
    const cid       = r.Constructor.constructorId;
    const color     = teamColor(cid);
    const time      = r.Time?.time ?? null;
    const status    = r.status;

    let timeCell;
    if (pos === 1 && time) {
      timeCell = `<span class="time-cell">${esc(time)}</span>`;
    } else if (time) {
      timeCell = `<span class="time-cell">+${esc(time)}</span>`;
    } else if (/DSQ/i.test(status)) {
      timeCell = `<span class="status-dsq">DSQ</span>`;
    } else if (status !== 'Finished') {
      timeCell = `<span class="status-dnf">DNF <small>(${esc(status)})</small></span>`;
    } else {
      timeCell = `<span class="time-cell">–</span>`;
    }

    return `
      <tr>
        <td class="pos-cell ${posClass}">${esc(r.position)}</td>
        <td class="driver-cell"><span class="driver-num">${esc(r.number)}</span>${esc(name)}</td>
        <td class="team-cell"><span class="team-dot" style="background:${color}"></span>${esc(r.Constructor.name)}</td>
        <td>${esc(String(r.grid))}</td>
        <td>${timeCell}</td>
        <td class="pts-cell">${esc(r.points)}</td>
      </tr>`;
  }).join('');
  raceResultsTable.innerHTML = `
    <table aria-label="Sprint race results">
      <thead><tr>
        <th>Pos</th><th>Driver</th><th>Team</th><th>Grid</th><th>Time / Status</th><th>Pts</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Sprint Qualifying (Shoot-out) ────────────────────────────────
async function loadSprintQuali(race) {
  // Jolpica exposes sprint qualifying under /sprintqualifying
  const data = await fetchWithFallback(`${BASE}/${race.round}/sprintqualifying.json?limit=25`);
  return data.MRData.RaceTable.Races[0]?.SprintQualifyingResults ?? [];
}

function renderSprintQuali(results) {
  if (!results.length) {
    raceResultsTable.innerHTML = '<p style="color:var(--muted);padding:20px 0">Sprint shoot-out data not yet available.</p>';
    return;
  }
  const rows = results.map(r => {
    const pos      = parseInt(r.position, 10);
    const posClass = pos <= 3 ? `pos-${pos}` : '';
    const name     = `${r.Driver.givenName} ${r.Driver.familyName}`;
    const cid      = r.Constructor.constructorId;
    const color    = teamColor(cid);
    return `
      <tr>
        <td class="pos-cell ${posClass}">${esc(r.position)}</td>
        <td class="driver-cell"><span class="driver-num">${esc(r.number)}</span>${esc(name)}</td>
        <td class="team-cell"><span class="team-dot" style="background:${color}"></span>${esc(r.Constructor.name)}</td>
        <td class="time-cell">${esc(r.SQ1 || '–')}</td>
        <td class="time-cell">${esc(r.SQ2 || '–')}</td>
        <td class="time-cell">${esc(r.SQ3 || '–')}</td>
      </tr>`;
  }).join('');
  raceResultsTable.innerHTML = `
    <table aria-label="Sprint shoot-out results">
      <thead><tr>
        <th>Pos</th><th>Driver</th><th>Team</th><th>SQ1</th><th>SQ2</th><th>SQ3</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Practice (via OpenF1) ────────────────────────────────────────
// OpenF1 is the only source with practice timing data.
// Strategy: resolve meeting_key from schedule year+round, get session_key,
//           fetch all laps + drivers in parallel, compute best lap per driver.

const OPENF1 = 'https://api.openf1.org/v1';

async function resolveMeetingKey(race) {
  if (cachedMeetingKeys[race.round]) return cachedMeetingKeys[race.round];
  // OpenF1 year param matches Ergast season
  const data = await fetchJSON(`${OPENF1}/meetings?year=${SEASON}`);
  // Match by circuit country/locality or race name (fuzzy: lowercase includes)
  const raceName = race.raceName.toLowerCase();
  const country  = race.Circuit.Location.country.toLowerCase();
  const locality = race.Circuit.Location.locality.toLowerCase();

  let meeting = data.find(m => {
    const mn = (m.meeting_name || '').toLowerCase();
    const cn = (m.country_name || '').toLowerCase();
    const loc = (m.location || '').toLowerCase();
    return mn.includes(country) || cn.includes(country) ||
           loc.includes(locality) || mn.includes(locality);
  });
  if (!meeting) {
    // fallback: pick by round index (meetings are ordered)
    const sortedMeetings = data
      .filter(m => !m.meeting_name.toLowerCase().includes('test'))
      .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
    meeting = sortedMeetings[parseInt(race.round, 10) - 1];
  }
  if (!meeting) throw new Error('Could not find OpenF1 meeting for this round');
  cachedMeetingKeys[race.round] = meeting.meeting_key;
  return meeting.meeting_key;
}

async function loadPractice(race, fpNum) {
  const sessionName = `Practice ${fpNum}`;
  const meetingKey  = await resolveMeetingKey(race);

  // Get session_key for this practice session
  const sessions = await fetchJSON(`${OPENF1}/sessions?meeting_key=${meetingKey}&session_name=${encodeURIComponent(sessionName)}`);
  if (!sessions.length) return [];
  const sessionKey = sessions[0].session_key;

  // Fetch laps + driver info in parallel
  const [lapsData, driversData] = await Promise.all([
    fetchJSON(`${OPENF1}/laps?session_key=${sessionKey}`),
    fetchJSON(`${OPENF1}/drivers?session_key=${sessionKey}`),
  ]);

  // Build driver lookup: number → { name, team, teamColour }
  const driverMap = {};
  driversData.forEach(d => {
    driverMap[d.driver_number] = {
      name:       d.full_name || d.name_acronym || String(d.driver_number),
      acronym:    d.name_acronym || '',
      team:       d.team_name || '–',
      teamColour: d.team_colour ? `#${d.team_colour}` : '#888',
    };
  });

  // Compute best valid lap per driver (exclude deleted/pit laps)
  const bestLap = {};
  lapsData.forEach(lap => {
    if (!lap.lap_duration || lap.is_pit_out_lap) return;
    const dn = lap.driver_number;
    if (!(dn in bestLap) || lap.lap_duration < bestLap[dn].duration) {
      bestLap[dn] = { duration: lap.lap_duration, lapNum: lap.lap_number };
    }
  });

  // Sort by best lap time; drivers with no recorded lap go to the bottom
  const ranked = Object.entries(bestLap)
    .sort((a, b) => a[1].duration - b[1].duration)
    .map(([driverNumber, lap], idx) => ({
      pos:          idx + 1,
      driverNumber: Number(driverNumber),
      ...driverMap[driverNumber],
      duration:     lap.duration,
      lapNum:       lap.lapNum,
    }));

  // Append drivers with no lap time at the bottom
  const rankedNums = new Set(ranked.map(r => r.driverNumber));
  driversData.forEach(d => {
    if (!rankedNums.has(d.driver_number)) {
      ranked.push({
        pos:          '–',
        driverNumber: d.driver_number,
        ...driverMap[d.driver_number],
        duration:     null,
        lapNum:       null,
      });
    }
  });

  return ranked;
}

function fmtLapTime(secs) {
  if (secs == null) return '–';
  const m = Math.floor(secs / 60);
  const s = secs - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

function renderPractice(ranked) {
  if (!ranked.length) {
    raceResultsTable.innerHTML = '<p style="color:var(--muted);padding:20px 0">Practice data not yet available.</p>';
    return;
  }

  const leaderTime = ranked[0]?.duration ?? null;

  const rows = ranked.map((r, i) => {
    const pos      = r.pos;
    const posClass = typeof pos === 'number' && pos <= 3 ? `pos-${pos}` : '';
    const gap      = (leaderTime && r.duration && i > 0)
      ? `+${(r.duration - leaderTime).toFixed(3)}`
      : (i === 0 ? fmtLapTime(r.duration) : '–');
    const best     = i === 0 ? fmtLapTime(r.duration) : gap;
    return `
      <tr>
        <td class="pos-cell ${posClass}">${esc(String(pos))}</td>
        <td class="driver-cell"><span class="driver-num">#${esc(String(r.driverNumber))}</span>${esc(r.name)}</td>
        <td class="team-cell"><span class="team-dot" style="background:${r.teamColour}"></span>${esc(r.team)}</td>
        <td class="time-cell">${esc(fmtLapTime(r.duration))}</td>
        <td class="time-cell" style="color:var(--muted)">${i === 0 ? '' : esc(gap)}</td>
      </tr>`;
  }).join('');

  raceResultsTable.innerHTML = `
    <table aria-label="Practice results">
      <thead><tr>
        <th>Pos</th><th>Driver</th><th>Team</th><th>Best Lap</th><th>Gap</th>
      </tr></thead>
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
    const data = await fetchWithFallback(`${BASE}/driverstandings.json?limit=25`);
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
    const data = await fetchWithFallback(`${BASE}/constructorstandings.json?limit=15`);
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
    const data = await fetchWithFallback('https://api.jolpi.ca/ergast/f1/circuits.json?limit=1000');
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
      fetchWithFallback(`${BASE}/drivers.json?limit=100`),
      cachedStandings ? Promise.resolve(null) : fetchWithFallback(`${BASE}/driverstandings.json?limit=100`),
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

// Helper: run async task factories in batches of batchSize, waiting for each
// batch before starting the next. Prevents unbounded Promise.all() bursts for
// drivers with long careers (Hamilton = 18 seasons, Alonso = 20+).
async function batchedAll(tasks, batchSize) {
  const results = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = await Promise.all(tasks.slice(i, i + batchSize).map(fn => fn()));
    results.push(...batch);
  }
  return results;
}

async function fetchCareerStats(driverId) {
  if (cachedCareer[driverId]) return cachedCareer[driverId];

  const base = `https://api.jolpi.ca/ergast/f1/drivers/${driverId}`;

  // Phase 1: fetch aggregate totals + seasons list.
  // The filtered endpoints return just a `total` count when limit=1,
  // so these are tiny responses. 5 concurrent is fine via the queue.
  const [winsRes, p2Res, p3Res, polesRes, seasonsRes] = await Promise.all([
    fetchWithFallback(`${base}/results/1.json?limit=1`),          // wins
    fetchWithFallback(`${base}/results/2.json?limit=1`),          // P2 finishes
    fetchWithFallback(`${base}/results/3.json?limit=1`),          // P3 finishes
    fetchWithFallback(`${base}/grid/1/results.json?limit=1`),     // pole positions
    fetchWithFallback(`${base}/seasons.json?limit=100`),          // career seasons
  ]);

  const wins    = parseInt(winsRes.MRData.total, 10);
  const p2      = parseInt(p2Res.MRData.total, 10);
  const p3      = parseInt(p3Res.MRData.total, 10);
  const podiums = wins + p2 + p3;
  const poles   = parseInt(polesRes.MRData.total, 10);
  const seasonList = seasonsRes.MRData.SeasonTable.Seasons ?? [];
  const seasons    = seasonList.length;

  // Phase 2: championship count — one request per career season.
  // Use batches of 4 instead of firing all at once: a 20-season driver
  // would otherwise launch 20 simultaneous requests, busting the burst limit.
  const standingPages = await batchedAll(
    seasonList.map(s => () =>
      fetchWithFallback(`https://api.jolpi.ca/ergast/f1/${s.season}/drivers/${driverId}/driverstandings.json?limit=1`)
        .catch(() => null)   // ignore seasons where standing is not yet available
    ),
    4
  );
  const championships = standingPages.filter(res => {
    if (!res) return false;
    const sl = res.MRData?.StandingsTable?.StandingsLists?.[0];
    return sl?.DriverStandings?.[0]?.position === '1';
  }).length;

  // Phase 3: total races and career points — paginate results (max 100/page).
  const firstPage  = await fetchWithFallback(`${base}/results.json?limit=100&offset=0`);
  const totalRaces = parseInt(firstPage.MRData.total, 10);
  let   races      = [...(firstPage.MRData.RaceTable.Races ?? [])];

  if (totalRaces > 100) {
    // Fetch remaining pages in batches of 3 to stay within burst limits.
    const offsets = [];
    for (let offset = 100; offset < totalRaces; offset += 100) offsets.push(offset);
    const pages = await batchedAll(
      offsets.map(offset => () => fetchWithFallback(`${base}/results.json?limit=100&offset=${offset}`)),
      3
    );
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
