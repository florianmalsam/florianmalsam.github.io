import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleData, validateState, statistics, matchFactor, playerMatchBreakdown, addEntry, addPlayer, updateEntry, nextMatchId, expenseTotals, expensePayer, removePlayer, incomeTotal, treasuryTotals, moneyCents } from './model.js';

const sampleExpense = { id: 'E1', date: '2026-10-17', description: 'Getränke', amountCents: 4250, category: 'catering', matchId: 'ST01', paidByPlayerId: 'P1', reimbursementStatus: 'open', note: '' };
const sampleIncome = { id: 'I1', date: '2026-10-17', description: 'Getränkeverkauf', amountCents: 10000, category: 'catering', matchId: 'ST01', destination: 'team', note: '' };

test('Vereinseinnahmen werden getrennt gespeichert und erhöhen nicht den Mannschaftskassenstand', () => {
  const state = validateState({ ...exampleData(), treasuryOpeningBalanceCents: 5000, incomes: [sampleIncome, { ...sampleIncome, id: 'I2', destination: 'club', amountCents: 12345 }] });
  assert.equal(state.treasuryBalanceCents, 15000);
  assert.equal(state.clubIncomeTotalCents, 12345);
  assert.equal(incomeTotal(state.incomes), 22345);
  assert.equal(incomeTotal(state.incomes, 'team'), 10000);
  assert.equal(incomeTotal(state.incomes, 'club'), 12345);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))), state);
  const changed = validateState({ ...state, incomes: state.incomes.map(income => ({ ...income, destination: 'team' })) });
  assert.equal(changed.treasuryBalanceCents, 27345);
  assert.equal(changed.clubIncomeTotalCents, 0);
  assert.equal(validateState({ ...state, incomes: [sampleIncome] }).clubIncomeTotalCents, 0);
  assert.equal(validateState({ ...state, clubIncomeTotalCents: 1 }).clubIncomeTotalCents, 12345);
});

test('Bestehende Einnahmen ohne Zielkasse bleiben der Mannschaftskasse zugeordnet', () => {
  const { destination, ...legacyIncome } = sampleIncome;
  const state = { ...exampleData(), incomes: [legacyIncome] };
  delete state.clubIncomeTotalCents;
  const migrated = validateState(state);
  assert.equal(migrated.incomes[0].destination, 'team');
  assert.equal(migrated.treasuryBalanceCents, 10000);
  assert.equal(migrated.clubIncomeTotalCents, 0);
  assert.equal(state.incomes[0].destination, undefined);
});

test('Ungültige Zielkassen und Vereinskassen-Summen werden abgewiesen', () => {
  for (const destination of ['unknown', null, '']) assert.throws(() => validateState({ ...exampleData(), incomes: [{ ...sampleIncome, destination }] }), /Zielkasse/);
  for (const clubIncomeTotalCents of [-1, 1.5, '100']) assert.throws(() => validateState({ ...exampleData(), clubIncomeTotalCents }), /Vereinskasse/);
});

test('Einnahmen und Kassenstand werden centgenau gespeichert, offene Auslagen bleiben unberührt', () => {
  const state = validateState({ ...exampleData(), treasuryOpeningBalanceCents: 5000, incomes: [sampleIncome, { ...sampleIncome, id: 'I2', matchId: null, amountCents: 101 }], expenses: [sampleExpense, { ...sampleExpense, id: 'E2', paidByPlayerId: null, amountCents: 1000 }, { ...sampleExpense, id: 'E3', reimbursementStatus: 'reimbursed', amountCents: 2000 }, { ...sampleExpense, id: 'E4', reimbursementStatus: 'not_required', amountCents: 500 }] });
  assert.deepEqual(treasuryTotals(state), { openingCents: 5000, incomeCents: 10101, paidCents: 3000, balanceCents: 12101 });
  assert.equal(state.treasuryBalanceCents, 12101);
  assert.equal(incomeTotal(state.incomes.filter(income => income.matchId === 'ST01')), 10000);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))), state);
  const reimbursed = validateState({ ...state, expenses: state.expenses.map(expense => expense.id === 'E1' ? { ...expense, reimbursementStatus: 'reimbursed' } : expense) });
  assert.equal(reimbursed.treasuryBalanceCents, 7851);
  assert.equal(validateState({ ...state, incomes: [] }).treasuryBalanceCents, 2000);
});

