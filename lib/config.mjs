// Config loader — reads optional `.devoffice.json` from the target repo root.
// Everything has sensible defaults so zero-config `npx digitally-office` works.

import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = {
  signText: null,   // null → repo folder name (A-Z filtered)
  lang: 'en',       // 'en' | 'tr'
  port: 4242,
  host: '127.0.0.1', // localhost only; '0.0.0.0' exposes the stream to your LAN
  capturePrompts: true, // false → prompt/command text is dropped before it is shown or logged
  floorNames: null, // { "1": "PRODUCT", "0": "MACHINE ROOM" }
  rooms: null,      // custom room map [{id, name, floor, paths: []}] — overrides auto
  watchRoots: null, // extra/override watch roots
};

export function loadConfig(repoRoot, argv = []) {
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

  // Ağ maruziyeti bilinçli bir tercih olmalı: varsayılan yalnız localhost.
  const hostArg = argv.indexOf('--host') >= 0 ? argv[argv.indexOf('--host') + 1] : null;
  cfg.host = hostArg || process.env.DEV_OFFICE_HOST || cfg.host || '127.0.0.1';
  cfg.exposed = cfg.host !== '127.0.0.1' && cfg.host !== 'localhost' && cfg.host !== '::1';

  if (argv.includes('--no-capture-prompts')) cfg.capturePrompts = false;
  if (process.env.DEV_OFFICE_NO_CAPTURE) cfg.capturePrompts = false;
  // Ağa açıkken prompt metnini asla yayma — sızıntı en çok burada acıtır.
  if (cfg.exposed) cfg.capturePrompts = false;

  return cfg;
}
