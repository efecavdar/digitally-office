// fs.watch(recursive) file watcher. Atomik editör save'leri 2-4 olay üretir
// → path başına 250ms debounce. Claude hook'u aynı dosya için az önce olay
// yolladıysa (dedup penceresi) watcher susar.

import fs from 'node:fs';
import path from 'node:path';
import { isIgnoredRel } from './scan.mjs';
import { makeEvent } from './events.mjs';

const DEBOUNCE_MS = 250;

export function startWatcher(repoRoot, roots, opts) {
  const onEvent = opts.onEvent;
  const wasHookRecent = opts.wasHookRecent || (() => false);
  const resolveRoom = opts.resolveRoom;
  const humanLabel = opts.humanLabel || 'Dev';
  const timers = new Map();
  const watchers = [];

  for (const root of roots) {
    const abs = path.join(repoRoot, root);
    if (!fs.existsSync(abs)) continue;
    let w;
    try {
      w = fs.watch(abs, { recursive: true }, (_evt, filename) => {
        if (!filename) return;
        const rel = `${root}/${String(filename).split(path.sep).join('/')}`;
        if (isIgnoredRel(rel)) return;
        clearTimeout(timers.get(rel));
        timers.set(rel, setTimeout(() => {
          timers.delete(rel);
          if (wasHookRecent(rel)) return;
          onEvent(makeEvent({
            type: 'file_change',
            actor: { kind: 'human', id: 'dev', label: humanLabel },
            path: rel,
            roomId: resolveRoom(rel),
          }));
        }, DEBOUNCE_MS));
      });
    } catch { continue; }
    w.on('error', () => {});
    watchers.push(w);
  }

  return () => {
    for (const w of watchers) w.close();
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  };
}
