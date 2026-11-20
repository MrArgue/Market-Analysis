import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedMarketSession,quoteSessionFreshness} from '../src/market-session.js';

test('premarket morning requires the last completed US session, not an older quote',()=>{
 const time=Date.parse('2026-11-20T10:30:00Z'); // 05:30 ET
 assert.equal(expectedMarketSession(time),'2026-11-19');
 assert.equal(quoteSessionFreshness(Date.parse('2026-11-18T21:00:00Z')/1000,time).fresh,false);
 assert.equal(quoteSessionFreshness(Date.parse('2026-11-19T21:00:00Z')/1000,time).fresh,true);
});
test('US market calendar skips weekends, Thanksgiving and Good Friday',()=>{
 assert.equal(expectedMarketSession(Date.parse('2026-11-23T10:30:00Z')),'2026-11-20');
 assert.equal(expectedMarketSession(Date.parse('2026-11-27T10:30:00Z')),'2026-11-25');
 assert.equal(expectedMarketSession(Date.parse('2026-04-06T09:00:00Z')),'2026-04-02');
});
test('market open requires a current-session quote and date checks follow US eastern time',()=>{
 assert.equal(expectedMarketSession(Date.parse('2026-11-19T14:29:00Z')),'2026-11-18');
 assert.equal(expectedMarketSession(Date.parse('2026-11-19T14:30:00Z')),'2026-11-19');
});
