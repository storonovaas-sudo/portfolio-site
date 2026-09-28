const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');

test('Timeweb server: pages, clean URLs, private files and API adapter', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const route of ['/', '/growth', '/growth.html', '/case-appruvo-payments', '/styles.css', '/likes.js', '/healthz', '/fonts/als-hauss-next-book.otf', '/fonts/als-unios-medium.otf']) {
    assert.equal((await fetch(base + route)).status, 200, route);
  }
  const shader = await fetch(base + '/assets/light-rays/shader.frag?v=20260922');
  assert.equal(shader.status, 200);
  assert.match(shader.headers.get('content-type'), /^text\/plain/);
  assert.match(await shader.text(), /void main\s*\(/);
  for (const route of ['/.env', '/.git/config', '/server.js', '/api/likes.js', '/package.json', '/tests/likes.test.js', '/README.md', '/nested/missing']) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
  assert.equal((await fetch(base + '/growth', { method: 'HEAD' })).headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal((await fetch(base + '/growth', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/api/likes?case=invalid')).status, 400);
  assert.equal((await fetch(base + '/api/likes', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await fetch(base + '/api/likes', { method: 'POST', body: 'x'.repeat(5000) })).status, 413);
  const previous = { ...process.env };
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  t.after(() => { process.env = previous; });
  const realFetch = global.fetch;
  t.mock.method(global, 'fetch', (url, options) => String(url).startsWith('https://redis.test')
    ? Promise.resolve({ ok: true, json: async () => [{ result: 3 }, { result: 0 }] })
    : realFetch(url, options));
  const response = await fetch(base + '/api/likes?case=case-appruvo-payments', { headers: { 'x-forwarded-proto': 'https' } });
  assert.deepEqual(await response.json(), { count: 3, liked: false });
  assert.match(response.headers.get('set-cookie'), /; Secure/);
});
