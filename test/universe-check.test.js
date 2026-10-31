import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIwbHoldings,csvRows,historyWindows,holdingsUrl} from '../src/iwb-universe.js';
import {handleUniverseCheck} from '../src/universe-check.js';
import worker from '../src/index.js';
import {DatabaseSync} from 'node:sqlite';
const now=Date.parse('2026-10-31T17:00:00Z');
function csv(){return 'iShares Russell 1000 ETF\r\nFund Holdings as of,"Oct 29, 2026"\r\nTicker,Name,Sector,Asset Class,Market Value,Weight (%),Location,Currency\r\n'+Array.from({length:1000},(_,i)=>[i===0?'AAPL':i===1?'BRK B':'T'+i,'"Company, '+i+'"','Information Technology','Equity','"1,000.00"','.1','United States','USD'].join(',')).join('\r\n')+'\r\nUSD,Cash,Cash,Cash,20,.01,United States,USD\r\n"Disclaimer\nwith escaped ""quotes""",,,,,,,\r\n';}
test('issuer parser handles metadata, quoted commas, CRLF, multiline footer and class ticker normalization',()=>{
 const result=parseIwbHoldings(csv());assert.equal(result.members.length,1000);assert.equal(result.members[1].symbol,'BRK-B');assert.equal(result.members[1].sourceSymbol,'BRK B');assert.equal(result.members[2].name,'Company, 2');assert.equal(result.members[2].marketValue,1000);assert.equal(result.asOf,'2026-10-29');assert.ok(Math.abs(result.equityWeight-100)<1e-8);assert.equal(result.excluded.length,0);
 assert.deepEqual(csvRows('a,"b""c"\n'),[['a','b"c']]);
});
test('changed columns, duplicate symbols, truncated CSV, bad weight and unexpected counts fail closed',()=>{
 for(const text of [csv().replace('Asset Class','Asset Type'),csv().replace('T2,','AAPL,'),csv()+'"unfinished',csv().replaceAll(',.1,',',1,'),csv().split('\r\n').slice(0,20).join('\r\n')])assert.throws(()=>parseIwbHoldings(text));
});
test('foreign domicile equities remain eligible; unsupported currency and sector are audited',()=>{
 const r=parseIwbHoldings(csv().replace('United States,USD','Ireland,USD').replace('T2,"Company, 2",Information Technology','T2,"Company, 2",Unknown'));
 assert.equal(r.members.length,999);assert.equal(r.excluded.length,1);assert.ok(r.members.some(m=>m.symbol==='AAPL'));
});
test('eleven-year requests are non-overlapping and at most five years each',()=>{
 const ranges=historyWindows('2026-10-31');assert.equal(ranges.length,3);assert.equal(ranges[0].from,'2015-10-31');assert.equal(ranges.at(-1).to,'2026-10-31');
 for(let i=0;i<ranges.length;i++){assert.ok(Date.parse(ranges[i].to)-Date.parse(ranges[i].from)<=1824*86400000);if(i)assert.equal(Date.parse(ranges[i].from)-Date.parse(ranges[i-1].to),86400000);}
});
function setup({deny=false,brokenIssuer=false}={}){
 const cache=new Map(),calls=[];
 const env={FMP_API_KEY:'private-secret',DB:{prepare(sql){return{bind(...args){return{
  async first(){if(sql.startsWith('SELECT'))return cache.get(args[0]);const [key,payload,fetched_at,cutoff]=args;const old=cache.get(key);if(old&&old.fetched_at>cutoff)return null;cache.set(key,{payload,fetched_at});return{cache_key:key};},
  async run(){const[payload,fetched_at,key,old]=args;if(cache.get(key)?.payload===old)cache.set(key,{payload,fetched_at});return{success:true};}
 };}};}}};
 const fetcher=async input=>{
  const url=new URL(input);calls.push(url);
  if(url.href===holdingsUrl)return new Response(brokenIssuer?'bad':csv());
  if(deny&&url.pathname.endsWith('/profile'))return new Response('private-secret',{status:402});
  if(url.pathname.endsWith('/sp500-constituent'))return Response.json(Array.from({length:500},(_,i)=>({symbol:i===0?'AAPL':i===1?'BRK-B':'T'+i})));
  if(url.pathname.endsWith('/profile'))return Response.json([{symbol:url.searchParams.get('symbol'),industry:'Software',sector:'Technology',cik:'123',secret:'private-secret'}]);
  if(url.pathname.endsWith('/batch-quote'))return Response.json(url.searchParams.get('symbols').split(',').map(symbol=>({symbol,price:100,previousClose:99,marketCap:100000,volume:1000,timestamp:now/1000})));
  return Response.json([{date:url.searchParams.get('from'),close:100,volume:1000},{date:url.searchParams.get('to'),close:110,volume:1001}]);
 };
 const post=(body={action:'validate'},origin='https://example.com')=>new Request('https://example.com/api/universe-check',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 return{env,fetcher,calls,cache,post};
}
test('preflight makes exactly 17 FMP calls, checks added names and older ranges, caches sanitized results',async()=>{
 const s=setup(),response=await handleUniverseCheck(s.post(),s.env,s.fetcher,now),report=await response.json();
 assert.equal(response.status,200);assert.equal(report.state,'ready');assert.equal(report.fmpCalls,17);assert.equal(report.holdings.addedToSp500,500);assert.equal(report.samples.length,3);assert.ok(report.samples.slice(1).every(s=>Number(s.slice(1))>=500));assert.equal(report.allSampleChecksUsable,true);assert.equal(report.accessDenied,false);assert.equal(JSON.stringify(report).includes('private-secret'),false);
 const count=s.calls.length;assert.equal((await handleUniverseCheck(s.post(),s.env,s.fetcher,now+1000)).status,200);assert.equal((await handleUniverseCheck(new Request('https://example.com/api/universe-check'),s.env,s.fetcher,now+2000)).status,200);assert.equal(s.calls.length,count);
});
test('simultaneous starts share a D1 lease and do not multiply provider calls',async()=>{
 const s=setup(),responses=await Promise.all(Array.from({length:5},()=>handleUniverseCheck(s.post(),s.env,s.fetcher,now)));assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(responses.filter(r=>r.status===202).length,4);assert.equal(s.calls.length,18);
});
test('denied endpoints are explicit and never leak provider errors or keys',async()=>{
 const s=setup({deny:true}),r=await(await handleUniverseCheck(s.post(),s.env,s.fetcher,now)).json();assert.equal(r.accessDenied,true);assert.equal(r.allSampleChecksUsable,false);assert.equal(r.checks.filter(c=>c.http===402).length,3);assert.ok(!JSON.stringify(r).includes('private-secret'));
});
test('GET, invalid input and cross-origin requests cannot trigger a live check',async()=>{
 const s=setup();assert.equal((await(await handleUniverseCheck(new Request('https://example.com/api/universe-check'),s.env,s.fetcher,now)).json()).state,'not-checked');
 for(const request of [s.post({action:'validate',symbol:'EVIL'}),s.post({action:'start'}),s.post(undefined,'https://other.example')])assert.ok((await handleUniverseCheck(request,s.env,s.fetcher,now)).status>=400);assert.equal(s.calls.length,0);
});
test('failed issuer download makes no FMP calls and cooldown prevents repeated retries',async()=>{
 const s=setup({brokenIssuer:true});assert.equal((await handleUniverseCheck(s.post(),s.env,s.fetcher,now)).status,502);const r=await(await handleUniverseCheck(s.post(),s.env,s.fetcher,now+1000)).json();assert.equal(r.state,'failed');assert.equal(s.calls.length,1);
});
test('stale running checks can recover after cooldown, and expired GET stays read-only',async()=>{
 const s=setup();s.cache.set('iwb-technical-access-v1',{payload:JSON.stringify({state:'running'}),fetched_at:now-31*60000});
 assert.equal((await(await handleUniverseCheck(new Request('https://example.com/api/universe-check'),s.env,s.fetcher,now)).json()).state,'not-checked');assert.equal(s.calls.length,0);
 assert.equal((await handleUniverseCheck(s.post(),s.env,s.fetcher,now)).status,200);assert.equal(s.calls.length,18);
 assert.equal((await(await handleUniverseCheck(new Request('https://example.com/api/universe-check'),s.env,s.fetcher,now+86400001)).json()).state,'not-checked');assert.equal(s.calls.length,18);
});
test('stale issuer data halts before account calls',async()=>{
 const s=setup(),fetcher=async url=>String(url)===holdingsUrl?new Response(csv().replace('Oct 29, 2026','Oct 01, 2026')):s.fetcher(url);
 const r=await(await handleUniverseCheck(s.post(),s.env,fetcher,now)).json();assert.equal(r.state,'failed');assert.equal(r.fmpCalls,0);
});
test('temporary page is uncached and uses a self-hosted click-to-run script',async()=>{
 const page=worker.fetch(new Request('https://example.com/universe-check'));assert.equal(page.status,200);assert.equal(page.headers.get('Cache-Control'),'no-store');assert.match(await page.text(),/Run access check/);
 const script=await worker.fetch(new Request('https://example.com/universe-check.js')).text();assert.match(script,/button.onclick=/);assert.match(script,/method:'POST'/);assert.equal(await worker.fetch(new Request('https://example.com/universe-check',{method:'HEAD'})).text(),'');
});
test('lease and compare-and-set report publication execute against real SQLite',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE market_history_cache(cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL,fetched_at INTEGER NOT NULL)');
 const s=setup();s.env.DB={prepare(sql){const statement=db.prepare(sql);return{bind(...args){return{first:async()=>statement.get(...args)||null,run:async()=>statement.run(...args)}}};}};
 try{
  const responses=await Promise.all([handleUniverseCheck(s.post(),s.env,s.fetcher,now),handleUniverseCheck(s.post(),s.env,s.fetcher,now)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,202]);assert.equal(s.calls.length,18);
  const saved=db.prepare('SELECT payload FROM market_history_cache').get();assert.equal(JSON.parse(saved.payload).state,'ready');
  const report=await(await handleUniverseCheck(new Request('https://example.com/api/universe-check'),s.env,s.fetcher,now+1000)).json();assert.equal(report.fmpCalls,17);assert.equal(s.calls.length,18);
 }finally{db.close();}
});
