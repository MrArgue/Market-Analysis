# IWB universe and technical breadth monitor

## Account validation completed before implementation

PR #33 was explicitly approved, merged and deployed. The bounded live check ran
October 31, 2026 at 16:10 UTC using 17 FMP calls and the existing server-side key.
No HTTP access denials occurred. Profiles for AAPL, SNOW and VIRT returned sector,
industry and company identifiers. Each had close/volume history across the
requested eleven-year span in three <= five-year windows; SNOW naturally starts
at its 2020 IPO. Older S&P 500, XLK and XLC histories worked (XLC starts in 2018).
FMP omitted ^GSPC from a mixed quote batch; retain the separate quote fallback.
These results validate the endpoint pattern, not every individual holding.

Actual issuer CSV dated October 29: 1,023 supported equities, 99.95% of displayed
fund weight; MSGR has issuer sector Other and is excluded/audited. The source is
IWB holdings, not official Russell membership. Six share-class ticker aliases
normalize spaces to hyphens. A failed FMP identity/classification lookup excludes
that holding rather than guessing. Known S&P constituent classifications are
reused when their sector agrees with the issuer; other names use FMP profiles.
Aerospace & Defense cannot appear under Information Technology.

## Interface

`/sectors` defaults to IWB; the universe selector retains S&P 500 as an option.
Top-right Returns / Technicals radios change columns locally. Returns retain the
balanced two-column presentation; Technicals use one wide table so the larger
column set can be read together. Narrow screens scroll within the table. Stocks
remain collapsed by default; expansion persists while changing views and makes
no requests. S&P official price returns stay first in Returns; Technicals put the
selected universe's company breadth first.

`/sectors?sample=1` is an explicitly fictional, credential-free layout preview.
It imports static sample data and makes no monitor / FMP requests. Production
data uses the normal URL. The temporary PR #33 public access-check routes are
retired; their code/tests remain as audit fixtures.

## Calculations

Agreed columns: average technical score, percent strong (>=5), weak (<=1),
overbought, oversold, above 50/200-day price means, advancing/declining, and at
20/63/252-session closing highs/lows. Per-stock scores and percentile signals
match Tech Chart defaults (50/200, 2,511 prior valid distances, minimum 252,
5th/95th inclusive cutoffs). ETF proxies remain the same as Tech Chart; the S&P
500 remains the relative-market benchmark even in the IWB universe.

Each CIK company gets one vote. Its valid listed class metrics are averaged,
then company votes are averaged directly for each industry, sector and universe.
Each column has an independent valid-company denominator. Missing is not zero;
short-history companies can contribute to daily breadth without qualifying for
long-history signals. Missing historical volume suppresses the six-part score;
independent closing-price metrics can remain available. Missing sessions reduce
long-window coverage. Percentile history is limited by stock/ETF inception.

Current regular-session price is compared with the preceding N completed closes
for closing highs/lows; ties count. Current price is included in price SMAs.
Unchanged stocks are neither advancing nor declining but remain in denominators.
Stock rows show individual Yes/No flags and the score; group rows show percentages
and an average score. Quote-based values are provisional intraday; after-hours
trades are excluded. Percentile ranks are available in stock flag tooltips.

Returns remain value-weighted. IWB uses issuer market value / issuer price to
estimate class-specific holding quantities, avoiding company-cap duplication.
S&P retains its prior company-cap allocation method. All required return bases
and listed classes must be present for a company to enter aggregate Returns.
Individual stock returns can show shorter available periods. These are price
returns with current holdings/estimated units, not historical official indices.
Survivorship/hindsight bias and exclusion effects apply.

## Storage and refresh

All new keys use `monitor-v1:` in existing `market_history_cache`. No migration,
binding, Access or secret changes. Persist each symbol's OHLCV as compact arrays;
retain it across calendar-month membership changes. New symbols receive eleven
years in <=five-year windows. Later sessions append a small overlapping date
range. Changed CIK or price split basis triggers targeted full repair. Persist
partial range downloads so rate-limit pauses do not redownload healthy segments.

Prepare per-stock next-session state: prior ratio/OBV sums, closing thresholds,
and a sorted percentile reference sample. This matches a full chart calculation
without rescanning all years on each quote refresh. Warm refreshes process up to
12 saved states per invocation. Cold history/technical work processes one stock
per invocation. Shared benchmark/proxy histories are reused by all stocks.

Report construction is chunked. Persist groups separately below D1 row-size
limits; retain current and previous report generations and reclaim older report
and temporary work chunks. Persisted histories have no calendar-month expiry.
Latest-snapshot GET never calls FMP. The browser auto-refreshes on visits, with
up to 60-second report caching. Last successful data remains visible while a
resumable build runs; keep the tab open to advance it. No scheduler was added.

