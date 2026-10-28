import test from 'node:test';
import assert from 'node:assert/strict';
import {marketSession,extendedTrade} from '../src/extended-hours.js';
import {handleMarket} from '../src/market.js';
const time=s=>Date.parse(s);
test('regular-session boundaries follow Pacific hours including DST and exclude weekends',()=>{
 for(const [date,expected] of [['2026-10-28T13:29:59Z','pre-market'],['2026-10-28T13:30:00Z','regular'],['2026-10-28T19:59:59Z','regular'],['2026-10-28T20:00:00Z','after-hours'],['2026-12-02T14:29:59Z','pre-market'],['2026-12-02T14:30:00Z','regular'],['2026-12-02T21:00:00Z','after-hours'],['2026-10-31T21:00:00Z','closed']])assert.equal(marketSession(time(date)),expected,date);
});
test('extended trades require matching symbol, positive price and genuine same-session millisecond timestamps',()=>{
 const now=time('2026-10-28T21:42:57Z'),q={symbol:'AAPL',price:344.91,timestamp:time('2026-10-28T21:42:50Z')};
 assert.equal(extendedTrade([q],'AAPL',now).session,'after-hours');
 for(const patch of [{symbol:'BAD'},{price:0},{price:null},{timestamp:q.timestamp/1000},{timestamp:now+61000},{timestamp:time('2026-10-27T21:42:00Z')},{timestamp:time('2026-10-28T19:59:00Z')}]) assert.equal(extendedTrade([{...q,...patch}],'AAPL',now),null);
 assert.equal(extendedTrade([q],'AAPL',time('2026-10-28T19:00:00Z')),null);
});
function setup({denied=false,stale=false}={}){
 const cache=new Map(),calls=[];
 const env={FMP_API_KEY:'private-secret',DB:{prepare(){return{bind(...a){return{first:async()=>cache.get(a[0]),run:async()=>cache.set(a[0],{payload:a[1],fetched_at:a[2]})}}}}}};
 const fetcher=async url=>{
  const symbol=url.searchParams.get('symbol');calls.push(url.pathname);
  if(url.pathname.endsWith('/aftermarket-trade'))return denied?new Response('private-secret',{status:402}):Response.json([{symbol,price:112,timestamp:time(stale?'2026-10-27T21:42:00Z':'2026-10-28T21:42:50Z')}]);
  if(url.pathname.endsWith('/quote'))return Response.json([{symbol,open:108,dayHigh:111,dayLow:107,price:110,volume:2000,timestamp:time('2026-10-28T20:00:00Z')/1000}]);
  return Response.json([{date:'2026-10-26',open:99,high:102,low:98,close:100,volume:1000},{date:'2026-10-27',open:100,high:106,low:99,close:105,volume:1000}]);
 };
 const request=to=>new Request('https://example.com/api/chart?symbol=AAPL&sector=XLK&from=2026-01-01&to='+(to||'2026-10-28'));
 return {env,fetcher,calls,request};
}
test('extended trade is separate from OHLC and indicators, compares to regular close and is cached',async()=>{
 const s=setup(),now=time('2026-10-28T21:42:57Z');
 const data=await(await handleMarket(s.request(),s.env,{},s.fetcher,now)).json();
 assert.equal(data.extendedHours.state,'available');assert.equal(data.extendedHours.price,112);assert.equal(data.extendedHours.regularClose,110);assert.ok(Math.abs(data.extendedHours.changePercent-(112/110-1)*100)<1e-9);
 assert.equal(data.rows.at(-1).close,110);assert.equal(data.rows.at(-1).volume,2000);
 await handleMarket(s.request(),s.env,{},s.fetcher,now+10000);assert.equal(s.calls.filter(p=>p.endsWith('/aftermarket-trade')).length,1);
 await handleMarket(s.request(),s.env,{},s.fetcher,now+61000);assert.equal(s.calls.filter(p=>p.endsWith('/aftermarket-trade')).length,2);
});
test('denied or stale extended trade is harmless and never exposes provider bodies',async()=>{
 for(const config of [{denied:true},{stale:true}]){
  const s=setup(config),r=await handleMarket(s.request(),s.env,{},s.fetcher,time('2026-10-28T21:42:57Z')),data=await r.json();
  assert.equal(r.status,200);assert.equal(data.extendedHours.state,'unavailable');assert.equal(data.rows.at(-1).close,110);assert.ok(!JSON.stringify(data).includes('private-secret'));
 }
});
test('regular hours, historical requests and weekends never request an extended trade',async()=>{
 for(const [now,to] of [['2026-10-28T18:00:00Z','2026-10-28'],['2026-10-28T21:42:57Z','2026-10-27'],['2026-10-31T21:42:57Z','2026-10-31']]){
  const s=setup(),r=await handleMarket(s.request(to),s.env,{},s.fetcher,time(now));assert.equal(r.status,200);assert.ok(!s.calls.some(p=>p.endsWith('/aftermarket-trade')));
 }
});