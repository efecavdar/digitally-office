#!/usr/bin/env node
// digitally-office CLI
//   npx digitally-office                 run the office for the current repo
//   npx digitally-office --install-hooks add Claude Code hooks to this repo
//   npx digitally-office --print-layout  dump room layout JSON
//   npx digitally-office --no-open       don't open the browser
//   npx digitally-office --root <dir>    target repo (default: cwd)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const root = path.resolve(argValue('--root') || process.cwd());

if (args.includes('--help') || args.includes('-h')) {
  console.log(fs.readFileSync(new URL('./cli.mjs', import.meta.url), 'utf8')
    .split('\n').slice(1, 8).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

if (args.includes('--install-hooks')) {
  installHooks(root);
  process.exit(0);
}

process.env.DEV_OFFICE_ROOT = root;
await import(path.join(PKG_ROOT, 'server.mjs'));

// ── Claude Code hook kurulumu ───────────────────────────────────────
// Hook script'i hedef repoya KOPYALANIR (npx cache'ine bağımlı kalmasın),
// .claude/settings.json'a mevcut hook'lar ezilmeden eklenir.
function installHooks(repoRoot) {
  const hooksDir = path.join(repoRoot, '.claude', 'hooks');
  const hookDst = path.join(hooksDir, 'digitally-office.mjs');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(path.join(PKG_ROOT, 'hooks', 'post-tool.mjs'), hookDst);

  const settingsPath = path.join(repoRoot, '.claude', 'settings.json');
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { /* yoksa yeni */ }
  settings.hooks = settings.hooks || {};

  const cmd = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/digitally-office.mjs"';
  const entry = { hooks: [{ type: 'command', command: cmd, timeout: 5 }] };
  const hasOurs = (arr) => (arr || []).some((e) =>
    (e.hooks || []).some((h) => String(h.command || '').includes('digitally-office')));

  if (!hasOurs(settings.hooks.PostToolUse)) {
    settings.hooks.PostToolUse = settings.hooks.PostToolUse || [];
    settings.hooks.PostToolUse.push({ matcher: 'Edit|Write|NotebookEdit|Bash|Read|Grep|Glob', ...entry });
  }
  for (const ev of ['SessionStart', 'UserPromptSubmit', 'Stop']) {
    if (!hasOurs(settings.hooks[ev])) {
      settings.hooks[ev] = settings.hooks[ev] || [];
      settings.hooks[ev].push({ ...entry });
    }
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log('✓ Claude Code hooks installed:');
  console.log('  ' + path.relative(repoRoot, hookDst));
  console.log('  ' + path.relative(repoRoot, settingsPath) + ' (merged, nothing overwritten)');
  console.log('  Restart your Claude Code sessions to pick them up.');
}