## 750-call/minute account limit

An atomic D1 sliding-window reservation limits this monitor to 550 FMP calls in
any 60 seconds, shared across its two universes. Atomic per-universe work leases
prevent duplicate tabs from performing the same step. Four quote batches max
per invocation; 40 symbols per batch. HTTP 429 pauses honor Retry-After and keep
checkpoints. Chart/other applications using the same key are outside this
limiter; the 200-call margin is not a guarantee against unrelated heavy usage.

For the current issuer file, the first IWB preparation is roughly 3,600–3,700
FMP calls, including ~3,069 history ranges, ~525 added-company profiles, reference
histories and quote batches. Pacing alone means at least seven minutes, with
network/storage overhead adding time. The first refresh for a new session may
need ~1,000 incremental history calls. Later same-session refreshes reuse all
healthy histories and primarily need ~26 quote batches plus an index fallback.
Monthly membership changes do not redownload healthy long histories.

## Verification and remaining live gate

Tests compare stock scores/ranks with the chart calculation; verify independent
coverage and company/class weighting, ties, missing sessions/volume, normal warm
refresh, new sessions/months, transient failures, split repair, concurrent tabs,
real SQLite leases/sliding limits, and a complete simulated 1,023-stock build
with per-invocation D1 operations below 50 and partitions below 1.8 MB. Client
tests cover view switching without API work, expansion, universe changes, and
saved/fresh snapshot races. Existing chart and Signature regression tests remain.

Full live-universe coverage and actual warm-refresh latency require the next
approved deployment and initial paced build. Samples are not a full coverage
certificate. Deployment is intentionally not part of the PR #33 approval.

## Live resource-limit recovery

PR #34 was approved and deployed. The initial live build persisted 156 stocks,
but repeatedly received HTTP 503 / Cloudflare 1102 (Worker exceeded resource
limits), distinct from an FMP quota/entitlement error. The diagnostic response
was captured from the public monitor API; no key was read or exposed. Cloudflare
documents 1102 as a CPU or memory limit failure. The existing local simulation
did not reproduce Cloudflare's per-invocation resource enforcement.

Recovery splits each stock into one-range downloads, a separate merge, then
technical preparation. Profiles yield before history work. Quote batches are
one per request; warm technical batches are six stocks. Large immutable job
metadata is stored separately, with only profile deltas/checkpoints rewritten.
Compact close-only benchmark views avoid repeatedly decoding unused OHLCV.
Existing persisted OHLCV, prepared stocks and partial ranges are retained.

Report assembly first partitions saved records, then reads/calculates one sector
at a time. Sector/universe technical totals retain eligible-company weighting;
conflicting CIK classifications are audited/excluded to keep sector company sets
disjoint. Reports stream already-serialized group JSON, avoiding a combined
parse/reserialize of the entire stock table in one Worker invocation. Temporary
partition records and old metadata are reclaimed.

The client retries transient non-JSON 5xx/network responses up to three times,
then explicitly explains that Refresh data resumes saved progress. An abandoned
step lease expires after 60 seconds. No CPU/plan/billing/security settings change.
FMP call scope and the shared 550-per-minute sliding limit are unchanged, though
the first build now uses more small HTTP steps and may take substantially longer
than its seven-minute API-pacing lower bound. Live verification is still required
before claiming that the resource-limit failure is resolved.

## Workers Paid tuning

The user confirmed the failures were CPU limit errors on Workers Free, then
upgraded to Workers Paid and requested continuation using the new capacity.
The existing saved build resumed past its previous checkpoint without a CPU
error in the initial paid-plan verification. Full completion remains the gate.

Bounded paid-plan batches now process up to four cold stocks (up to twelve
history ranges plus profiles), or 24 prepared stocks, per request. Profiles,
range downloads, merges and state preparation can share a request again; each
range is still persisted before moving on. Quotes use four batches per request;
partitioning handles four chunks and sector reads 24 chunks per request. Cold
stock work is sequential, keeping outgoing connection use bounded. Work leases
cover up to five minutes of wall time to accommodate worst-case network waits.

The same 550-call sliding budget, retry checkpoints, immutable metadata, compact
reference closes, sector-by-sector calculation and streamed report delivery are
retained. No subscription/billing/CPU-limit setting or secret is changed by code.
Tests bound paid batches below 150 D1 operations and twelve stock-history calls
per invocation, while retaining full load, migration, rate-limit and parity tests.
