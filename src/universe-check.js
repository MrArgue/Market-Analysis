import {holdingsUrl,parseIwbHoldings,historyWindows} from './iwb-universe.js';
import {exchangeDate} from './current-quote.js';
const key='iwb-technical-access-v1',cooldown=30*60000,retention=86400000;
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
// Temporary bounded preflight. GET reads only; a same-origin POST starts at most
// 17 fixed-scope FMP calls. A D1 compare-and-set lease also covers concurrent tabs.
export async function handleUniverseCheck(request,env,fetchImpl=fetch,now=Date.now()){
 if(!['GET','POST'].includes(request.method))return reply({error:'GET or POST required'},405);
 if(!env.DB?.prepare||!env.FMP_API_KEY?.trim())return reply({error:'Existing data connection required'},503);
 if(request.method==='POST'){
  if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'Same-origin request required'},403);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'JSON required'},400);
  let input;try{input=await request.json();}catch{return reply({error:'Invalid request'},400);}
  if(input?.action!=='validate'||Object.keys(input).length!==1||new URL(request.url).search) return reply({error:'Fixed validation action required'},400);
 }
 let record;
 try{record=await env.DB.prepare('SELECT payload, fetched_at FROM market_history_cache WHERE cache_key = ?').bind(key).first();}catch{return reply({error:'Existing cache unavailable'},503);}
 if(record&&now-record.fetched_at<retention){
  try{const saved=JSON.parse(record.payload);if(saved.state==='ready'||now-record.fetched_at<cooldown)return reply(saved,saved.state==='running'?202:200);}catch{}
 }
 if(request.method==='GET')return reply({state:'not-checked'});
 const token=crypto.randomUUID(),running={state:'running',startedAt:new Date(now).toISOString(),token};
 try{
  const claimed=await env.DB.prepare('INSERT INTO market_history_cache (cache_key,payload,fetched_at) VALUES (?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at WHERE market_history_cache.fetched_at <= ? RETURNING cache_key').bind(key,JSON.stringify(running),now,now-cooldown).first();
  if(!claimed)return reply({state:'running',message:'An access check is already running or cooling down.'},202);
 }catch{return reply({error:'Could not reserve access check'},503);}
 const checks=[];let fmpCalls=0;
 async function probe(endpoint,params,inspect){
  const check={endpoint,params};checks.push(check);fmpCalls++;
  if(fmpCalls>17)throw new Error('Validation call budget exceeded');
  try{
   const url=new URL('https://financialmodelingprep.com/stable/'+endpoint);for(const[k,v]of Object.entries({...params,apikey:env.FMP_API_KEY}))url.searchParams.set(k,v);
   const response=await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});check.http=response.status;
   if(!response.ok){check.usable=false;return null;}
   const raw=await response.json();if(!Array.isArray(raw)){check.usable=false;check.reason='Unexpected response shape';return null;}
   check.rows=raw.length;check.coverage=inspect(raw);check.usable=check.coverage.usable===true;return raw;
  }catch{check.usable=false;check.reason='Request or response unavailable';return null;}
 }
 let report;
 try{
  const response=await fetchImpl(holdingsUrl,{redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Issuer holdings unavailable');
  const holdings=parseIwbHoldings(await response.text()),today=exchangeDate(now);
  const age=Date.parse(today+'T12:00:00Z')-Date.parse(holdings.asOf+'T12:00:00Z');if(age<0||age>10*86400000)throw new Error('Issuer holdings date is stale');
  const sp=await probe('sp500-constituent',{},raw=>({usable:raw.length>=400&&raw.every(r=>typeof r.symbol==='string'),members:raw.length}));
  if(!checks.at(-1).usable)throw new Error('Membership comparison unavailable');
  const spSymbols=new Set(sp.map(r=>r.symbol)),added=holdings.members.filter(m=>!spSymbols.has(m.symbol)).sort((a,b)=>b.marketValue-a.marketValue);
  if(added.length<100)throw new Error('Added holdings sample unavailable');
  const samples=['AAPL',added[0].symbol,added[Math.floor(added.length*.75)].symbol];
  const profiles=[];
  for(const symbol of samples){
   const rows=await probe('profile',{symbol},raw=>{const r=raw.find(r=>r.symbol===symbol);return{usable:!!(r?.industry&&r?.sector&&r?.cik),symbol,sector:typeof r?.sector==='string'?r.sector:null,industry:typeof r?.industry==='string'?r.industry:null,companyIdAvailable:!!r?.cik};});profiles.push(checks.at(-1));
  }
  const symbols=[...samples,'^GSPC','XLK','XLC'];
  await probe('batch-quote',{symbols:symbols.join(',')},raw=>({usable:symbols.every(s=>raw.some(q=>q.symbol===s&&q.price>0&&q.previousClose>0&&Number.isFinite(q.timestamp)&&(samples.includes(s)?q.marketCap>0:true))),requested:symbols,returned:symbols.filter(s=>raw.some(q=>q.symbol===s)),volumeAvailable:samples.every(s=>raw.some(q=>q.symbol===s&&Number.isFinite(q.volume)&&q.volume>=0))}));
  const windows=historyWindows(today);
  for(const symbol of samples)for(const range of windows){
   await probe('historical-price-eod/full',{symbol,...range},raw=>{
    const rows=raw.filter(r=>typeof r.date==='string'&&r.date>=range.from&&r.date<=range.to).sort((a,b)=>a.date.localeCompare(b.date));
    return{usable:rows.length>0&&rows.every(r=>Number.isFinite(r.close)&&r.close>0&&Number.isFinite(r.volume)&&r.volume>=0),inRangeRows:rows.length,firstDate:rows[0]?.date||null,lastDate:rows.at(-1)?.date||null,closeAndVolume:rows.length>0&&rows.every(r=>r.close>0&&Number.isFinite(r.volume)),partialHistoryExpected:rows.length===0};
   });
  }
  for(const symbol of ['^GSPC','XLK','XLC'])await probe('historical-price-eod/full',{symbol,...windows[0]},raw=>{
   const rows=raw.filter(r=>r.date>=windows[0].from&&r.date<=windows[0].to).sort((a,b)=>a.date.localeCompare(b.date));return{usable:rows.length>0&&rows.every(r=>r.close>0),inRangeRows:rows.length,firstDate:rows[0]?.date||null,lastDate:rows.at(-1)?.date||null};
  });
  const denied=checks.filter(c=>[401,402,403].includes(c.http));
  report={state:'ready',checkedAt:new Date(now).toISOString(),holdings:{asOf:holdings.asOf,securities:holdings.members.length,equityWeight:holdings.equityWeight,excluded:holdings.excluded,addedToSp500:added.length},samples,checks,fmpCalls,accessDenied:denied.length>0,allSampleChecksUsable:checks.every(c=>c.usable),nextStep:denied.length?'Resolve endpoint access before building.':'Review sample coverage, including short-history stocks. This sample does not certify all holdings; a paced full-universe audit is still required.'};
 }catch{
  report={state:'failed',checkedAt:new Date(now).toISOString(),checks,fmpCalls,error:'Validation could not finish. Existing monitor is unchanged.'};
 }
 // No raw responses, URLs containing keys, exception messages or key values escape.
 try{await env.DB.prepare('UPDATE market_history_cache SET payload=?, fetched_at=? WHERE cache_key=? AND payload=?').bind(JSON.stringify(report),now,key,JSON.stringify(running)).run();}catch{return reply({error:'Could not save access report'},503);}
 return reply(report,report.state==='failed'?502:200);
}
