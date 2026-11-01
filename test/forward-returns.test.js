import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {forwardResearch,researchState,blockInterval,forwardMathScript} from '../src/forward-returns.js';
import {forwardScript} from '../src/forward-panel.js';
import {chartPage} from '../src/chart-page.js';
import worker from '../src/index.js';
function fixture(n=400){const rows=Array.from({length:n},(_,i)=>({date:new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10),open:100+i,close:102+i,low:99+i,score:6,percentile:97}));return{symbol:'TEST',options:{buy:5,sell:1,lowerPercentile:5,upperPercentile:95},rows,research:{sector:rows.map(r=>({date:r.date,open:50,close:50}))}};}
test('nine boxes honor exact boundaries, missing readings and methodology overrides',()=>{
 assert.equal(researchState({score:5,percentile:95}),2);assert.equal(researchState({score:1,percentile:5}),6);assert.equal(researchState({score:4,percentile:50}),4);assert.equal(researchState({score:6,percentile:null}),null);assert.equal(researchState({score:4,percentile:90},{buy:4,upperPercentile:90}),2);
});
test('uses next session open through horizonth session close, not the signal close',()=>{
 const d=fixture(),r=forwardResearch(d,{horizon:21});const c=r.cells[2],o=c.outcomes[0];assert.equal(c.n,1);assert.equal(c.days,400);assert.equal(o.entry,d.rows[1].date);assert.equal(o.exit,d.rows[21].date);assert.equal(o.excess,(d.rows[21].close/d.rows[1].open-1)*100);assert.equal(c.medianDownside,(d.rows[1].low/d.rows[1].open-1)*100);assert.equal(c.interval.low,null);
});
test('a visible range filters signals without inventing an episode at its left edge or clipping future outcomes',()=>{
 const d=fixture();d.rows[10].score=0;d.rows[11].score=0;
 let r=forwardResearch(d,{from:d.rows[5].date,to:d.rows[20].date,horizon:21});assert.equal(r.cells[2].episodes,1);assert.equal(r.cells[2].outcomes[0].date,d.rows[12].date);assert.ok(r.cells[2].outcomes[0].exit>r.to);
 r=forwardResearch(d,{from:d.rows[5].date,to:d.rows[9].date,horizon:21});assert.equal(r.cells[2].days,5);assert.equal(r.cells[2].n,0);
});
test('all-days mode counts repeated observations, but episode counts stay separate',()=>{
 const d=fixture(100),r=forwardResearch(d,{horizon:21,mode:'days'});assert.equal(r.cells[2].n,79);assert.equal(r.cells[2].episodes,1);assert.equal(r.cells[2].excluded,21);
});
test('provisional signals and forward prices are excluded; current box still uses latest loaded reading',()=>{
 const d=fixture(25);d.rows.at(-1).provisional=true;d.rows.at(-1).score=0;const r=forwardResearch(d,{horizon:21,mode:'days'});assert.equal(r.current,8);assert.equal(r.provisional,true);assert.equal(r.cells[8].days,0);assert.equal(r.cells[2].n,3);
});
test('missing sector OHLC or stock sessions never silently shorten outcomes',()=>{
 const d=fixture();d.research.sector[1].open=null;assert.equal(forwardResearch(d,{horizon:21}).cells[2].n,0);
 const e=fixture();e.rows.splice(5,1);assert.equal(forwardResearch(e,{horizon:21}).cells[2].n,0);
 const f=fixture();f.research.sector.splice(5,1);assert.equal(forwardResearch(f,{horizon:21}).cells[2].n,0);
});
test('block intervals are deterministic, bounded for constant returns and suppress sparse evidence',()=>{
 const outcomes=Array.from({length:200},(_,index)=>({index,excess:3}));const a=blockInterval(outcomes,0,199,21);assert.equal(a.low,3);assert.equal(a.high,3);assert.deepEqual(a,blockInterval(outcomes,0,199,21));assert.equal(blockInterval(outcomes.slice(0,5),0,199,21).low,null);
});
test('research is collapsed and located between the chart and components, with independent modules',async()=>{
 assert.ok(chartPage.indexOf('id="forward-panel"')>chartPage.indexOf('id="chart"'));assert.ok(chartPage.indexOf('id="forward-panel"')<chartPage.indexOf('Six Technical Components'));assert.doesNotMatch(chartPage,/<details[^>]*id="forward-panel"[^>]* open/);assert.match(chartPage,/src="\/forward.js"/);
 for(const path of ['/forward.js','/forward-math.js'])assert.equal((await worker.fetch(new Request('https://example.com'+path))).status,200);
 assert.ok(forwardMathScript.includes('export {researchState,forwardResearch}'));
});
test('panel follows range changes one-way and controls never fetch or mutate chart inputs',()=>{
 class Element{constructor(){this.children=[];this.dataset={};this.value='';this.textContent='';this.open=false;}append(...n){this.children.push(...n);}replaceChildren(){this.children=[];}setAttribute(k,v){this[k]=v;}}
 const ids=['forward-panel','forward-current','forward-scope','forward-horizon','forward-mode','forward-cells','forward-low','forward-high','forward-status','forward-baseline','forward-detail'];const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));nodes['forward-scope'].value='visible';nodes['forward-horizon'].value='21';nodes['forward-mode'].value='episodes';let listener;
 vm.runInNewContext(forwardScript.replace(/^\n?import[^\n]+\n/,''),{researchState,forwardResearch,document:{getElementById:id=>nodes[id],createElement:()=>new Element()},window:{addEventListener:(name,fn)=>{assert.equal(name,'chart-range');listener=fn;}}});
 const data=fixture(),original=JSON.stringify(data);listener({detail:{data,from:data.rows[0].date,to:data.rows[30].date}});assert.match(nodes['forward-current'].textContent,/Strong \/ Overbought/);assert.equal(nodes['forward-cells'].children.length,0);
 nodes['forward-panel'].open=true;nodes['forward-panel'].ontoggle();assert.equal(nodes['forward-cells'].children.length,3);assert.equal(nodes['forward-cells'].children[0].children[3].children[0].dataset.current,'true');
 nodes['forward-scope'].value='full';nodes['forward-scope'].onchange();assert.equal(JSON.stringify(data),original);
});
