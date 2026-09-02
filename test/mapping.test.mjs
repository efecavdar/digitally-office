import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRooms, FALLBACK_ROOM } from '../lib/rooms.mjs';
import { autoRooms } from '../lib/autorooms.mjs';
import { watchRootsFor } from '../lib/scan.mjs';
import { validateEvent, makeEvent } from '../lib/events.mjs';

const base = [
  { id: 'web', name: 'WEB', floor: 1, paths: ['web'] },
  { id: 'api', name: 'API', floor: 0, paths: ['api', 'server/api'] },
];

test('buildRooms: longest-prefix eşleme + commons', () => {
  const { rooms, resolveRoom } = buildRooms(base, 'en');
  assert.equal(resolveRoom('web/App.tsx'), 'web');
  assert.equal(resolveRoom('server/api/users.ts'), 'api');
  assert.equal(resolveRoom('scripts/deploy.sh'), 'sunucu');
  assert.equal(resolveRoom('random/file.ts'), FALLBACK_ROOM);
  assert.equal(resolveRoom(''), FALLBACK_ROOM);
  assert.equal(resolveRoom('webx/App.tsx'), FALLBACK_ROOM); // prefix sınırı kaymaz
  const ids = rooms.map((r) => r.id);
  assert.ok(ids.includes('cay') && ids.includes('sunucu') && ids.includes('arsiv'));
  assert.equal(rooms.find((r) => r.id === 'cay').name, 'Tea Corner');
});

test('buildRooms: tr ortak alan adları', () => {
  const { rooms } = buildRooms(base, 'tr');
  assert.equal(rooms.find((r) => r.id === 'cay').name, 'Çay Ocağı');
});

test('watchRootsFor: iç içe kökleri eler', () => {
  const roots = watchRootsFor([
    { paths: ['src'] }, { paths: ['src/app'] }, { paths: ['docs'] },
  ]);
  assert.deepEqual(roots.sort(), ['docs', 'src']);
});

test('autoRooms: sahte repodan oda üretir', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devoffice-'));
  for (const d of ['web', 'api', 'auth']) {
    fs.mkdirSync(path.join(tmp, d));
    fs.writeFileSync(path.join(tmp, d, 'a.ts'), 'x');
  }
  fs.mkdirSync(path.join(tmp, 'node_modules'));
  fs.writeFileSync(path.join(tmp, 'node_modules', 'skip.js'), 'x');
  const rooms = autoRooms(tmp);
  const ids = rooms.map((r) => r.id).sort();
  assert.deepEqual(ids, ['api', 'auth', 'web']);
  assert.ok(rooms.every((r) => r.floor === 0 || r.floor === 1));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('olay doğrulama + kimlik', () => {
  assert.equal(validateEvent({ type: 'file_change', path: 'web/a.ts' }), null);
  assert.ok(validateEvent({ type: 'nope' }));
  const a = makeEvent({ type: 'status' });
  const b = makeEvent({ type: 'status' });
  assert.ok(a.id !== b.id && a.v === 1);
});
