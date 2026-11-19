import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHistory,monthDate,scoreClass,extremeClass,packObservations,unpackObservations,mergeSummaries,emptySummary,publicSummary} from '../src/historical-research-math.js';
const series=n=>{
 const stock=[],sector=[],market=[];let day=new Date('2023-01-02T12:00:00Z');
 while(stock.length<n){if(![0,6].includes(day.getUTCDay())){
  const date=day.toISOString().slice(0,10),i=stock.length,close=85+i*.07+Math.sin(i/17)*5;
  stock.push({date,close,volume:10000+i});
  sector.push({date,close:70+i*.04});market.push({date,close:200+i*.1});
 }day.setUTCDate(day.getUTCDate()+1);}
 return{stock,sector,market};
};
test('one, three and six months are calendar intervals with month-end clamping',()=>{
 assert.equal(monthDate('2024-01-31',1),'2024-02-29');
 assert.equal(monthDate('2025-01-31',1),'2025-02-28');
 assert.equal(monthDate('2024-08-31',6),'2025-02-28');
});
test('classifications distinguish neutral from an unavailable percentile',()=>{
 assert.equal(scoreClass(null),null);assert.equal(scoreClass(1),'weak');assert.equal(scoreClass(2),'neutral');assert.equal(scoreClass(5),'strong');
 assert.equal(extremeClass(null),null);assert.equal(extremeClass(5),'oversold');assert.equal(extremeClass(50),'neutral');assert.equal(extremeClass(95),'overbought');
});
test('full-history scores begin at 100 observations but 200-day extreme percentiles need 252 earlier distances',()=>{
 const {stock,sector,market}=series(750),r=analyzeHistory(stock,sector,market);
 assert.equal(r.firstScoreDate,stock[99].date);
 assert.equal(r.firstExtremeDate,stock[451].date);
 assert.equal(r.observations[0].scoreClass!==null,true);
 assert.equal(r.observations[0].extremeClass,null);
 assert.equal(r.observations.at(-1).returns[6],null);
 assert.deepEqual(unpackObservations(packObservations(r.observations)),r.observations);
});
test('stock observations require the forward anniversary and never use truncated future closes',()=>{
 const {stock,sector,market}=series(650),full=analyzeHistory(stock,sector,market),partial=analyzeHistory(stock.slice(0,520),sector,market);
 assert.deepEqual(partial.observations.map(o=>[o.date,o.score,o.percentile]),
 full.observations.slice(0,partial.observations.length).map(o=>[o.date,o.score,o.percentile]));
 assert.equal(partial.observations.at(-1).returns[1],null);
 assert.equal(partial.observations.at(-1).returns[3],null);
});
test('no silent benchmark forward fill: absolute returns remain valid while excess is null',()=>{
 const {stock,sector,market}=series(550),full=analyzeHistory(stock,sector,market);
 const broken=analyzeHistory(stock,sector,market.filter(r=>r.date!=='2025-01-02'));
 const target=full.observations.find(o=>o.date==='2024-12-02');
 assert.ok(target);
 const affected=broken.observations.find(o=>o.date==='2024-12-02');
 assert.ok(affected);assert.equal(affected.returns[1],target.returns[1]);assert.equal(affected.excess[1],null);
});
test('aggregating two securities preserves event and company denominators separately',()=>{
 const {stock,sector,market}=series(620),a=analyzeHistory(stock,sector,market),b=analyzeHistory(stock,sector,market);
 const total=mergeSummaries(mergeSummaries(emptySummary(),a.summary),b.summary);
 for(const [key,metric]of Object.entries(a.summary.score)){
  assert.equal(total.score[key].n,metric.n*2);
  assert.equal(total.score[key].companies,metric.companies*2);
 }
 assert.ok(Object.values(publicSummary(total).score).every(x=>x.n>0&&x.companies===2));
});
