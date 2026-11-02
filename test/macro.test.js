import test from 'node:test';
import assert from 'node:assert/strict';
import {asKnown,buildRegimes,VERSION,SPEC,macroModelScript} from '../src/macro-model.js';
import {analyzeReturns,macroReturnScript} from '../src/macro-returns.js';
import {forwardMathScript} from '../src/forward-returns.js';
import worker from '../src/index.js';
const row=(value,vintage='2020-02-01')=>({series:'INDPRO',period:'2020-01-01',vintage,availableAt:new Date(Date.parse(vintage)+86400000).toISOString(),value});
test('release boundary and later revisions cannot leak into earlier decisions',()=>{
 const rows=[row(100),row(900,'2020-03-01')];
 assert.equal(asKnown(rows,'INDPRO','2020-02-01T23:59:59Z').length,0);
 assert.equal(asKnown(rows,'INDPRO','2020-02-02T00:00:00Z')[0].value,100);
 assert.equal(asKnown(rows,'INDPRO','2020-04-01T00:00:00Z')[0].value,900);
 assert.throws(()=>asKnown([{...row(1),availableAt:'2020-02-01T00:00:00Z'}],'INDPRO','2020-03-01'));
 assert.throws(()=>asKnown([row(1),row(2)],'INDPRO','2020-03-01'));
});
function history(){const vintages=[],cutoffs=[];for(let i=0;i<90;i++){const period=new Date(Date.UTC(2010, i,1)).toISOString().slice(0,10),vintage=new Date(Date.UTC(2010,i+1,10)).toISOString().slice(0,10);for(const [j,series]of [...SPEC.growth,...SPEC.inflation].entries())vintages.push({...row(100*Math.exp(.002*i+.02*Math.sin(i/5+j/10)),vintage),series,period});cutoffs.push(new Date(Date.UTC(2010,i+1,0,23,59,59)).toISOString().replace('.000',''));}return{vintages,cutoffs};}
test('prior-only standardization, complete components, stale inputs and gaps',()=>{
 const {vintages,cutoffs}=history(),r=buildRegimes(vintages,cutoffs);assert.equal(r[20].regime,'unavailable');assert.ok(r.slice(35).some(r=>r.regime!=='unavailable'));
 const future={...vintages[0],value:1e6,vintage:'2025-01-01',availableAt:'2025-01-02T00:00:00Z'};
 assert.deepEqual(buildRegimes([...vintages,future],cutoffs),r);
 assert.equal(buildRegimes(vintages.filter(r=>r.series!=='PAYEMS'),cutoffs).at(-1).regime,'unavailable');
 assert.equal(buildRegimes(vintages.filter(r=>r.period<'2013-01-01'),cutoffs).at(-1).regime,'unavailable');
 assert.throws(()=>buildRegimes(vintages,[cutoffs[0],cutoffs[2]]));
});
function returnsFixture(){const calendar=[];for(let i=0;i<1100;i++){const d=new Date(Date.UTC(2020,0,1+i));if(![0,6].includes(d.getUTCDay()))calendar.push(d.toISOString().slice(0,10));}const asset=(symbol,rate,view,benchmark)=>({symbol,view,benchmark,basis:'dividend-split-adjusted',coverageVerified:true,rows:calendar.map((date,i)=>({date,adjClose:100*Math.exp(rate*i)}))});return{asOf:calendar.at(-1),calendar,assets:[asset('SPY',.001,'strategic','SHV'),asset('SHV',.0001),asset('XLK',.002,'tactical','SPY')]};}
const regimes=Array.from({length:24},(_,index)=>({version:VERSION,index,cutoff:new Date(Date.UTC(2020,index+1,0,23,59,59)).toISOString().replace('.000',''),regime:index%2?'reflation':'goldilocks'}));
test('separate horizons and exact next-session/anniversary adjusted-close arithmetic',()=>{
 const d=returnsFixture(),r=analyzeReturns(regimes,d,{view:'strategic',horizon:6}),c=r.cells[0],o=c.outcomes[0];assert.ok(o.entry>'2020-01-31');assert.ok(o.exit>='2020-08-03');assert.ok(o.stock>o.benchmark);assert.equal(o.excess,o.stock-o.benchmark);
 const t=analyzeReturns(regimes,d,{view:'tactical',horizon:1});assert.equal(t.cells[0].symbol,'XLK');assert.equal(t.cells[0].mean,t.cells[0].meanExcess);
 assert.throws(()=>analyzeReturns(regimes,d,{view:'strategic',horizon:1}));
 assert.throws(()=>analyzeReturns([{...regimes[0],version:'other'}],d));
});
test('missing/provisional sessions, uncertified bases and immature horizons are excluded',()=>{
 for(const mutate of [d=>d.assets[0].coverageVerified=false,d=>d.assets[0].rows.splice(30,1),d=>d.assets[0].rows[30].provisional=true]){const d=returnsFixture();mutate(d);const c=analyzeReturns([regimes[0]],d).cells[0];assert.equal(c.n,0);assert.equal(c.excluded,1);assert.equal(c.mean,null);}
 const d=returnsFixture();d.calendar=d.calendar.slice(0,40);d.asOf=d.calendar.at(-1);assert.equal(analyzeReturns([regimes[0]],d).cells[0].exclusions.immature,1);
 const r=analyzeReturns(regimes,returnsFixture());assert.deepEqual(r,analyzeReturns(regimes,returnsFixture()));assert.equal(r.cells[0].interval.low,null);
});
test('occupied-month blocks yield reproducible intervals and sampling modes retain distinct estimands',()=>{
 const d=returnsFixture(),monthly=regimes.map(r=>({...r,regime:'goldilocks'}));
 const all=analyzeReturns(monthly,d,{view:'tactical',horizon:1,mode:'months'}),episodes=analyzeReturns(monthly,d,{view:'tactical',horizon:1,mode:'episodes'});
 assert.equal(all.cells[0].n,24);assert.equal(episodes.cells[0].n,1);assert.equal(all.cells[0].episodes,1);assert.ok(Number.isFinite(all.cells[0].interval.low));assert.equal(episodes.cells[0].interval.low,null);assert.deepEqual(all,analyzeReturns(monthly,d,{view:'tactical',horizon:1,mode:'months'}));
});
test('public routes make no provider calls; diagnostics still fail closed',async()=>{
 for(const path of ['/macro','/macro.js','/macro-model.js','/macro-returns.js']){const r=await worker.fetch(new Request('https://example.com'+path));assert.equal(r.status,200);assert.ok((await r.text()).length>50);assert.equal((await worker.fetch(new Request('https://example.com'+path,{method:'HEAD'}))).body,null);assert.equal((await worker.fetch(new Request('https://example.com'+path,{method:'POST'}))).status,405);}
 assert.equal((await worker.fetch(new Request('https://example.com/api/macro'))).status,503);
 assert.notEqual((await worker.fetch(new Request('https://example.com/diagnostics'))).status,200);
});
test('serialized browser engines execute with equivalent outputs',async()=>{
 const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');const m=await import(uri(macroModelScript)),f=uri(forwardMathScript),r=await import(uri(macroReturnScript.replace("'/macro-model.js'",JSON.stringify(uri(macroModelScript))).replace("'/forward-math.js'",JSON.stringify(f))));const h=history();assert.deepEqual(m.buildRegimes(h.vintages,h.cutoffs),buildRegimes(h.vintages,h.cutoffs));assert.deepEqual(r.analyzeReturns(regimes,returnsFixture()),analyzeReturns(regimes,returnsFixture()));
});
