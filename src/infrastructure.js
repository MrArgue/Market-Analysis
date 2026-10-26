// Shared by the operator CLI and Access-authenticated diagnostic actions.
export const labels = [
  'Worker configuration', 'D1 binding available', 'D1 read/write test',
  'FMP secret present', 'FMP API connectivity', 'FMP response validated',
];

export async function verifyInfrastructure(env, {
  configurationValid = false,
  approveD1Write = false,
  approveFmpRequest = false,
  fetchImpl = fetch,
} = {}) {
  const results = Object.fromEntries(labels.map(label => [label, { status: 'FAIL', error: 'Not run.' }]));
  const pass = label => { results[label] = { status: 'PASS' }; };
  const fail = (label, error) => { results[label] = { status: 'FAIL', error }; };
  if (configurationValid) pass(labels[0]);
  else fail(labels[0], 'Expected market-analysis Worker and market-research-db DB binding configuration.');

  if (env.DB && typeof env.DB.prepare === 'function') {
    pass(labels[1]);
    if (!approveD1Write) fail(labels[2], 'Test write requires explicit approval.');
    else {
      try {
        const message = `infrastructure-check-${crypto.randomUUID()}`;
        await env.DB.prepare('INSERT INTO infrastructure_test (message) VALUES (?)').bind(message).run();
        const row = await env.DB.prepare('SELECT id, created_at, message FROM infrastructure_test WHERE message = ? LIMIT 1').bind(message).first();
        if (row && Number.isInteger(row.id) && typeof row.created_at === 'string' && row.created_at.length > 0 && row.message === message) pass(labels[2]);
        else fail(labels[2], 'Inserted test record could not be validated.');
      } catch {
        fail(labels[2], 'D1 operation failed. Check authorization, binding, and approved table migration. No retry was attempted.');
      }
    }
  } else fail(labels[1], 'DB binding is unavailable.');

  if (typeof env.FMP_API_KEY !== 'string' || !env.FMP_API_KEY.trim()) {
    fail(labels[3], 'FMP_API_KEY is missing from this execution environment.');
    return results;
  }
  pass(labels[3]);
  if (!approveFmpRequest) {
    fail(labels[4], 'Live API request requires explicit approval.');
    return results;
  }
  // FMP stable Company Profile API: one symbol, one request, no retries or redirects.
  const url = new URL('https://financialmodelingprep.com/stable/profile');
  url.searchParams.set('symbol', 'AAPL');
  url.searchParams.set('apikey', env.FMP_API_KEY);
  let signal;
  try {
    signal = AbortSignal.timeout(15000);
    const response = await fetchImpl(url, { redirect: 'manual', signal });
    if (response.status >= 300 && response.status < 400) {
      fail(labels[4], 'FMP returned an HTTP redirect (3xx); it was not followed. No retry was attempted.');
      return results;
    }
    if (!response.ok) {
      const explanation = response.status === 401 || response.status === 403
        ? 'Authentication or subscription access denied (401/403).'
        : response.status === 429 ? 'Rate limit reached (429); no retry attempted.'
          : `FMP returned HTTP ${response.status}. No retry was attempted.`;
      fail(labels[4], explanation);
      return results;
    }
    pass(labels[4]);
    const data = await response.json();
    if (Array.isArray(data) && data.length === 1 && data[0]?.symbol === 'AAPL'
      && typeof data[0].companyName === 'string' && data[0].companyName.trim()) pass(labels[5]);
    else fail(labels[5], 'Response did not contain one usable AAPL company profile.');
  } catch (error) {
    const target = results[labels[4]].status === 'PASS' ? labels[5] : labels[4];
    // Inspect only known error categories; never return messages, URLs, or raw errors.
    if (signal?.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      fail(target, 'FMP request timed out (15-second limit). No retry was attempted.');
    } else if (error?.name === 'TypeError' && /unsupported.*(redirect|cache|request|option|mode)/i.test(error.message ?? '')) {
      fail(target, 'The runtime rejected an unsupported request option. No retry was attempted.');
    } else if (target === labels[5] && error?.name === 'SyntaxError') {
      fail(target, 'FMP returned unreadable JSON.');
    } else {
      fail(target, 'FMP network or response-transfer failure. No retry was attempted.');
    }
  }
  return results;
}
