import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('dry-run bundled macro modules execute independently in browser module scopes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'macro-bundle-'));let source;
 try{execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--dry-run','--outdir',dir],{env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:join(dir,'build.log')},stdio:'pipe'});source=readFileSync(join(dir,'index.js'),'utf8');}finally{rmSync(dir,{recursive:true,force:true});}
 const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),worker=(await import(uri(source))).default,get=async p=>(await worker.fetch(new Request('https://example.com'+p))).text();
 const model=uri(await get('/macro-model.js')),math=uri(await get('/forward-math.js')),m=await import(model),r=await import(uri((await get('/macro-returns.js')).replace("'/macro-model.js'",JSON.stringify(model)).replace("'/forward-math.js'",JSON.stringify(math))));
 const rows=[],cutoffs=[];for(let i=0;i<50;i++){const period=new Date(Date.UTC(2010,i,1)).toISOString().slice(0,10),vintage=new Date(Date.UTC(2010,i+1,10)).toISOString().slice(0,10);for(const series of [...m.SPEC.growth,...m.SPEC.inflation])rows.push({series,period,vintage,availableAt:new Date(Date.parse(vintage)+86400000).toISOString(),value:100+i+Math.sin(i)*2});cutoffs.push(new Date(Date.UTC(2010,i+1,0,23,59,59)).toISOString().replace('.000',''));}
 const regimes=m.buildRegimes(rows,cutoffs);assert.ok(regimes.some(r=>r.growth!==null));
 const calendar=['2010-02-01','2010-08-02'],assets=['SPY','SHV'].map(symbol=>({symbol,view:symbol==='SPY'?'strategic':'cash',benchmark:'SHV',basis:'dividend-split-adjusted',coverageVerified:true,rows:calendar.map((date,i)=>({date,adjClose:100+i*10}))}));
 const results=r.analyzeReturns([{...regimes[0],regime:'goldilocks'}],{asOf:'2020-01-01',calendar,assets});assert.equal(results.cells[0].n,1);assert.ok(results.cells[0].mean>0);
});
