export const collarScript = String.raw\`
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const money = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US',{maximumFractionDigits:0});
  const price = n => '$' + n.toFixed(2);
  const pct = n => (n >= 0 ? '+' : '') + (n*100).toFixed(1) + '%';
  const cdf = x => { const a = Math.abs(x); const t=1/(1+0.2316419*a); const y=1-0.3989422804*Math.exp(-a*a/2)*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429)))); return x < 0 ? 1-y : y; };
  function fairValue(type,S,K,T) {
    const vol=.30,rate=.04,div=.005,sv=vol*Math.sqrt(T);
    const d1=(Math.log(S/K)+(rate-div+vol*vol/2)*T)/sv, d2=d1-sv;
    return Math.max(0,type==='call' ? S*Math.exp(-div*T)*cdf(d1)-K*Math.exp(-rate*T)*cdf(d2) : K*Math.exp(-rate*T)*cdf(-d2)-S*Math.exp(-div*T)*cdf(-d1));
  }
  function quote(type,S,K,T) {
    const fair=fairValue(type,S,K,T);
    const half=Math.max(.08,.025*fair);
    return { bid:Math.max(0,fair-half),ask:fair+half };
  }
  const state={initial:true};
  function getInputs() {
    const S=Number($('stock').value),shares=Number($('shares').value),days=Number($('days').value);
    if(!Number.isFinite(S)||S<=0||!Number.isInteger(shares)||shares<100||shares%100!==0||shares>10000000) return null;
    return {S,shares,days,T:days/365,contracts:shares/100};
  }
  function strikeGrid(S) {
    const step=S>=200?5:S>=50?2.5:1, strikes=[];
    for(let n=Math.ceil(S*.50/step);n<=Math.floor(S*1.7/step);n++)strikes.push(Number((n*step).toFixed(2)));
    return strikes;
  }
  function makeOptions() {
    const a=getInputs();if(!a){$('selection').textContent='Enter a positive stock price and a share count divisible by 100.';return false}
    const previousPut=Number($('put').value),previousCall=Number($('call').value);
    const strikes=strikeGrid(a.S);
    const putStrikes=strikes.filter(k=>k<a.S),callStrikes=strikes.filter(k=>k>a.S);
    function choose(list,target){return list.reduce((best,k)=>Math.abs(k-target)<Math.abs(best-target)?k:best,list[0])}
    const selectedPut=state.initial?choose(putStrikes,235):choose(putStrikes,previousPut||a.S*.88);
    const selectedCall=state.initial?choose(callStrikes,350):choose(callStrikes,previousCall||a.S*1.3);
    for(const [id,values,selected] of [['put',putStrikes,selectedPut],['call',callStrikes,selectedCall]]){
      const el=$(id);el.replaceChildren();
      for(const k of values){const opt=document.createElement('option');opt.value=String(k);opt.textContent=price(k)+' ('+pct(k/a.S-1)+')';if(k===selected)opt.selected=true;el.append(opt)}
    }
    state.initial=false;
    return true;
  }
  function compute() {
    const a=getInputs();if(!a)return;
    const put=Number($('put').value),call=Number($('call').value),method=$('method').value;
    if(!(put<a.S&&call>a.S))return;
    const pq=quote('put',a.S,put,a.T),cq=quote('call',a.S,call,a.T);
    const pfill=method==='mid'?(pq.bid+pq.ask)/2:pq.ask;
    const cfill=method==='mid'?(cq.bid+cq.ask)/2:cq.bid;
    const net=(cfill-pfill)*a.shares;
    const collarValue=ending=>a.shares*(ending+Math.max(put-ending,0)-Math.max(ending-call,0))+net;
    $('position').textContent=money(a.S*a.shares);$('contracts').textContent=a.contracts.toLocaleString()+' contracts / leg';
    $('premium').textContent=money(net);$('coststate').textContent=net>=0?'Credit received':'Debit paid';
    $('floor').textContent=money(collarValue(0));$('floorpct').textContent=pct(collarValue(0)/(a.S*a.shares)-1)+' vs. entry';
    $('cap').textContent=money(collarValue(call));$('cappct').textContent=pct(collarValue(call)/(a.S*a.shares)-1)+' vs. entry';
    const gap=Math.abs(net)/a.shares;
    $('selection').textContent=(net>=0?'Net credit':'Net debit')+' '+price(gap)+' per share ('+money(Math.abs(net))+'). ' +(Math.abs(net)/a.shares<.5?'This is near zero cost under the chosen simulated fill assumption.':'Adjust strikes or select the zero-cost finder.');
    const legs=[['Buy put',put,pq,pfill,-pfill*a.shares],['Sell call',call,cq,cfill,cfill*a.shares]];
    $('legs').innerHTML=legs.map(l=>'<tr><td>'+l[0]+'</td><td>'+price(l[1])+'</td><td>'+price(l[2].bid)+'</td><td>'+price(l[2].ask)+'</td><td>'+price(l[3])+'</td><td>'+money(l[4])+'</td></tr>').join('');
    const returns=[-.6,-.4,-.3,-.2,-.1,0,.1,.2,.3,.4,.6,.8];
    $('scenario').innerHTML=returns.map(r=>{const ending=a.S*(1+r),base=a.shares*ending,cv=collarValue(ending);return '<tr><td>'+pct(r)+'</td><td>'+price(ending)+'</td><td>'+money(base)+'</td><td>'+money(cv)+'</td><td>'+money(cv-base)+'</td></tr>'}).join('');
    const vals=[],lo=a.S*.45,hi=a.S*1.85;
    for(let i=0;i<=140;i++){const ending=lo+(hi-lo)*i/140;vals.push({x:ending,stock:ending*a.shares,collar:collarValue(ending)})}
    const minV=Math.min(...vals.map(v=>Math.min(v.stock,v.collar)))*.88,maxV=Math.max(...vals.map(v=>Math.max(v.stock,v.collar)))*1.06;
    const X=x=>55+(x-lo)/(hi-lo)*637,Y=y=>277-(y-minV)/(maxV-minV)*240;
    const points=key=>vals.map(v=>X(v.x).toFixed(1)+','+Y(v[key]).toFixed(1)).join(' ');
    let grid='';
    for(let i=0;i<=4;i++){const y=37+i*60,v=maxV-(maxV-minV)*i/4;grid+='<line x1="55" x2="693" y1="'+y+'" y2="'+y+'" stroke="#e4e9eb"/><text x="48" y="'+(y+4)+'" text-anchor="end">'+(v/1e6).toFixed(1)+'m</text>'}
    for(const k of [put,a.S,call])grid+='<line x1="'+X(k)+'" x2="'+X(k)+'" y1="37" y2="277" stroke="#c7d0d4" stroke-dasharray="3 5"/><text text-anchor="middle" x="'+X(k)+'" y="299">'+price(k)+'</text>';
    $('payoff').innerHTML=grid+'<polyline fill="none" stroke="#aab4bc" stroke-width="2" stroke-dasharray="5 5" points="'+points('stock')+'"/><polyline fill="none" stroke="#b58b45" stroke-width="3.5" stroke-linejoin="round" points="'+points('collar')+'"/><text x="55" y="16">Position value (USD millions)</text><text x="692" y="316" text-anchor="end">AAPL at expiration</text>';
  }
  function findZero() {
    const a=getInputs();if(!a)return;
    const put=Number($('put').value),method=$('method').value,puts=quote('put',a.S,put,a.T);
    const debit=method==='mid'?(puts.bid+puts.ask)/2:puts.ask;
    const calls=Array.from($('call').options,op=>Number(op.value));
    // Prefer the highest cap with a nonnegative net credit. If none qualifies, minimize the debit.
    const scored=calls.map(k=>{const q=quote('call',a.S,k,a.T);return {k,premium:method==='mid'?(q.bid+q.ask)/2:q.bid}});
    const affordable=scored.filter(x=>x.premium>=debit);
    const chosen=affordable.length?affordable[affordable.length-1]:scored.reduce((best,x)=>Math.abs(x.premium-debit)<Math.abs(best.premium-debit)?x:best,scored[0]);
    $('call').value=String(chosen.k);compute();
  }
  for(const id of ['put','call','method'])$(id).addEventListener('change',compute);
  for(const id of ['stock','shares','days'])$(id).addEventListener('change',()=>{if(makeOptions())compute()});
  $('auto').addEventListener('click',findZero);
  $('reset').addEventListener('click',()=>{$('stock').value=268;$('shares').value=20000;$('days').value=365;$('method').value='conservative';state.initial=true;if(makeOptions())compute()});
  if(makeOptions())compute();
})();\`;
