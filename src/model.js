export const STORAGE_KEY = 'seitenwechsel-v1';
export const DEFAULT_DUTY_POINTS = { ref1: 3, ref2: 2, table: 1, lines: 1, drive: 1 };

export function dutyPoints(state) {
  return { ...DEFAULT_DUTY_POINTS, ...state.dutyPoints };
}

export function exampleData() {
  return {
    version: 1,
    rate: 0.3,
    dutyPoints: { ...DEFAULT_DUTY_POINTS },
    players: ['Anna', 'Ben', 'Clara', 'David'].map((name, index) => ({ id: `P${index + 1}`, name })),
    matches: [
      { id: 'ST01', date: '2026-10-17', location: 'Sporthalle Nord', opponent: 'VC Nord', standardKm: 80 },
      { id: 'ST02', date: '2026-10-31', location: 'Sporthalle West', opponent: 'VV West', standardKm: 120 },
    ],
    entries: [
      { matchId: 'ST01', playerId: 'P1', played: true, drove: true, km: 80, ref1: 1, ref2: 0, table: 0 },
      { matchId: 'ST01', playerId: 'P2', played: true, drove: false, km: 0, ref1: 0, ref2: 1, table: 0 },
      { matchId: 'ST01', playerId: 'P3', played: true, drove: false, km: 0, ref1: 0, ref2: 0, table: 1 },
      { matchId: 'ST01', playerId: 'P4', played: true, drove: false, km: 0, ref1: 0, ref2: 0, table: 1 },
      { matchId: 'ST02', playerId: 'P1', played: true, drove: false, km: 0, ref1: 0, ref2: 0, table: 1 },
      { matchId: 'ST02', playerId: 'P2', played: true, drove: true, km: 120, ref1: 1, ref2: 0, table: 0 },
      { matchId: 'ST02', playerId: 'P3', played: false, drove: false, km: 0, ref1: 0, ref2: 1, table: 0 },
      { matchId: 'ST02', playerId: 'P4', played: true, drove: false, km: 0, ref1: 0, ref2: 0, table: 1 },
    ],
  };
}

export function normalizedName(name) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
}

export function validateState(state) {
  if (!state || state.version !== 1 || !Array.isArray(state.players) || !Array.isArray(state.matches) || !Array.isArray(state.entries)) {
    throw new Error('Die Datei ist kein gültiges Team-Backup.');
  }
  if (!Number.isFinite(state.rate) || state.rate < 0) throw new Error('Der Kilometersatz muss mindestens 0 sein.');
  if (state.dutyPoints !== undefined && (!state.dutyPoints || typeof state.dutyPoints !== 'object' || Array.isArray(state.dutyPoints) || Object.values({ ...DEFAULT_DUTY_POINTS, ...state.dutyPoints }).some(value => !Number.isFinite(value) || value < 0))) throw new Error('Dienstpunkte müssen nichtnegative Zahlen sein.');
  const playerIds = new Set();
  const names = new Set();
  for (const player of state.players) {
    if (typeof player.id !== 'string' || !player.id || playerIds.has(player.id)) throw new Error('Spieler-IDs müssen eindeutig sein.');
    if (typeof player.name !== 'string' || !normalizedName(player.name) || names.has(normalizedName(player.name))) throw new Error('Spielernamen müssen ausgefüllt und eindeutig sein. Bei gleichen Vornamen bitte Nachnamen ergänzen.');
    playerIds.add(player.id);
    names.add(normalizedName(player.name));
  }
  const matchIds = new Set();
  for (const match of state.matches) {
    if (typeof match.id !== 'string' || !match.id || matchIds.has(match.id)) throw new Error('Spieltag-IDs müssen eindeutig sein.');
    if (typeof match.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(match.date) || !Number.isFinite(Date.parse(match.date)) || new Date(`${match.date}T12:00:00Z`).toISOString().slice(0, 10) !== match.date) throw new Error('Bitte ein gültiges Datum wählen.');
    if (typeof match.location !== 'string' || !match.location.trim() || typeof match.opponent !== 'string' || !match.opponent.trim()) throw new Error('Ort und Gegner dürfen nicht leer sein.');
    if (!Number.isFinite(match.standardKm) || match.standardKm < 0) throw new Error('Kilometer dürfen nicht negativ sein.');
    matchIds.add(match.id);
  }
  const pairs = new Set();
  for (const entry of state.entries) {
    if (!playerIds.has(entry.playerId) || !matchIds.has(entry.matchId)) throw new Error('Ein Einsatz verweist auf einen unbekannten Spieler oder Spieltag.');
    const key = JSON.stringify([entry.matchId, entry.playerId]);
    if (pairs.has(key)) throw new Error('Jeder Spieler darf pro Spieltag nur einmal eingetragen sein.');
    pairs.add(key);
    if (typeof entry.played !== 'boolean' || typeof entry.drove !== 'boolean') throw new Error('Teilnahme und Fahrt müssen boolesche Werte sein.');
    if (!Number.isFinite(entry.km) || entry.km < 0 || (!entry.drove && entry.km !== 0)) throw new Error('Kilometer dürfen nur beim Fahrer eingetragen sein.');
    for (const field of ['ref1', 'ref2', 'table', 'lines']) {
      if (field === 'lines' && entry[field] === undefined) continue;
      if (!Number.isSafeInteger(entry[field]) || entry[field] < 0) throw new Error('Dienste müssen nichtnegative ganze Zahlen sein.');
    }
    if (entry.extra !== undefined && (!Number.isSafeInteger(entry.extra) || entry.extra < 0)) throw new Error('Extra-Punkte müssen nichtnegative ganze Zahlen sein.');
  }
  return state;
}

