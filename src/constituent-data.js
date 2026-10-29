import {exchangeDate} from './current-quote.js';
import {validQuote,buildConstituentTable,baselineDates} from './constituent-math.js';
const pattern=/^[A-Z^][A-Z0-9.^-]{0,19}$/;
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const LONG=45*86400000;
export async function handleConstituents(request,env,fetchImpl=fetch,now=Date.now()){
 if(!['GET','POST'].includes(request.method))return reply({error:'GET or POST required'},405);
 if(!env.DB?.prepare||!env.FMP_API_KEY)return reply({error:'Existing market data connection required'},503);
 const today=exchangeDate(now),month=today.slice(0,7),reportKey='constituent-report-v4:'+today;
 async function read(key,ttl){const r=await env.DB.prepare('SELECT payload, fetched_at FROM market_history_cache WHERE cache_key = ?').bind(key).first();if(!r||now-r.fetched_at>=ttl)return null;try{return JSON.parse(r.payload);}catch{return null;}}
 async function write(key,data){await env.DB.prepare('INSERT INTO market_history_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at').bind(key,JSON.stringify(data),now).run();}
 async function provider(endpoint,params={}){
  const url=new URL('https://financialmodelingprep.com/stable/'+endpoint);for(const[k,v]of Object.entries({...params,apikey:env.FMP_API_KEY}))url.searchParams.set(k,v);
  let response;try{response=await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{throw new Error('FMP request unavailable');}
  if(!response.ok)throw new Error('FMP returned HTTP '+response.status);
  let raw;try{raw=await response.json();}catch{throw new Error('FMP returned invalid data');}if(!Array.isArray(raw))throw new Error('FMP returned invalid data');return raw;
 }
 function clean(rows,from,to){const result=rows.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&r.date>=from&&r.date<=to&&Number.isFinite(r.close)&&r.close>0).map(r=>({date:r.date,close:r.close})).sort((a,b)=>a.date.localeCompare(b.date));if(!result.length||new Set(result.map(r=>r.date)).size!==result.length)throw new Error('No usable daily price history');return result;}
 async function history(symbol,from){
  const key=symbol==='^GSPC'?JSON.stringify(['constituent-history-v1',symbol,from,today]):JSON.stringify(['constituent-history-month-v1',month,symbol]);
  const cached=await read(key,symbol==='^GSPC'?6*3600000:LONG);if(cached)return cached;
  const rows=clean(await provider('historical-price-eod/full',{symbol,from,to:today}),from,today);await write(key,rows);return rows;
 }
 function selectPrices(series,recent,dates){return Object.fromEntries(Object.entries(series).map(([symbol,rows])=>{const prices=new Map(rows.map(r=>[r.date,r.close]));for(const[date,closes]of Object.entries(recent))if(closes[symbol]>0)prices.set(date,closes[symbol]);return[symbol,[...new Set(Object.values(dates).filter(Boolean))].filter(date=>prices.has(date)).map(date=>({date,close:prices.get(date)}))];}));}
 async function finish(job,series){
  const dates=baselineDates(job.benchmark,exchangeDate(job.benchmarkQuote.timestamp*1000));
  const result=buildConstituentTable({...job,histories:selectPrices(series,job.recent,dates),now});
  result.refresh={mode:job.mode,membershipMonth:month,historyPreparedAt:job.monthly.createdAt};
  const references={...(job.references||{})};for(const m of job.members){const q=job.quotes[m.symbol];if(q&&!job.issues.some(i=>i.symbol===m.symbol&&i.historyRepair))references[m.symbol]=q;}await write('constituent-reference-quotes-v1:'+month,references);
  await write(reportKey,result);await write('constituent-latest-report-v4',result);return reply(result);
 }
 async function loadChunks(monthly){const series={};for(let i=0;i<monthly.chunks.length;i+=4){const values=await Promise.all(monthly.chunks.slice(i,i+4).map(key=>read(key,LONG)));for(const value of values){if(!value)throw new Error('Load session history storage expired. Click Load returns to rebuild.');Object.assign(series,value);}}return series;}
 try{
  const ready=await read(reportKey,request.method==='GET'?LONG:60000);
  if(ready)return reply(request.method==='GET'?{...ready,status:ready.status+' · Saved snapshot; refreshing prices on this visit.'}:ready);
  if(request.method==='GET'){const previous=await read('constituent-latest-report-v4',LONG);return reply(previous?{...previous,status:previous.status+' · Saved snapshot; refreshing prices on this visit.'}:{state:'not-loaded'});}
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'JSON request required'},400);
  const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return reply({error:'Same-origin request required'},403);
  let input;try{input=await request.json();}catch{return reply({error:'Invalid request'},400);}
  const from=new Date(Date.parse(month+'-01T12:00:00Z')-400*86400000).toISOString().slice(0,10);
  let job;
  if(input.action==='start'){
   const active=await read('constituent-active-v4:'+month,15*60000);if(active){const existing=await read('constituent-job-v4:'+active.id,30*60000);if(existing&&existing.day===today&&existing.cursor<existing.work.length)return reply({state:'loading',id:existing.id,loaded:existing.cursor,total:existing.work.length});}
   let members=await read('constituent-members-month-v1:'+month,LONG);
   if(!members){const raw=await provider('sp500-constituent');if(!raw.length||raw.length>700||raw.some(r=>!pattern.test(r.symbol)||!r.name||!r.sector||!r.subSector)||new Set(raw.map(r=>r.symbol)).size!==raw.length)throw new Error('Membership/classification coverage is incomplete');members=raw.map(r=>({symbol:r.symbol,name:r.name,sector:r.sector,industry:r.subSector,cik:r.cik||null}));await write('constituent-members-month-v1:'+month,members);}
   const allowed=['Technology','Basic Materials','Industrials','Healthcare','Communication Services','Consumer Cyclical','Financial Services','Energy','Utilities','Consumer Defensive','Real Estate'];if(members.some(m=>!allowed.includes(m.sector)))throw new Error('Membership contains unsupported sector classifications');
   const signature=JSON.stringify(members.map(m=>[m.symbol,m.sector,m.industry,m.cik]));
   const symbols=[...new Set([...members.map(m=>m.symbol),'^GSPC'])],quotes={},issues=[];
   const quoteCache=await read('constituent-quotes-v4:'+month,60000);
   if(quoteCache?.signature===signature)Object.assign(quotes,quoteCache.quotes);
   else{
    for(let i=0;i<symbols.length;i+=160)await Promise.all(Array.from({length:Math.ceil(Math.min(160,symbols.length-i)/40)},(_,j)=>symbols.slice(i+j*40,i+(j+1)*40)).map(async batch=>{try{const raw=await provider('batch-quote',{symbols:batch.join(',')});for(const q of raw)if(batch.includes(q.symbol)&&validQuote(q,q.symbol,now))quotes[q.symbol]={symbol:q.symbol,price:q.price,previousClose:q.previousClose,marketCap:q.marketCap,timestamp:q.timestamp};}catch(error){issues.push({symbols:batch,reason:error.message});}}));
   }
   if(!quotes['^GSPC']){const raw=await provider('quote',{symbol:'^GSPC'});const q=raw.find(q=>validQuote(q,'^GSPC',now));if(q)quotes['^GSPC']=q;}
   await write('constituent-quotes-v4:'+month,{signature,quotes});
   const benchmarkQuote=quotes['^GSPC'];if(!benchmarkQuote)throw new Error('S&P 500 benchmark quote unavailable');
   const asOf=exchangeDate(benchmarkQuote.timestamp*1000);if(Date.parse(today+'T12:00:00Z')-Date.parse(asOf+'T12:00:00Z')>4*86400000)throw new Error('S&P 500 benchmark quote is stale');
   for(const m of members)if(!quotes[m.symbol]||exchangeDate(quotes[m.symbol].timestamp*1000)!==asOf)issues.push({symbol:m.symbol,reason:'Same-session quote unavailable'});
   const benchmark=await history('^GSPC',from),dates=baselineDates(benchmark,asOf),recent=await read('constituent-recent-closes-v1:'+month,LONG)||{};
   // Previous-close quotes fill the most recent completed session without 503 history calls.
   if(dates.day){recent[dates.day]||={};for(const m of members){const q=quotes[m.symbol];if(validQuote(q,m.symbol,now)&&exchangeDate(q.timestamp*1000)===asOf)recent[dates.day][m.symbol]=q.previousClose;}}
   const retained=Object.keys(recent).sort().slice(-12);for(const date of Object.keys(recent))if(!retained.includes(date))delete recent[date];await write('constituent-recent-closes-v1:'+month,recent);
   const references=await read('constituent-reference-quotes-v1:'+month,LONG)||{};
   let monthly=await read('constituent-series-month-v1:'+month,LONG);
   if(monthly?.signature!==signature)monthly=null;
   job={id:crypto.randomUUID(),members,quotes,issues,benchmark,benchmarkQuote,signature,cursor:0,day:today,month,from,recent,references,createdAt:now,buffer:{},prices:{},chunks:[],mode:'monthly-rebuild'};
   if(monthly){
    const series=await loadChunks(monthly),selected=selectPrices(series,recent,dates),work=[];
    for(const m of members){const available=new Set((selected[m.symbol]||[]).map(r=>r.date));const missing=Object.values(dates).filter(date=>date&&date>monthly.through&&!available.has(date));if(missing.length)work.push({...m,patchFrom:missing.sort()[0]});}
    // A changed split basis requires a targeted history repair, not an assumed rescaling.
    for(const m of members){
     const q=quotes[m.symbol],reference=references[m.symbol],stored=(series[m.symbol]||[]).find(r=>r.date===dates.day);
     const changedShares=q&&reference?.price>0&&reference.marketCap>0&&Math.abs((q.marketCap/q.price)/(reference.marketCap/reference.price)-1)>.05;
     if(q&&(changedShares||(stored&&Math.abs(q.previousClose/stored.close-1)>.01))){const pending=work.find(w=>w.symbol===m.symbol);if(pending){pending.patchFrom=from;pending.repair=true;}else work.push({...m,patchFrom:from,repair:true});}
    }
    job.monthly=monthly;job.mode=work.length?'incremental-backfill':'saved-monthly-history';job.work=work;
    if(!work.length)return await finish(job,series);
   }else{job.work=members;job.monthly={signature,createdAt:now,through:asOf,chunks:[]};}
   await write('constituent-job-v4:'+job.id,job);await write('constituent-active-v4:'+month,{id:job.id});
  }else if(input.action==='step'&&/^[a-f0-9-]{36}$/.test(input.id||'')){
   job=await read('constituent-job-v4:'+input.id,30*60000);if(!job||job.day!==today)throw new Error('Load session expired. Click Load returns to restart.');
   const batch=job.work.slice(job.cursor,job.cursor+12);
   if(job.mode==='monthly-rebuild'){
    for(let i=0;i<batch.length;i+=4)await Promise.all(batch.slice(i,i+4).map(async m=>{try{const rows=await history(m.symbol,job.from);job.buffer[m.symbol]=rows;}catch(error){job.issues.push({symbol:m.symbol,reason:error.message});job.buffer[m.symbol]=[];}}));
    job.cursor+=batch.length;
    if(job.cursor%48===0||job.cursor===job.work.length){const key='constituent-series-chunk-v1:'+job.id+':'+job.chunks.length;await write(key,job.buffer);job.chunks.push(key);job.buffer={};}
   }else{
    // Repair only requested dates/securities, updating bounded month chunks.
    const chunks=new Map();
    for(const m of batch){const index=Math.floor(job.members.findIndex(r=>r.symbol===m.symbol)/48);if(!chunks.has(index))chunks.set(index,await read(job.monthly.chunks[index],LONG)||{});}
    for(let i=0;i<batch.length;i+=4)await Promise.all(batch.slice(i,i+4).map(async m=>{try{const rows=clean(await provider('historical-price-eod/full',{symbol:m.symbol,from:m.patchFrom,to:today}),m.patchFrom,today);const index=Math.floor(job.members.findIndex(r=>r.symbol===m.symbol)/48),chunk=chunks.get(index),old=m.repair?[]:chunk[m.symbol]||[];chunk[m.symbol]=[...new Map([...old,...rows].map(r=>[r.date,r])).values()].sort((a,b)=>a.date.localeCompare(b.date));}catch(error){job.issues.push({symbol:m.symbol,reason:error.message,historyRepair:true});}}));
    for(const[index,chunk]of chunks)await write(job.monthly.chunks[index],chunk);job.cursor+=batch.length;
   }
   await write('constituent-job-v4:'+job.id,job);
  }else return reply({error:'Invalid load action'},400);
  if(job.cursor<job.work.length)return reply({state:'loading',id:job.id,loaded:job.cursor,total:job.work.length});
  if(job.mode==='monthly-rebuild')job.monthly.chunks=job.chunks;
  await write('constituent-series-month-v1:'+month,job.monthly);
  return await finish(job,await loadChunks(job.monthly));
 }catch(error){const safe=/^(FMP |No usable |Membership|S&P 500 |Load session)/.test(error.message||'')?error.message:'Sector data could not be loaded. Check the existing data connection.';return reply({error:safe},502);}
}