import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMarket } from '../src/market.js';
import { normalize } from '../src/technical.js';
import { sectorEtfs, resolveSectorEtf } from '../src/sectors.js';
import worker from '../src/index.js';
const authorized = { access: { getIdentity: async () => ({ email: 'owner@example.com' }) } };
const query = 'symbol=AAPL&sector=Information+Technology&from=2020-01-01&to=2020-01-10';
const request = (params = query, options = {}) => new Request('https://example.com/api/chart?' + params, options);
const bars = Array.from({ length: 10 }, (_, i) => ({ date: '2020-01-' + String(i + 1).padStart(2, '0'), open: 9.5 + i, high: 11 + i, low: 9 + i, close: 10 + i, volume: 100 }));
function setup() {
 const entries = new Map(), calls = []; let writes = 0, reads = 0;
 const env = { DIAGNOSTICS_AUTHORIZED_EMAIL: 'owner@example.com', FMP_API_KEY: 'test-sensitive-key', DB: {
  prepare() { return { bind(...args) { return {
   async first() { reads++; return entries.get(args[0]) || null; },
   async run() { writes++; entries.set(args[0], { payload: args[1], fetched_at: args[2] }); },
  }; } }; },
 } };
 const fetcher = async (url, options) => {
  calls.push({ url, options });
  if (url.pathname.endsWith('/index-list')) throw new Error('Unexpected index-list request');
  if (url.pathname.endsWith('/profile')) return Response.json([{ symbol: 'AAPL', sector: 'Technology' }]);
  return Response.json(bars);
 };
 return { env, entries, calls, fetcher, get writes() { return writes; }, get reads() { return reads; } };
}
test('public chart data loads without an Access identity or authorized-email configuration', async () => {
 for (const ctx of [undefined, {}, { access: { getIdentity: async () => { throw Error('Identity lookup must not be called'); } } }]) {
  const s = setup(); delete s.env.DIAGNOSTICS_AUTHORIZED_EMAIL;
  const r = await handleMarket(request(), s.env, ctx, s.fetcher);
  assert.equal(r.status, 200); const data = await r.json();assert.equal(data.sector,'XLK');assert.equal(data.rows.length,10);
  assert.ok(!JSON.stringify(data).includes(s.env.FMP_API_KEY));
 }
});
test('Worker entry point serves anonymous chart requests from the cache while diagnostics stay protected', async () => {
 const s = setup();await handleMarket(request(), s.env, undefined, s.fetcher);
 const r = await worker.fetch(request(), s.env, {});assert.equal(r.status,200);assert.equal((await r.json()).cacheHits,3);
 for (const path of ['/diagnostics','/diagnostics/client.js','/diagnostics/d1','/diagnostics/fmp']) {
  const response=await worker.fetch(new Request('https://example.com'+path,{headers:{'Cf-Access-Authenticated-User-Email':'owner@example.com'}}),s.env,{});
  assert.equal(response.status,401);
 }
 assert.equal(s.calls.length,3);
});
test('invalid queries and non-GET methods never reach D1 or FMP', async () => {
 for (const q of ['symbol=AAPL&sector=Technology&from=2020-02-30', 'symbol=AAPL&short=0', 'symbol=../../secrets', 'symbol=AAPL&from=2021-01-01&to=2020-01-01']) {
  const s = setup(); assert.equal((await handleMarket(request(q), s.env, authorized, s.fetcher)).status, 400); assert.equal(s.reads, 0);
 }
 for (const method of ['HEAD', 'POST']) { const s = setup(); assert.equal((await handleMarket(request(undefined, { method }), s.env, authorized, s.fetcher)).status, 405); assert.equal(s.reads, 0); }
});
test('uses the sector ETF, preserves real OHLC, and caches histories independently of methodology', async () => {
 const s = setup(), r = await handleMarket(request(), s.env, authorized, s.fetcher), data = await r.json();
 assert.equal(r.status, 200); assert.equal(data.sector, 'XLK'); assert.match(data.sectorName, /Information Technology/); assert.match(data.sectorSource, /ETF proxy/);
 assert.equal(data.rows[0].open, 9.5); assert.equal(data.rows[0].high, 11); assert.equal(data.rows[0].low, 9); assert.equal(data.rows[0].close, 10);
 assert.equal(s.calls.length, 3); assert.equal(s.writes, 3); assert.equal(data.cacheHits, 0);
 for (const call of s.calls) { assert.equal(call.url.origin, 'https://financialmodelingprep.com'); assert.equal(call.url.searchParams.get('apikey'), s.env.FMP_API_KEY); assert.equal(call.options.redirect, 'manual'); assert.ok(call.options.signal); }
 const cached = await handleMarket(request(query + '&short=2&long=3'), s.env, authorized, s.fetcher);
 assert.equal((await cached.json()).cacheHits, 3); assert.equal(s.calls.length, 3); assert.equal(s.writes, 3);
 assert.ok(!JSON.stringify(data).includes('test-sensitive-key')); assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('ticker-only lookup resolves and caches the current company sector ETF without index-list', async () => {
 const s = setup();
 for (let i = 0; i < 2; i++) {
  const r = await handleMarket(request('symbol=AAPL&from=2020-01-01&to=2020-01-10'), s.env, authorized, s.fetcher);
  assert.equal(r.status, 200); assert.equal((await r.json()).sector, 'XLK');
 }
 assert.equal(s.calls.length, 4); assert.equal(s.calls.filter(c => c.url.pathname.endsWith('/profile')).length, 1);
});
test('all eleven sectors and profile aliases map to their supported ETFs', () => {
 const expected = { 'Communication Services':'XLC','Consumer Discretionary':'XLY','Consumer Staples':'XLP',Energy:'XLE',Financials:'XLF','Health Care':'XLV',Industrials:'XLI','Information Technology':'XLK',Materials:'XLB','Real Estate':'XLRE',Utilities:'XLU' };
 assert.deepEqual({...sectorEtfs},expected);
 for (const [sector,symbol] of Object.entries(expected)) { assert.equal(resolveSectorEtf(sector).symbol,symbol);assert.equal(resolveSectorEtf(symbol).sector,sector); }
 assert.equal(resolveSectorEtf('Technology').symbol,'XLK');assert.equal(resolveSectorEtf('Healthcare').symbol,'XLV');assert.equal(resolveSectorEtf('Consumer Cyclical').symbol,'XLY');
 assert.throws(()=>resolveSectorEtf('constructor'));
});
test('sector-index overrides are rejected before any I/O; explicit ETF overrides remain supported',async()=>{
 const invalid=setup(),r=await handleMarket(request(query.replace('Information+Technology','^SP500-45')),invalid.env,authorized,invalid.fetcher);
 assert.equal(r.status,400);assert.equal(invalid.reads,0);assert.equal(invalid.calls.length,0);
 const s=setup(),ok=await handleMarket(request(query.replace('Information+Technology','XLK')),s.env,authorized,s.fetcher);assert.equal(ok.status,200);assert.equal((await ok.json()).sector,'XLK');assert.equal(s.calls.length,3);
});
test('stock history requires genuine consistent OHLC; close-only cache entries are refreshed', async () => {
 for (const patch of [{ open: undefined }, { high: 1 }, { low: 100 }, { open: NaN }]) assert.throws(() => normalize([{ ...bars[0], ...patch }], true, true));
 const s = setup();
 s.entries.set(JSON.stringify(['fmp-eod-ohlc-v2', 'AAPL', '2020-01-01', '2020-01-10']), { payload: JSON.stringify(bars.map(({ open, high, low, ...rest }) => rest)), fetched_at: Date.now() });
 const r = await handleMarket(request(), s.env, authorized, s.fetcher); assert.equal(r.status, 200);
 assert.equal(s.calls.filter(c => c.url.searchParams.get('symbol') === 'AAPL').length, 1);
 const bad = setup(), invalid = await handleMarket(request(), bad.env, authorized, async (url, opts) => url.searchParams.get('symbol') === 'AAPL' ? Response.json(bars.map(({ open, ...rest }) => rest)) : bad.fetcher(url, opts));
 assert.equal((await invalid.json()).code, 'FMP_INVALID_HISTORY');
});
test('benchmarks require closes but not volume or OHLC', async () => {
 const s = setup(), r = await handleMarket(request(), s.env, authorized, async (url, opts) => url.pathname.includes('historical') && url.searchParams.get('symbol') !== 'AAPL' ? Response.json(bars.map(({ date, close }) => ({ date, close }))) : s.fetcher(url, opts));
 assert.equal(r.status, 200);
});
test('missing table and absent bindings stop before provider requests without exposing raw errors', async () => {
 const s = setup(); s.env.DB.prepare = () => { throw Error('D1_ERROR: no such table: market_history_cache test-sensitive-key'); };
 const r = await handleMarket(request(), s.env, authorized, s.fetcher), data = await r.json();
 assert.equal(r.status, 503); assert.equal(data.code, 'CACHE_MIGRATION_REQUIRED'); assert.ok(!data.error.includes('test-sensitive-key')); assert.equal(s.calls.length, 0);
 for (const key of ['DB', 'FMP_API_KEY']) { const f = setup(); delete f.env[key]; assert.equal((await handleMarket(request(), f.env, authorized, f.fetcher)).status, 503); assert.equal(f.calls.length, 0); }
});
test('provider errors identify the failed history symbol and status without secrets or retries', async () => {
 for (const status of [302, 401, 402, 403, 429, 500]) {
  const s = setup(); let calls = 0;
  const r = await handleMarket(request(), s.env, authorized, async (url, opts) => { calls++; return url.searchParams.get('symbol') === 'XLK' ? new Response('test-sensitive-key private body', { status }) : s.fetcher(url, opts); });
  const data = await r.json(); assert.equal(r.status, 502); assert.equal(data.code, 'FMP_HTTP'); assert.match(data.error, /XLK/); assert.match(data.error, new RegExp(String(status))); assert.ok(!JSON.stringify(data).includes('test-sensitive-key')); assert.equal(calls, 2);
 }
});
test('profile denials, unsupported sectors and cache write failures are actionable', async () => {
 const s = setup(), denied = await handleMarket(request('symbol=AAPL'), s.env, authorized, async () => new Response('private', { status: 403 }));
 assert.match((await denied.json()).error, /Company sector lookup.*403/);
 const p = setup(), unknown = await handleMarket(request('symbol=AAPL'), p.env, authorized, async () => Response.json([{ symbol: 'AAPL', sector: 'Unknown' }]));
 assert.equal((await unknown.json()).code, 'FMP_SECTOR_UNAVAILABLE');
 const n = setup(), network = await handleMarket(request(), n.env, authorized, async () => { throw Error('test-sensitive-key'); });
 assert.equal((await network.json()).code, 'FMP_NETWORK');
 const w = setup(); w.env.DB.prepare = () => ({ bind: () => ({ first: async () => null, run: async () => { throw Error('test-sensitive-key'); } }) });
 const write = await handleMarket(request(), w.env, authorized, w.fetcher); assert.equal(write.status, 503); const data = await write.json(); assert.equal(data.code, 'CACHE_WRITE_FAILED'); assert.ok(!data.error.includes('test-sensitive-key'));
});
test('refreshes stale histories and reuses identical stock/market symbols', async () => {
 const s = setup(), q = query + '&benchmark=AAPL';
 await handleMarket(request(q), s.env, authorized, s.fetcher); assert.equal(s.calls.length, 2);
 for (const value of s.entries.values()) value.fetched_at = 0;
 await handleMarket(request(q), s.env, authorized, s.fetcher); assert.equal(s.calls.length, 4);
});
test('VRT uses XLI and never requests the unavailable sector index, even when an old index catalogue is cached',async()=>{
 const s=setup();s.entries.set(JSON.stringify(['fmp-sp500-sector-indices-v1']),{payload:JSON.stringify([{symbol:'^SP500-20',name:'S&P 500 Industrials (Sector)'}]),fetched_at:Date.now()});
 const r=await handleMarket(request('symbol=VRT&from=2020-01-01&to=2020-01-10&short=2&long=3'),s.env,authorized,async(url,opts)=>{
  if(url.pathname.endsWith('/profile'))return Response.json([{symbol:'VRT',sector:'Industrials'}]);
  return s.fetcher(url,opts);
 });
 assert.equal(r.status,200);const data=await r.json();assert.equal(data.sector,'XLI');assert.match(data.sectorName,/ETF/);
 const symbols=s.calls.map(c=>c.url.searchParams.get('symbol'));assert.deepEqual(symbols,['VRT','XLI','^GSPC']);
 assert.equal(data.rows.at(-1).sectorRatio,1);assert.equal(data.rows.at(-1).distance,0);
 assert.ok(s.calls.every(c=>!c.url.pathname.endsWith('/index-list') && !c.url.searchParams.get('symbol')?.startsWith('^SP500-')));
});