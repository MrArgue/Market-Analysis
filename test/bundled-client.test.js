import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('bundled Worker serves self-contained browser helper functions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'market-analysis-bundle-'));
 let source;
 try {
  execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--dry-run','--outdir',dir],{env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:join(dir,'build.log')},stdio:'pipe'});
  source=readFileSync(join(dir,'index.js'),'utf8');
 } finally {rmSync(dir,{recursive:true,force:true});}
 const worker=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const response=await worker.default.fetch(new Request('https://example.com/chart-math.js'));
 const math=await import('data:text/javascript;base64,'+Buffer.from(await response.text()).toString('base64'));
 assert.equal(math.marketSession(Date.parse('2026-10-28T21:42:57Z')),'after-hours');
 assert.equal(math.marketSession(Date.parse('2026-10-28T18:00:00Z')),'regular');
 assert.ok(math.wholeAxis(100,120).ticks.length>0);
 assert.equal(math.aggregateBars([{open:100,high:110,low:90,close:105}],10).bars.length,1);
});