import {holdingsUrl,parseIwbHoldings,historyWindows} from './iwb-universe.js';
import {exchangeDate} from './current-quote.js';
import {validDate} from './technical.js';
import {sectorEtfs} from './sectors.js';
import {canonicalSector,sectorProxy,prepareStock,stockRecord,liveTechnicals,aggregateMonitor,companyId} from './monitor-math.js';
const prefix='monitor-v1:',references=['^GSPC',...Object.values(sectorEtfs)],minute=60000;
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
class Pause extends Error{constructor(seconds){super('Refresh paused for provider pacing');this.seconds=seconds;}}
export function packHistory(rows){return rows.map(r=>[r.date,r.open??null,r.high??null,r.low??null,r.close,r.volume??null]);}
export function unpackHistory(rows){return rows.map(r=>({date:r[0],open:r[1],high:r[2],low:r[3],close:r[4],volume:r[5]}));}
export function cleanHistory(rows,range){
 if(!Array.isArray(rows))throw new Error('History response shape unavailable');
 const result=rows.filter(r=>validDate(r.date)&&r.date>=range.from&&r.date<=range.to).map(r=>({date:r.date,open:r.open,high:r.high,low:r.low,close:r.close,volume:r.volume})).sort((a,b)=>a.date.localeCompare(b.date));
 if(result.some(r=>!Number.isFinite(r.close)||r.close<=0)||new Set(result.map(r=>r.date)).size!==result.length)throw new Error('Invalid daily history');return result;
}
// New storage namespace; legacy sector/chart caches and bindings remain intact.
export async function handleMonitor(request,env,fetchImpl=fetch,now=Date.now()){
 const url=new URL(request.url),universe=url.searchParams.get('universe')||'iwb';
 if(!['iwb','sp500'].includes(universe))return reply({error:'Unknown universe'},400);
 if(!['GET','POST'].includes(request.method))return reply({error:'GET or POST required'},405);
 if(!env.DB?.prepare||!env.FMP_API_KEY?.trim())return reply({error:'Existing data connection required'},503);
 const started=Date.now(),clock=()=>now+Date.now()-started;
 const today=exchangeDate(now),month=today.slice(0,7),jobKey=prefix+'job:'+universe,manifestKey=prefix+'report:'+universe;
 async function read(key,ttl=Infinity){const row=await env.DB.prepare('SELECT payload,fetched_at FROM market_history_cache WHERE cache_key=?').bind(key).first();if(!row||now-row.fetched_at>=ttl)return null;try{return JSON.parse(row.payload);}catch{return null;}}
 async function write(key,value){const payload=JSON.stringify(value);if(payload.length>1800000)throw new Error('Storage partition too large');await env.DB.prepare('INSERT INTO market_history_cache(cache_key,payload,fetched_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(key,payload,now).run();}
 async function saved(){
  const m=await read(manifestKey);if(!m)return reply({state:'not-loaded',universe});
  const {groups,...metadata}=m;metadata.status+=' · Saved snapshot; refreshing on this visit.';
  const encoder=new TextEncoder();
  const stream=new ReadableStream({async start(controller){try{
   controller.enqueue(encoder.encode(JSON.stringify(metadata).slice(0,-1)+',"groups":['));
   for(let i=0;i<groups.length;i++){const row=await env.DB.prepare('SELECT payload,fetched_at FROM market_history_cache WHERE cache_key=?').bind(groups[i]).first();if(!row)throw new Error('Saved group missing');controller.enqueue(encoder.encode((i?',':'')+row.payload));}
   controller.enqueue(encoder.encode(']}'));controller.close();
  }catch(error){controller.error(error);}}});
  return new Response(stream,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(request.method==='GET'){try{return await saved();}catch{return reply({error:'Saved monitor unavailable'},503);}}
 if(request.headers.get('Origin')!==url.origin)return reply({error:'Same-origin request required'},403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'JSON required'},400);
 let input;try{input=await request.json();}catch{return reply({error:'Invalid request'},400);}
 if(!['start','step'].includes(input?.action))return reply({error:'Invalid load action'},400);
 const leaseKey=prefix+'lease:'+universe,token=crypto.randomUUID();let locked=false,job;
 async function progress(seconds=0){return reply({state:'loading',universe,id:job?.id,phase:job?.phase||'waiting',loaded:job?.cursor||0,total:job?.members?.length||job?.total||0,retryAfter:seconds});}
 async function persistJob(){if(!job.staticKey)return write(jobKey,job);const{members,quotes,symbols,...small}=job;return write(jobKey,small);}
 try{
  const report=await read(manifestKey,minute);if(report)return await saved();
  locked=!!await env.DB.prepare('INSERT INTO market_history_cache(cache_key,payload,fetched_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at WHERE market_history_cache.fetched_at<=? RETURNING cache_key').bind(leaseKey,token,now+60000,now).first();
  if(!locked){job=await read(jobKey);return await progress(2);}
  job=await read(jobKey);
  if(input.action==='step'&&(!job||input.id!==job.id))return reply({error:'Refresh session changed. Start again.'},409);
  if(!job||job.day!==today||job.phase==='done'||job.phase==='failed'){
   if(job?.id)await env.DB.prepare('DELETE FROM market_history_cache WHERE cache_key LIKE ?').bind(prefix+'records:'+job.id+':%').run();
   if(job?.staticKey)await env.DB.prepare('DELETE FROM market_history_cache WHERE cache_key=?').bind(job.staticKey).run();
   job={id:crypto.randomUUID(),universe,day:today,month,phase:'membership',cursor:0,quoteCursor:0,refCursor:0,members:[],quotes:{},issues:[],chunks:[],buffer:[],createdAt:now};await write(jobKey,job);
  }
  if(job.staticKey){
   const metadata=await read(job.staticKey);if(!metadata)throw new Error('Refresh metadata unavailable');Object.assign(job,metadata);
   const map=new Map(job.members.map(m=>[m.symbol,m]));for(const[s,update]of Object.entries(job.memberUpdates||{}))if(map.has(s))Object.assign(map.get(s),update);
  }else if(['stocks','assemble','partition','sector-read','sector-calculate','publish'].includes(job.phase)){
   job.staticKey=prefix+'metadata:'+job.id;job.total=job.members.length;job.memberUpdates||={};await write(job.staticKey,{members:job.members,quotes:job.quotes,symbols:job.symbols});await persistJob();return await progress();
  }
  async function provider(endpoint,params={}){
   const time=clock(),blocked=await read(prefix+'provider-hold');if(blocked?.until>time)throw new Pause(Math.ceil((blocked.until-time)/1000));
   // Atomic sliding 60-second budget shared by both monitor universes. Other
   // apps using this key are outside this limiter; 200 calls/min are reserved.
   const claimed=await env.DB.prepare("INSERT INTO market_history_cache(cache_key,payload,fetched_at) VALUES(?,json_array(?),?) ON CONFLICT(cache_key) DO UPDATE SET payload=json_insert((SELECT json_group_array(value) FROM json_each(market_history_cache.payload) WHERE value>?), '$[#]', ?),fetched_at=? WHERE (SELECT count(*) FROM json_each(market_history_cache.payload) WHERE value>?)<550 RETURNING cache_key").bind(prefix+'provider-budget',time,time,time-minute,time,time,time-minute).first();
   if(!claimed)throw new Pause(10);
   const target=new URL('https://financialmodelingprep.com/stable/'+endpoint);for(const[k,v]of Object.entries({...params,apikey:env.FMP_API_KEY}))target.searchParams.set(k,v);
   let response;try{response=await fetchImpl(target,{redirect:'manual',signal:AbortSignal.timeout(12000)});}catch{throw new Error('FMP request unavailable');}
   if(response.status===429){const retry=response.headers.get('Retry-After'),parsed=Number(retry),seconds=retry&&Number.isFinite(parsed)?Math.max(1,Math.min(3600,parsed)):retry&&Number.isFinite(Date.parse(retry))?Math.max(1,Math.min(3600,Math.ceil((Date.parse(retry)-time)/1000))):60;await write(prefix+'provider-hold',{until:clock()+seconds*1000});throw new Pause(seconds);}
   if(!response.ok)throw new Error('FMP '+endpoint+' HTTP '+response.status);
   let raw;try{raw=await response.json();}catch{throw new Error('FMP invalid response');}if(!Array.isArray(raw))throw new Error('FMP unexpected response shape');return raw;
  }
  async function history(symbol,identity=null,repair=false){
   const key=prefix+'history:'+symbol;let store=await read(key);
   if(store&&identity&&store.identity!==identity)store=null;
   if(repair&&store?.until===job.asOf&&store.repairedFor!==job.asOf){store={rows:[],identity,repairedFor:job.asOf};}
   if(store?.until===job.asOf)return store.rows.map(r=>({date:r[0],close:r[4],volume:r[5]}));
   store||={rows:[],identity};
   if(store.pending?.until!==job.asOf){const last=store.rows.at(-1)?.[0];store.pending={until:job.asOf,cursor:0,rows:[],ranges:last?[{from:new Date(Date.parse(last+'T12:00:00Z')-10*86400000).toISOString().slice(0,10),to:job.asOf}]:historyWindows(job.asOf)};}
   const pending=store.pending;
   // One provider range per invocation, then yield. Merging and calculating
   // happen in separate requests so free-plan CPU bursts do not accumulate.
   if(pending.cursor<pending.ranges.length){const range=pending.ranges[pending.cursor],raw=cleanHistory(await provider('historical-price-eod/full',{symbol,...range}),range);pending.rows.push(...packHistory(raw));pending.cursor++;await write(key,store);throw new Pause(0);}
   const old=new Map(store.rows.map(r=>[r[0],r])),changed=pending.rows.some(r=>old.has(r[0])&&Math.abs(r[4]/old.get(r[0])[4]-1)>.01);
   if(changed&&store.rows.length&&pending.ranges.length===1){store.pending={until:job.asOf,cursor:0,rows:[],ranges:historyWindows(job.asOf)};store.rows=[];await write(key,store);throw new Pause(1);}
   const merged=new Map([...store.rows,...pending.rows].map(r=>[r[0],r]));store.rows=[...merged.values()].sort((a,b)=>a[0].localeCompare(b[0]));store.until=job.asOf;delete store.pending;await write(key,store);throw new Pause(0);
  }
  async function referenceClose(symbol){
   const key=prefix+'reference-close:'+symbol,cached=await read(key);if(cached?.until===job.asOf)return cached.rows.map(r=>({date:r[0],close:r[1]}));
   const full=await read(prefix+'history:'+symbol);if(!full?.rows)throw new Error('Benchmark history unavailable');await write(key,{until:job.asOf,rows:full.rows.map(r=>[r[0],r[4]])});throw new Pause(0);
  }
  if(job.phase==='membership'){
   let membership=await read(prefix+'members:'+universe+':'+month);
   if(!membership){
    const sp=await provider('sp500-constituent');if(sp.length<400||sp.length>700||sp.some(m=>!m.symbol||!m.subSector||!m.sector||!m.cik))throw new Error('Membership response incomplete');
    const map=new Map(sp.map(m=>[m.symbol,m]));
    if(universe==='iwb'){
     const response=await fetchImpl(holdingsUrl,{redirect:'manual',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Issuer holdings unavailable');
     const holdings=parseIwbHoldings(await response.text()),age=Date.parse(today)-Date.parse(holdings.asOf);if(age<0||age>10*86400000)throw new Error('Issuer holdings stale');
     job.holdingsAsOf=holdings.asOf;job.issues.push(...holdings.excluded);
     membership=holdings.members.map(m=>{const known=map.get(m.symbol);return{...m,cik:known?.cik||null,industry:known&&canonicalSector(known.sector)===m.sector?known.subSector:null};});
    }else membership=sp.map(m=>({symbol:m.symbol,name:m.name,cik:m.cik,sector:canonicalSector(m.sector),industry:m.subSector}));
    await write(prefix+'members:'+universe+':'+month,{members:membership,holdingsAsOf:job.holdingsAsOf||null,issues:job.issues});
   }else{job.holdingsAsOf=membership.holdingsAsOf;job.issues=membership.issues||[];membership=membership.members;}
   job.members=membership;job.symbols=[...new Set([...membership.map(m=>m.symbol),...references])];job.phase='quotes';
  }else if(job.phase==='quotes'){
   for(let batch=0;batch<1&&job.quoteCursor<job.symbols.length;batch++){
    const symbols=job.symbols.slice(job.quoteCursor,job.quoteCursor+40),raw=await provider('batch-quote',{symbols:symbols.join(',')});
    for(const q of raw)if(symbols.includes(q.symbol)&&q.price>0&&q.previousClose>0&&Number.isFinite(q.timestamp)&&q.timestamp*1000<=now+60000)job.quotes[q.symbol]={symbol:q.symbol,price:q.price,previousClose:q.previousClose,marketCap:q.marketCap??null,volume:q.volume??null,timestamp:q.timestamp};job.quoteCursor+=symbols.length;
   }
   if(job.quoteCursor===job.symbols.length){
    if(!job.quotes['^GSPC']){const raw=await provider('quote',{symbol:'^GSPC'}),q=raw.find(q=>q.symbol==='^GSPC'&&q.price>0&&q.previousClose>0&&Number.isFinite(q.timestamp));if(q)job.quotes['^GSPC']={symbol:q.symbol,price:q.price,previousClose:q.previousClose,volume:q.volume??null,timestamp:q.timestamp};}
    const index=job.quotes['^GSPC'];if(!index)throw new Error('Benchmark quote unavailable');job.asOf=exchangeDate(index.timestamp*1000);if(Date.parse(today)-Date.parse(job.asOf)>7*86400000||index.timestamp*1000>now+60000)throw new Error('Benchmark quote stale');
    for(const[s,q]of Object.entries(job.quotes))if(exchangeDate(q.timestamp*1000)!==job.asOf)delete job.quotes[s];job.phase='references';
   }
  }else if(job.phase==='references'){
   const symbol=references[job.refCursor],rows=await history(symbol);if(symbol==='^GSPC'&&(rows.length<252||Date.parse(job.asOf)-Date.parse(rows.at(-1)?.date)>7*86400000))throw new Error('Benchmark history unavailable or stale');job.refCursor++;if(job.refCursor===references.length)job.phase='stocks';
  }else if(job.phase==='stocks'){
   for(let processed=0;processed<6&&job.cursor<job.members.length;processed++){
    const member=job.members[job.cursor],q=job.quotes[member.symbol],stateKey=prefix+'prepared:'+member.symbol+':'+member.sector;let prepared=await read(stateKey),cold=prepared?.asOf!==job.asOf||prepared?.identity!==companyId(member)||!member.industry||!member.cik||(q&&prepared?.state.previousClose&&Math.abs(q.previousClose/prepared.state.previousClose-1)>.01);
    if(cold&&processed)break;
    try{
     if(!member.industry||!member.cik){
      const rows=await provider('profile',{symbol:member.symbol}),p=rows.find(p=>p.symbol===member.symbol);
      if(!p?.industry||!p?.cik||canonicalSector(p.sector)!==member.sector)throw new Error('Classification or company identity unresolved');member.industry=p.industry;member.cik=p.cik;(job.memberUpdates||={})[member.symbol]={industry:p.industry,cik:p.cik};throw new Pause(0);
     }
     if(member.industry==='Aerospace & Defense'&&member.sector!=='Industrials')throw new Error('Classification unresolved');
     if(cold){
      const repair=q&&prepared?.asOf===job.asOf&&prepared?.state.previousClose&&Math.abs(q.previousClose/prepared.state.previousClose-1)>.01;
      const rows=await history(member.symbol,companyId(member),repair),benchmark=await referenceClose('^GSPC'),sector=await referenceClose(sectorProxy(member.sector));
      const state=prepareStock(rows,sector,benchmark,job.asOf),record=stockRecord(member,rows,state,job.quotes,benchmark,job.asOf);prepared={asOf:job.asOf,identity:companyId(member),state,bases:record.bases};await write(stateKey,prepared);
     }
     const technical=liveTechnicals(prepared.state,q,job.quotes[sectorProxy(member.sector)],job.quotes['^GSPC']);
     job.buffer.push({...member,price:q?.price??null,marketCap:q?.marketCap??null,previousClose:q?.previousClose??null,quoteAsOf:q?new Date(q.timestamp*1000).toISOString():null,bases:{...prepared.bases,day:q?.previousClose??null},technical:technical.values,percentile:technical.percentile});job.consecutiveFailures=0;
    }catch(error){if(error instanceof Pause)throw error;job.issues.push({symbol:member.symbol,reason:/^FMP /.test(error.message)?error.message:'History, classification or company identity unavailable'});job.consecutiveFailures=/^FMP /.test(error.message)?(job.consecutiveFailures||0)+1:0;if(job.consecutiveFailures>=5)throw new Error('Repeated provider failures; saved snapshot retained');}
    job.cursor++;
    if(job.buffer.length>=16||job.cursor===job.members.length){const key=prefix+'records:'+job.id+':'+job.chunks.length;await write(key,job.buffer);job.chunks.push(key);job.buffer=[];}
    if(cold)break;
   }
   if(job.cursor===job.members.length){job.phase='partition';job.partitionCursor=0;job.sectorChunks={};}
  }else if(job.phase==='partition'||job.phase==='assemble'){
   // Accept an in-progress job from the original deployment without rebuilding.
   job.partitionCursor??=0;job.sectorChunks||={};job.records=[];job.phase='partition';
   if(job.partitionCursor<job.chunks.length){
    const records=await read(job.chunks[job.partitionCursor]),parts={};for(const r of records)(parts[r.sector]||=[]).push(r);
    for(const[sector,part]of Object.entries(parts)){const key=prefix+'partition:'+job.id+':'+sector+':'+job.partitionCursor;await write(key,part);(job.sectorChunks[sector]||=[]).push(key);}job.partitionCursor++;
   }
   if(job.partitionCursor===job.chunks.length){
    const classifications=new Map();for(const m of job.members)if(companyId(m)&&m.industry){const id=companyId(m);if(!classifications.has(id))classifications.set(id,new Set());classifications.get(id).add(m.sector+'|'+m.industry);}
    job.conflictedCompanies=[...classifications].filter(([,v])=>v.size>1).map(([k])=>k);for(const m of job.members)if(job.conflictedCompanies.includes(companyId(m)))job.issues.push({symbol:m.symbol,reason:'Conflicting company classifications across share classes'});
    job.sectorNames=['Industrials','Consumer Discretionary','Information Technology','Communication Services','Health Care','Consumer Staples','Utilities','Real Estate','Financials','Energy','Materials'].filter(s=>job.members.some(m=>m.sector===s));
    job.sectorCursor=0;job.sectorReadCursor=0;job.sectorRecords=[];job.groupKeys=[];job.totals={processed:0,returnCompanies:0,values:{},counts:{}};job.phase='sector-read';
   }
  }else if(job.phase==='sector-read'){
   const sector=job.sectorNames[job.sectorCursor],chunks=job.sectorChunks[sector]||[];
   for(let i=0;i<12&&job.sectorReadCursor<chunks.length;i++){job.sectorRecords.push(...await read(chunks[job.sectorReadCursor]));job.sectorReadCursor++;}
   if(job.sectorReadCursor===chunks.length)job.phase='sector-calculate';
  }else if(job.phase==='sector-calculate'){
   const sector=job.sectorNames[job.sectorCursor],members=job.members.filter(m=>m.sector===sector),records=job.sectorRecords.filter(r=>!job.conflictedCompanies.includes(companyId(r))),benchmark=await referenceClose('^GSPC');
   const result=aggregateMonitor(records,members,job.quotes,benchmark,job.asOf,universe,[]),group=result.groups[0],key=prefix+'group:'+job.id+':'+job.sectorCursor;
   await write(key,group);job.groupKeys.push(key);job.reportBase={benchmark:result.benchmark,sourceLabel:result.sourceLabel,methodology:result.methodology};
   for(const[k,v]of Object.entries(group.technical)){const count=group.technicalCoverage[k].included;job.totals.values[k]=(job.totals.values[k]||0)+(Number.isFinite(v)?v*count:0);job.totals.counts[k]=(job.totals.counts[k]||0)+count;}
   job.totals.processed+=records.length;job.totals.returnCompanies+=result.coverage.returnCompanies;job.sectorCursor++;job.sectorReadCursor=0;job.sectorRecords=[];job.phase=job.sectorCursor===job.sectorNames.length?'publish':'sector-read';
  }else if(job.phase==='publish'){
   const companies=new Set(job.members.map(companyId).filter(Boolean)),technical={},technicalCoverage={};
   for(const[k,sum]of Object.entries(job.totals.values)){const count=job.totals.counts[k];technical[k]=count?sum/count:null;technicalCoverage[k]={included:count,total:companies.size};}
   const quoteTimes=Object.values(job.quotes).map(q=>q.timestamp),coverage={universe:job.members.length,companies:companies.size,processed:job.totals.processed,returnCompanies:job.totals.returnCompanies,oldestQuote:quoteTimes.length?new Date(Math.min(...quoteTimes)*1000).toISOString():null,newestQuote:quoteTimes.length?new Date(Math.max(...quoteTimes)*1000).toISOString():null};
   const result={...job.reportBase,state:'ready',universe,asOf:job.asOf,groups:job.groupKeys,coverage,overall:{name:(universe==='iwb'?'IWB equities':'S&P 500')+' · company breadth',technical,technicalCoverage},issues:job.issues,review:{excluded:job.issues,corrections:[],conflicts:job.conflictedCompanies},refresh:{membershipMonth:month,historyPreparedAt:new Date(now).toISOString()},status:coverage.processed+' / '+coverage.universe+' securities processed · '+coverage.companies+' identified companies · Prices as of '+job.asOf+' · Intraday technicals are provisional'};
   if(universe==='iwb')result.sourceLabel+=' · Holdings as of '+job.holdingsAsOf;
   await write(prefix+'members:'+universe+':'+month,{members:job.members,holdingsAsOf:job.holdingsAsOf||null,issues:job.issues.filter(i=>!job.members.some(m=>m.symbol===i.symbol))});
   const previous=await read(manifestKey);await write(manifestKey,{...result,groupPrefix:prefix+'group:'+job.id+':%',previousGroupPrefix:previous?.groupPrefix||null,holdingsAsOf:job.holdingsAsOf||null,preparedAt:new Date(now).toISOString()});
   if(previous?.previousGroupPrefix)await env.DB.prepare('DELETE FROM market_history_cache WHERE cache_key LIKE ?').bind(previous.previousGroupPrefix).run();
   for(const kind of ['records','partition'])await env.DB.prepare('DELETE FROM market_history_cache WHERE cache_key LIKE ?').bind(prefix+kind+':'+job.id+':%').run();
   job.phase='done';await persistJob();return await saved();
  }
  await persistJob();return await progress();
 }catch(error){
  if(error instanceof Pause){if(job)await persistJob();return await progress(error.seconds);}
  if(job){job.phase='failed';try{await persistJob();}catch{}}
  return reply({error:/^(FMP |Benchmark |Membership |Issuer |Repeated )/.test(error.message||'')?error.message:'Monitor could not refresh. Saved results remain available.'},502);
 }finally{
  if(locked)try{await env.DB.prepare('UPDATE market_history_cache SET fetched_at=0 WHERE cache_key=? AND payload=?').bind(leaseKey,token).run();}catch{}
 }
}
