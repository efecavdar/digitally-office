// Olay şeması — watcher, gitpoll, hook, demo üreteci ve sunucunun ortak dili.
// Tek doğruluk kaynağı: buradaki şekil dışında olay üretilmez.
//
// { v:1, id:"<ts>-<n>", ts, type, actor:{kind,id,label}, path?, roomId?, meta? }

export const EVENT_TYPES = ['file_change', 'agent_edit', 'commit', 'branch', 'status'];

export const ACTOR_KINDS = ['human', 'claude', 'system'];

let counter = 0;

export function makeEvent(partial) {
  const ts = Date.now();
  return { v: 1, id: `${ts}-${counter++}`, ts, ...partial };
}

// Geçersizse Türkçe hata metni, geçerliyse null döner.
export function validateEvent(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return 'olay bir nesne değil';
  if (!EVENT_TYPES.includes(e.type)) return `bilinmeyen olay tipi: ${String(e.type)}`;
  if (e.actor !== undefined) {
    if (!e.actor || typeof e.actor !== 'object') return 'actor bozuk';
    if (!ACTOR_KINDS.includes(e.actor.kind)) return `bilinmeyen actor.kind: ${String(e.actor.kind)}`;
  }
  if (e.path !== undefined && typeof e.path !== 'string') return 'path string olmalı';
  if (e.roomId !== undefined && typeof e.roomId !== 'string') return 'roomId string olmalı';
  if (e.meta !== undefined && (typeof e.meta !== 'object' || e.meta === null)) return 'meta nesne olmalı';
  return null;
}
