import {canonicalSector,companyId,sectorProxy} from './monitor-math.js';
import {exchangeDate} from './current-quote.js';
import {validDate} from './technical.js';
const root='exclusion-audit-v1:',maxNames=120;
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
class AuditPause extends Error{constructor(seconds){super('Pacing');this.seconds=seconds;}}
export function profileEvidence(raw,member,symbol){
 const exact=raw.find(p=>p?.symbol===symbol),alias=raw.find(p=>typeof p?.symbol==='string'&&p.symbol.replace(/[ .]/g,'-')===symbol),p=exact||alias;
 const text=v=>typeof v==='string'?v.slice(0,200):null;
 const cik=/^\d{1,10}$/.test(String(p?.cik||'').trim())?companyId(p):null,expected=companyId(member||{});
 return{found:!!p,exactSymbol:!!exact,returnedSymbol:text(p?.symbol),returnedSymbols:raw.slice(0,3).map(r=>text(r?.symbol)).filter(Boolean),name:text(p?.companyName),sector:text(p?.sector),canonicalSector:typeof p?.sector==='string'?canonicalSector(p.sector):null,industry:text(p?.industry),cik,ipoDate:validDate(p?.ipoDate)?p.ipoDate:null,exchange:text(p?.exchangeShortName),identityMatches:!expected||!cik?null:expected===cik};
}
export function historyEvidence(rows,calendar,sector,asOf){
 const dated=rows.filter(r=>validDate(r?.date)&&r.date<=asOf).sort((a,b)=>a.date.localeCompare(b.date)),map=new Map(dated.map(r=>[r.date,r]));
 const valid=r=>r&&Number.isFinite(r.close)&&r.close>0;
 const dates=calendar.filter(r=>r.date<=asOf).map(r=>r.date).sort(),since=dates.filter(d=>d>=(dated[0]?.date||asOf));
 const missing=since.filter(d=>!map.has(d)),invalidCloses=dated.filter(r=>!valid(r)).length,invalidVolumes=dated.filter(r=>!Number.isFinite(r.volume)||r.volume<0).length;
 const proxy=new Map(sector.map(r=>[r.date,r.close])),ratios=[],distances=[];let sum=0,bad=0;
 for(let i=0;i<since.length;i++){
  const d=since[i],r=map.get(d),v=valid(r)&&proxy.get(d)>0?r.close/proxy.get(d):null;ratios.push(v);if(v===null)bad++;else sum+=v;
  if(i>=200){const old=ratios[i-200];if(old===null)bad--;else sum-=old;}
  if(i>=199&&!bad&&sum>0&&d<asOf)distances.push(v/(sum/200)-1);
 }
 const enough=n=>dates.length>=n&&dates.slice(-n).every(d=>valid(map.get(d)));
 return{rows:dated.length,firstDate:dated[0]?.date||null,lastDate:dated.at(-1)?.date||null,invalidDates:rows.filter(r=>!validDate(r?.date)).length,invalidCloses,invalidVolumes,duplicateDates:dated.length-map.size,missingSessions:missing.length,missingSessionSample:missing.slice(0,5),latestSessionPresent:valid(map.get(asOf)),price50Window:enough(50),price200Window:enough(200),closing252Window:enough(252),priorValidRatioDistances:distances.length,minimumPercentileWarmup:distances.length>=252,calendarAvailable:dates.length>0,sectorHistoryAvailable:sector.length>0};
}
export function diagnoseExclusion(record){
 const codes=[],p=record.profile?.evidence,h=record.history?.evidence,q=record.quote;
 if(!record.member)codes.push('unsupported_issuer_import');
 if(record.profile?.unavailable)codes.push('profile_request_failed');
 if(record.profile?.invalidShape)codes.push('profile_response_invalid');
 if(record.profile?.http&&record.profile.http!==200)codes.push('profile_http_'+record.profile.http);
 if(!p?.found)codes.push(p?.returnedSymbols?.length?'provider_symbol_mismatch':'profile_unavailable');
 else{
  if(!p.exactSymbol)codes.push('provider_symbol_alias');
  if(!p.cik)codes.push('missing_company_identifier');
  if(p.identityMatches===false)codes.push('company_identity_conflict');
  if(!p.industry)codes.push('missing_industry');
  if(!p.canonicalSector)codes.push('missing_provider_sector');
  else if(record.member&&p.canonicalSector!==record.member.sector)codes.push('sector_disagreement');
  if(p.industry==='Aerospace & Defense'&&record.member?.sector!=='Industrials')codes.push('industry_sector_conflict');
 }
 if(!q?.usable)codes.push('same_session_quote_unavailable');
 if(q?.http&&q.http!==200)codes.push('quote_http_'+q.http);
 if(q?.unavailable)codes.push('quote_request_failed');
 if(record.history?.http&&record.history.http!==200)codes.push('history_http_'+record.history.http);
 if(record.history?.unavailable)codes.push('history_request_failed');
 if(record.history?.invalidShape)codes.push('history_response_invalid');
 if(!h?.rows)codes.push(h?.invalidDates?'invalid_price_history':record.history?.http===200&&!record.history?.invalidShape?'no_recent_history':'history_unavailable');
 else{
  if(h.invalidDates||h.invalidCloses||h.duplicateDates)codes.push('invalid_price_history');
  if(h.invalidVolumes)codes.push('missing_or_invalid_volume');
  if(h.missingSessions)codes.push('missing_history_sessions');
  if(!h.latestSessionPresent)codes.push('latest_history_session_missing');
  if(!h.calendarAvailable)codes.push('audit_benchmark_unavailable');
  if(!h.sectorHistoryAvailable)codes.push('audit_sector_proxy_unavailable');
  if(h.calendarAvailable&&!h.price200Window)codes.push('insufficient_price_200_window');
  if(h.calendarAvailable&&h.sectorHistoryAvailable&&!h.minimumPercentileWarmup)codes.push('insufficient_percentile_warmup');
 }
 const classification=codes.some(c=>['unsupported_issuer_import','provider_symbol_alias','provider_symbol_mismatch','missing_company_identifier','company_identity_conflict','missing_industry','missing_provider_sector','sector_disagreement','industry_sector_conflict','profile_unavailable'].includes(c));
 const recommendation=classification?'Review identity / industry mapping before inclusion':codes.some(c=>c.startsWith('history_http_')||c==='history_unavailable'||c==='invalid_price_history')?'Repair or verify history before inclusion':codes.some(c=>c.startsWith('insufficient_'))?'Eligible metrics may be usable; leave long-window metrics unavailable':'Candidate for full-history validation; no current classification blocker found';
 return{codes:codes.length?codes:['recent_checks_pass'],recommendation};
}
// Fixed omitted-name set from the saved IWB report. No arbitrary symbol input.
// Only audit records plus the shared FMP pacing ledger are written.
export async function handleExclusionAudit(request,env,fetchImpl=fetch,now=Date.now()){
 if(!['GET','POST'].includes(request.method))return reply({error:'GET or POST required'},405);
 if(!env.DB?.prepare||!env.FMP_API_KEY?.trim())return reply({error:'Existing data connection required'},503);
 async function read(key){const r=await env.DB.prepare('SELECT payload,fetched_at FROM market_history_cache WHERE cache_key=?').bind(key).first();return r?JSON.parse(r.payload):null;}
 async function write(key,data){await env.DB.prepare('INSERT INTO market_history_cache(cache_key,payload,fetched_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(key,JSON.stringify(data),now).run();}
 let input;
 if(request.method==='POST'){
  if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'Same-origin request required'},403);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'JSON required'},400);
  try{input=await request.json();}catch{return reply({error:'Invalid request'},400);}
  if(!['start','step'].includes(input?.action)||Object.keys(input).some(k=>!['action','id'].includes(k))||new URL(request.url).search)return reply({error:'Fixed audit action required'},400);
 }
 let job,locked=false;const token=crypto.randomUUID(),lease=root+'lease',started=Date.now(),clock=()=>now+Date.now()-started;
 const progress=seconds=>reply({state:'loading',id:job?.id,loaded:job?.cursor||0,total:job?.names?.length||0,phase:job?.phase||'waiting',retryAfter:seconds||0});
 try{
  const complete=await read(root+'report');if(request.method==='GET')return reply(complete||{state:'not-loaded'});
  if(complete&&now-Date.parse(complete.checkedAt)<86400000)return reply(complete);
  locked=!!await env.DB.prepare('INSERT INTO market_history_cache(cache_key,payload,fetched_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at WHERE market_history_cache.fetched_at<=? RETURNING cache_key').bind(lease,token,now+120000,now).first();
  if(!locked){job=await read(root+'job');return progress(2);}
  job=await read(root+'job');
  if(input.action==='step'&&(!job||input.id!==job.id))return reply({error:'Audit session changed; start again'},409);
  if(!job||job.state==='done'){
   const report=await read('monitor-v1:report:iwb');if(!report?.groups)throw new Error('Saved IWB report required');
   const stored=await read('monitor-v1:members:iwb:'+report.refresh.membershipMonth),members=stored?.members;if(!Array.isArray(members))throw new Error('Saved membership required');
   const shown=new Set();for(const key of report.groups){const g=await read(key);for(const i of g.industries)for(const s of i.stocks)shown.add(s.symbol);}
   const bySymbol=new Map(members.map(m=>[m.symbol,m])),names=[...new Set([...members.filter(m=>!shown.has(m.symbol)).map(m=>m.symbol),...(report.issues||[]).filter(i=>!bySymbol.has(i.symbol)).map(i=>i.symbol)])].sort();
   if(names.length>maxNames||names.some(s=>!/^[A-Z][A-Z0-9-]{0,19}$/.test(s)))throw new Error('Audit set exceeds fixed safety bounds');
   job={id:crypto.randomUUID(),state:'running',phase:'quotes',cursor:0,quoteCursor:0,names,members:Object.fromEntries(names.filter(s=>bySymbol.has(s)).map(s=>[s,bySymbol.get(s)])),quotes:{},records:[],calls:0,source:{asOf:report.asOf,holdingsAsOf:report.holdingsAsOf,membershipMonth:report.refresh.membershipMonth,reportPreparedAt:report.preparedAt,eligibleOmitted:members.filter(m=>!shown.has(m.symbol)).length,issuerImportOmitted:names.filter(s=>!bySymbol.has(s)).length},createdAt:now};
   const d=new Date(job.source.asOf+'T12:00:00Z');d.setUTCFullYear(d.getUTCFullYear()-3);job.from=d.toISOString().slice(0,10);await write(root+'job',job);
  }
  async function probe(endpoint,params){
   const time=clock(),hold=await read('monitor-v1:provider-hold');if(hold?.until>time)throw new AuditPause(Math.ceil((hold.until-time)/1000));
   const claimed=await env.DB.prepare("INSERT INTO market_history_cache(cache_key,payload,fetched_at) VALUES(?,json_array(?),?) ON CONFLICT(cache_key) DO UPDATE SET payload=json_insert((SELECT json_group_array(value) FROM json_each(market_history_cache.payload) WHERE value>?), '$[#]', ?),fetched_at=? WHERE (SELECT count(*) FROM json_each(market_history_cache.payload) WHERE value>?)<550 RETURNING cache_key").bind('monitor-v1:provider-budget',time,time,time-60000,time,time,time-60000).first();
   if(!claimed)throw new AuditPause(10);
   if(job.calls>=maxNames*2+3)throw new Error('Audit call budget reached');job.calls++;
   const url=new URL('https://financialmodelingprep.com/stable/'+endpoint);for(const[k,v]of Object.entries({...params,apikey:env.FMP_API_KEY}))url.searchParams.set(k,v);
   try{
    const response=await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});
    if(response.status===429){const raw=response.headers.get('Retry-After'),n=Number(raw),seconds=raw&&Number.isFinite(n)?Math.max(1,Math.min(3600,n)):60;await write('monitor-v1:provider-hold',{until:clock()+seconds*1000});throw new AuditPause(seconds);}
    if(!response.ok)return{http:response.status,rows:[]};const rows=await response.json();return{http:200,rows:Array.isArray(rows)?rows:[],invalidShape:!Array.isArray(rows)};
   }catch(error){if(error instanceof AuditPause)throw error;return{http:null,rows:[],unavailable:true};}
  }
  if(job.phase==='quotes'){
   const names=job.names.slice(job.quoteCursor,job.quoteCursor+40);if(names.length){const r=await probe('batch-quote',{symbols:names.join(',')});for(const s of names)job.quotes[s]={usable:false,asOf:null,http:r.http,unavailable:!!r.unavailable};for(const q of r.rows)if(q&&names.includes(q.symbol)){const valid=Number.isFinite(q.timestamp)&&q.timestamp>946684800&&q.timestamp*1000<=now+60000;job.quotes[q.symbol]={usable:q.price>0&&q.previousClose>0&&valid&&exchangeDate(q.timestamp*1000)===job.source.asOf,asOf:valid?exchangeDate(q.timestamp*1000):null,http:r.http,unavailable:false};}job.quoteCursor+=names.length;}
   if(job.quoteCursor===job.names.length)job.phase='records';
  }else if(job.phase==='records'&&job.cursor<job.names.length){
   const symbol=job.names[job.cursor],member=job.members[symbol]||null;job.current||={symbol,member,quote:job.quotes[symbol]||{usable:false,asOf:null}};
   if(!job.current.profile){const r=await probe('profile',{symbol});job.current.profile={http:r.http,unavailable:!!r.unavailable,invalidShape:!!r.invalidShape,evidence:profileEvidence(r.rows,member,symbol)};await write(root+'job',job);}
   const cached=await read('monitor-v1:history:'+symbol);let rows,historySource,http=200,unavailable=false,invalidShape=false;
   if(cached?.until>=job.source.asOf&&Array.isArray(cached.rows)){rows=cached.rows.filter(r=>r[0]>=job.from&&r[0]<=job.source.asOf).map(r=>({date:r[0],close:r[4],volume:r[5]}));historySource='existing-history-cache';}
   else{const r=await probe('historical-price-eod/full',{symbol,from:job.from,to:job.source.asOf});rows=r.rows.filter(r=>!validDate(r?.date)||r.date>=job.from&&r.date<=job.source.asOf);historySource='three-year-probe';http=r.http;unavailable=!!r.unavailable;invalidShape=!!r.invalidShape;}
   const calendar=(await read('monitor-v1:reference-close:^GSPC'))?.rows||[],proxy=sectorProxy(member?.sector||job.current.profile.evidence.canonicalSector),sector=proxy?(await read('monitor-v1:reference-close:'+proxy))?.rows||[]:[];
   job.current.history={http,unavailable,invalidShape,source:historySource,scopeFrom:job.from,scopeTo:job.source.asOf,evidence:historyEvidence(rows,calendar.map(r=>({date:r[0],close:r[1]})),sector.map(r=>({date:r[0],close:r[1]})),job.source.asOf)};
   Object.assign(job.current,diagnoseExclusion(job.current));job.records.push(job.current);delete job.current;job.cursor++;
  }
  if(job.cursor===job.names.length&&job.phase==='records'){
   const counts={};for(const r of job.records)for(const code of r.codes)counts[code]=(counts[code]||0)+1;
   const report={state:'ready',checkedAt:new Date(now).toISOString(),source:job.source,records:job.records,counts,fmpCalls:job.calls,limitations:'Read-only audit of the saved omitted-name set. Three-year history probes test recent data and minimum warmup, not full 2,511-observation lookback availability. Multiple findings can apply to one company. No classifications, membership or chart data were changed.'};
   await write(root+'report',report);job.state='done';await write(root+'job',job);return reply(report);
  }
  await write(root+'job',job);return progress();
 }catch(error){if(error instanceof AuditPause){if(job)await write(root+'job',job);return progress(error.seconds);}return reply({error:'Exclusion audit unavailable. Saved monitor data is unchanged.'},502);}
 finally{if(locked)try{await env.DB.prepare('UPDATE market_history_cache SET fetched_at=0 WHERE cache_key=? AND payload=?').bind(lease,token).run();}catch{}}
}
