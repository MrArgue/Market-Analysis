export function exchangeDate(time) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
}
export function quoteBar(payload, symbol, requireVolume = true) {
  if (!Array.isArray(payload) || payload.length !== 1 || payload[0]?.symbol !== symbol) throw new Error('Quote symbol or shape is invalid.');
  const q = payload[0];
  if (![q.open,q.dayHigh,q.dayLow,q.price].every(v => Number.isFinite(v) && v > 0)
    || q.dayHigh < Math.max(q.open,q.price) || q.dayLow > Math.min(q.open,q.price)
    || !Number.isInteger(q.timestamp) || q.timestamp < 946684800 || q.timestamp > 4102444800
    || (requireVolume && (!Number.isFinite(q.volume) || q.volume < 0))) throw new Error('Quote fields are incomplete or inconsistent.');
  return { date: exchangeDate(q.timestamp * 1000), open:q.open,high:q.dayHigh,low:q.dayLow,close:q.price,
    ...(Number.isFinite(q.volume) && q.volume >= 0 ? {volume:q.volume} : {}), quoteAsOf:new Date(q.timestamp*1000).toISOString() };
}
export function sessionHasStarted(time) {
  const date = exchangeDate(time), weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(time));
  const hour=Number(parts.find(p=>p.type==='hour').value), minute=Number(parts.find(p=>p.type==='minute').value);
  return weekday !== 0 && weekday !== 6 && hour*60+minute >= 570;
}
export function currentSessionBar(bar, now) {
  const time=Date.parse(bar.quoteAsOf);
  return Number.isFinite(time) && time <= now + 60000 && bar.date === exchangeDate(now) && sessionHasStarted(time) && sessionHasStarted(now);
}
export function mergeCurrentBar(rows, bar) {
  return [...rows.filter(r=>r.date !== bar.date), {...bar}].sort((a,b)=>a.date.localeCompare(b.date));
}