import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate, methodology, normalize, percentileRanks } from '../src/technical.js';
const date = i => new Date(Date.UTC(2000,0,i+1)).toISOString().slice(0,10);
const bars = values => values.map((close,i)=>({date:date(i),close,volume:10+i}));
const opts={short:2,long:3,lookback:4};
test('OBV starts at zero, adds, subtracts on equal close in workbook mode, with optional conventional mode',()=>{
 const s=bars([10,12,12,11]), b=bars([1,1,1,1]);
 assert.deepEqual(calculate(s,b,b,opts).rows.map(r=>r.obv),[0,11,-1,-14]);
 assert.deepEqual(calculate(s,b,b,{...opts,flat:'unchanged'}).rows.map(r=>r.obv),[0,11,11,-2]);
});
test('six strict comparisons, inclusive windows, complete warmup, and equality scores zero',()=>{
 const s=bars([1,2,3,4]), b=bars([1,1,1,1]), rows=calculate(s,b,b,opts).rows;
 assert.equal(rows[1].score,null);assert.equal(rows[2].score,6);
 assert.deepEqual(rows[2].averages,[[2.5,2],[2.5,2],[17,34/3]]);
 const flat=calculate(b,b,b,{...opts,flat:'unchanged'}).rows;
 assert.equal(flat.at(-1).score,0);assert.equal(flat.at(-1).z,null);
});
test('population z score uses trailing percent distance, available warmup, and no future observations',()=>{
 const s=bars(Array.from({length:40},(_,i)=>10+i+Math.sin(i)*2)), b=bars(Array(40).fill(1));
 const all=calculate(s,b,b,opts).rows;
 for(let i=3;i<all.length;i++){
  const v=all.slice(Math.max(0,i-3),i+1).map(r=>r.distance).filter(x=>x!==null);
  const mean=v.reduce((a,b)=>a+b)/v.length,sd=Math.sqrt(v.reduce((a,b)=>a+(b-mean)**2,0)/v.length);
  assert.ok(Math.abs(all[i].z-(all[i].distance-mean)/sd)<1e-9);
 }
 assert.deepEqual(calculate(s.slice(0,20),b,b,opts).rows,all.slice(0,20));
});
test('aligns benchmark dates, preserves stock OBV on missing benchmark days and propagates missing averages',()=>{
 const s=bars([1,2,3,4,5,6]),b=bars([1,1,1,1,1,1]);b.splice(1,1);
 const result=calculate([...s].reverse(),b,b,opts);
 assert.equal(result.missingBenchmarkDates,1);assert.equal(result.rows[1].sectorRatio,null);
 assert.equal(result.rows[3].score,null);assert.equal(result.rows[4].score,6);assert.equal(result.rows[2].obv,23);
});
test('rejects bad dates, duplicates, zero denominators, missing volume and invalid settings',()=>{
 for(const rows of [[{date:'2020-02-30',close:1}],[...bars([1]),...bars([2])],bars([0])])assert.throws(()=>normalize(rows));
 assert.throws(()=>normalize([{date:date(0),close:2}],true));
 for(const input of [{short:201},{sigma:0},{sell:5,buy:4},{flat:'mystery'},{lookback:1}])assert.throws(()=>methodology(input));
});

test('prior-only empirical ranks expire old valid observations and ignore missing values',()=>{
 const r=percentileRanks([1,2,3,4,2.5],3,2);assert.deepEqual(r.slice(0,2).map(r=>r.percentile),[null,null]);assert.equal(r[2].percentile,100);assert.equal(r[3].percentile,100);assert.ok(Math.abs(r[4].percentile-100/3)<1e-10);assert.equal(r[4].sample,3);
 const gaps=percentileRanks([1,null,2,NaN,3,undefined,4],3,2);assert.equal(gaps[4].percentile,100);assert.equal(gaps[6].sample,3);assert.equal(gaps[3].percentile,null);
});
test('midrank ties keep flat or numerically indistinguishable distances at the 50th percentile',()=>{
 assert.deepEqual(percentileRanks([5,5,5,5,5],3,2).slice(2).map(r=>r.percentile),[50,50,50]);assert.equal(percentileRanks([0,1e-13,-1e-13,0],3,2).at(-1).percentile,50);
});
test('default percentile settings are configurable, bounded, and require a useful prior sample',()=>{
 const d=methodology();assert.equal(d.lookback,2511);assert.equal(d.minHistory,252);assert.equal(d.lowerPercentile,5);assert.equal(d.upperPercentile,95);assert.equal(methodology({lookback:20}).minHistory,20);
 for(const input of [{lowerPercentile:-1},{lowerPercentile:50},{upperPercentile:50},{upperPercentile:101},{minHistory:1},{minHistory:3000},{minHistory:2.5}])assert.throws(()=>methodology(input));
});
test('signals include the exact 5th/95th percentile boundaries and do not depend on sigma',()=>{
 const prior=Array.from({length:20},(_,i)=>i/100);
 for(const [distance,expected,signal]of [[.185,95,'overbought'],[.005,5,'oversold']]){
  let price=100;const values=[price];for(const d of [...prior,distance]){price*= (1+d)/(1-d);values.push(price);}
  const s=bars(values),b=bars(values.map(()=>1)),options={short:2,long:2,lookback:20,minHistory:20};
  const result=calculate(s,b,b,options).rows,last=result.at(-1);assert.equal(last.percentile,expected);assert.equal(last.signal,signal);assert.equal(last.regime,'strong');assert.ok(result.slice(0,-1).every(r=>r.signal===null));
  assert.equal(calculate(s,b,b,{...options,sigma:9}).rows.at(-1).signal,signal);
 }
});
test('percentile calculation is causal under future appends, with no early flags during warmup',()=>{
 const s=bars(Array.from({length:600},(_,i)=>50+i*.05+Math.sin(i*.21)*4)),b=bars(s.map(()=>1));
 const all=calculate(s,b,b).rows,part=calculate(s.slice(0,480),b,b).rows;assert.deepEqual(part,all.slice(0,480));
 assert.ok(all.filter(r=>r.percentileSample<252).every(r=>r.percentile===null&&r.signal===null));assert.ok(all.some(r=>r.percentile!==null));
 for(let i=0;i<all.length;i++){const row=all[i];if(row.percentile==null)continue;const prior=all.slice(0,i).map(r=>r.distance).filter(Number.isFinite).slice(-2511),eps=1e-12*Math.max(1,Math.abs(row.distance));const below=prior.filter(v=>v<row.distance-eps).length,tied=prior.filter(v=>v>=row.distance-eps&&v<=row.distance+eps).length;assert.ok(Math.abs(row.percentile-100*(below+tied/2)/prior.length)<1e-9);}
});