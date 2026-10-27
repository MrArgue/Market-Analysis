import test from 'node:test';
import assert from 'node:assert/strict';
import { wholeAxis, presetStart, dateTicks, aggregateBars } from '../src/chart-math.js';
test('whole-number axes cover the complete high/low range at narrow and wide scales', () => {
 for (const [low, high] of [[.04,.11],[245.3,371.8],[100,100],[5000,7200]]) {
  const a = wholeAxis(low, high);assert.ok(a.min <= low);assert.ok(a.max >= high);assert.ok(a.ticks.length >= 2 && a.ticks.length <= 15);assert.ok(a.ticks.every(Number.isInteger));
 }
});
test('period starts handle month ends, leap days and calendar period boundaries', () => {
 assert.equal(presetStart('2024-03-31', '1M'), '2024-02-29');assert.equal(presetStart('2024-02-29', '1Y'), '2023-02-28');
 assert.equal(presetStart('2026-10-27', 'MTD'), '2026-10-01');assert.equal(presetStart('2026-10-27', 'QTD'), '2026-10-01');assert.equal(presetStart('2026-10-27', 'YTD'), '2026-01-01');
 assert.equal(presetStart('2026-10-27', '20Y'), '2006-10-27');assert.equal(presetStart('2026-10-27', 'ALL'), null);
 assert.throws(() => presetStart('2026-10-27', 'bad'));
});
test('date ticks use real observations and adapt density to width and history length', () => {
 const rows = Array.from({length:200}, (_,i)=>({date:new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10)}));
 const wide=dateTicks(rows,1000),narrow=dateTicks(rows,260);
 assert.ok(wide.length>narrow.length);assert.equal(wide[0].index,0);assert.equal(wide.at(-1).index,199);assert.equal(new Set(wide.map(t=>t.index)).size,wide.length);
 assert.equal(dateTicks(rows.slice(0,1),1000).length,1);assert.deepEqual(dateTicks([],1000),[]);
});
test('dense OHLC aggregation retains first open, extreme high/low, last close without changing source rows', () => {
 const rows = [{open:10,high:15,low:8,close:12},{open:12,high:18,low:11,close:16},{open:16,high:17,low:7,close:9}];
 const before=structuredClone(rows),a=aggregateBars(rows,2);
 assert.equal(a.size,2);assert.equal(a.bars.length,2);assert.deepEqual(a.bars[0],{index:.5,open:10,high:18,low:8,close:16,observations:2});assert.deepEqual(rows,before);
});