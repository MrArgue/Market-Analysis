import test from 'node:test';
import assert from 'node:assert/strict';
import {companyWeights,buildConstituentTable,baselineDates,validQuote,reviewConstituents} from '../src/constituent-math.js';
import {handleConstituents} from '../src/constituent-data.js';
const now=Date.parse('2026-10-28T18:00:00Z');
const members=[{symbol:'AAA',name:'Same Co',cik:'001',sector:'Technology',industry:'Software'},{symbol:'BBB',name:'Same Co',cik:'1',sector:'Technology',industry:'Software'},{symbol:'CCC',name:'Other',cik:'2',sector:'Technology',industry:'Software'}];
const q=(symbol,price,previousClose,marketCap)=>({symbol,price,previousClose,marketCap,timestamp:now/1000});
const quotes={AAA:q('AAA',10,5,200),BBB:q('BBB',20,10,200),CCC:q('CCC',10,10,100)};
const benchmark=[{date:'2026-10-27',close:100},{date:'2026-10-28',close:110}];
const input={members,quotes,benchmark,benchmarkQuote:q('^GSPC',110,100,0),histories:{AAA:[{date:'2026-10-27',close:5}],BBB:[{date:'2026-10-27',close:10}],CCC:[{date:'2026-10-27',close:10}]},now};
test('company cap is divided between member share classes without double counting; baseline weights drive returns',()=>{
 const w=companyWeights(members,quotes);assert.equal(w.companies,2);assert.equal(w.units.get('AAA').cap,100);assert.equal(w.units.get('BBB').cap,100);assert.equal(w.units.get('CCC').cap,100);assert.deepEqual(w.multiClass,[['AAA','BBB']]);
 const r=buildConstituentTable(input);assert.ok(Math.abs(r.groups[0].returns.day-50)<1e-9);assert.ok(Math.abs(r.benchmark.returns.day-10)<1e-9);assert.equal(r.groups[0].coverage.day.included,3);
});
test('an incomplete listed class excludes the whole company consistently',()=>{
 const copy={...quotes};delete copy.BBB;
 const r=buildConstituentTable({...input,quotes:copy});assert.equal(r.groups[0].returns.day,0);assert.equal(r.groups[0].coverage.day.included,1);assert.equal(r.groups[0].coverage.day.total,1);assert.equal(r.coverage.quoted,1);assert.equal(r.review.excluded.length,2);
});
test('missing baselines produce unavailable cells; stale quotes are excluded and index market cap may be zero',()=>{
 assert.equal(validQuote(input.benchmarkQuote,'^GSPC',now),true);assert.equal(validQuote({...quotes.AAA,marketCap:0},'AAA',now),false);
 const r=buildConstituentTable({...input,quotes:{...quotes,CCC:{...quotes.CCC,timestamp:now/1000-86400}}});assert.equal(r.coverage.quoted,2);assert.equal(r.groups[0].returns.year,null);assert.equal(r.groups[0].coverage.year.included,0);
});
test('period baselines share the benchmark trading calendar and use five sessions/calendar offsets',()=>{
 const rows=[];for(let t=Date.parse('2025-10-01T12:00:00Z');t<=Date.parse('2026-10-28T12:00:00Z');t+=86400000){const d=new Date(t);if(![0,6].includes(d.getUTCDay()))rows.push({date:d.toISOString().slice(0,10),close:100});}
 const b=baselineDates(rows,'2026-10-28');assert.equal(b.day,'2026-10-27');assert.equal(b.five,'2026-10-21');assert.equal(b.mtd,'2026-09-30');assert.equal(b.ytd,'2025-12-31');assert.equal(b.year,'2025-10-28');assert.equal(b.fourWeeks,'2026-09-30');assert.equal(b.threeMonths,'2026-07-28');
});
function setup(n=503,{denyHistory,denyQuotes=false}={}){
 const cache=new Map(),calls=[];let queries=0;
 const env={FMP_API_KEY:'private-secret',DB:{prepare(){queries++;return{bind(...a){return{first:async()=>cache.get(a[0]),run:async()=>cache.set(a[0],{payload:a[1],fetched_at:a[2]})}}}}}};
 const list=Array.from({length:n},(_,i)=>({symbol:'T'+i,name:'Company '+i,cik:String(i+1),sector:'Technology',subSector:'Software'}));
 const rows=[];for(let t=Date.parse('2025-10-01T12:00:00Z');t<=Date.parse('2026-10-28T12:00:00Z');t+=86400000){const d=new Date(t);if(![0,6].includes(d.getUTCDay()))rows.push({date:d.toISOString().slice(0,10),close:100});}
 const fetcher=async url=>{
  calls.push(url.pathname);
  if(url.pathname.endsWith('/sp500-constituent'))return Response.json(list);
  if(url.pathname.endsWith('/batch-quote'))return denyQuotes?new Response('private-secret',{status:402}):Response.json(url.searchParams.get('symbols').split(',').map(s=>q(s,110,100,s==='^GSPC'?0:1000000)));
  if(url.searchParams.get('symbol')===denyHistory)return new Response('private-secret',{status:402});
  return Response.json(rows);
 };
 const request=body=>new Request('https://example.com/api/sectors',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:JSON.stringify(body)});
 return{env,fetcher,calls,request,reset(){queries=0;},get queries(){return queries;}};
}
test('full 503-security load is bounded per request, resumes in steps and reuses the completed cache',async()=>{
 const s=setup();let data=await(await handleConstituents(s.request({action:'start'}),s.env,s.fetcher,now)).json();assert.equal(data.total,503);assert.ok(s.queries<50);let steps=0;
 while(data.state==='loading'){s.reset();data=await(await handleConstituents(s.request({action:'step',id:data.id}),s.env,s.fetcher,now)).json();assert.ok(s.queries<50,'D1 operations bounded below 50');assert.ok(++steps<50);}
 assert.equal(data.state,'ready');assert.equal(data.coverage.quoted,503);assert.equal(data.groups[0].coverage.year.included,503);assert.equal(s.calls.filter(p=>p.endsWith('/historical-price-eod/full')).length,504);
 const count=s.calls.length;const again=await(await handleConstituents(s.request({action:'start'}),s.env,s.fetcher,now)).json();assert.equal(again.state,'ready');assert.equal(s.calls.length,count);assert.ok(!JSON.stringify(data).includes('private-secret'));
});
test('missing stock history excludes that company in every period; denied benchmark stops safely',async()=>{
 const s=setup(3,{denyHistory:'T1'});let data=await(await handleConstituents(s.request({action:'start'}),s.env,s.fetcher,now)).json();data=await(await handleConstituents(s.request({action:'step',id:data.id}),s.env,s.fetcher,now)).json();assert.equal(data.state,'ready');assert.equal(data.groups[0].coverage.year.included,2);assert.equal(data.groups[0].coverage.day.included,2);assert.equal(data.review.excluded.length,1);assert.ok(data.issues.some(i=>i.symbol==='T1'));assert.ok(!JSON.stringify(data).includes('private-secret'));
 const denied=setup(3,{denyQuotes:true});const r=await handleConstituents(denied.request({action:'start'}),denied.env,denied.fetcher,now);assert.equal(r.status,502);assert.ok(!(await r.text()).includes('private-secret'));
});
test('invalid actions, cross-origin writes and expired jobs never fetch provider data',async()=>{
 const s=setup(3);for(const request of [s.request({action:'oops'}),s.request({action:'step',id:'00000000-0000-0000-0000-000000000000'}),new Request('https://example.com/api/sectors',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:'{"action":"start"}'})]){const r=await handleConstituents(request,s.env,s.fetcher,now);assert.ok(r.status>=400);}assert.equal(s.calls.length,0);
});
test('Aerospace & Defense is Industrials; short-history companies are excluded rather than left in a conflicting sector',()=>{
 const list=[{symbol:'HONA',name:'Honeywell Aerospace',cik:'3',sector:'Technology',industry:'Aerospace & Defense'},{symbol:'RTX',name:'RTX',cik:'4',sector:'Industrials',industry:'Aerospace & Defense'}];
 const quotes={HONA:{},RTX:{}},dates={day:'2026-10-27',year:'2025-10-28'};
 const maps={HONA:new Map([['2026-10-27',100]]),RTX:new Map([['2025-10-28',100]])};
 const review=reviewConstituents(list,quotes,maps,dates);assert.equal(review.eligible.length,1);assert.equal(review.eligible[0].symbol,'RTX');assert.equal(review.excluded[0].symbol,'HONA');assert.equal(review.corrections[0].to,'Industrials');assert.equal(review.conflicts.length,0);
 maps.HONA.set('2025-10-28',100);const complete=reviewConstituents(list,quotes,maps,dates);assert.ok(complete.eligible.every(m=>m.sector==='Industrials'));
});
test('saved inputs refresh expired report with fresh quotes in one request and zero history-provider calls',async()=>{
 const s=setup(3);let data=await(await handleConstituents(s.request({action:'start'}),s.env,s.fetcher,now)).json();data=await(await handleConstituents(s.request({action:'step',id:data.id}),s.env,s.fetcher,now)).json();assert.equal(data.refresh.mode,'rebuilt-inputs');
 const historyCalls=s.calls.filter(p=>p.endsWith('/historical-price-eod/full')).length;
 s.reset();const refreshed=await(await handleConstituents(s.request({action:'start'}),s.env,s.fetcher,now+61000)).json();assert.equal(refreshed.state,'ready');assert.equal(refreshed.refresh.mode,'saved-inputs');assert.equal(s.calls.filter(p=>p.endsWith('/historical-price-eod/full')).length,historyCalls);assert.ok(s.queries<50);
 const calls=s.calls.length;const saved=await(await handleConstituents(new Request('https://example.com/api/sectors'),s.env,s.fetcher,now+180000)).json();assert.equal(saved.state,'ready');assert.match(saved.status,/Saved snapshot/);assert.equal(s.calls.length,calls);
});
test('a changed baseline invalidates the prepared input pack',async()=>{
 const s=setup(3);let data=await(await handleConstituents(s.request({action:'start'}),s.env,s.fetcher,now)).json();await handleConstituents(s.request({action:'step',id:data.id}),s.env,s.fetcher,now);
 const key='constituent-inputs-v2:2026-10-28',stored=await s.env.DB.prepare('SELECT payload, fetched_at FROM market_history_cache WHERE cache_key = ?').bind(key).first();const pack=JSON.parse(stored.payload);pack.baselines.year='2025-10-27';await s.env.DB.prepare('INSERT INTO market_history_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?)').bind(key,JSON.stringify(pack),now).run();
 data=await(await handleConstituents(s.request({action:'start'}),s.env,s.fetcher,now+61000)).json();assert.equal(data.state,'loading');assert.equal(data.loaded,0);
});