test('Kassenstand wird nach Änderungen neu berechnet und Kassen-Ausgaben nur einmal abgezogen', () => {
  const state = validateState({ ...exampleData(), expenses: [{ ...sampleExpense, paidByPlayerId: null, reimbursementStatus: 'reimbursed' }] });
  assert.equal(state.treasuryBalanceCents, -4250);
  assert.equal(validateState({ ...state, expenses: [] }).treasuryBalanceCents, 0);
  assert.equal(validateState({ ...state, treasuryBalanceCents: 12345 }).treasuryBalanceCents, -4250);
});

test('Alte Backups bekommen Einnahmen und Kassenbestand ohne Datenverlust', () => {
  const state = exampleData();
  delete state.incomes;
  delete state.treasuryOpeningBalanceCents;
  delete state.treasuryBalanceCents;
  state.expenses = [{ ...sampleExpense, paidByPlayerId: undefined, paidBy: 'Mannschaftskasse' }];
  const migrated = validateState(state);
  assert.deepEqual(migrated.incomes, []);
  assert.equal(migrated.treasuryOpeningBalanceCents, 0);
  assert.equal(migrated.treasuryBalanceCents, -4250);
});

test('Ungültige Einnahmen und Kassenbeträge werden abgewiesen', () => {
  for (const patch of [{ amountCents: 0 }, { amountCents: -1 }, { amountCents: 1.5 }, { date: '2026-02-30' }, { matchId: 'unknown' }, { category: 'unknown' }, { description: ' ' }, { note: null }]) assert.throws(() => validateState({ ...exampleData(), incomes: [{ ...sampleIncome, ...patch }] }));
  assert.throws(() => validateState({ ...exampleData(), incomes: [sampleIncome, sampleIncome] }), /eindeutig/);
  assert.throws(() => validateState({ ...exampleData(), incomes: {} }), /Liste/);
  assert.throws(() => validateState({ ...exampleData(), treasuryOpeningBalanceCents: 1.5 }), /Anfangsbestand/);
  assert.throws(() => validateState({ ...exampleData(), treasuryBalanceCents: '100' }), /Kassenstand/);
});

test('Geldbeträge werden mit Komma oder Punkt exakt in Cent umgewandelt', () => {
  assert.equal(moneyCents('42,50'), 4250);
  assert.equal(moneyCents('0.29'), 29);
  assert.equal(moneyCents('-12,50', true), -1250);
  assert.throws(() => moneyCents('1,005'));
  assert.throws(() => moneyCents('-1'));
});

test('Alte Backups ohne Ausgaben bleiben gültig', () => {
  const state = exampleData();
  delete state.expenses;
  assert.equal(validateState(state), state);
  assert.deepEqual(expenseTotals(state.expenses), { amountCents: 0, openCents: 0 });
});

test('Ausgaben mit und ohne Spieltag summieren Centbeträge ohne Fahrtkosten', () => {
  const state = { ...exampleData(), expenses: [sampleExpense, { ...sampleExpense, id: 'E2', matchId: null, category: 'marketing', amountCents: 101, reimbursementStatus: 'not_required' }, { ...sampleExpense, id: 'E3', amountCents: 202, reimbursementStatus: 'reimbursed' }] };
  validateState(state);
  assert.deepEqual(expenseTotals(state.expenses), { amountCents: 4553, openCents: 4250 });
  assert.deepEqual(expenseTotals(state.expenses.filter(expense => expense.matchId === 'ST01')), { amountCents: 4452, openCents: 4250 });
  assert.equal(statistics(state)[0].reimbursement, 24);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))).expenses, state.expenses);
});

