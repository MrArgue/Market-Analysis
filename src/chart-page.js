export const chartPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Market Analysis · Technical research</title><style>
@font-face{font-family:Albert Sans;src:url('https://seia.com/dist/assets/albert-sans-latin-variable-normal-Cum7LWcR.woff2') format('woff2');font-weight:100 900;font-display:swap}
@font-face{font-family:Optima nova;src:url('https://seia.com/dist/assets/optima-nova-regular-CmIxL1hz.woff2') format('woff2');font-weight:400;font-display:swap}
:root{--cream:#f0ead5;--gold:#ded2ab;--ink:#1f2b2f;--muted:#6c7474;--line:#dedfd9;--strong:#247957;--weak:#a64c46;font:14px 'Albert Sans',Arial,sans-serif;color:var(--ink);background:#f6f5ef}*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}button,a,input,select,summary{outline-offset:3px}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #977b36}a{color:inherit}.topbar{height:76px;background:var(--ink);color:var(--cream);display:flex;align-items:center;justify-content:space-between;padding:0 30px;border-bottom:3px solid var(--gold)}.brand{font-family:'Optima nova',Optima,Georgia,serif;font-size:25px;letter-spacing:.02em}.brand small{font-family:'Albert Sans',Arial,sans-serif;font-size:10px;letter-spacing:.18em;margin-left:18px;color:var(--gold)}.topbar a{font-size:12px;color:var(--gold);text-decoration:none}.workspace{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:calc(100vh - 76px)}aside{background:#eeeee6;border-right:1px solid #d8d9cf;padding:26px 20px}h1,h2,h3{font-family:'Optima nova',Optima,Georgia,serif;font-weight:400}aside h2{font-size:23px;margin:0 0 22px}.eyebrow{font-size:10px;letter-spacing:.17em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}label{display:grid;gap:6px;font-size:11px;font-weight:600;letter-spacing:.025em;color:#556064;margin-bottom:14px}input,select{height:32px;width:100%;min-width:0;border:1px solid #c8cdc7;border-radius:3px;background:#fff;color:var(--ink);padding:4px 8px;font-size:13px}button{height:31px;cursor:pointer;border:1px solid #c6ccc6;border-radius:3px;padding:4px 11px;background:transparent;color:var(--ink);font-size:12px}button:hover{background:var(--cream)}button:disabled{opacity:.45;cursor:wait}.primary{background:var(--ink);color:var(--cream);border-color:var(--ink);width:100%;margin:3px 0 16px}.primary:hover{background:#35464a}details{border-top:1px solid #d0d4ca;margin-top:10px;padding-top:12px}summary{cursor:pointer;font-size:12px;font-weight:600;list-style-position:outside;margin-left:14px}.method-fields{padding-top:17px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:9px}.pair label{font-size:10px}.method-note{font-size:11px;line-height:1.6;color:var(--muted)}main{min-width:0;padding:25px 28px 30px}.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}h1{font-size:30px;margin:0 0 8px}.subtitle{margin:0;color:var(--muted);font-size:12px}.stats{display:flex;gap:32px;text-align:right}.stat-label{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}.metric{font-size:23px;font-weight:500;font-variant-numeric:tabular-nums}.metric small{font-size:12px;color:var(--muted)}#status{font-size:12px;line-height:1.5;color:#647072;min-height:18px;margin:14px 0}.chart-panel{border:1px solid var(--line);background:white;border-radius:4px;overflow:hidden}.toolbar{background:#fafaf6;border-bottom:1px solid var(--line);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.periods{display:flex;align-items:center;gap:3px;flex-wrap:wrap}.periods button{border:0;font-size:11px;height:27px;padding:3px 8px}.periods button[aria-pressed=true]{background:var(--ink);color:var(--cream)}.view-controls{display:flex;align-items:center;gap:6px}.view-controls input{width:120px;height:28px;font-size:11px}.view-controls button{height:28px}.legend{display:flex;gap:20px;flex-wrap:wrap;padding:12px 18px;font-size:11px;color:var(--muted)}.strong{color:var(--strong)}.weak{color:var(--weak)}#plot{padding:0 8px;overflow:hidden}#chart{display:block;width:100%;height:490px;touch-action:pan-y}svg text{fill:#687579;font:11px 'Albert Sans',Arial,sans-serif}.inspect{border-top:1px solid #edf0e9;margin:0 18px;padding:10px 0;font-size:12px;color:#59676b;font-variant-numeric:tabular-nums;min-height:36px}.navigator{margin:4px 20px 14px}.range-track{position:relative;height:29px;--from:0%;--to:100%}.range-track:before{content:'';position:absolute;top:13px;left:0;right:0;height:4px;border-radius:3px;background:linear-gradient(to right,#e0e4de 0%,#e0e4de var(--from),#9eaa9f var(--from),#9eaa9f var(--to),#e0e4de var(--to),#e0e4de 100%)}.range-track input{appearance:none;-webkit-appearance:none;pointer-events:none;position:absolute;left:0;top:0;width:100%;height:29px;background:transparent;border:0;padding:0;margin:0}.range-track input::-webkit-slider-runnable-track{height:4px;background:transparent}.range-track input::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;pointer-events:auto;width:12px;height:22px;margin-top:-9px;border:1px solid #64716a;border-radius:3px;background:var(--cream);cursor:ew-resize}.range-track input::-moz-range-track{background:transparent}.range-track input::-moz-range-thumb{pointer-events:auto;width:11px;height:21px;border:1px solid #64716a;border-radius:3px;background:var(--cream);cursor:ew-resize}.nav-labels{display:flex;justify-content:space-between;font-size:10px;color:var(--muted)}.chart-footer{padding:0 20px 12px;font-size:10px;color:var(--muted)}.components-panel{margin-top:20px}.components-panel summary{font-weight:400;font-family:'Optima nova',Optima,Georgia,serif;font-size:19px}.tablewrap{overflow-x:auto}table{width:100%;font-size:12px;border-collapse:collapse;margin-top:12px}th,td{text-align:left;border-bottom:1px solid var(--line);padding:10px 12px}th{font-size:10px;font-weight:600;text-transform:uppercase;color:var(--muted)}.empty-note{font-size:13px;color:var(--muted)}@media(min-width:1700px){#chart{height:580px}}@media(max-width:1000px){.workspace{grid-template-columns:215px minmax(0,1fr)}aside{padding:22px 15px}main{padding:20px 16px}.heading{flex-wrap:wrap}.stats{text-align:left;gap:26px}.view-controls{flex-wrap:wrap}#chart{height:440px}}@media(max-width:650px){.topbar{height:65px;padding:0 16px}.brand{font-size:22px}.brand small{display:none}.workspace{display:block}aside{padding:17px;border-right:0;border-bottom:1px solid #cdd3c8}aside h2{font-size:19px;margin-bottom:14px}.base-fields{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.primary{margin-bottom:6px}aside details{margin-top:10px}main{padding:20px 10px}h1{font-size:26px}.stats{gap:25px}.metric{font-size:21px}.toolbar{padding:9px}.view-controls{width:100%;gap:5px}.view-controls input{width:112px}.legend{gap:11px;padding:10px}#chart{height:390px}.navigator{margin:0 12px 12px}.inspect{margin:0 12px;font-size:11px}.periods{gap:1px}.periods button{padding:3px 7px}}
</style></head><body><header class="topbar"><div class="brand">Market Analysis <small>TECHNICAL RESEARCH</small></div><a href="/diagnostics">Connection diagnostics ↗</a></header><div class="workspace"><aside><p class="eyebrow">Research workspace</p><h2>Chart settings</h2><form id="query"><div class="base-fields"><label>Stock ticker<input name="symbol" value="AAPL" required maxlength="20" spellcheck="false"></label><label>Sector index<select name="sector"><option value="">Automatic sector</option><option>Communication Services</option><option>Consumer Discretionary</option><option>Consumer Staples</option><option>Energy</option><option>Financials</option><option>Health Care</option><option>Industrials</option><option>Information Technology</option><option>Materials</option><option>Real Estate</option><option>Utilities</option></select></label><label>S&amp;P 500 index<input name="benchmark" value="^GSPC" required maxlength="20"></label><label>History begins<input name="from" type="date" value="2000-01-01" required></label><label>History ends<input name="to" type="date" required></label></div><button class="primary" id="load">Load chart</button><details><summary>Adjust methodology</summary><div class="method-fields"><div class="pair"><label>Short average<input name="short" type="number" min="2" max="5000" value="50" required></label><label>Long average<input name="long" type="number" min="2" max="5000" value="200" required></label><label>Z-score sample<input name="lookback" type="number" min="2" max="5000" value="2511" required></label><label>Extreme (σ)<input name="sigma" type="number" min="0.1" max="10" step="0.1" value="2" required></label><label>Weak score ≤<input name="sell" type="number" min="0" max="5" value="1" required></label><label>Strong score ≥<input name="buy" type="number" min="1" max="6" value="5" required></label></div><label>Unchanged close<select name="flat"><option value="subtract">Subtract volume</option><option value="unchanged">Leave OBV unchanged</option></select></label><p class="method-note">Averages include the current trading day. The six signals compare stock/sector, stock/S&amp;P 500 and OBV with the short and long averages. Extremes use the population z-score of percentage distance from the sector ratio’s long average.</p></div></details></form></aside><main><div class="heading"><div><p class="eyebrow">Price &amp; relative strength</p><h1 id="chart-title">Technical overview</h1><p class="subtitle" id="benchmark-label">Daily OHLC · S&amp;P 500 sector indices</p></div><div class="stats"><div><div class="stat-label">Latest close</div><div class="metric" id="price">—</div></div><div><div class="stat-label">Technical score</div><div class="metric" id="score">— <small>/ 6</small></div></div><div><div class="stat-label">Sector z-score</div><div class="metric" id="z">—</div></div></div></div><p id="status" role="status" aria-live="polite">Enter a ticker to load its price history.</p><section class="chart-panel" aria-label="Price chart"><div class="toolbar"><div class="periods" aria-label="Chart periods">${['MTD','1M','QTD','3M','6M','YTD','1Y','3Y','5Y','10Y','20Y','ALL'].map(p=>'<button type="button" data-period="'+p+'" aria-pressed="false">'+p+'</button>').join('')}</div><div class="view-controls"><input id="start" type="date" aria-label="View start date"><span>–</span><input id="end" type="date" aria-label="View end date"><button id="range" type="button">Apply</button><button id="zoomIn" type="button" aria-label="Zoom in">+</button><button id="zoomOut" type="button" aria-label="Zoom out">−</button></div></div><div class="legend"><span>OHLC · open left / close right</span><span class="strong">■ Strong score</span><span class="weak">■ Weak score</span><span class="strong">▲ Oversold</span><span class="weak">× Overbought</span></div><div id="plot"><svg id="chart" role="img" aria-label="OHLC prices with technical score backgrounds and extreme markers"><text x="25" y="150">Load history to view the chart</text></svg></div><p id="detail" class="inspect">Point to a bar to inspect open, high, low and close.</p><div class="navigator"><div class="range-track" id="range-track"><input id="range-start" type="range" min="0" max="0" value="0" aria-label="History start"><input id="range-end" type="range" min="0" max="0" value="0" aria-label="History end"></div><div class="nav-labels"><span id="nav-start">Start date</span><span id="nav-end">End date</span></div></div><div class="chart-footer" id="chart-note">Daily observations · View controls preserve the calculation history.</div></section><details class="components-panel"><summary>Six technical components</summary><div class="tablewrap"><table><thead><tr><th>Comparison</th><th id="short-heading">Short average</th><th id="long-heading">Long average</th></tr></thead><tbody id="components"><tr><td colspan="3">Load history to see the latest comparisons.</td></tr></tbody></table></div></details></main></div><script src="/chart.js" type="module"></script></body></html>`;
export const chartScript = String.raw`
import { wholeAxis, presetStart, dateTicks, aggregateBars } from '/chart-math.js';
const $ = id => document.getElementById(id), form = $('query');
form.elements.to.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
let data, start = 0, end = 0, activePeriod = '1Y';
const sampleMode = new URLSearchParams(location.search).get('sample') === '1';
if (sampleMode) { $('load').textContent = 'Load sample'; $('status').textContent = 'SAMPLE DATA — fictional prices for layout review. No live market requests.'; }
const fmt = v => v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
function node(tag, attrs = {}, text) {
 const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
 for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
 if (text !== undefined) n.textContent = text;
 return n;
}
function setPeriod(period) {
 if (!data) return;
 const cutoff = presetStart(data.rows.at(-1).date, period);
 start = cutoff ? data.rows.findIndex(r => r.date >= cutoff) : 0;
 if (start < 0) start = 0;
 end = data.rows.length - 1;
 activePeriod = period;
 draw();
}
function draw() {
 if (!data) return;
 const rows = data.rows, n = rows.length;
 start = Math.max(0, Math.min(start, n - 1));
 end = Math.max(start, Math.min(end, n - 1));
 const view = rows.slice(start, end + 1), svg = $('chart'), width = Math.max(300, $('plot').clientWidth - 16);
 const height = svg.clientHeight || 490, left = 24, right = width - 64, top = 22, bottom = height - 43, span = right - left;
 svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height); svg.replaceChildren();
 const axis = wholeAxis(Math.min(...view.map(r => r.low)), Math.max(...view.map(r => r.high)), Math.floor(height / 65));
 const x = i => left + (i + .5) * span / view.length, y = price => bottom - (price - axis.min) / (axis.max - axis.min) * (bottom - top);
 const clip = node('clipPath', { id: 'price-bounds' });clip.append(node('rect', { x: left, y: top, width: span, height: bottom - top }));
 const defs = node('defs');defs.append(clip);svg.append(defs);
 const plot = node('g', { 'clip-path': 'url(#price-bounds)' });svg.append(plot);
 // Join contiguous regimes instead of making one background element per day.
 let run = 0;
 for (let i = 1; i <= view.length; i++) {
  if (i === view.length || view[i].regime !== view[run].regime) {
   const regime = view[run].regime;
   if (regime === 'strong' || regime === 'weak') plot.append(node('rect', { x: left + run * span / view.length, y: top, width: (i - run) * span / view.length, height: bottom - top, fill: regime === 'strong' ? '#247957' : '#a64c46', opacity: '.10', 'data-regime': regime }));
   run = i;
  }
 }
 for (const price of axis.ticks) {
  const yy = y(price);
  plot.append(node('line', { x1: left, x2: right, y1: yy, y2: yy, stroke: '#e5e8e1', 'stroke-width': 1 }));
  svg.append(node('text', { x: right + 9, y: yy + 4, class: 'y-tick' }, price.toLocaleString('en-US', { maximumFractionDigits: 0 })));
 }
 for (const tick of dateTicks(view, span)) {
  const xx = x(tick.index);
  plot.append(node('line', { x1: xx, x2: xx, y1: top, y2: bottom, stroke: '#eef0eb' }));
  svg.append(node('text', { x: xx, y: bottom + 25, class: 'x-tick', 'text-anchor': tick.index === 0 ? 'start' : tick.index === view.length - 1 ? 'end' : 'middle' }, tick.label));
 }
 const grouped = aggregateBars(view, Math.max(1, Math.floor(span / 4)));
 const tickWidth = Math.max(1, Math.min(4, span / Math.max(1, grouped.bars.length) * .32));
 for (const bar of grouped.bars) {
  const xx = x(bar.index), color = bar.close >= bar.open ? '#24383b' : '#aa5750';
  const path = 'M' + xx + ',' + y(bar.high) + 'V' + y(bar.low) + ' M' + (xx - tickWidth) + ',' + y(bar.open) + 'H' + xx + ' M' + xx + ',' + y(bar.close) + 'H' + (xx + tickWidth);
  plot.append(node('path', { d: path, stroke: color, fill: 'none', 'stroke-width': 1.1, class: 'ohlc-bar', 'data-observations': bar.observations }));
 }
 const lastMarker = { oversold: -99, overbought: -99 };
 view.forEach((r, i) => {
  if (!r.signal || x(i) - lastMarker[r.signal] < 6) return;
  lastMarker[r.signal] = x(i);
  plot.append(node('text', { x: x(i), y: Math.max(top + 12, y(r.high) - 8), 'text-anchor': 'middle', style: 'fill:' + (r.signal === 'oversold' ? '#247957' : '#a64c46'), class: 'extreme-marker' }, r.signal === 'oversold' ? '▲' : '×'));
 });
 $('start').value = view[0].date; $('end').value = view.at(-1).date;
 for (const id of ['range-start', 'range-end']) $(id).max = n - 1;
 $('range-start').value = start; $('range-end').value = end;
 $('range-start').setAttribute('aria-valuetext', rows[start].date);$('range-end').setAttribute('aria-valuetext', rows[end].date);
 // Give either coincident thumb keyboard focus, and the start thumb room to move left.
 $('range-start').style.zIndex = start === end && end === n - 1 ? '3' : '1';
 $('range-track').style.setProperty('--from', (n === 1 ? 0 : start / (n - 1) * 100) + '%');
 $('range-track').style.setProperty('--to', (n === 1 ? 100 : end / (n - 1) * 100) + '%');
 $('nav-start').textContent = view[0].date; $('nav-end').textContent = view.at(-1).date;
 document.querySelectorAll('[data-period]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.period === activePeriod)));
 const last = rows.at(-1);
 $('price').textContent = fmt(last.close); $('score').textContent = fmt(last.score) + ' / 6'; $('z').textContent = fmt(last.z);
 $('chart-title').textContent = data.symbol + ' · Technical overview';
 $('benchmark-label').textContent = data.sectorName + ' · ' + data.sector + ' / ' + data.benchmark;
 $('short-heading').textContent = data.options.short + '-day average';$('long-heading').textContent = data.options.long + '-day average';
 const tbody = $('components');tbody.replaceChildren();
 ['Stock / sector', 'Stock / S&P 500', 'On-balance volume'].forEach((label, j) => {
  const tr = document.createElement('tr');
  [label, ...last.averages[j].map((a, k) => fmt(a) + ' · signal ' + fmt(last.components[j * 2 + k]))].forEach(text => {const td = document.createElement('td');td.textContent = text;tr.append(td);});
  tbody.append(tr);
 });
 $('chart-note').textContent = view.length + ' trading observations · ' + (grouped.size > 1 ? 'Display bars combine up to ' + grouped.size + ' sessions (first open, highest high, lowest low, last close). Signals remain daily.' : 'Daily OHLC bars') + ' · Latest close ' + last.date;
 svg.onpointermove = e => {
  const rect = svg.getBoundingClientRect(), i = Math.max(0, Math.min(view.length - 1, Math.floor(((e.clientX - rect.left) * width / rect.width - left) / span * view.length))), r = view[i];
  $('detail').textContent = r.date + '   O ' + fmt(r.open) + '   H ' + fmt(r.high) + '   L ' + fmt(r.low) + '   C ' + fmt(r.close) + '   · Score ' + fmt(r.score) + ' / 6   · Z ' + fmt(r.z);
 };
}
form.onsubmit = async event => {
 event.preventDefault();$('load').disabled = true;$('status').textContent = 'Loading market history…';
 try {
  let result;
  if (sampleMode) result = (await import('/sample-data.js')).sampleHistory();
  else {
   const response = await fetch('/api/chart?' + new URLSearchParams(new FormData(form)));
   result = await response.json();if (!response.ok) throw new Error(result.error || 'Market request failed.');
  }
  if (!result.rows?.length) throw new Error('No observations in this date range.');
  if (result.rows.some(r => ![r.open, r.high, r.low, r.close].every(Number.isFinite))) throw new Error('The response is missing OHLC prices. Refresh after the updated app has deployed.');
  data = result;setPeriod('1Y');
  $('status').textContent = result.missingBenchmarkDates ? result.missingBenchmarkDates + ' dates have no benchmark observation; affected scores are unavailable.' : 'History loaded · ' + result.rows[0].date + ' to ' + result.rows.at(-1).date;
 } catch (error) { $('status').textContent = error.message + (data ? ' The previous successful chart remains visible.' : ''); }
 finally { $('load').disabled = false; }
};
document.querySelectorAll('[data-period]').forEach(button => button.onclick = () => setPeriod(button.dataset.period));
$('range-start').oninput = () => {if (!data) return;start = Math.min(Number($('range-start').value), end);activePeriod = null;draw();};
$('range-end').oninput = () => {if (!data) return;end = Math.max(Number($('range-end').value), start);activePeriod = null;draw();};
$('range').onclick = () => {
 if (!data) return;
 const a = $('start').value, b = $('end').value, i = data.rows.findIndex(r => r.date >= a), j = data.rows.findLastIndex(r => r.date <= b);
 if (!a || !b || a > b || i < 0 || j < i) { $('detail').textContent = 'Choose a date range containing trading observations.';return; }
 start = i;end = j;activePeriod = null;draw();
};
function zoom(factor) {
 if (!data) return;
 const size = Math.min(data.rows.length, Math.max(1, Math.round((end - start + 1) * factor)));
 start = Math.max(0, end - size + 1);activePeriod = null;draw();
}
$('zoomIn').onclick = () => zoom(.5);$('zoomOut').onclick = () => zoom(2);
window.addEventListener('resize', draw);
`;