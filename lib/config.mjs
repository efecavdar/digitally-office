// Config loader — reads optional `.devoffice.json` from the target repo root.
// Everything has sensible defaults so zero-config `npx digitally-office` works.

import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = {
  signText: null,   // null → repo folder name (A-Z filtered)
  lang: 'en',       // 'en' | 'tr'
  port: 4242,
  floorNames: null, // { "1": "PRODUCT", "0": "MACHINE ROOM" }
  rooms: null,      // custom room map [{id, name, floor, paths: []}] — overrides auto
  watchRoots: null, // extra/override watch roots
};

export function loadConfig(repoRoot) {
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(path.join(repoRoot, '.devoffice.json'), 'utf8'));
  } catch { /* config yoksa varsayılanlar */ }
  const cfg = { ...DEFAULTS, ...user };

  if (!cfg.signText) {
    cfg.signText = path.basename(repoRoot).toUpperCase();
  }
  cfg.signText = String(cfg.signText).toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 12) || 'DIGITALLY';
  if (cfg.lang !== 'tr') cfg.lang = 'en';
  cfg.port = Number(process.env.PORT || process.env.DEV_OFFICE_PORT || cfg.port) || 4242;
  return cfg;
}
