import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyInfrastructure, labels } from '../src/infrastructure.js';
import worker from '../src/index.js';

const secret = 'mock-private-key';
const profile = [{ symbol: 'AAPL', companyName: 'Apple Inc.' }];
function database() {
  const rows = [];
  return { rows, prepare(sql) { return { bind(message) { return {
    async run() { assert.match(sql, /^INSERT INTO infrastructure_test/); rows.push({ id: 1, created_at: '2026-10-26 12:00:00', message }); },
    async first() { assert.match(sql, /^SELECT/); return rows.find(row => row.message === message); },
  }; } }; } };
}
const options = { configurationValid: true, approveD1Write: true, approveFmpRequest: true };

test('approved verification inserts exactly one row and makes exactly one AAPL request', async () => {
  const db = database();
  let calls = 0;
  const results = await verifyInfrastructure({ DB: db, FMP_API_KEY: secret }, { ...options, fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url.origin + url.pathname, 'https://financialmodelingprep.com/stable/profile');
    assert.equal(url.searchParams.get('symbol'), 'AAPL');
    assert.equal(url.searchParams.get('apikey'), secret);
    assert.equal(init.redirect, 'error');
    return Response.json(profile);
  } });
  assert.equal(calls, 1);
  assert.equal(db.rows.length, 1);
  assert.deepEqual(Object.keys(results), labels);
  assert.ok(Object.values(results).every(result => result.status === 'PASS'));
  assert.ok(!JSON.stringify(results).includes(secret));
  assert.ok(!JSON.stringify(results).includes(db.rows[0].message));
});

test('defaults never write or request FMP', async () => {
  const db = database();
  await verifyInfrastructure({ DB: db, FMP_API_KEY: secret }, { fetchImpl: () => assert.fail('Unexpected fetch') });
  assert.equal(db.rows.length, 0);
});

test('missing bindings and secret fail without network access', async () => {
  const result = await verifyInfrastructure({}, { ...options, fetchImpl: () => assert.fail('Unexpected fetch') });
  assert.equal(result[labels[1]].status, 'FAIL');
  assert.equal(result[labels[3]].status, 'FAIL');
});

for (const status of [401, 403, 429, 500]) {
  test(`HTTP ${status} is sanitized with no retry`, async () => {
    let calls = 0;
    const result = await verifyInfrastructure({ FMP_API_KEY: secret }, { ...options, fetchImpl: async () => {
      calls++;
      return new Response(`sensitive ${secret}`, { status });
    } });
    assert.equal(calls, 1);
    assert.equal(result[labels[4]].status, 'FAIL');
    assert.equal(result[labels[5]].status, 'FAIL');
    assert.ok(!JSON.stringify(result).includes(secret));
  });
}

for (const data of [[], {}, [{ symbol: 'MSFT', companyName: 'Microsoft' }], [{ symbol: 'AAPL' }], [...profile, ...profile]]) {
  test(`invalid profile structure is rejected: ${JSON.stringify(data)}`, async () => {
    const result = await verifyInfrastructure({ FMP_API_KEY: secret }, { ...options, fetchImpl: async () => Response.json(data) });
    assert.equal(result[labels[4]].status, 'PASS');
    assert.equal(result[labels[5]].status, 'FAIL');
  });
}

test('JSON, network and D1 errors never expose raw messages', async () => {
  const db = { prepare() { throw new Error(secret); } };
  for (const fetchImpl of [async () => { throw new Error(`https://example.com/?apikey=${secret}`); }, async () => new Response(secret)]) {
    const result = await verifyInfrastructure({ DB: db, FMP_API_KEY: secret }, { ...options, fetchImpl });
    assert.equal(result[labels[2]].status, 'FAIL');
    assert.equal(result[labels[5]].status, 'FAIL');
    assert.ok(!JSON.stringify(result).includes(secret));
  }
});

test('public Worker never invokes diagnostics even when bindings exist', async () => {
  const env = { DB: { prepare() { assert.fail('Unexpected D1 access'); } }, FMP_API_KEY: secret };
  for (const path of ['/', '/health', '/diagnostics', '/verify']) {
    const response = await worker.fetch(new Request(`https://example.com${path}`), env);
    assert.equal(response.status, path === '/' || path === '/health' ? 200 : 404);
    assert.ok(!(await response.text()).includes(secret));
  }
});

test('CLI without approvals emits only six sanitized statuses and exits nonzero', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const childEnv = { ...process.env };
  delete childEnv.FMP_API_KEY;
  try {
    await promisify(execFile)(process.execPath, ['scripts/verify-infrastructure.js'], { env: childEnv });
    assert.fail('Expected missing configuration to fail');
  } catch (error) {
    assert.equal(error.code, 1);
    assert.equal(error.stderr, '');
    const lines = error.stdout.trim().split('\n');
    assert.equal(lines.length, 6);
    for (let index = 0; index < labels.length; index++) assert.ok(lines[index].startsWith(`${labels[index]}: `));
  }
});
