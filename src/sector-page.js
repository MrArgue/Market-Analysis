import {chartPage} from './chart-page.js';
import {appNavigation} from './navigation.js';
const head=chartPage.slice(0,chartPage.indexOf('</head>')).replace('<title>Market Analysis · Technical research</title>','<title>US Sectors/Industries · Market Analysis</title>');
export const sectorPage=head+`<style>
.sector-main{max-width:1800px;margin:auto;padding:28px}.sector-heading{display:flex;justify-content:space-between;align-items:start;gap:24px;flex-wrap:wrap}.sector-heading h1{margin:0 0 8px}.sector-heading p{margin:0;color:#6c7474;font-size:12px}.sector-actions{display:flex;gap:10px;align-items:center}.sector-actions button{background:#1f2b2f;color:#f0ead5}.return-legend{display:flex;gap:18px;flex-wrap:wrap;margin:18px 0;font-size:12px}.return-legend span{padding:4px 8px}.cell-coverage{display:block;font-size:9px;color:#6c7474}.return-best{background:#c9ebd4;color:#155a37}.return-worst{background:#f3cecb;color:#913b35}.sector-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}.return-card{min-width:0;background:#fff;border:1px solid #dedfd9;border-radius:4px;overflow:hidden}.return-scroll{overflow:auto}.return-table{width:100%;margin:0;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}.return-table th,.return-table td{padding:6px 9px;border-bottom:1px solid #eceee7;white-space:nowrap;text-align:right}.return-table thead th{background:#1f2b2f;color:#f0ead5;font-size:10px;text-transform:none;position:sticky;top:0}.return-table th:first-child{text-align:left;min-width:195px}.return-table tbody th{text-transform:none;font-size:12px}.return-table th:first-child{max-width:260px;white-space:normal}.return-table .sector-total th,.return-table .sector-total td{background:#e5e4d7;font-weight:700;border-top:2px solid #fff}.return-table .industry-name{padding-left:20px;font-weight:400}.return-table .market-total th,.return-table .market-total td{background:#ded2ab;font-weight:700}.sector-method{font-size:12px;line-height:1.7;color:#6c7474;border-top:1px solid #dedfd9;margin-top:20px;padding-top:14px}.sector-method summary{color:#1f2b2f}.sector-status{font-size:12px;min-height:20px;margin:16px 0;color:#59676b}.empty-table{padding:38px;color:#6c7474;font-size:13px}@media(max-width:1400px){.sector-grid{grid-template-columns:1fr}}@media(max-width:650px){.sector-main{padding:20px 12px}.return-table th,.return-table td{padding:6px}.return-table{font-size:11px}}
</style></head><body><header class="topbar"><div class="brand">Market Analysis <small>TECHNICAL RESEARCH</small></div><a href="/diagnostics">Connection diagnostics ↗</a></header>`+appNavigation('sectors')+`<main class="sector-main"><div class="sector-heading"><div><p class="eyebrow">US equity performance</p><h1>US Sectors/Industries</h1><p id="source-label">Sector and industry returns</p></div><div class="sector-actions"><button id="load-sectors" type="button">Load returns</button></div></div><p class="sector-status" id="sector-status" role="status" aria-live="polite">Load returns to view the sector and industry table.</p><div class="return-legend"><span class="return-best">Top 20% of industries</span><span class="return-worst">Bottom 20% of industries</span><span>Ranked separately within each return column</span></div><div id="sector-results" class="sector-grid"><div class="return-card empty-table">Returns will appear here after loading.</div></div><details class="sector-method"><summary>Return methodology and data coverage</summary><div id="sector-method"></div></details></main><script type="module" src="/sectors.js"></script></body></html>`;
export const sectorScript=String.raw`
const $=id=>document.getElementById(id);
const columns=[['day','1-Day'],['five','5-Day'],['mtd','MTD'],['fourWeeks','4-Wk'],['threeMonths','3M'],['ytd','YTD'],['year','1-Year']];
function element(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function format(value){return Number.isFinite(value)?(value>0?'+':'')+value.toFixed(1)+'%':'—';}
function row(item,type,thresholds){
 const tr=element('tr',undefined,type);const name=element('th',item.name,type==='industry'?'industry-name':'');name.scope='row';tr.append(name);
 for(const [key]of columns){
  const value=item.returns?.[key],cell=element('td',format(value)),limits=thresholds[key];
  if(type==='industry'&&Number.isFinite(value)&&limits&&limits.low<limits.high){
   if(value>=limits.high){cell.className='return-best';cell.title='Top 20% of industries';}
   else if(value<=limits.low){cell.className='return-worst';cell.title='Bottom 20% of industries';}
  }
  const coverage=item.coverage?.[key];
  if(coverage){cell.title=(cell.title?cell.title+' · ':'')+coverage.included+'/'+coverage.total+' member securities; '+(coverage.quotedCapitalizationPercent==null?'unknown':coverage.quotedCapitalizationPercent.toFixed(1)+'%')+' of quoted group market cap';if(coverage.included<coverage.total)cell.append(element('small',' '+coverage.included+'/'+coverage.total,'cell-coverage'));}
  tr.append(cell);
 }
 return tr;
}
function render(data){
 const thresholds={};
 for(const [key]of columns){
  const values=data.groups.flatMap(g=>g.industries.map(i=>i.returns?.[key])).filter(Number.isFinite).sort((a,b)=>a-b);
  if(values.length>=5){const count=Math.max(1,Math.floor(values.length*.2));thresholds[key]={low:values[count-1],high:values[values.length-count]};}
 }
 const results=$('sector-results');results.replaceChildren();
 const midpoint=Math.ceil(data.groups.length/2);
 for(const [partIndex,groups]of [data.groups.slice(0,midpoint),data.groups.slice(midpoint)].entries()){
  if(!groups.length)continue;
  const card=element('div',undefined,'return-card'),scroll=element('div',undefined,'return-scroll'),table=element('table',undefined,'return-table'),head=element('thead'),hr=element('tr');
  for(const label of ['Sector / Industry',...columns.map(c=>c[1])]){const th=element('th',label);th.scope='col';hr.append(th);}head.append(hr);table.append(head);
  const body=element('tbody');
  for(const group of groups){body.append(row(group,'sector-total',thresholds));for(const industry of group.industries)body.append(row(industry,'industry',thresholds));}
  if(partIndex===(data.groups.length>midpoint?1:0)&&data.benchmark)body.append(row(data.benchmark,'market-total',thresholds));
  table.append(body);scroll.append(table);card.append(scroll);results.append(card);
 }
 $('source-label').textContent=data.sourceLabel;
 $('sector-method').textContent=data.methodology;
 $('sector-status').textContent=data.status;
}
$('load-sectors').onclick=async()=>{
 const button=$('load-sectors');button.disabled=true;$('sector-status').textContent='Loading sector and industry returns…';
 try{
  let response=await fetch('/api/sectors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start'})});
  let data=await response.json();
  if(!response.ok)throw new Error(data.error||'Returns are unavailable.');
  while(data.state==='loading'){
   $('sector-status').textContent='Loading histories: '+data.loaded+' / '+data.total+' securities. First load is cached for later visits.';
   response=await fetch('/api/sectors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'step',id:data.id})});
   data=await response.json();if(!response.ok)throw new Error(data.error||'Returns are unavailable.');
  }
  render(data);
 }catch(error){$('sector-status').textContent=error.message+' Any previously loaded returns remain visible.';}
 finally{button.disabled=false;}
};
`;