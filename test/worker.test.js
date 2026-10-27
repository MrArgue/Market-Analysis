import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';

const request = (path, method = 'GET') => worker.fetch(new Request(`https://example.com${path}`, { method }));

test('homepage displays the responsive technical chart app', async () => {
  const response = request('/');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /Technical strength, in context/);
});

test('health returns an uncached JSON status', async () => {
  const response = request('/health');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('unknown paths return 404', () => assert.equal(request('/missing').status, 404));
test('writes are rejected', () => {
  const response = request('/health', 'POST');
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});
test('HEAD preserves headers without a body', async () => {
  const response = request('/health', 'HEAD');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(await response.text(), '');
});
