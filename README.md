# Russell 1000 Research Platform

Minimal Cloudflare Worker for verifying a deployment connection.

- `GET /`: displays **Russell 1000 Research Platform — Connection Successful**.
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

The configuration enables the default `workers.dev` address and declares no databases, storage, custom domains, or other paid resources. After deployment, open `/` and confirm the connection message, then request `/health` and confirm HTTP 200 and `{"status":"ok"}`. A successful health response verifies this Worker only; it does not check market data or external services.

No deployment is performed by local build or test commands. Actual deployment and its public URL must be verified separately in Cloudflare.

## Infrastructure verification

See [the operator-only verification guide](INFRASTRUCTURE_VERIFICATION.md) for the opt-in D1 and FMP checks. No public diagnostic endpoint is exposed. Do not deploy these changes until the actual `market-research-db` UUID has been added to the `DB` binding in Wrangler. Production migration and live tests require separate explicit approval.
