import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyAccess } from '../src/access.js';
import { createDiagnosticsHandler as createHandler } from '../src/diagnostics.js';
import worker from '../src/index.js';

const env = { DIAGNOSTICS_AUTHORIZED_EMAIL: 'owner@example.com' };
const secret = 'mock-secret-never-expose';
const authorizedContext = { access: { getIdentity: async () => ({ email: 'owner@example.com' }) } };
const authenticate = verifyAccess;
// Test helper supplies a simulated runtime context, never a request header.
function createDiagnosticsHandler(options) {
  const handler = createHandler(options);
  return (req, bindings, ctx = authorizedContext) => handler(req, bindings, ctx);
}
function request(path = '/diagnostics', { method = 'GET', origin = 'https://example.com', confirm = true } = {}) {
  return new Request(`https://example.com${path}`, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify({ confirm }) } : {}),
  });
}

for (const [name, ctx, status] of [
  ['missing context', undefined, 401],
  ['missing access', {}, 401],
  ['missing identity', { access: { getIdentity: async () => null } }, 401],
  ['missing email', { access: { getIdentity: async () => ({}) } }, 401],
  ['wrong user', { access: { getIdentity: async () => ({ email: 'other@example.com' }) } }, 403],
  ['identity failure', { access: { getIdentity: async () => { throw new Error(secret); } } }, 401],
]) {
  test(`${name} rejects before any D1 or FMP operation`, async () => {
    const handler = createHandler({ fetchImpl: () => assert.fail('Network access') });
    const bindings = { ...env, FMP_API_KEY: secret, DB: { prepare() { assert.fail('D1 access'); } } };
    for (const path of ['/diagnostics', '/diagnostics/d1', '/diagnostics/fmp', '/diagnostics/client.js']) {
      const req = request(path, { method: path.endsWith('/d1') || path.endsWith('/fmp') ? 'POST' : 'GET' });
      req.headers.set('Cf-Access-Jwt-Assertion', 'spoofed-token');
      req.headers.set('Cf-Access-Authenticated-User-Email', 'owner@example.com');
      const response = await handler(req, bindings, ctx);
      assert.equal(response.status, status);
      assert.ok(!(await response.text()).includes(secret));
    }
  });
}

test('native authorized identity is accepted and passed through the Worker entry point', async () => {
  const response = await worker.fetch(request(), env, authorizedContext);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Infrastructure checks/);
  assert.equal((await verifyAccess(request(), env, { access: { getIdentity: async () => ({ email: 'OWNER@example.com' }) } })).status, 200);
});

test('missing or invalid Access settings fail closed in the public Worker', async () => {
  for (const bindings of [{}, { ...env, DIAGNOSTICS_AUTHORIZED_EMAIL: '' }]) {
    assert.equal((await worker.fetch(request(), bindings)).status, 503);
  }
});

test('GET page and script never execute tests', async () => {
  const handler = createDiagnosticsHandler({ authenticate, fetchImpl: () => assert.fail('Network access') });
  for (const path of ['/diagnostics', '/diagnostics/client.js']) {
    const response = await handler(request(path), { ...env, DB: { prepare() { assert.fail('D1 access'); } } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('GET actions, cross-origin requests and missing confirmation cannot trigger tests', async () => {
  const handler = createDiagnosticsHandler({ authenticate, fetchImpl: () => assert.fail('Network access') });
  for (const options of [{}, { method: 'POST', origin: 'https://evil.example' }, { method: 'POST', confirm: false }]) {
    const response = await handler(request('/diagnostics/fmp', options), env);
    assert.ok([400, 403, 405].includes(response.status));
  }
});

test('missing test table returns migration-required without any writes', async () => {
  let reads = 0;
  const handler = createDiagnosticsHandler({ authenticate });
  const DB = { prepare(sql) { assert.match(sql, /sqlite_master/); reads++; return { first: async () => null }; } };
  const response = await handler(request('/diagnostics/d1', { method: 'POST' }), { ...env, DB });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).status, 'MIGRATION_REQUIRED');
  assert.equal(reads, 1);
});

test('D1 action inserts and reads one record without FMP calls or returning contents', async () => {
  let inserts = 0, selects = 0, message;
  const DB = { prepare(sql) {
    if (sql.includes('sqlite_master')) return { first: async () => ({ name: 'infrastructure_test' }) };
    return { bind(value) { return {
      run: async () => { inserts++; message = value; },
      first: async () => { selects++; return { id: 1, created_at: '2026-10-26', message }; },
    }; } };
  } };
  const handler = createDiagnosticsHandler({ authenticate, fetchImpl: () => assert.fail('FMP request') });
  const response = await handler(request('/diagnostics/d1', { method: 'POST' }), { ...env, DB, FMP_API_KEY: secret });
  const body = await response.text();
  assert.equal(inserts, 1); assert.equal(selects, 1);
  assert.ok(body.includes('PASS')); assert.ok(!body.includes(message)); assert.ok(!body.includes(secret));
});

test('FMP action makes exactly one request and returns no profile or credentials', async () => {
  let calls = 0;
  const handler = createDiagnosticsHandler({ authenticate, fetchImpl: async (url) => {
    calls++;
    assert.equal(url.searchParams.get('symbol'), 'AAPL');
    assert.equal(url.searchParams.get('apikey'), secret);
    return Response.json([{ symbol: 'AAPL', companyName: 'Private profile contents' }]);
  } });
  const response = await handler(request('/diagnostics/fmp', { method: 'POST' }), { ...env, FMP_API_KEY: secret, DB: { prepare() { assert.fail('D1 access'); } } });
  const body = await response.text();
  assert.equal(calls, 1); assert.ok(body.includes('PASS'));
  for (const value of [secret, 'Private profile contents', 'apikey=', 'https://']) assert.ok(!body.includes(value));
});

test('raw D1 and FMP errors are sanitized', async () => {
  const handler = createDiagnosticsHandler({ authenticate, fetchImpl: async () => { throw new Error(`https://example.com?apikey=${secret}`); } });
  for (const path of ['/diagnostics/d1', '/diagnostics/fmp']) {
    const response = await handler(request(path, { method: 'POST' }), { ...env, FMP_API_KEY: secret, DB: { prepare() { throw new Error(secret); } } });
    const body = await response.text();
    assert.ok(!body.includes(secret)); assert.ok(!body.includes('apikey='));
  }
});
