import {calculate,defaults} from './technical.js';

// Calendar-month horizons: first subsequent stock observation on/after the
// anniversary, no more than seven calendar days late. Never use future prices
// to calculate the score observed on the signal date.
export const horizons=[1,3,6];
export const methodologyVersion='historical-signals-v1-50-100-extreme200';
export function monthDate(iso,months){
 const d=new Date(iso+'T12:00:00Z'),day=d.getUTCDate();
 d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
 const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
 d.setUTCDate(Math.min(day,last));
 return d.toISOString().slice(0,10);
}
export function scoreClass(score){return !Number.isInteger(score)?null:score<=defaults.sell?'weak':score>=defaults.buy?'strong':'neutral';}
export function extremeClass(percentile){return !Number.isFinite(percentile)?null:percentile>=defaults.upperPercentile?'overbought':percentile<=defaults.lowerPercentile?'oversold':'neutral';}
export function emptyStat(){return{n:0,sum:0,sq:0,positive:0,excessN:0,excessSum:0,excessPositive:0,companies:0};}
export function accumulate(target,source){for(const k of Object.keys(emptyStat()))target[k]+=source[k]||0;return target;}
export function emptySummary(){return{score:{},extreme:{},cross:{}};}
function push(summary,dimension,bucket,horizon,stockReturn,excess){
 if(!bucket||!Number.isFinite(stockReturn))return;
 const key=bucket+':'+horizon,stat=summary[dimension][key]||=emptyStat();
 stat.n++;stat.sum+=stockReturn;stat.sq+=stockReturn*stockReturn;
 if(stockReturn>0)stat.positive++;
 if(Number.isFinite(excess)){stat.excessN++;stat.excessSum+=excess;if(excess>0)stat.excessPositive++;}
}
export function summarizeSignals(observations){
 const summary=emptySummary(),touched={score:new Set(),extreme:new Set(),cross:new Set()};
 for(const o of observations){
  for(const h of horizons){
   const value=o.returns[h],excess=o.excess[h];if(!Number.isFinite(value))continue;
   const pairs=[['score',o.scoreClass],['extreme',o.extremeClass],['cross',o.scoreClass&&o.extremeClass?o.scoreClass+'|'+o.extremeClass:null]];
   for(const [type,bucket]of pairs){
    if(!bucket)continue;push(summary,type,bucket,h,value,excess);
    touched[type].add(bucket+':'+h);
   }
  }
 }
 for(const type of Object.keys(touched))for(const key of touched[type])summary[type][key].companies=1;
 return summary;
}
export function mergeSummaries(target,source){for(const dimension of Object.keys(target))for(const [key,stat]of Object.entries(source[dimension]||{}))accumulate(target[dimension][key]||=emptyStat(),stat);return target;}
export function publicStat(s){
 return s?{n:s.n,companies:s.companies,average:s.n?s.sum/s.n:null,winRate:s.n?100*s.positive/s.n:null,
  excessAverage:s.excessN?s.excessSum/s.excessN:null,excessWinRate:s.excessN?100*s.excessPositive/s.excessN:null,excessN:s.excessN}:null;
}
export function publicSummary(summary){return Object.fromEntries(Object.entries(summary).map(([dimension,items])=>[dimension,Object.fromEntries(Object.entries(items).map(([key,s])=>[key,publicStat(s)]))]));}
export function analyzeHistory(stock,sector,market){
 const calculated=calculate(stock,sector,market),rows=calculated.rows;
 const marketByDate=new Map(market.map(r=>[r.date,r.close]));
 const observations=[],latest=rows.at(-1)?.date||null;
 function forwardIndex(date){
  let lo=0,hi=rows.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid].date<date)lo=mid+1;else hi=mid;}
  return lo;
 }
 for(let i=0;i<rows.length;i++){
  const r=rows[i],score=scoreClass(r.score),extreme=extremeClass(r.percentile);
  if(!score&&!extreme)continue;
  const returns={},excess={};
  for(const h of horizons){
   const target=monthDate(r.date,h),j=forwardIndex(target),end=rows[j];
   const late=end?(Date.parse(end.date+'T12:00:00Z')-Date.parse(target+'T12:00:00Z'))/86400000:Infinity;
   if(!end||late>7||end.date<=r.date){returns[h]=null;excess[h]=null;continue;}
   const value=100*(end.close/r.close-1);
   const startMarket=marketByDate.get(r.date),endMarket=marketByDate.get(end.date);
   returns[h]=value;
   excess[h]=startMarket>0&&endMarket>0?value-100*(endMarket/startMarket-1):null;
  }
  observations.push({date:r.date,close:r.close,score:r.score,percentile:r.percentile,
    scoreClass:score,extremeClass:extreme,returns,excess});
 }
 return{version:methodologyVersion,firstDate:rows[0]?.date||null,lastDate:latest,
  firstScoreDate:observations.find(r=>r.scoreClass)?.date||null,
  firstExtremeDate:observations.find(r=>r.extremeClass)?.date||null,
  observations,summary:summarizeSignals(observations),totalTradingDays:rows.length,
  missingBenchmarkDates:calculated.missingBenchmarkDates};
}
export function packObservations(observations){
 return observations.map(o=>[o.date,o.close,o.score,o.percentile,o.scoreClass,o.extremeClass,
 ...horizons.map(h=>o.returns[h]),...horizons.map(h=>o.excess[h])]);
}
export function unpackObservations(rows){return rows.map(r=>({
 date:r[0],close:r[1],score:r[2],percentile:r[3],scoreClass:r[4],extremeClass:r[5],
 returns:Object.fromEntries(horizons.map((h,i)=>[h,r[6+i]])),excess:Object.fromEntries(horizons.map((h,i)=>[h,r[9+i]]))
}));}
