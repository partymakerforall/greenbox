import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const guide = fileURLToPath(new URL('../../../index.html', import.meta.url));
const tool = fileURLToPath(new URL('../../../recovery.html', import.meta.url));

// Explicit files only: never serve the workspace, keys, source, or evidence directories.
export function createHandler({ port, read = readFile }) {
  const files = new Map([['/', guide], ['/index.html', guide], ['/tool', tool], ['/recovery.html', tool]]);
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
  return async (req, res) => {
    const finish = (status, message, extra = {}) => {
      res.writeHead(status, { ...headers, ...extra });
      res.end(req.method === 'HEAD' ? undefined : message);
    };
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) {
      finish(403, 'Local host only.'); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      finish(405, 'This page does not accept uploads.', { Allow: 'GET, HEAD' }); return;
    }
    const file = files.get(req.url);
    if (!file) { finish(404, 'Page not found.'); return; }
    try { finish(200, await read(file)); }
    catch { finish(503, 'The local page is unavailable. Check that the guide and recovery tool are present.'); }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.GREENBOX_GUIDE_PORT || 8788);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid GREENBOX_GUIDE_PORT.');
  const server = createServer(createHandler({ port }));
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? `The local address is already in use. Check http://127.0.0.1:${port}/ before starting another server.`
      : 'Could not open the local guide server.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`Greenbox handbook: ${url}\nKeep this window open. Control-C stops the server.`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
