import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMarket } from '../src/market.js';
import worker from '../src/index.js';
const authorized={access:{getIdentity:async()=>({email:'owner@example.com'})}};
const request=(query='symbol=AAPL&sector=XLK&from=2020-01-01&to=2020-01-10',options={})=>new Request('https://example.com/api/chart?'+query,options);
const bars=Array.from({length:10},(_,i)=>({date:'2020-01-'+String(i+1).padStart(2,'0'),close:10+i,volume:100}));
function setup(){
 const entries=new Map(),calls=[];let writes=0,reads=0;
 const env={DIAGNOSTICS_AUTHORIZED_EMAIL:'owner@example.com',FMP_API_KEY:'test-sensitive-key',DB:{
  prepare(_sql){
   return { bind(...args){
    return {
     async first(){reads++;return entries.get(args[0])||null},
     async run(){writes++;entries.set(args[0],{payload:args[1],fetched_at:args[2]})}
    };
   }};
  }
 }};
 return {env,calls,entries,get writes(){return writes},get reads(){return reads},fetch:async(url,options)=>{calls.push({url,options});return Response.json(bars)}};
}
test('market endpoint fails closed for missing context, spoofed headers, wrong user and failed identity',async()=>{
 for(const ctx of [undefined,{}, {access:{getIdentity:async()=>({email:'other@example.com'})}}, {access:{getIdentity:async()=>{throw Error('private')}}}]){
  const s=setup(),r=await handleMarket(request(undefined,{headers:{'Cf-Access-Authenticated-User-Email':'owner@example.com'}}),s.env,ctx,s.fetch);
  assert.ok([401,403].includes(r.status));assert.equal(s.reads,0);assert.equal(s.calls.length,0);
 }
 const s=setup(),r=await worker.fetch(request(),s.env,{});assert.equal(r.status,401);
});
test('invalid input and methods never touch data providers; HEAD is inert',async()=>{
 for(const q of ['symbol=AAPL&sector=x&from=2020-02-30','symbol=AAPL&sector=XLK&short=0','symbol=../../secrets&sector=XLK','symbol=AAPL&sector=XLK&from=2021-01-01&to=2020-01-01']){
  const s=setup(),r=await handleMarket(request(q),s.env,authorized,s.fetch);assert.equal(r.status,400);assert.equal(s.reads,0);
 }
 for(const method of ['HEAD','POST']){const s=setup(),r=await handleMarket(request(undefined,{method}),s.env,authorized,s.fetch);assert.equal(r.status,405);assert.equal(s.reads,0)}
});
test('three bounded FMP calls, parameterized cache writes, subsequent hits, and options-independent cache',async()=>{
 const s=setup(),r=await handleMarket(request(),s.env,authorized,s.fetch);assert.equal(r.status,200);
 const data=await r.json();assert.equal(data.rows.length,10);assert.equal(data.cacheHits,0);assert.equal(s.writes,3);assert.equal(s.calls.length,3);
 for(const call of s.calls){assert.equal(call.url.origin,'https://financialmodelingprep.com');assert.equal(call.url.searchParams.get('apikey'),s.env.FMP_API_KEY);assert.equal(call.options.redirect,'manual');assert.ok(call.options.signal)}
 const again=await handleMarket(request('symbol=AAPL&sector=XLK&from=2020-01-01&to=2020-01-10&short=2&long=3'),s.env,authorized,s.fetch);
 assert.equal((await again.json()).cacheHits,3);assert.equal(s.calls.length,3);assert.equal(s.writes,3);
 assert.ok(!JSON.stringify(data).includes('test-sensitive-key'));assert.equal(r.headers.get('cache-control'),'no-store');
});
test('reuses identical ticker series, refreshes stale cache, never retries or leaks upstream failures',async()=>{
 const s=setup();await handleMarket(request('symbol=AAPL&sector=AAPL&benchmark=AAPL&from=2020-01-01&to=2020-01-10'),s.env,authorized,s.fetch);assert.equal(s.calls.length,1);
 for(const value of s.entries.values())value.fetched_at=0;
 await handleMarket(request('symbol=AAPL&sector=AAPL&benchmark=AAPL&from=2020-01-01&to=2020-01-10'),s.env,authorized,s.fetch);assert.equal(s.calls.length,2);
 for(const mock of [async()=>new Response('test-sensitive-key',{status:302}),async()=>{throw Error('test-sensitive-key')},async()=>Response.json({error:'test-sensitive-key'}),async()=>Response.json([]),async()=>Response.json([...bars,bars[0]])]){
  const fresh=setup();let calls=0;const r=await handleMarket(request(),fresh.env,authorized,async(...args)=>{calls++;return mock(...args)});
  assert.equal(r.status,502);assert.equal(calls,1);assert.equal(fresh.writes,0);assert.ok(!(await r.text()).includes('test-sensitive-key'));
 }
});
test('missing migration fails before FMP; missing bindings fail before all I/O',async()=>{
 const s=setup();s.env.DB.prepare=()=>{throw Error('private schema')};const r=await handleMarket(request(),s.env,authorized,s.fetch);assert.equal(r.status,502);assert.equal(s.calls.length,0);
 for(const key of ['DB','FMP_API_KEY']){const fresh=setup();delete fresh.env[key];const r=await handleMarket(request(),fresh.env,authorized,fresh.fetch);assert.equal(r.status,503);assert.equal(fresh.calls.length,0)}
});
test('ticker-only requests resolve and cache the current sector ETF; unsupported sectors fail clearly',async()=>{
 const s=setup();let profiles=0;
 const fetcher=async(url,options)=>url.pathname.endsWith('/profile')?(profiles++,Response.json([{symbol:'AAPL',sector:'Technology'}])):s.fetch(url,options);
 for(let i=0;i<2;i++){
  const r=await handleMarket(request('symbol=AAPL&from=2020-01-01&to=2020-01-10'),s.env,authorized,fetcher);
  assert.equal(r.status,200);const data=await r.json();assert.equal(data.sector,'XLK');assert.match(data.sectorSource,/ETF proxy/);
 }
 assert.equal(profiles,1);assert.equal(s.calls.length,3);
 const bad=setup();const r=await handleMarket(request('symbol=AAPL'),bad.env,authorized,async()=>Response.json([{symbol:'AAPL',sector:'Unknown'}]));assert.equal(r.status,502);
});
test('benchmark series need no volume but stock volume remains required',async()=>{
 const s=setup();const r=await handleMarket(request(),s.env,authorized,async url=>Response.json(url.searchParams.get('symbol')==='AAPL'?bars:bars.map(({volume,...rest})=>rest)));
 assert.equal(r.status,200);
});
