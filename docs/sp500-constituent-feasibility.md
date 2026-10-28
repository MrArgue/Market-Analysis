# S&P 500 constituent-table feasibility

Actual account check: **2026-10-28 22:38:46 UTC (3:38:46 p.m. Pacific)**, through the existing Cloudflare FMP secret. No credentials were copied.

| Input | Endpoint | Live result |
| --- | --- | --- |
| Current membership and classifications | sp500-constituent | HTTP 200; 503 rows, 503 unique securities; all have sector and subSector |
| Current prices, previous closes and market values | batch-quote, symbols=AAPL,JPM,BRK-B | HTTP 200; all three symbols returned price, previousClose, change, marketCap and timestamp |
| AAPL price history | historical-price-eod/full, 2025-10-18 through 2026-10-28 | HTTP 200; 258 positive closes, 2025-10-20 through 2026-10-28 |
| JPM price history | same endpoint and dates | HTTP 200; 258 positive closes over the same dates |
| BRK-B class-share price history | same endpoint and dates | HTTP 200; 258 positive closes over the same dates |
| Company profile/classification | profile, symbol=AAPL | HTTP 200; sector and industry returned |
| Membership changes | historical-sp500-constituent | HTTP 200; 1,531 change records |

The regular quotes were timestamped just after the 4 p.m. Eastern close. The test establishes access and field availability, not a measured intraday refresh interval. The already deployed chart uses this provider's regular-session quotes during trading hours. For this table, today's one-day price return can use `price / previousClose - 1` from each security's current quote, with quote times and coverage disclosed.

## Coverage discovered

11 sector labels, 114 distinct industry labels. Member counts: Technology 86; Basic Materials 20; Industrials 77; Healthcare 60; Communication Services 21; Consumer Cyclical 53; Financial Services 70; Energy 22; Utilities 32; Consumer Defensive 32; Real Estate 30.

These are FMP classifications, not an exact reproduction of the screenshot's GICS rows. For example, the membership feed labels HONA as Technology / Aerospace & Defense. Preserve and identify provider classifications rather than silently rewriting them.

## Calculation choices

**Equal weight by security:** calculate each security's price return over a period, then take the arithmetic mean across eligible members of a group. Every security contributes equally; separate share classes count separately. This is transparent, but differs materially from capitalization-weighted S&P indices.

**Approximate market-cap weight:** use current company market values and appropriately handled share classes to estimate group weights. Historical period-start weights would need estimation or additional data; using today's market-cap weights directly introduces hindsight. Multiple listed share classes can report the same total company market value, so simply weighting every security by its quote marketCap can double-count a company. Official float-adjusted weights are not established by this check.

For either choice: current membership is applied retrospectively, which introduces survivorship bias. Prices exclude dividends. Missing histories/quotes must be disclosed per group and period, with no carry-forward quote fabrication or hidden change of universe. An official S&P 500 benchmark row may use the already validated ^GSPC history and quote, clearly distinguished from the custom group baskets.

## Remaining validation before release

Only three representative stock histories/quotes were tested. Validate coverage for all 503 securities while loading the real table, including short listing histories and symbols that changed. The user selected approximate market-cap weighting after the live checks. The implementation estimates fixed share units from current market caps, divides company cap equally among member classes, and discloses current-universe/share-estimate limitations. Full live coverage still needs to be checked through the staged loader. Keep the first table in a draft PR until complete, tested and approved for deployment. The exact S&P sector index calls remain denied (HTTP 402); the constituent approach does not change that entitlement.