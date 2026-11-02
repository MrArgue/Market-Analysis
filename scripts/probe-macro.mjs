// Opt-in, fixed workload. Never logs credentials, URLs with keys or provider bodies.
import {writeFile} from 'node:fs/promises';
if(!process.argv.includes('--live'))throw Error('Use --live for at most 16 fixed read requests.');
const results=[],checkedAt=new Date().toISOString();
async function probe(label,url,check){try{const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok){results.push({label,http:r.status,status:r.status===429?'inconclusive-rate-limit':'http-failure'});return;}const body=await r.text();results.push({label,http:r.status,...check(body)});}catch{results.push({label,status:'inconclusive-network-or-shape'});}}
for(const series of ['INDPRO','CPIAUCSL']){
 const url=new URL('https://fred.stlouisfed.org/graph/');url.pathname+='fredgraph.csv';url.search=new URLSearchParams({id:series,cosd:'2025-01-01',coed:'2025-12-31'});
 await probe('FRED current CSV '+series,url,text=>{const rows=text.trim().split(/\r?\n/).slice(1).map(s=>s.split(',')),valid=rows.filter(r=>/^2025-\d\d-\d\d$/.test(r[0])&&r[1]!==''&&Number.isFinite(Number(r[1])));return{status:valid.length===12?'current-only-validated':'shape-or-coverage-failure',rows:valid.length,first:valid[0]?.[0],last:valid.at(-1)?.[0],pointInTime:false};});
}
if(!process.env.FRED_API_KEY)results.push({label:'ALFRED as-of observations',status:'blocked-missing-FRED_API_KEY',pointInTime:false});
else for(const series of ['INDPRO','CPIAUCSL','ICSA'])for(const vintage of ['2020-01-15','2020-02-15']){
 const url=new URL('https://api.stlouisfed.org/fred/series/observations');url.search=new URLSearchParams({api_key:process.env.FRED_API_KEY,file_type:'json',series_id:series,realtime_start:vintage,realtime_end:vintage,observation_start:'2019-01-01',observation_end:'2020-02-01',limit:'100'});
 await probe('ALFRED '+series+' as-of '+vintage,url,text=>{const data=JSON.parse(text),rows=data.observations;return{status:Array.isArray(rows)&&rows.length>0&&rows.every(r=>r.realtime_start===vintage&&r.realtime_end===vintage)?'as-of-payload-validated':'shape-failure',rows:rows?.length,first:rows?.[0]?.date,last:rows?.at(-1)?.date,limitation:'As-of payload test does not establish complete revision history or release timestamps.'};});
}
if(!process.env.FMP_API_KEY)results.push({label:'FMP dividend-adjusted ETF history',status:'blocked-missing-FMP_API_KEY',coverageVerified:false});
else for(const symbol of ['SPY','SHV','TLT','GLD','XLK','MTUM']){
 const url=new URL('https://financialmodelingprep.com/stable/historical-price-eod/dividend-adjusted');url.search=new URLSearchParams({apikey:process.env.FMP_API_KEY,symbol,from:'2025-06-01',to:'2025-07-15'});
 await probe('FMP dividend-adjusted '+symbol+' 2025-06-01..2025-07-15',url,text=>{const rows=JSON.parse(text),valid=Array.isArray(rows)?rows.filter(r=>r.symbol===symbol&&r.date>='2025-06-01'&&r.date<='2025-07-15'&&Number.isFinite(r.adjClose)&&r.adjClose>0):[],dates=valid.map(r=>r.date).sort();return{status:valid.length>=28&&valid.length===rows.length&&new Set(dates).size===dates.length?'bounded-fields-validated':'shape-or-coverage-failure',rows:valid.length,first:dates[0],last:dates.at(-1),coverageVerified:false,limitation:'Requires deeper inception/calendar and independent ex-dividend/split reconciliation before total-return certification.'};});
}
const report={checkedAt,maxRequests:14,actualRequests:results.filter(r=>'http'in r||r.status==='inconclusive-network-or-shape').length,results};
await writeFile(new URL('../docs/macro-source-probe.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
