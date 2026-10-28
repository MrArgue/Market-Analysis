import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { chartPage, chartScript } from '../src/chart-page.js';
import * as math from '../src/chart-math.js';
import { sampleHistory } from '../src/sample-data.js';
// Exercise the shipped client handlers against a minimal DOM adapter. Real layout needs browser review.
function harness() {
 class Element {
  constructor() { this.attrs={};this.children=[];this.value='';this.textContent='';this.clientWidth=1100;this.clientHeight=490;this.style={setProperty(){}}; }
  setAttribute(k,v){this.attrs[k]=String(v);} append(...nodes){this.children.push(...nodes);} replaceChildren(){this.children=[];}
  getBoundingClientRect(){return {left:0,width:1100};}
 }
 const nodes=Object.fromEntries([...chartPage.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const periods=[...chartPage.matchAll(/data-period="([^"]+)"/g)].map(m=>Object.assign(new Element(),{dataset:{period:m[1]}}));
 nodes.query.elements={to:{value:''}};
 const data=sampleHistory();let calls=0;
 const context={...math,document:{getElementById:id=>nodes[id],querySelectorAll:()=>periods,createElement:()=>new Element(),createElementNS:()=>new Element()},location:{search:''},window:{addEventListener(){}},URLSearchParams,FormData:class { *[Symbol.iterator](){yield ['symbol','SAMPLE'];} },fetch:async()=>{calls++;return{ok:true,json:async()=>data};},console};
 vm.runInNewContext(chartScript.replace(/^import[^\n]+\n/m,''),context);
 return {nodes,periods,data,get calls(){return calls;}};
}
const descendants=node=>node.children.flatMap(n=>[n,...descendants(n)]);
test('client presets, independent date handles and date inputs stay synchronized without new data calls',async()=>{
 const h=harness();assert.equal(h.calls,0);await h.nodes.query.onsubmit({preventDefault(){}});assert.equal(h.calls,1);
 for(const button of h.periods){button.onclick();assert.equal(button.attrs['aria-pressed'],'true');assert.ok(descendants(h.nodes.chart).some(n=>n.attrs.class==='ohlc-bar'));}
 const year=h.periods.find(b=>b.dataset.period==='1Y');year.onclick();
 assert.ok(descendants(h.nodes.chart).filter(n=>n.attrs.class==='x-tick').length>2);
 assert.ok(descendants(h.nodes.chart).filter(n=>n.attrs.class==='y-tick').every(n=>/^[\d,]+$/.test(n.textContent)));
 const start=Number(h.nodes['range-start'].value),end=Number(h.nodes['range-end'].value);
 h.nodes['range-start'].value=start+10;h.nodes['range-start'].oninput();assert.equal(Number(h.nodes['range-end'].value),end);
 h.nodes['range-end'].value=end-10;h.nodes['range-end'].oninput();assert.equal(Number(h.nodes['range-start'].value),start+10);
 h.nodes.start.value='2025-01-01';h.nodes.end.value='2025-06-30';h.nodes.range.onclick();assert.equal(h.nodes.start.value,'2025-01-01');assert.equal(h.nodes.end.value,'2025-06-30');
 h.nodes.zoomIn.onclick();h.nodes.zoomOut.onclick();assert.equal(h.calls,1);
 h.nodes.chart.onpointermove({clientX:500});assert.match(h.nodes.detail.textContent,/O .*H .*L .*C /);
});
test('client guards crossed handles and invalid view dates',async()=>{
 const h=harness();await h.nodes.query.onsubmit({preventDefault(){}});
 h.nodes['range-start'].value=99999;h.nodes['range-start'].oninput();assert.equal(Number(h.nodes['range-start'].value),Number(h.nodes['range-end'].value));
 h.nodes['range-end'].value=0;h.nodes['range-end'].oninput();assert.equal(Number(h.nodes['range-start'].value),Number(h.nodes['range-end'].value));
 h.nodes.start.value='2026-01-01';h.nodes.end.value='2025-01-01';h.nodes.range.onclick();assert.match(h.nodes.detail.textContent,/Choose a date range/);
});
test('current-day prices and quote time are clearly marked provisional in the client',async()=>{
 const h=harness(),last=h.data.rows.at(-1);last.provisional=true;last.quoteAsOf=last.date+'T18:52:00Z';h.data.currentDay={state:'included',asOf:last.quoteAsOf};
 await h.nodes.query.onsubmit({preventDefault(){}});
 assert.match(h.nodes['price-label'].textContent,/provisional/);assert.match(h.nodes['chart-note'].textContent,/Current-day bar is provisional.*Quote as of/);assert.match(h.nodes.status.textContent,/indicators are provisional/);
 const bars=descendants(h.nodes.chart).filter(n=>n.attrs.class==='ohlc-bar');assert.equal(bars.at(-1).attrs['data-observations'],'1');
});