import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleData, validateState, statistics, matchFactor, playerMatchBreakdown, addEntry, addPlayer, updateEntry, nextMatchId } from './model.js';

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