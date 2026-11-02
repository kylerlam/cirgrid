import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Invalid path');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  const allowed = pathname === '/index.html' || /^\/(src|assets)\//.test(pathname);
  const file = resolve(root, '.' + pathname);
  if (!allowed || !file.startsWith(root + sep) || pathname.split('/').some(part => part.startsWith('.'))) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const content = await readFile(file);
    const extension = file.slice(file.lastIndexOf('.'));
    response.writeHead(200, {
      'Content-Type': (types[extension] || 'application/octet-stream') + (['.html', '.js', '.css', '.svg'].includes(extension) ? '; charset=utf-8' : ''),
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
server.listen(port, host, () => console.log('CirGrid is running at http://' + host + ':' + port));
