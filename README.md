# Russell 1000 Research Platform

Responsive OHLC stock chart with sector ETF comparisons, served by the existing Cloudflare Worker, with FMP history and a D1 cache. See [the chart controls and sector ETF update](CHART_UPDATES.md) and [the workbook formula audit](TECHNICAL_METHODOLOGY.md).

- `GET /`: displays the technical chart app; page load performs no market requests.
- `GET /chart.js`: serves the chart controls without external scripts.
- `GET /api/chart`: Public market history, six-component score and extreme indicators. Requires the existing secret/binding and separately approved cache migration.
- `GET /health`: returns HTTP 200 with `{"status":"ok"}` and caching disabled.
- Other paths return 404; unsupported methods return 405.

## Local development and validation

Use Node.js 22 or newer:

```sh
npm ci
npm test
npm run build
npm run dev
```

`npm run build` bundles the Worker with Wrangler's dry-run mode. It does not deploy or require Cloudflare credentials. Local development uses the local Workers runtime. Check the homepage and `/health` at the address printed by Wrangler.

## Deployment verification

In the existing **market-analysis** Worker, open **Settings → Builds** and verify:

- Git repository: `MrArgue/Market-Analysis`.
- Production branch: `main`, after merging the pull request containing this application. The original `main` contains only `Test file` and cannot deploy a Worker. To validate before merging, select the feature branch containing these files instead.
- Root directory: repository root (leave blank or use `/` as the dashboard permits), not `src` or `dist`.
- Build command: `npm ci && npm run build`.
- Deploy command: `npx wrangler deploy` (equivalently `npm run deploy`).
- Node.js: 22 or newer. If the build image defaults to an older version, set the non-secret build variable `NODE_VERSION` to `22`.

`wrangler.jsonc` must be committed at the repository root alongside `package.json` and `package-lock.json`. Its Worker name is `market-analysis` and its entry point is `src/index.js`, relative to that root. Wrangler bundles this source directly; `dist` is only the ignored output of local dry-run validation and is not the configured entry point.

Keep the existing Worker on the Free plan. Cloudflare manages authentication for its Git integration; do not add API keys to this repository. Do not create another Worker or paid bindings to resolve a build failure.

For a deployment-free check of the exact deploy command, run:

```sh
npx wrangler deploy --dry-run
```

If deployment still fails with these settings, inspect the Cloudflare build log for the first error. Local dry-run validation verifies configuration and bundling, but cannot verify the dashboard's selected branch, Cloudflare-managed permissions, or account-specific deployment restrictions.

The configuration retains the existing `workers.dev` address and D1 binding. After an approved deployment, open `/` and confirm the chart controls, then request `/health` and confirm HTTP 200 and `{"status":"ok"}`. A successful health response verifies this Worker only; it does not check market data or external services.

No deployment is performed by local build or test commands. Actual deployment and its public URL must be verified separately in Cloudflare.

## Infrastructure verification

See [the operator-only verification guide](INFRASTRUCTURE_VERIFICATION.md) for the opt-in D1 and FMP checks. Worker diagnostics require native Cloudflare Access identity verification; see [Access setup and manual tests](ACCESS_DIAGNOSTICS.md). Wrangler binds `DB` to the existing `market-research-db` database. Production migration and live tests require separate explicit approval.

## Pull-request previews

The empty `previews` block enables Worker Previews without production bindings. The homepage and `/health` need no database or API credentials.

In Cloudflare's preview build settings, use `npm ci && npm run build` for the build command and `npx wrangler preview --ignore-base-config` for the deploy command. The flag prevents dashboard Preview base configuration from adding database bindings or secrets. Keep the root directory at the repository root and use Node.js 22 or newer. Leave production commands and the production `DB` binding and `FMP_API_KEY` secret unchanged.

Do not add `DB`, `FMP_API_KEY`, or production resources to Preview settings. A warning that production bindings are absent from previews is expected. Preview deployment itself is performed by Cloudflare's pull-request build, not by local validation. The pinned Wrangler supports Worker Previews, but its preview command has no dry-run option; local validation uses Wrangler's configuration parser, route tests without credentials, and the deployment dry-run build.

## Access-protected diagnostic page

See [ACCESS_DIAGNOSTICS.md](ACCESS_DIAGNOSTICS.md) for the existing All traffic Worker Access protection, authorized-email setting, and separate manually confirmed D1 and FMP actions. Diagnostics fail closed until configured; no tests run on page load or deployment.

## Public chart access

The chart page and `/api/chart` do not require a signed-in identity. `/diagnostics` routes retain their native Access identity and authorized-email checks and reject anonymous requests. The FMP key stays server-side. Input validation, error redaction, read-only methods and the existing D1 history cache remain in place. Anonymous requests use the configured FMP allowance; no rate-limit resource or new infrastructure is added.

Worker-wide Access must be disabled for public chart use, unless a broader account/hostname policy still requires sign-in. To use operator diagnostics, protect only `/diagnostics` and `/diagnostics/*` through a separate hostname/path Access application. Without a trusted identity these routes fail closed.