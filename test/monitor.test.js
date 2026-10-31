import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {calculate} from '../src/technical.js';
import {prepareStock,liveTechnicals,aggregateMonitor,technicalColumns} from '../src/monitor-math.js';
import {handleMonitor,packHistory,unpackHistory} from '../src/monitor-data.js';
const now=Date.parse('2026-10-28T18:00:00Z');
function rows(from='2015-10-28',to='2026-10-28'){
 const result=[];for(let t=Date.parse(from+'T12:00:00Z'),i=0;t<=Date.parse(to+'T12:00:00Z');t+=86400000){const date=new Date(t);if([0,6].includes(date.getUTCDay()))continue;const close=100+i*.02+Math.sin(i/17)*3;result.push({date:date.toISOString().slice(0,10),open:close,high:close+1,low:close-1,close,volume:1000+i});i++;}return result;
}
test('prepared intraday technicals match full chart calculation without inserting the current bar twice',()=>{
 const history=rows(),sector=history.map((r,i)=>({...r,close:100+i*.01})),market=history.map((r,i)=>({...r,close:100+i*.015})),date='2026-10-28',last=history.at(-1),previous=history.at(-2),q={price:last.close,previousClose:previous.close,volume:last.volume};
 const state=prepareStock(history,sector,market,date),live=liveTechnicals(state,q,{price:sector.at(-1).close},{price:market.at(-1).close}),chart=calculate(history,sector,market).rows.at(-1);
 assert.equal(live.values.score,chart.score);assert.ok(Math.abs(live.percentile-chart.percentile)<1e-9);assert.equal(live.values.overbought,Number(chart.signal==='overbought'));assert.equal(live.values.oversold,Number(chart.signal==='oversold'));assert.equal(state.distances.length,2511);
 assert.deepEqual(liveTechnicals(state,q,{price:sector.at(-1).close},{price:market.at(-1).close}),live);assert.equal(state.previousClose,previous.close);
});
test('missing volume suppresses score but preserves independent closing-price and percentile indicators',()=>{
 const history=rows();history[10].volume=null;const state=prepareStock(history,history,history,'2026-10-28'),q={price:110,previousClose:history.at(-2).close,volume:1000};const live=liveTechnicals(state,q,{price:110},{price:110});assert.equal(live.values.score,null);assert.equal(live.percentile,50);assert.ok(Number.isFinite(live.values.above50));
});
test('missing recent sessions and price-basis mismatch cannot create false long-window technicals',()=>{
 const history=rows();history.splice(-3,1);const calendar=rows(),state=prepareStock(history,calendar,calendar,'2026-10-28'),q={price:110,previousClose:calendar.at(-2).close,volume:1000};const live=liveTechnicals(state,q,{price:110},{price:110});assert.equal(live.values.score,null);assert.equal(live.values.above200,null);assert.equal(live.values.high252,null);assert.equal(live.values.advancing,0);
 const split=liveTechnicals(state,{...q,previousClose:q.previousClose/2},{price:110},{price:110});assert.equal(split.percentile,null);assert.equal(split.values.advancing,1);
});
test('closing highs compare prior N closes including ties; unchanged quotes are neither advance nor decline',()=>{
 const history=rows().map(r=>({...r,close:100})),state=prepareStock(history,history,history,'2026-10-28'),live=liveTechnicals(state,{price:100,previousClose:100,volume:0},{price:100},{price:100});
 assert.equal(live.values.high20,1);assert.equal(live.values.low20,1);assert.equal(live.values.high252,1);assert.equal(live.values.advancing,0);assert.equal(live.values.declining,0);assert.equal(live.values.above50,0);
});
test('sector breadth averages company votes directly; multiple classes split one vote and missing metrics have their own denominator',()=>{
 const make=(symbol,cik,industry,score)=>({symbol,cik,name:symbol,sector:'Information Technology',industry,marketValue:100,holdingPrice:10,price:10,bases:Object.fromEntries(['day','five','mtd','fourWeeks','threeMonths','ytd','year'].map(k=>[k,10])),technical:{score,strong:score===6?1:0,weak:0}});
 const records=[make('A','1','Large',6),make('B','1','Large',0),make('C','2','Small',6)],members=records.map(r=>({...r}));records[1].technical.weak=null;
 const result=aggregateMonitor(records,members,{},rows(),'2026-10-28','iwb'),sector=result.groups[0];assert.equal(sector.technical.score,4.5);assert.equal(sector.technical.strong,75);assert.equal(sector.technicalCoverage.weak.included,2);assert.equal(result.overall.technical.score,4.5);assert.equal(sector.returns.day,0);
});
test('stored compact OHLCV roundtrips without losing fields',()=>{const r=rows().slice(0,3);assert.deepEqual(unpackHistory(packHistory(r)),r);});
function setup(n=3){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE market_history_cache(cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL,fetched_at INTEGER NOT NULL)');let queries=0,time=now;
 const calls=[],history=rows('2023-01-01','2026-12-31'),members=Array.from({length:n},(_,i)=>({symbol:'T'+i,name:'Company '+i,cik:String(i+1),sector:'Information Technology',industry:'Software',marketValue:100000,holdingPrice:100}));
 const env={FMP_API_KEY:'private-secret',DB:{prepare(sql){queries++;const statement=db.prepare(sql);return{bind(...args){return{first:async()=>statement.get(...args)||null,run:async()=>statement.run(...args)}}};}}};
 const seed=(key,data)=>db.prepare('INSERT OR REPLACE INTO market_history_cache VALUES(?,?,?)').run(key,JSON.stringify(data),time);
 seed('monitor-v1:members:iwb:2026-10',{members,holdingsAsOf:'2026-10-27',issues:[]});
 const fetcher=async input=>{
  const url=new URL(input);calls.push({path:url.pathname,symbol:url.searchParams.get('symbol'),from:url.searchParams.get('from'),to:url.searchParams.get('to')});
  if(url.pathname.endsWith('/batch-quote'))return Response.json(url.searchParams.get('symbols').split(',').filter(s=>s!=='^GSPC').map(symbol=>({symbol,price:130,previousClose:history.findLast(r=>r.date<new Date(time).toISOString().slice(0,10))?.close||120,volume:5000,marketCap:100000,timestamp:time/1000})));
  if(url.pathname.endsWith('/quote'))return Response.json([{symbol:'^GSPC',price:130,previousClose:129,timestamp:time/1000}]);
  if(url.pathname.endsWith('/sp500-constituent'))return Response.json(Array.from({length:503},(_,i)=>({symbol:'T'+i,name:'Company '+i,cik:String(i+1),sector:'Technology',subSector:'Software'})));
  if(url.pathname.endsWith('/profile'))return Response.json([{symbol:url.searchParams.get('symbol'),cik:'9999',sector:'Technology',industry:'Software'}]);
  return Response.json(history.filter(r=>r.date>=url.searchParams.get('from')&&r.date<=url.searchParams.get('to')));
 };
 const request=(body,universe='iwb')=>new Request('https://example.com/api/monitor?universe='+universe,body?{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
 const invoke=async(body,fetchImpl=fetcher)=>{queries=0;const response=await handleMonitor(request(body),env,fetchImpl,time);assert.ok(queries<150,'Paid-plan batch D1 operations <150, actual '+queries);return{status:response.status,data:await response.json()};};
 async function run(fetchImpl=fetcher){let r=await invoke({action:'start'},fetchImpl),steps=0;while(r.data.state==='loading'){if(r.data.retryAfter)time+=r.data.retryAfter*1000;r=await invoke({action:'step',id:r.data.id},fetchImpl);assert.ok(++steps<10000);if(r.status>=400)throw new Error(JSON.stringify(r));}return r;}
 return{db,env,calls,history,members,seed,fetcher,request,invoke,run,setTime(t){time=t;},get time(){return time;},close(){db.close();}};
}
test('resumable build retains OHLCV, handles omitted index quote, publishes both views and performs no calls on GET',async()=>{
 const s=setup();try{const r=await s.run();assert.equal(r.status,200);assert.equal(r.data.state,'ready');assert.equal(r.data.groups[0].industries[0].stocks.length,3);assert.ok(s.calls.some(c=>c.path.endsWith('/quote')));assert.equal(s.calls.filter(c=>c.path.endsWith('/historical-price-eod/full')).length,45);
  const raw=JSON.parse(s.db.prepare('SELECT payload FROM market_history_cache WHERE cache_key=?').get('monitor-v1:history:T0').payload);assert.equal(raw.rows[0].length,6);assert.equal(raw.pending,undefined);
  const count=s.calls.length,report=await s.invoke();assert.equal(report.data.state,'ready');assert.equal(s.calls.length,count);assert.ok(!JSON.stringify(report).includes('private-secret'));
  assert.equal(s.db.prepare("SELECT count(*) AS n FROM market_history_cache WHERE cache_key LIKE 'monitor-v1:records:%'").get().n,0);
 }finally{s.close();}
});
test('same-day refresh reuses prepared states and histories; toggling views needs no API work',async()=>{
 const s=setup();try{await s.run();const count=s.calls.length;s.setTime(now+61000);const report=await s.run(),added=s.calls.slice(count);assert.equal(report.data.state,'ready');assert.ok(added.some(c=>c.path.endsWith('/batch-quote')));assert.equal(added.filter(c=>c.path.endsWith('/historical-price-eod/full')).length,0);}finally{s.close();}
});
test('new session appends recent history rather than downloading eleven years again',async()=>{
 const s=setup();try{await s.run();const count=s.calls.length;s.setTime(Date.parse('2026-10-29T18:00:00Z'));await s.run();const added=s.calls.slice(count).filter(c=>c.path.endsWith('/historical-price-eod/full'));assert.equal(added.length,15);assert.ok(added.every(c=>c.from>='2026-10-01'));}finally{s.close();}
});
test('429 Retry-After pauses without losing checkpoint or exposing provider data',async()=>{
 const s=setup();try{let once=true;const fetcher=async url=>{if(once){once=false;return new Response('private-secret',{status:429,headers:{'Retry-After':'17'}});}return s.fetcher(url);};let r=await s.invoke({action:'start'});r=await s.invoke({action:'step',id:r.data.id},fetcher);assert.equal(r.data.retryAfter,17);s.setTime(s.time+18000);r=await s.run(fetcher);assert.equal(r.data.state,'ready');assert.ok(!JSON.stringify(r).includes('private-secret'));}finally{s.close();}
});
test('shared rolling budget blocks the 551st call in any 60-second window and resumes after expiry',async()=>{
 const s=setup();try{s.seed('monitor-v1:provider-budget',Array(550).fill(now));let r=await s.invoke({action:'start'});r=await s.invoke({action:'step',id:r.data.id});assert.equal(r.data.retryAfter,10);assert.equal(s.calls.length,0);s.setTime(now+61000);r=await s.run();assert.equal(r.data.state,'ready');}finally{s.close();}
});
test('concurrent tabs share a job lease; bad origins/universes cannot fetch',async()=>{
 const s=setup();try{const replies=await Promise.all([handleMonitor(s.request({action:'start'}),s.env,s.fetcher,now),handleMonitor(s.request({action:'start'}),s.env,s.fetcher,now)]);assert.ok(replies.every(r=>r.status===200));assert.equal((await replies[1].json()).state,'loading');
  const count=s.calls.length;const bad=new Request('https://example.com/api/monitor?universe=other',{method:'POST',body:'{}'});assert.equal((await handleMonitor(bad,s.env,s.fetcher,now)).status,400);assert.equal(s.calls.length,count);
 }finally{s.close();}
});
test('monthly membership refresh keeps healthy symbol histories and only appends recent dates',async()=>{
 const s=setup();try{await s.run();const count=s.calls.length;s.setTime(Date.parse('2026-11-02T18:00:00Z'));s.seed('monitor-v1:members:iwb:2026-11',{members:s.members,holdingsAsOf:'2026-10-30',issues:[]});await s.run();const added=s.calls.slice(count).filter(c=>c.path.endsWith('/historical-price-eod/full'));assert.equal(added.length,15);assert.ok(added.every(c=>c.from>='2026-10-01'));}finally{s.close();}
});
test('1023-security build respects per-invocation D1 bounds and sliding budget, then reuses all healthy histories',async()=>{
 const s=setup(1023);try{const report=await s.run();assert.equal(report.data.coverage.processed,1023);assert.equal(report.data.overall.technicalCoverage.score.total,1023);const count=s.calls.length;s.setTime(s.time+61000);await s.run();assert.equal(s.calls.slice(count).filter(c=>c.path.endsWith('/historical-price-eod/full')).length,0);const sizes=s.db.prepare('SELECT max(length(payload)) AS n FROM market_history_cache').get();assert.ok(sizes.n<1800000);}finally{s.close();}
});
test('temporary stock-history failure is repaired on later refresh without downloading healthy histories',async()=>{
 const s=setup();try{let fail=true;const fetcher=async url=>fail&&new URL(url).searchParams.get('symbol')==='T1'?new Response('private-secret',{status:503}):s.fetcher(url);const first=await s.run(fetcher);assert.equal(first.data.coverage.processed,2);fail=false;const before=s.calls.length;s.setTime(s.time+61000);const second=await s.run(fetcher);assert.equal(second.data.coverage.processed,3);const calls=s.calls.slice(before).filter(c=>c.path.endsWith('/historical-price-eod/full'));assert.ok(calls.length>0&&calls.every(c=>c.symbol==='T1'));}finally{s.close();}
});
test('split-basis change performs targeted full repair and never mixes old/new prices',async()=>{
 const s=setup();try{await s.run();s.setTime(s.time+61000);const count=s.calls.length;const fetcher=async url=>{const response=await s.fetcher(url),u=new URL(url),raw=await response.json();if(u.pathname.endsWith('/batch-quote'))return Response.json(raw.map(q=>q.symbol==='T0'?{...q,price:q.price/2,previousClose:q.previousClose/2,volume:q.volume*2}:q));if(u.pathname.endsWith('/historical-price-eod/full')&&u.searchParams.get('symbol')==='T0')return Response.json(raw.map(r=>({...r,close:r.close/2,volume:r.volume*2})));return Response.json(raw);};const result=await s.run(fetcher),added=s.calls.slice(count).filter(c=>c.path.endsWith('/historical-price-eod/full'));assert.equal(added.length,3);assert.ok(added.every(c=>c.symbol==='T0'));const stock=result.data.groups[0].industries[0].stocks.find(s=>s.symbol==='T0');assert.ok(Number.isFinite(stock.technical.score));}finally{s.close();}
});
test('unresolved aerospace classification is excluded rather than displayed under Technology',async()=>{
 const s=setup();try{const list=s.members.map(m=>m.symbol==='T0'?{...m,industry:'Aerospace & Defense'}:m);s.seed('monitor-v1:members:iwb:2026-10',{members:list,issues:[]});const report=await s.run();assert.equal(report.data.coverage.processed,2);assert.equal(report.data.groups[0].industries.some(i=>i.name==='Aerospace & Defense'),false);assert.ok(report.data.review.excluded.some(i=>i.symbol==='T0'));}finally{s.close();}
});
test('Paid batches remain bounded and immutable metadata stays outside rewritten checkpoints',async()=>{
 const s=setup();try{let r=await s.invoke({action:'start'}),steps=0;
  while(r.data.state==='loading'){const count=s.calls.length;r=await s.invoke({action:'step',id:r.data.id});const historyCalls=s.calls.slice(count).filter(c=>c.path.endsWith('/historical-price-eod/full'));assert.ok(historyCalls.length<=12,'at most four cold stocks / twelve ranges per invocation');assert.ok(++steps<200);}
  assert.equal(r.data.state,'ready');const job=JSON.parse(s.db.prepare('SELECT payload FROM market_history_cache WHERE cache_key=?').get('monitor-v1:job:iwb').payload);assert.equal(job.members,undefined);assert.equal(job.quotes,undefined);assert.equal(job.total,3);assert.ok(job.staticKey);
 }finally{s.close();}
});
test('an original-format in-progress job migrates without losing its cursor or redownloading completed stocks',async()=>{
 const s=setup();try{let r=await s.invoke({action:'start'});while(r.data.loaded<1)r=await s.invoke({action:'step',id:r.data.id});
  const stored=JSON.parse(s.db.prepare('SELECT payload FROM market_history_cache WHERE cache_key=?').get('monitor-v1:job:iwb').payload),metadata=JSON.parse(s.db.prepare('SELECT payload FROM market_history_cache WHERE cache_key=?').get(stored.staticKey).payload),legacy={...stored,...metadata};delete legacy.staticKey;
  s.seed('monitor-v1:job:iwb',legacy);const before=s.calls.length;r=await s.run();assert.equal(r.data.coverage.processed,3);assert.equal(s.calls.slice(before).filter(c=>c.symbol==='T0'&&c.path.endsWith('/historical-price-eod/full')).length,0);
 }finally{s.close();}
});
test('housekeeping failure cannot hide a published report or block a later refresh',async()=>{
 const s=setup(),original=s.env.DB.prepare;try{
  s.env.DB.prepare=sql=>{if(sql.startsWith('DELETE'))throw new Error('private-secret');return original(sql);};
  const report=await s.run();assert.equal(report.data.state,'ready');assert.equal((await s.invoke()).data.state,'ready');assert.ok(!JSON.stringify(report).includes('private-secret'));
  s.setTime(s.time+61000);assert.equal((await s.run()).data.state,'ready');
 }finally{s.close();}
});
test('prefix cleanup is indexed and does not delete neighboring keys',async()=>{
 const s=setup();try{s.seed('monitor-v1:records:unrelated:0',{keep:true});await s.run();assert.ok(s.db.prepare('SELECT payload FROM market_history_cache WHERE cache_key=?').get('monitor-v1:records:unrelated:0'));assert.equal(s.db.prepare("SELECT count(*) AS n FROM market_history_cache WHERE cache_key LIKE 'monitor-v1:partition:%'").get().n,0);}finally{s.close();}
});
