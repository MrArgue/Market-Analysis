export const chartPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Market Analysis · Technical chart</title>
<style>
:root{font:16px system-ui,sans-serif;color:#dce7ef;background:#0c1420;color-scheme:dark}*{box-sizing:border-box}body{margin:0}main{max-width:1440px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;gap:20px;align-items:center}h1{font-size:28px;letter-spacing:-1px;margin:8px 0}p{color:#a3b5c8;line-height:1.5}a{color:#85c3ff}.panel{background:#131f30;border:1px solid #2b3a50;border-radius:12px;padding:20px;margin:20px 0}form,.controls{display:flex;flex-wrap:wrap;gap:14px;align-items:end}label{display:grid;gap:7px;font-size:13px;color:#b7c9db}input,select,button{font:inherit;padding:10px;border:1px solid #465a73;border-radius:6px;background:#0c1726;color:#edf5ff}input{width:145px}button{cursor:pointer;background:#235c8c}button:disabled{opacity:.5;cursor:wait}details{width:100%;margin-top:8px}summary{cursor:pointer;padding:10px 0}.settings{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px}.metric{font-size:24px;color:#f5f8fc}#status{min-height:24px}#chart{width:100%;height:auto;display:block;touch-action:pan-y}#plot{overflow:hidden}svg text{fill:#a3b5c8;font-size:12px}.legend{display:flex;flex-wrap:wrap;gap:20px;font-size:13px}.strong{color:#69d8a0}.weak{color:#ff989e}#scrub{width:100%}.stats{display:flex;gap:35px;flex-wrap:wrap}.tablewrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid #2b3a50}#detail{min-height:25px;font-variant-numeric:tabular-nums}@media(max-width:600px){main{padding:12px}.panel{padding:12px}header{display:block}input{width:125px}h1{font-size:24px}}
</style></head><body><main>
<header><div><small>MARKET ANALYSIS / RESEARCH</small><h1>Technical strength, in context.</h1><p>Relative performance and volume · Six signals, one score</p></div><a href="/diagnostics">Connection diagnostics</a></header>
<section class="panel"><form id="query">
<label>Stock ticker<input name="symbol" value="AAPL" required maxlength="20"></label>
<label>Sector benchmark<input name="sector" placeholder="Auto sector ETF" maxlength="20"></label>
<label>S&amp;P 500 symbol<input name="benchmark" value="^GSPC" required maxlength="20"></label>
<label>History begins<input name="from" type="date" value="2000-01-01" required></label>
<label>History ends<input name="to" type="date" required></label><button id="load">Load chart</button>
<details><summary>Adjust methodology</summary><div class="settings">
<label>Short average<input name="short" type="number" min="2" max="5000" value="50" required></label>
<label>Long average<input name="long" type="number" min="2" max="5000" value="200" required></label>
<label>Z-score observations<input name="lookback" type="number" min="2" max="5000" value="2511" required></label>
<label>Extreme threshold (σ)<input name="sigma" type="number" min="0.1" max="10" step="0.1" value="2" required></label>
<label>Weak score ≤<input name="sell" type="number" min="0" max="5" value="1" required></label>
<label>Strong score ≥<input name="buy" type="number" min="1" max="6" value="5" required></label>
<label>Unchanged close<select name="flat"><option value="subtract">Subtract volume (workbook)</option><option value="unchanged">Leave OBV unchanged</option></select></label>
</div></details></form>
<p>Leave the sector blank to select an ETF proxy from the current company profile, or choose a sector index available in your FMP plan. An ETF proxy will produce different ratios from the workbook’s sector index. History dates set the calculation sample; chart dates below only change the view.</p>
<p id="status" role="status" aria-live="polite">Enter symbols and load a chart. No market requests run until you click.</p></section>
<section class="panel"><div class="stats"><div>Stock close<div id="price" class="metric">—</div></div><div>Technical score<div id="score" class="metric">— / 6</div></div><div>Sector distance z-score<div id="z" class="metric">—</div></div></div></section>
<section class="panel"><div class="controls"><label>View from<input id="start" type="date"></label><label>View to<input id="end" type="date"></label><button id="range">Apply range</button><button id="zoomIn">Zoom in</button><button id="zoomOut">Zoom out</button><button id="all">All history</button></div>
<p class="legend"><span class="strong">Green: strong score</span><span class="weak">Red: weak score</span><span class="strong">▲ Oversold</span><span class="weak">× Overbought</span></p>
<div id="plot"><svg id="chart" viewBox="0 0 1100 450" role="img" aria-label="Stock closing prices with technical score backgrounds and extreme markers"><text x="50" y="210">Load history to view the chart</text></svg></div>
<label>Scroll through history<input id="scrub" type="range" min="0" max="0" value="0" aria-label="History position"></label><p id="detail">Point to the chart to inspect a trading day.</p>
</section><section class="panel"><h2>Six components</h2><div class="tablewrap"><table><thead><tr><th>Comparison</th><th>Short average</th><th>Long average</th></tr></thead><tbody id="components"><tr><td colspan="3">Load history to see the latest comparisons.</td></tr></tbody></table></div>
<p>Each comparison is 1 when strictly above its moving average; equality is 0. OBV begins at zero. The sixth signal uses the long average (200 days by default). Z-score uses the percentage distance of stock/sector from its long average, a trailing population standard deviation, and available observations during warm-up. Missing data is unavailable, never a zero score.</p>
<p>Workbook defaults: weak ≤1, strong ≥5, extremes ±2σ. To match the earlier written description, set weak ≤2. Moving averages include the current trading day.</p></section></main><script src="/chart.js" defer></script></body></html>`;

export const chartScript = `
const $ = id => document.getElementById(id), form = $('query');
form.elements.to.value = new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
let data, start=0, count=252;
const fmt = v => v === null || v === undefined ? 'Unavailable' : v.toLocaleString(undefined,{maximumFractionDigits:3});
function node(tag, attrs={}, text) { const n=document.createElementNS('http://www.w3.org/2000/svg',tag); for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n; }
function draw(){
 if(!data)return;const rows=data.rows;count=Math.min(Math.max(count,1),rows.length);start=Math.max(0,Math.min(start,rows.length-count));
 const view=rows.slice(start,start+count), svg=$('chart'),width=Math.max(300,$('plot').clientWidth),right=width-25,span=width-90;svg.setAttribute('viewBox','0 0 '+width+' 450');svg.replaceChildren();
 const min=Math.min(...view.map(r=>r.close))*.97,max=Math.max(...view.map(r=>r.close))*1.03;
 const x=i=>65+i*span/Math.max(1,view.length-1),y=v=>385-(v-min)/(max-min)*350;
 for(let j=0;j<5;j++){const v=min+(max-min)*j/4, yy=y(v);svg.append(node('line',{x1:65,x2:right,y1:yy,y2:yy,stroke:'#29384b'}),node('text',{x:4,y:yy+4},fmt(v)));}
 view.forEach((r,i)=>{if(['strong','weak'].includes(r.regime))svg.append(node('rect',{x:Math.max(65,x(i)-span/2/Math.max(1,view.length-1)),y:35,width:Math.min(right-x(i)+span/2/Math.max(1,view.length-1),span/Math.max(1,view.length-1)+.3),height:350,fill:r.regime==='strong'?'#48be83':'#df5668',opacity:.15}));});
 svg.append(node('path',{d:view.map((r,i)=>(i?'L':'M')+x(i)+','+y(r.close)).join(' '),fill:'none',stroke:'#8fc9ff','stroke-width':2}));
 view.forEach((r,i)=>{if(r.signal)svg.append(node('text',{x:x(i),y:y(r.close)-10,'text-anchor':'middle',style:'fill:'+(r.signal==='oversold'?'#69d8a0':'#ff989e')},r.signal==='oversold'?'▲':'×'));});
 svg.append(node('text',{x:65,y:420},view[0].date),node('text',{x:right,y:420,'text-anchor':'end'},view.at(-1).date));
 $('start').value=view[0].date;$('end').value=view.at(-1).date;$('scrub').max=rows.length-count;$('scrub').value=start;
 const last=rows.at(-1);$('price').textContent=fmt(last.close);$('score').textContent=fmt(last.score)+' / 6';$('z').textContent=fmt(last.z);
 const body=$('components');body.replaceChildren();['Stock / sector','Stock / S&P 500','On-balance volume'].forEach((label,j)=>{const tr=document.createElement('tr');[label,...last.averages[j].map((a,k)=>fmt(a)+' · signal '+fmt(last.components[j*2+k]))].forEach(t=>{const td=document.createElement('td');td.textContent=t;tr.append(td)});body.append(tr)});
 svg.onpointermove=e=>{const b=svg.getBoundingClientRect(),i=Math.max(0,Math.min(view.length-1,Math.round(((e.clientX-b.left)*width/b.width-65)/span*(view.length-1)))),r=view[i];$('detail').textContent=r.date+' · Close '+fmt(r.close)+' · Score '+fmt(r.score)+' / 6 · Z '+fmt(r.z)+' · '+(r.signal||r.regime);};
}
form.onsubmit=async e=>{e.preventDefault();$('load').disabled=true;$('status').textContent='Loading history…';try{const res=await fetch('/api/chart?'+new URLSearchParams(new FormData(form)));const result=await res.json();if(!res.ok)throw new Error(result.error||'Request failed.');if(!result.rows.length)throw new Error('No stock observations in this range.');data=result;count=Math.min(252,data.rows.length);start=data.rows.length-count;draw();$('status').textContent=data.symbol+' / '+data.sector+' / '+data.benchmark+' · '+data.rows.length+' observations · '+data.cacheHits+' cached series · '+data.missingBenchmarkDates+' dates missing benchmarks. Latest observation '+data.rows.at(-1).date+'.';}catch(err){$('status').textContent=err.message+' Any chart still shown is the previous successful result.';}finally{$('load').disabled=false;}};
$('scrub').oninput=()=>{start=Number($('scrub').value);draw()};
function zoom(f){if(!data)return;const end=start+count;count=Math.round(count*f);start=end-count;draw()}
$('zoomIn').onclick=()=>zoom(.5);$('zoomOut').onclick=()=>zoom(2);$('all').onclick=()=>{if(data){start=0;count=data.rows.length;draw()}};
$('range').onclick=()=>{if(!data)return;const a=$('start').value,b=$('end').value;if(!a||!b||a>b){$('detail').textContent='Choose a valid view range.';return;}const i=data.rows.findIndex(r=>r.date>=a),j=data.rows.findLastIndex(r=>r.date<=b);if(i<0||j<i){$('detail').textContent='No observations in this view range.';return;}start=i;count=j-i+1;draw()};
window.addEventListener('resize',()=>draw());
`;
