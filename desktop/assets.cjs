const { readFile } = require('node:fs/promises');
const { extname, relative, resolve, isAbsolute } = require('node:path');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

async function gameAssetResponse(request, root) {
  try {
    const url = new URL(request.url);
    if (url.protocol !== 'righty:' || url.host !== 'game') return new Response('Not found', { status: 404 });
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const pathname = decodeURIComponent(url.pathname);
    const file = resolve(root, pathname.replace(/^\/+/, '') || 'index.html');
    const inside = relative(root, file);
    if (inside.startsWith('..') || isAbsolute(inside)) return new Response('Forbidden', { status: 403 });
    const data = await readFile(file);
    const headers = {
      'content-type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'accept-ranges': 'bytes',
      'cache-control': 'no-store'
    };
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${data.length}` } });
      const start = match[1] ? Number(match[1]) : Math.max(0, data.length - Number(match[2]));
      const end = match[2] && match[1] ? Number(match[2]) : data.length - 1;
      if (start >= data.length || end < start)
        return new Response(null, { status: 416, headers: { 'content-range': `bytes */${data.length}` } });
      const chunk = data.subarray(start, Math.min(end + 1, data.length));
      headers['content-range'] = `bytes ${start}-${start + chunk.length - 1}/${data.length}`;
      headers['content-length'] = String(chunk.length);
      return new Response(request.method === 'HEAD' ? null : chunk, { status: 206, headers });
    }
    headers['content-length'] = String(data.length);
    return new Response(request.method === 'HEAD' ? null : data, { status: 200, headers });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

module.exports = { gameAssetResponse };
