const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const handler = require('../api/likes');
const caseId = 'case-appruvo-payments';
const visitor = '12345678-1234-4123-8123-123456789abc';

async function api(method, body, cookie = `portfolioVisitor=${visitor}`) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await handler({ method, body, query: { case: caseId }, headers: { cookie, 'content-type': 'application/json' } }, res);
  return res;
}

test('API: shared counts, retries, reload, unlike, case isolation and failures', async (t) => {
  const previous = { ...process.env };
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  t.after(() => { process.env = previous; });
  const sets = new Map();
  t.mock.method(global, 'fetch', async (_url, options) => {
    const results = JSON.parse(options.body).map(([op, key, id]) => {
      if (!sets.has(key)) sets.set(key, new Set());
      const set = sets.get(key);
      if (op === 'SADD') { const size = set.size; set.add(id); return { result: set.size - size }; }
      if (op === 'SREM') return { result: Number(set.delete(id)) };
      if (op === 'SCARD') return { result: set.size };
      return { result: Number(set.has(id)) };
    });
    return { ok: true, json: async () => results };
  });
  assert.deepEqual((await api('GET')).data, { count: 0, liked: false });
  assert.equal((await api('POST', { case: caseId, liked: true })).data.count, 1);
  assert.equal((await api('POST', { case: caseId, liked: true })).data.count, 1);
  assert.deepEqual((await api('GET')).data, { count: 1, liked: true });
  const other = `portfolioVisitor=abcdefab-1234-4123-8123-123456789abc`;
  assert.deepEqual((await api('GET', undefined, other)).data, { count: 1, liked: false });
  assert.equal((await api('POST', { case: caseId, liked: true }, other)).data.count, 2);
  for (const id of ['case-schooly-consent', 'case-schooly-workflow']) {
    assert.equal((await api('POST', { case: id, liked: true })).data.count, 1);
  }
  assert.equal((await api('POST', { case: caseId, liked: false })).data.count, 1);
  assert.equal((await api('POST', { case: caseId, liked: false })).data.count, 1);
  assert.equal((await api('POST', { case: 'bad', liked: true })).code, 400);
  assert.equal((await api('POST', { case: caseId, liked: 1 })).code, 400);
  assert.equal((await api('POST', { case: caseId, liked: true }, '')).code, 409);
  const fresh = await api('GET', undefined, '');
  assert.match(fresh.headers['Set-Cookie'], /HttpOnly; SameSite=Lax/);
  assert.equal(fresh.headers['Cache-Control'], 'private, no-store');
  t.mock.method(global, 'fetch', async () => { throw new Error('Offline'); });
  assert.equal((await api('GET')).code, 503);
});

function client(fetch, legacy = false) {
  const handlers = {};
  const attrs = {};
  const count = {};
  const status = {};
  const storage = new Map(legacy ? [[`portfolioLike:${caseId}:liked`, 'true']] : []);
  const button = { dataset: { likeKey: caseId }, querySelector: () => count, after() {}, classList: { toggle() {} }, setAttribute(k,v) { attrs[k] = v; }, addEventListener(k,v) { handlers[k] = v; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../likes.js'), 'utf8'), {
    document: { querySelectorAll: () => [button], createElement: () => Object.assign(status, { setAttribute() {} }) },
    window: { addEventListener(k,v) { handlers[k] = v; } },
    localStorage: { getItem: k => storage.get(k), removeItem: k => storage.delete(k) },
    fetch, AbortSignal,
  });
  return { button, count, status, attrs, storage, handlers };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const ok = data => ({ ok: true, json: async () => data });

test('UI: lost response retries same state, blocks double clicks, refreshes', async () => {
  let liked = false;
  let fail = true;
  let posts = 0;
  const ui = client(async (_url, opts) => {
    if (opts.method === 'POST') {
      posts++;
      liked = JSON.parse(opts.body).liked;
      if (fail) { fail = false; throw new Error('Response lost after write'); }
    }
    return ok({ count: liked ? 1 : 0, liked });
  });
  await flush();
  assert.equal(ui.count.textContent, '0');
  const click = ui.handlers.click();
  ui.handlers.click();
  await click;
  assert.equal(posts, 1);
  assert.equal(ui.count.textContent, '0');
  assert.match(ui.status.textContent, /подтвердить/);
  await ui.handlers.click();
  assert.equal(liked, true);
  assert.equal(ui.count.textContent, '1');
  await ui.handlers.focus();
  assert.equal(ui.attrs['aria-pressed'], 'true');
  await ui.handlers.click();
  assert.equal(ui.count.textContent, '0');
});

test('UI: legacy likes migrate once and clear only after success', async () => {
  let posts = 0;
  const ui = client(async (_url, opts) => {
    if (opts.method === 'POST') posts++;
    return ok({ count: posts ? 1 : 0, liked: posts > 0 });
  }, true);
  await flush();
  await ui.handlers.pageshow();
  assert.equal(posts, 1);
  assert.equal(ui.storage.size, 0);
  assert.equal(ui.count.textContent, '1');
});

test('UI: unavailable storage shows error, not a fake zero or successful like', async () => {
  const ui = client(async () => ({ ok: false }));
  await flush();
  assert.equal(ui.count.textContent, '—');
  assert.match(ui.status.textContent, /загрузить/);
  assert.equal(ui.button.disabled, false);
  await ui.handlers.click();
  assert.equal(ui.attrs['aria-pressed'], 'false');
});
