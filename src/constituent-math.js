import {exchangeDate} from './current-quote.js';
import {presetStart} from './chart-math.js';
export const returnColumns=['day','five','mtd','fourWeeks','threeMonths','ytd','year'];
export function baselineDates(benchmark,asOf){
 const dates=benchmark.filter(r=>r.date<asOf).map(r=>r.date).sort();
 const before=date=>dates.filter(d=>d<=date).at(-1)||null;
 const prior=date=>new Date(Date.parse(date+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 return {day:dates.at(-1)||null,five:dates.at(-5)||null,mtd:before(prior(asOf.slice(0,7)+'-01')),fourWeeks:before(new Date(Date.parse(asOf+'T12:00:00Z')-28*86400000).toISOString().slice(0,10)),threeMonths:before(presetStart(asOf,'3M')),ytd:before(prior(asOf.slice(0,4)+'-01-01')),year:before(presetStart(asOf,'1Y'))};
}
export function validQuote(q,symbol,now){
 return q?.symbol===symbol&&[q.price,q.previousClose].every(v=>Number.isFinite(v)&&v>0)&&(symbol==='^GSPC'||(Number.isFinite(q.marketCap)&&q.marketCap>0))&&Number.isInteger(q.timestamp)&&q.timestamp*1000<=now+60000&&q.timestamp>946684800;
}
export function companyWeights(members,quotes){
 const companies=new Map(),units=new Map();let nameFallbacks=0;
 for(const m of members){
  const cik=String(m.cik||'').replace(/^0+/,'');
  const key=cik?'cik:'+cik:'name:'+m.name.trim().toLowerCase();
  if(!cik)nameFallbacks++;
  if(!companies.has(key))companies.set(key,[]);companies.get(key).push(m);
 }
 for(const group of companies.values()){
  const available=group.map(m=>quotes[m.symbol]).filter(q=>q&&q.marketCap>0);
  const cap=available.length?Math.max(...available.map(q=>q.marketCap)):null;
  // Divide total company cap across all listed member classes, including missing classes.
  for(const m of group){const q=quotes[m.symbol];units.set(m.symbol,cap&&q?.price>0?{units:cap/group.length/q.price,cap:cap/group.length}:null);}
 }
 return {units,nameFallbacks,companies:companies.size,multiClass:[...companies.values()].filter(g=>g.length>1).map(g=>g.map(m=>m.symbol))};
}
// Verified against S&P's HONA inclusion announcement and GICS Industrials definition.
export function reviewConstituents(members,quotes,maps,dates){
 const company=m=>String(m.cik||'').replace(/^0+/,'')||m.name.trim().toLowerCase();
 const failures=new Map(),corrections=[];
 const reviewed=members.map(m=>{
  if(m.industry==='Aerospace & Defense'&&m.sector!=='Industrials'){corrections.push({symbol:m.symbol,industry:m.industry,from:m.sector,to:'Industrials'});return {...m,sector:'Industrials'};}
  return m;
 });
 for(const m of reviewed){
  const missing=Object.entries(dates).filter(([key,date])=>key!=='day'&&date&&!maps[m.symbol]?.has(date)).map(([key])=>key);
  if(!quotes[m.symbol]||!maps[m.symbol]?.size||missing.length)failures.set(company(m),!quotes[m.symbol]?'Same-session quote unavailable':missing.length?'Incomplete history for '+missing.join(', '):'Daily history unavailable');
 }
 const excluded=reviewed.filter(m=>failures.has(company(m))).map(m=>({symbol:m.symbol,name:m.name,reason:failures.get(company(m))}));
 const eligible=reviewed.filter(m=>!failures.has(company(m)));
 const industrySectors=new Map();for(const m of eligible){if(!industrySectors.has(m.industry))industrySectors.set(m.industry,new Set());industrySectors.get(m.industry).add(m.sector);}
 const conflicts=[...industrySectors].filter(([,sectors])=>sectors.size>1).map(([industry,sectors])=>({industry,sectors:[...sectors]}));
 return {eligible,excluded,corrections,conflicts};
}
export function buildConstituentTable({members,quotes,histories,benchmark,benchmarkQuote,now,issues=[]}){
 const asOf=exchangeDate(benchmarkQuote.timestamp*1000),dates=baselineDates(benchmark,asOf);
 const memberSymbols=new Set(members.map(m=>m.symbol));
 const freshQuotes=Object.fromEntries(Object.entries(quotes).filter(([s,q])=>memberSymbols.has(s)&&validQuote(q,s,now)&&exchangeDate(q.timestamp*1000)===asOf));
 const universe=members;
 const maps=Object.fromEntries(Object.entries(histories).map(([s,rows])=>[s,new Map(rows.map(r=>[r.date,r.close]))]));
 const review=reviewConstituents(members,freshQuotes,maps,dates);members=review.eligible;
 const weights=companyWeights(members,freshQuotes);
 function aggregate(group){
  const returns={},coverage={};
  const totalCap=group.reduce((n,m)=>n+(weights.units.get(m.symbol)?.cap||0),0);
  for(const key of returnColumns){
   let start=0,end=0,count=0,cap=0;
   for(const m of group){
    const weight=weights.units.get(m.symbol),q=freshQuotes[m.symbol],prices=maps[m.symbol];
    const base=key==='day'?q?.previousClose:prices?.get(dates[key]);
    if(!weight||!q||!(base>0))continue;
    start+=weight.units*base;end+=weight.units*q.price;count++;cap+=weight.cap;
   }
   returns[key]=start>0?(end/start-1)*100:null;
   coverage[key]={included:count,total:group.length,quotedCapitalizationPercent:totalCap?cap/totalCap*100:null};
  }
  return {returns,coverage};
 }
 const groups=[];
 const order=['Industrials','Consumer Cyclical','Technology','Communication Services','Healthcare','Consumer Defensive','Utilities','Real Estate','Financial Services','Energy','Basic Materials'];
 for(const sector of order){
  const group=members.filter(m=>m.sector===sector);if(!group.length)continue;
  const industries=[...new Set(group.map(m=>m.industry))].sort().map(name=>{
   const constituents=group.filter(m=>m.industry===name);
   const stocks=constituents.map(m=>{const q=freshQuotes[m.symbol],prices=maps[m.symbol];return {symbol:m.symbol,name:m.symbol+' · '+m.name,quoteAsOf:new Date(q.timestamp*1000).toISOString(),returns:Object.fromEntries(returnColumns.map(key=>{const base=key==='day'?q.previousClose:prices.get(dates[key]);return [key,base>0?(q.price/base-1)*100:null];}))};}).sort((a,b)=>a.symbol.localeCompare(b.symbol));
   return {name,...aggregate(constituents),stocks};
  });
  groups.push({name:sector,...aggregate(group),industries});
 }
 const benchmarkPrices=new Map(benchmark.map(r=>[r.date,r.close]));
 const benchmarkReturns=Object.fromEntries(returnColumns.map(key=>{const base=key==='day'?benchmarkQuote.previousClose:benchmarkPrices.get(dates[key]);return[key,base>0?(benchmarkQuote.price/base-1)*100:null];}));
 const timestamps=Object.values(freshQuotes).map(q=>q.timestamp);
 const status=`${members.length} eligible of ${universe.length} current member securities · ${members.filter(m=>freshQuotes[m.symbol]).length} same-session quotes · ${groups.reduce((n,g)=>n+g.industries.length,0)} sector/industry groups · Prices as of ${asOf}${issues.length?' · '+issues.length+' data issues (see coverage)':''}`;
 return {state:'ready',groups,benchmark:{name:'S&P 500 · official price index',returns:benchmarkReturns},sourceLabel:'Approximate market-cap-weighted baskets · Monthly S&P 500 membership · Reviewed FMP classifications',status,asOf,baselines:dates,issues,review:{excluded:review.excluded,corrections:review.corrections,conflicts:review.conflicts},coverage:{members:members.length,universe:universe.length,excluded:review.excluded.length,quoted:members.filter(m=>freshQuotes[m.symbol]).length,companies:weights.companies,nameFallbacks:weights.nameFallbacks,multiClass:weights.multiClass,oldestQuote:timestamps.length?new Date(Math.min(...timestamps)*1000).toISOString():null,newestQuote:timestamps.length?new Date(Math.max(...timestamps)*1000).toISOString():null},methodology:'Price returns, excluding dividends. Uses a calendar-month snapshot of S&P membership and FMP sector/industry classifications, not official S&P industry indices. Approximate fixed share units = current allocated company market cap / current price. For each period, return = sum(units × latest price) / sum(units × period-start price) − 1. Period-start prices use common S&P trading dates: 5-Day = five sessions; MTD/YTD = preceding period close; 4-Wk = 28 calendar days; 3M/1-Year = calendar offsets. One-day returns use quote previousClose and regular-session latest price, excluding extended hours. Multiple member share classes share the company cap equally (maximum reported class company cap); this prevents full-cap double counting but is not a float/share-class weight reconstruction. Company CIK identifies issuers, falling back to identical provider company names where CIK is absent. Historical returns use current share estimates and members: survivorship and hindsight bias apply. Companies missing a required period-start price or same-session quote are excluded from all periods, including all member share classes, so the comparison universe is consistent. Aerospace & Defense is assigned to Industrials, correcting the provider mapping. Exclusions and classification corrections are listed below. The S&P 500 benchmark is the actual ^GSPC price series. Top/bottom 20% are ranked per column across industry rows, excluding totals; cutoff ties are included. Membership/classifications and long price histories rebuild once per calendar month. Prices refresh automatically on each visit and manually on request, with up to 60-second quote caching. Completed sessions are added from previous-close quotes; missed dates or detected price-basis changes are repaired with targeted history requests. Expanding industries uses already-loaded stock returns and makes no data requests. Standard NY session timestamps are shown; provider delays may apply.'};
}