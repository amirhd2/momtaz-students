// سرور استاتیک کوچک برای شبیه‌سازی گیت‌هاب پیجز (سرو out/ زیر زیرمسیر /momtaz-students/)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const OUT = process.argv[2] || 'out';
const PORT = Number(process.argv[3] || 4173);
const PREFIX = '/momtaz-students';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    let url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (!url.startsWith(PREFIX)) {
      // ریدایرکت ریشه به زیرمسیر (مثل رفتار واقعی Pages)
      res.writeHead(302, { Location: PREFIX + '/' });
      res.end();
      return;
    }
    let rel = url.slice(PREFIX.length) || '/';
    if (rel.endsWith('/')) rel += 'index.html';
    let filePath = normalize(join(OUT, rel));
    if (!filePath.includes(normalize(OUT))) {
      res.writeHead(403).end();
      return;
    }
    try {
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      // SPA fallback
      const index = await readFile(join(OUT, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(index);
    }
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});

server.listen(PORT, () => console.log(`static-pages-sim on http://localhost:${PORT}${PREFIX}/`));