test('Ungültige Ausgaben und doppelte IDs werden abgewiesen', () => {
  for (const patch of [{ amountCents: 0 }, { amountCents: -1 }, { amountCents: 1.5 }, { amountCents: Number.MAX_SAFE_INTEGER + 1 }, { date: '2026-02-30' }, { matchId: 'unknown' }, { category: 'unknown' }, { reimbursementStatus: 'unknown' }, { paidByPlayerId: 'unknown' }, { paidByPlayerId: undefined, paidBy: ' ' }, { description: '' }, { note: null }]) {
    assert.throws(() => validateState({ ...exampleData(), expenses: [{ ...sampleExpense, ...patch }] }));
  }
  assert.throws(() => validateState({ ...exampleData(), expenses: [sampleExpense, sampleExpense] }), /eindeutig/);
  assert.throws(() => validateState({ ...exampleData(), expenses: {} }), /Liste/);
});

test('Zahlende Spieler bleiben bei Namensänderungen per ID verknüpft, null ist die Mannschaftskasse', () => {
  const state = validateState({ ...exampleData(), expenses: [sampleExpense, { ...sampleExpense, id: 'E2', paidByPlayerId: null }] });
  assert.equal(expensePayer(state, state.expenses[0]), 'Anna');
  const renamed = validateState({ ...state, players: state.players.map(player => player.id === 'P1' ? { ...player, name: 'Anna Müller' } : player) });
  assert.equal(expensePayer(renamed, renamed.expenses[0]), 'Anna Müller');
  assert.equal(renamed.expenses[0].paidByPlayerId, 'P1');
  assert.equal(expensePayer(renamed, renamed.expenses[1]), 'Mannschaftskasse');
});

test('Alte Zahlernamen werden ohne Datenverlust migriert, unbekannte Namen bleiben offen', () => {
  const { paidByPlayerId, ...legacy } = sampleExpense;
  const state = { ...exampleData(), expenses: [{ ...legacy, paidBy: ' ANNA ' }, { ...legacy, id: 'E2', paidBy: 'Mannschaftskasse' }, { ...legacy, id: 'E3', paidBy: 'Ehemaliger Spieler' }] };
  const migrated = validateState(state);
  assert.equal(migrated.expenses[0].paidByPlayerId, 'P1');
  assert.equal(migrated.expenses[1].paidByPlayerId, null);
  assert.equal(migrated.expenses[2].paidByPlayerId, undefined);
  assert.equal(migrated.expenses[2].paidBy, 'Ehemaliger Spieler');
  assert.equal(state.expenses[0].paidBy, ' ANNA ');
  assert.equal(expenseTotals(migrated.expenses).amountCents, 12750);
});

test('Spieler mit verknüpften Ausgaben können nicht gelöscht werden', () => {
  const state = { ...exampleData(), expenses: [sampleExpense] };
  assert.throws(() => removePlayer(state, 'P1'), /Ausgaben verknüpft/);
  assert.throws(() => validateState({ ...state, players: state.players.filter(player => player.id !== 'P1'), entries: state.entries.filter(entry => entry.playerId !== 'P1') }), /zahlenden Spieler/);
  assert.equal(removePlayer(state, 'P2').players.some(player => player.id === 'P2'), false);
  assert.equal(removePlayer({ ...state, expenses: [{ ...sampleExpense, paidByPlayerId: null }] }, 'P1').expenses.length, 1);
});

