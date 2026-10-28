// Temporary bounded account-capability check; no arbitrary endpoint or symbol input.
export async function validateSectorAccess(request,env,fetchImpl=fetch) {
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='GET')return reply({error:'GET required'},405);
 if(!env.DB?.prepare||!env.FMP_API_KEY)return reply({error:'Existing data connection required'},503);
 const now=Date.now(),key=JSON.stringify(['sp500-member-access-v1']);
 try {
  const cache=await env.DB.prepare('SELECT payload, fetched_at FROM market_history_cache WHERE cache_key = ?').bind(key).first();
  if(cache&&now-cache.fetched_at<600000)return reply(JSON.parse(cache.payload));
 }catch{return reply({error:'Data cache unavailable'},503);}
 const checks=[];
 async function probe(endpoint,params={},kind='sample') {
  const check={endpoint,params};checks.push(check);
  try {
   const url=new URL('https://financialmodelingprep.com/stable/'+endpoint);
   for(const [k,v]of Object.entries({...params,apikey:env.FMP_API_KEY}))url.searchParams.set(k,v);
   const response=await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});check.http=response.status;
   if(!response.ok)return null;
   const raw=await response.json();check.rows=Array.isArray(raw)?raw.length:null;
   if(!Array.isArray(raw)){check.status='Unexpected data shape';return null;}
   const fields=['symbol','name','sector','industry','exchange','date','averageChange','price','changesPercentage','timestamp','subSector','marketCap','change','changePercentage','previousClose','close','open','volume','dateAdded','removedTicker','addedSecurity'];
   const clean=r=>typeof r==='string'?r:Object.fromEntries(fields.filter(k=>Object.hasOwn(r||{},k)).map(k=>[k,r[k]]));
   check.sample=raw.slice(0,kind==='list'?250:3).map(clean);
   return raw;
  }catch{check.status='Request or response unavailable';return null;}
 }
 const members=await probe('sp500-constituent');
 if(Array.isArray(members)) {
  const counts={};let classified=0;
  for(const r of members){if(r.sector&&r.subSector)classified++;counts[r.sector||'Unclassified']=(counts[r.sector||'Unclassified']||0)+1;}
  checks[0].coverage={members:members.length,uniqueSymbols:new Set(members.map(r=>r.symbol)).size,classified,sectors:counts,industryCount:new Set(members.map(r=>r.subSector).filter(Boolean)).size};
  checks[0].sample=members.slice(0,10).map(r=>({symbol:r.symbol,name:r.name,sector:r.sector,subSector:r.subSector}));
 }
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const from=new Date(Date.parse(today+'T12:00:00Z')-375*86400000).toISOString().slice(0,10);
 const berkshire=members?.find(r=>/^BRK[.-]B$/.test(r.symbol))?.symbol||'BRK-B';
 const symbols=['AAPL','JPM',berkshire];
 const quotes=await probe('batch-quote',{symbols:symbols.join(',')});
 if(Array.isArray(quotes))checks.at(-1).coverage={requested:symbols,returned:quotes.map(r=>r.symbol),prices:quotes.every(r=>Number.isFinite(r.price)&&r.price>0),marketCaps:quotes.every(r=>Number.isFinite(r.marketCap)&&r.marketCap>0),timestamps:quotes.every(r=>Number.isFinite(r.timestamp)),dailyChanges:quotes.every(r=>Number.isFinite(r.change))};
 for(const symbol of symbols) {
  const rows=await probe('historical-price-eod/full',{symbol,from,to:today});
  if(Array.isArray(rows))checks.at(-1).coverage={firstDate:rows.at(-1)?.date,lastDate:rows[0]?.date,closes:rows.every(r=>Number.isFinite(r.close)&&r.close>0)};
 }
 await probe('profile',{symbol:'AAPL'});
 await probe('historical-sp500-constituent');
 const report={checkedAt:new Date(now).toISOString(),checks};
 try {await env.DB.prepare('INSERT INTO market_history_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at').bind(key,JSON.stringify(report),now).run();}catch{return reply({error:'Could not save validation report'},503);}
 return reply(report);
}