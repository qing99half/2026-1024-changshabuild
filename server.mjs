import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname);
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const file = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, host, () => console.log(`本机：http://127.0.0.1:${port}；手机：访问 http://电脑局域网IP:${port}`));