test('Beispieldaten berechnen Spieltage, Fahrten, Dienste und Erstattung korrekt', () => {
  const state = validateState(exampleData());
  assert.deepEqual(statistics(state).map(({ name, played, drove, km, ref1, ref2, table, lines, reimbursement }) => ({ name, played, drove, km, ref1, ref2, table, lines, reimbursement })), [
    { name: 'Anna', played: 2, drove: 1, km: 80, ref1: 1, ref2: 0, table: 1, lines: 0, reimbursement: 24 },
    { name: 'Ben', played: 2, drove: 1, km: 120, ref1: 1, ref2: 1, table: 0, lines: 0, reimbursement: 36 },
    { name: 'Clara', played: 1, drove: 0, km: 0, ref1: 0, ref2: 1, table: 1, lines: 0, reimbursement: 0 },
    { name: 'David', played: 2, drove: 0, km: 0, ref1: 0, ref2: 0, table: 2, lines: 0, reimbursement: 0 },
  ]);
});

test('Doppelte Spieler, Namen und Spieltag-Einträge werden abgewiesen', () => {
  const state = exampleData();
  assert.throws(() => addEntry(state, 'ST01', 'P1'), /nur einmal/);
  assert.throws(() => addPlayer(state, '  ANNA  '), /eindeutig/);
  assert.equal(nextMatchId(state), 'ST03');
});

test('Neue Spieler und Dienste ohne Teilnahme aktualisieren die Statistik', () => {
  let state = addPlayer(exampleData(), 'Eva');
  const playerId = state.players.at(-1).id;
  state = addEntry(state, 'ST02', playerId);
  state = updateEntry(state, 'ST02', playerId, { ref1: 2, table: 1 });
  const stats = statistics(state).at(-1);
  assert.equal(stats.played, 0);
  assert.equal(stats.ref1, 2);
  assert.equal(stats.table, 1);
});

test('Extra-Punkte werden als nichtnegative ganze Zahlen validiert', () => {
  const state = exampleData();
  assert.throws(() => updateEntry(state, 'ST01', 'P1', { extra: 1.5 }), /Extra-Punkte/);
  assert.throws(() => updateEntry(state, 'ST01', 'P1', { extra: -1 }), /Extra-Punkte/);
});

test('Nur Fahrer haben Kilometer, Dienste bleiben nichtnegative ganze Zahlen', () => {
  const state = updateEntry(exampleData(), 'ST01', 'P1', { drove: false });
  assert.equal(state.entries[0].km, 0);
  assert.throws(() => updateEntry(state, 'ST01', 'P2', { ref1: 1.5 }), /ganze Zahlen/);
  assert.throws(() => updateEntry(state, 'ST01', 'P2', { table: -1 }), /ganze Zahlen/);
  assert.throws(() => updateEntry(state, 'ST01', 'P2', { drove: true, km: -4 }), /Kilometer/);
});

test('Backup-Validierung prüft Referenzen, Datumswerte und echte boolesche Werte', () => {
  const state = exampleData();
  state.entries[0].played = 'WAHR';
  assert.throws(() => validateState(state), /boolesche/);
  const unknown = exampleData();
  unknown.entries[0].playerId = 'unknown';
  assert.throws(() => validateState(unknown), /unbekannten/);
  const invalidDate = exampleData();
  invalidDate.matches[0].date = '2026-02-30';
  assert.throws(() => validateState(invalidDate), /Datum/);
});

test('Geänderter Kilometersatz wird unmittelbar berücksichtigt', () => {
  const state = { ...exampleData(), rate: 0.45 };
  assert.equal(statistics(state)[0].reimbursement, 36);
  assert.equal(statistics(state)[1].reimbursement, 54);
});

test('SOLL wird pro Spieltag aus Team-Dienstpunkten je gespielter Teilnahme berechnet', () => {
  const state = exampleData();
  const [anna, ben, clara, david] = statistics(state);
  assert.equal(anna.scoreIst, 5);
  assert.ok(Math.abs(anna.scoreSoll - 14 / 3) < 1e-10);
  assert.equal(ben.scoreIst, 6);
  assert.ok(Math.abs(ben.scoreSoll - 14 / 3) < 1e-10);
  assert.equal(clara.scoreSoll, 2);
  assert.ok(Math.abs(david.scoreSoll - 14 / 3) < 1e-10);
});

