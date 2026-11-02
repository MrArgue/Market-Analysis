# Macro prototype verification — November 1, 2026 Pacific

Base revision: `76cb741bbbcb47e4c32998fb42f34191326783e7`. Feature branch: `feature/macro-regime-research`.

## Fresh results

- `node --test test/*.test.js`: **227 tests; 226 passed, zero failed, one existing source-deck assembly test skipped**. Includes release cutoffs/revisions, frozen prior-only normalization, stale/missing components, next-session/anniversary return timing, missing/provisional prices, immature horizons, uncertified return bases, sample modes, deterministic block intervals, public routes, closed diagnostics, browser serialization and actual bundled engines.
- `node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir dist`: passes, existing DB binding only. Dry run does not deploy or migrate.
- Chrome/Playwright local macro test: **one passed**. Imports deterministic fictional inputs, changes strategic/tactical views, horizons and sample modes, checks no provider/API requests during local calculation, checks browser errors, captures mobile screenshot. Mobile screenshot visually reviewed; table scrolls horizontally. This validates interface/calculation integration, not provider data or production behavior.
- Source probe: **two** read-only public FRED requests, exact results in `macro-source-probe.json`. INDPRO current history passed twelve-row check; CPI current history failed completeness with eleven usable rows. ALFRED/FMP checks skipped because credentials are absent. No authenticated data access success claimed.
- `git diff --check`: run before commit. Worker/D1 configuration, schema, Access handler, technical engine and existing provider adapters unchanged. Existing forward-return browser helper now additionally exports median/blockInterval for reuse; its original exports and calculations remain intact.

The initial browser run caught a bundle-scope error; fixed by making macro return helpers self-contained and adding a bundled nonempty-return regression. Final results above are after that fix.

## Environment notes

Node v24.22.1; Wrangler 4.153.0. npm is absent from this shell. Reused the already-installed workspace dependencies through a local ignored junction; the two parsed lockfiles match (file-byte hashes differ by one trailing blank line). This is not a fresh `npm ci` claim. Standard `npm test` / `npm run build` delegate to the same test runner and dry-run build in a normal Node/npm environment. Initial restricted browser port access failed; local browser checks succeeded with approved local process access and installed Chrome via `PLAYWRIGHT_EXECUTABLE_PATH`. No browser download or account-setting change was made.

## Remaining gates

This is a reviewable **offline research prototype**, not completion of live-data certification. Missing ALFRED and FMP credentials prevent account entitlement, historical vintage reconstruction and dividend-adjusted ETF coverage tests. Only two current macro histories were checked; no complete six-series PIT dataset or asset return history is bundled. High-frequency indicators/nowcasts were evaluated as candidates but are not validated inputs to this v1 model. Versioned historical ingestion, independent adjustment/calendar reconciliation, full input provenance review, and frozen walk-forward/holdout evaluation remain future work. Imported attestation flags are not cryptographic proof of data quality.

No merge, deployment, production migration, production D1 write, production seed, large API batch, secret/binding change or new infrastructure occurred. PR remains draft for methodology, dataset and implementation review.
