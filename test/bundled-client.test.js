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
 assert.ok(math.ratioAxis([.1,.2]).ticks.length>0);
 assert.match(math.smoothLine([{x:0,y:1},{x:1,y:2},{x:2,y:1}]),/C/);
 assert.equal(math.aggregateBars([{open:100,high:110,low:90,close:105}],10).bars.length,1);
});import vm from 'node:vm';

test('bundled signature browser model resolves build helpers and financial calculations',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'signature-bundle-'));
 let source;
 try{execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--dry-run','--outdir',dir],{env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:join(dir,'build.log')},stdio:'pipe'});source=readFileSync(join(dir,'index.js'),'utf8');}finally{rmSync(dir,{recursive:true,force:true});}
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const ctx={};vm.runInNewContext(await (await worker.fetch(new Request('https://example.com/signature-model.js'))).text(),ctx);
 const p=ctx.SignatureModel.defaultPosition('2026-10-30');assert.equal(ctx.SignatureModel.protection(p).contracts,200);assert.equal(ctx.SignatureModel.scenarios(p)[0].r,.8);
});
