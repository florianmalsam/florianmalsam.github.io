import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleData, validateState, statistics, matchFactor, playerMatchBreakdown, addEntry, addPlayer, updateEntry, nextMatchId, expenseTotals, expensePayer, removePlayer, incomeTotal, treasuryTotals, moneyCents, initializeFinanceJournal, recordFinanceChanges, resetFinances } from './model.js';

const sampleExpense = { id: 'E1', date: '2026-10-17', description: 'Getränke', amountCents: 4250, category: 'catering', matchId: 'ST01', paidByPlayerId: 'P1', reimbursementStatus: 'open', note: '' };
const sampleIncome = { id: 'I1', date: '2026-10-17', description: 'Getränkeverkauf', amountCents: 10000, category: 'catering', matchId: 'ST01', note: '' };

test('Kassenjournal startet mit dem aktuellen Bestand ohne erfundene Vorgeschichte', () => {
  const state = initializeFinanceJournal({ ...exampleData(), incomes: [sampleIncome] }, '2026-10-08T10:00:00.000Z');
  assert.equal(state.financeJournal.length, 1);
  assert.equal(state.financeJournal[0].balanceAfterCents, 10000);
  assert.equal(state.financeJournal[0].action, 'baseline');
  assert.equal(initializeFinanceJournal(state), state);
  assert.equal(exampleData().financeJournal, undefined);
});

test('Journal behält offene Auslagen, Erstattungen, Änderungen und Löschungen mit Kassenständen', () => {
  let state = initializeFinanceJournal(exampleData());
  state = recordFinanceChanges(state, { ...state, expenses: [sampleExpense] });
  assert.equal(state.financeJournal.at(-1).deltaCents, 0);
  assert.equal(state.financeJournal.at(-1).after.paidByName, 'Anna');
  const before = state;
  state = recordFinanceChanges(state, { ...state, expenses: [{ ...sampleExpense, reimbursementStatus: 'reimbursed' }] });
  assert.equal(state.financeJournal.at(-1).before.reimbursementStatus, 'open');
  assert.equal(state.financeJournal.at(-1).after.reimbursementStatus, 'reimbursed');
  assert.equal(state.financeJournal.at(-1).deltaCents, -4250);
  assert.equal(before.financeJournal.length, 2);
  state = recordFinanceChanges(state, { ...state, expenses: [{ ...state.expenses[0], amountCents: 5000 }] });
  assert.equal(state.financeJournal.at(-1).deltaCents, -750);
  assert.equal(state.financeJournal.at(-1).before.amountCents, 4250);
  state = recordFinanceChanges(state, { ...state, expenses: [] });
  assert.equal(state.financeJournal.at(-1).action, 'delete');
  assert.equal(state.financeJournal.at(-1).deltaCents, 5000);
  assert.equal(state.financeJournal.at(-1).before.description, 'Getränke');
  assert.equal(state.financeJournal.at(-1).balanceAfterCents, 0);
  assert.equal(state.financeJournal[1].after.amountCents, 4250);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))).financeJournal, state.financeJournal);
});

test('Journal protokolliert Einnahmen und Anfangsbestand, ignoriert unveränderte Finanzdaten', () => {
  let state = initializeFinanceJournal(exampleData());
  state = recordFinanceChanges(state, { ...state, treasuryOpeningBalanceCents: 5000, incomes: [sampleIncome], expenses: [{ ...sampleExpense, paidByPlayerId: null }] });
  assert.deepEqual(state.financeJournal.map(entry => entry.deltaCents), [0, 5000, 10000, -4250]);
  assert.equal(state.financeJournal.at(-1).balanceAfterCents, state.treasuryBalanceCents);
  const unchanged = recordFinanceChanges(state, { ...state, rate: 0.5 });
  assert.equal(unchanged.financeJournal.length, 4);
  state = recordFinanceChanges(unchanged, { ...unchanged, incomes: [{ ...sampleIncome, note: 'Korrektur' }] });
  assert.equal(state.financeJournal.at(-1).deltaCents, 0);
  assert.equal(state.financeJournal.at(-1).after.note, 'Korrektur');
});

test('Historische Namen und Spieltagsbezüge bleiben nach Änderungen erhalten', () => {
  let state = initializeFinanceJournal(exampleData());
  state = recordFinanceChanges(state, { ...state, expenses: [sampleExpense] });
  state = recordFinanceChanges(state, { ...state, matches: state.matches.filter(match => match.id !== 'ST01'), entries: state.entries.filter(entry => entry.matchId !== 'ST01'), expenses: [{ ...sampleExpense, matchId: null }] });
  assert.equal(state.financeJournal[1].after.matchName, 'VC Nord');
  assert.equal(state.financeJournal.at(-1).before.matchId, 'ST01');
  assert.equal(state.financeJournal.at(-1).after.matchId, null);
});

