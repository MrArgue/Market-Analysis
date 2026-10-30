import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

test('collar prototype route serves its interface', async () => {
  const response = await worker.fetch(new Request('https://example.com/collar'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  assert.match(html, /Signature Plus Proposal Studio/);
  assert.match(html, /SIMULATED DATA/);
  assert.match(html, /\/collar\.js/);
});

test('collar simulator JavaScript is self-hosted', async () => {
  const response = await worker.fetch(new Request('https://example.com/collar.js'));
  assert.equal(response.status, 200);
  const script = await response.text();
  assert.match(script, /function signatureClient/);
  assert.match(script, /function findZero/);
});

test('existing market route remains available', async () => {
  const response = await worker.fetch(new Request('https://example.com/'));
  assert.equal(response.status, 200);
});

test('PDF output is unavailable during page-only production testing',async()=>{const r=await worker.fetch(new Request('https://example.com/api/signature-proposal',{method:'POST'}));assert.equal(r.status,503);assert.match(await r.text(),/postponed/);});
