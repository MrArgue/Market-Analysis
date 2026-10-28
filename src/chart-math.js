export function wholeAxis(low, high, target = 7) {
  const pad = Math.max((high - low) * .06, high * .005, .01);
  const raw = Math.max(1, (high - low + 2 * pad) / Math.max(2, target));
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map(x => x * power).find(x => x >= raw));
  const min = Math.max(0, Math.floor((low - pad) / step) * step), max = Math.max(min + step, Math.ceil((high + pad) / step) * step);
  const ticks = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(v);
  return { min, max, ticks, step };
}
export function presetStart(end, preset) {
  const d = new Date(end + 'T00:00:00Z'), year = d.getUTCFullYear(), month = d.getUTCMonth();
  if (preset === 'ALL') return null;
  if (preset === 'MTD') return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  if (preset === 'QTD') return new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1)).toISOString().slice(0, 10);
  if (preset === 'YTD') return year + '-01-01';
  const months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '3Y': 36, '5Y': 60, '10Y': 120, '20Y': 240 }[preset];
  if (!months) throw new Error('Unknown period.');
  const target = new Date(Date.UTC(year, month - months, 1));
  target.setUTCDate(Math.min(d.getUTCDate(), new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()));
  return target.toISOString().slice(0, 10);
}
export function dateTicks(rows, width) {
  if (!rows.length) return [];
  const count = Math.min(rows.length, Math.max(2, Math.floor(width / 105))), span = Date.parse(rows.at(-1).date) - Date.parse(rows[0].date);
  const indices = [...new Set(Array.from({ length: count }, (_, i) => Math.round(i * (rows.length - 1) / Math.max(1, count - 1))))];
  return indices.map(index => ({ index, label: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...(span > 4 * 365 * 86400000 ? { year: 'numeric', month: 'short' } : span > 365 * 86400000 ? { year: '2-digit', month: 'short' } : { month: 'short', day: 'numeric' }) }).format(new Date(rows[index].date + 'T00:00:00Z')) }));
}
export function aggregateBars(rows, maxBars) {
  // Keep a provisional current-day bar separate even when old sessions are grouped.
  const current = rows.at(-1)?.provisional ? rows.at(-1) : null;
  const history = current ? rows.slice(0,-1) : rows;
  const size = Math.max(1, Math.ceil(history.length / Math.max(1, maxBars - (current ? 1 : 0)))), bars = [];
  for (let i = 0; i < history.length; i += size) {
    const group = history.slice(i, i + size);
    bars.push({ index: i + (group.length - 1) / 2, open: group[0].open, high: Math.max(...group.map(r => r.high)), low: Math.min(...group.map(r => r.low)), close: group.at(-1).close, observations: group.length });
  }
  if(current) bars.push({index:rows.length-1,open:current.open,high:current.high,low:current.low,close:current.close,observations:1,provisional:true});
  return { size, bars };
}
export const chartMathScript = [wholeAxis, presetStart, dateTicks, aggregateBars].map(fn => fn.toString()).join('\n') + '\nexport { wholeAxis, presetStart, dateTicks, aggregateBars };';