// Tiny local server for development — no extra packages needed.
// It copies what Vercel does in production, so the same code works in both places:
//   1. Serves the files in public/
//   2. Applies the "cleanUrls" and "rewrites" rules from vercel.json
//   3. Runs the functions in api/ (for example /api/generate → api/generate.js)
//   4. Loads secrets from .env.local into process.env
//
// Run with:  npm run dev
// To test on your phone (same Wi-Fi):  npm run dev:phone
//   This also lets phones open the links and QR codes the teacher page makes, because the
//   links then use this computer's Wi-Fi address instead of "localhost" (which on a phone
//   means the phone itself).

import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const API_DIR = path.join(ROOT, 'api');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY_BYTES = 4.5 * 1024 * 1024; // same request limit as Vercel

// Load .env.local if it exists (built into Node 20.12+)
try {
  process.loadEnvFile(path.join(ROOT, '.env.local'));
  console.log('Loaded .env.local');
} catch {
  console.log('No .env.local found (that is fine for Stage 1)');
}

// Phone test mode: links and QR codes use this computer's Wi-Fi address (e.g. http://192.168.1.5:3000)
if (HOST === '0.0.0.0' && !process.env.PUBLIC_URL) {
  const wifi = Object.values(os.networkInterfaces())
    .flat()
    .find((net) => net && net.family === 'IPv4' && !net.internal);
  if (wifi) process.env.PUBLIC_URL = `http://${wifi.address}:${PORT}`;
}

const vercelConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

// Turn "/n/:id" into a regular expression like ^/n/([^/]+)$
const rewrites = (vercelConfig.rewrites || []).map((rule) => ({
  pattern: new RegExp('^' + rule.source.replace(/:[a-zA-Z]+/g, '([^/]+)') + '$'),
  destination: rule.destination,
}));

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    for (const rule of rewrites) {
      if (rule.pattern.test(pathname)) {
        pathname = rule.destination;
        break;
      }
    }
    serveStatic(res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    res.end('Server error — see the terminal');
  }
});

function serveStatic(res, pathname) {
  if (pathname.endsWith('/')) pathname += 'index.html';

  // cleanUrls: "/teacher" should open "teacher.html"
  const candidates = path.extname(pathname) ? [pathname] : [pathname + '.html', pathname];

  for (const candidate of candidates) {
    const filePath = path.normalize(path.join(PUBLIC_DIR, candidate));
    // Safety: never serve files outside public/
    if (!filePath.startsWith(PUBLIC_DIR)) break;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const type = CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

async function handleApi(req, res, url) {
  const name = url.pathname.slice('/api/'.length).replace(/\/$/, '');
  const filePath = path.join(API_DIR, name + '.js');

  if (!/^[a-z0-9-]+$/i.test(name) || !fs.existsSync(filePath)) {
    sendJson(res, 404, { error: 'No such API function' });
    return;
  }

  // Read the request body (for POST requests)
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      sendJson(res, 413, { error: 'Request is too large' });
      return;
    }
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');

  // Add the same helpers Vercel gives to functions
  req.query = Object.fromEntries(url.searchParams);
  req.body = rawBody;
  if ((req.headers['content-type'] || '').includes('application/json') && rawBody) {
    try {
      req.body = JSON.parse(rawBody);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' });
      return;
    }
  }
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => sendJson(res, res.statusCode || 200, data);
  res.send = (text) => res.end(String(text));

  // "npm run dev" uses node --watch, which restarts this server when an api/ file changes
  const mod = await import(pathToFileURL(filePath).href);
  await mod.default(req, res);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

server.listen(PORT, HOST, () => {
  console.log(`Noto is running at http://localhost:${PORT}`);
  console.log(`Demo notice: http://localhost:${PORT}/n/demo-school`);
  if (process.env.PUBLIC_URL) {
    console.log(`Phone test mode: links and QR codes use ${process.env.PUBLIC_URL}`);
    console.log('Teachers: keep using http://localhost:' + PORT + '/teacher on this computer (Google login needs it).');
  }
});
