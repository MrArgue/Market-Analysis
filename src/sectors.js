export const sectorAliases = Object.freeze({
  Technology: 'Information Technology', 'Information Technology': 'Information Technology',
  'Communication Services': 'Communication Services', 'Consumer Cyclical': 'Consumer Discretionary',
  'Consumer Discretionary': 'Consumer Discretionary', 'Consumer Defensive': 'Consumer Staples',
  'Consumer Staples': 'Consumer Staples', Energy: 'Energy', Financials: 'Financials',
  'Financial Services': 'Financials', Healthcare: 'Health Care', 'Health Care': 'Health Care',
  Industrials: 'Industrials', 'Basic Materials': 'Materials', Materials: 'Materials',
  'Real Estate': 'Real Estate', Utilities: 'Utilities',
});
// Temporary sector ETF proxies while sector-index history is outside the FMP plan.
export const sectorEtfs = Object.freeze({
  'Communication Services': 'XLC', 'Consumer Discretionary': 'XLY',
  'Consumer Staples': 'XLP', Energy: 'XLE', Financials: 'XLF',
  'Health Care': 'XLV', Industrials: 'XLI', 'Information Technology': 'XLK',
  Materials: 'XLB', 'Real Estate': 'XLRE', Utilities: 'XLU',
});
export function resolveSectorEtf(requested) {
  const sector = Object.hasOwn(sectorAliases, requested) ? sectorAliases[requested]
    : Object.keys(sectorEtfs).find(name => sectorEtfs[name] === requested);
  if (!sector) throw new Error('Unsupported sector ETF.');
  const symbol = sectorEtfs[sector];
  return { sector, symbol, name: sector + ' sector ETF (' + symbol + ')' };
}