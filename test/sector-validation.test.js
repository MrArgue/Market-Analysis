import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSectorAccess} from '../src/sector-validation.js';
function environment(){const cache=new Map();return{FMP_API_KEY:'private-secret',DB:{prepare(){return{bind(...a){return{first:async()=>cache.get(a[0]),run:async()=>cache.set(a[0],{payload:a[1],fetched_at:a[2]})}}}}}};}
test('constituent probe uses only seven bounded calls, checks class-share symbol and caches safe report',async()=>{
 const env=environment(),calls=[];
 const fetcher=async url=>{
  calls.push(url.pathname);
  if(url.pathname.endsWith('/sp500-constituent'))return Response.json(['AAPL','JPM','BRK-B'].map(symbol=>({symbol,sector:'Financials',subSector:'Test Industry',name:symbol,apikey:'private-secret'})));
  if(url.pathname.endsWith('/batch-quote'))return Response.json(url.searchParams.get('symbols').split(',').map(symbol=>({symbol,price:100,marketCap:100000,timestamp:1793217600,change:1,apikey:'private-secret'})));
  if(url.pathname.endsWith('/historical-price-eod/full'))return Response.json([{date:'2026-10-28',close:100},{date:'2025-10-28',close:90}]);
  return Response.json([]);
 };
 const request=new Request('https://example.com/api/sector-access-check?symbol=ATTACK');
 const data=await(await validateSectorAccess(request,env,fetcher)).json();
 assert.equal(calls.length,7);assert.equal(data.checks[0].coverage.uniqueSymbols,3);assert.equal(data.checks[1].coverage.marketCaps,true);assert.ok(data.checks[1].coverage.returned.includes('BRK-B'));assert.ok(!JSON.stringify(data).includes('private-secret'));
 await validateSectorAccess(request,env,fetcher);assert.equal(calls.length,7);
});
test('probe suppresses denied-response bodies and refuses writes before any data calls',async()=>{
 const env=environment();let calls=0;
 const fetcher=async()=>{calls++;return new Response('private-secret',{status:402});};
 const denied=await(await validateSectorAccess(new Request('https://example.com/api/sector-access-check'),env,fetcher)).json();assert.equal(calls,7);assert.ok(denied.checks.every(c=>c.http===402));assert.ok(!JSON.stringify(denied).includes('private-secret'));
 const result=await validateSectorAccess(new Request('https://example.com/api/sector-access-check',{method:'POST'}),env,fetcher);assert.equal(result.status,405);assert.equal(calls,7);
});