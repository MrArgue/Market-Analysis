import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { chartPage, chartScript } from '../src/chart-page.js';
import * as math from '../src/chart-math.js';
import { sampleHistory } from '../src/sample-data.js';
// Exercise the shipped client handlers against a minimal DOM adapter. Real layout needs browser review.
function harness(clock = Date.now()) {
 class Element {
  constructor() { this.attrs={};this.children=[];this.value='';this.textContent='';this.clientWidth=1100;this.clientHeight=490;this.style={setProperty(){}}; }
  setAttribute(k,v){this.attrs[k]=String(v);} append(...nodes){this.children.push(...nodes);} replaceChildren(){this.children=[];}
  getBoundingClientRect(){return {left:0,width:1100};}
 }
 const nodes=Object.fromEntries([...chartPage.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const periods=[...chartPage.matchAll(/data-period="([^"]+)"/g)].map(m=>Object.assign(new Element(),{dataset:{period:m[1]}}));
 nodes.query.elements={to:{value:''}};
 const data=sampleHistory();let calls=0;
 let tick; const TestDate=class extends Date {static now(){return clock;}};
 const context={Date:TestDate,...math,document:{getElementById:id=>nodes[id],querySelectorAll:()=>periods,createElement:()=>new Element(),createElementNS:()=>new Element()},location:{search:''},window:{addEventListener(){},setInterval(fn){tick=fn;}},URLSearchParams,FormData:class { *[Symbol.iterator](){yield ['symbol','SAMPLE'];} },fetch:async()=>{calls++;return{ok:true,json:async()=>data};},console};
 vm.runInNewContext(chartScript.replace(/^import[^\n]+\n/m,''),context);
 return {nodes,periods,data,advance(time){clock=time;tick?.();},get calls(){return calls;}};
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
test('one-month current-day bars have uniform strokes and evenly spaced distinct positions',async()=>{
 const h=harness(),last=h.data.rows.at(-1);last.provisional=true;last.quoteAsOf=last.date+'T18:52:00Z';
 await h.nodes.query.onsubmit({preventDefault(){}});
 for(const width of [360,1100,1900]) {
  h.nodes.plot.clientWidth=width;
  h.periods.find(b=>b.dataset.period==='1M').onclick();
  const bars=descendants(h.nodes.chart).filter(n=>n.attrs.class==='ohlc-bar');
  assert.ok(bars.length>3);
  assert.ok(bars.every(b=>b.attrs['stroke-width']==='1.1'));
  const positions=bars.map(b=>Number(/^M([^,]+)/.exec(b.attrs.d)[1]));
  assert.equal(new Set(positions).size,bars.length);
  const gap=positions[1]-positions[0];
  for(let i=1;i<positions.length;i++) assert.ok(Math.abs(positions[i]-positions[i-1]-gap)<1e-8);
  assert.equal(bars.at(-1).attrs['data-observations'],'1');
 }
});
test('daily change uses latest regular price divided by prior trading close, including losses and zero',async()=>{
 for(const [prior,price,expected,color] of [[100,105,'+5.00%','positive'],[100,97,'-3.00%','negative'],[100,100,'0.00%','']]) {
  const h=harness();h.data.rows.at(-2).close=prior;h.data.rows.at(-1).close=price;
  await h.nodes.query.onsubmit({preventDefault(){}});
  assert.ok(h.nodes['daily-change'].textContent.startsWith(expected));
  assert.equal(h.nodes['daily-change'].attrs.class,'price-change '+color);
 }
});
test('after-hours price is separate, signed and timestamped, and hides automatically at next regular open',async()=>{
 const now=Date.parse('2026-10-28T21:42:57Z'),h=harness(now);
 h.data.extendedHours={state:'available',price:344.91,changePercent:-.05,session:'after-hours',asOf:'2026-10-28T21:42:50Z'};
 await h.nodes.query.onsubmit({preventDefault(){}});
 assert.equal(h.nodes['extended-quote'].hidden,false);assert.equal(h.nodes['extended-label'].textContent,'After-hours');assert.equal(h.nodes['extended-price'].textContent,'344.91');assert.equal(h.nodes['extended-change'].textContent,'-0.05%');assert.match(h.nodes['extended-time'].textContent,/5:42:50 PM EDT/);
 h.advance(Date.parse('2026-10-29T13:30:00Z'));assert.equal(h.nodes['extended-quote'].hidden,true);
});
test('regular hours never show extended price even if response contains one; unavailable quotes stay hidden',async()=>{
 const h=harness(Date.parse('2026-10-28T18:00:00Z'));
 h.data.extendedHours={state:'available',price:344.91,changePercent:.05,session:'after-hours',asOf:'2026-10-28T21:42:50Z'};
 await h.nodes.query.onsubmit({preventDefault(){}});assert.equal(h.nodes['extended-quote'].hidden,true);
 h.data.extendedHours={state:'unavailable'};h.advance(Date.parse('2026-10-28T21:43:00Z'));assert.equal(h.nodes['extended-quote'].hidden,true);
});
test('ratio checkbox draws a fractional left axis without changing price scale, indicators or requesting data',async()=>{
 const h=harness();h.data.rows.forEach(r=>r.sectorRatio=.01+r.close/1000);const original=structuredClone(h.data.rows.at(-1));
 await h.nodes.query.onsubmit({preventDefault(){}});
 const ticks=()=>descendants(h.nodes.chart).filter(n=>n.attrs.class==='y-tick').map(n=>n.textContent);
 const priceTicks=ticks();assert.ok(!descendants(h.nodes.chart).some(n=>n.attrs.class==='ratio-line'));
 h.nodes['show-ratio'].checked=true;h.nodes['show-ratio'].onchange();
 const lines=descendants(h.nodes.chart).filter(n=>n.attrs.class==='ratio-line'),ratioTicks=descendants(h.nodes.chart).filter(n=>n.attrs.class==='ratio-tick');assert.equal(lines.length,1);assert.match(lines[0].attrs.d,/C/);assert.ok(ratioTicks.length>2);assert.ok(ratioTicks.some(n=>n.textContent.includes('.')));assert.deepEqual(ticks(),priceTicks);assert.equal(h.calls,1);assert.deepEqual(h.data.rows.at(-1),original);
 h.periods.find(p=>p.dataset.period==='1M').onclick();assert.ok(descendants(h.nodes.chart).some(n=>n.attrs.class==='ratio-line'));
 h.nodes['show-ratio'].checked=false;h.nodes['show-ratio'].onchange();assert.ok(!descendants(h.nodes.chart).some(n=>n.attrs.class==='ratio-line'));assert.equal(h.calls,1);
});
test('score backgrounds increase opacity by thirty percent, from .10 to .13',async()=>{
 const h=harness();await h.nodes.query.onsubmit({preventDefault(){}});const bands=descendants(h.nodes.chart).filter(n=>n.attrs['data-regime']);assert.ok(bands.length>0);assert.ok(bands.every(n=>n.attrs.opacity==='.13'));
});