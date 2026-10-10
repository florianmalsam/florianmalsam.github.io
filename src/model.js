export const STORAGE_KEY = 'seitenwechsel-v1';
export const DEFAULT_DUTY_POINTS = { ref1: 3, ref2: 2, table: 1, lines: 1, tablet: 1, drive: 1 };
export const EXPENSE_CATEGORIES = { catering: 'Verpflegung', marketing: 'Marketing', equipment: 'Material', other: 'Sonstiges' };
export const INCOME_CATEGORIES = { catering: 'Verpflegung', sponsorship: 'Sponsoring', contribution: 'Beiträge', donation: 'Spenden', other: 'Sonstiges' };
export const REIMBURSEMENT_STATUSES = { not_required: 'Nicht nötig', open: 'Offen', reimbursed: 'Erstattet' };
export const JOURNAL_ACTIONS = { baseline: 'Startbestand', create: 'Angelegt', update: 'Geändert', delete: 'Gelöscht' };
export const JOURNAL_KINDS = { treasury: 'Kasse', opening: 'Anfangsbestand', income: 'Einnahme', expense: 'Ausgabe' };

function journalSnapshot(state, kind, item) {
  if (!item) return null;
  const snapshot = { id: item.id, date: item.date, description: item.description, amountCents: item.amountCents, category: item.category, matchId: item.matchId, note: item.note, matchName: state.matches.find(match => match.id === item.matchId)?.opponent || '' };
  if (kind === 'expense') Object.assign(snapshot, { paidByPlayerId: item.paidByPlayerId ?? null, paidFromTreasury: item.paidByPlayerId === null, paidByName: expensePayer(state, item), reimbursementStatus: item.reimbursementStatus });
  return snapshot;
}

function journalImpact(kind, snapshot) {
  if (!snapshot) return 0;
  if (kind !== 'expense') return snapshot.amountCents;
  return snapshot.paidFromTreasury || snapshot.reimbursementStatus === 'reimbursed' ? -snapshot.amountCents : 0;
}

export function initializeFinanceJournal(state, at = new Date().toISOString()) {
  const current = validateState(state);
  if (current.financeJournal !== undefined) {
    if (current.financeJournal.length && current.financeJournal.at(-1).balanceAfterCents !== current.treasuryBalanceCents) throw new Error('Das Kassenjournal stimmt nicht mit dem aktuellen Kassenstand überein.');
    return current;
  }
  return validateState({ ...current, financeJournal: [{ id: crypto.randomUUID(), at, action: 'baseline', kind: 'treasury', entityId: null, before: null, after: { amountCents: current.treasuryBalanceCents }, deltaCents: 0, balanceBeforeCents: current.treasuryBalanceCents, balanceAfterCents: current.treasuryBalanceCents }] });
}

export function recordFinanceChanges(previous, state, at = new Date().toISOString()) {
  const current = initializeFinanceJournal(previous, at);
  const next = validateState(state);
  const financeJournal = [...current.financeJournal];
  let balance = current.treasuryBalanceCents;
  function append(kind, entityId, before, after) {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    if (!financeJournal.length) financeJournal.push(initializeFinanceJournal({ ...current, financeJournal: undefined }, at).financeJournal[0]);
    const deltaCents = journalImpact(kind, after) - journalImpact(kind, before);
    const balanceAfterCents = balance + deltaCents;
    financeJournal.push({ id: crypto.randomUUID(), at, action: before === null ? 'create' : after === null ? 'delete' : 'update', kind, entityId, before, after, deltaCents, balanceBeforeCents: balance, balanceAfterCents });
    balance = balanceAfterCents;
  }
  if (current.treasuryOpeningBalanceCents !== next.treasuryOpeningBalanceCents) append('opening', null, { amountCents: current.treasuryOpeningBalanceCents }, { amountCents: next.treasuryOpeningBalanceCents });
  for (const [kind, collection] of [['income', 'incomes'], ['expense', 'expenses']]) {
    const oldItems = new Map((current[collection] || []).map(item => [item.id, item]));
    const newItems = new Map((next[collection] || []).map(item => [item.id, item]));
    for (const id of new Set([...oldItems.keys(), ...newItems.keys()])) append(kind, id, journalSnapshot(current, kind, oldItems.get(id)), journalSnapshot(next, kind, newItems.get(id)));
  }
  if (balance !== next.treasuryBalanceCents) throw new Error('Die protokollierte Kassenänderung stimmt nicht mit dem Kassenstand überein.');
  return validateState({ ...next, financeJournal });
}

export function resetFinances(state, at = new Date().toISOString()) {
  const current = initializeFinanceJournal(state);
  return validateState({ ...current, financeJournal: [], treasuryResetOffsetCents: (current.treasuryResetOffsetCents ?? 0) - current.treasuryBalanceCents, treasuryResetAt: at, treasuryBalanceCents: 0 });
}

