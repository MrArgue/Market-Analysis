import { verifyAccess } from './access.js';
import { labels, verifyInfrastructure } from './infrastructure.js';

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Infrastructure checks</title></head><body>
<h1>Infrastructure checks</h1>
<p>Each click runs one test. Do not repeat a test unless you intend another operation. Nothing runs automatically.</p>
<button type="button" data-test="d1">Insert and read one D1 test record</button>
<button type="button" data-test="fmp">Make one AAPL company profile request</button>
<pre id="result" aria-live="polite"></pre><script src="/diagnostics/client.js" defer></script></body></html>`;
const client = `let running = false;
for (const button of document.querySelectorAll('[data-test]')) button.addEventListener('click', async () => {
  if (running || !confirm(button.dataset.test === 'd1' ? 'Insert and read exactly one harmless test record? No table will be created.' : 'Make exactly one live FMP AAPL profile request?')) return;
  running = true;
  for (const item of document.querySelectorAll('button')) item.disabled = true;
  const output = document.querySelector('#result');
  output.textContent = 'Running once. Do not reload or retry until the result is known.';
  try {
    const response = await fetch('/diagnostics/' + button.dataset.test, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }), redirect: 'error',
    });
    const data = await response.json();
    output.textContent = JSON.stringify(data, null, 2);
  } catch { output.textContent = 'Result unavailable. The operation may have completed. Do not retry automatically.'; }
  // Keep buttons disabled after an attempt to avoid accidental duplicate requests.
});`;
const json = (value, status = 200) => Response.json(value, { status, headers });

export function createDiagnosticsHandler({ authenticate = verifyAccess, fetchImpl = fetch } = {}) {
  return async function diagnostics(request, env = {}, ctx) {
    // Authentication precedes every diagnostic route, method, and operation.
    const auth = await authenticate(request, env, ctx);
    if (auth.status !== 200) return json({ status: 'FAIL', error: auth.error }, auth.status);
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/diagnostics') return new Response(page, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
    if (request.method === 'GET' && path === '/diagnostics/client.js') return new Response(client, { headers: { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' } });
    if (path !== '/diagnostics/d1' && path !== '/diagnostics/fmp') return json({ error: 'Not found.' }, 404);
    if (request.method !== 'POST') return json({ error: 'Explicit POST action required.' }, 405);
    // JWT authentication alone does not prevent cross-site requests using Access cookies.
    if (request.headers.get('Origin') !== new URL(request.url).origin
      || request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
      return json({ error: 'Same-origin JSON confirmation required.' }, 403);
    }
    if (Number(request.headers.get('Content-Length')) > 128) return json({ error: 'Invalid confirmation.' }, 400);
    try {
      const text = await request.text();
      if (text.length > 128 || JSON.parse(text).confirm !== true) return json({ error: 'Explicit confirmation required.' }, 400);
    } catch { return json({ error: 'Explicit confirmation required.' }, 400); }

    if (path === '/diagnostics/d1') {
      if (!env.DB || typeof env.DB.prepare !== 'function') return json({ status: 'FAIL', error: 'DB binding is unavailable.' }, 503);
      try {
        const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'infrastructure_test'").first();
        if (!table) return json({ status: 'MIGRATION_REQUIRED', error: 'Apply the reviewed infrastructure_test migration before running this test.' }, 409);
      } catch { return json({ status: 'FAIL', error: 'Could not check the test table. Check the D1 binding.' }, 503); }
      const results = await verifyInfrastructure({ DB: env.DB }, { approveD1Write: true });
      return json({ [labels[1]]: results[labels[1]], [labels[2]]: results[labels[2]] });
    }
    const results = await verifyInfrastructure({ FMP_API_KEY: env.FMP_API_KEY }, { approveFmpRequest: true, fetchImpl });
    return json(Object.fromEntries(labels.slice(3).map(label => [label, results[label]])));
  };
}
export const handleDiagnostics = createDiagnosticsHandler();
