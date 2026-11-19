import {analyzeHistory,packObservations,emptySummary,mergeSummaries,publicSummary,methodologyVersion} from './historical-research-math.js';
import {sectorProxy} from './monitor-math.js';
import {exchangeDate} from './current-quote.js';

const namespace='historical-research-v1:',monitor='monitor-v1:',maxPerStep=2;
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const validUniverse='iwb';
function monthFor(now){return exchangeDate(now).slice(0,7);}
function signature(parts){return parts.map(p=>[p?.fetched_at||0,p?.data?.until||'',p?.data?.rows?.length||0].join(':')).join('|');}
export async function handleHistoricalResearch(request,env,now=Date.now()){
 const url=new URL(request.url),universe=url.searchParams.get('universe')||validUniverse;
 if(universe!==validUniverse)return json({error:'Only the IWB Russell 1000 proxy is supported'},400);
 if(!['GET','POST'].includes(request.method))return json({error:'Unsupported method'},405);
 if(!env.DB?.prepare)return json({error:'Research storage is unavailable'},503);
 const reportKey=namespace+'report:'+universe,jobKey=namespace+'job:'+universe,month=monthFor(now);
 async function read(key){
  const r=await env.DB.prepare('SELECT payload,fetched_at FROM market_history_cache WHERE cache_key=?').bind(key).first();
  if(!r)return null;try{return{data:JSON.parse(r.payload),fetched_at:r.fetched_at};}catch{return null;}
 }
 async function write(key,data){
  const raw=JSON.stringify(data);
  if(raw.length>1600000)throw Error('Research partition exceeds size limit');
  await env.DB.prepare('INSERT INTO market_history_cache(cache_key,payload,fetched_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(key,raw,now).run();
 }
 if(request.method==='GET'){
  // A lightweight checkpoint query lets a disconnected mobile browser resume
  // without resetting a large research build or waiting for a full report.
  if(url.searchParams.get('progress')==='1'){
   const job=(await read(jobKey))?.data;
   if(job?.phase==='running')return json({state:'loading',id:job.id,done:job.cursor,total:job.members.length,
    processed:job.processed,missingHistory:job.missing,errors:job.errors,universe});
   const report=await read(reportKey);
   return json(report?.data?.state==='ready'?{state:'ready',universe}: {state:'not-loaded',universe});
  }
  const report=await read(reportKey);
  return json(report?{...report.data,saved:true}:{state:'not-loaded',universe,reason:'No historical research report has been prepared'});
 }
 if(request.headers.get('Origin')!==url.origin)return json({error:'Same-origin request required'},403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required'},400);
 let body;try{body=await request.json();}catch{return json({error:'Invalid JSON'},400);}
 if(!['start','step'].includes(body?.action))return json({error:'Unknown action'},400);
 // A short database lease prevents concurrent tabs from duplicating the same
 // batch. Failure leaves the previous published report readable.
 const leaseKey=namespace+'lease:'+universe,token=crypto.randomUUID();
 const lease=await env.DB.prepare('INSERT INTO market_history_cache(cache_key,payload,fetched_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at WHERE market_history_cache.fetched_at<=? RETURNING cache_key').bind(leaseKey,token,now+120000,now).first();
 if(!lease)return json({state:'loading',waiting:true,retryAfter:2,universe});
 try{
  let job=(await read(jobKey))?.data;
  if(body.action==='start'){
   if(job?.phase==='running'&&job.month===month&&job.version===methodologyVersion)
    return json({state:'loading',id:job.id,done:job.cursor,total:job.members.length,universe});
   const source=await read(monitor+'members:'+universe+':'+month);
   if(!source?.data?.members?.length)return json({error:'Refresh US Sectors/Industries first so the current IWB holdings are cached',state:'not-ready'},409);
   const members=source.data.members.filter(m=>m.symbol&&sectorProxy(m.sector)).map(m=>({symbol:m.symbol,sector:m.sector,name:m.name||m.symbol}));
   if(members.length<700||members.length>1300)return json({error:'IWB membership is incomplete'},409);
   job={id:crypto.randomUUID(),version:methodologyVersion,month,universe,phase:'running',cursor:0,members,
    totals:emptySummary(),sectors:{},processed:0,missing:0,errors:0,first:null,last:null,createdAt:new Date(now).toISOString()};
   await write(jobKey,job);
   return json({state:'loading',id:job.id,done:0,total:members.length,universe});
  }
  if(!job||job.phase!=='running'||job.id!==body.id)return json({error:'Research job changed; start again'},409);
  // Reuse the same index / sector histories within a step. The persistent
  // D1 stock history remains authoritative; this avoids repeated large reads.
  const referenceCache=new Map();
  async function sharedHistory(symbol){if(!referenceCache.has(symbol))referenceCache.set(symbol,await read(monitor+'history:'+symbol));return referenceCache.get(symbol);}
  for(let i=0;i<maxPerStep&&job.cursor<job.members.length;i++){
   const m=job.members[job.cursor++];
   const stock=await read(monitor+'history:'+m.symbol);
   const sector=await sharedHistory(sectorProxy(m.sector));
   const market=await sharedHistory('^GSPC');
   if(!stock?.data?.rows?.length||!sector?.data?.rows?.length||!market?.data?.rows?.length){job.missing++;continue;}
   const key=namespace+'stock:'+m.symbol;
   const stamp=signature([stock,sector,market])+':'+m.sector;
   let saved=(await read(key))?.data;
   if(saved?.signature!==stamp||saved?.version!==methodologyVersion){
    try{
     const unpack=r=>r.map(x=>({date:x[0],close:x[4],volume:x[5]}));
     const analysis=analyzeHistory(unpack(stock.data.rows),unpack(sector.data.rows),unpack(market.data.rows));
     saved={version:methodologyVersion,signature:stamp,sector:m.sector,name:m.name,firstDate:analysis.firstDate,lastDate:analysis.lastDate,
      firstScoreDate:analysis.firstScoreDate,firstExtremeDate:analysis.firstExtremeDate,
      tradingDays:analysis.totalTradingDays,missingBenchmarkDates:analysis.missingBenchmarkDates,
      rows:packObservations(analysis.observations),summary:analysis.summary};
     await write(key,saved);
    }catch{job.errors++;continue;}
   }
   job.processed++;
   mergeSummaries(job.totals,saved.summary);
   mergeSummaries(job.sectors[m.sector]||=emptySummary(),saved.summary);
   if(!job.first||saved.firstDate<job.first)job.first=saved.firstDate;
   if(!job.last||saved.lastDate>job.last)job.last=saved.lastDate;
  }
  if(job.cursor===job.members.length){
   job.phase='done';
   const result={state:'ready',version:methodologyVersion,universe,asOf:new Date(now).toISOString(),
    membershipMonth:job.month,coverage:{expected:job.members.length,processed:job.processed,missingHistory:job.missing,errors:job.errors,
     oldestPriceDate:job.first,newestPriceDate:job.last},
    totals:publicSummary(job.totals),sectors:Object.fromEntries(Object.entries(job.sectors).map(([k,v])=>[k,publicSummary(v)])),
    limitations:'Current IWB holdings proxy applied to all history (survivorship and hindsight bias). Only existing cached prices, normally up to 11 years, are analyzed. ETF inception and missing aligned prices restrict early signals. Repeated overlapping forward windows are not independent. Returns are price-only, not total returns, and ignore trading costs. Forward months use first stock session on/after the calendar anniversary (within 7 calendar days); missing outcomes are excluded. Same-day observed signals do not imply achievable same-close trades.'};
   await write(reportKey,result);
   await write(jobKey,{...job,members:[]});
   return json(result);
  }
  await write(jobKey,job);
  return json({state:'loading',universe,id:job.id,done:job.cursor,total:job.members.length,processed:job.processed,
   missingHistory:job.missing,errors:job.errors});
 }catch{return json({error:'Research step interrupted; saved checkpoint remains available for retry.',code:'step_interrupted',retryable:true},503);}
 finally{try{await env.DB.prepare('UPDATE market_history_cache SET fetched_at=0 WHERE cache_key=? AND payload=?').bind(leaseKey,token).run();}catch{}}
}
