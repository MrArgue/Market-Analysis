import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { verifyAccess } from '../src/access.js';
import { createDiagnosticsHandler } from '../src/diagnostics.js';
import worker from '../src/index.js';

const env = { ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com', ACCESS_AUD: 'test-audience', DIAGNOSTICS_AUTHORIZED_EMAIL: 'owner@example.com' };
const secret = 'mock-secret-never-expose';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
jwk.kid = 'test';
const resolver = createLocalJWKSet({ keys: [jwk] });
async function token(overrides = {}, key = privateKey) {
  return new SignJWT({ email: 'owner@example.com', ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer('https://example.cloudflareaccess.com')
    .setAudience('test-audience').setSubject('user-id').setIssuedAt().setExpirationTime('5m').sign(key);
}
const valid = await token();
function request(path = '/diagnostics', { jwt = valid, method = 'GET', origin = 'https://example.com', confirm = true } = {}) {
  return new Request(`https://example.com${path}`, {
    method, headers: { ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}), Origin: origin, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify({ confirm }) } : {}),
  });
}
const authenticate = (req, bindings) => verifyAccess(req, bindings, resolver);

for (const [name, jwt] of [['missing', null], ['malformed', 'invalid'], ['wrong user', await token({ email: 'other@example.com' })]]) {
  test(`${name} authentication rejects before any D1 or FMP operation`, async () => {
    const handler = createDiagnosticsHandler({ authenticate, fetchImpl: () => assert.fail('Network access') });
    const bindings = { ...env, FMP_API_KEY: secret, DB: { prepare() { assert.fail('D1 access'); } } };
    for (const path of ['/diagnostics', '/diagnostics/d1', '/diagnostics/fmp', '/diagnostics/client.js']) {
      const response = await handler(request(path, { jwt, method: path.endsWith('/d1') || path.endsWith('/fmp') ? 'POST' : 'GET' }), bindings);
      assert.equal(response.status, name === 'wrong user' ? 403 : 401);
      assert.ok(!(await response.text()).includes(secret));
    }
  });
}

test('signature, audience, issuer and expiry are checked cryptographically', async () => {
  const other = await generateKeyPair('RS256');
  const badTokens = [await token({}, other.privateKey)];
  for (const [claim, value] of [['aud', 'wrong'], ['iss', 'https://wrong.cloudflareaccess.com'], ['exp', 1]]) {
    const jwt = await new SignJWT({ email: 'owner@example.com', sub: 'user', iat: 1, exp: Math.floor(Date.now()/1000)+300, iss: 'https://example.cloudflareaccess.com', aud: 'test-audience', [claim]: value }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(privateKey);
    badTokens.push(jwt);
  }
  for (const jwt of badTokens) assert.equal((await authenticate(request('/diagnostics', { jwt }), env)).status, 401);
});

test('missing or invalid Access settings fail closed in the public Worker', async () => {
  for (const bindings of [{}, { ...env, ACCESS_TEAM_DOMAIN: 'evil.example.com' }, { ...env, DIAGNOSTICS_AUTHORIZED_EMAIL: '' }]) {
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
