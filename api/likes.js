const { randomUUID } = require('node:crypto');

const cases = new Set(['case-appruvo-payments', 'case-schooly-consent', 'case-schooly-workflow']);
const cookieName = 'portfolioVisitor';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  try {
    if (typeof body === 'string') body = JSON.parse(body);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const caseId = req.method === 'GET' ? req.query.case : body?.case;
  if (!cases.has(caseId) || (req.method === 'POST' && typeof body?.liked !== 'boolean')) {
    return res.status(400).json({ error: 'Invalid case or like state' });
  }
  if (req.method === 'POST' && (req.headers['sec-fetch-site'] === 'cross-site' ||
      !req.headers['content-type']?.startsWith('application/json'))) {
    return res.status(403).json({ error: 'Invalid request origin or content type' });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(503).json({ error: 'Likes storage is not configured' });

  const savedVisitor = (req.headers.cookie || '').split(';').map(value => value.trim())
    .find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const validVisitor = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(savedVisitor || '');
  if (req.method === 'POST' && !validVisitor) {
    return res.status(409).json({ error: 'Load likes first and enable cookies' });
  }
  const visitor = validVisitor ? savedVisitor : randomUUID();
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.VERCEL;
  res.setHeader('Set-Cookie', `${cookieName}=${visitor}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);

  // A set keeps retries idempotent; the transaction returns a consistent count/state.
  const key = `portfolio:likes:v1:${caseId}`;
  const commands = [];
  if (req.method === 'POST') commands.push([body.liked ? 'SADD' : 'SREM', key, visitor]);
  commands.push(['SCARD', key], ['SISMEMBER', key, visitor]);
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/multi-exec`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(8000),
    });
    const results = await response.json();
    if (!response.ok || !Array.isArray(results) || results.some(item => item.error)) throw new Error('Storage failed');
    const count = results.at(-2)?.result;
    const member = results.at(-1)?.result;
    if (!Number.isSafeInteger(count) || count < 0 || ![0, 1].includes(member)) throw new Error('Invalid storage response');
    return res.status(200).json({ count, liked: member === 1 });
  } catch {
    return res.status(503).json({ error: 'Likes storage is temporarily unavailable' });
  }
};
