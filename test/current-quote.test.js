import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeDate, quoteBar } from '../src/current-quote.js';
import { handleMarket } from '../src/market.js';
const quote = symbol => [{symbol,open:100,dayHigh:110,dayLow:95,price:105,volume:12000,timestamp:1793196000}];
test('quote fields map to a genuine daily bar and use New York dates',()=>{
 const bar=quoteBar(quote('AAPL'),'AAPL');assert.equal(bar.open,100);assert.equal(bar.high,110);assert.equal(bar.low,95);assert.equal(bar.close,105);assert.equal(bar.volume,12000);
 assert.equal(exchangeDate(Date.parse('2026-10-28T00:30:00Z')),'2026-10-27');
 assert.equal(exchangeDate(Date.parse('2026-12-02T04:30:00Z')),'2026-12-01');
});
test('bad symbols, missing prices, inconsistent ranges and missing stock volume cannot pass validation',()=>{
 for(const patch of [{symbol:'OTHER'},{open:null},{price:0},{dayHigh:99},{dayLow:108},{timestamp:null},{volume:null}])assert.throws(()=>quoteBar([{...quote('AAPL')[0],...patch}],'AAPL'));
 assert.equal(quoteBar([{...quote('^GSPC')[0],volume:null}],'^GSPC',false).volume,undefined);
});
test('preflight makes exactly three fixed quote requests, validates fields, redacts errors and caches its report',async()=>{
 const entries=new Map(),calls=[];
 const env={FMP_API_KEY:'private-test-secret',DB:{prepare(){return{bind(...a){return{first:async()=>entries.get(a[0]),run:async()=>entries.set(a[0],{payload:a[1],fetched_at:a[2]})}}}}}};
 const fetcher=async(url,options)=>{calls.push({url,options});return url.searchParams.get('symbol')==='XLK'?new Response('private-test-secret',{status:402}):Response.json(quote(url.searchParams.get('symbol')))};
 const request=new Request('https://example.com/api/chart?symbol=AAPL&quotePreflight=1');
 const response=await handleMarket(request,env,{},fetcher),data=await response.json();
 assert.deepEqual(calls.map(x=>x.url.searchParams.get('symbol')),['AAPL','XLK','^GSPC']);assert.ok(calls.every(x=>x.url.pathname==='/stable/quote' && x.options.redirect==='manual'));
 assert.deepEqual(data.checks.map(x=>x.status),['PASS','FAIL','PASS']);assert.equal(data.checks[1].httpStatus,402);assert.ok(!JSON.stringify(data).includes(env.FMP_API_KEY));
 await handleMarket(request,env,{},fetcher);assert.equal(calls.length,3);
});