# Workbook trace and initial stock chart

The original workbook trace below is unchanged. The current chart uses actual OHLC and temporarily restores sector ETF proxies because sector-index history is outside the FMP plan; see [the current chart update](CHART_UPDATES.md). The data/security bullets describe the initial release and are superseded by that update where noted.

Source: `Technical Chart - GPT Upload with Static data.xlsm`, Sheet1. SHA-256:
`c94bc6647d5919d387c3bad74e68b164c658e5958c23b7ca0bd11ed8d8a101f2`.
Read formulas and saved calculation values without running VBA or the Excel add-in. The uploaded workbook and extracted market history are not committed to this public repository.

## Six score components

Workbook observations run newest first. For row 4, the 50-day sample is rows 4:53 and the 200-day sample is rows 4:203, both inclusive. The app sorts dates oldest first and uses trailing samples. These are observation counts, not calendar days. Comparisons use strict `>`; equality returns zero.

| Component | Workbook formulas and precedents | App output order |
| --- | --- | --- |
| Stock/sector above 50-day SMA | `J4 > M4`; J4 = B4 / date-matched D; M4 = AVERAGE(J4:J53) | components[0] |
| Stock/sector above 200-day SMA | `J4 > P4`; P4 = AVERAGE(J4:J203) | components[1] |
| Stock/S&P 500 above 50-day SMA | `K4 > N4`; K4 = B4 / date-matched F; N4 = AVERAGE(K4:K53) | components[2] |
| Stock/S&P 500 above 200-day SMA | `K4 > Q4`; Q4 = AVERAGE(K4:K203) | components[3] |
| OBV above 50-day SMA | `I4 > L4`; L4 = AVERAGE(I4:I53) | components[4] |
| OBV above 200-day SMA | `I4 > O4`; O4 = AVERAGE(I4:I203) | components[5] |

S4 sums the three long-window comparisons, T4 sums the short comparisons, and U4 sums all six. AD4 mirrors U4 for charting. The sixth indicator is definitively **200-day OBV**, resolving the duplicated 50-day description.

J and K use exact date MATCH against C/D and E/F respectively; benchmark rows are offset from stock rows, so dividing values from the same worksheet row is wrong. Stock dates/prices are A/B, volume dates/values are G/H. G matches A throughout the calculated stock sample.

I4 is `IF(B4>B5,I5+H4,I5-H4)`: an unchanged close **subtracts volume**. The default preserves that behavior; the UI also offers unchanged OBV on equal prices. The user requested a zero seed, so the app initializes its first observation to zero. The workbook stops OBV formulas at I5537, with I5538 blank, producing an initial cached OBV of 594,619,200. Subtracting this fixed seed from every workbook OBV and average leaves every strict comparison unchanged. The audit verifies scores, not absolute cached OBV levels.

## Overbought / oversold

R4 is `J4 / AVERAGE(J4:J203) - 1`: **percentage distance**, not absolute distance. X4 is `(R4-AVERAGE(R4:R2514))/STDEV.P(R4:R2514)`, gated on P5 being available. Thus the default window contains **2,511 rows**, including today. Excel ignores blank distance cells during warm-up; the app uses available valid distances once the preceding long average exists. It requires at least two distances and a nonzero population standard deviation; a flat or insufficient series returns unavailable.

AL2 = +2 and AM2 = -2. AL4 and AM4 place price markers at B4 × 1.01 for z ≥ +2 and z ≤ -2 respectively; BH/BI apply the same rules on the sector-ratio chart. The app draws a red × above the price for overbought and a green ▲ for oversold. Markers are visual annotations; their vertical offset does not affect calculations.

X5338 and later contain a wider R-row range ending at row+9996, rather than row+2510. All of those saved z-scores are blank because the preceding long average is unavailable; this formula discontinuity has no effect on valid cached results. The app uses one consistent trailing-window rule.

## Chart regimes and other helpers

AI2 is **1**, so AI4 shades weak scores ≤1. AJ2 is 5, so AJ4 shades strong scores ≥5; AK is neutral. The earlier description says weak ≤2. Default to the saved workbook (≤1), with an editable weak threshold that can be set to 2.

V carries score direction forward when the score is unchanged; W counts the duration of that direction. AE displays a dash for an unchanged score; AF/AG plot direction-change arrows at 110%/90% of price. These direction arrows and the Y/Z/AA forward-return research helpers are separate from the six score components and extreme markers; they are not included in this initial app. No forward returns enter any implemented calculation.

## Reconciliation

Calculated workbook formulas span rows 4:5537 (2004-10-26 through 2026-10-23), although raw history extends further. Verified all 5,534 date-aligned sector and market ratios, all **5,335** populated scores and percentage distances, and all **5,334** populated z-scores against saved workbook values. Maximum absolute z error: 3.24 × 10^-14. On 2026-10-23: close 347.725, score 6/6, distance 0.08370194571857, z 0.8540150253712.

Reproduce this check with Python 3 (standard library only) and Node 22+:

```sh
node scripts/verify-workbook.mjs "/path/to/Technical Chart - GPT Upload with Static data.xlsm" python
node --test
npm ci
npm run build
```

The workbook check requires that exact private source file and never uploads, executes or modifies it. Automated synthetic tests cover independent arithmetic, strict equality, warm-up, flat OBV settings, population variance, no future leakage, missing benchmark dates, validation, Access, cache behavior and sanitized failures.

## Data and security

- `GET /api/chart?symbol=AAPL`: current FMP profile sector maps to an explicitly labeled sector ETF proxy (e.g. XLK). Supply `sector` to override with an available index or ETF. Default market benchmark is `^GSPC`; override `benchmark` if needed. The workbook uses add-in symbols `^SPX` and Information Technology `^SPXIFTS`; these vendor symbols are not assumed interchangeable with FMP symbols.
- Automatic sector selection uses the **current** classification for the full sample, not a historical classification series. ETF inception dates limit valid relative history; never silently replace missing history with a different benchmark. The chart reports missing benchmark dates and uses unavailable scores until complete windows return. Price/volume are the FMP EOD endpoint's close/volume fields, not separately dividend-adjusted series. Provider history and adjustment policies can differ from the uploaded snapshot.
- Existing native Access verification and authorized email setting are reused for the market API. Missing identity/configuration fails closed before D1 or FMP. Existing Access policy, diagnostics, Worker configuration, secrets and D1 binding are untouched. No static-assets router or authentication fallback is introduced.
- Initial page load, health requests, chart view controls and HEAD requests make no provider calls or database writes. Clicking Load chart makes up to one profile request and three distinct history requests, sequentially, with 15-second timeouts, no redirects and no retries. API responses are not publicly cached. No external browser scripts or chart CDN is used.
- D1 caches validated histories and sector names for six hours, keyed by ticker and requested history range. Methodology changes reuse history. Old date-range keys are retained; this initial operator-only cache has no automatic purge. Cache rows contain no API credentials. Upstream error bodies, URLs and exception details never reach the browser or logs from this code.
- Apply **only** `migrations/0002_market_history.sql` after separate approval. The app never creates tables. Missing migration returns a sanitized error before any provider request. No production migration, live FMP test, deployment or merge was performed during this implementation. Live symbol entitlement, provider coverage and account-specific performance still require an approved environment check.

Official references: [FMP price and volume API](https://site.financialmodelingprep.com/developer/docs/stable/historical-price-eod-full), [Cloudflare D1 binding API](https://developers.cloudflare.com/d1/worker-api/), [native Cloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).
