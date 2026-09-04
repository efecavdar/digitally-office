#!/usr/bin/env node
// Claude Code PostToolUse hook'u — düzenlenen dosyayı KEDD Ofisi'ne bildirir.
// Sunucu kapalıyken bile Claude'u YAVAŞLATMAMALI: toplam bütçe 500ms,
// her koşulda exit 0 (hook hatası Claude oturumuna asla sızmaz).

import http from 'node:http';

const PORT = Number(process.env.DEV_OFFICE_PORT || 4242);

setTimeout(() => process.exit(0), 500).unref?.();

let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('error', () => process.exit(0));
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  const sid = String(input.session_id || 'claude').replace(/-/g, '');
  const actor = { kind: 'claude', id: sid.slice(0, 8) || 'claude', label: `Claude-${(sid.slice(0, 4) || 'ai').toUpperCase()}` };

  let payload;
  if (input.hook_event_name === 'SessionStart') {
    // yeni oturum: ajan mesaiye gelir, ilk durak Çay Ocağı
    payload = { type: 'agent_edit', actor, roomId: 'cay', meta: { tool: 'SessionStart' } };
  } else if (input.hook_event_name === 'UserPromptSubmit') {
    // görev verildi: araç çağrısı olmasa bile (düşünme aşaması) ajan görünür olsun
    const snippet = String(input.prompt || '').trim().replace(/\s+/g, ' ').slice(0, 44);
    payload = { type: 'agent_edit', actor, meta: { tool: 'UserPromptSubmit', cmd: snippet } };
  } else if (input.hook_event_name === 'Stop') {
    // tur bitti: teslim
    payload = { type: 'agent_edit', actor, meta: { tool: 'Stop' } };
  } else if (input.tool_name === 'Bash') {
    // Bash'te dosya yolu yok — terminal işi Sunucu Odası'na düşer
    const cmd = String(input.tool_input?.command || '').trim().split('\n')[0].slice(0, 28);
    payload = { type: 'agent_edit', actor, roomId: 'sunucu', meta: { tool: 'Bash', cmd } };
  } else {
    // Edit/Write/NotebookEdit + Read/Grep/Glob: dosyanın odasında çalış
    const filePath = input.tool_input?.file_path || input.tool_input?.notebook_path
      || input.tool_input?.path;
    if (!filePath) process.exit(0);
    const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    let rel = String(filePath).split('\\').join('/');
    const rootFwd = String(root).split('\\').join('/').replace(/\/+$/, '');
    const meta = { tool: input.tool_name };
    if (rel.startsWith(rootFwd + '/')) {
      rel = rel.slice(rootFwd.length + 1);
    } else {
      // Repo dışı dosya (plan, not, başka proje): mutlak yolu ekrana basma —
      // yalnız dosya adı görünsün, oda eşlemesi Arşiv'e düşsün.
      rel = rel.split('/').pop();
      meta.external = true;
    }
    payload = { type: 'agent_edit', actor, path: rel, meta };
  }
  const body = JSON.stringify(payload);

  const req = http.request(
    { host: '127.0.0.1', port: PORT, path: '/event', method: 'POST',
      headers: { 'Content-Type': 'application/json' }, timeout: 400 },
    (res) => { res.resume(); res.on('end', () => process.exit(0)); },
  );
  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.end(body);
});