test('Dienstpunkte lassen sich konfigurieren und ungültige Werte werden abgewiesen', () => {
  const state = { ...exampleData(), dutyPoints: { ref1: 5, ref2: 2, table: 1 } };
  assert.equal(statistics(state)[0].scoreIst, 7);
  assert.throws(() => validateState({ ...state, dutyPoints: { ref1: -1, ref2: 2, table: 1 } }), /Dienstpunkte/);
});

test('Linien-Dienste fließen in SOLL, IST und Statistik ein und alte Einsätze bleiben gültig', () => {
  const state = exampleData();
  state.entries[0].lines = 1;
  const [anna, ben] = statistics(state);
  assert.equal(anna.lines, 1);
  assert.equal(anna.scoreIst, 6);
  assert.ok(Math.abs(anna.scoreSoll - 59 / 12) < 1e-10);
  assert.ok(Math.abs(ben.scoreSoll - 59 / 12) < 1e-10);

  const configured = { ...state, dutyPoints: { ref1: 3, ref2: 2, table: 1, lines: 4 } };
  assert.equal(statistics(configured)[0].scoreIst, 9);
  assert.ok(Math.abs(statistics(configured)[0].scoreSoll - 17 / 3) < 1e-10);
});

test('Fahren erhöht SOLL pro Fahrer und ist konfigurierbar', () => {
  const state = exampleData();
  const [anna] = statistics(state);
  assert.equal(anna.scoreIst, 5);
  assert.ok(Math.abs(anna.scoreSoll - 14 / 3) < 1e-10);

  const configured = { ...state, dutyPoints: { ...state.dutyPoints, drive: 3 } };
  const [configuredAnna] = statistics(configured);
  assert.equal(configuredAnna.scoreIst, 7);
  assert.ok(Math.abs(configuredAnna.scoreSoll - 35 / 6) < 1e-10);
});

test('Der Spieltagsfaktor entspricht Teamaufwand je gespielter Teilnahme', () => {
  const state = exampleData();
  assert.equal(matchFactor(state, 'ST01'), 2);
  assert.ok(Math.abs(matchFactor(state, 'ST02') - 8 / 3) < 1e-10);
  assert.equal(matchFactor(state, 'missing-match'), 0);
});

test('Spieltag-Aufschlüsselung liefert nur Einsätze des Spielers mit Ziel- und Beitragspunkten', () => {
  const state = exampleData();
  const annaRows = playerMatchBreakdown(state, 'P1');
  assert.deepEqual(annaRows.map(row => row.matchId), ['ST01', 'ST02']);
  assert.equal(annaRows[0].zielbeitrag, 2);
  assert.equal(annaRows[0].beitrag, 4);
  assert.equal(annaRows[1].beitrag, 1);
  const claraRows = playerMatchBreakdown(state, 'P3');
  assert.deepEqual(claraRows.map(row => ({ matchId: row.matchId, played: row.played })), [
    { matchId: 'ST01', played: true },
    { matchId: 'ST02', played: false },
  ]);
  assert.ok(Math.abs(claraRows[1].zielbeitrag - 0) < 1e-10);
});

test('Extra-Punkte erhöhen den Teamfaktor für alle Gespielten und den IST-Score des Eintragenden', () => {
  const state = updateEntry(exampleData(), 'ST01', 'P1', { extra: 2 });
  const [anna, ben] = statistics(state);
  assert.equal(anna.extra, 2);
  assert.ok(Math.abs(anna.scoreSoll - 31 / 6) < 1e-10);
  assert.ok(Math.abs(ben.scoreSoll - 31 / 6) < 1e-10);
  assert.equal(anna.scoreIst, 7);
  assert.equal(ben.scoreIst, 6);
});