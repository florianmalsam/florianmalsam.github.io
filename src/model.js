export const STORAGE_KEY = 'seitenwechsel-v1';
export const DEFAULT_DUTY_POINTS = { ref1: 3, ref2: 2, table: 1, lines: 1, drive: 1 };
export const EXPENSE_CATEGORIES = { catering: 'Verpflegung', marketing: 'Marketing', equipment: 'Material', other: 'Sonstiges' };
export const INCOME_CATEGORIES = { catering: 'Verpflegung', sponsorship: 'Sponsoring', contribution: 'Beiträge', donation: 'Spenden', other: 'Sonstiges' };
export const INCOME_DESTINATIONS = { team: 'Mannschaftskasse', club: 'Vereinskasse' };
export const REIMBURSEMENT_STATUSES = { not_required: 'Nicht nötig', open: 'Offen', reimbursed: 'Erstattet' };

export function moneyCents(value, allowNegative = false) {
  const text = value.trim();
  if (!(allowNegative ? /^-?\d+(?:[.,]\d{1,2})?$/ : /^\d+(?:[.,]\d{1,2})?$/).test(text)) throw new Error('Bitte einen Betrag mit maximal zwei Nachkommastellen eingeben.');
  const [euros, cents = ''] = text.replace('-', '').replace(',', '.').split('.');
  const amount = (Number(euros) * 100 + Number(cents.padEnd(2, '0'))) * (text.startsWith('-') ? -1 : 1);
  if (!Number.isSafeInteger(amount)) throw new Error('Der Betrag ist zu groß.');
  return amount;
}

export function incomeTotal(incomes = [], destination) {
  return incomes.reduce((total, income) => total + (destination === undefined || (income.destination ?? 'team') === destination ? income.amountCents : 0), 0);
}

export function treasuryTotals(state) {
  const openingCents = state.treasuryOpeningBalanceCents ?? 0;
  const incomeCents = incomeTotal(state.incomes, 'team');
  const paidCents = (state.expenses || []).reduce((total, expense) => total + (expense.paidByPlayerId === null || expense.reimbursementStatus === 'reimbursed' ? expense.amountCents : 0), 0);
  return { openingCents, incomeCents, paidCents, balanceCents: openingCents + incomeCents - paidCents };
}

export function expenseTotals(expenses = []) {
  return expenses.reduce((totals, expense) => ({
    amountCents: totals.amountCents + expense.amountCents,
    openCents: totals.openCents + (expense.reimbursementStatus === 'open' ? expense.amountCents : 0),
  }), { amountCents: 0, openCents: 0 });
}

export function dutyPoints(state) {
  return { ...DEFAULT_DUTY_POINTS, ...state.dutyPoints };
}

