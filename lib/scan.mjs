// Startup scan: counts files per room across the watch roots.
// Shares ignore rules with the watcher so both see the same world.

import fs from 'node:fs';
import path from 'node:path';
import { isIgnoredSegment } from './autorooms.mjs';

export { isIgnoredSegment };

export function isIgnoredRel(relPath) {
  return relPath.split('/').some(isIgnoredSegment);
}

// Odaların path'lerinden izlenecek kökleri türet; iç içe olanları ele
// ("src" izlenirken "src/app" ayrıca izlenmesin).
export function watchRootsFor(rooms) {
  const roots = new Set();
  for (const r of rooms) {
    for (const p of r.paths || []) roots.add(p.replace(/\/+$/, ''));
  }
  const list = [...roots].sort();
  return list.filter((p) => !list.some((q) => q !== p && p.startsWith(q + '/')));
}

export function scanCounts(repoRoot, roots, resolveRoom) {
  const counts = {};
  let totalFiles = 0;

  const walk = (absDir, relDir) => {
    let entries;
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (isIgnoredSegment(ent.name)) continue;
      const rel = `${relDir}/${ent.name}`;
      if (ent.isDirectory()) {
        walk(path.join(absDir, ent.name), rel);
      } else if (ent.isFile()) {
        const roomId = resolveRoom(rel);
        counts[roomId] = (counts[roomId] || 0) + 1;
        totalFiles++;
      }
    }
  };

  for (const root of roots) {
    const abs = path.join(repoRoot, root);
    if (fs.existsSync(abs)) walk(abs, root);
  }
  return { counts, totalFiles };
}
