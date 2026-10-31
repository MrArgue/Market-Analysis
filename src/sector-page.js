import {chartPage} from './chart-page.js';
import {appNavigation} from './navigation.js';
const head=chartPage.slice(0,chartPage.indexOf('</head>')).replace('<title>Market Analysis · Technical research</title>','<title>US Sectors/Industries · Market Analysis</title>');
export const sectorPage=head+`<style>
.sector-main{max-width:1800px;margin:auto;padding:28px}.sector-heading{display:flex;justify-content:space-between;align-items:start;gap:24px;flex-wrap:wrap}.sector-heading h1{margin:0 0 8px}.sector-heading p{margin:0;color:#6c7474;font-size:12px}.sector-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.sector-actions select{max-width:240px}.monitor-view{display:flex;gap:12px;border:1px solid #c8cdc7;border-radius:3px;padding:7px 10px;margin:0;font-size:12px}.monitor-view label{display:flex;align-items:center;gap:5px}.monitor-view input{width:auto;margin:0}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0)}.sector-actions button{background:#1f2b2f;color:#f0ead5}.return-legend{display:flex;gap:18px;flex-wrap:wrap;margin:18px 0;font-size:12px}.return-legend span{padding:4px 8px}.cell-coverage{display:block;font-size:9px;color:#6c7474}.return-best{background:#c9ebd4;color:#155a37}.return-worst{background:#f3cecb;color:#913b35}.sector-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}.technical-grid{grid-template-columns:1fr}.return-legend[hidden]{display:none}.return-card{min-width:0;background:#fff;border:1px solid #dedfd9;border-radius:4px;overflow:hidden}.return-scroll{overflow:auto}.return-table{width:100%;margin:0;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}.return-table th,.return-table td{padding:6px 9px;border-bottom:1px solid #eceee7;white-space:nowrap;text-align:right}.return-table thead th{background:#1f2b2f;color:#f0ead5;font-size:10px;text-transform:none;position:sticky;top:0}.return-table th:first-child{text-align:left;min-width:195px}.return-table tbody th{text-transform:none;font-size:12px}.return-table th:first-child{max-width:260px;white-space:normal}.return-table .sector-total th,.return-table .sector-total td{background:#e5e4d7;font-weight:700;border-top:2px solid #fff}.return-table .industry-name{padding-left:20px;font-weight:400}.return-table .market-total th,.return-table .market-total td{background:#ded2ab;font-weight:700}.industry-toggle{height:23px;min-width:23px;padding:0 4px;margin-right:7px;font-size:13px;border:1px solid #c8cdc7;background:#fafaf6}.return-table .stock th{padding-left:40px;font-size:11px;color:#59676b;font-weight:400}.return-table .stock td{font-size:11px;background:#fafbf8}.stock[hidden]{display:none}.sector-method{font-size:12px;line-height:1.7;color:#6c7474;border-top:1px solid #dedfd9;margin-top:20px;padding-top:14px}.sector-method summary{color:#1f2b2f}.sector-status{font-size:12px;min-height:20px;margin:16px 0;color:#59676b}.empty-table{padding:38px;color:#6c7474;font-size:13px}@media(max-width:1400px){.sector-grid{grid-template-columns:1fr}}@media(max-width:650px){.sector-main{padding:20px 12px}.return-table th,.return-table td{padding:6px}.return-table{font-size:11px}}
</style></head><body><header class="topbar"><div class="brand">Market Analysis <small>TECHNICAL RESEARCH</small></div><a href="/diagnostics">Connection diagnostics ↗</a></header>`+appNavigation('sectors')+`<main class="sector-main"><div class="sector-heading"><div><p class="eyebrow">US equity performance</p><h1>US Sectors/Industries</h1><p id="source-label">Sector and industry returns</p></div><div class="sector-actions"><label for="monitor-universe">Universe</label><select id="monitor-universe"><option value="iwb">IWB · Russell 1000 proxy</option><option value="sp500">S&P 500</option></select><fieldset class="monitor-view"><legend class="sr-only">Display columns</legend><label><input type="radio" name="monitor-view" id="view-returns" value="returns" checked> Returns</label><label><input type="radio" name="monitor-view" id="view-technicals" value="technical"> Technicals</label></fieldset><button id="load-sectors" type="button">Refresh data</button></div></div><p class="sector-status" id="sector-status" role="status" aria-live="polite">Saved data appears first; refreshing the selected universe.</p><div class="return-legend"><span class="return-best">Top 20% of industries</span><span class="return-worst">Bottom 20% of industries</span><span>Ranked separately within each return column</span></div><div id="sector-results" class="sector-grid"><div class="return-card empty-table">Returns will appear here after loading.</div></div><details class="sector-method"><summary>Methodology and data coverage</summary><div id="sector-method"></div></details></main><script type="module" src="/sectors.js"></script></body></html>`;
export const sectorScript=String.raw`
const $=id=>document.getElementById(id);
let manualRefresh=false,view='returns',universe='iwb',latest=null,generation=0,sampleData=null;
const savedReports=new Map();
const phaseLabels={membership:'Reading monthly holdings',quotes:'Updating quotes',references:'Preparing shared benchmarks',stocks:'Preparing stock data',assemble:'Building sector and industry totals',partition:'Organizing sector data','sector-read':'Reading sector data','sector-calculate':'Calculating sector breadth',publish:'Saving the finished monitor',waiting:'Another refresh is running'};
const expandedIndustries=new Set();
const returnColumns=[['day','1-Day'],['five','5-Day'],['mtd','MTD'],['fourWeeks','4-Wk'],['threeMonths','3M'],['ytd','YTD'],['year','1-Year']];
const technicalColumns=[['score','Avg score'],['strong','Strong'],['weak','Weak'],['overbought','Overbought'],['oversold','Oversold'],['above50','Above 50D'],['above200','Above 200D'],['advancing','Advancing'],['declining','Declining'],['high20','20D highs'],['low20','20D lows'],['high63','63D highs'],['low63','63D lows'],['high252','252D highs'],['low252','252D lows']];
let columns=returnColumns;
function element(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function format(value){return Number.isFinite(value)?(value>0?'+':'')+value.toFixed(1)+'%':'—';}
function row(item,type,thresholds){
 const tr=element('tr',undefined,type);const name=element('th',item.name,type==='industry'?'industry-name':'');name.scope='row';tr.append(name);
 for(const [key]of columns){
  const value=(view==='returns'?item.returns:item.technical)?.[key],text=!Number.isFinite(value)?'—':view==='technical'?(key==='score'?value.toFixed(2)+' / 6':type==='stock'?(value?'Yes':'No'):value.toFixed(1)+'%'):format(value),cell=element('td',text),limits=thresholds[key];
  if(view==='technical'&&type==='stock'&&['overbought','oversold'].includes(key)&&Number.isFinite(item.percentile))cell.title='Stock percentile: '+item.percentile.toFixed(2)+'%';
  if(view==='returns'&&type==='industry'&&Number.isFinite(value)&&limits&&limits.low<limits.high){
   if(value>=limits.high){cell.className='return-best';cell.title='Top 20% of industries';}
   else if(value<=limits.low){cell.className='return-worst';cell.title='Bottom 20% of industries';}
  }
  const coverage=(view==='returns'?item.coverage:item.technicalCoverage)?.[key];
  if(view==='technical'&&coverage){cell.title=coverage.included+'/'+coverage.total+' eligible companies; share classes split one company vote';if(coverage.included<coverage.total)cell.append(element('small',coverage.included+'/'+coverage.total,'cell-coverage'));}
  else if(coverage){cell.title=(cell.title?cell.title+' · ':'')+coverage.included+'/'+coverage.total+' member securities; '+(coverage.quotedCapitalizationPercent==null?'unknown':coverage.quotedCapitalizationPercent.toFixed(1)+'%')+' of quoted group market cap';if(coverage.included<coverage.total)cell.append(element('small',' '+coverage.included+'/'+coverage.total,'cell-coverage'));}
  tr.append(cell);
 }
 return tr;
}
function render(data){
 latest=data;columns=view==='returns'?returnColumns:technicalColumns;
 const legend=document.querySelector?.('.return-legend');if(legend)legend.hidden=view==='technical';
 const thresholds={};
 for(const [key]of columns){
  const values=data.groups.flatMap(g=>g.industries.map(i=>i.returns?.[key])).filter(Number.isFinite).sort((a,b)=>a-b);
  if(values.length>=5){const count=Math.max(1,Math.floor(values.length*.2));thresholds[key]={low:values[count-1],high:values[values.length-count]};}
 }
 const results=$('sector-results');results.className='sector-grid'+(view==='technical'?' technical-grid':'');results.replaceChildren();
 let midpoint=data.groups.length;
 if(view==='returns'&&data.groups.length>1){
  const total=data.groups.reduce((n,g)=>n+1+g.industries.length,0);let left=data.benchmark?1:0,best=Infinity;
  for(let i=1;i<data.groups.length;i++){left+=1+data.groups[i-1].industries.length;const difference=Math.abs(left-(total-left+(data.benchmark?1:0)));if(difference<best){best=difference;midpoint=i;}}
 }
 for(const [partIndex,groups]of [data.groups.slice(0,midpoint),data.groups.slice(midpoint)].entries()){
  if(!groups.length)continue;
  const card=element('div',undefined,'return-card'),scroll=element('div',undefined,'return-scroll'),table=element('table',undefined,'return-table'),head=element('thead'),hr=element('tr');
  for(const label of ['Sector / Industry',...columns.map(c=>c[1])]){const th=element('th',label);th.scope='col';hr.append(th);}head.append(hr);table.append(head);
  let body=element('tbody');if(partIndex===0){const top=view==='technical'?data.overall:data.benchmark;if(top)body.append(row(top,'market-total',thresholds));}table.append(body);
  for(const group of groups){
   body=element('tbody');body.append(row(group,'sector-total',thresholds));table.append(body);
   for(const industry of group.industries){
    const block=element('tbody',undefined,'industry-block'),industryRow=row(industry,'industry',thresholds);
    block.append(industryRow);table.append(block);
    if(industry.stocks?.length){
     const key=group.name+'|'+industry.name,toggle=element('button','+','industry-toggle');toggle.type='button';
     const name=industryRow.children[0];name.replaceChildren();name.append(toggle,element('span',industry.name));
     let stockRows=[];
     function update(open){
      toggle.textContent=open?'−':'+';toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',(open?'Hide':'Show')+' stocks in '+industry.name);
      if(open&&!stockRows.length){stockRows=industry.stocks.map(stock=>row(stock,'stock',{}));for(const r of stockRows)block.append(r);}
      for(const r of stockRows)r.hidden=!open;
     }
     toggle.onclick=()=>{const open=!expandedIndustries.has(key);if(open)expandedIndustries.add(key);else expandedIndustries.delete(key);update(open);};
     update(expandedIndustries.has(key));
    }
   }
  }

  scroll.append(table);card.append(scroll);results.append(card);
 }
 $('source-label').textContent=data.sourceLabel;
 $('sector-method').textContent=data.methodology+' Membership month: '+(data.refresh?.membershipMonth||'not recorded')+'. Quote range: '+(data.coverage?.oldestQuote||'unavailable')+' to '+(data.coverage?.newestQuote||'unavailable')+'. Excluded securities: '+(data.review?.excluded?.map(m=>m.symbol+' ('+m.reason+')').join('; ')||'none')+'.';
 $('sector-status').textContent=data.status;
}
function endpoint(){return '/api/monitor?universe='+universe;}
async function requestData(body,current){
 for(let attempt=0;attempt<3;attempt++){
  if(current!==generation)return null;
  let response;try{response=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}catch(error){if(attempt===2)throw new Error('Connection interrupted. Saved progress is retained; press Refresh data to resume.');}
  if(current!==generation)return null;
  const type=response?.headers?.get('Content-Type');
  if(response&&(!type||type.includes('json'))){const data=await response.json();if(!response.ok)throw new Error(data.error||'Monitor unavailable.');return data;}
  if(response&&response.status<500)throw new Error('Server returned an unexpected response. Saved progress is retained.');
  if(attempt===2)throw new Error('Server interrupted the refresh. Saved progress is retained; press Refresh data to resume.');
  $('sector-status').textContent='The server interrupted this step. Retrying saved progress…';await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
 }
}
async function refresh(){
 if(sampleData){render(sampleData);return;}
 manualRefresh=true;const current=++generation,selected=universe,button=$('load-sectors');button.disabled=true;$('sector-status').textContent='Refreshing saved histories and quotes…';
 try{
  let data=await requestData({action:'start'},current);if(!data)return;
  while(data.state==='loading'&&current===generation){
   $('sector-status').textContent=(phaseLabels[data.phase]||'Preparing')+': '+data.loaded+' / '+data.total+' securities. Saved results remain visible.'+(data.retryAfter?' Waiting to stay within the data provider request limit.':'');
   if(data.retryAfter)await new Promise(resolve=>setTimeout(resolve,Math.max(1,data.retryAfter)*1000));
   if(current!==generation)return;
   data=await requestData({action:data.id?'step':'start',...(data.id?{id:data.id}:{})},current);if(!data)return;
  }
  if(current===generation&&selected===universe){savedReports.set(universe,data);render(data);}
 }catch(error){if(current===generation)$('sector-status').textContent=error.message+' Any saved results remain visible.';}
 finally{if(current===generation)button.disabled=false;}
}
$('load-sectors').onclick=refresh;
for(const [id,value]of [['view-returns','returns'],['view-technicals','technical']])if($(id))$(id).onchange=()=>{view=value;if(latest)render(latest);};
if($('monitor-universe'))$('monitor-universe').onchange=async()=>{
 universe=$('monitor-universe').value;generation++;manualRefresh=false;latest=null;expandedIndustries.clear();$('load-sectors').disabled=false;
 if(savedReports.has(universe))render(savedReports.get(universe));else $('sector-results').replaceChildren(element('div','Preparing this universe…','return-card empty-table'));
 await bootstrap();
};
async function bootstrap(){
 if(typeof location!=='undefined'&&new URLSearchParams(location.search).get('sample')==='1'){sampleData=(await import('/monitor-sample.js')).default;render(sampleData);return;}
 const current=generation;
 try{const response=await fetch(endpoint()),data=response.ok?await response.json():null;if(data?.state==='ready'&&current===generation&&!manualRefresh&&!$('load-sectors').disabled){savedReports.set(universe,data);render(data);}}catch{}
 if(current===generation&&!manualRefresh)await refresh();
}
if(typeof window!=='undefined')bootstrap();

`;
// Opening the tab reads a stored snapshot only; it does not fetch FMP data.
