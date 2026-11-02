// Frozen research specification. Changing any rule requires a new version.
export const VERSION = 'macro-growth-inflation-v1';
export const SPEC = Object.freeze({growth:['INDPRO','PAYEMS','W875RX1'],inflation:['CPIAUCSL','PCEPILFE','PPIACO'],warmup:24,window:60,deadband:0.15,maxAgeDays:100});
const day = 86400000;
const dateOK = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const mean = a => a.reduce((s,x)=>s+x,0)/a.length;
export function validateVintage(r) {
 if(!r || !dateOK(r.period) || !dateOK(r.vintage) || !Number.isFinite(r.value) || r.value<=0 || !r.series || !Number.isFinite(Date.parse(r.availableAt)) || !/Z$/.test(r.availableAt)) throw Error('Invalid vintage row');
 // ALFRED is date granular: use no earlier than the following UTC day.
 if(Date.parse(r.availableAt)<Date.parse(r.vintage)+day || r.period>r.vintage) throw Error('Unsafe vintage availability');
 return r;
}
export function asKnown(rows,series,cutoff) {
 const selected=new Map();
 for(const r of rows) {
  validateVintage(r);
  if(r.series!==series || Date.parse(r.availableAt)>Date.parse(cutoff)) continue;
  const old=selected.get(r.period);
  if(!old || r.vintage>old.vintage) selected.set(r.period,r);
  else if(r.vintage===old.vintage && r.value!==old.value) throw Error('Conflicting vintage values');
 }
 return [...selected.values()].sort((a,b)=>a.period.localeCompare(b.period));
}
const monthIndex = d => Number(d.slice(0,4))*12+Number(d.slice(5,7))-1;
function momentum(rows,series,cutoff) {
 const known=asKnown(rows,series,cutoff),tail=known.slice(-7),latest=tail.at(-1);
 if(tail.length<7 || Date.parse(cutoff)-Date.parse(latest.period)>SPEC.maxAgeDays*day || tail.some((r,i)=>i && monthIndex(r.period)!==monthIndex(tail[i-1].period)+1)) return null;
 const current=100*((tail[6].value/tail[3].value)**4-1),prior=100*((tail[3].value/tail[0].value)**4-1);
 return {series,raw:current-prior,currentRate:current,priorRate:prior,period:latest.period,inputs:tail};
}
export function buildRegimes(rows,cutoffs) {
 if(!Array.isArray(rows) || !Array.isArray(cutoffs) || rows.length>100000 || cutoffs.length>1200) throw Error('Research input exceeds limits');
 rows.forEach(validateVintage);
 if(cutoffs.some((s,i)=>!/^\d{4}-\d{2}-\d{2}T23:59:59Z$/.test(s) || !dateOK(s.slice(0,10)) || new Date(Date.parse(s)+1000).getUTCDate()!==1 || (i && monthIndex(s)!==monthIndex(cutoffs[i-1])+1))) throw Error('Use ordered month-end decision cutoffs');
 const history=new Map([...SPEC.growth,...SPEC.inflation].map(s=>[s,[]]));
 return cutoffs.map((cutoff,index)=>{
  const components=[...history.keys()].map(series=>{
   const m=momentum(rows,series,cutoff),h=history.get(series),prior=h.slice(-SPEC.window);
   let z=null;
   if(m && prior.length>=SPEC.warmup){const avg=mean(prior),sd=Math.sqrt(mean(prior.map(x=>(x-avg)**2)));if(sd>1e-10)z=Math.max(-3,Math.min(3,(m.raw-avg)/sd));}
   if(m)h.push(m.raw);
   return {series,...m,z};
  });
  const axis=names=>{const c=components.filter(r=>names.includes(r.series));return c.every(r=>Number.isFinite(r.z))?mean(c.map(r=>r.z)):null;};
  const growth=axis(SPEC.growth),inflation=axis(SPEC.inflation);
  const ready=Number.isFinite(growth)&&Number.isFinite(inflation),transition=ready&&(Math.abs(growth)<=SPEC.deadband||Math.abs(inflation)<=SPEC.deadband);
  const regime=!ready?'unavailable':transition?'transition':growth>0?(inflation>0?'reflation':'goldilocks'):(inflation>0?'stagflation':'slowdown');
  return {version:VERSION,index,cutoff,growth,inflation,regime,components};
 });
}
export const macroModelScript='const __name=fn=>fn;\n'+`const VERSION=${JSON.stringify(VERSION)},SPEC=${JSON.stringify(SPEC)},day=86400000;\n`+
 `const dateOK=${dateOK.toString()},mean=${mean.toString()},monthIndex=${monthIndex.toString()};\n`+[validateVintage,asKnown,momentum,buildRegimes].map(f=>f.toString()).join('\n')+'\nexport {VERSION,SPEC,buildRegimes};';
