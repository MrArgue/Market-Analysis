import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeDate, quoteBar, sessionHasStarted, currentSessionBar, mergeCurrentBar } from '../src/current-quote.js';
import { handleMarket } from '../src/market.js';
import { calculate } from '../src/technical.js';
const quote = symbol => [{symbol,open:100,dayHigh:110,dayLow:95,price:105,volume:12000,timestamp:1793196000}];
test('quote fields map to a genuine daily bar and use New York dates',()=>{
 const bar=quoteBar(quote('AAPL'),'AAPL');assert.equal(bar.open,100);assert.equal(bar.high,110);assert.equal(bar.low,95);assert.equal(bar.close,105);assert.equal(bar.volume,12000);
 assert.equal(exchangeDate(Date.parse('2026-10-28T00:30:00Z')),'2026-10-27');
 assert.equal(exchangeDate(Date.parse('2026-12-02T04:30:00Z')),'2026-12-01');
});
test('bad symbols, missing prices, inconsistent ranges and missing stock volume cannot pass validation',()=>{
 for(const patch of [{symbol:'OTHER'},{open:null},{price:0},{dayHigh:99},{dayLow:108},{timestamp:null},{volume:null}])assert.throws(()=>quoteBar([{...quote('AAPL')[0],...patch}],'AAPL'));
 assert.equal(quoteBar([{...quote('^GSPC')[0],volume:null}],'^GSPC',false).volume,undefined);
});

