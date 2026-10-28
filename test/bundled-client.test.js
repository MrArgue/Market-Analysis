import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
test('bundled Worker serves self-contained browser helper functions',async()=>{
 const built=await build({entryPoints:['src/index.js'],bundle:true,format:'esm',platform:'browser',keepNames:true,write:false});
 const worker=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 const response=await worker.default.fetch(new Request('https://example.com/chart-math.js'));
 const math=await import('data:text/javascript;base64,'+Buffer.from(await response.text()).toString('base64'));
 assert.equal(math.marketSession(Date.parse('2026-10-28T21:42:57Z')),'after-hours');
 assert.equal(math.marketSession(Date.parse('2026-10-28T18:00:00Z')),'regular');
 assert.ok(math.wholeAxis(100,120).ticks.length>0);
 assert.equal(math.aggregateBars([{open:100,high:110,low:90,close:105}],10).bars.length,1);
});