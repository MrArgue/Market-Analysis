// Temporary bounded account-capability check; no arbitrary endpoint or symbol input.
export async function validateSectorAccess(request,env,fetchImpl=fetch) {
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='GET')return reply({error:'GET required'},405);
 if(!env.DB?.prepare||!env.FMP_API_KEY)return reply({error:'Existing data connection required'},503);
 const now=Date.now(),key=JSON.stringify(['sector-access-check-v1']);
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
   const fields=['symbol','name','sector','industry','exchange','date','averageChange','price','changesPercentage','timestamp'];
   const clean=r=>typeof r==='string'?r:Object.fromEntries(fields.filter(k=>Object.hasOwn(r||{},k)).map(k=>[k,r[k]]));
   check.sample=raw.slice(0,kind==='list'?250:3).map(clean);
   return raw;
  }catch{check.status='Request or response unavailable';return null;}
 }
 const indices=await probe('index-list');
 const sp=Array.isArray(indices)?indices.filter(r=>/S&P 500/i.test(r.name||'')):[];
 if(indices)checks[0].sample=sp.map(r=>({symbol:r.symbol,name:r.name}));
 await probe('available-sectors',{},'list');
 await probe('available-industries',{},'list');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const from=new Date(Date.parse(today+'T12:00:00Z')-367*86400000).toISOString().slice(0,10);
 await probe('sector-performance-snapshot',{date:today});
 await probe('industry-performance-snapshot',{date:today});
 await probe('historical-sector-performance',{sector:'Energy',exchange:'NYSE',from,to:today});
 await probe('historical-industry-performance',{industry:'Biotechnology',exchange:'NASDAQ',from,to:today});
 const sector=sp.find(r=>/Industrials.*Sector/i.test(r.name||''));
 const industry=sp.find(r=>/Aerospace/i.test(r.name||''));
 for(const r of [sector,industry].filter(Boolean)) {
  await probe('historical-price-eod/full',{symbol:r.symbol,from,to:today});
  await probe('quote',{symbol:r.symbol});
 }
 const report={checkedAt:new Date(now).toISOString(),checks};
 try {await env.DB.prepare('INSERT INTO market_history_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at').bind(key,JSON.stringify(report),now).run();}catch{return reply({error:'Could not save validation report'},503);}
 return reply(report);
}