import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPlayerTable, hasTeamHeading, parseLeagues, parsePlayers, parseTeams } from '../scripts/vlw-scraper.js';

test('VLW-Ligen von der Bezirksklasse bis zur Oberliga werden erkannt, höhere Ligen ausgelassen', () => {
  const html = `<table><tr><td>Dritte Liga Süd Männer Overall table<ul><li><a href="?LeaguePresenter.view=teamOverview&amp;LeaguePresenter.matchSeriesId=1">Teams</a></li></ul></td></tr>
    <tr><td>Regionalliga Süd Männer Overall table<ul><li><a href="?LeaguePresenter.view=teamOverview&amp;LeaguePresenter.matchSeriesId=2">Teams</a></li></ul></td></tr>
    <tr><td>Oberliga Württemberg Männer Overall table<ul><li><a href="?LeaguePresenter.view=teamOverview&amp;LeaguePresenter.matchSeriesId=3">Teams</a></li></ul></td></tr>
    <tr><td>Verbandsliga 1 Männer Overall table<ul><li><a href="?LeaguePresenter.view=teamOverview&amp;LeaguePresenter.matchSeriesId=4">Teams</a></li></ul></td></tr>
    <tr><td>Landesliga 2 Männer Overall table<ul><li><a href="?LeaguePresenter.view=teamOverview&amp;LeaguePresenter.matchSeriesId=5">Teams</a></li></ul></td></tr>
    <tr><td>Bezirksliga 1 Männer Overall table<ul><li><a href="?LeaguePresenter.view=teamOverview&amp;LeaguePresenter.matchSeriesId=6">Teams</a></li></ul></td></tr>
    <tr><td>Bezirksklasse 9 Männer Overall table<ul><li><a href="?LeaguePresenter.view=teamOverview&amp;LeaguePresenter.matchSeriesId=7">Teams</a></li></ul></td></tr></table>`;
  assert.deepEqual(parseLeagues(html).map(league => [league.id, league.name]), [
    ['3', 'Oberliga Württemberg Männer'],
    ['4', 'Verbandsliga 1 Männer'],
    ['5', 'Landesliga 2 Männer'],
    ['6', 'Bezirksliga 1 Männer'],
    ['7', 'Bezirksklasse 9 Männer'],
  ]);
});

test('VLW-Mannschaften enthalten ihren Namen, ihre Liga und den direkten Teamlink', () => {
  const html = `<a href="?LeaguePresenter.matchSeriesId=3&amp;LeaguePresenter.teamListView.view=teamMain&amp;LeaguePresenter.view=teamOverview&amp;LeaguePresenter.teamListView.teamId=42#team">TSV Beispiel</a>`;
  const teams = parseTeams(html, { id: '3', name: 'Oberliga Württemberg Männer' });
  assert.equal(teams.length, 1);
  assert.equal(teams[0].name, 'TSV Beispiel');
  assert.equal(teams[0].league, 'Oberliga Württemberg Männer');
  assert.equal(new URL(teams[0].url).searchParams.get('LeaguePresenter.teamListView.teamId'), '42');
});

test('Scraper wiederholt verkürzte Teamantworten, bis die Spielertabelle vorhanden ist', async () => {
  const root = `<table><tr><td>Oberliga Württemberg Männer Overall table<a href="?LeaguePresenter.view=teamOverview&amp;LeaguePresenter.matchSeriesId=1">Teams</a></td></tr></table>`;
  const overview = `<a href="?LeaguePresenter.matchSeriesId=1&amp;LeaguePresenter.teamListView.view=teamMain&amp;LeaguePresenter.view=teamOverview&amp;LeaguePresenter.teamListView.teamId=42#team">TSV Beispiel</a>`;
  const roster = `<table class="samsDataTable"><thead><tr><th>Player</th></tr></thead><tbody><tr><td><a>Müller, Anna</a></td></tr></tbody></table>`;
  const attempts = new Map();
  const fetchImpl = async url => {
    const value = String(url);
    attempts.set(value, (attempts.get(value) || 0) + 1);
    const body = value.includes('teamId=42') ? attempts.get(value) < 4 ? '<html>Temporär verkürzt</html>' : roster : value.includes('view=teamOverview') ? overview : root;
    return new Response(body, { status: 200 });
  };
  const { scrapeVlw } = await import('../scripts/vlw-scraper.js');
  const result = await scrapeVlw({ fetchImpl });
  assert.equal(result.teams[0].players[0].name, 'Müller, Anna');
  assert.equal(attempts.get(result.teams[0].url), 4);
});

