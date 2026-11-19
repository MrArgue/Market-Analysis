# Historical Research — technical signals and forward returns

**Implementation date:** 19 November 2026. **Status:** repository implementation; verify the active Cloudflare Worker commit separately from GitHub merge.

## Scope and data provenance

`/historical-research` is a third research tab. `GET /api/historical-research?universe=iwb` displays the last completed D1 report; same-origin `POST` actions `start` and `step` build a new snapshot in bounded batches of five securities per invocation. The initial universe uses the *current* IWB ETF equity-holdings proxy already saved by the US Sectors/Industries monitor, **not** point-in-time Russell 1000 membership. The current stock-to-sector mapping applies retrospectively. Historical prices are reused from `monitor-v1:history:<symbol>` for each stock, sector ETF proxy, and `^GSPC`. There are **no FMP calls** from this endpoint and no D1 schema migration: it uses the existing `market_history_cache` table.

Cached stocks ordinarily have up to **11 years of EOD history** (as originally requested by the monitor). The new tab does **not** backfill to the full inception of each sector ETF. Expanding history requires a separate bounded data-access test for older FMP endpoint ranges and a cost/capacity review, not simply increasing the number of calls for ~1,000 stocks. Some sector ETFs have later inceptions than the constituent stocks. The tab discloses actual processed/available coverage and missing history; it cannot claim results for stocks not successfully analyzed.

## Quantitative protocol (current version `historical-signals-v1-50-100-extreme200`)

Calculations reuse the shared chart engine in `src/technical.js`, with all available earlier history before a signal date. Strict greater-than comparisons of stock/sector ratio, stock/`^GSPC` ratio, and stock OBV against **50/100-observation** SMAs produce six binary components. If any component is unavailable, the score is null. Weak <=1, neutral 2–4 and strong >=5. OBV starts at zero and unchanged closes subtract volume.

The independent overbought/oversold signal is the empirical percentile of `D = (stock/sector ratio) / SMA_200(stock/sector ratio) - 1`, ranked against up to **2,511 prior valid distances**, never including the current observation; require at least 252 previous distances. Overbought >=95th percentile; oversold <=5th; other *available* percentiles are neutral. Missing percentile means unavailable, **not neutral**.

Forward horizons use **1/3/6 calendar months** and the first stock session on/after the target anniversary, no more than seven calendar days later. Outcomes missing their mature date are null and excluded. Absolute returns are stock EOD close-to-close percentage price returns. Excess is the arithmetic difference from the `^GSPC` price return over the **same entry and exit dates**, with exact date matching and no filling of missing benchmark observations. Daily market signals use EOD closes; assuming execution at that close without decision latency would be look-ahead trading bias. Results are descriptive, not executable strategy returns.

Groups: score condition, extreme condition, and their intersections, each reported for 1/3/6 months with sample count, unique eligible security count, average absolute price return, proportion of positive returns, mean excess versus `^GSPC`, and fraction outperforming it. Observations are pooled **signal-date events** and overlap materially; counts are not independent trials. Sector breakdown groups by each security's **current** sector. No significance test, Sharpe, causal effect, or claimed investable alpha is currently provided. Different listing classes can appear as separate securities.

## D1 persistence and release behavior

A monthly current-membership snapshot is read from `monitor-v1:members:iwb:YYYY-MM`; if missing, the user must refresh US Sectors/Industries first. Per-stock research rows, historical scores and percentiles, matured forward returns, summarized buckets, calculation version and input-source signature are persisted in `historical-research-v1:stock:<symbol>`. New source timestamps, changed history lengths or version changes trigger recomputation. An incremental, resumable job is stored under `historical-research-v1:job:iwb`. The last complete report is published under `historical-research-v1:report:iwb` after all batches finish; its contents include coverage counts and saved sector aggregates. Intermediate failures leave the last complete report visible. The endpoint intentionally makes no provider requests or live database schema changes. Temporary and historical cache retention requires future budgeting/cleanup work.

**Boundedness:** five symbols per step; each symbol reads already-cached stock, sector, index and optional prior research. A D1 lease prevents simultaneous tab requests duplicating the same batch. No large FMP backfill occurs here. Verify production CPU time and D1 request/row budget before increasing this batch size or universe size.

## Explicit research limitations

1. Current constituent selection, current classifications and share classes produce **survivorship/hindsight bias**. This is *not* a point-in-time Russell 1000 historical study.
2. ETF proxy comparisons, limited ETF lifetimes, price/volume adjustment bases, stock survivorship and FMP corporate-action revisions can change signals. Price-only returns omit dividends and transaction costs.
3. Overlapping 1/3/6-month observations and unequal listing histories can dominate pooled statistics. Strong/weak and overbought/oversold conditions are descriptive; they are not empirically validated investment recommendations.
4. Provider historic coverage beyond the current 11-year cache, active production D1 content, actual deployed Worker and time of final EOD observations are **not confirmed by source code or tests**.
5. For strategy-efficacy conclusions, acquire point-in-time membership/classifications, frozen prices/parameters, tradeable decision times, sensible holding/rebalance rules and out-of-sample walk-forward evaluation.

## Verification and future acceptance gates

Automated tests in `test/historical-research.test.js` verify calendar dates, score/percentile warmup, exact benchmark missingness, no forward leakage, and group denominators. `test/historical-research-endpoint.test.js` verifies D1-backed resumable processing, missing-coverage reporting, no new FMP calls, saved stock rows, same-origin enforcement and read-only GET. GitHub Action `.github/workflows/validate.yml` runs `npm ci`, `npm test`, and `npm run build`. A green CI dry run establishes source build/test status, **not** Cloudflare deployment, production data quality, or historical forecast validity.

Before expanding coverage beyond the cached ~11-year source, conduct bounded older-history FMP requests with timestamps, symbols, requested from/to, returned actual oldest/latest dates, population and price/volume basis, plus a measured API/D1 budget. Do not launch a 1,000-security older-history backfill without this evidence.

## 19 November 2026 — Mobile refresh reliability hotfix

The initial manual research build sends hundreds of short Worker calls. A dropped mobile request previously ended the browser loop with an opaque “Load failed” message despite persisted D1 checkpoints. The refresh UI now checks a read-only lightweight `GET /api/historical-research?universe=iwb&progress=1` endpoint after transient failures, retries with bounded backoff, and reports a resumable pause instead of discarding the completed work. Per-step processing is reduced from five stocks to two for lower peak Worker CPU use; shared sector/index histories are loaded once per request. This is a targeted robustness fix **not** a full scheduled/incremental refresh redesign. Retained per-stock and completed report caches are unchanged; no D1 migration or FMP batch is required. Real-world completion time, Cloudflare runtime errors and mobile behavior still require live verification. The checkpoint reports *progress*, not a complete research result, until final report publication.
