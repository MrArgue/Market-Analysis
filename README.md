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

Connect this GitHub repository through Cloudflare Workers' Git integration using the Cloudflare dashboard and select the Workers Free plan. Use `npm run build` as the build command and `npm run deploy` as the deploy command, with the repository root as the project directory. Cloudflare manages authentication for its Git integration; do not add API keys to this repository.

The configuration enables the default `workers.dev` address and declares no databases, storage, custom domains, or other paid resources. After deployment, open `/` and confirm the connection message, then request `/health` and confirm HTTP 200 and `{"status":"ok"}`. A successful health response verifies this Worker only; it does not check market data or external services.

No deployment is performed by local build or test commands. Actual deployment and its public URL must be verified separately in Cloudflare.
