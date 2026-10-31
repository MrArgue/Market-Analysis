import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleExclusionAudit,historyEvidence,profileEvidence,diagnoseExclusion} from '../src/exclusion-audit.js';
import worker from '../src/index.js';
const now=Date.parse('2026-10-31T18:00:00Z'),asOf='2026-10-30';
function daily(){const rows=[];for(let t=Date.parse('2023-10-30T12:00:00Z');t<=Date.parse(asOf+'T12:00:00Z');t+=86400000){const d=new Date(t);if(![0,6].includes(d.getUTCDay()))rows.push({date:d.toISOString().slice(0,10),close:100,volume:1000});}return rows;}
test('recent history warmup is independent of classification conflict',()=>{
 const rows=daily(),history={http:200,evidence:historyEvidence(rows,rows,rows,asOf)},profile={http:200,evidence:profileEvidence([{symbol:'AAA',cik:'123',sector:'Technology',industry:'Software'}],{sector:'Industrials'},'AAA')};
 const r=diagnoseExclusion({member:{sector:'Industrials'},profile,history,quote:{usable:true}});assert.ok(r.codes.includes('sector_disagreement'));assert.ok(!r.codes.includes('insufficient_percentile_warmup'));assert.equal(history.evidence.minimumPercentileWarmup,true);assert.equal(history.evidence.price200Window,true);
});
test('missing dates, malformed prices/volume and short histories have distinct findings',()=>{
 const rows=daily(),short=rows.slice(-100);assert.equal(historyEvidence(short,rows,rows,asOf).price200Window,false);assert.equal(historyEvidence(short,rows,rows,asOf).minimumPercentileWarmup,false);
 const broken=rows.map(r=>({...r}));broken.splice(-3,1);broken[0].volume=null;broken[1].close=0;broken.push({...broken[2]},null);const h=historyEvidence(broken,rows,rows,asOf);assert.equal(h.invalidVolumes,1);assert.equal(h.invalidCloses,1);assert.equal(h.invalidDates,1);assert.equal(h.duplicateDates,1);assert.equal(h.missingSessions,1);
});
test('provider aliases, missing identifiers and CIK conflicts are explicit',()=>{
 const alias=profileEvidence([{symbol:'BRK.B',sector:'Financial Services',industry:'Insurance',cik:'000123'}],{cik:'456'},'BRK-B');assert.equal(alias.found,true);assert.equal(alias.exactSymbol,false);assert.equal(alias.identityMatches,false);
 const missing=profileEvidence([{symbol:'AAA',cik:'0000',sector:{bad:true}}],{},'AAA');assert.equal(missing.cik,'');assert.equal(missing.canonicalSector,null);
 const renamed=profileEvidence([{symbol:'NEW',cik:'123'}],{},'OLD');assert.equal(renamed.found,false);assert.deepEqual(renamed.returnedSymbols,['NEW']);assert.ok(diagnoseExclusion({member:{},profile:{http:200,evidence:renamed}}).codes.includes('provider_symbol_mismatch'));
});
function setup(n=3){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE market_history_cache(cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL,fetched_at INTEGER NOT NULL)');
 const seed=(key,value)=>db.prepare('INSERT OR REPLACE INTO market_history_cache VALUES(?,?,?)').run(key,JSON.stringify(value),now);
 const members=Array.from({length:n},(_,i)=>({symbol:'T'+i,name:'Company '+i,sector:'Industrials',industry:null,cik:null}));
 seed('monitor-v1:report:iwb',{asOf,holdingsAsOf:'2026-10-29',preparedAt:new Date(now).toISOString(),refresh:{membershipMonth:'2026-10'},groups:['group'],issues:[]});seed('group',{industries:[{stocks:[]}]});seed('monitor-v1:members:iwb:2026-10',{members});
 const rows=daily();for(const s of ['^GSPC','XLI'])seed('monitor-v1:reference-close:'+s,{until:asOf,rows:rows.map(r=>[r.date,r.close])});
 const calls=[],env={FMP_API_KEY:'private-secret',DB:{prepare(sql){const s=db.prepare(sql);return{bind(...args){return{first:async()=>s.get(...args)||null,run:async()=>s.run(...args)}}};}}};
 const fetcher=async input=>{const u=new URL(input);calls.push(u);if(u.pathname.endsWith('/batch-quote'))return Response.json(u.searchParams.get('symbols').split(',').map(symbol=>({symbol,price:100,previousClose:99,timestamp:Date.parse(asOf+'T20:00:00Z')/1000})));if(u.pathname.endsWith('/profile'))return Response.json([{symbol:u.searchParams.get('symbol'),companyName:'Provider Company',cik:'123',sector:'Technology',industry:'Software',secret:'private-secret'}]);return Response.json(rows);};
 const request=body=>new Request('https://example.com/api/exclusion-audit',body?{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
 const invoke=async(body,fetchImpl=fetcher,time=now)=>{const r=await handleExclusionAudit(request(body),env,fetchImpl,time);return{status:r.status,data:await r.json()};};
 const run=async(fetchImpl=fetcher)=>{let r=await invoke({action:'start'},fetchImpl),steps=0;while(r.data.state==='loading'){assert.ok(++steps<200);r=await invoke({action:'step',id:r.data.id},fetchImpl);}return r;};
 return{db,seed,env,rows,calls,fetcher,request,invoke,run};
}
test('all omitted names get independent profile and history checks; production data stays unchanged',async()=>{
 const s=setup();try{const before=s.db.prepare("SELECT cache_key,payload,fetched_at FROM market_history_cache WHERE cache_key NOT LIKE 'exclusion-audit-v1:%' ORDER BY cache_key").all();const r=await s.run();assert.equal(r.data.state,'ready');assert.equal(r.data.records.length,3);assert.equal(r.data.fmpCalls,7);assert.ok(r.data.records.every(r=>r.codes.includes('sector_disagreement')&&r.history.evidence.minimumPercentileWarmup));assert.ok(!JSON.stringify(r).includes('private-secret'));
  const after=s.db.prepare("SELECT cache_key,payload,fetched_at FROM market_history_cache WHERE cache_key NOT LIKE 'exclusion-audit-v1:%' AND cache_key NOT LIKE 'monitor-v1:provider-%' ORDER BY cache_key").all();assert.deepEqual(after,before);const count=s.calls.length;assert.equal((await s.invoke()).data.state,'ready');assert.equal((await s.invoke({action:'start'})).data.state,'ready');assert.equal(s.calls.length,count);
 }finally{s.db.close();}
});
test('cached histories are inspected without redownloading them',async()=>{
 const s=setup(1);try{s.seed('monitor-v1:history:T0',{until:asOf,identity:'123',rows:s.rows.map(r=>[r.date,null,null,null,r.close,r.volume])});const r=await s.run();assert.equal(r.data.fmpCalls,2);assert.equal(r.data.records[0].history.source,'existing-history-cache');}finally{s.db.close();}
});
test('HTTP denials remain distinct from an empty recent history and shared budget pauses',async()=>{
 const s=setup(1);try{const fetcher=async input=>{const u=new URL(input);if(u.pathname.endsWith('/profile'))return new Response('private-secret',{status:402});if(u.pathname.endsWith('/historical-price-eod/full'))return Response.json([]);return s.fetcher(input);};const r=await s.run(fetcher);assert.ok(r.data.records[0].codes.includes('profile_http_402'));assert.ok(r.data.records[0].codes.includes('no_recent_history'));assert.ok(!JSON.stringify(r).includes('private-secret'));}finally{s.db.close();}
 const paused=setup(1);try{paused.seed('monitor-v1:provider-budget',Array(550).fill(now));const r=await paused.invoke({action:'start'});assert.equal(r.data.retryAfter,10);assert.equal(paused.calls.length,0);}finally{paused.db.close();}
});
test('history pause keeps the completed profile checkpoint and concurrent starts share a lease',async()=>{
 const s=setup(1);try{let once=true;const fetcher=async input=>{if(once&&new URL(input).pathname.endsWith('/historical-price-eod/full')){once=false;return new Response('private-secret',{status:429,headers:{'Retry-After':'1'}});}return s.fetcher(input);};let r=await s.invoke({action:'start'},fetcher);r=await s.invoke({action:'step',id:r.data.id},fetcher);assert.equal(r.data.retryAfter,1);r=await s.invoke({action:'step',id:r.data.id},fetcher,now+2000);assert.equal(r.data.state,'ready');assert.equal(s.calls.filter(u=>u.pathname.endsWith('/profile')).length,1);}finally{s.db.close();}
 const concurrent=setup();try{const r=await Promise.all([handleExclusionAudit(concurrent.request({action:'start'}),concurrent.env,concurrent.fetcher,now),handleExclusionAudit(concurrent.request({action:'start'}),concurrent.env,concurrent.fetcher,now)]);assert.ok(r.every(r=>r.status===200));assert.equal(concurrent.calls.filter(u=>u.pathname.endsWith('/batch-quote')).length,1);}finally{concurrent.db.close();}
});
test('GET, unknown names and cross-origin requests cannot trigger arbitrary provider calls',async()=>{
 const s=setup();try{assert.equal((await s.invoke()).data.state,'not-loaded');assert.equal((await s.invoke({action:'start',symbol:'EVIL'})).status,400);const r=new Request('https://example.com/api/exclusion-audit',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:'{"action":"start"}'});assert.equal((await handleExclusionAudit(r,s.env,s.fetcher,now)).status,403);assert.equal(s.calls.length,0);}finally{s.db.close();}
});
test('audit page is separate from the monitor and uses a self-hosted click-to-run script',async()=>{
 const response=worker.fetch(new Request('https://example.com/exclusion-audit'));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(await response.text(),/Run exclusion audit/);assert.match(await worker.fetch(new Request('https://example.com/exclusion-audit.js')).text(),/button.onclick/);
});