export function moneyCents(value, allowNegative = false) {
  const text = value.trim();
  if (!(allowNegative ? /^-?\d+(?:[.,]\d{1,2})?$/ : /^\d+(?:[.,]\d{1,2})?$/).test(text)) throw new Error('Bitte einen Betrag mit maximal zwei Nachkommastellen eingeben.');
  const [euros, cents = ''] = text.replace('-', '').replace(',', '.').split('.');
  const amount = (Number(euros) * 100 + Number(cents.padEnd(2, '0'))) * (text.startsWith('-') ? -1 : 1);
  if (!Number.isSafeInteger(amount)) throw new Error('Der Betrag ist zu groß.');
  return amount;
}

export function incomeTotal(incomes = []) {
  return incomes.reduce((total, income) => total + income.amountCents, 0);
}

export function treasuryTotals(state) {
  const openingCents = state.treasuryOpeningBalanceCents ?? 0;
  const incomeCents = incomeTotal(state.incomes);
  const paidCents = (state.expenses || []).reduce((total, expense) => total + (expense.paidByPlayerId === null || expense.reimbursementStatus === 'reimbursed' ? expense.amountCents : 0), 0);
  return { openingCents, incomeCents, paidCents, balanceCents: openingCents + incomeCents - paidCents + (state.treasuryResetOffsetCents ?? 0) };
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
    for (const field of ['ref1', 'ref2', 'table', 'lines', 'tablet']) {
      if ((field === 'lines' || field === 'tablet') && entry[field] === undefined) continue;
      if (!Number.isSafeInteger(entry[field]) || entry[field] < 0) throw new Error('Dienste müssen nichtnegative ganze Zahlen sein.');
    }
    if (entry.extra !== undefined && (!Number.isSafeInteger(entry.extra) || entry.extra < 0)) throw new Error('Extra-Punkte müssen nichtnegative ganze Zahlen sein.');
    if (entry.extraDescription !== undefined && typeof entry.extraDescription !== 'string') throw new Error('Die Extra-Beschreibung muss ein Text sein.');
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
    if (income.matchId !== null && !matchIds.has(income.matchId)) throw new Error('Die Einnahme verweist auf einen unbekannten Spieltag.');
    if (typeof income.note !== 'string') throw new Error('Die Einnahmennotiz muss Text sein.');
  }
  if (!Number.isSafeInteger(incomeTotal(state.incomes))) throw new Error('Die Einnahmensumme ist zu groß.');
  if (state.treasuryOpeningBalanceCents !== undefined && !Number.isSafeInteger(state.treasuryOpeningBalanceCents)) throw new Error('Der Anfangsbestand muss ein ganzer Centbetrag sein.');
  if (state.treasuryBalanceCents !== undefined && !Number.isSafeInteger(state.treasuryBalanceCents)) throw new Error('Der Kassenstand muss ein ganzer Centbetrag sein.');
  if (state.treasuryResetOffsetCents !== undefined && !Number.isSafeInteger(state.treasuryResetOffsetCents)) throw new Error('Der Reset-Ausgleich muss ein ganzer Centbetrag sein.');
  if (state.treasuryResetAt !== undefined && (typeof state.treasuryResetAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(state.treasuryResetAt) || !Number.isFinite(Date.parse(state.treasuryResetAt)) || new Date(state.treasuryResetAt).toISOString() !== state.treasuryResetAt)) throw new Error('Ungültiger Reset-Zeitpunkt.');
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
  if (next.incomes?.some(income => Object.hasOwn(income, 'destination'))) next = { ...next, incomes: next.incomes.map(income => {
    const { destination, ...rest } = income;
    return rest;
  }) };
  if (Object.hasOwn(next, 'clubIncomeTotalCents')) {
    const { clubIncomeTotalCents, ...rest } = next;
    next = rest;
  }
  const balance = treasuryTotals(next).balanceCents;
  if (!Number.isSafeInteger(balance)) throw new Error('Der Kassenstand ist zu groß.');
  if (next.incomes === undefined || next.treasuryOpeningBalanceCents === undefined || next.treasuryBalanceCents !== balance) next = { ...next, incomes: next.incomes ?? [], treasuryOpeningBalanceCents: next.treasuryOpeningBalanceCents ?? 0, treasuryBalanceCents: balance };
  if (next.financeJournal !== undefined) {
    if (!Array.isArray(next.financeJournal)) throw new Error('Das Kassenjournal muss eine Liste sein.');
    const journalIds = new Set();
    let lastBalance;
    for (const [index, entry] of next.financeJournal.entries()) {
      if (!entry || typeof entry.id !== 'string' || !entry.id || journalIds.has(entry.id)) throw new Error('Journal-IDs müssen eindeutig sein.');
      journalIds.add(entry.id);
      if (typeof entry.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.at) || !Number.isFinite(Date.parse(entry.at)) || new Date(entry.at).toISOString() !== entry.at) throw new Error('Bitte einen gültigen Journalzeitpunkt wählen.');
      if (!Object.hasOwn(JOURNAL_ACTIONS, entry.action) || !Object.hasOwn(JOURNAL_KINDS, entry.kind)) throw new Error('Ungültiger Journalvorgang.');
      if (![entry.deltaCents, entry.balanceBeforeCents, entry.balanceAfterCents].every(Number.isSafeInteger) || entry.balanceBeforeCents + entry.deltaCents !== entry.balanceAfterCents || (index > 0 && entry.balanceBeforeCents !== lastBalance)) throw new Error('Ungültige Kassenstände im Journal.');
      if (index === 0 ? entry.action !== 'baseline' || entry.kind !== 'treasury' || entry.deltaCents !== 0 : entry.action === 'baseline' || entry.kind === 'treasury') throw new Error('Ungültiger Journalstart.');
      if (entry.kind === 'income' || entry.kind === 'expense') {
        if (typeof entry.entityId !== 'string' || !entry.entityId) throw new Error('Journalbuchungen benötigen eine Buchungs-ID.');
      } else if (entry.entityId !== null) throw new Error('Ungültiger Kassenverweis im Journal.');
      for (const snapshot of [entry.before, entry.after]) {
        if (snapshot === null) continue;
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || !Number.isSafeInteger(snapshot.amountCents)) throw new Error('Ungültige Journalwerte.');
        if (entry.kind === 'income' || entry.kind === 'expense') {
          if (snapshot.id !== entry.entityId || snapshot.amountCents <= 0 || typeof snapshot.description !== 'string' || typeof snapshot.date !== 'string' || typeof snapshot.note !== 'string' || typeof snapshot.matchName !== 'string' || !Object.hasOwn(entry.kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES, snapshot.category) || (snapshot.matchId !== null && typeof snapshot.matchId !== 'string')) throw new Error('Ungültige Buchung im Journal.');
          if (entry.kind === 'expense' && (typeof snapshot.paidFromTreasury !== 'boolean' || typeof snapshot.paidByName !== 'string' || !Object.hasOwn(REIMBURSEMENT_STATUSES, snapshot.reimbursementStatus))) throw new Error('Ungültige Erstattung im Journal.');
        }
      }
      if (entry.action === 'baseline' || entry.action === 'create' ? entry.before !== null || entry.after === null : entry.action === 'delete' ? entry.before === null || entry.after !== null : entry.before === null || entry.after === null) throw new Error('Ungültige Vorher-/Nachher-Werte im Journal.');
      if (entry.action === 'baseline' ? entry.after.amountCents !== entry.balanceAfterCents : journalImpact(entry.kind, entry.after) - journalImpact(entry.kind, entry.before) !== entry.deltaCents) throw new Error('Ungültige Betragsänderung im Journal.');
      lastBalance = entry.balanceAfterCents;
    }
  }
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
  return validateState({ ...state, entries: [...state.entries, { matchId, playerId, played: false, drove: false, km: 0, ref1: 0, ref2: 0, table: 0, lines: 0, tablet: 0, extra: 0 }] });
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
  const teamEffort = entries.reduce((total, entry) => total + entry.ref1 * points.ref1 + entry.ref2 * points.ref2 + entry.table * points.table + (entry.lines || 0) * points.lines + (entry.tablet || 0) * points.tablet + (entry.drove ? points.drive : 0) + (entry.extra || 0), 0);
  return participations ? teamEffort / participations : 0;
}

