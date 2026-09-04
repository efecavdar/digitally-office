// Digitally Office — ana orkestratör: SSE/demo olayları → ajan davranışı → render.
/* global window, document, location, EventSource, Layout, Render, Sprites, Demo, I18N, BOOT_LAYOUT */
(function () {
  'use strict';

  var WALK_SPEED = 54, STAIR_SPEED = 38;
  var WORK_MIN = 4000, WORK_EXTEND = 2500, WORK_CAP = 12000;
  var IDLE_TO_CAY = 45000, CLAUDE_SHIFT_END = 15 * 60000;
  var WANDER_AFTER = 15000; // bu kadar boş duran ajan ofiste gezinmeye başlar
  var SERVER_BASE = (location.protocol === 'http:' || location.protocol === 'https:')
    ? '' : 'http://localhost:4242';

  var state = {
    mode: 'baglaniyor', // 'live' | 'demo' | 'baglaniyor'
    agents: new Map(),
    particles: [],
    roomGlow: new Map(),
    ledBurst: 0,
    eventCount: 0,
    commitCount: 0,
    partyUntil: 0,
    deployUntil: 0,  // >0 iken Sunucu Odası'nda roket rampada bekler
    deployArmed: false,
    clockMode: 'auto', // 'auto' | 'day' | 'night'
  };

  // Olaydan iş tipi çıkarımı: dosya uzantısı + klasör + kullanılan araç
  function classifyWork(e) {
    var tool = (e.meta && e.meta.tool) || '';
    var cmd = ((e.meta && e.meta.cmd) || '').toLowerCase();
    var p = (e.path || '').toLowerCase();
    if (tool === 'Bash') {
      if (cmd.indexOf('deploy') !== -1) return 'deploy';
      if (/\bbuild\b|\btsc\b/.test(cmd)) return 'build';
      if (/\btest\b/.test(cmd)) return 'test';
      return 'terminal';
    }
    if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') return 'kesif';
    if (/(^|\/)test|\.test\.|\.spec\./.test(p)) return 'test';
    if (/\.(tsx|jsx|css|scss|html|vue|svelte)$/.test(p) ||
        /(^|\/)(components|pages|ui|frontend|client|web)\//.test(p)) return 'ui';
    if (/\.md$/.test(p) || /(^|\/)docs?\//.test(p)) return 'dokuman';
    if (/\.(json|sql|ya?ml|toml|rules)$/.test(p)) return 'config';
    if (/(^|\/)(functions|services|server|api|backend|packages)\//.test(p)) return 'backend';
    return 'kod';
  }

  function wl(type) { return I18N.t('wl_' + type); }
  var WORK_EMOJI = {
    ui: '🎨', backend: '⚙️', kod: '⌨️', test: '🧪', kesif: '🔍',
    terminal: '🖥️', deploy: '🚀', build: '🏗️', dokuman: '📄', config: '🔧',
    dusunce: '💭', goz: '👀',
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var geo = null, renderApi = null, curEnv = null;
  var canvas, stage, overlay, tickerTrack, hudMode, hudClock, hudStats, roster;
  var plates = {};
  var nameTags = {};
  var rosterAccum = 0;
  var replaySrc = null;
  var sseErrors = 0, es = null;

  // ── Açılış ────────────────────────────────────────────────────────
  function boot() {
    canvas = document.getElementById('screen');
    stage = document.getElementById('stage');
    overlay = document.getElementById('overlay');
    tickerTrack = document.getElementById('ticker-track');
    hudMode = document.getElementById('hud-mode');
    hudClock = document.getElementById('hud-clock');
    hudStats = document.getElementById('hud-stats');
    roster = document.getElementById('roster');

    fetchLayout().then(function (data) {
      var params = new URLSearchParams(location.search);
      I18N.set(params.get('lang') || (data && data.lang) || 'en');
      geo = Layout.build(data);
      renderApi = Render.init(canvas, geo);
      var title = geo.signText + I18N.t('office_suffix');
      document.getElementById('hud-title').textContent = title;
      document.title = title;
      buildOverlay();
      spawnHuman();
      wireInput();
      fitStage();
      window.addEventListener('resize', fitStage);
      requestAnimationFrame(loop);

      if (params.has('demo')) {
        replaySrc = params.get('src') || null; // ?demo=replay&src=sessions/x.jsonl
        startDemo(params.get('demo') === 'replay' ? 'replay' : 'gen', I18N.t('demo_request'));
      } else {
        connectSSE();
      }
    });
  }

  function fetchLayout() {
    return fetch(SERVER_BASE + '/layout')
      .then(function (r) { if (!r.ok) throw new Error('layout yok'); return r.json(); })
      .catch(function () { return window.BOOT_LAYOUT; });
  }

  function fitStage() {
    var k = Math.min(window.innerWidth / geo.W, (window.innerHeight - 34) / geo.H);
    stage.style.transform = 'scale(' + k.toFixed(4) + ')';
  }

  // ── DOM katmanı: oda tabelaları + kat etiketleri ──────────────────
  function buildOverlay() {
    geo.rooms.forEach(function (r) {
      var el = document.createElement('div');
      el.className = 'plate';
      el.textContent = r.label;
      el.title = r.name + ' — ' + r.fileCount + ' 📄';
      el.style.left = r.x0 + 'px';
      el.style.top = (r.y0 + 2) + 'px';
      el.style.width = (r.x1 - r.x0) + 'px';
      overlay.appendChild(el);
      plates[r.id] = el;
    });
    var fn = geo.floorNames || {};
    [{ y: geo.F1.y0, text: fn['1'] || I18N.t('floor1') },
     { y: geo.F0.y0, text: fn['0'] || I18N.t('floor0') }]
      .forEach(function (f) {
        var el = document.createElement('div');
        el.className = 'floor-tag';
        el.textContent = f.text;
        el.style.left = '10px';
        el.style.top = (f.y - 8) + 'px';
        overlay.appendChild(el);
      });
  }

  // ── Ajanlar ───────────────────────────────────────────────────────
  function ensureAgent(actor) {
    var id = (actor && actor.id) || 'dev';
    var a = state.agents.get(id);
    if (a) { a.label = (actor && actor.label) || a.label; return a; }
    a = {
      id: id,
      label: (actor && actor.label) || I18N.t('ro_guest'),
      kind: (actor && actor.kind) || 'human',
      colors: Sprites.colorsFor(actor || { kind: 'human', id: id }),
      x: geo.stair.cx, y: geo.stair.botWalkY, dir: -1,
      anim: 'idle', frame: Math.random() * 100,
      path: [], pending: null, room: null, deskScreen: null,
      queue: [], job: null, workUntil: 0, celebrateUntil: 0,
      idleSince: Date.now(), lastJobAt: Date.now(), lastSeen: Date.now(),
      carrying: false, bubble: null,
    };
    state.agents.set(id, a);
    if (a.kind === 'claude') ticker(I18N.t('tk_arrive', { l: a.label }));
    return a;
  }

  function spawnHuman() {
    var dev = ensureAgent({ kind: 'human', id: 'dev', label: geo.humanLabel });
    var cay = geo.roomById.cay;
    dev.x = (cay.x0 + cay.x1) / 2;
    dev.y = cay.walkY;
    dev.room = 'cay';
    dev.anim = 'coffee';
  }

  function floorOf(y) { return y > geo.SLAB.y1 ? 0 : 1; }

  function goToRoom(a, roomId, pending) {
    var room = geo.roomById[roomId] || geo.roomById.arsiv;
    var targetX;
    if (room.deskXs.length) {
      var idx = (Sprites.hashStr(a.id) + state.agents.size) % room.deskXs.length;
      a.deskX = room.deskXs[idx];
      targetX = a.deskX - 8;
    } else {
      a.deskX = null;
      targetX = room.x0 + 10 + (Sprites.hashStr(a.id) % Math.max(8, room.x1 - room.x0 - 22));
    }
    var curFloor = floorOf(a.y);
    var wps = [];
    if (curFloor === room.floor) {
      wps.push({ x: targetX, y: room.walkY });
    } else {
      wps.push({ x: geo.stair.cx, y: geo.walkYFor(curFloor) });
      wps.push({ x: geo.stair.cx, y: room.walkY });
      wps.push({ x: targetX, y: room.walkY });
    }
    a.path = wps;
    a.anim = 'walk';
    a.pending = pending;
    a.pendingRoom = roomId;
    a.deskScreen = null;
  }

  function screenFor(roomId, deskX) {
    var screens = (renderApi.reg.screens[roomId] || []);
    var best = null, bd = 1e9;
    screens.forEach(function (s) {
      var d = Math.abs(s.x - deskX);
      if (d < bd) { bd = d; best = s; }
    });
    return best;
  }

  function startNextJob(a, now) {
    var job = a.queue.shift();
    if (!job) return false;
    a.job = job;
    a.carrying = true;
    a.lastJobAt = now;
    goToRoom(a, job.roomId, 'work');
    return true;
  }

  function updateAgent(a, dt, now) {
    a.frame += dt * 60;

    if (a.celebrateUntil > now && a.anim !== 'walk') { a.anim = 'celebrate'; return; }
    if (a.anim === 'celebrate') { a.anim = a.job ? 'work' : 'idle'; }

    if (a.anim === 'walk') {
      var wp = a.path[0];
      if (!wp) { arrive(a, now); return; }
      if (Math.abs(wp.y - a.y) > 1) {
        a.y += Math.sign(wp.y - a.y) * STAIR_SPEED * dt;
        if (Math.abs(wp.y - a.y) <= 1.2) a.y = wp.y;
      } else {
        a.y = wp.y;
        var dx = wp.x - a.x;
        a.dir = dx < 0 ? -1 : 1;
        a.x += Math.sign(dx) * WALK_SPEED * dt;
        if (Math.random() < dt * 6) { // ayak tozu
          state.particles.push({
            kind: 'dust', x: a.x - a.dir * 3, y: a.y - 1,
            vx: -a.dir * 7, vy: -4, life: 0.35, max: 0.35,
          });
        }
        if (Math.abs(wp.x - a.x) <= 1.5) { a.x = wp.x; a.path.shift(); }
      }
      if (!a.path.length) arrive(a, now);
      return;
    }

    if (a.anim === 'work') {
      if (Math.random() < dt * 13 && a.deskScreen) {
        state.particles.push({
          kind: 'spark',
          x: a.deskScreen.x + Math.random() * 5, y: a.deskScreen.y - 1,
          vx: (Math.random() - 0.5) * 6, vy: -12 - Math.random() * 8,
          life: 0.5, max: 0.5,
        });
      }
      if (now > a.workUntil) {
        a.job = null;
        a.deskScreen = null;
        a.workType = null; // efekt yalnız iş sürerken (kalıcılık: iş süresince)
        if (!startNextJob(a, now)) { a.anim = 'idle'; a.idleSince = now; }
      }
      return;
    }

    // idle / coffee
    if (a.queue.length) { startNextJob(a, now); return; }

    // çayda fincan balonu, gece yarısı uyuklama
    if (a.anim === 'coffee' && Math.random() < dt / 7) {
      a.bubble = { glyph: 'cay', until: now + 1800 };
    } else if (a.anim === 'idle' && curEnv && curEnv.dayness < 0.15 && Math.random() < dt / 12) {
      a.bubble = { glyph: 'uyku', until: now + 2200 };
    }

    if (a.kind === 'claude' && now - Math.max(a.lastJobAt, a.lastSeen || 0) > CLAUDE_SHIFT_END) {
      // mesai bitti: merdivenden inip sahneden çık
      a.pending = 'leave';
      a.pendingRoom = null;
      a.deskScreen = null;
      a.path = [
        { x: geo.stair.cx, y: geo.walkYFor(floorOf(a.y)) },
        { x: geo.stair.cx, y: geo.stair.botWalkY },
      ];
      a.anim = 'walk';
      return;
    }
    // çay artık ara sıra uğranan bir mola; gezinti asıl mesai-dışı davranış
    if (a.anim === 'idle' && a.room !== 'cay' && now - a.idleSince > IDLE_TO_CAY &&
        Math.random() < dt / 40) {
      goToRoom(a, 'cay', 'coffee');
      return;
    }
    // aylak gezinti: bir süre boş duran ajan rastgele bir odaya uğrar
    if ((a.anim === 'idle' || a.anim === 'coffee') &&
        now - a.idleSince > WANDER_AFTER && Math.random() < dt / 14) {
      var candidates = geo.rooms.filter(function (r) { return !r.common && r.id !== a.room; });
      var pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (pick) goToRoom(a, pick.id, 'visit');
    }
  }

  function arrive(a, now) {
    a.carrying = false;
    if (a.pending === 'work') {
      a.room = a.pendingRoom;
      a.anim = 'work';
      a.workType = (a.job && a.job.work) || a.workType || 'kod';
      a.workUntil = a.workType === 'dusunce'
        ? now + 45000 + Math.random() * 30000 // düşünme uzun sürer, iş gelince kesilir
        : now + WORK_MIN + Math.random() * 3000;
      a.deskScreen = a.deskX != null ? screenFor(a.room, a.deskX) : null;
    } else if (a.pending === 'coffee') {
      a.room = 'cay';
      a.anim = 'coffee';
      a.idleSince = now;
    } else if (a.pending === 'visit') {
      a.room = a.pendingRoom;
      a.idleSince = now - (WANDER_AFTER / 2); // gezginler bir süre sonra yine yollara düşer
      var vr = geo.roomById[a.room];
      if (vr && vr.deskXs.length && a.deskX != null && Math.random() < 0.5) {
        // yarı yarıya: masaya oturup kısaca göz atar
        a.anim = 'work';
        a.workType = 'goz';
        a.workUntil = now + 2500 + Math.random() * 3500;
        a.deskScreen = screenFor(a.room, a.deskX);
      } else {
        a.anim = 'idle';
        a.bubble = { glyph: 'soru', until: now + 1300 }; // merakla etrafa bakınır
      }
    } else if (a.pending === 'leave') {
      state.agents.delete(a.id);
      ticker(I18N.t('tk_left', { l: a.label }));
      return;
    } else {
      a.anim = 'idle';
      a.idleSince = now;
    }
    a.pending = null;
  }

  // ── Olay işleme ───────────────────────────────────────────────────
  function handleEvent(e) {
    if (!e || !e.type) return;
    state.eventCount++;
    var now = Date.now();
    if (e.type === 'file_change' || e.type === 'agent_edit') {
      var a = ensureAgent(e.actor);
      a.lastSeen = now;
      if (e.meta && e.meta.tool === 'SessionStart') {
        // yeni oturum: çaya uğra, ticker duyursun (ensureAgent zaten duyurdu)
        if (a.anim === 'idle') goToRoom(a, 'cay', 'coffee');
        return;
      }
      if (e.meta && e.meta.tool === 'UserPromptSubmit') {
        // görev verildi: araç çağrısı gelmese bile (düşünme aşaması) görünür ol
        a.bubble = { glyph: 'unlem', until: now + 1600 };
        var snip = (e.meta.cmd || '').trim();
        ticker(I18N.t('tk_task', { l: a.label }) + (snip ? ' · “' + snip + '…”' : ''));
        if (a.anim === 'work') {
          a.workType = 'dusunce';
          a.workUntil = now + 60000;
        } else {
          var thinkRoom = (a.room && geo.roomById[a.room] && !geo.roomById[a.room].common)
            ? a.room
            : (geo.rooms.filter(function (r) { return !r.common; })[0] || geo.rooms[0]).id;
          a.queue = [{ roomId: thinkRoom, work: 'dusunce' }];
        }
        return;
      }
      if (e.meta && e.meta.tool === 'Stop') {
        a.bubble = { glyph: 'nota', until: now + 1800 };
        ticker(I18N.t('tk_done', { l: a.label }));
        if (a.anim === 'work') a.workUntil = Math.min(a.workUntil, now + 1500);
        return;
      }
      var roomId = (e.roomId && geo.roomById[e.roomId]) ? e.roomId : 'arsiv';
      var wtype = classifyWork(e);
      state.roomGlow.set(roomId, 1);
      a.bubble = { glyph: 'unlem', until: now + 1400 };
      var room = geo.roomById[roomId];

      // deploy komutu: Sunucu Odası'nda roket rampaya çekilir; komutlar
      // sustuktan 6 sn sonra fırlatılır
      if (wtype === 'deploy') {
        if (!state.deployArmed) ticker(I18N.t('tk_deploy_prep'));
        state.deployArmed = true;
        state.deployUntil = now + 6000;
      }
      state.particles.push({ // odanın üstünde beliren dosya ikonu
        kind: 'pop', x: (room.x0 + room.x1) / 2 - 2, y: room.y0 + 14,
        vx: 0, vy: -8, life: 1.1, max: 1.1,
      });
      if (plates[roomId]) {
        plates[roomId].classList.add('hot');
        setTimeout(function () { plates[roomId].classList.remove('hot'); }, 1000);
      }
      var fname = e.path ? String(e.path).split('/').pop() : ((e.meta && e.meta.cmd) || '');
      a.lastFile = fname;
      // odanın üstünde süzülen dosya adı — hangi dosyada çalışıldığı uzaktan okunur
      if (fname) {
        var ft = document.createElement('div');
        ft.className = 'filetag';
        ft.textContent = (WORK_EMOJI[wtype] || '') + ' ' + fname;
        ft.style.left = ((room.x0 + room.x1) / 2) + 'px';
        ft.style.top = (room.y0 + 12) + 'px';
        overlay.appendChild(ft);
        setTimeout(function () { ft.remove(); }, 2500);
      }
      if (a.anim === 'work' && a.workType === 'dusunce' && a.job && a.job.roomId !== roomId) {
        a.workUntil = now; // düşünme bitti, gerçek iş başka odada
      }
      if (a.job && a.job.roomId === roomId && a.anim === 'work') {
        a.workUntil = Math.min(a.workUntil + WORK_EXTEND, now + WORK_CAP);
        a.workType = wtype; // aynı odada iş tipi değişebilir (okurken yazmaya geçti)
      } else if ((a.job && a.job.roomId === roomId) || (a.pendingRoom === roomId && a.anim === 'walk')) {
        if (a.job) a.job.work = wtype;
      } else if (a.queue.length < 2 && !a.queue.some(function (j) { return j.roomId === roomId; })) {
        a.queue.push({ roomId: roomId, work: wtype });
      }
      ticker(a.label + ' ▸ ' + (geo.roomById[roomId] || {}).name + ' · ' +
        wl(wtype) + (fname ? ' · ' + fname : ''));
    } else if (e.type === 'commit') {
      var m = e.meta || {};
      state.commitCount++;
      ticker(I18N.t('tk_commit') + (m.subject || m.hash || '?') + (m.author ? ' — ' + m.author : ''));
      state.ledBurst = 2.5;
      celebrate(now);
    } else if (e.type === 'branch') {
      ticker(I18N.t('tk_branch') + ((e.meta && e.meta.branch) || '?'));
    } else if (e.type === 'status') {
      ticker((e.meta && e.meta.text) || I18N.t('tk_pulse'));
    }
    if (hudStats) hudStats.textContent = I18N.t('stats', { n: state.eventCount, c: state.commitCount });
  }

  function celebrate(now) {
    var sunucu = geo.roomById.sunucu;
    var cx = (sunucu.x0 + sunucu.x1) / 2, cy = sunucu.y1 - 30;
    // deploy roketi çatıdan kalkar 🚀
    state.particles.push({
      kind: 'rocket', x: geo.LEFT + 70, y: geo.F1.y0 - 14, vx: 0, vy: -52, life: 2.6, max: 2.6,
    });
    for (var i = 0; i < 26; i++) {
      state.particles.push({
        kind: 'confetti',
        x: cx + (Math.random() - 0.5) * 30, y: cy + Math.random() * 10,
        vx: (Math.random() - 0.5) * 46, vy: -35 - Math.random() * 45, g: 85,
        color: ['#e8554d', '#ffd66e', '#53c66e', '#4da6e8', '#e86eb0'][i % 5],
        life: 2.2, max: 2.2,
      });
    }
    state.roomGlow.forEach(function (g, roomId) {
      if (g < 0.15 || roomId === 'sunucu') return;
      var r = geo.roomById[roomId];
      state.particles.push({
        kind: 'parcel',
        x0: (r.x0 + r.x1) / 2, y0: r.y1 - 16, tx: cx, ty: cy,
        life: 1.1, max: 1.1,
      });
    });
    state.agents.forEach(function (a) {
      if (a.anim === 'idle' || a.anim === 'work' || a.anim === 'coffee') {
        a.celebrateUntil = now + 1400;
        a.bubble = { glyph: 'nota', until: now + 1600 };
      }
    });
  }

  // ── Bağlantı: SSE canlı akış, düşerse demo ────────────────────────
  function connectSSE() {
    es = new EventSource(SERVER_BASE + '/events');
    es.addEventListener('office', function (ev) {
      try { handleEvent(JSON.parse(ev.data)); } catch (err) { /* bozuk kare, geç */ }
    });
    es.onopen = function () {
      sseErrors = 0;
      if (state.mode !== 'live') {
        if (Demo.isRunning()) Demo.stop();
        state.mode = 'live';
        updateHud();
        ticker(I18N.t('tk_live'));
      }
    };
    es.onerror = function () {
      sseErrors++;
      if (sseErrors >= 3 && state.mode !== 'demo') {
        startDemo('gen', I18N.t('demo_fallback'));
        // EventSource denemeye devam eder; dönerse onopen canlıya alır
      }
    };
  }

  function startDemo(mode, reason) {
    // Kayıttan oynatma ile sentetik demo ayrı etiketlenir: rozet, izleyene
    // verinin gerçek bir oturumdan mı geldiğini dürüstçe söylemeli.
    state.mode = mode === 'replay' ? 'replay' : 'demo';
    updateHud();
    Demo.start(handleEvent, { rooms: geo.rooms, mode: mode, replayUrl: replaySrc });
    ticker(state.mode === 'replay'
      ? I18N.t('tk_replay', { r: reason })
      : I18N.t('tk_demo', { r: reason, i: Demo.getIntensity() }));
  }

  function updateHud() {
    hudMode.textContent = state.mode === 'live' ? I18N.t('mode_live')
      : (state.mode === 'replay' ? I18N.t('mode_replay')
        : (state.mode === 'demo' ? I18N.t('mode_demo') : I18N.t('mode_connecting')));
    hudMode.className = state.mode;
  }

  // Ajan isim etiketleri: sprite'ı takip eden, ajan renginde DOM yazıları
  function updateNameTags() {
    // Aynı odada çalışan ajanların etiketleri üst üste binmesin: soldan sağa
    // yerleştirip çakışanı bir kat yukarı taşı.
    var list = [];
    state.agents.forEach(function (a) { list.push(a); });
    list.sort(function (p, q) { return p.x - q.x; });
    var placed = [];

    list.forEach(function (a) {
      var el = nameTags[a.id];
      if (!el) {
        el = document.createElement('div');
        el.className = 'nametag';
        el.style.color = a.colors.body;
        overlay.appendChild(el);
        nameTags[a.id] = el;
      }
      var txt = a.label + (a.anim === 'work' && a.workType
        ? ' ' + (WORK_EMOJI[a.workType] || '')
        : (a.anim === 'coffee' ? ' ☕' : ''));
      if (el.textContent !== txt) el.textContent = txt;

      var ty = a.y - 34;
      for (var guard = 0; guard < 4; guard++) {
        var clash = placed.some(function (p) {
          return Math.abs(p.x - a.x) < 54 && Math.abs(p.y - ty) < 7;
        });
        if (!clash) break;
        ty -= 8;
      }
      placed.push({ x: a.x, y: ty });
      el.style.left = Math.round(a.x) + 'px';
      el.style.top = Math.round(ty) + 'px';
    });
    Object.keys(nameTags).forEach(function (id) {
      if (!state.agents.has(id)) { nameTags[id].remove(); delete nameTags[id]; }
    });
  }

  // Oturum panosu: kim, nerede, ne yapıyor — tek bakışta
  function updateRoster() {
    var rows = [];
    state.agents.forEach(function (a) {
      var st;
      if (a.anim === 'work') {
        st = ((geo.roomById[a.room] || {}).name || '?') + ' · ' +
          (a.workType ? wl(a.workType) : I18N.t('working')) +
          (a.lastFile ? ' · ' + esc(a.lastFile) : '');
      } else if (a.anim === 'walk') {
        st = '→ ' + (((geo.roomById[a.pendingRoom] || {}).name) || '…') + (a.carrying ? ' 📦' : '');
      } else if (a.anim === 'coffee') {
        st = geo.roomById.cay.name + ' ☕';
      } else {
        st = (((geo.roomById[a.room] || {}).name) || I18N.t('ro_office')) + ' · ' + I18N.t('ro_wait');
      }
      rows.push('<div><span class="r-dot" style="background:' + a.colors.body + '"></span>' +
        '<span class="r-name">' + esc(a.label) + '</span>' +
        '<span class="r-status">' + st + '</span></div>');
    });
    roster.innerHTML = rows.join('');
  }

  // ── Ticker ────────────────────────────────────────────────────────
  var tickerQueue = [];
  var tickerX = 0;
  var fillerIdx = 0;

  function ticker(msg) {
    if (tickerQueue.length < 24) tickerQueue.push(msg);
  }

  function fillerLine() {
    var lines = I18N.t('fillers');
    var line = lines[fillerIdx++ % lines.length];
    return String(line).split('{n}').join(state.eventCount);
  }

  function appendTickerItem() {
    var msg = tickerQueue.shift() || fillerLine();
    var span = document.createElement('span');
    span.textContent = msg + '  ✦  ';
    tickerTrack.appendChild(span);
  }

  function updateTicker(dt) {
    tickerX -= 55 * dt;
    var first = tickerTrack.firstChild;
    if (first && -tickerX > first.offsetWidth) {
      tickerX += first.offsetWidth;
      tickerTrack.removeChild(first);
    }
    var total = 0;
    tickerTrack.childNodes.forEach(function (n) { total += n.offsetWidth; });
    while (total + tickerX < window.innerWidth + 240 && tickerTrack.childNodes.length < 30) {
      appendTickerItem();
      total += tickerTrack.lastChild.offsetWidth;
    }
    tickerTrack.style.transform = 'translateX(' + tickerX.toFixed(1) + 'px)';
  }

  // ── Saat / gündüz-gece ────────────────────────────────────────────
  function envNow() {
    var d = new Date();
    var hour = d.getHours(), minute = d.getMinutes();
    if (state.clockMode === 'day') { hour = 14; minute = 0; }
    if (state.clockMode === 'night') { hour = 23; minute = 30; }
    var h = hour + minute / 60;
    var dayness;
    if (h >= 8 && h < 18) dayness = 1;
    else if (h >= 6 && h < 8) dayness = (h - 6) / 2;
    else if (h >= 18 && h < 20) dayness = 1 - (h - 18) / 2;
    else dayness = 0;
    return { hour: hour, minute: minute, dayness: dayness, tsec: performance.now() / 1000 };
  }

  // ── Girdi ─────────────────────────────────────────────────────────
  function wireInput() {
    document.addEventListener('keydown', function (ev) {
      var k = ev.key.toLowerCase();
      if (k === 's') document.getElementById('scanlines').hidden = !document.getElementById('scanlines').hidden;
      else if (k === 'g') {
        state.clockMode = state.clockMode === 'auto' ? 'night' : (state.clockMode === 'night' ? 'day' : 'auto');
        ticker(I18N.t('tk_clock', { m: I18N.t('clock_' + state.clockMode) }));
      } else if (k === 'm') {
        if (state.mode === 'demo') { Demo.stop(); state.mode = 'baglaniyor'; updateHud(); sseErrors = 0; if (es) es.close(); connectSSE(); }
        else { if (es) es.close(); startDemo('gen', I18N.t('demo_manual')); }
      } else if (k === 'f') {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(function () {});
      } else if (k === '+' || k === '=') {
        ticker(I18N.t('tk_tempo', { n: Demo.setIntensity(Demo.getIntensity() + 1) }));
      } else if (k === '-') {
        ticker(I18N.t('tk_tempo', { n: Demo.setIntensity(Demo.getIntensity() - 1) }));
      } else if (k === 'p') {
        // DJ drop butonu: 8 saniyelik ofis partisi
        state.partyUntil = Date.now() + 8000;
        state.ledBurst = 8;
        celebrate(Date.now());
        ticker(I18N.t('tk_party'));
      } else if (k === 'r') {
        roster.hidden = !roster.hidden;
        ticker(I18N.t(roster.hidden ? 'tk_roster_off' : 'tk_roster_on'));
      } else if (k === 'a') {
        // ses tepkisi: mikrofonu dinle (yoksa sahte ritim)
        if (window.AudioFX.isOn()) {
          window.AudioFX.stop();
          state.audio = null;
          ticker(I18N.t('tk_audio_off'));
        } else {
          ticker(I18N.t('tk_mic_wait'));
          window.AudioFX.start().then(function (mic) {
            ticker(I18N.t(mic ? 'tk_music_mic' : 'tk_music_fake'));
          });
        }
      }
    });
  }

  // ── Ana döngü ─────────────────────────────────────────────────────
  var lastT = 0, lastClockText = '';
  function loop(tms) {
    var dt = Math.min(0.05, (tms - lastT) / 1000 || 0.016);
    lastT = tms;
    var now = Date.now();
    curEnv = envNow(); // updateAgent gece/gündüzü bilsin (uyuklama balonu)
    state.audio = window.AudioFX.isOn() ? window.AudioFX.update(tms / 1000, dt) : null;

    state.roomGlow.forEach(function (g, id) {
      var ng = g - dt * 0.16;
      if (ng <= 0.02) state.roomGlow.delete(id);
      else state.roomGlow.set(id, ng);
    });
    state.ledBurst = Math.max(0, state.ledBurst - dt);

    // deploy komutları sustu → FIRLAT!
    if (state.deployArmed && state.deployUntil && now > state.deployUntil) {
      state.deployArmed = false;
      state.deployUntil = 0;
      var sr = geo.roomById.sunucu;
      state.particles.push({
        kind: 'rocket', x: sr.x1 - 13, y: sr.y1 - 16, vx: 0, vy: -72, life: 3.2, max: 3.2,
      });
      state.roomGlow.set('sunucu', 1);
      state.ledBurst = 2.5;
      ticker(I18N.t('tk_deploy_go'));
    }

    state.agents.forEach(function (a) { updateAgent(a, dt, now); });

    // parti modu: konfeti yağmuru + herkes dansta
    if (state.partyUntil > now) {
      if (Math.random() < dt * 42) {
        state.particles.push({
          kind: 'confetti', x: Math.random() * geo.W, y: 24,
          vx: (Math.random() - 0.5) * 34, vy: 30 + Math.random() * 55, g: 26,
          color: ['#e8554d', '#ffd66e', '#53c66e', '#4da6e8', '#e86eb0', '#5fd6c9'][Math.floor(Math.random() * 6)],
          life: 4.2, max: 4.2,
        });
      }
      state.agents.forEach(function (a) {
        if (a.anim !== 'walk') a.celebrateUntil = now + 400;
      });
    }

    for (var i = state.particles.length - 1; i >= 0; i--) {
      var p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) { state.particles.splice(i, 1); continue; }
      if (p.kind === 'confetti') { p.vy += p.g * dt; }
      if (p.kind === 'rocket' && Math.random() < dt * 26) { // duman izi
        state.particles.push({
          kind: 'dust', x: p.x + 1, y: p.y + 7,
          vx: (Math.random() - 0.5) * 10, vy: 8, life: 0.6, max: 0.6,
        });
      }
      if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    if (state.particles.length > 400) state.particles.splice(0, state.particles.length - 400);

    var env = curEnv;
    renderApi.frame(state, env);
    updateTicker(dt);
    updateNameTags();
    rosterAccum += dt;
    if (rosterAccum > 0.5) { rosterAccum = 0; updateRoster(); }

    var clockText = (env.hour < 10 ? '0' : '') + env.hour + ':' + (env.minute < 10 ? '0' : '') + env.minute;
    if (clockText !== lastClockText) { hudClock.textContent = clockText; lastClockText = clockText; }

    requestAnimationFrame(loop);
  }

  // smoke test + konsoldan kurcalama için
  window.__office = { state: state, handleEvent: handleEvent, getGeo: function () { return geo; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
