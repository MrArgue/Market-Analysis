# Protected production diagnostics

This feature reuses the existing verification function inside the deployed Worker. It requires a signed Cloudflare Access application token and an exact authorized email match. It does not trust the identity email header alone. Without the settings below it returns 503; missing/invalid tokens return 401, and a different authenticated email returns 403. Homepage and `/health` remain independent of Access and credentials.

## Configure Access before using diagnostics

No account-specific Access configuration was present in the repository. Do not invent the following values or paste an FMP key into code. If you already have an Access application protecting this hostname/path, reuse it and its login method.

1. Open Cloudflare Zero Trust → Access → Applications. Find or configure a **Self-hosted** Access application covering your production Worker hostname and `/diagnostics` **and all paths below it**, including `/diagnostics/d1`, `/diagnostics/fmp`, and `/diagnostics/client.js`. Protect the page and every action. Use a hostname supported by Access; if your current workers.dev address cannot be covered by your Access setup, use an existing Access-supported custom hostname. Do not create paid resources to work around this.
2. Set an **Allow** policy restricted to your exact email address using your existing identity provider or Access email one-time PIN. Do not use Everyone, Bypass, or a public/service-token-only policy for this browser interface. Confirm that you have a Zero Trust plan/seat available before enabling anything chargeable.
3. Copy the application's **Application Audience (AUD)** value. Find your Access team domain, such as `your-team.cloudflareaccess.com`.
4. In the production Worker **Settings → Variables and Secrets**, add these non-secret text variables:
   - `ACCESS_TEAM_DOMAIN`: your actual team hostname only, without `https://` or a path.
   - `ACCESS_AUD`: this application's actual audience value.
   - `DIAGNOSTICS_AUTHORIZED_EMAIL`: your exact authorized login email.
5. Keep the existing `DB` binding and `FMP_API_KEY` secret unchanged. Do not add these production credentials or authentication settings to previews. Save the Worker settings and deploy the reviewed code through your normal Git workflow when you choose. This change does not deploy itself from the developer CLI.
6. Confirm that all alternative public hostnames also reject diagnostics without a valid token. Worker-side verification enforces this even if an alternative hostname is outside Access's login redirect. A direct unauthenticated request must not run a test.

The JWT signing keys are read from your configured Access team domain's `/cdn-cgi/access/certs` endpoint and cached. Only RS256 tokens with the configured issuer/audience, expiry, issued-at, subject and email claims are accepted. Missing or failed key retrieval fails closed. No authentication token or key is logged by this code.

## Run each test deliberately

1. Open `https://YOUR-WORKER-HOSTNAME/diagnostics` in your browser. Use your real Worker address. Sign in through Access as the configured email.
2. Merely opening the page performs **no D1 queries or FMP calls**. There are two separate buttons.
3. To test D1, click **Insert and read one D1 test record** and accept the confirmation. It first checks for the table. If absent, the response is `MIGRATION_REQUIRED` and nothing is inserted or created. After separately reviewing and approving the existing migration, apply it as described in `INFRASTRUCTURE_VERIFICATION.md`, then return to the page for a new explicitly approved test. Do not run the full migration list blindly.
4. If the table exists, that action inserts one record and reads it back. It returns only D1 PASS/FAIL results. It never deletes, overwrites, or returns research data or the test row. A failure after the insert may leave that one record behind.
5. To test FMP, open the page again, click **Make one AAPL company profile request**, and accept the confirmation. It reads the Worker's existing `FMP_API_KEY` binding and makes one request with no redirects or retries. It returns only secret-presence, connectivity, and response-validation PASS/FAIL results. Missing credentials cause no request. A denied subscription/key or rate limit is reported without the response body or request URL.
6. Buttons remain disabled after an attempt to prevent accidental repeated clicks. Reload only when you deliberately want to perform another test. A lost connection does not prove the action failed; do not automatically repeat it. There is no durable replay protection: each newly confirmed POST can perform another test.

POST actions require an authenticated token, a matching Origin header, JSON content type, and an explicit confirmation body. Tests are not triggered by GET, page load, health checks, migration runs, or deployment. The UI has no third-party scripts; responses are uncached and cannot be framed.

## Validation and limitations

Automated tests use locally generated signed JWTs, local signing keys, mock D1, and mock FMP. They cover invalid authentication, wrong identity, signature/audience/issuer/expiry checks, cross-origin rejection, migration-required behavior, exactly one insert/read or API request, and sanitized errors. No live FMP calls, production writes, migrations, or deployments were run while implementing this feature.

Production Access routing, policy, actual signing-key retrieval, database access, secret presence, and FMP subscription access still require the manual checks above. A missing table cannot be fixed from the diagnostic page. No infrastructure or paid resources are provisioned by this code.
