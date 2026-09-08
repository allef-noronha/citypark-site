import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.pdf': 'application/pdf',
  '.woff': 'font/woff', '.woff2': 'font/woff2'};

http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405).end(); return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost:5500').pathname);
    const route = pathname === '/' ? '/index.html' : pathname;
    const target = path.resolve(root, `.${route}`);
    const extension = path.extname(target).toLowerCase();
    const allowed = /^\/[^/]+\.html$/.test(route) || /^\/(js|css|config|lib|img|media|files)\//.test(route);
    if (!allowed || !target.startsWith(root) || !types[extension]) {
      response.writeHead(404).end(); return;
    }
    const info = await stat(target);
    if (!info.isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, {'Content-Type': types[extension], 'Content-Length': info.size,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
    if (request.method === 'HEAD') response.end();
    else createReadStream(target).on('error', () => response.destroy()).pipe(response);
  } catch {
    if (!response.headersSent) response.writeHead(404);
    response.end();
  }
}).listen(5500, '127.0.0.1', () => console.log('Prévia local: http://127.0.0.1:5500/vendas.html'));
