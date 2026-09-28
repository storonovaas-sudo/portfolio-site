const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const likes = require('./api/likes');

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8' };
const clientScripts = new Set(['back-to-top.js', 'likes.js', 'site-loader.js']);
// Only explicitly public file types/directories are served. Never expose the repo root.
const publicFiles = new Map();
function collect(directory = '') {
  for (const entry of fs.readdirSync(path.join(__dirname, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory() && ((!directory && ['assets', 'fonts'].includes(entry.name)) || directory)) collect(relative);
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    const extension = path.extname(entry.name);
    if (!mime[extension] || (!directory && extension === '.js' && !clientScripts.has(entry.name))) continue;
    publicFiles.set('/' + relative, path.join(__dirname, relative));
  }
}
collect();

function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status = code => { res.statusCode = code; return res; };
    res.json = data => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); return res; };
    try {
      const url = new URL(req.url, 'http://localhost');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
      if (pathname === '/api/likes') {
        req.query = Object.fromEntries(url.searchParams);
        if (req.method === 'POST') {
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 4096) return res.status(413).json({ error: 'Request too large' });
            chunks.push(chunk);
          }
          req.body = Buffer.concat(chunks).toString('utf8');
        }
        return await likes(req, res);
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD');
        return res.status(405).json({ error: 'Method not allowed' });
      }
      if (pathname === '/healthz') return res.json({ status: 'ok' });
      if (pathname === '/') pathname = '/index.html';
      else if (!path.posix.extname(pathname)) pathname += '.html';
      const file = publicFiles.get(pathname);
      const target = file || publicFiles.get('/404.html');
      res.statusCode = file ? 200 : 404;
      res.setHeader('Content-Type', mime[path.extname(target)]);
      res.setHeader('Cache-Control', path.extname(target) === '.html' ? 'no-cache' : 'public, max-age=3600');
      const contents = await fs.promises.readFile(target);
      res.setHeader('Content-Length', contents.length);
      res.end(req.method === 'HEAD' ? undefined : contents);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
      else res.destroy();
    }
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Portfolio server started'));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
module.exports = { createServer };