test('session guard handles premarket, weekends, stale days and future timestamps',()=>{
 const now=Date.parse('2026-10-28T18:52:00Z');
 assert.equal(sessionHasStarted(Date.parse('2026-10-28T13:00:00Z')),false);
 assert.equal(sessionHasStarted(Date.parse('2026-10-31T18:00:00Z')),false);
 const bar={date:'2026-10-28',quoteAsOf:'2026-10-28T18:51:50Z'};
 assert.equal(currentSessionBar(bar,now),true);
 for(const patch of [{date:'2026-10-27'},{quoteAsOf:'2026-10-28T13:00:00Z'},{quoteAsOf:'2026-10-28T19:00:00Z'}])assert.equal(currentSessionBar({...bar,...patch},now),false);
});
test('overlay replaces the matching day without mutating cached history or duplicating dates',()=>{
 const history=[{date:'2026-10-27',close:100},{date:'2026-10-28',close:101}],bar={date:'2026-10-28',close:105};
 const result=mergeCurrentBar(history,bar);assert.equal(result.length,2);assert.equal(result[1].close,105);assert.equal(history[1].close,101);
 assert.equal(mergeCurrentBar(result,{...bar,close:106}).length,2);
});
const now=Date.parse('2026-10-28T18:52:00Z');
const request=(to='2026-10-28')=>new Request('https://example.com/api/chart?symbol=AAPL&sector=XLK&from=2026-01-01&to='+to+'&short=2&long=3');
function setup({deny,stale=false,historyToday=false}={}) {
 const cache=new Map(),calls=[];
 const histories=Object.fromEntries(['AAPL','XLK','^GSPC'].map((s,j)=>[s,Array.from({length:historyToday?7:6},(_,i)=>({date:'2026-10-'+(22+i),open:100+i+j*100,high:102+i+j*100,low:99+i+j*100,close:101+i+j*100,volume:1000+i}))]));
 const env={FMP_API_KEY:'private-secret',DB:{prepare(){return{bind(...a){return{first:async()=>cache.get(a[0]),run:async()=>cache.set(a[0],{payload:a[1],fetched_at:a[2]})}}}}}};
 const fetcher=async url=>{
  const symbol=url.searchParams.get('symbol');calls.push({path:url.pathname,symbol});
  if(url.pathname.endsWith('/quote')) {
   if(symbol===deny)return new Response('private-secret',{status:402});
   const j=['AAPL','XLK','^GSPC'].indexOf(symbol);
   return Response.json([{symbol,open:107+j*100,dayHigh:112+j*100,dayLow:106+j*100,price:110+j*100,volume:2000,timestamp:Date.parse(stale?'2026-10-27T18:51:50Z':'2026-10-28T18:51:50Z')/1000}]);
  }
  return Response.json(histories[symbol]);
 };
 return{env,cache,calls,histories,fetcher};
}
test('today bar appends true OHLC and cumulative volume, aligns both benchmarks, and preserves historical indicators',async()=>{
 const s=setup(),response=await handleMarket(request(),s.env,{},s.fetcher,now),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.currentDay.state,'included');assert.equal(data.rows.length,7);
 const r=data.rows.at(-1);assert.equal(r.date,'2026-10-28');assert.equal(r.open,107);assert.equal(r.high,112);assert.equal(r.low,106);assert.equal(r.close,110);assert.equal(r.volume,2000);assert.equal(r.provisional,true);
 assert.equal(r.sectorRatio,110/210);assert.equal(r.marketRatio,110/310);
 const baseline=calculate(s.histories.AAPL,s.histories.XLK,s.histories['^GSPC'],{short:2,long:3});assert.deepEqual(data.rows.slice(0,-1),baseline.rows);
 assert.equal(r.obv,baseline.rows.at(-1).obv+2000);assert.equal(s.calls.filter(c=>c.path.endsWith('/quote')).length,3);
});
test('current quotes use a short cache and repeat loads replace today rather than double counting OBV',async()=>{
 const s=setup({historyToday:true});const first=await (await handleMarket(request(),s.env,{},s.fetcher,now)).json();
 const again=await (await handleMarket(request(),s.env,{},s.fetcher,now+20000)).json();
 assert.equal(again.rows.length,7);assert.equal(again.rows.filter(r=>r.date==='2026-10-28').length,1);assert.equal(again.rows.at(-1).obv,first.rows.at(-1).obv);assert.equal(s.calls.filter(c=>c.path.endsWith('/quote')).length,3);
 await handleMarket(request(),s.env,{},s.fetcher,now+61000);assert.equal(s.calls.filter(c=>c.path.endsWith('/quote')).length,6);
 const cachedHistory=JSON.parse(s.cache.get(JSON.stringify(['fmp-eod-ohlc-v2','AAPL','2026-01-01','2026-10-28'])).payload);assert.equal(cachedHistory.at(-1).close,107);
});
test('missing current benchmark retains the price bar but makes today score unavailable instead of using stale data',async()=>{
 const s=setup({deny:'^GSPC',historyToday:true});const r=await handleMarket(request(),s.env,{},s.fetcher,now),data=await r.json();
 assert.equal(r.status,200);assert.equal(data.currentDay.state,'partial');assert.equal(data.rows.at(-1).close,110);assert.equal(data.rows.at(-1).marketRatio,null);assert.equal(data.rows.at(-1).score,null);
 assert.ok(!JSON.stringify(data).includes('private-secret'));
});
test('unavailable stock quote or stale session dates keep usable historical chart without fabricating today',async()=>{
 for(const options of [{deny:'AAPL'},{stale:true}]){
  const s=setup(options),r=await handleMarket(request(),s.env,{},s.fetcher,now),data=await r.json();assert.equal(r.status,200);assert.equal(data.currentDay.state,'unavailable');assert.equal(data.rows.at(-1).date,'2026-10-27');assert.equal(data.rows.at(-1).provisional,undefined);
 }
});
test('past-only ranges, premarket and weekends make no quote calls',async()=>{
 for(const [time,to] of [[now,'2026-10-27'],[Date.parse('2026-10-28T13:00:00Z'),'2026-10-28'],[Date.parse('2026-10-31T18:00:00Z'),'2026-10-31']]){
  const s=setup();const r=await handleMarket(request(to),s.env,{},s.fetcher,time);assert.equal(r.status,200);assert.equal((await r.json()).currentDay.state,'not-requested');assert.equal(s.calls.filter(c=>c.path.endsWith('/quote')).length,0);
 }
});