export function playerMatchBreakdown(state, playerId) {
  const points = dutyPoints(state);
  return [...state.matches].sort((first, second) => first.date.localeCompare(second.date)).reduce((rows, match) => {
    const entry = state.entries.find(item => item.matchId === match.id && item.playerId === playerId);
    if (!entry) return rows;
    const beitrag = entry.ref1 * points.ref1 + entry.ref2 * points.ref2 + entry.table * points.table + (entry.lines || 0) * points.lines + (entry.tablet || 0) * points.tablet + (entry.drove ? points.drive : 0) + (entry.extra || 0);
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
    const scoreIst = entries.reduce((total, entry) => total + entry.ref1 * points.ref1 + entry.ref2 * points.ref2 + entry.table * points.table + (entry.lines || 0) * points.lines + (entry.tablet || 0) * points.tablet + (entry.drove ? points.drive : 0) + (entry.extra || 0), 0);
    const scoreSoll = entries.reduce((total, entry) => total + (entry.played ? factorByMatch.get(entry.matchId) : 0), 0);
    return { ...player, played: entries.filter(entry => entry.played).length, drove: entries.filter(entry => entry.drove).length, km, ref1: sum('ref1'), ref2: sum('ref2'), table: sum('table'), lines: sum('lines'), tablet: sum('tablet'), extra: sum('extra'), scoreIst, scoreSoll, reimbursement: Math.round((km * state.rate + Number.EPSILON) * 100) / 100 };
  });
}

export function nextMatchId(state) {
  let number = 1;
  while (state.matches.some(match => match.id === `ST${String(number).padStart(2, '0')}`)) number++;
  return `ST${String(number).padStart(2, '0')}`;
}