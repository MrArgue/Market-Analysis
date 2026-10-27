import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';

const request = (path, method = 'GET') => worker.fetch(new Request(`https://example.com${path}`, { method }));

test('homepage displays the responsive technical chart app', async () => {
  const response = request('/');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /Technical overview/);
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

test('chart modules are served directly and font policy allows the reference fonts', async () => {
 for (const path of ['/chart.js', '/chart-math.js']) { const r = request(path);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);assert.ok((await r.text()).includes('wholeAxis')); }
 const home = request('/');assert.match(home.headers.get('Content-Security-Policy'),/font-src 'self' https:\/\/seia.com/);
});