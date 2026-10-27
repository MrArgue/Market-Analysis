export const defaults = Object.freeze({ short: 50, long: 200, lookback: 2511, sigma: 2, sell: 1, buy: 5, flat: 'subtract' });

export function methodology(input = {}) {
  const o = { ...defaults, ...input };
  for (const k of ['short', 'long', 'lookback']) if (!Number.isInteger(o[k]) || o[k] < 2 || o[k] > 5000) throw new Error('Invalid methodology window.');
  if (o.short > o.long || !Number.isFinite(o.sigma) || o.sigma <= 0 || o.sigma > 10 || !Number.isInteger(o.sell) || !Number.isInteger(o.buy) || o.sell < 0 || o.buy > 6 || o.sell >= o.buy || !['subtract', 'unchanged'].includes(o.flat)) throw new Error('Invalid methodology settings.');
  return o;
}

export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function normalize(rows, volume = false, requireOhlc = false) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 25000) throw new Error('History is unavailable.');
  const seen = new Set();
  return rows.map(r => {
    if (!validDate(r.date) || !Number.isFinite(r.close) || r.close <= 0 || (volume && (!Number.isFinite(r.volume) || r.volume < 0)) || seen.has(r.date)) throw new Error('Invalid or duplicate history observation.');
    if (requireOhlc && (![r.open, r.high, r.low].every(x => Number.isFinite(x) && x > 0) || r.high < Math.max(r.open, r.close) || r.low > Math.min(r.open, r.close) || r.low > r.high)) throw new Error('Invalid OHLC observation.');
    seen.add(r.date);
    return { date: r.date, close: r.close, ...(Number.isFinite(r.open) && Number.isFinite(r.high) && Number.isFinite(r.low) ? { open: r.open, high: r.high, low: r.low } : {}), ...(volume || (Number.isFinite(r.volume) && r.volume >= 0) ? { volume: r.volume } : {}) };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function calculate(stockRows, sectorRows, marketRows, input = {}) {
  const options = methodology(input), stock = normalize(stockRows, true);
  const sector = new Map(normalize(sectorRows).map(r => [r.date, r.close]));
  const market = new Map(normalize(marketRows).map(r => [r.date, r.close]));
  const rows = []; let obv = 0;
  for (let i = 0; i < stock.length; i++) {
    const s = stock[i];
    if (i) obv += s.close > stock[i - 1].close ? s.volume : s.close < stock[i - 1].close || options.flat === 'subtract' ? -s.volume : 0;
    rows.push({ ...s, obv, sectorRatio: sector.has(s.date) ? s.close / sector.get(s.date) : null, marketRatio: market.has(s.date) ? s.close / market.get(s.date) : null });
  }
  // Missing benchmark observations invalidate the entire affected average; never fill forward.
  function averages(key, size) {
    let sum = 0, missing = 0;
    return rows.map((r, i) => {
      if (r[key] === null) missing++; else sum += r[key];
      if (i >= size) { const old = rows[i - size][key]; if (old === null) missing--; else sum -= old; }
      return i >= size - 1 && !missing ? sum / size : null;
    });
  }
  const series = ['sectorRatio', 'marketRatio', 'obv'];
  const means = series.map(k => [averages(k, options.short), averages(k, options.long)]);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    r.averages = means.map(m => [m[0][i], m[1][i]]);
    r.components = series.flatMap((k, j) => r.averages[j].map(a => a === null || r[k] === null ? null : Number(r[k] > a)));
    r.score = r.components.includes(null) ? null : r.components.reduce((a, b) => a + b, 0);
    r.distance = r.sectorRatio === null || r.averages[0][1] === null ? null : r.sectorRatio / r.averages[0][1] - 1;
  }
  // Sliding Welford variance: O(n), including today, without cancellation from squared sums.
  let n = 0, mean = 0, m2 = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]; r.z = null;
    if (i >= options.lookback) {
      const old = rows[i - options.lookback].distance;
      if (old !== null) {
        if (n === 1) { n = 0; mean = 0; m2 = 0; }
        else { const next = (n * mean - old) / (n - 1); m2 -= (old - mean) * (old - next); mean = next; n--; }
      }
    }
    if (r.distance !== null) { n++; const delta = r.distance - mean; mean += delta / n; m2 += delta * (r.distance - mean); }
    if (i && rows[i - 1].averages[0][1] !== null && r.distance !== null) {
      const sd = Math.sqrt(Math.max(0, m2) / n);
      if (n >= 2 && sd > 1e-12) r.z = (r.distance - mean) / sd;
    }
    r.regime = r.score === null ? 'unavailable' : r.score <= options.sell ? 'weak' : r.score >= options.buy ? 'strong' : 'neutral';
    r.signal = r.z === null ? null : r.z >= options.sigma ? 'overbought' : r.z <= -options.sigma ? 'oversold' : null;
  }
  return { options, rows, missingBenchmarkDates: rows.filter(r => r.sectorRatio === null || r.marketRatio === null).length };
}
