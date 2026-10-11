import { copyFileSync, mkdirSync, renameSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { exportVlwDirectory } from './export-vlw-directory.js';

const source = resolve(process.env.VLW_DB_PATH || join(homedir(), 'Library', 'Application Support', 'TSB Herren 2 Stats', 'vlw.sqlite'));
const destination = resolve('public/vlw.sqlite');
const temporary = `${destination}.tmp`;
const database = new DatabaseSync(source, { readOnly: true });
let teamCount;
let playerCount;
try {
  teamCount = database.prepare('SELECT COUNT(*) AS count FROM vlw_teams').get().count;
  playerCount = database.prepare('SELECT COUNT(*) AS count FROM vlw_players').get().count;
  if (!teamCount) throw new Error('Die lokale VLW-Datenbank enthält keine Mannschaften.');
} finally {
  database.close();
}

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, temporary);
renameSync(temporary, destination);
const snapshot = exportVlwDirectory({ databasePath: destination });
console.log(`Öffentlicher VLW-Snapshot bereit: ${snapshot.leagues.length} Ligen, ${snapshot.teams.length} Mannschaften, ${snapshot.players} Spieler.`);
console.log('Bitte den Commit veröffentlichen, damit GitHub Pages den neuen Stand ausliefert.');