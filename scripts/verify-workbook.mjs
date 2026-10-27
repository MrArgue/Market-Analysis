import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { calculate } from '../src/technical.js';

const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/verify-workbook.mjs /path/to/workbook.xlsm [python-executable]');
const extracted = spawnSync(process.argv[3] || 'python', [new URL('./extract-workbook.py', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), path], { encoding:'utf8',maxBuffer:20*1024*1024 });
if (extracted.status !== 0) throw new Error('Workbook extraction failed: ' + extracted.stderr);
const fixture = JSON.parse(extracted.stdout);
assert.equal(fixture.sha256, 'c94bc6647d5919d387c3bad74e68b164c658e5958c23b7ca0bd11ed8d8a101f2', 'This audit targets the supplied static workbook revision.');
const result=calculate(fixture.stock,fixture.sector,fixture.market);
const counts={sectorRatio:0,marketRatio:0,score:0,distance:0,z:0};let maxZError=0;
for(let i=0;i<result.rows.length;i++){
 const actual=result.rows[i],expected=fixture.expected[i];
 assert.equal(actual.date,expected.date);
 for(const key of Object.keys(counts)){
  const a=actual[key],e=expected[key];
  if(typeof e!=='number') { assert.equal(a,null,`Expected unavailable ${key} at Sheet1 row ${expected.row}`);continue; }
  assert.ok(a!==null && Math.abs(a-e)<(key==='score'?0.01:1e-7),`${key} differs at Sheet1 row ${expected.row}: ${a} vs ${e}`);
  counts[key]++;if(key==='z')maxZError=Math.max(maxZError,Math.abs(a-e));
 }
}
assert.deepEqual(counts,{sectorRatio:5534,marketRatio:5534,score:5335,distance:5335,z:5334});
console.log(JSON.stringify({workbookSha256:fixture.sha256,counts,maxZError},null,2));
