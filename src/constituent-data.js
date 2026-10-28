import {exchangeDate} from './current-quote.js';
import {validQuote,buildConstituentTable,baselineDates} from './constituent-math.js';
const pattern=/^[A-Z^][A-Z0-9.^-]{0,19}$/;
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function handleConstituents(request,env,fetchImpl=fetch,now=Date.now()){
 if(!['GET','POST'].includes(request.method))return reply({error:'GET or POST required'},405);
 if(!env.DB?.prepare||!env.FMP_API_KEY)return reply({error:'Existing market data connection required'},503);
 const today=exchangeDate(now),reportKey='constituent-report-v2:'+today;
 async function read(key,ttl){const r=await env.DB.prepare('SELECT payload, fetched_at FROM market_history_cache WHERE cache_key = ?').bind(key).first();if(!r||now-r.fetched_at>=ttl)return null;try{return JSON.parse(r.payload);}catch{return null;}}
 async function write(key,data){await env.DB.prepare('INSERT INTO market_history_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at').bind(key,JSON.stringify(data),now).run();}
 async function provider(endpoint,params={}){
  const url=new URL('https://financialmodelingprep.com/stable/'+endpoint);for(const[k,v]of Object.entries({...params,apikey:env.FMP_API_KEY}))url.searchParams.set(k,v);
  let response;try{response=await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{throw new Error('FMP request unavailable');}
  if(!response.ok)throw new Error('FMP returned HTTP '+response.status);
  let raw;try{raw=await response.json();}catch{throw new Error('FMP returned invalid data');}if(!Array.isArray(raw))throw new Error('FMP returned invalid data');return raw;
 }
 async function history(symbol,from){
  const key=JSON.stringify(['constituent-history-v1',symbol,from,today]);const cached=await read(key,6*3600000);if(cached)return cached;
  const raw=await provider('historical-price-eod/full',{symbol,from,to:today}),rows=raw.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&r.date>=from&&r.date<=today&&Number.isFinite(r.close)&&r.close>0).map(r=>({date:r.date,close:r.close})).sort((a,b)=>a.date.localeCompare(b.date));
  if(!rows.length||new Set(rows.map(r=>r.date)).size!==rows.length)throw new Error('No usable daily price history');await write(key,rows);return rows;
 }
 try{
  const ready=await read(reportKey,request.method==='GET'?6*3600000:60000);if(ready)return reply(request.method==='GET'?{...ready,status:ready.status+' · Saved snapshot; Load returns refreshes prices.'}:ready);
  if(request.method==='GET')return reply({state:'not-loaded'});
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'JSON request required'},400);
  const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return reply({error:'Same-origin request required'},403);
  let input;try{input=await request.json();}catch{return reply({error:'Invalid request'},400);}
  const from=new Date(Date.parse(today+'T12:00:00Z')-380*86400000).toISOString().slice(0,10);
  let job;
  if(input.action==='start'){
   const active=await read('constituent-active-v1:'+today,15*60000);if(active){const existing=await read('constituent-job-v1:'+active.id,15*60000);if(existing&&existing.cursor<existing.members.length)return reply({state:'loading',id:existing.id,loaded:existing.cursor,total:existing.members.length});}
   let members=await read('constituent-members-v1',24*3600000);
   if(!members){
    const raw=await provider('sp500-constituent');
    if(!raw.length||raw.length>700||raw.some(r=>!pattern.test(r.symbol)||!r.name||!r.sector||!r.subSector)||new Set(raw.map(r=>r.symbol)).size!==raw.length)throw new Error('Membership/classification coverage is incomplete');
    members=raw.map(r=>({symbol:r.symbol,name:r.name,sector:r.sector,industry:r.subSector,cik:r.cik||null}));await write('constituent-members-v1',members);
   }
   const allowed=['Technology','Basic Materials','Industrials','Healthcare','Communication Services','Consumer Cyclical','Financial Services','Energy','Utilities','Consumer Defensive','Real Estate'];
   if(members.some(m=>!allowed.includes(m.sector)))throw new Error('Membership contains unsupported sector classifications');
   const symbols=[...new Set([...members.map(m=>m.symbol),'^GSPC'])],quotes={},issues=[];
   for(let i=0;i<symbols.length;i+=40){
    const batch=symbols.slice(i,i+40),key=JSON.stringify(['constituent-quotes-v1',batch]),cached=await read(key,60000);
    try{
     const raw=cached||await provider('batch-quote',{symbols:batch.join(',')});
     if(!cached)await write(key,raw.filter(q=>batch.includes(q.symbol)).map(q=>({symbol:q.symbol,price:q.price,previousClose:q.previousClose,marketCap:q.marketCap,timestamp:q.timestamp})));
     for(const q of raw)if(batch.includes(q.symbol)&&validQuote(q,q.symbol,now))quotes[q.symbol]={symbol:q.symbol,price:q.price,previousClose:q.previousClose,marketCap:q.marketCap,timestamp:q.timestamp};
    }catch(error){issues.push({symbols:batch,reason:error.message});}
   }
   if(!quotes['^GSPC']){
    const raw=await provider('quote',{symbol:'^GSPC'});const q=raw.find(q=>validQuote(q,'^GSPC',now));
    if(q)quotes['^GSPC']={symbol:q.symbol,price:q.price,previousClose:q.previousClose,marketCap:q.marketCap,timestamp:q.timestamp};
   }
   const benchmarkQuote=quotes['^GSPC'];if(!benchmarkQuote)throw new Error('S&P 500 benchmark quote unavailable');
   const asOf=exchangeDate(benchmarkQuote.timestamp*1000);if(Date.parse(today+'T12:00:00Z')-Date.parse(asOf+'T12:00:00Z')>4*86400000)throw new Error('S&P 500 benchmark quote is stale');
   for(const m of members)if(!quotes[m.symbol]||exchangeDate(quotes[m.symbol].timestamp*1000)!==asOf)issues.push({symbol:m.symbol,reason:'Same-session quote unavailable'});
   const benchmark=await history('^GSPC',from),signature=JSON.stringify(members.map(m=>[m.symbol,m.sector,m.industry,m.cik]));
   const prepared=await read('constituent-inputs-v2:'+asOf,6*3600000);
   const baselines=baselineDates(benchmark,asOf);
   if(prepared&&prepared.signature===signature&&JSON.stringify(prepared.baselines)===JSON.stringify(baselines)){
    const result=buildConstituentTable({members,quotes,issues,benchmark,benchmarkQuote,histories:prepared.prices,now});
    result.refresh={mode:'saved-inputs',preparedAt:prepared.createdAt};await write(reportKey,result);return reply(result);
   }
   job={id:crypto.randomUUID(),members,quotes,issues,benchmark,benchmarkQuote,signature,cursor:0,prices:{},day:today,from,createdAt:now};
   await write('constituent-job-v1:'+job.id,job);await write('constituent-active-v1:'+today,{id:job.id});
  }else if(input.action==='step'&&/^[a-f0-9-]{36}$/.test(input.id||'')){
   job=await read('constituent-job-v1:'+input.id,30*60000);if(!job||job.day!==today)throw new Error('Load session expired. Click Load returns to restart.');
   const batch=job.members.slice(job.cursor,job.cursor+12);
   for(let i=0;i<batch.length;i+=4)await Promise.all(batch.slice(i,i+4).map(async m=>{try{const rows=await history(m.symbol,job.from);const dates=new Set(Object.values(baselineDates(job.benchmark,exchangeDate(job.benchmarkQuote.timestamp*1000))));job.prices[m.symbol]=rows.filter(r=>dates.has(r.date));}catch(error){job.issues.push({symbol:m.symbol,reason:error.message});}}));
   job.cursor+=batch.length;await write('constituent-job-v1:'+job.id,job);
  }else return reply({error:'Invalid load action'},400);
  if(job.cursor<job.members.length)return reply({state:'loading',id:job.id,loaded:job.cursor,total:job.members.length});
  const asOf=exchangeDate(job.benchmarkQuote.timestamp*1000);
  await write('constituent-inputs-v2:'+asOf,{signature:job.signature,baselines:baselineDates(job.benchmark,asOf),prices:job.prices,createdAt:now});
  const result=buildConstituentTable({...job,histories:job.prices,now});result.refresh={mode:'rebuilt-inputs',preparedAt:now};await write(reportKey,result);return reply(result);
 }catch(error){const safe=/^(FMP |No usable |Membership|S&P 500 |Load session)/.test(error.message||'')?error.message:'Sector data could not be loaded. Check the existing data connection.';return reply({error:safe},502);}
}