export function exampleData() {
  return {
    version: 1,
    rate: 0.3,
    expenses: [],
    incomes: [],
    treasuryOpeningBalanceCents: 0,
    treasuryBalanceCents: 0,
    clubIncomeTotalCents: 0,
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

export function expensePayer(state, expense) {
  if (expense.paidByPlayerId === null) return 'Mannschaftskasse';
  if (expense.paidByPlayerId === undefined) return `${expense.paidBy} (Zuordnung offen)`;
  return state.players.find(player => player.id === expense.paidByPlayerId)?.name || 'Unbekannter Spieler';
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
  if (state.expenses !== undefined && !Array.isArray(state.expenses)) throw new Error('Ausgaben müssen eine Liste sein.');
  const expenseIds = new Set();
  for (const expense of state.expenses || []) {
    if (!expense || typeof expense.id !== 'string' || !expense.id || expenseIds.has(expense.id)) throw new Error('Ausgaben-IDs müssen eindeutig sein.');
    expenseIds.add(expense.id);
    if (typeof expense.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expense.date) || !Number.isFinite(Date.parse(expense.date)) || new Date(`${expense.date}T12:00:00Z`).toISOString().slice(0, 10) !== expense.date) throw new Error('Bitte ein gültiges Ausgabendatum wählen.');
    if (typeof expense.description !== 'string' || !expense.description.trim()) throw new Error('Die Beschreibung darf nicht leer sein.');
    if (!Number.isSafeInteger(expense.amountCents) || expense.amountCents <= 0) throw new Error('Der Betrag muss ein positiver ganzer Centbetrag sein.');
    if (!Object.hasOwn(EXPENSE_CATEGORIES, expense.category)) throw new Error('Bitte eine gültige Ausgabenkategorie wählen.');
    if (expense.matchId !== null && !matchIds.has(expense.matchId)) throw new Error('Die Ausgabe verweist auf einen unbekannten Spieltag.');
    if (expense.paidByPlayerId === undefined) {
      if (typeof expense.paidBy !== 'string' || !expense.paidBy.trim()) throw new Error('Bitte angeben, wer bezahlt hat.');
    } else if (expense.paidByPlayerId !== null && !playerIds.has(expense.paidByPlayerId)) {
      throw new Error('Die Ausgabe verweist auf einen unbekannten zahlenden Spieler.');
    }
    if (!Object.hasOwn(REIMBURSEMENT_STATUSES, expense.reimbursementStatus)) throw new Error('Bitte einen gültigen Erstattungsstatus wählen.');
    if (typeof expense.note !== 'string') throw new Error('Die Ausgabennotiz muss Text sein.');
  }
  if (!Number.isSafeInteger(expenseTotals(state.expenses).amountCents)) throw new Error('Die Ausgabensumme ist zu groß.');
  if (state.incomes !== undefined && !Array.isArray(state.incomes)) throw new Error('Einnahmen müssen eine Liste sein.');
  const incomeIds = new Set();
  for (const income of state.incomes || []) {
    if (!income || typeof income.id !== 'string' || !income.id || incomeIds.has(income.id)) throw new Error('Einnahmen-IDs müssen eindeutig sein.');
    incomeIds.add(income.id);
    if (typeof income.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(income.date) || !Number.isFinite(Date.parse(income.date)) || new Date(`${income.date}T12:00:00Z`).toISOString().slice(0, 10) !== income.date) throw new Error('Bitte ein gültiges Einnahmendatum wählen.');
    if (typeof income.description !== 'string' || !income.description.trim()) throw new Error('Die Beschreibung darf nicht leer sein.');
    if (!Number.isSafeInteger(income.amountCents) || income.amountCents <= 0) throw new Error('Der Einnahmenbetrag muss ein positiver ganzer Centbetrag sein.');
    if (!Object.hasOwn(INCOME_CATEGORIES, income.category)) throw new Error('Bitte eine gültige Einnahmenkategorie wählen.');
    if (income.destination !== undefined && !Object.hasOwn(INCOME_DESTINATIONS, income.destination)) throw new Error('Bitte eine gültige Zielkasse wählen.');
    if (income.matchId !== null && !matchIds.has(income.matchId)) throw new Error('Die Einnahme verweist auf einen unbekannten Spieltag.');
    if (typeof income.note !== 'string') throw new Error('Die Einnahmennotiz muss Text sein.');
  }
  if (!Number.isSafeInteger(incomeTotal(state.incomes))) throw new Error('Die Einnahmensumme ist zu groß.');
  if (state.treasuryOpeningBalanceCents !== undefined && !Number.isSafeInteger(state.treasuryOpeningBalanceCents)) throw new Error('Der Anfangsbestand muss ein ganzer Centbetrag sein.');
  if (state.treasuryBalanceCents !== undefined && !Number.isSafeInteger(state.treasuryBalanceCents)) throw new Error('Der Kassenstand muss ein ganzer Centbetrag sein.');
  if (state.clubIncomeTotalCents !== undefined && (!Number.isSafeInteger(state.clubIncomeTotalCents) || state.clubIncomeTotalCents < 0)) throw new Error('Die Einnahmensumme der Vereinskasse muss ein nichtnegativer ganzer Centbetrag sein.');
  let next = state;
  if (state.expenses?.some(expense => expense.paidByPlayerId === undefined)) {
    const expenses = state.expenses.map(expense => {
      if (expense.paidByPlayerId !== undefined) return expense;
      const name = normalizedName(expense.paidBy);
      const player = state.players.find(item => normalizedName(item.name) === name);
      if (name !== normalizedName('Mannschaftskasse') && !player) return expense;
      const { paidBy, ...rest } = expense;
      return { ...rest, paidByPlayerId: name === normalizedName('Mannschaftskasse') ? null : player.id };
    });
    next = { ...state, expenses };
  }
  if (next.incomes?.some(income => income.destination === undefined)) next = { ...next, incomes: next.incomes.map(income => income.destination === undefined ? { ...income, destination: 'team' } : income) };
  const balance = treasuryTotals(next).balanceCents;
  const clubIncomeTotalCents = incomeTotal(next.incomes, 'club');
  if (!Number.isSafeInteger(balance)) throw new Error('Der Kassenstand ist zu groß.');
  if (next.incomes === undefined || next.treasuryOpeningBalanceCents === undefined || next.treasuryBalanceCents !== balance || next.clubIncomeTotalCents !== clubIncomeTotalCents) next = { ...next, incomes: next.incomes ?? [], treasuryOpeningBalanceCents: next.treasuryOpeningBalanceCents ?? 0, treasuryBalanceCents: balance, clubIncomeTotalCents };
  return next;
}

export function removePlayer(state, playerId) {
  const current = validateState(state);
  if (current.expenses?.some(expense => expense.paidByPlayerId === playerId)) throw new Error('Dieser Spieler ist mit Ausgaben verknüpft. Bitte zuerst die Ausgaben einem anderen Spieler oder der Mannschaftskasse zuordnen.');
  return validateState({ ...current, players: current.players.filter(player => player.id !== playerId), entries: current.entries.filter(entry => entry.playerId !== playerId) });
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