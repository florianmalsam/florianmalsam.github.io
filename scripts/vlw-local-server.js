import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scrapeVlw } from './vlw-scraper.js';

export const VLW_API_ORIGINS = [
  'https://florianmalsam.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function openVlwDatabase(path = join(homedir(), 'Library', 'Application Support', 'TSB Herren 2 Stats', 'vlw.sqlite')) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(path);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS vlw_leagues (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vlw_teams (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES vlw_leagues(id),
      name TEXT NOT NULL,
      url TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vlw_players (
      team_id TEXT NOT NULL REFERENCES vlw_teams(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      PRIMARY KEY (team_id, name)
    );
    CREATE TABLE IF NOT EXISTS vlw_import_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      imported_at TEXT NOT NULL
    );
  `);
  return database;
}

function saveImport(database, result) {
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec('DELETE FROM vlw_players; DELETE FROM vlw_teams; DELETE FROM vlw_leagues;');
    const insertLeague = database.prepare('INSERT INTO vlw_leagues (id, name, sort_order) VALUES (?, ?, ?)');
    result.leagues.forEach((league, index) => insertLeague.run(league.id, league.name, index));
    const insertTeam = database.prepare('INSERT INTO vlw_teams (id, league_id, name, url) VALUES (?, ?, ?, ?)');
    const insertPlayer = database.prepare('INSERT INTO vlw_players (team_id, name) VALUES (?, ?)');
    for (const team of result.teams) {
      insertTeam.run(team.id, team.leagueId, team.name, team.url);
      for (const player of team.players) insertPlayer.run(team.id, player.name);
    }
    database.prepare('INSERT INTO vlw_import_meta (id, imported_at) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET imported_at = excluded.imported_at').run(result.importedAt);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function getImportStatus(database) {
  const counts = database.prepare('SELECT (SELECT COUNT(*) FROM vlw_teams) AS teams, (SELECT COUNT(*) FROM vlw_players) AS players').get();
  const metadata = database.prepare('SELECT imported_at AS importedAt FROM vlw_import_meta WHERE id = 1').get();
  return { ...counts, importedAt: metadata?.importedAt || null };
}

function searchTeams(database, query) {
  const search = query.trim().toLocaleLowerCase('de-DE');
  if (!search) return [];
  const rows = database.prepare(`
    SELECT l.name AS league, l.sort_order AS leagueOrder, t.id, t.name, t.url, p.name AS player
    FROM vlw_teams t
    JOIN vlw_leagues l ON l.id = t.league_id
    LEFT JOIN vlw_players p ON p.team_id = t.id
    ORDER BY l.sort_order, t.name COLLATE NOCASE, p.name COLLATE NOCASE
  `).all();
  const teams = new Map();
  for (const row of rows) {
    let team = teams.get(row.id);
    if (!team) {
      team = { id: row.id, name: row.name, league: row.league, url: row.url, players: [] };
      teams.set(row.id, team);
    }
    if (row.player) team.players.push(row.player);
  }
  return [...teams.values()].filter(team => team.name.toLocaleLowerCase('de-DE').includes(search) || team.players.some(player => player.toLocaleLowerCase('de-DE').includes(search))).slice(0, 100);
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function isAuthorized(request, token) {
  const match = /^Bearer (.+)$/.exec(request.headers.authorization || '');
  if (!match) return false;
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createVlwServer({ databasePath, token, origins = VLW_API_ORIGINS, scrape = scrapeVlw } = {}) {
  if (!token) throw new Error('Ein lokaler Zugriffscode ist erforderlich.');
  const database = openVlwDatabase(databasePath);
  let importing = false;
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && !origins.includes(origin)) {
      sendJson(response, 403, { error: 'Diese Website ist für den lokalen Import nicht freigegeben.' });
      return;
    }
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Max-Age': '600',
      });
      response.end();
      return;
    }
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Lokaler VLW-Importdienst läuft. Öffne die Website als Admin und wähle den Bereich VLW. Die Import-API ist zugriffscodegeschützt.');
      return;
    }
    if (!isAuthorized(request, token)) {
      sendJson(response, 401, { error: 'Der lokale Zugriffscode ist ungültig.' });
      return;
    }

    try {
      if (request.method === 'GET' && url.pathname === '/api/vlw/status') {
        sendJson(response, 200, getImportStatus(database));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/vlw/search') {
        const query = url.searchParams.get('q') || '';
        if (query.length > 100) {
          sendJson(response, 400, { error: 'Bitte einen kürzeren Suchbegriff eingeben.' });
          return;
        }
        sendJson(response, 200, { teams: searchTeams(database, query) });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/vlw/import') {
        if (importing) {
          sendJson(response, 409, { error: 'Ein VLW-Import läuft bereits.' });
          return;
        }
        importing = true;
        try {
          const result = await scrape();
          if (!result.leagues.length || !result.teams.length) throw new Error('Der Import war unvollständig; die vorhandene lokale Datenbank bleibt unverändert.');
          saveImport(database, result);
          sendJson(response, 200, { ...getImportStatus(database), leagues: result.leagues.length });
        } finally {
          importing = false;
        }
        return;
      }
      sendJson(response, 404, { error: 'API-Endpunkt nicht gefunden.' });
    } catch (error) {
      sendJson(response, 502, { error: error instanceof Error ? error.message : 'Der VLW-Import ist fehlgeschlagen.' });
    }
  });
  server.database = database;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const token = randomBytes(32).toString('base64url');
  const port = Number(process.env.VLW_PORT || 4179);
  const server = createVlwServer({ databasePath: process.env.VLW_DB_PATH, token });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Lokaler VLW-Dienst bereit auf http://127.0.0.1:${port}`);
    console.log(`Einmaliger Zugriffscode für die Admin-Oberfläche: ${token}`);
    console.log(`Datenbank: ${process.env.VLW_DB_PATH || join(homedir(), 'Library', 'Application Support', 'TSB Herren 2 Stats', 'vlw.sqlite')}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => {
    server.database.close();
    process.exit(0);
  }));
}