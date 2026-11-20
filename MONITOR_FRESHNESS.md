# Sectors/Industries freshness and loading — 20 November 2026

## Decision and rationale

User screenshot showed a saved S&P 500 1-day return near -0.2% while a newer negative trading session was already complete. The holdings-as-of label (IWB 2026-10-29) was being mistaken for price date, because the latter was not prominently displayed. The page also automatically initiated the entire full-universe refresh on every visit, even with an existing saved report.

## Behavior

- The Sectors/Industries tab reads its last successfully published D1 snapshot immediately. **Opening the tab does not automatically run a new provider batch or recalculate the universe.** Users explicitly select Refresh Data.
- A prominently displayed **Market data as of YYYY-MM-DD** label uses report `asOf` from the actual S&P 500 quote session, and a separate **STALE** warning compares it with the latest expected NYSE session. The IWB holdings date remains a separate field.
- The monitor refuses to publish a new report when the benchmark quote is older than the expected US market session. The expected date follows America/New_York and scheduled NYSE weekdays/regular holidays. Before 9:30 ET use the last completed session; from 9:30 onward accept the current regular-session date. Provisional intraday prices remain identified as provisional. Irregular market closures are not automatically inferred; special sessions require explicit treatment.
- The previous complete report remains available if new data are stale. No changes to formulas, benchmark selection, FMP secret handling, sector returns or D1 schema. The refresh remains manual and multi-step, rather than a newly scheduled background process.

## Validation boundaries

Unit tests cover Friday 2026-11-20 premarket requiring 2026-11-19, weekends, Thanksgiving and Good Friday, and market open transition. D1 integration regression rejects 2026-11-18 S&P 500 quotes as stale at the 2026-11-20 05:30 ET check. Run `npm test` and `npm run build` through CI.

This corrects the *misleading date and automatic load* and adds a quote freshness guard; it does **not** establish that the specific production FMP subscription can deliver timely post-close daily prices. Verify quote timestamps and the latest stored D1 report in production diagnostics before attributing the precise screenshot failure to one upstream component. Do not deploy new paid resources, migrations or large market-data backfills as part of this change.
