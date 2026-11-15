#!/usr/bin/env node
// Serves the player on this machine only, and optionally a folder of WAV
// files to play:
//
//   node server.js [--port 4173] [--dir ~/Music/takes]

import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values: options } = parseArgs({
  options: {
    port: { type: 'string', default: process.env.PORT ?? '4173' },
    dir: { type: 'string' },
  },
});

const app = fileURLToPath(new URL('.', import.meta.url));
const media = options.dir ? resolve(options.dir.replace(/^~(?=$|\/)/, homedir())) : null;

const served = ['/index.html', '/src/', '/skins/'];
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.wave': 'audio/wav',
};
const isWav = (name) => /\.wave?$/i.test(name);

const server = createServer(async (request, reply) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    if (request.method !== 'GET' && request.method !== 'HEAD') return text(reply, 405, 'Method not allowed');

    if (path === '/api/local') return json(reply, 200, await listing());
    if (path.startsWith('/media/')) {
      if (!media || !isWav(path)) return text(reply, 404, 'Not found');
      return await file(request, reply, within(media, path.slice('/media/'.length)));
    }
    const wanted = path === '/' ? '/index.html' : path;
    if (!served.some((prefix) => wanted === prefix || (prefix.endsWith('/') && wanted.startsWith(prefix)))) {
      return text(reply, 404, 'Not found');
    }
    return await file(request, reply, within(app, wanted.slice(1)));
  } catch (problem) {
    const missing = problem.code === 'ENOENT' || problem.code === 'EISDIR' || problem.code === 'ENOTDIR';
    const status = problem.status ?? (missing ? 404 : problem instanceof URIError ? 400 : 500);
    if (status === 500) console.error(problem);
    if (!reply.headersSent) text(reply, status, status === 500 ? 'Server error' : problem.status ? problem.message : 'Not found');
    else reply.destroy();
  }
});

/** WAV files in the media folder, one level of subfolders deep. */
async function listing() {
  if (!media) return [];
  const names = [];
  for (const entry of await readdir(media, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isFile() && isWav(entry.name)) names.push(entry.name);
    if (entry.isDirectory()) {
      for (const inner of await readdir(join(media, entry.name), { withFileTypes: true })) {
        if (inner.isFile() && isWav(inner.name) && !inner.name.startsWith('.')) names.push(`${entry.name}/${inner.name}`);
      }
    }
  }
  return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** The path of `name` under `root`, refusing anything that climbs out of it. */
function within(root, name) {
  const base = resolve(root);
  const path = resolve(base, name);
  if (path !== base && !path.startsWith(base + sep)) throw Object.assign(new Error('Not found'), { status: 404 });
  return path;
}

/** Sends a file, honouring Range so the browser can seek in long WAVs. */
async function file(request, reply, path) {
  const info = await stat(path);
  if (!info.isFile()) throw Object.assign(new Error('Not found'), { status: 404 });
  const headers = {
    'Content-Type': types[extname(path).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };

  let start = 0;
  let end = info.size - 1;
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
  if (range && (range[1] || range[2]) && info.size > 0) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(end, Number(range[2]));
    } else {
      start = Math.max(0, info.size - Number(range[2])); // "bytes=-500": the last 500
    }
    if (start > end) {
      reply.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
      return reply.end();
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length'] = info.size ? end - start + 1 : 0;
  reply.writeHead(status, headers);
  if (request.method === 'HEAD' || !info.size) return reply.end();
  createReadStream(path, { start, end }).on('error', () => reply.destroy()).pipe(reply);
}

function json(reply, status, body) {
  reply.writeHead(status, { 'Content-Type': types['.json'], 'Cache-Control': 'no-store' });
  reply.end(JSON.stringify(body));
}

function text(reply, status, body) {
  reply.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  reply.end(body);
}

// Loopback only: this server reads files from disk on request.
server.listen(Number(options.port), '127.0.0.1', () => {
  console.log(`Player: http://localhost:${server.address().port}`);
  if (media) console.log(`Folder: ${media}`);
});
