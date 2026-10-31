import {defaults} from './technical.js';
import {baselineDates,companyWeights,returnColumns} from './constituent-math.js';
import {sectorAliases,sectorEtfs} from './sectors.js';
export const technicalColumns=[['score','Avg score'],['strong','Strong'],['weak','Weak'],['overbought','Overbought'],['oversold','Oversold'],['above50','Above 50D'],['above200','Above 200D'],['advancing','Advancing'],['declining','Declining'],['high20','20D highs'],['low20','20D lows'],['high63','63D highs'],['low63','63D lows'],['high252','252D highs'],['low252','252D lows']];
export const companyId=m=>String(m.cik||'').replace(/^0+/,'');
export const canonicalSector=s=>sectorAliases[s]||s;
export const sectorProxy=s=>sectorEtfs[canonicalSector(s)];
const average=values=>values.length&&values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0)/values.length:null;
const sum=values=>values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0):null;
// Prepared state excludes the quote's session, so a quote can be overlaid once
// without double-counting today's close, volume, or percentile reference sample.
export function prepareStock(history,sector,market,asOf){
 const calendar=market.filter(r=>r.date<asOf).map(r=>r.date),byDate=new Map(history.filter(r=>r.date<asOf).map(r=>[r.date,r]));
 const sessions=new Set(calendar),rows=history.filter(r=>r.date<asOf&&sessions.has(r.date)),last=rows.at(-1),priorDate=calendar.at(-1);
 const needed=calendar.filter(d=>d>=(rows[0]?.date||asOf));
 const complete=needed.length>0&&needed.every(d=>byDate.has(d));
 const volumeComplete=complete&&rows.every(r=>Number.isFinite(r.volume)&&r.volume>=0);
 // Only the next observation's state is needed. Build distance history in O(n)
 // and sort its reference once, rather than calculate every historical rank.
 const series={sectorRatio:[],marketRatio:[],obv:[]},distanceHistory=[];
 if(complete&&rows.length&&sector.length&&market.length){
  const sectors=new Map(sector.map(r=>[r.date,r.close])),markets=new Map(market.map(r=>[r.date,r.close]));let obv=0,total=0,missing=0;
  for(let i=0;i<rows.length;i++){
   const r=rows[i];if(i)obv+=r.close>rows[i-1].close?(r.volume||0):-(r.volume||0);
   const ratio=sectors.get(r.date)>0?r.close/sectors.get(r.date):null;
   series.sectorRatio.push(ratio);series.marketRatio.push(markets.get(r.date)>0?r.close/markets.get(r.date):null);series.obv.push(obv);
   if(ratio===null)missing++;else total+=ratio;
   if(i>=200){const old=series.sectorRatio[i-200];if(old===null)missing--;else total-=old;}
   if(i>=199&&!missing&&total>0)distanceHistory.push(ratio/(total/200)-1);
  }
 }
 const recent=(key,n)=>series[key].slice(-(n-1));
 const sums={};for(const key of ['sectorRatio','marketRatio','obv'])for(const n of [50,200]){
  const values=recent(key,n);sums[key+n]=values.length===n-1?sum(values):null;
 }
 const prices={};for(const n of [20,50,63,200,252]){
  const dates=calendar.slice(-n),values=dates.map(d=>byDate.get(d)?.close);
  prices[n]={meanPrior:dates.length>=n-1?average(values.slice(-(n-1))):null,high:dates.length===n&&values.every(Number.isFinite)?Math.max(...values):null,low:dates.length===n&&values.every(Number.isFinite)?Math.min(...values):null};
 }
 const distances=distanceHistory.slice(-defaults.lookback).sort((a,b)=>a-b);
 return{asOf,priorDate,previousClose:last?.date===priorDate?last.close:null,previousObv:volumeComplete?series.obv.at(-1)??null:null,volumeComplete,sums,prices,distances};
}
export function liveTechnicals(state,q,sectorQuote,marketQuote){
 const values=Object.fromEntries(technicalColumns.map(([k])=>[k,null]));let percentile=null;
 if(!q||!(q.price>0)||!(q.previousClose>0))return{values,percentile};
 values.advancing=Number(q.price>q.previousClose);values.declining=Number(q.price<q.previousClose);
 if(!state||state.previousClose===null||Math.abs(q.previousClose/state.previousClose-1)>.01)return{values,percentile};
 for(const n of [50,200]){const prior=state.prices[n].meanPrior;if(Number.isFinite(prior))values['above'+n]=Number(q.price>((n-1)*prior+q.price)/n);}
 for(const n of [20,63,252])for(const type of ['high','low']){const threshold=state.prices[n][type];if(Number.isFinite(threshold))values[type+n]=Number(type==='high'?q.price>=threshold:q.price<=threshold);}
 const ratio=sectorQuote?.price>0?q.price/sectorQuote.price:null,marketRatio=marketQuote?.price>0?q.price/marketQuote.price:null;
 const obv=state.volumeComplete&&Number.isFinite(q.volume)&&q.volume>=0&&Number.isFinite(state.previousObv)?state.previousObv+(q.price>q.previousClose?q.volume:-q.volume):null;
 const components=[];let distance=null;
 for(const [key,current]of [['sectorRatio',ratio],['marketRatio',marketRatio],['obv',obv]])for(const n of [50,200]){
  const prior=state.sums[key+n];const mean=Number.isFinite(prior)&&Number.isFinite(current)?(prior+current)/n:null;
  components.push(mean===null?null:Number(current>mean));if(key==='sectorRatio'&&n===200&&mean>0)distance=current/mean-1;
 }
 if(components.every(Number.isFinite)){values.score=components.reduce((a,b)=>a+b,0);values.strong=Number(values.score>=defaults.buy);values.weak=Number(values.score<=defaults.sell);}
 if(Number.isFinite(distance)&&state.distances.length>=defaults.minHistory){
  const tolerance=1e-12*Math.max(1,Math.abs(distance));let below=0,tied=0;
  for(const d of state.distances){if(d<distance-tolerance)below++;else if(d<=distance+tolerance)tied++;}
  percentile=100*(below+tied/2)/state.distances.length;values.overbought=Number(percentile>=defaults.upperPercentile);values.oversold=Number(percentile<=defaults.lowerPercentile);
 }
 return{values,percentile};
}
export function stockRecord(member,history,state,quotes,benchmark,asOf){
 const q=quotes[member.symbol],dates=baselineDates(benchmark,asOf),map=new Map(history.map(r=>[r.date,r.close]));
 const bases=Object.fromEntries(returnColumns.map(k=>[k,k==='day'?q?.previousClose:map.get(dates[k])??null]));
 const technical=liveTechnicals(state,q,quotes[sectorProxy(member.sector)],quotes['^GSPC']);
 return{...member,price:q?.price??null,previousClose:q?.previousClose??null,marketCap:q?.marketCap??null,quoteAsOf:q?new Date(q.timestamp*1000).toISOString():null,bases,technical:technical.values,percentile:technical.percentile};
}
export function aggregateMonitor(records,members,quotes,benchmark,asOf,universe,issues=[]){
 const allCompanies=new Set(members.map(companyId).filter(Boolean)),byCompany=new Map();
 const expectedByCompany=new Map();for(const m of members){const id=companyId(m);if(!expectedByCompany.has(id))expectedByCompany.set(id,[]);expectedByCompany.get(id).push(m);}
 for(const r of records){const id=companyId(r);if(!id)continue;if(!byCompany.has(id))byCompany.set(id,[]);byCompany.get(id).push(r);}
 // Returns retain the consistent, complete-company universe. Technical breadth
 // has a separate denominator per metric and can include short-history stocks.
 const returnEligible=new Set();
 for(const[id,group]of byCompany){const expected=expectedByCompany.get(id);if(group.length===expected.length&&group.every(r=>r.price>0&&(universe==='iwb'?r.marketValue>0&&r.holdingPrice>0:r.marketCap>0)&&returnColumns.every(k=>r.bases[k]>0)))returnEligible.add(id);}
 const weights=universe==='sp500'?companyWeights(records.filter(r=>returnEligible.has(companyId(r))),quotes).units:null;
 function units(r){return universe==='iwb'?(r.marketValue>0&&r.holdingPrice>0?r.marketValue/r.holdingPrice:null):weights.get(r.symbol)?.units??null;}
 function rollup(group,expected){
  const technical={},technicalCoverage={},returns={},coverage={};const ids=new Set(expected.map(companyId).filter(Boolean));
  const companies=new Map();for(const r of group){const id=companyId(r);if(!id)continue;if(!companies.has(id))companies.set(id,[]);companies.get(id).push(r);}
  for(const[key]of technicalColumns){const votes=[];for(const stocks of companies.values()){const values=stocks.map(r=>r.technical[key]).filter(Number.isFinite);if(values.length)votes.push(average(values));}technical[key]=votes.length?average(votes)*(key==='score'?1:100):null;technicalCoverage[key]={included:votes.length,total:ids.size};}
  for(const key of returnColumns){let start=0,end=0,count=0;for(const r of group){const u=units(r);if(!returnEligible.has(companyId(r))||!u||!(r.price>0)||!(r.bases[key]>0))continue;start+=u*r.bases[key];end+=u*r.price;count++;}returns[key]=start>0?(end/start-1)*100:null;coverage[key]={included:count,total:expected.length};}
  return{technical,technicalCoverage,returns,coverage};
 }
 const groups=[];const order=['Industrials','Consumer Discretionary','Information Technology','Communication Services','Health Care','Consumer Staples','Utilities','Real Estate','Financials','Energy','Materials'];
 for(const sector of order){const expected=members.filter(m=>m.sector===sector),group=records.filter(r=>r.sector===sector);if(!expected.length)continue;
  const industries=[...new Set(group.map(r=>r.industry))].sort().map(industry=>{const stocks=group.filter(r=>r.industry===industry),expectedIndustry=members.filter(m=>m.sector===sector&&m.industry===industry);return{name:industry,...rollup(stocks,expectedIndustry),stocks:stocks.map(r=>({symbol:r.symbol,name:r.symbol+' · '+r.name,quoteAsOf:r.quoteAsOf,percentile:r.percentile,technical:r.technical,returns:Object.fromEntries(returnColumns.map(k=>[k,r.price>0&&r.bases[k]>0?(r.price/r.bases[k]-1)*100:null]))})).sort((a,b)=>a.symbol.localeCompare(b.symbol))};});
  groups.push({name:sector,...rollup(group,expected),industries});
 }
 const dates=baselineDates(benchmark,asOf),index=new Map(benchmark.map(r=>[r.date,r.close])),q=quotes['^GSPC'];
 const benchmarkRow={name:'S&P 500 · official price index',returns:Object.fromEntries(returnColumns.map(k=>{const base=k==='day'?q?.previousClose:index.get(dates[k]);return[k,base>0&&q?.price>0?(q.price/base-1)*100:null];}))};
 return{state:'ready',universe,asOf,groups,benchmark:benchmarkRow,overall:{name:(universe==='iwb'?'IWB equities':'S&P 500')+' · company breadth',...rollup(records,members)},sourceLabel:(universe==='iwb'?'IWB equity holdings · Russell 1000 proxy':'S&P 500 membership')+' · Value-weighted returns / Equal-company technical breadth',coverage:{universe:members.length,companies:allCompanies.size,processed:records.length,returnCompanies:returnEligible.size},issues,status:records.length+' / '+members.length+' securities processed · '+allCompanies.size+' identified companies · Prices as of '+asOf+' · Intraday technicals are provisional',methodology:monitorMethodology};
}
export const monitorMethodology='IWB equities are an ETF-holdings proxy for the Russell 1000, not official index membership. Membership/classifications refresh monthly; healthy OHLCV histories persist and receive incremental daily updates. IWB return baskets use issuer holding quantities estimated from market value / issuer price; S&P baskets retain allocated company-cap share estimates. Returns are price returns excluding dividends, use current members and estimated units, and have survivorship/hindsight bias. Incomplete companies are excluded from aggregate returns. Technicals use equal company votes: valid listed share classes are averaged within a CIK company, then companies are averaged directly for each sector/industry. Each indicator has its own valid-company denominator; missing is unavailable, not zero. Stock rows show individual flags. Strong score >=5; weak <=1; stock/sector and stock/S&P ratios and OBV versus 50/200-session means match the Tech Chart. Percentile uses ratio / 200-session mean - 1, the preceding up to 2,511 valid distances (at least 252), midrank ties, overbought >=95th / oversold <=5th. Young sector ETFs shorten available percentile history. Above-MA tests include current regular-session price; 20/63/252-session closing highs/lows compare current price with the preceding N completed closes, ties included. Advancers/decliners use previousClose; unchanged companies remain in the denominator. Technicals are provisional during the regular session; extended-hours trades are excluded. Histories missing sessions or volume reduce technical coverage. Sector and universe roll-ups are computed from company votes, never by averaging industry percentages. Corporate-action price-basis changes trigger targeted history repairs. Industry top/bottom quintiles are descriptive, not investment recommendations.';
