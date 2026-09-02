// Auto room generation — scans the target repo and turns its biggest
// directories into office rooms. "As the code grows, the room grows."

import fs from 'node:fs';
import path from 'node:path';

const IGNORED = new Set(['node_modules', 'dist', 'build', 'out', 'coverage',
  'vendor', 'tmp', 'lib', 'target', '__pycache__', 'venv']);

export function isIgnoredSegment(seg) {
  return IGNORED.has(seg) || seg.startsWith('.');
}

function countFiles(absDir, depthLeft = 12) {
  if (depthLeft <= 0) return 0;
  let n = 0;
  let entries;
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    if (isIgnoredSegment(e.name)) continue;
    if (e.isFile()) n++;
    else if (e.isDirectory()) n += countFiles(path.join(absDir, e.name), depthLeft - 1);
  }
  return n;
}

function topDirs(repoRoot) {
  let entries;
  try { entries = fs.readdirSync(repoRoot, { withFileTypes: true }); } catch { return []; }
  const dirs = entries
    .filter((e) => e.isDirectory() && !isIgnoredSegment(e.name))
    .map((e) => ({ rel: e.name, count: countFiles(path.join(repoRoot, e.name)) }))
    .filter((d) => d.count > 0);

  // Tek bir kök klasör (ör. src/) dosyaların çoğunu tutuyorsa bir seviye içeri gir
  const total = dirs.reduce((s, d) => s + d.count, 0);
  const dominant = dirs.find((d) => d.count / Math.max(1, total) > 0.6);
  if (dominant) {
    const inner = fs.readdirSync(path.join(repoRoot, dominant.rel), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !isIgnoredSegment(e.name))
      .map((e) => ({
        rel: `${dominant.rel}/${e.name}`,
        count: countFiles(path.join(repoRoot, dominant.rel, e.name)),
      }))
      .filter((d) => d.count > 0);
    if (inner.length >= 4) {
      return dirs.filter((d) => d !== dominant).concat(inner);
    }
  }
  return dirs;
}

const RESERVED_IDS = new Set(['cay', 'sunucu', 'arsiv']);
const SERVER_ROOM_DIRS = new Set(['scripts', 'ci', 'deploy', 'infra', 'ops']);

export function autoRooms(repoRoot, maxRooms = 14) {
  const dirs = topDirs(repoRoot)
    .filter((d) => !SERVER_ROOM_DIRS.has(path.basename(d.rel).toLowerCase()))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxRooms);

  return dirs.map((d, i) => {
    const base = path.basename(d.rel);
    let id = base.toLowerCase().replace(/[^a-z0-9]/g, '') || `oda${i}`;
    if (RESERVED_IDS.has(id)) id = id + '2';
    return {
      id,
      name: base.toUpperCase().slice(0, 12),
      floor: i % 2 === 0 ? 1 : 0, // büyük-küçük karışsın diye katlara dönüşümlü dağıt
      paths: [d.rel.split(path.sep).join('/')],
    };
  });
}
