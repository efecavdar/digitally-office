// digitally-office server — static page + SSE event stream + event intake.
// Zero npm dependencies; node:* only. Target repo = DEV_OFFICE_ROOT || cwd.
//
//   npx digitally-office                  → http://localhost:4242
//   npx digitally-office --no-open        → without opening the browser
//   npx digitally-office --print-layout   → room/file-count JSON, then exit

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { makeEvent, validateEvent } from './lib/events.mjs';
import { buildRooms } from './lib/rooms.mjs';
import { autoRooms } from './lib/autorooms.mjs';
import { scanCounts, watchRootsFor } from './lib/scan.mjs';
import { startWatcher } from './lib/watcher.mjs';
import { startGitPoll } from './lib/gitpoll.mjs';
import { loadConfig } from './lib/config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(process.env.DEV_OFFICE_ROOT || process.cwd());
const WEB_DIR = path.join(__dirname, 'docs');
const SESSIONS_DIR = path.join(os.homedir(), '.digitally-office', 'sessions');

const RING_MAX = 500;
const HOOK_DEDUP_MS = 2000;
const PING_MS = 15_000;
const BODY_MAX = 32 * 1024;

// ── Config + oda üretimi + açılış taraması ─────────────────────────
const cfg = loadConfig(REPO_ROOT);
const base = Array.isArray(cfg.rooms) && cfg.rooms.length
  ? cfg.rooms
  : autoRooms(REPO_ROOT);
const { rooms, resolveRoom } = buildRooms(base, cfg.lang);
const watchRoots = cfg.watchRoots || watchRootsFor(rooms);
const { counts, totalFiles } = scanCounts(REPO_ROOT, watchRoots, resolveRoom);

let humanLabel = 'Dev';
try {
  const gitName = execFileSync('git', ['config', 'user.name'], { cwd: REPO_ROOT }).toString().trim();
  if (gitName) humanLabel = gitName.split(/\s+/)[0];
} catch { /* git yoksa 'Dev' */ }

const layout = {
  generatedAt: new Date().toISOString(),
  totalFiles,
  signText: cfg.signText,
  lang: cfg.lang,
  floorNames: cfg.floorNames,
  humanLabel,
  rooms: rooms.map((r) => ({
    id: r.id, name: r.name, floor: r.floor, common: !!r.common,
    fileCount: counts[r.id] || 0,
  })),
};

if (process.argv.includes('--print-layout')) {
  process.stdout.write(JSON.stringify(layout, null, 2) + '\n');
  process.exit(0);
}

// ── Olay altyapısı: ring buffer + SSE + JSONL log ───────────────────
const clients = new Set();
const ring = [];
const recentHookPaths = new Map();

fs.mkdirSync(SESSIONS_DIR, { recursive: true });
const logFile = path.join(
  SESSIONS_DIR,
  `${path.basename(REPO_ROOT)}-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`,
);

function broadcast(evt) {
  ring.push(evt);
  if (ring.length > RING_MAX) ring.shift();
  fs.appendFile(logFile, JSON.stringify(evt) + '\n', () => {});
  const frame = `id: ${evt.id}\nevent: office\ndata: ${JSON.stringify(evt)}\n\n`;
  for (const res of clients) res.write(frame);
}

function ingest(body) {
  const err = validateEvent(body);
  if (err) return { err };
  const { id: _id, ts: _ts, v: _v, ...rest } = body; // id/ts sunucuya ait
  const evt = makeEvent(rest);
  if (evt.path && !evt.roomId) evt.roomId = resolveRoom(evt.path);
  if (evt.type === 'agent_edit' && evt.path) recentHookPaths.set(evt.path, Date.now());
  broadcast(evt);
  return { evt };
}

function wasHookRecent(relPath) {
  const ts = recentHookPaths.get(relPath);
  if (!ts) return false;
  if (Date.now() - ts > HOOK_DEDUP_MS) {
    recentHookPaths.delete(relPath);
    return false;
  }
  return true;
}

// ── HTTP ────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Last-Event-ID',
};

function serveStatic(res, baseDir, relPath) {
  const abs = path.resolve(baseDir, relPath);
  if (!abs.startsWith(baseDir + path.sep) && abs !== baseDir) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(abs, (err, data) => {
    if (err) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS).end();
    return;
  }

  if (url.pathname === '/events' && req.method === 'GET') {
    res.writeHead(200, {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 3000\n\n');
    const lastId = req.headers['last-event-id'];
    if (lastId) {
      const idx = ring.findIndex((e) => e.id === lastId);
      for (const evt of idx >= 0 ? ring.slice(idx + 1) : ring) {
        res.write(`id: ${evt.id}\nevent: office\ndata: ${JSON.stringify(evt)}\n\n`);
      }
    }
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (url.pathname === '/event' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > BODY_MAX) req.destroy();
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' })
          .end(JSON.stringify({ ok: false, error: 'invalid JSON' }));
        return;
      }
      const { err, evt } = ingest(body);
      if (err) {
        res.writeHead(422, { ...CORS, 'Content-Type': 'application/json' })
          .end(JSON.stringify({ ok: false, error: err }));
        return;
      }
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
        .end(JSON.stringify({ ok: true, id: evt.id }));
    });
    return;
  }

  if (url.pathname === '/layout' && req.method === 'GET') {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
      .end(JSON.stringify(layout));
    return;
  }

  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  serveStatic(res, WEB_DIR, rel);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`✗ Port ${cfg.port} is busy (another office running?).`);
    console.error(`  Try: PORT=${cfg.port + 1} npx digitally-office`);
  } else {
    console.error('✗ Server error:', err.message);
  }
  process.exit(1);
});

server.listen(cfg.port, () => {
  const url = `http://localhost:${cfg.port}`;
  console.log('┌──────────────────────────────────────────────┐');
  console.log(`│  ${cfg.signText} OFFICE is open 🏢`.padEnd(47) + '│');
  console.log('└──────────────────────────────────────────────┘');
  console.log(`  URL      : ${url}`);
  console.log(`  Repo     : ${REPO_ROOT}`);
  console.log(`  Files    : ${totalFiles} scanned → ${layout.rooms.length} rooms`);
  console.log(`  Log      : ${logFile}`);

  startWatcher(REPO_ROOT, watchRoots, { onEvent: broadcast, wasHookRecent, resolveRoom, humanLabel });
  startGitPoll(REPO_ROOT, broadcast);
  broadcast(makeEvent({
    type: 'status', actor: { kind: 'system', id: 'office', label: 'Office' },
    meta: { text: cfg.lang === 'tr' ? 'Ofis kapıları açıldı, izleyiciler görevde' : 'Office doors open, watchers on duty' },
  }));

  if (!process.argv.includes('--no-open')) {
    const opener = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start' : 'xdg-open';
    try {
      spawn(opener, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
    } catch { /* açılamazsa link zaten konsolda */ }
  }

  setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, PING_MS).unref();
});