export function addPlayer(state, name) {
  const next = { ...state, players: [...state.players, { id: crypto.randomUUID(), name: name.trim().replace(/\s+/g, ' ') }] };
  return validateState(next);
}

export function addEntry(state, matchId, playerId) {
  return validateState({ ...state, entries: [...state.entries, { matchId, playerId, played: false, drove: false, km: 0, ref1: 0, ref2: 0, table: 0, lines: 0, extra: 0 }] });
}

export function updateEntry(state, matchId, playerId, patch) {
  const entries = state.entries.map(entry => {
    if (entry.matchId !== matchId || entry.playerId !== playerId) return entry;
    const next = { ...entry, ...patch };
    if (!next.drove) next.km = 0;
    return next;
  });
  return validateState({ ...state, entries });
}

export function matchFactor(state, matchId) {
  const entries = state.entries.filter(entry => entry.matchId === matchId);
  const participations = entries.filter(entry => entry.played).length;
  const points = dutyPoints(state);
  const teamEffort = entries.reduce((total, entry) => total + entry.ref1 * points.ref1 + entry.ref2 * points.ref2 + entry.table * points.table + (entry.lines || 0) * points.lines + (entry.drove ? points.drive : 0) + (entry.extra || 0), 0);
  return participations ? teamEffort / participations : 0;
}

export function playerMatchBreakdown(state, playerId) {
  const points = dutyPoints(state);
  return [...state.matches].sort((first, second) => first.date.localeCompare(second.date)).reduce((rows, match) => {
    const entry = state.entries.find(item => item.matchId === match.id && item.playerId === playerId);
    if (!entry) return rows;
    const beitrag = entry.ref1 * points.ref1 + entry.ref2 * points.ref2 + entry.table * points.table + (entry.lines || 0) * points.lines + (entry.drove ? points.drive : 0) + (entry.extra || 0);
    const zielbeitrag = entry.played ? matchFactor(state, match.id) : 0;
    rows.push({ matchId: match.id, date: match.date, opponent: match.opponent, played: entry.played, zielbeitrag, beitrag });
    return rows;
  }, []);
}

export function statistics(state) {
  const points = dutyPoints(state);
  const factorByMatch = new Map(state.matches.map(match => [match.id, matchFactor(state, match.id)]));
  return state.players.map(player => {
    const entries = state.entries.filter(entry => entry.playerId === player.id);
    const sum = field => entries.reduce((total, entry) => total + (entry[field] || 0), 0);
    const km = sum('km');
    const scoreIst = entries.reduce((total, entry) => total + entry.ref1 * points.ref1 + entry.ref2 * points.ref2 + entry.table * points.table + (entry.lines || 0) * points.lines + (entry.drove ? points.drive : 0) + (entry.extra || 0), 0);
    const scoreSoll = entries.reduce((total, entry) => total + (entry.played ? factorByMatch.get(entry.matchId) : 0), 0);
    return { ...player, played: entries.filter(entry => entry.played).length, drove: entries.filter(entry => entry.drove).length, km, ref1: sum('ref1'), ref2: sum('ref2'), table: sum('table'), lines: sum('lines'), extra: sum('extra'), scoreIst, scoreSoll, reimbursement: Math.round((km * state.rate + Number.EPSILON) * 100) / 100 };
  });
}

export function nextMatchId(state) {
  let number = 1;
  while (state.matches.some(match => match.id === `ST${String(number).padStart(2, '0')}`)) number++;
  return `ST${String(number).padStart(2, '0')}`;
}