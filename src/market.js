import { calculate, normalize, validDate, methodology } from './technical.js';
import { sectorAliases, sectorEtfs, resolveSectorEtf } from './sectors.js';
import { quoteBar, exchangeDate, sessionHasStarted, currentSessionBar, mergeCurrentBar } from './current-quote.js';

const symbolPattern = /^[A-Z^][A-Z0-9.^-]{0,19}$/;
const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function handleMarket(request, env, ctx, fetchImpl = fetch, nowMs = Date.now()) {
  // Public chart data; operator diagnostics retain their separate Access check.
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
  const p = new URL(request.url).searchParams;
  const symbol = (p.get('symbol') || '').toUpperCase();
  let sector = (p.get('sector') || '').trim();
  const benchmark = (p.get('benchmark') || '^GSPC').toUpperCase();
  const from = p.get('from') || '2000-01-01', to = p.get('to') || exchangeDate(nowMs);
  if ((![symbol, benchmark].every(s => symbolPattern.test(s)) || (sector && !Object.hasOwn(sectorAliases, sector) && !Object.values(sectorEtfs).includes(sector))) || !validDate(from) || !validDate(to) || from > to || Date.parse(to) - Date.parse(from) > 40 * 366 * 86400000) return reply({ error: 'Enter valid symbols and a date range of at most 40 years.' }, 400);
  let options;
  try { options = methodology(Object.fromEntries(['short', 'long', 'lookback', 'sigma', 'sell', 'buy', 'flat'].filter(k => p.has(k)).map(k => [k, k === 'flat' ? p.get(k) : Number(p.get(k))]))); }
  catch { return reply({ error: 'Invalid methodology settings.' }, 400); }
  if (!env.DB?.prepare || !env.FMP_API_KEY?.trim()) return reply({ error: 'Market data requires the existing D1 binding and FMP secret.' }, 503);
  const now = nowMs, ttl = 6 * 3600000;
  let cacheHits = 0;
  let stage = 'cache-read', activeSymbol = symbol, httpStatus = null, failure = null;
  async function provider(path, params) {
    stage = path === 'profile' ? 'sector-profile' : 'price-history';
    activeSymbol = params.symbol;
    httpStatus = null;
    failure = null;
    const url = new URL('https://financialmodelingprep.com/stable/' + path);
    for (const [k, v] of Object.entries({ ...params, apikey: env.FMP_API_KEY })) url.searchParams.set(k, v);
    const res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    httpStatus = res.status;
    if (!res.ok) throw new Error('upstream');
    try { return await res.json(); }
    catch { failure = 'invalid-json'; throw new Error('response'); }
  }
  if (p.get('extendedPreflight') === '1' && symbol === 'AAPL') {
    try {
      const raw=await provider('aftermarket-trade',{symbol:'AAPL'}),q=Array.isArray(raw)&&raw.length===1?raw[0]:null;
      return reply({endpoint:'/stable/aftermarket-trade',http:httpStatus,checkedAt:new Date(now).toISOString(),symbol:q?.symbol,price:q?.price,timestamp:q?.timestamp,tradeSize:q?.tradeSize});
    } catch { return reply({endpoint:'/stable/aftermarket-trade',http:httpStatus,status:'unavailable'}); }
  }
  async function writeCache(key, payload) {
    stage = 'cache-write';
    await env.DB.prepare('INSERT INTO market_history_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at').bind(key, JSON.stringify(payload), now).run();
  }
  async function history(ticker) {
    const needsVolume = ticker === symbol;
    const key = JSON.stringify(['fmp-eod-ohlc-v2', ticker, from, to]);
    stage = 'cache-read';
    const cached = await env.DB.prepare('SELECT payload, fetched_at FROM market_history_cache WHERE cache_key = ?').bind(key).first();
    if (cached && now - cached.fetched_at < ttl) {
      try { const rows = normalize(JSON.parse(cached.payload), needsVolume, needsVolume); cacheHits++; return rows; } catch { /* Refresh invalid cache. */ }
    }
    const rows = normalize(await provider('historical-price-eod/full', { symbol: ticker, from, to }), needsVolume, needsVolume).filter(r => r.date >= from && r.date <= to);
    if (!rows.length) { failure = 'empty'; throw new Error('empty'); }
    await writeCache(key, rows);
    return rows;
  }
  async function currentQuote(ticker) {
    const needsVolume=ticker===symbol, key=JSON.stringify(['fmp-current-quote-v1',ticker]);
    try {
      stage='cache-read'; httpStatus=null; failure=null;
      const cached=await env.DB.prepare('SELECT payload, fetched_at FROM market_history_cache WHERE cache_key = ?').bind(key).first();
      if(cached && now-cached.fetched_at<60000) {
        try {
          const stored=JSON.parse(cached.payload);
          const bar=quoteBar([{symbol:ticker,open:stored.open,dayHigh:stored.high,dayLow:stored.low,price:stored.close,volume:stored.volume,timestamp:Date.parse(stored.quoteAsOf)/1000}],ticker,needsVolume);
          if(currentSessionBar(bar,now)) return {symbol:ticker,status:'available',bar};
        } catch { /* Refresh malformed or stale-session quotes. */ }
      }
      const raw=await provider('quote',{symbol:ticker});
      const bar=quoteBar(raw,ticker,needsVolume);
      if(!currentSessionBar(bar,now)) return {symbol:ticker,status:'unavailable',reason:'No current regular-session quote'};
      await writeCache(key,bar);
      return {symbol:ticker,status:'available',bar};
    } catch {
      return {symbol:ticker,status:'unavailable',reason:stage==='cache-read'||stage==='cache-write'?'Quote cache unavailable':httpStatus===null?'Quote network failure':httpStatus>=300?'Quote request returned HTTP '+httpStatus:'Quote fields unavailable'};
    }
  }
  try {
    const sectorSource = 'Sector ETF proxy';
    if (!sector) {
      const key = JSON.stringify(['fmp-profile-sector-v1', symbol]);
      stage = 'cache-read';
      const cached = await env.DB.prepare('SELECT payload, fetched_at FROM market_history_cache WHERE cache_key = ?').bind(key).first();
      let name;
      if (cached && now - cached.fetched_at < ttl) {
        try { name = JSON.parse(cached.payload); } catch { /* Refresh invalid cache. */ }
      }
      if (!Object.hasOwn(sectorAliases, name)) {
        const profile = await provider('profile', { symbol });
        if (!Array.isArray(profile) || profile.length !== 1 || profile[0]?.symbol !== symbol || !Object.hasOwn(sectorAliases, profile[0]?.sector)) { failure = 'sector'; throw new Error('sector'); }
        name = profile[0].sector;
        await writeCache(key, name);
      }
      sector = name;
    }
    const sectorBenchmark = resolveSectorEtf(sector);
    sector = sectorBenchmark.symbol;
    // At most one company profile and three distinct histories; no sector-index requests.
    const histories = new Map();
    for (const ticker of new Set([symbol, sector, benchmark])) histories.set(ticker, await history(ticker));
    const today=exchangeDate(now);
    let currentDay={state:'not-requested',date:today,quotes:[]};
    if(from<=today && to>=today && sessionHasStarted(now)) {
      const quotes=new Map();
      for(const ticker of histories.keys()) quotes.set(ticker,await currentQuote(ticker));
      currentDay.quotes=[...quotes.values()].map(q=>({symbol:q.symbol,status:q.status,...(q.bar?{asOf:q.bar.quoteAsOf}:{reason:q.reason})}));
      const stockQuote=quotes.get(symbol);
      if(stockQuote?.bar) {
        for(const ticker of histories.keys()) {
          const bar=quotes.get(ticker)?.bar;
          // Never use a prior-day benchmark or an older today's EOD value with a current stock quote.
          histories.set(ticker,bar?mergeCurrentBar(histories.get(ticker),bar):histories.get(ticker).filter(r=>r.date!==today));
        }
        currentDay.state=currentDay.quotes.every(q=>q.status==='available')?'included':'partial';
        currentDay.asOf=stockQuote.bar.quoteAsOf;
      } else currentDay.state='unavailable';
    }
    stage = 'calculation';
    const result = calculate(histories.get(symbol), histories.get(sector), histories.get(benchmark), options);
    if(currentDay.state==='included'||currentDay.state==='partial') {
      const last=result.rows.find(r=>r.date===today);
      if(last) {last.provisional=true;last.quoteAsOf=currentDay.asOf;}
    }
    return reply({ currentDay, symbol, sector, sectorSource, sectorName: sectorBenchmark.name, benchmark, from, to, cacheHits, source: 'FMP EOD close and volume', ...result });
  } catch (error) {
    // Use only controlled labels/statuses. Never return raw provider bodies, URLs or exceptions.
    let message, code, status = 502;
    if (stage === 'cache-read') {
      const missing = /no such table:\s*market_history_cache/i.test(String(error?.message));
      code = missing ? 'CACHE_MIGRATION_REQUIRED' : 'CACHE_READ_FAILED';
      message = missing ? 'The market cache table is missing. Run migration 0002_market_history.sql in market-research-db, then try again.' : 'The market cache could not be read. Check the existing D1 database connection.';
      status = 503;
    } else if (stage === 'cache-write') {
      code = 'CACHE_WRITE_FAILED'; status = 503;
      message = 'Market data was received, but could not be saved. Check the market cache table and D1 database availability.';
    } else if (stage === 'sector-profile' || stage === 'price-history') {
      const label = stage === 'sector-profile' ? 'Company sector lookup' : `Price history for ${activeSymbol}`;
      code = 'FMP_REQUEST_FAILED';
      if (failure === 'sector') {
        code = 'FMP_SECTOR_UNAVAILABLE';
        message = 'The company profile did not return a supported sector. Choose the company’s sector in the sector override field.';
      } else if (httpStatus !== null && (httpStatus < 200 || httpStatus >= 300)) {
        code = 'FMP_HTTP';
        const reason = httpStatus === 401 ? 'rejected the API credentials' : [402, 403].includes(httpStatus) ? 'denied access; check subscription coverage for this symbol and date range' : httpStatus === 429 ? 'rate limit was reached; wait before trying again' : httpStatus >= 300 && httpStatus < 400 ? 'returned a redirect, which was not followed' : 'returned an unsuccessful response';
        message = `${label}: FMP ${reason} (HTTP ${httpStatus}).`;
      } else if (httpStatus === null) {
        code = 'FMP_NETWORK';
        message = `${label}: FMP could not be reached or the 15-second request timed out. No retry was attempted.`;
      } else {
        code = 'FMP_INVALID_HISTORY';
        message = `${label}: FMP returned no usable observations. Try a shorter date range and verify symbol coverage. The response may contain missing or invalid data.`;
      }
    } else {
      code = 'CALCULATION_FAILED';
      message = 'History was received, but the technical indicators could not be calculated from these observations.';
    }
    return reply({ error: message, code }, status);
  }
}