test('Ungültige Journaldaten werden abgewiesen', () => {
  const state = initializeFinanceJournal(exampleData());
  for (const patch of [{ at: 'invalid' }, { deltaCents: 1 }, { kind: 'unknown' }, { after: null }, { balanceAfterCents: 1 }]) assert.throws(() => validateState({ ...state, financeJournal: [{ ...state.financeJournal[0], ...patch }] }));
  assert.deepEqual(validateState({ ...state, financeJournal: [] }).financeJournal, []);
  assert.throws(() => validateState({ ...state, financeJournal: {} }));
  assert.throws(() => initializeFinanceJournal({ ...state, incomes: [sampleIncome] }), /aktuellen Kassenstand/);
});

test('Journal unterscheidet Spieler und Kasse auch bei gleichem Namen', () => {
  const state = initializeFinanceJournal({ ...exampleData(), players: exampleData().players.map(player => player.id === 'P1' ? { ...player, name: 'Mannschaftskasse' } : player) });
  const next = recordFinanceChanges(state, { ...state, expenses: [sampleExpense] });
  assert.equal(next.financeJournal.at(-1).deltaCents, 0);
  assert.equal(next.financeJournal.at(-1).after.paidFromTreasury, false);
});

test('Kassenreset löscht das Journal und setzt den Bestand dauerhaft auf null ohne Buchungen zu löschen', () => {
  const state = initializeFinanceJournal({ ...exampleData(), treasuryOpeningBalanceCents: 5000, incomes: [sampleIncome], expenses: [{ ...sampleExpense, paidByPlayerId: null }] });
  const reset = resetFinances(state, '2026-10-08T12:00:00.000Z');
  assert.equal(reset.treasuryBalanceCents, 0);
  assert.equal(reset.treasuryResetOffsetCents, -10750);
  assert.equal(reset.treasuryResetAt, '2026-10-08T12:00:00.000Z');
  assert.deepEqual(reset.financeJournal, []);
  assert.deepEqual(reset.incomes, state.incomes);
  assert.deepEqual(reset.expenses, state.expenses);
  assert.equal(state.financeJournal.length, 1);
  assert.deepEqual(initializeFinanceJournal(JSON.parse(JSON.stringify(reset))), reset);
  const changed = recordFinanceChanges(reset, { ...reset, incomes: [...reset.incomes, { ...sampleIncome, id: 'I2', amountCents: 1000 }] });
  assert.deepEqual(changed.financeJournal.map(entry => entry.deltaCents), [0, 1000]);
  assert.equal(changed.treasuryBalanceCents, 1000);
  assert.equal(changed.financeJournal[0].balanceAfterCents, 0);
  assert.equal(resetFinances(changed).treasuryResetOffsetCents, -11750);
  assert.deepEqual(recordFinanceChanges(reset, { ...reset, rate: 0.5 }).financeJournal, []);
});

test('Kassenreset unterstützt negative Kassenstände und prüft den gespeicherten Ausgleich', () => {
  const state = initializeFinanceJournal({ ...exampleData(), expenses: [{ ...sampleExpense, paidByPlayerId: null }] });
  assert.equal(resetFinances(state).treasuryBalanceCents, 0);
  assert.equal(resetFinances(state).treasuryResetOffsetCents, 4250);
  assert.throws(() => validateState({ ...state, treasuryResetOffsetCents: 1.5 }), /Reset-Ausgleich/);
  assert.throws(() => validateState({ ...state, treasuryResetAt: 'invalid' }), /Reset-Zeitpunkt/);
});

test('Alte Zielkassen werden entfernt und alle Einnahmen ohne Datenverlust in der Mannschaftskasse berücksichtigt', () => {
  const state = { ...exampleData(), treasuryOpeningBalanceCents: 5000, treasuryBalanceCents: 15000, clubIncomeTotalCents: 12345, incomes: [{ ...sampleIncome, destination: 'team' }, { ...sampleIncome, id: 'I2', destination: 'club', amountCents: 12345 }, { ...sampleIncome, id: 'I3', amountCents: 100 }] };
  const migrated = validateState(state);
  assert.equal(migrated.treasuryBalanceCents, 27445);
  assert.equal(Object.hasOwn(migrated, 'clubIncomeTotalCents'), false);
  assert.ok(migrated.incomes.every(income => !Object.hasOwn(income, 'destination')));
  assert.deepEqual(migrated.incomes.map(income => income.id), ['I1', 'I2', 'I3']);
  assert.equal(migrated.incomes[1].matchId, 'ST01');
  assert.equal(migrated.incomes[1].amountCents, 12345);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(migrated))), migrated);
  assert.equal(state.clubIncomeTotalCents, 12345);
  assert.equal(state.incomes[1].destination, 'club');
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