import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleHistoricalResearch} from '../src/historical-research-data.js';

const now=Date.parse('2026-11-19T18:00:00Z');
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE market_history_cache(cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL,fetched_at INTEGER NOT NULL)');
 let calls=0;
 const env={DB:{prepare(sql){calls++;const s=db.prepare(sql);
  return{bind(...args){return{first:async()=>s.get(...args)||null,run:async()=>s.run(...args)}}};
 }}};
 const seed=(key,payload)=>db.prepare('INSERT OR REPLACE INTO market_history_cache(cache_key,payload,fetched_at) VALUES(?,?,?)').run(key,JSON.stringify(payload),now);
 const members=Array.from({length:800},(_,i)=>({symbol:'T'+i,name:'Test '+i,sector:'Industrials'}));
 seed('monitor-v1:members:iwb:2026-11',{members});
 const stock=[],sector=[],market=[];
 for(let day=new Date('2023-01-02T12:00:00Z');stock.length<600;day.setUTCDate(day.getUTCDate()+1)){
  if([0,6].includes(day.getUTCDay()))continue;
  const i=stock.length,d=day.toISOString().slice(0,10),p=80+i*.08+Math.sin(i/8)*2;
  stock.push([d,p,p+1,p-1,p,1000+i]);sector.push([d,100,101,99,100,100000]);market.push([d,500+i*.2,501+i*.2,499+i*.2,500+i*.2,100000]);
 }
 seed('monitor-v1:history:T0',{until:'2026-11-19',identity:'1',rows:stock});
 seed('monitor-v1:history:XLI',{until:'2026-11-19',rows:sector});
 seed('monitor-v1:history:^GSPC',{until:'2026-11-19',rows:market});
 const request=body=>new Request('https://example.test/api/historical-research?universe=iwb',body?{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
 const invoke=async body=>{calls=0;const response=await handleHistoricalResearch(request(body),env,now);assert.ok(calls<40,'bounded D1 operations per request: '+calls);return{status:response.status,data:await response.json()};};
 async function run(){let x=await invoke({action:'start'}),steps=0;while(x.data.state==='loading'){
  x=await invoke({action:'step',id:x.data.id});assert.ok(++steps<700);
  if(x.status!==200)throw new Error('Refresh failed: '+JSON.stringify(x));
 }return x;}
 return{db,env,seed,request,invoke,run,close:()=>db.close()};
}
test('historical research uses cached IWB prices, batches safely, saves per-stock observations and reports coverage',async()=>{
 const s=setup();try{
  assert.deepEqual((await s.invoke()).data.state,'not-loaded');
  const result=await s.run();assert.equal(result.status,200);
  assert.equal(result.data.state,'ready');assert.equal(result.data.coverage.expected,800);
  assert.equal(result.data.coverage.processed,1);assert.equal(result.data.coverage.missingHistory,799);
  assert.equal(result.data.coverage.errors,0);
  const row=s.db.prepare('SELECT payload FROM market_history_cache WHERE cache_key=?').get('historical-research-v1:stock:T0');
  assert.ok(row);const parsed=JSON.parse(row.payload);
  assert.equal(parsed.firstScoreDate,stockDate(99));assert.equal(parsed.firstExtremeDate,stockDate(451));
  assert.ok(parsed.rows.some(r=>r[2]!==null));assert.ok(parsed.rows.some(r=>r[3]!==null));
  assert.ok(result.data.totals.score['strong:1']||result.data.totals.score['weak:1']||result.data.totals.score['neutral:1']);
  const cached=await s.invoke();assert.equal(cached.data.state,'ready');assert.equal(cached.data.saved,true);
 }finally{s.close();}
 function stockDate(index){let count=0;for(let day=new Date('2023-01-02T12:00:00Z');;day.setUTCDate(day.getUTCDate()+1)){if([0,6].includes(day.getUTCDay()))continue;if(count++===index)return day.toISOString().slice(0,10);}}
});
test('POST requires same origin and a known action; GET never rebuilds',async()=>{
 const s=setup();try{
  const bad=new Request('https://example.test/api/historical-research',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:'{"action":"start"}'});
  assert.equal((await handleHistoricalResearch(bad,s.env,now)).status,403);
  assert.equal((await s.invoke({action:'erase'})).status,400);
  assert.equal((await s.invoke()).data.state,'not-loaded');
 }finally{s.close();}
});

test('lightweight progress reads preserve the exact saved checkpoint across interruptions',async()=>{
 const s=setup();try{
  const start=await s.invoke({action:'start'});assert.equal(start.data.done,0);
  const first=await s.invoke({action:'step',id:start.data.id});
  assert.equal(first.data.done,2);
  const request=new Request('https://example.test/api/historical-research?universe=iwb&progress=1');
  const checkpoint=await (await handleHistoricalResearch(request,s.env,now)).json();
  assert.equal(checkpoint.id,start.data.id);assert.equal(checkpoint.done,2);
  const resumed=await s.invoke({action:'start'});assert.equal(resumed.data.id,start.data.id);
  assert.equal(resumed.data.done,2);
  const next=await s.invoke({action:'step',id:resumed.data.id});
  assert.equal(next.data.done,4);
  assert.equal((await s.invoke()).data.state,'not-loaded');
 }finally{s.close();}
});
