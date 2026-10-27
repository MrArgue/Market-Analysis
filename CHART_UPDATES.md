# OHLC chart and sector-index update

The chart now uses SEIA’s observed cream (#f0ead5), charcoal-green (#1f2b2f) and gold (#ded2ab) palette, Albert Sans body text and Optima nova headings. Fonts reference the public font assets served by seia.com, with local fallbacks if unavailable. No font files are redistributed in this repository. Observed reference: https://seia.com/ on October 27, 2026.

## Chart controls

- Compact inputs and methodology settings live in a left sidebar; the sidebar stacks above the chart on small screens. Methodology fields and explanatory text start collapsed.
- OHLC bars use the provider's actual open, high, low and close: high/low stem, open tick on the left, close tick on the right. The existing FMP full EOD endpoint supplies all four fields in one response. Stock observations with missing or inconsistent OHLC are rejected, never reconstructed from close prices.
- Period buttons: MTD, 1M, QTD, 3M, 6M, YTD, 1Y, 3Y, 5Y, 10Y, 20Y, ALL. Periods anchor on the latest loaded trading observation; month/quarter/year-to-date use calendar boundaries. Longer presets show all available history if the requested period predates it. History input dates determine the calculation sample; chart presets only change the view.
- Y-axis labels are whole numbers with readable integer steps. The scale covers the selected high/low extremes; both axes recompute after every range change. X-axis label density adapts to available width and uses actual trading observations.
- Independent start/end slider thumbs, date fields, preset selection and zoom remain synchronized. Native range inputs retain keyboard arrow control; handles cannot cross.
- Very wide views combine display bars to fit the chart: first open, maximum high, minimum low and final close. The chart states the sessions per bar. Daily inputs, technical scores, marker classifications and inspection values are unchanged. Nearby repeated markers are thinned visually for legibility.

## S&P 500 sector indices

Automatic selection reads the current company sector, then requests FMP's `/stable/index-list`. It selects the unique entry named `S&P 500 <Sector Name> (Sector)` after mapping company-profile aliases such as Technology to Information Technology. Symbols are discovered from that response, not guessed or copied from another vendor. The sidebar allows a sector override, still restricted to a matching S&P 500 sector index. ETF symbols are rejected rather than silently substituted. Missing, ambiguous or inaccessible indices produce an actionable error.

The catalogue is cached for 24 hours; profile sector and price histories for six hours in the existing cache table. The history cache key is versioned to `fmp-eod-ohlc-v2`, so old close-only caches are not reused as OHLC. There is no new migration, secret, binding or Access configuration. A cold automatic load makes at most five sequential provider calls (profile, index catalogue, three histories); view controls make none. Sector choice uses the current classification across the historical sample, not historical reclassifications.

Official provider references: [index catalogue](https://site.financialmodelingprep.com/developer/docs#stock-market-indexes-list), [full EOD prices and volume](https://site.financialmodelingprep.com/developer/docs/stable/historical-price-eod-full).

## Review and verification

`/?sample=1` is an explicitly labeled fictional sample view for layout review, including PR previews with no production resources. Click Load sample; it imports a deterministic browser-only fixture and makes no market API or D1 requests. The ordinary app never loads this fixture. Sample prices, sector labels and signals are fictional and are not financial research.

Run `node --test` and `npm run build` (Wrangler dry run). The existing private-workbook reconciliation command continues to verify score and z-score parity. Tests cover independent OHLC preservation and validation, strict index discovery/no ETF fallback, Access failure, cache invalidation, sanitized provider errors, integer axes, date labels, calendar presets and dense OHLC aggregation. Live index-list coverage and entitlement need verification in the approved production environment; no live credentials are used for these checks.