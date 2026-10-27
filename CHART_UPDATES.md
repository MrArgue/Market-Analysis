# OHLC chart and sector-index update

The chart now uses SEIA’s observed cream (#f0ead5), charcoal-green (#1f2b2f) and gold (#ded2ab) palette, Albert Sans body text and Optima nova headings. Fonts reference the public font assets served by seia.com, with local fallbacks if unavailable. No font files are redistributed in this repository. Observed reference: https://seia.com/ on October 27, 2026.

## Chart controls

- Compact inputs and methodology settings live in a left sidebar; the sidebar stacks above the chart on small screens. Methodology fields and explanatory text start collapsed.
- OHLC bars use the provider's actual open, high, low and close: high/low stem, open tick on the left, close tick on the right. The existing FMP full EOD endpoint supplies all four fields in one response. Stock observations with missing or inconsistent OHLC are rejected, never reconstructed from close prices.
- Period buttons: MTD, 1M, QTD, 3M, 6M, YTD, 1Y, 3Y, 5Y, 10Y, 20Y, ALL. Periods anchor on the latest loaded trading observation; month/quarter/year-to-date use calendar boundaries. Longer presets show all available history if the requested period predates it. History input dates determine the calculation sample; chart presets only change the view.
- Y-axis labels are whole numbers with readable integer steps. The scale covers the selected high/low extremes; both axes recompute after every range change. X-axis label density adapts to available width and uses actual trading observations.
- Independent start/end slider thumbs, date fields, preset selection and zoom remain synchronized. Native range inputs retain keyboard arrow control; handles cannot cross.
- Very wide views combine display bars to fit the chart: first open, maximum high, minimum low and final close. The chart states the sessions per bar. Daily inputs, technical scores, marker classifications and inspection values are unchanged. Nearby repeated markers are thinned visually for legibility.

## Temporary sector ETF comparisons

Sector comparisons now use sector ETF proxies because sector-index history is outside the current FMP entitlement. Automatic selection maps the current company profile to its sector ETF: Communication Services XLC, Consumer Discretionary XLY, Consumer Staples XLP, Energy XLE, Financials XLF, Health Care XLV, Industrials XLI, Information Technology XLK, Materials XLB, Real Estate XLRE, Utilities XLU. The sidebar labels this explicitly as a sector ETF and shows the ETF ticker in each override option.

Both sector-relative score components and the overbought/oversold sector-ratio distance now use the same selected ETF close series. The S&P 500 benchmark remains unchanged. These proxy-based results can differ from the workbook's original index comparisons. Current company classifications apply across history; ETF inception and missing observations limit available scores.

The application no longer requests `/stable/index-list` or sector-index histories. Previously cached index catalogues remain unused; no database deletion or migration is needed. Profile sector and OHLC histories reuse the existing six-hour caches, with distinct ticker keys. A cold automatic load makes at most four sequential provider calls (profile and three histories); view controls make none. OHLC rendering, period presets, axes, date sliders, SEIA styling, Access and secrets are unchanged.

## Review and verification

`/?sample=1` is an explicitly labeled fictional sample view for layout review, including PR previews with no production resources. Click Load sample; it imports a deterministic browser-only fixture and makes no market API or D1 requests. The ordinary app never loads this fixture. Sample prices, sector labels and signals are fictional and are not financial research.

Run `node --test` and `npm run build` (Wrangler dry run). The existing private-workbook reconciliation command continues to verify score and z-score parity. Tests cover independent OHLC preservation and validation, sector ETF mapping and no sector-index requests, Access failure, cache invalidation, sanitized provider errors, integer axes, date labels, calendar presets and dense OHLC aggregation. Live ETF entitlement still requires an authenticated chart request; no live credentials are used for automated checks.
## Public chart access

The page and market-history API now work without login after removal of Worker-wide Access. Diagnostic routes still require a native Access identity and authorized email; unauthenticated diagnostic requests are rejected. Chart API responses contain prices and derived indicators, not the FMP key. Existing input validation, data cache, error redaction and read-only chart methods are retained. API usage by anonymous visitors counts against the configured FMP allowance; this release adds no rate-limit resource or database migration.