# IWB omitted-company audit

This audit is separate from the monitor. No Technicals layout changes, automatic
classification overrides, inclusions/exclusions or chart calculations are made.

The saved report has 85 omitted eligible holdings plus one unsupported issuer
import entry (MSGR). Derive the audit set from saved membership minus displayed
stock rows, plus issuer-import omissions. Inputs cannot specify arbitrary
tickers or endpoints. Refuse more than 120 names.

For each name, independently check:
- Exact / alias provider symbol, company name and CIK, industry, provider sector
  versus issuer sector; report an existing-identifier conflict separately.
- Current quote availability against the source report's trading-session date.
- Existing cached history where usable; otherwise probe the last three calendar
  years. Classifications failing first must not skip the history check.
- Returned history date bounds, invalid prices/volume, duplicates, missing
  sessions, latest session, 50/200/252-session price windows and the minimum 252
  prior valid ratio-distance observations. Shared benchmark/proxy omissions are
  distinguished from missing stock data.

Multiple findings can apply to a name. A short recent history is not proof of a
recent IPO, and passing three years does not certify the full 2,511-observation
percentile lookback or the complete eleven-year production-history validation.
Profile IPO dates are provider fields for context, not independent confirmation.
Audited classifications require review before any company is reinstated.

`GET /api/exclusion-audit` reads the saved audit only. Same-origin JSON POST
`{action:"start"}` initializes the fixed set; `{action:"step",id}` resumes it.
`/exclusion-audit` supplies a click-to-run operator page, outside normal navigation.
Opening it never triggers live calls automatically. Completed audits are reused
for 24 hours. Atomic work leases prevent duplicate concurrent starts; profile
checkpoints survive history-request pacing pauses.

For the current 86-name set, estimate at most 175 FMP calls: 86 profiles, up to
86 three-year histories and three batches of quotes. Cached histories reduce
this. The hard per-run ceiling is 243 calls, allowing some retries, and the
existing monitor's atomic 550-call rolling-minute budget and 429 hold ledger are
shared. No new key, binding, Access configuration or database schema is needed.
Only audit cache keys and the shared pacing ledger are written; monitor members,
histories, prepared states and reports are read-only.

Only selected public market fields and check results are exposed. Raw provider
responses, exception bodies, credential-bearing URLs and the API key are never
returned. Tests cover sector conflicts with valid history, short/malformed data,
aliases/identifiers, cache reuse, denial versus empty data, pacing checkpoints,
concurrency, read-only GET, invalid inputs and unchanged production records.

The code and offline fixtures do not establish actual per-company access.
Deployment and one bounded live audit require approval under the user's existing
instruction against unapproved production deployments. No reinstatement policy
or Technicals-column reduction should be implemented as part of this audit.
