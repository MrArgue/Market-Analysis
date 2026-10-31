// Issuer holdings are a proxy universe, not an official Russell membership feed.
export const holdingsUrl='https://www.ishares.com/us/products/239707/ishares-russell-1000-etf/latest-holdings.csv';
const sectors={Technology:'Information Technology','Information Technology':'Information Technology',Communication:'Communication Services','Communication Services':'Communication Services',Financials:'Financials','Health Care':'Health Care',Industrials:'Industrials','Consumer Discretionary':'Consumer Discretionary','Consumer Staples':'Consumer Staples',Energy:'Energy',Materials:'Materials','Real Estate':'Real Estate',Utilities:'Utilities'};
export function csvRows(text){
 if(typeof text!=='string'||text.length>2000000)throw new Error('Holdings download is unavailable or too large');
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&(c===','||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){rows.push(row);row=[];}}
  else cell+=c;
 }
 if(quoted)throw new Error('Holdings CSV is incomplete');
 if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
 return rows;
}
export function parseIwbHoldings(text){
 const rows=csvRows(text),headerIndex=rows.findIndex(r=>r[0]==='Ticker'&&r.includes('Asset Class'));
 if(headerIndex<0)throw new Error('Holdings columns changed');
 const header=rows[headerIndex],required=['Ticker','Name','Sector','Asset Class','Market Value','Weight (%)','Location','Currency'];
 if(required.some(k=>!header.includes(k)))throw new Error('Holdings columns changed');
 const dateCell=rows.find(r=>r[0].trim()==='Fund Holdings as of')?.[1];
 const parsedDate=Date.parse(dateCell||'');if(!Number.isFinite(parsedDate))throw new Error('Holdings date is unavailable');
 const members=[],excluded=[],seen=new Set();
 for(const row of rows.slice(headerIndex+1)){
  const get=k=>(row[header.indexOf(k)]||'').trim();
  if(get('Asset Class')!=='Equity')continue;
  const sourceSymbol=get('Ticker'),symbol=sourceSymbol.replace(/ /g,'-').replace(/\./g,'-');
  const marketValue=Number(get('Market Value').replace(/,/g,'')),weight=Number(get('Weight (%)').replace(/,/g,'')),sector=sectors[get('Sector')];
  if(!/^[A-Z][A-Z0-9-]{0,14}$/.test(symbol)||!get('Name')||!sector||!(marketValue>0)||!Number.isFinite(weight)||weight<0||get('Currency')!=='USD'){
   excluded.push({symbol:sourceSymbol,reason:'Unsupported identifier, classification, currency, location or value'});continue;
  }
  if(seen.has(symbol))throw new Error('Duplicate normalized holdings symbol');seen.add(symbol);
  members.push({symbol,sourceSymbol,name:get('Name'),sector,marketValue,weight});
 }
 if(members.length<800||members.length>1300)throw new Error('Unexpected equity holdings count');
 const weight=members.reduce((n,m)=>n+m.weight,0);if(weight<90||weight>105)throw new Error('Unexpected equity holdings weight');
 return {source:'IWB equity holdings proxy',asOf:new Date(parsedDate).toISOString().slice(0,10),members,excluded,equityWeight:weight};
}
export function historyWindows(today){
 const end=new Date(today+'T12:00:00Z');if(!Number.isFinite(+end))throw new Error('Invalid history date');
 const start=new Date(end);start.setUTCFullYear(start.getUTCFullYear()-11);
 const windows=[];for(let t=+start;t<=+end;){const last=Math.min(+end,t+1824*86400000);windows.push({from:new Date(t).toISOString().slice(0,10),to:new Date(last).toISOString().slice(0,10)});t=last+86400000;}
 return windows;
}
