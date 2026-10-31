# IWB universe and technical breadth: approved design and access gate

The requested monitor will offer Returns / Technicals in its top-right corner,
with the same sector / industry tree and optional underlying stocks. IWB equity
holdings are a Russell 1000 proxy, not an official constituent feed. Keep the
existing S&P universe available. Issuer sectors are cross-checked against FMP
industries; unresolved classification conflicts are excluded and audited.

## Agreed display and proposed calculation conventions

Returns stay value-weighted. Technical breadth uses one equal company vote.
CIK identifies companies; class-level valid metrics are averaged within each
company before averaging companies. Never average industry averages to obtain
a sector total. Each indicator has its own eligible-company denominator and
coverage; unavailable is not zero. Stock rows show their individual metrics.

Initial technical columns:
- Mean six-component technical score, percent strong (score >= 5), weak (<= 1).
- Percent overbought (>= 95th) and oversold (<= 5th), matching chart methodology:
  stock / sector ETF distance from its 200-session mean; preceding 2,511 valid
  distances, minimum 252. Current observation excluded from percentile reference.
- Percent above 50- and 200-session closing-price means.
- Percent advancing and declining versus previous session close; unchanged
  companies are in the denominator but neither numerator.
- Percent at 20-, 63-, 252-session closing highs and lows. Compare current regular
  session price to the preceding N completed session closes; ties count. These
  are closing-price thresholds, not intraday high/low thresholds.

Intraday technical values must be labeled provisional. A daily volume value
cannot be reconstructed from previousClose; completed OHLCV histories must be
maintained. Share-class handling and technical weighting must be visible in the
methodology. For a partial multi-class company, show its per-indicator coverage.

## Storage and pacing requirements for implementation

Persist histories across monthly membership refreshes. Fetch history for new
members and missing completed sessions, rather than download all old history
again. Preserve OHLCV; separate stored daily observations from intraday quotes.
Partition payloads / processing so D1 row sizes, memory, CPU and subrequest
limits are respected; do not compute ~1,000 complete series in one request.
Precompute per-stock completed-session technical state in bounded resumable
steps, overlay provisional quote metrics without rescanning all years per visit.
Sector ETF / S&P histories are shared across stocks. Detect / repair split-basis
changes rather than mixing prices or volumes across inconsistent bases.

Use shared atomic work claims and explicit provider pacing, not browser speed
or a concurrency limit alone. Budget the monitor below 750 calls/minute, leaving
room for chart requests; other applications using the same key cannot be
accounted for without a shared gateway. Honor HTTP 429 / Retry-After, preserve
checkpoints, and serve the last successful snapshot during refreshes. Monthly
membership refresh and daily history collection are separate concerns.

## This PR: prerequisite only

Adds `GET /api/universe-check` (read saved report) and a same-origin JSON POST
`{"action":"validate"}` (start bounded validation). No UI changes or full
universe build is enabled yet. Existing chart, sectors and Signature tools stay
unchanged. Uses existing D1 table and FMP secret without changing configuration.
The temporary `/universe-check` operator page reads the report on opening; its
Run access check button is the only live-call trigger. It is not added to normal
navigation. `/universe-check.js` is self-hosted under a restrictive CSP.

One issuer CSV download; at most 17 FMP requests:
1. S&P membership to identify truly additional IWB equities.
2. Profiles for AAPL and two added holdings (largest and 75th-percentile rank).
3. One batched quote check for those names, S&P 500, XLK and XLC.
4. Three non-overlapping <= five-year history windows per sample across 11 years.
5. Oldest window for S&P 500 / XLK / XLC (younger XLC naturally has less history).

An atomic D1 lease prevents duplicate concurrent checks. Completed reports are
reused for 24 hours; failed / abandoned checks have a 30-minute cooldown. Raw
provider bodies, secret-bearing URLs and exception details are never returned.
The report distinguishes HTTP denial from empty / incomplete history. A recent
IPO may have usable endpoints but naturally empty older ranges. Samples do not
certify all holdings: the full paced coverage audit is a later gate.

Production deployment and these live calls require approval under the user's
existing instruction to avoid unapproved deployments. The full monitor build
must wait for actual account results; neither endpoint documentation nor offline
fixtures establish subscription access.

## Offline validation against the issuer file

The actual October 29, 2026 CSV parsed successfully: 1,023 eligible equities,
99.95% displayed fund weight. MSGR is explicitly excluded because the issuer
sector is `Other`; its displayed weight rounds to 0.00%, and it must be resolved
or audited before any final coverage claim. Six space-separated share-class
tickers normalize to FMP-style hyphens (including BRK B -> BRK-B). Symbol
normalization is a candidate mapping, not proof of FMP identity or coverage.
