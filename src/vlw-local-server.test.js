import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVlwServer } from '../scripts/vlw-local-server.js';

test('lokale VLW-API verlangt Zugriffscode und schreibt ausschließlich in die lokale Datenbank', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'tsb-vlw-test-'));
  let failImport = false;
  const server = createVlwServer({
    databasePath: join(directory, 'vlw.sqlite'),
    token: 'test-admin-token',
    origins: ['http://localhost:5173'],
    scrape: async () => {
      if (failImport) throw new Error('Testfehler');
      return {
        importedAt: '2026-10-11T12:00:00.000Z',
        leagues: [{ id: 'L1', name: 'Oberliga Württemberg Männer' }],
        teams: [
          { id: 'T1', leagueId: 'L1', league: 'Oberliga Württemberg Männer', name: 'TSV Beispiel', url: 'https://www.vlw-online.de/team', players: [{ name: 'Müller, Anna' }, { name: 'Beispiel, Ben' }] },
          { id: 'T2', leagueId: 'L1', league: 'Oberliga Württemberg Männer', name: 'SV Ohne Kader', url: 'https://www.vlw-online.de/team-2', players: [] },
        ],
      };
    },
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    server.database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${server.address().port}/api/vlw`;
  const headers = { Origin: 'http://localhost:5173', Authorization: 'Bearer test-admin-token' };
  const root = await fetch(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(root.status, 200);
  assert.match(await root.text(), /Website als Admin/);
  assert.equal((await fetch(`${base}/status`, { headers: { Origin: headers.Origin } })).status, 401);
  assert.equal((await fetch(`${base}/status`, { headers: { ...headers, Origin: 'https://untrusted.example' } })).status, 403);
  const preflight = await fetch(`${base}/import`, { method: 'OPTIONS', headers: { Origin: headers.Origin, 'Access-Control-Request-Private-Network': 'true' } });
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');

  const imported = await fetch(`${base}/import`, { method: 'POST', headers });
  assert.equal(imported.status, 200);
  assert.deepEqual(await imported.json(), { teams: 2, players: 2, importedAt: '2026-10-11T12:00:00.000Z', leagues: 1 });
  const found = await fetch(`${base}/search?q=${encodeURIComponent('müller')}`, { headers });
  const results = await found.json();
  assert.equal(results.teams[0].name, 'TSV Beispiel');
  assert.deepEqual(results.teams[0].players, ['Beispiel, Ben', 'Müller, Anna']);
  assert.equal(results.teams[0].url, 'https://www.vlw-online.de/team');

  failImport = true;
  assert.equal((await fetch(`${base}/import`, { method: 'POST', headers })).status, 502);
  assert.equal((await (await fetch(`${base}/status`, { headers })).json()).teams, 2);
  assert.equal(server.database.prepare('SELECT type FROM sqlite_master WHERE name = ?').get('vlw_leagues').type, 'table');
});