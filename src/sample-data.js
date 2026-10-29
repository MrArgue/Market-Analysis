// Deterministic, explicitly fictional data for visual review of PR previews.
export function sampleHistory() {
 const rows = [];
 for (let t = Date.UTC(2000, 0, 3), i = 0; t <= Date.UTC(2026, 9, 27); t += 86400000) {
  const d = new Date(t); if ([0, 6].includes(d.getUTCDay())) continue;
  const close = 40 + i * .035 + Math.sin(i / 90) * 19 + Math.sin(i / 15) * 3, open = close + Math.sin(i) * 2;
  const score = Math.round((Math.sin(i / 50) + 1) * 3), z = Math.sin(i / 40) * 2.5, percentile = (Math.sin(i / 40) + 1) * 50;
  rows.push({ date: d.toISOString().slice(0, 10), open, high: Math.max(open, close) + 1 + i % 3, low: Math.min(open, close) - 1 - i % 2, close,
   volume: 1000000 + i % 9 * 100000, score, z, percentile, percentileSample:2511, sectorRatio:close/(35+i*.01), signal: percentile >= 95 ? 'overbought' : percentile <= 5 ? 'oversold' : null,
   regime: score >= 5 ? 'strong' : score <= 1 ? 'weak' : 'neutral', averages: [[.047,.046],[.042,.04],[800000,700000]], components: [1,1,1,1,1,1] }); i++;
 }
 return { symbol: 'SAMPLE', sector: 'SECTOR', sectorName: 'Fictional sector ETF', benchmark: 'MARKET', missingBenchmarkDates: 0, options: { short: 50, long: 200, lookback:2511, minHistory:252, lowerPercentile:5, upperPercentile:95 }, rows };
}
export const sampleScript = sampleHistory.toString() + '\nexport { sampleHistory };';