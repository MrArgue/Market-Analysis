# Manually verify infrastructure

Nothing here runs during deployment, a homepage request, or a health check. There is no public diagnostic endpoint. The diagnostic module accepts server-side `env.DB` and `env.FMP_API_KEY` bindings; it is deliberately separate from the public Worker.

## 1. Confirm the configuration

The root `wrangler.jsonc` keeps Worker name `market-analysis` and defines `DB` for `market-research-db` using the supplied database UUID `3e7f4084-745f-470c-89cf-b5eb2461179c`. Its migrations directory is `migrations`. The UUID is an identifier, not a credential. No new database is created by this binding.

In **Workers & Pages → market-analysis → Settings → Bindings**, confirm `DB` refers to that database. Confirm `FMP_API_KEY` is listed as a **Secret** for the production Worker. Never paste its value into GitHub, chat, screenshots, or logs. The presence of a dashboard secret cannot be confirmed from a local process.

## 2. Table creation requires your approval

The committed migration only creates `infrastructure_test` if absent, with an integer primary key, timestamp, and message. It never deletes records or changes an existing table. If that table already exists with a different schema, stop and review it rather than overwriting it.

After explicitly approving the production migration, an authorized operator can log in using Cloudflare's browser-based login (no pasted API token), inspect pending migrations, and apply them:

```sh
npx wrangler login
npx wrangler d1 migrations list market-research-db --remote
npx wrangler d1 migrations apply market-research-db --remote
```

Review the pending list first: the apply command can apply other pending migrations too. These commands have NOT been run against production by this change.

## 3. Run the operator-only CLI when you approve the tests

The CLI uses your Cloudflare login to access the configured remote D1 database. It does not access the Worker over HTTP. It makes one insert and one select; a failed read can leave the one inserted test row. There are no write retries and no cleanup deletes.

Cloudflare does not allow reading the existing secret back. In a trusted local Bash terminal, use the existing FMP key from your private FMP account. This temporarily supplies it to the CLI, not to a webpage. The prompt hides your input and keeps the key out of command history:

```sh
npm ci
npx wrangler login
read -r -s -p 'FMP key (hidden): ' FMP_API_KEY; printf '\n'
export FMP_API_KEY
npm run verify:infrastructure -- --approve-d1-write --approve-fmp-request
unset FMP_API_KEY
```

Only run this after approving the migration and both tests. Each invocation with these flags can add one record and consume one FMP request. Do not repeat it automatically. Without the flags, neither operation executes. Missing credentials result in FAIL rather than a request.

The single FMP request uses the documented [stable Company Profile API](https://site.financialmodelingprep.com/developer/docs/stable/profile), symbol `AAPL`. It does not follow redirects or retry. It requires an HTTP success and exactly one object with `symbol: AAPL` and a nonempty `companyName`. A 401/403 can mean a key or subscription entitlement problem; this tool cannot confirm Starter plan access in advance. A 429 means stop and wait rather than retrying. No historical or bulk data is requested.

## 4. Understand the six results

The CLI prints only PASS/FAIL and sanitized explanations for:

- Worker configuration
- D1 binding available
- D1 read/write test
- FMP secret present
- FMP API connectivity
- FMP response validated

In this CLI, “D1 binding available” means the binding has a valid configuration and a CLI adapter is available; the read/write result establishes actual database access. “FMP secret present” means the local operator supplied a value; it does **not** prove the production Worker has the secret. The connectivity test proves that supplied key works, not that Cloudflare can reach FMP from the deployed Worker. Confirm the production binding and secret names in the dashboard separately. End-to-end execution inside the production Worker remains unverified; it would require a separately approved authenticated interface. No such interface or new authentication secret is added here.

A FAIL exits with a nonzero status. HTTP bodies, database records, request URLs, key values, and raw exceptions are never printed by the diagnostic reporter. Keep terminal output private; do not enable shell tracing, HTTP debug logging, or Wrangler verbose logging while handling credentials.

## Local validation (no real API requests)

```sh
npm test
npm run build
npx wrangler deploy --dry-run
```

Tests mock both FMP and D1. The migration can also be checked against a disposable local SQLite database; this does not verify remote D1 permissions. No production migration, live FMP request, or deployment is part of these checks.
