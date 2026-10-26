# Protected production diagnostics

This feature reuses the existing verification function inside the deployed Worker. It trusts only Cloudflare's runtime-provided `ctx.access` and `await ctx.access.getIdentity()`, followed by an exact authorized email match (case-insensitive). Request headers are never used to establish identity. Missing authorized-email configuration returns 503; absent Access context/identity or failed identity retrieval returns 401; a different authenticated email returns 403.

## Configure native Worker Access before using diagnostics

1. In **Workers & Pages → market-analysis → Access**, keep your existing **All traffic** protection and **Cloudflare account members** policy enabled. This protects production and preview URLs. There is no need to create a separate hostname-based Access application for this implementation.
2. In the production Worker's **Settings → Variables and Secrets**, add the non-secret text variable `DIAGNOSTICS_AUTHORIZED_EMAIL` with the exact email you use to sign in. The account-members policy admits account members to the application; this additional check limits diagnostics to this single email.
3. Keep `DB` and `FMP_API_KEY` unchanged. `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are no longer required or read by this code. If you previously added them, they can remain unused or be removed separately in the dashboard. Never copy the FMP key into these settings or the repository.
4. After you choose to merge and deploy the reviewed feature branch through the normal Git workflow, use the protected diagnostic page. This implementation work does not deploy anything.
5. Keep production DB and FMP credentials out of Preview settings. Diagnostics in a preview without an authorized email must fail closed. If you explicitly configure the email for preview testing, the page can authenticate, but missing production resources must remain unavailable.

Cloudflare authenticates the request before invoking the Worker and exposes the trusted identity through `ctx.access`. No JWT parsing, audience variable, JWKS fetch, authentication dependency, or extra compatibility flag is required by this API. A forged email header or JWT header cannot replace a missing runtime identity. See [Cloudflare's native Access documentation](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

### Compatibility and static assets

The current Worker has `main: src/index.js` and serves HTML and the diagnostic JavaScript directly from its fetch handler. It has no Wrangler `assets` binding, static-assets directory, Vite plugin, framework deployment configuration, Service Binding proxy, or RPC entry point. The compatibility date remains `2026-10-26`. Native Access is appropriate for this direct invocation setup.

Cloudflare documents that `ctx.access` is not propagated through Service Binding/RPC calls or the internal Static Assets router. If Static Assets or a framework that generates an assets configuration is added later, review authentication before deploying that change. In such a setup this code rejects diagnostics rather than trusting headers as a fallback. The homepage and `/health` retain their behavior; your existing All traffic Access policy controls who reaches the application.

## Run each test deliberately

1. Open `https://YOUR-WORKER-HOSTNAME/diagnostics` in your browser. Use your real Worker address. Sign in through Access as the configured email.
2. Merely opening the page performs **no D1 queries or FMP calls**. There are two separate buttons.
3. To test D1, click **Insert and read one D1 test record** and accept the confirmation. It first checks for the table. If absent, the response is `MIGRATION_REQUIRED` and nothing is inserted or created. After separately reviewing and approving the existing migration, apply it as described in `INFRASTRUCTURE_VERIFICATION.md`, then return to the page for a new explicitly approved test. Do not run the full migration list blindly.
4. If the table exists, that action inserts one record and reads it back. It returns only D1 PASS/FAIL results. It never deletes, overwrites, or returns research data or the test row. A failure after the insert may leave that one record behind.
5. To test FMP, open the page again, click **Make one AAPL company profile request**, and accept the confirmation. It reads the Worker's existing `FMP_API_KEY` binding and makes one request with no redirects or retries. It returns only secret-presence, connectivity, and response-validation PASS/FAIL results. Missing credentials cause no request. A denied subscription/key or rate limit is reported without the response body or request URL.
6. Buttons remain disabled after an attempt to prevent accidental repeated clicks. Reload only when you deliberately want to perform another test. A lost connection does not prove the action failed; do not automatically repeat it. There is no durable replay protection: each newly confirmed POST can perform another test.

POST actions require a native authenticated Access identity, a matching Origin header, JSON content type, and an explicit confirmation body. Tests are not triggered by GET, page load, health checks, migration runs, or deployment. The UI has no third-party scripts; responses are uncached and cannot be framed.

## Validation and limitations

Automated tests simulate the runtime Access context and mock D1 and FMP. They cover authorized identity, absent/failed identity, wrong email, spoofed headers, entry-point context propagation, cross-origin rejection, migration-required behavior, exactly one insert/read or API request, and sanitized errors. No live FMP calls, production writes, migrations, or deployments were run while implementing this feature.

Production Access routing, policy, actual native identity retrieval, database access, secret presence, and FMP subscription access still require the manual checks above. A missing table cannot be fixed from the diagnostic page. No infrastructure or paid resources are provisioned by this code.

## Preserve and verify the production email variable

`keep_vars: true` tells Wrangler to preserve dashboard-managed text/JSON variables during deployments. This is necessary because `DIAGNOSTICS_AUTHORIZED_EMAIL` is configured privately in the dashboard, not in source. Wrangler preserves existing secret bindings separately; `keep_vars` is not what protects `FMP_API_KEY`. This setting does not restore a previously deleted variable.

After the configuration fix is merged and you choose to deploy it:

1. Open **Workers & Pages → market-analysis → Deployments**. Confirm that the active production deployment is built from the new main commit containing `keep_vars: true`. Retrying an older build uses its older configuration and can delete the variable again.
2. In the production Worker's **Settings → Variables and Secrets**, confirm the exact name `DIAGNOSTICS_AUTHORIZED_EMAIL`. Add it as Text if missing, using your exact Access login email with no quotes, spaces, or newlines. Use the dashboard's Save/Deploy action if offered so it applies to the active Worker, rather than only an inactive version. Do not share the value or screenshots containing it.
3. Confirm `FMP_API_KEY` remains listed as a Secret without revealing its value. Leave the production DB binding and Access policy unchanged.
4. Sign in and open `/diagnostics`. Opening the page performs no D1 or FMP test. If the page displays its buttons, the active runtime has received a valid email setting and your native Access identity matches it. Do not click a test button merely to check configuration.
5. If the same configuration error remains, the runtime still sees a missing/non-string/invalid email value. Recheck the active deployment, environment selection, spelling, and formatting. An identity mismatch produces a different error; it does not produce the configuration error.

A dry-run cannot inspect or confirm dashboard variables in production. No API key or personal email needs to be committed or printed to verify the setting.

## FMP redirect handling

The server-side request uses Workers-supported `redirect: 'manual'`. Every HTTP 3xx response is rejected without following it or returning its Location header. The unsupported `error` redirect mode throws before network I/O in Workers and must not be used here. Each confirmation still allows only one request, with a 15-second timeout and no retries. Sanitized failures distinguish rejected redirects, HTTP errors, unsupported runtime options, timeouts, invalid JSON, and network/response-transfer failures. A generic TypeError is treated as a possible network failure, not automatically blamed on configuration. No raw exception message or request URL is returned.
