// Run after npm run build: exercise the actual serialized browser module.
import assert from 'node:assert/strict';
import worker from '../dist/index.js';
const response=await worker.fetch(new Request('https://example.com/forward-math.js'));
assert.equal(response.status,200);
const source=await response.text(),module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const rows=Array.from({length:600},(_,i)=>({date:new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10),open:100+i,close:101+i,low:99+i,score:i%10<5?6:0,percentile:i%7<3?3:97}));
for(const horizon of [21,63,126,252])for(const mode of ['episodes','days']){
 const result=module.forwardResearch({rows,research:{sector:rows.map(r=>({...r,open:50,close:50}))}},{horizon,mode});
 assert.equal(result.cells.length,9);assert.ok(result.cells.some(c=>c.n>0));assert.ok(result.cells.filter(c=>c.n).every(c=>Number.isFinite(c.median)));
}
console.log('Bundled forward research module: all horizons and sampling modes passed');
