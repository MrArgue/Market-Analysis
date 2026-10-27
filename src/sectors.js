export const sectorAliases = Object.freeze({
  Technology: 'Information Technology', 'Information Technology': 'Information Technology',
  'Communication Services': 'Communication Services', 'Consumer Cyclical': 'Consumer Discretionary',
  'Consumer Discretionary': 'Consumer Discretionary', 'Consumer Defensive': 'Consumer Staples',
  'Consumer Staples': 'Consumer Staples', Energy: 'Energy', Financials: 'Financials',
  'Financial Services': 'Financials', Healthcare: 'Health Care', 'Health Care': 'Health Care',
  Industrials: 'Industrials', 'Basic Materials': 'Materials', Materials: 'Materials',
  'Real Estate': 'Real Estate', Utilities: 'Utilities',
});
export const sectors = [...new Set(Object.values(sectorAliases))].sort();
const symbolPattern = /^[A-Z^][A-Z0-9.^-]{0,19}$/;
export function sectorIndices(raw) {
  if (!Array.isArray(raw) || raw.length > 25000) throw new Error('Invalid index list.');
  const result = [], seen = new Set();
  for (const row of raw) {
    if (typeof row?.name !== 'string' || typeof row?.symbol !== 'string') continue;
    const match = row.name.trim().match(/^S&P\s*500\s+(.+?)\s*\(Sector\)$/i);
    if (!match || !symbolPattern.test(row.symbol)) continue;
    const canonical = sectors.find(name => name.toLowerCase() === match[1].trim().toLowerCase());
    if (!canonical || seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    result.push({ sector: canonical, symbol: row.symbol, name: row.name.trim() });
  }
  if (!result.length) throw new Error('No S&P 500 sector indices available.');
  return result;
}
export function resolveSector(indices, requested) {
  const canonical = Object.hasOwn(sectorAliases, requested) ? sectorAliases[requested] : null;
  const matches = indices.filter(row => canonical ? row.sector === canonical : row.symbol === requested);
  if (matches.length !== 1) throw new Error('Sector index missing or ambiguous.');
  return matches[0];
}