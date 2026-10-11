import * as cheerio from 'cheerio';

export const VLW_BASE_URL = 'https://www.vlw-online.de/cms/home/spielbetrieb/aktive/maenner.xhtml';
const supportedLeague = /^(?:Oberliga|Verbandsliga|Landesliga|Bezirksliga|Bezirksklasse)\b.*\bMänner$/i;

const cleanText = value => value.replace(/\s+/g, ' ').trim();

export function parseLeagues(html, baseUrl = VLW_BASE_URL) {
  const $ = cheerio.load(html);
  const leagues = new Map();
  $('a[href*="LeaguePresenter.view=teamOverview"]').each((_, element) => {
    const link = new URL($(element).attr('href'), baseUrl);
    const leagueId = link.searchParams.get('LeaguePresenter.matchSeriesId');
    const league = cleanText($(element).closest('td').text()).split(/Overall table/i)[0].trim();
    if (!leagueId || !supportedLeague.test(league) || leagues.has(leagueId)) return;
    leagues.set(leagueId, { id: leagueId, name: league, overviewUrl: link.href });
  });
  return [...leagues.values()];
}

export function parseTeams(html, league, baseUrl = VLW_BASE_URL) {
  const $ = cheerio.load(html);
  const teams = new Map();
  $('a[href*="teamListView.teamId"]').each((_, element) => {
    const name = cleanText($(element).text());
    if (!name || name.toLocaleLowerCase('de-DE') === 'teams') return;
    const url = new URL($(element).attr('href'), baseUrl);
    const id = url.searchParams.get('LeaguePresenter.teamListView.teamId');
    if (!id || teams.has(id)) return;
    teams.set(id, { id, leagueId: league.id, league: league.name, name, url: url.href });
  });
  return [...teams.values()];
}

export function parsePlayers(html) {
  const $ = cheerio.load(html);
  const table = $('table.samsDataTable').filter((_, element) => {
    const heading = cleanText($(element).find('thead th').first().text());
    return heading.toLocaleLowerCase('en-US') === 'player';
  }).first();
  const players = new Map();
  table.find('tbody tr').each((_, row) => {
    const name = cleanText($(row).children('td').first().find('a').first().text());
    if (!name || /^not visible$/i.test(name)) return;
    const key = name.toLocaleLowerCase('de-DE');
    if (!players.has(key)) players.set(key, { name });
  });
  return [...players.values()];
}

export function hasPlayerTable(html) {
  const $ = cheerio.load(html);
  return $('table.samsDataTable').toArray().some(element => cleanText($(element).find('thead th').first().text()).toLocaleLowerCase('en-US') === 'player');
}

export function hasTeamHeading(html, teamName) {
  const $ = cheerio.load(html);
  return $('h1').toArray().some(element => cleanText($(element).text()) === teamName);
}

async function fetchHtml(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { 'User-Agent': 'TSB-VLW-Local-Importer/1.0' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`VLW antwortet für ${new URL(url).pathname} mit HTTP ${response.status}.`);
  return response.text();
}

export async function scrapeVlw({ fetchImpl = fetch, onProgress = () => {} } = {}) {
  const maxAttempts = 5;
  const rootHtml = await fetchHtml(VLW_BASE_URL, fetchImpl);
  const leagues = parseLeagues(rootHtml);
  if (!leagues.length) throw new Error('Keine Männerligen von Oberliga bis Bezirksklasse gefunden. Die VLW-Seite könnte sich geändert haben.');

  const teams = [];
  for (const league of leagues) {
    let leagueTeams = [];
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const html = await fetchHtml(league.overviewUrl, fetchImpl);
      leagueTeams = parseTeams(html, league);
      if (leagueTeams.length) break;
      if (attempt < maxAttempts - 1) await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
    }
    if (!leagueTeams.length) throw new Error(`VLW hat für ${league.name} wiederholt keine Mannschaftsübersicht geliefert; die bestehende lokale Datenbank bleibt unverändert.`);
    teams.push(...leagueTeams);
  }

  const concurrency = 2;
  let completed = 0;
  for (let offset = 0; offset < teams.length; offset += concurrency) {
    const batch = teams.slice(offset, offset + concurrency);
    const loaded = await Promise.all(batch.map(async team => {
      let html;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        html = await fetchHtml(team.url, fetchImpl);
        if (hasPlayerTable(html) || hasTeamHeading(html, team.name)) break;
        if (attempt < maxAttempts - 1) await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
      }
      if (!hasPlayerTable(html) && !hasTeamHeading(html, team.name)) throw new Error(`VLW hat für ${team.name} wiederholt keine vollständige Mannschaftsseite geliefert; die bestehende lokale Datenbank bleibt unverändert.`);
      const players = parsePlayers(html);
      completed++;
      onProgress({ completed, total: teams.length, team: team.name });
      return { ...team, players };
    }));
    teams.splice(offset, loaded.length, ...loaded);
  }
  return { leagues, teams, importedAt: new Date().toISOString() };
}