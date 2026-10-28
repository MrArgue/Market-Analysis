# Validated data access

These are observed checks against the project's actual FMP account, not promises of access to every symbol or dataset. Documentation and plan labels are advisory; validate the exact endpoint, symbols, fields and dates before new feature work.

| Checked at (UTC) | Endpoint | Symbol | HTTP | Returned session date | Fields validated |
| --- | --- | --- | --- | --- | --- |
| 2026-10-28 18:52:06 | /stable/quote | AAPL | 200 | 2026-10-28 | open, dayHigh, dayLow, price, volume, timestamp |
| 2026-10-28 18:52:06 | /stable/quote | XLK | 200 | 2026-10-28 | open, dayHigh, dayLow, price, volume, timestamp |
| 2026-10-28 18:52:06 | /stable/quote | ^GSPC | 200 | 2026-10-28 | open, dayHigh, dayLow, price, timestamp |

The quote timestamps were 18:52:05, 18:52:03 and 18:52:05 UTC respectively. The bounded check made three requests through the existing server-side key before current-day chart behavior was implemented. The temporary check route was removed after validation. No credential, raw error body or key-bearing URL is recorded here.

Known restriction: S&P 500 sector-index history returned HTTP 402 for tested sector indices under the current account. The chart uses sector ETF proxies instead. Stock/ETF/index EOD history has been exercised through the production chart for tested ranges; those successes do not establish unrestricted symbol or history coverage.

Official endpoint: https://site.financialmodelingprep.com/developer/docs/stable/quote
## Extended-hours validation

On 2026-10-28 at 21:42:57 UTC, the existing server-side account returned HTTP 200 from `/stable/aftermarket-trade` for AAPL: price 344.91, timestamp 1793223770000 (milliseconds; 21:42:50 UTC), tradeSize 5. This live access check preceded implementation of the extended-hours feature. The temporary check was removed afterward. Only AAPL was validated directly; other symbols may have different coverage. Official documentation: https://site.financialmodelingprep.com/developer/docs/stable/aftermarket-trade

Daily change is `(latest regular-session price / preceding trading observation close - 1) * 100`. Extended-hours change compares the separate trade price with the latest regular-session close. Extended trades never enter the daily OHLC bars, OBV or technical scores. A same-date, same-session trade is required; an unavailable or denied trade leaves the regular chart usable. One optional symbol request is cached for 60 seconds, only for current-date requests outside weekday 9:30–16:00 New York time (6:30–13:00 Pacific). Weekends and historical-only requests skip it. These are standard session-clock boundaries, not an exchange holiday/early-close calendar. Premarket displays only if FMP returns a qualifying current premarket trade. Price refresh remains manual via Load chart; the client hides extended quotes when the regular session begins, without polling FMP.
## Sector/industry validation — 2026-10-28 22:32:42 UTC

The approved fixed live check returned 200 for index-list (428 identifiers), available-sectors (11), available-industries (159), current-date sector snapshot (11 NASDAQ rows), current-date industry snapshot (127 NASDAQ rows), Energy/NYSE sector history (263 daily rows), and Biotechnology/NASDAQ industry history (263 daily rows), for 2025-10-26 through 2026-10-28. Both historical-price-eod/full and quote returned HTTP 402 for ^SP500-20. No matching S&P 500 industry index identifiers were found in index-list. Discovered sector identifiers: ^SP500-20, ^SP500-25, ^SP500-45, ^SP500-50, ^SP500-35, ^SP500-30, ^SP500-55, ^SP500-60, ^SP500-40, ^GSPE, ^SP500-15. Only the Industrials sector symbol was directly tested in this check; listing does not establish entitlement for others.

FMP's working performance endpoints return exchange-specific averages, not the exact S&P 500 industry series shown in the screenshot. The snapshot includes a date, not a quote timestamp, so intraday update behavior remains unverified. A table data-source decision is required before implementing returns: broader exchange-specific FMP categories, exact licensed S&P series, or a separately validated constituent-derived approximation. A full access report is saved in the task outputs. The navigation and table renderer are drafted independently of that decision; no return data source is silently substituted.