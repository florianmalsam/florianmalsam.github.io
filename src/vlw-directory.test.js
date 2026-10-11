import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openVlwDatabase } from '../scripts/vlw-local-server.js';
import { exportVlwDirectory } from '../scripts/export-vlw-directory.js';

test('öffentlicher JSON-Index enthält Teamlinks, sichtbare Spieler und Importzeit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tsb-vlw-snapshot-'));
  const databasePath = join(directory, 'vlw.sqlite');
  const outputPath = join(directory, 'vlw-directory.json');
  const database = openVlwDatabase(databasePath);
  database.prepare('INSERT INTO vlw_leagues (id, name, sort_order) VALUES (?, ?, ?)').run('L1', 'Bezirksklasse 9 Männer', 0);
  database.prepare('INSERT INTO vlw_teams (id, league_id, name, url) VALUES (?, ?, ?, ?)').run('T1', 'L1', 'TSV Beispiel', 'https://www.vlw-online.de/team');
  database.prepare('INSERT INTO vlw_players (team_id, name) VALUES (?, ?)').run('T1', 'Müller, Anna');
  database.prepare('INSERT INTO vlw_import_meta (id, imported_at) VALUES (1, ?)').run('2026-10-11T09:00:00.000Z');
  database.close();

  try {
    const snapshot = exportVlwDirectory({ databasePath, outputPath });
    assert.equal(snapshot.leagues.length, 1);
    assert.equal(snapshot.players, 1);
    assert.deepEqual(snapshot.teams[0], {
      id: 'T1', leagueId: 'L1', league: 'Bezirksklasse 9 Männer', name: 'TSV Beispiel',
      url: 'https://www.vlw-online.de/team', players: ['Müller, Anna'],
    });
    assert.deepEqual(JSON.parse(readFileSync(outputPath, 'utf8')), JSON.parse(JSON.stringify(snapshot)));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});