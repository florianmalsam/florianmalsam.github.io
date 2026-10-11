import { mkdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function exportVlwDirectory({
  databasePath = resolve(projectRoot, 'public/vlw.sqlite'),
  outputPath = resolve(projectRoot, 'public/vlw-directory.json'),
} = {}) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  let snapshot;
  try {
    const leagues = database.prepare('SELECT id, name FROM vlw_leagues ORDER BY sort_order').all();
    const rows = database.prepare(`
      SELECT t.id, t.league_id AS leagueId, l.name AS league, t.name, t.url, p.name AS player
      FROM vlw_teams t
      JOIN vlw_leagues l ON l.id = t.league_id
      LEFT JOIN vlw_players p ON p.team_id = t.id
      ORDER BY l.sort_order, t.name COLLATE NOCASE, p.name COLLATE NOCASE
    `).all();
    const teams = new Map();
    for (const row of rows) {
      let team = teams.get(row.id);
      if (!team) {
        team = { id: row.id, leagueId: row.leagueId, league: row.league, name: row.name, url: row.url, players: [] };
        teams.set(row.id, team);
      }
      if (row.player) team.players.push(row.player);
    }
    const metadata = database.prepare('SELECT imported_at AS importedAt FROM vlw_import_meta WHERE id = 1').get();
    snapshot = {
      importedAt: metadata?.importedAt || null,
      leagues,
      teams: [...teams.values()],
      players: rows.reduce((total, row) => total + (row.player ? 1 : 0), 0),
    };
  } finally {
    database.close();
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(snapshot));
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const snapshot = exportVlwDirectory();
  console.log(`VLW-Verzeichnis exportiert: ${snapshot.leagues.length} Ligen, ${snapshot.teams.length} Mannschaften, ${snapshot.players} Spieler.`);
}