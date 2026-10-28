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