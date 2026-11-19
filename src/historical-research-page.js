import {appNavigation,navigationStyle} from './navigation.js';

export const historicalResearchPage=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Historical Signals · Market Analysis</title>
<style>
:root{font-family:'Albert Sans',Arial,sans-serif;color:#24343a;background:#f6f5ef}*{box-sizing:border-box}body{margin:0}header{background:#1f2b2f;color:#ded2ab;padding:18px 28px;font-size:19px;font-weight:650}header small{font-size:10px;letter-spacing:.15em;margin-left:12px}.research{max-width:1400px;margin:auto;padding:25px 26px}h1{font-size:28px;font-weight:600;margin:3px 0 9px}h2{font-size:18px;margin:0 0 12px}.sub{font-size:12px;color:#667176;line-height:1.7;max-width:1000px}.toolbar{display:flex;gap:14px;align-items:end;flex-wrap:wrap;margin:22px 0}.toolbar label{display:grid;gap:6px;font-size:12px}.toolbar select,.toolbar button{padding:10px;border:1px solid #c6c6ba;border-radius:4px;background:white;color:#24343a}.toolbar button{background:#24343a;color:#fff;cursor:pointer}.toolbar button:disabled{opacity:.5;cursor:wait}.status{font-size:12px;color:#56656a;min-height:20px}.summary{display:flex;gap:18px;flex-wrap:wrap;margin:14px 0}.summary div{background:#fff;border:1px solid #dcded8;padding:14px 18px;min-width:150px}.summary strong{display:block;font-size:21px}.summary small{font-size:11px;color:#667176}.table-card{border:1px solid #dedfd9;background:#fff;margin:18px 0;padding:18px;overflow:auto}.table-card p{font-size:11px;color:#657176}table{width:100%;border-collapse:collapse;font-size:12px;min-width:620px}th,td{padding:10px 9px;border-bottom:1px solid #e8e8e1;text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}thead th{background:#263538;color:#f8efda;font-size:11px}.cell{font-variant-numeric:tabular-nums;font-weight:600}.count{display:block;font-size:10px;color:#7a8588;font-weight:400;margin-top:3px}.caveat{padding:15px 0;color:#6c7676;font-size:12px;line-height:1.8;border-top:1px solid #d9dad3}.empty{padding:36px 0;color:#6c7676;font-size:13px}@media(max-width:700px){header{padding:16px}.research{padding:18px 12px}.toolbar{align-items:stretch}.toolbar label{flex:1;min-width:150px}.table-card{padding:10px}}
${navigationStyle}</style></head><body><header>Market Analysis <small>HISTORICAL RESEARCH</small></header>${appNavigation('research')}
<main class="research"><p class="sub">Russell 1000 proxy · Historical signal outcomes</p><h1>Technical Signals & Forward Returns</h1>
<p class="sub">Do strong scores predict stronger returns? Do overbought stocks behave differently? Explore observed 1-, 3- and 6-month subsequent price returns by signal regime, extreme classification, and their intersection. Every row reflects an eligible historical signal date; statistics are descriptive, not a bias-free trading backtest.</p>
<div class="toolbar"><label>Universe / sector<select id="sector"><option value="ALL">All IWB equity holdings</option></select></label>
<label>Statistic<select id="stat"><option value="average">Average forward return</option><option value="excessAverage">Average excess vs S&amp;P 500</option><option value="winRate">Positive-return frequency</option><option value="excessWinRate">Outperformance frequency</option></select></label>
<button id="refresh" type="button">Build / Refresh Research</button></div>
<div id="status" class="status" role="status" aria-live="polite">Loading saved research…</div>
<div id="headline" class="summary"></div>
<div id="tables"><div class="empty">No saved results yet. Refresh the US Sectors/Industries data, then build historical research here using those cached prices.</div></div>
<details class="caveat" open><summary>Methodology and limitations</summary><p id="limitations">The six technical score comparisons use 50/100-day SMAs; the overbought/oversold percentile uses stock/sector distance from its independent 200-day SMA, ranked against up to 2,511 earlier valid distances. Strong ≥5, weak ≤1; overbought ≥95th and oversold ≤5th percentile. Neutral extremes exclude dates before the percentile is available. Subsequent returns are simple close-to-close price returns. The S&amp;P excess-return measure is the stock's forward percent return minus the index's forward percent return, aligned to the same exact dates. The historical universe is today's IWB holdings, not point-in-time Russell 1000 membership; selection, survivorship and overlapping observations materially limit inference.</p></details></main>
<script type="module" src="/historical-research.js"></script></body></html>`;

export const historicalResearchScript=String.raw`
const el=id=>document.getElementById(id);
let current=null,running=false;
const months=[1,3,6];
const scoreNames=['weak','neutral','strong'],extremeNames=['oversold','neutral','overbought'];
const percent=value=>Number.isFinite(value)?value.toFixed(2)+'%':'—';
const count=value=>Number(value||0).toLocaleString('en-US');
const title={weak:'Weak (0–1)',neutral:'Neutral (2–4)',strong:'Strong (5–6)',oversold:'Oversold (≤5th)',overbought:'Overbought (≥95th)'};
async function api(body){
 const response=await fetch('/api/historical-research?universe=iwb',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Research request failed');return data;
}
function add(parent,tag,value,className){
 const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;parent.append(node);return node;
}
function table(heading,description,dimension,buckets,summary){
 const card=add(el('tables'),'section','');card.className='table-card';
 add(card,'h2',heading);add(card,'p',description);
 const t=add(card,'table',''),thead=add(t,'thead',''),tr=add(thead,'tr','');
 add(tr,'th','Signal condition');for(const m of months)add(tr,'th',m+' month'+(m===1?'':'s'));
 const tbody=add(t,'tbody',''),stat=el('stat').value;
 for(const bucket of buckets){
  const row=add(tbody,'tr',''),name=bucket.split('|').map(x=>title[x]||x).join(' + ');
  add(row,'td',name);
  for(const m of months){const data=summary?.[dimension]?.[bucket+':'+m],cell=add(row,'td','');
   add(cell,'span',percent(data?.[stat]),'cell');
   add(cell,'small',count(stat==='excessAverage'||stat==='excessWinRate'?data?.excessN:data?.n)+' observations · '+count(data?.companies)+' stocks','count');
   cell.title='Overlapping historical observations; not statistically independent';
  }
 }
}
function render(){
 if(!current||current.state!=='ready')return;
 const select=el('sector'),v=select.value,stat=el('stat').value;
 const summary=v==='ALL'?current.totals:current.sectors[v];
 el('tables').replaceChildren();
 const descriptions={average:'Average subsequent stock price return',excessAverage:'Average stock return minus matched S&P 500 price return',winRate:'Fraction of observations with positive stock returns',excessWinRate:'Fraction of observations outperforming the S&P 500'};
 table('Technical Score',descriptions[stat]+' by Tech Score', 'score',scoreNames,summary);
 table('Overbought / Oversold',descriptions[stat]+' by 200-day ratio-distance percentile','extreme',extremeNames,summary);
 table('Combined Conditions','Tech Score × overbought/oversold intersection','cross',scoreNames.flatMap(s=>extremeNames.map(e=>s+'|'+e)),summary);
 const coverage=current.coverage||{},head=el('headline');head.replaceChildren();
 for(const [name,value]of [['Constituents processed',count(coverage.processed)+' / '+count(coverage.expected)],['Missing history',count(coverage.missingHistory)],['Calculation errors',count(coverage.errors)],['First source date',coverage.oldestPriceDate||'—'],['Last source date',coverage.newestPriceDate||'—']]){
  const div=add(head,'div','');add(div,'strong',value);add(div,'small',name);
 }
 el('limitations').textContent=current.limitations||el('limitations').textContent;
 el('status').textContent='Saved research as of '+new Date(current.asOf).toLocaleString()+' · IWB holdings '+current.membershipMonth+' · Historical daily signals are persisted for each analyzed security.';
}
async function load(){try{const data=await api();if(data.state==='ready'){current=data;const sel=el('sector'),keep=sel.value;
 sel.replaceChildren();const option=document.createElement('option');option.value='ALL';option.textContent='All IWB equity holdings';sel.append(option);
 for(const sector of Object.keys(data.sectors||{}).sort()){const opt=document.createElement('option');opt.value=sector;opt.textContent=sector;sel.append(opt);}
 sel.value=[...sel.options].some(o=>o.value===keep)?keep:'ALL';render();
 }else el('status').textContent='No saved historical research yet. Build from the IWB histories cached by the US Sectors/Industries tab.';
 }catch(e){el('status').textContent=e.message;}}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function progress(){
 const response=await fetch('/api/historical-research?universe=iwb&progress=1',{cache:'no-store'});
 if(!response.ok)throw Error('Unable to read saved research progress');
 return response.json();
}
async function resumeRequest(body){
 // Mobile Safari may abandon an individual request while the Worker has
 // successfully saved its checkpoint. Check progress before retrying a step.
 let lastError;
 for(let attempt=0;attempt<5;attempt++){
  try{return await api(body);}catch(error){
   lastError=error;
   if(attempt===4)break;
   el('status').textContent='Connection interrupted. Checking saved progress ('+(attempt+1)+'/4)…';
   await delay(Math.min(1000*2**attempt,8000));
   try{
    const saved=await progress();
    if(saved.state==='ready')return api();
    if(saved.state==='loading'&&saved.id)return saved;
   }catch{}
  }
 }
 throw lastError;
}
async function refresh(){
 if(running)return;running=true;el('refresh').disabled=true;
 let lastDone=-1,stallCount=0;
 try{
  let result=await resumeRequest({action:'start'}),steps=0;
  while(result.state==='loading'){
   const done=result.done??0;
   if(done===lastDone&&!result.waiting)stallCount++;else stallCount=0;
   lastDone=done;
   if(stallCount>12)throw Error('Research paused after repeated interruptions at '+count(done)+' stocks. Progress is saved; press Build / Refresh Research to resume.');
   el('status').textContent=result.waiting?'Another tab is finishing a batch…':'Processing '+count(done)+' / '+count(result.total)+' securities · '+count(result.processed)+' successfully analyzed';
   if(++steps>1600)throw Error('Research paused at the safe step limit. Progress is saved; refresh again to resume.');
   if(result.waiting){await delay(Math.max(2000,(result.retryAfter||2)*1000));result=await resumeRequest({action:'start'});continue;}
   result=await resumeRequest({action:'step',id:result.id});
  }
  await load();
 }catch(e){el('status').textContent=e.message+' · Checkpointed work is retained; press Build / Refresh Research to resume.';}
 finally{running=false;el('refresh').disabled=false;}
}
el('refresh').onclick=refresh;el('stat').onchange=render;el('sector').onchange=render;
load();
`;
