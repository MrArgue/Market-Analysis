// Descriptive price-return research, deliberately independent of chart drawing.
export function researchState(row,options={}){
 if(!Number.isFinite(row?.score)||!Number.isFinite(row?.percentile))return null;
 const strength=row.score>=(options.buy??5)?0:row.score<=(options.sell??1)?2:1;
 const extension=row.percentile<=(options.lowerPercentile??5)?0:row.percentile>=(options.upperPercentile??95)?2:1;
 return strength*3+extension;
}
export function median(values){if(!values.length)return null;const s=[...values].sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;}
export function summarizeOutcomes(outcomes){
 const mean=key=>outcomes.length?outcomes.reduce((s,r)=>s+r[key],0)/outcomes.length:null;
 return{n:outcomes.length,median:median(outcomes.map(r=>r.excess)),mean:mean('excess'),stockMedian:median(outcomes.map(r=>r.stock)),winRate:outcomes.length?100*outcomes.filter(r=>r.excess>0).length/outcomes.length:null,medianDownside:median(outcomes.map(r=>r.downside))};
}
export function blockInterval(outcomes,fromIndex,toIndex,horizon){
 const blocks=Array.from({length:Math.floor((toIndex-fromIndex)/horizon)+1},()=>[]);
 for(const r of outcomes)blocks[Math.floor((r.index-fromIndex)/horizon)]?.push(r.excess);
 const occupied=blocks.filter(b=>b.length).length;
 if(occupied<5)return{low:null,high:null,blocks:occupied};
 let seed=92731;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},samples=[];
 for(let trial=0;trial<300;trial++){const values=[];for(let b=0;b<blocks.length;b++)values.push(...blocks[Math.floor(random()*blocks.length)]);if(values.length)samples.push(median(values));}
 samples.sort((a,b)=>a-b);return{low:samples[Math.floor(samples.length*.025)]??null,high:samples[Math.min(samples.length-1,Math.floor(samples.length*.975))]??null,blocks:occupied};
}
export function forwardResearch(data,{from,to,horizon=63,mode='episodes'}={}){
 if(![21,63,126,252].includes(horizon)||!['episodes','days'].includes(mode))throw new Error('Invalid research settings');
 const rows=data.rows||[],sectorRows=data.research?.sector||[],sector=new Map(sectorRows.map(r=>[r.date,r])),calendar=data.research?.calendar||sectorRows.map(r=>r.date),sectorIndex=new Map(calendar.map((date,i)=>[date,i]));
 const cells=Array.from({length:9},(_,key)=>({key,days:0,episodes:0,excluded:0,outcomes:[]})),baseline=[];
 const first=rows.findIndex(r=>!from||r.date>=from),last=rows.findLastIndex(r=>!to||r.date<=to);
 function outcome(index){
  const entry=rows[index+1],exit=rows[index+horizon];if(!entry||!exit)return null;
  const se=sector.get(entry.date),sx=sector.get(exit.date);
  if(sectorIndex.get(entry.date)!==sectorIndex.get(rows[index].date)+1)return null;
  if(!(entry.open>0&&exit.close>0&&se?.open>0&&sx?.close>0)||rows.slice(index,index+horizon+1).some(r=>r.provisional))return null;
  // Missing sector sessions must not silently produce a shorter holding period.
  const path=rows.slice(index+1,index+horizon+1),begin=sectorIndex.get(entry.date);
  if(sectorIndex.get(exit.date)-begin!==horizon-1||path.some((r,j)=>r.date!==calendar[begin+j]||!sector.has(r.date)||!(r.low>0)))return null;
  const stock=(exit.close/entry.open-1)*100,relative=(sx.close/se.open-1)*100;
  return{index,date:rows[index].date,entry:entry.date,exit:exit.date,stock,excess:stock-relative,downside:Math.min(0,(Math.min(...path.map(r=>r.low))/entry.open-1)*100)};
 }
 let previous=null;
 for(let i=0;i<rows.length;i++){
  const state=researchState(rows[i],data.options),episode=state!==null&&state!==previous;previous=state;
  if(i<first||i>last||state===null||rows[i].provisional)continue;
  const cell=cells[state];cell.days++;if(episode)cell.episodes++;
  const result=outcome(i);if(result)baseline.push(result);
  if(mode==='episodes'&&!episode)continue;
  if(result)cell.outcomes.push(result);else cell.excluded++;
 }
 for(const cell of cells){Object.assign(cell,summarizeOutcomes(cell.outcomes));cell.interval=first>=0&&last>=first?blockInterval(cell.outcomes,first,last,horizon):{low:null,high:null,blocks:0};cell.sparse=cell.episodes<10||cell.interval.blocks<5;}
 return{cells,baseline:summarizeOutcomes(baseline),current:researchState(rows.at(-1),data.options),currentDate:rows.at(-1)?.date,provisional:!!rows.at(-1)?.provisional,from:first>=0?rows[first].date:null,to:last>=0?rows[last].date:null,horizon,mode,available:!!data.research?.sector?.length};
}
// Wrangler preserves names with this helper inside serialized nested functions.
// The browser module must supply it independently of the Worker bundle scope.
export const forwardMathScript='const __name=(fn)=>fn;\n'+[researchState,median,summarizeOutcomes,blockInterval,forwardResearch].map(fn=>fn.toString()).join('\n')+'\nexport {researchState,forwardResearch};';
