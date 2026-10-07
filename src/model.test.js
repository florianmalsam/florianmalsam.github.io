import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleData, validateState, statistics, addEntry, addPlayer, updateEntry, nextMatchId } from './model.js';

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
  assert.equal(anna.scoreIst, 4);
  assert.ok(Math.abs(anna.scoreSoll - 49 / 12) < 1e-10);
  assert.equal(ben.scoreIst, 5);
  assert.ok(Math.abs(ben.scoreSoll - 49 / 12) < 1e-10);
  assert.equal(clara.scoreSoll, 1.75);
  assert.ok(Math.abs(david.scoreSoll - 49 / 12) < 1e-10);
});

test('Dienstpunkte lassen sich konfigurieren und ungültige Werte werden abgewiesen', () => {
  const state = { ...exampleData(), dutyPoints: { ref1: 5, ref2: 2, table: 1 } };
  assert.equal(statistics(state)[0].scoreIst, 6);
  assert.throws(() => validateState({ ...state, dutyPoints: { ref1: -1, ref2: 2, table: 1 } }), /Dienstpunkte/);
});

test('Linien-Dienste fließen in SOLL, IST und Statistik ein und alte Einsätze bleiben gültig', () => {
  const state = exampleData();
  state.entries[0].lines = 1;
  const [anna, ben] = statistics(state);
  assert.equal(anna.lines, 1);
  assert.equal(anna.scoreIst, 5);
  assert.ok(Math.abs(anna.scoreSoll - 13 / 3) < 1e-10);
  assert.ok(Math.abs(ben.scoreSoll - 13 / 3) < 1e-10);

  const configured = { ...state, dutyPoints: { ref1: 3, ref2: 2, table: 1, lines: 4 } };
  assert.equal(statistics(configured)[0].scoreIst, 8);
  assert.ok(Math.abs(statistics(configured)[0].scoreSoll - 61 / 12) < 1e-10);
});