test('Scraper wiederholt leere Ligaübersichten, bis Mannschaftslinks vorhanden sind', async () => {
  const root = `<table><tr><td>Oberliga Württemberg Männer Overall table<a href="?LeaguePresenter.view=teamOverview&amp;LeaguePresenter.matchSeriesId=1">Teams</a></td></tr></table>`;
  const overview = `<a href="?LeaguePresenter.matchSeriesId=1&amp;LeaguePresenter.teamListView.view=teamMain&amp;LeaguePresenter.view=teamOverview&amp;LeaguePresenter.teamListView.teamId=42#team">TSV Beispiel</a>`;
  const roster = `<table class="samsDataTable"><thead><tr><th>Player</th></tr></thead><tbody><tr><td><a>Müller, Anna</a></td></tr></tbody></table>`;
  const attempts = new Map();
  const fetchImpl = async url => {
    const value = String(url);
    attempts.set(value, (attempts.get(value) || 0) + 1);
    const body = value.includes('teamId=42') ? roster : value.includes('view=teamOverview') ? attempts.get(value) === 1 ? '<html>Temporär verkürzt</html>' : overview : root;
    return new Response(body, { status: 200 });
  };
  const { scrapeVlw } = await import('../scripts/vlw-scraper.js');
  const result = await scrapeVlw({ fetchImpl });
  assert.equal(result.teams[0].name, 'TSV Beispiel');
  assert.equal(attempts.get(result.leagues[0].overviewUrl), 2);
});

test('Scraper speichert Teams ohne öffentliche Spielerliste mit leerem Kader', async () => {
  const root = `<table><tr><td>Oberliga Württemberg Männer Overall table<a href="?LeaguePresenter.view=teamOverview&amp;LeaguePresenter.matchSeriesId=1">Teams</a></td></tr></table>`;
  const overview = `<a href="?LeaguePresenter.matchSeriesId=1&amp;LeaguePresenter.teamListView.view=teamMain&amp;LeaguePresenter.view=teamOverview&amp;LeaguePresenter.teamListView.teamId=42#team">TSV Ohne Kader</a>`;
  const emptyTeam = '<h1>TSV Ohne Kader</h1>';
  const fetchImpl = async url => new Response(String(url).includes('teamId=42') ? emptyTeam : String(url).includes('view=teamOverview') ? overview : root, { status: 200 });
  const { scrapeVlw } = await import('../scripts/vlw-scraper.js');
  const result = await scrapeVlw({ fetchImpl });
  assert.deepEqual(result.teams[0].players, []);
  assert.equal(hasTeamHeading(emptyTeam, 'TSV Ohne Kader'), true);
  assert.equal(hasTeamHeading(emptyTeam, 'Anderes Team'), false);
});

test('Kaderparser überspringt verborgene Spielernamen und dedupliziert doppelte Tabellen', () => {
  const table = `<table class="samsDataTable"><thead><tr><th>Player</th></tr></thead><tbody>
    <tr><td><a><span class="hint">Not visible</span></a></td></tr>
    <tr><td><a>Birkert, Paul</a></td></tr>
    <tr><td><a>Gerbig, Nils</a></td></tr>
  </tbody></table>`;
  assert.deepEqual(parsePlayers(`${table}${table}`), [{ name: 'Birkert, Paul' }, { name: 'Gerbig, Nils' }]);
  assert.equal(hasPlayerTable(table), true);
  assert.equal(hasPlayerTable('<html><body>VLW</body></html>'), false);
  assert.deepEqual(parsePlayers('<html><body>VLW</body></html>'), []);
});