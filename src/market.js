import { calculate, normalize, validDate, methodology } from './technical.js';
import { verifyAccess } from './access.js';

const symbolPattern = /^[A-Z^][A-Z0-9.^-]{0,19}$/;
const sectorEtfs = { Technology: 'XLK', 'Information Technology': 'XLK', 'Communication Services': 'XLC', 'Consumer Cyclical': 'XLY', 'Consumer Discretionary': 'XLY', 'Consumer Defensive': 'XLP', 'Consumer Staples': 'XLP', Energy: 'XLE', Financials: 'XLF', 'Financial Services': 'XLF', Healthcare: 'XLV', 'Health Care': 'XLV', Industrials: 'XLI', 'Basic Materials': 'XLB', Materials: 'XLB', 'Real Estate': 'XLRE', Utilities: 'XLU' };
const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function handleMarket(request, env, ctx, fetchImpl = fetch) {
  const access = await verifyAccess(request, env, ctx);
  if (access.status !== 200) return reply({ error: access.error }, access.status);
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
  const p = new URL(request.url).searchParams;
  const symbol = (p.get('symbol') || '').toUpperCase();
  let sector = (p.get('sector') || '').toUpperCase();
  const benchmark = (p.get('benchmark') || '^GSPC').toUpperCase();
  const from = p.get('from') || '2000-01-01', to = p.get('to') || new Date().toISOString().slice(0, 10);
  if (![symbol, benchmark, ...(sector ? [sector] : [])].every(s => symbolPattern.test(s)) || !validDate(from) || !validDate(to) || from > to || Date.parse(to) - Date.parse(from) > 40 * 366 * 86400000) return reply({ error: 'Enter valid symbols and a date range of at most 40 years.' }, 400);
  let options;
  try { options = methodology(Object.fromEntries(['short', 'long', 'lookback', 'sigma', 'sell', 'buy', 'flat'].filter(k => p.has(k)).map(k => [k, k === 'flat' ? p.get(k) : Number(p.get(k))]))); }
  catch { return reply({ error: 'Invalid methodology settings.' }, 400); }
  if (!env.DB?.prepare || !env.FMP_API_KEY?.trim()) return reply({ error: 'Market data requires the existing D1 binding and FMP secret.' }, 503);
  const now = Date.now(), ttl = 6 * 3600000;
  let cacheHits = 0;
  async function provider(path, params) {
    const url = new URL('https://financialmodelingprep.com/stable/' + path);
    for (const [k, v] of Object.entries({ ...params, apikey: env.FMP_API_KEY })) url.searchParams.set(k, v);
    const res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('upstream');
    return res.json();
  }
  async function writeCache(key, payload) {
    await env.DB.prepare('INSERT INTO market_history_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at').bind(key, JSON.stringify(payload), now).run();
  }
  async function history(ticker) {
    const needsVolume = ticker === symbol;
    const key = JSON.stringify(['fmp-eod-v1', ticker, from, to]);
    const cached = await env.DB.prepare('SELECT payload, fetched_at FROM market_history_cache WHERE cache_key = ?').bind(key).first();
    if (cached && now - cached.fetched_at < ttl) {
      try { const rows = normalize(JSON.parse(cached.payload), needsVolume); cacheHits++; return rows; } catch { /* Refresh invalid cache. */ }
    }
    const rows = normalize(await provider('historical-price-eod/full', { symbol: ticker, from, to }), needsVolume).filter(r => r.date >= from && r.date <= to);
    if (!rows.length) throw new Error('empty');
    await writeCache(key, rows);
    return rows;
  }
  try {
    const sectorSource = sector ? 'User-selected benchmark' : 'Current company sector mapped to ETF proxy';
    if (!sector) {
      const key = JSON.stringify(['fmp-profile-sector-v1', symbol]);
      const cached = await env.DB.prepare('SELECT payload, fetched_at FROM market_history_cache WHERE cache_key = ?').bind(key).first();
      let name;
      if (cached && now - cached.fetched_at < ttl) {
        try { name = JSON.parse(cached.payload); } catch { /* Refresh invalid cache. */ }
      }
      if (!sectorEtfs[name]) {
        const profile = await provider('profile', { symbol });
        if (!Array.isArray(profile) || profile.length !== 1 || profile[0].symbol !== symbol || !sectorEtfs[profile[0].sector]) throw new Error('sector');
        name = profile[0].sector;
        await writeCache(key, name);
      }
      sector = sectorEtfs[name];
    }
    // Sequential: at most one profile and three history requests; no retries or redirects.
    const histories = new Map();
    for (const ticker of new Set([symbol, sector, benchmark])) histories.set(ticker, await history(ticker));
    const result = calculate(histories.get(symbol), histories.get(sector), histories.get(benchmark), options);
    return reply({ symbol, sector, sectorSource, benchmark, from, to, cacheHits, source: 'FMP EOD close and volume', ...result });
  } catch {
    // Never expose exception messages, request URLs, response bodies, or credentials.
    return reply({ error: 'History could not be loaded. Check the cache migration, FMP symbol coverage, subscription and service availability.' }, 502);
  }
}
