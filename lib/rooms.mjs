// Room registry builder — custom rooms (from .devoffice.json) or auto-generated
// ones, plus the always-present common areas (tea corner, server room, archive).
// Longest-prefix path matching; anything unmatched falls into the archive.

export const FALLBACK_ROOM = 'arsiv';

const COMMON_NAMES = {
  en: { cay: 'Tea Corner', sunucu: 'Server Room', arsiv: 'Archive' },
  tr: { cay: 'Çay Ocağı', sunucu: 'Sunucu Odası', arsiv: 'Arşiv' },
};

// { rooms, resolveRoom } döner; rooms sırası kat yerleşim sırasıdır.
export function buildRooms(baseRooms, lang = 'en') {
  const names = COMMON_NAMES[lang] || COMMON_NAMES.en;
  const rooms = [
    ...baseRooms.filter((r) => r.floor === 1),
    { id: 'cay', name: names.cay, floor: 1, common: true, paths: [] },
    ...baseRooms.filter((r) => r.floor !== 1).map((r) => ({ ...r, floor: 0 })),
    { id: 'sunucu', name: names.sunucu, floor: 0, common: true, paths: ['scripts', 'ci', 'deploy', 'infra', 'ops'] },
    { id: 'arsiv', name: names.arsiv, floor: 0, common: true, paths: [] },
  ];

  const prefixTable = rooms
    .flatMap((r) => (r.paths || []).map((p) => ({ prefix: p.replace(/\/+$/, ''), roomId: r.id })))
    .sort((a, b) => b.prefix.length - a.prefix.length);

  function resolveRoom(relPath) {
    if (typeof relPath !== 'string' || relPath.length === 0) return FALLBACK_ROOM;
    const p = relPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
    for (const { prefix, roomId } of prefixTable) {
      if (p === prefix || p.startsWith(prefix + '/')) return roomId;
    }
    return FALLBACK_ROOM;
  }

  return { rooms, resolveRoom };
}
