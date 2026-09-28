import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHandler } from './serve.mjs';

async function request(url, { method = 'GET', host = '127.0.0.1:8788' } = {}) {
  const reads = [];
  const handler = createHandler({ port: 8788, read: async path => { reads.push(path); return Buffer.from('verified static page'); } });
  const res = new EventEmitter();
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers; };
  res.end = body => { res.body = body; };
  await handler({ url, method, headers: { host } }, res);
  return { ...res, reads };
}

test('serves only the guide and the existing recovery page', async () => {
  for (const url of ['/', '/index.html', '/tool', '/recovery.html']) {
    const res = await request(url);
    assert.equal(res.status, 200);
    assert.equal(res.reads.length, 1);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.headers['X-Frame-Options'], 'DENY');
  }
});

test('private files, traversal, query variants, and uploads never reach the filesystem', async () => {
  for (const url of ['/private/bundle.tar', '/../private/bundle.tar', '/%2e%2e/wallet-recovery/src/crypto.mjs', '/developer/checks/wallet-build.json', '/index.html?file=secret', '/tool/', '/src/content.py', '/developer/docs/OWNER-REFERENCE.md', '/developer/wallet-recovery/tests/fixtures/legacy-v1.json', '/private/bundle/master.key']) {
    const res = await request(url);
    assert.equal(res.status, 404, url);
    assert.equal(res.reads.length, 0, url);
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const res = await request('/', { method });
    assert.equal(res.status, 405);
    assert.equal(res.reads.length, 0);
  }
});

test('rejects foreign Host headers before reading any content', async () => {
  for (const host of ['evil.example:8788', '127.0.0.1.evil.example:8788', 'localhost:80', undefined]) {
    const res = host === undefined
      ? await request('/', { host: '' }) : await request('/', { host });
    assert.equal(res.status, 403);
    assert.equal(res.reads.length, 0);
  }
});

test('HEAD has no response body; missing files give a safe error', async () => {
  assert.equal((await request('/', { method: 'HEAD' })).body, undefined);
  const handler = createHandler({ port: 8788, read: async () => { throw new Error('private system path'); } });
  let status, body;
  await handler({ method: 'GET', url: '/', headers: { host: 'localhost:8788' } }, {
    writeHead: code => { status = code; }, end: value => { body = value; }
  });
  assert.equal(status, 503);
  assert.doesNotMatch(body, /private system path/);
});
