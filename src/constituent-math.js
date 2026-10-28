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
export function buildConstituentTable({members,quotes,histories,benchmark,benchmarkQuote,now,issues=[]}){
 const asOf=exchangeDate(benchmarkQuote.timestamp*1000),dates=baselineDates(benchmark,asOf);
 const memberSymbols=new Set(members.map(m=>m.symbol));
 const freshQuotes=Object.fromEntries(Object.entries(quotes).filter(([s,q])=>memberSymbols.has(s)&&validQuote(q,s,now)&&exchangeDate(q.timestamp*1000)===asOf));
 const weights=companyWeights(members,freshQuotes),maps=Object.fromEntries(Object.entries(histories).map(([s,rows])=>[s,new Map(rows.map(r=>[r.date,r.close]))]));
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
  const industries=[...new Set(group.map(m=>m.industry))].sort().map(name=>({name,...aggregate(group.filter(m=>m.industry===name))}));
  groups.push({name:sector,...aggregate(group),industries});
 }
 const benchmarkPrices=new Map(benchmark.map(r=>[r.date,r.close]));
 const benchmarkReturns=Object.fromEntries(returnColumns.map(key=>{const base=key==='day'?benchmarkQuote.previousClose:benchmarkPrices.get(dates[key]);return[key,base>0?(benchmarkQuote.price/base-1)*100:null];}));
 const timestamps=Object.values(freshQuotes).map(q=>q.timestamp);
 const status=`${members.length} current member securities · ${Object.keys(freshQuotes).length} same-session quotes · ${groups.reduce((n,g)=>n+g.industries.length,0)} sector/industry groups · Prices as of ${asOf}${issues.length?' · '+issues.length+' data issues (see coverage)':''}`;
 return {state:'ready',groups,benchmark:{name:'S&P 500 · official price index',returns:benchmarkReturns},sourceLabel:'Approximate market-cap-weighted baskets · Current S&P 500 members · FMP classifications',status,asOf,baselines:dates,issues,coverage:{members:members.length,quoted:Object.keys(freshQuotes).length,companies:weights.companies,nameFallbacks:weights.nameFallbacks,multiClass:weights.multiClass,oldestQuote:timestamps.length?new Date(Math.min(...timestamps)*1000).toISOString():null,newestQuote:timestamps.length?new Date(Math.max(...timestamps)*1000).toISOString():null},methodology:'Price returns, excluding dividends. Uses today’s S&P membership and FMP sector/industry classifications, not official S&P industry indices. Approximate fixed share units = current allocated company market cap / current price. For each period, return = sum(units × latest price) / sum(units × period-start price) − 1. Period-start prices use common S&P trading dates: 5-Day = five sessions; MTD/YTD = preceding period close; 4-Wk = 28 calendar days; 3M/1-Year = calendar offsets. One-day returns use quote previousClose and regular-session latest price, excluding extended hours. Multiple member share classes share the company cap equally (maximum reported class company cap); this prevents full-cap double counting but is not a float/share-class weight reconstruction. Company CIK identifies issuers, falling back to identical provider company names where CIK is absent. Historical returns use current share estimates and members: survivorship and hindsight bias apply. Missing quotes or period-start prices are excluded only for the affected cells, whose coverage is shown. The S&P 500 benchmark is the actual ^GSPC price series. Top/bottom 20% are ranked per column across industry rows, excluding totals; cutoff ties are included. Refresh is manual, with up to 60-second quote caching. Standard NY session timestamps are shown; provider delays may apply.'};
}