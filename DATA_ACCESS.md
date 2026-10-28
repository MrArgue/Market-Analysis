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