import {VERSION} from './macro-model.js';
import {median,blockInterval} from './forward-returns.js';
export function analyzeReturns(regimes,dataset,{view='strategic',horizon=6,mode='episodes'}={}) {
 const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
 const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 function anniversary(date,months){const d=new Date(date+'T00:00:00Z'),n=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(n,end));return d.toISOString().slice(0,10);}
 if(!['strategic','tactical'].includes(view)||!(view==='strategic'?[6,12]:[1,3,6]).includes(horizon)||!['episodes','months'].includes(mode)) throw Error('Invalid macro return settings');
 const {calendar,assets,asOf}=dataset;
 if(!validDate(asOf)||!Array.isArray(calendar)||calendar.length>20000||!Array.isArray(assets)||assets.length>40||calendar.some((d,i)=>!validDate(d)||d>asOf||(i&&d<=calendar[i-1])))throw Error('Invalid completed-session calendar');
 const groups=['goldilocks','reflation','stagflation','slowdown','transition'];
 const seen=new Set();
 for(const a of assets){if(!a.symbol||seen.has(a.symbol)||!Array.isArray(a.rows)||a.rows.length>20000)throw Error('Invalid asset history');seen.add(a.symbol);const dates=new Set();for(const r of a.rows){if(!validDate(r.date)||dates.has(r.date))throw Error('Invalid or duplicate asset date');dates.add(r.date);}}
 const maps=new Map(assets.map(a=>[a.symbol,new Map(a.rows.map(r=>[r.date,r]))]));
 const usable=a=>a?.basis==='dividend-split-adjusted'&&a.coverageVerified===true;
 const cells=[];
 for(const asset of assets.filter(a=>a.view===view)) {
  const reference=assets.find(a=>a.symbol===asset.benchmark),eligible=usable(asset)&&usable(reference);
  const outcomes=[],excluded={basis:0,immature:0,missing:0},episodes=new Map(groups.map(g=>[g,0]));
  let previous=null;
  for(const [i,r] of regimes.entries()) {
   if(r.version!==VERSION || (i && r.cutoff<=regimes[i-1].cutoff))throw Error('Mixed or unordered model versions');
   const episode=r.regime!==previous;previous=r.regime;
   if(!groups.includes(r.regime))continue;
   if(episode)episodes.set(r.regime,episodes.get(r.regime)+1);
   if(mode==='episodes'&&!episode)continue;
   const base={index:r.index,date:r.cutoff,regime:r.regime};
   if(!eligible){outcomes.push({...base,reason:'basis'});excluded.basis++;continue;}
   const entry=calendar.findIndex(d=>d>r.cutoff.slice(0,10)),target=entry<0?null:anniversary(calendar[entry],horizon),exit=target?calendar.findIndex((d,j)=>j>entry&&d>=target):-1;
   if(entry<0||exit<0){outcomes.push({...base,reason:'immature'});excluded.immature++;continue;}
   const a=maps.get(asset.symbol),b=maps.get(reference.symbol),path=calendar.slice(entry,exit+1);
   if(path.some(d=>![a.get(d),b.get(d)].every(p=>p&&p.adjClose>0&&Number.isFinite(p.adjClose)&&!p.provisional))){outcomes.push({...base,reason:'missing'});excluded.missing++;continue;}
   const stock=100*(a.get(calendar[exit]).adjClose/a.get(calendar[entry]).adjClose-1),benchmark=100*(b.get(calendar[exit]).adjClose/b.get(calendar[entry]).adjClose-1);
   outcomes.push({...base,entry:calendar[entry],exit:calendar[exit],stock,benchmark,excess:stock-benchmark});
  }
  const summarize=rows=>{const complete=rows.filter(r=>!r.reason),v=complete.map(r=>view==='strategic'?r.stock:r.excess),interval=blockInterval(complete,0,Math.max(0,regimes.length-1),horizon,view==='strategic'?'absolute':'relative');return {n:v.length,excluded:rows.length-v.length,mean:mean(v),median:median(v),meanExcess:mean(complete.map(r=>r.excess)),hitRate:v.length?100*v.filter(x=>x>0).length/v.length:null,interval,sparse:interval.blocks<5||v.length<10};};
  const baseline=summarize(outcomes);
  for(const regime of groups){const rows=outcomes.filter(r=>r.regime===regime);cells.push({symbol:asset.symbol,benchmark:asset.benchmark,regime,...summarize(rows),episodes:episodes.get(regime),baseline,exclusions:Object.fromEntries(['basis','immature','missing'].map(k=>[k,rows.filter(r=>r.reason===k).length])),outcomes:rows});}
 }
 return {version:VERSION,view,horizon,mode,cells,asOf,units:'percentage points',basis:view==='strategic'?'ETF total-return proxy; arithmetic excess over cash ETF':'ETF total-return difference versus benchmark',limitations:['Exploratory conditional returns, not an allocation or a trading strategy.','Intervals use horizon-length calendar blocks; sparse estimates are suppressed below five occupied blocks.','Overlapping outcomes are dependent; no multiple-testing adjustment or significance claims.','ETF inception, survivor selection, benchmark choice and provider adjustments limit inference.','No costs, taxes, FX hedging or implementation model.']};
}
export const macroReturnScript="import {VERSION} from '/macro-model.js';\nimport {median,blockInterval} from '/forward-math.js';\nconst __name=fn=>fn;\n"+analyzeReturns.toString()+'\nexport {analyzeReturns};';
