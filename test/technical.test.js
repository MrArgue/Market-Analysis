import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate, methodology, normalize } from '../src/technical.js';
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
test('inclusive extreme thresholds and editable score regimes',()=>{
 const s=bars([1,2,3,4]),b=bars([1,1,1,1]);
 const row=calculate(s,b,b,{...opts,sigma:1}).rows.at(-1);
 assert.ok(Math.abs(row.z+1)<1e-9);assert.equal(row.signal,'oversold');assert.equal(row.regime,'strong');
});
