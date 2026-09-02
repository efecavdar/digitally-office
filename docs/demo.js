// Demo mode — the office lives even without a server/repo (DJ-set scenario).
// Two flavours: 'gen' (synthetic generator, intensity 1-10) and 'replay' (JSONL).
/* global window, I18N */
window.Demo = (function () {
  'use strict';

  var ACTORS = [
    { kind: 'human', id: 'dev', label: 'Dev', w: 4 },
    { kind: 'claude', id: 'claudeA1', label: 'Claude-A1', w: 3 },
    { kind: 'claude', id: 'claudeB7', label: 'Claude-B7', w: 2 },
    { kind: 'claude', id: 'claudeC3', label: 'Claude-C3', w: 2 },
  ];
  var WORDS = ['userService', 'paymentFlow', 'searchIndex', 'authGuard', 'dashboard',
    'apiClient', 'webhookRouter', 'cacheLayer', 'emailQueue', 'featureFlag',
    'sessionStore', 'rateLimiter', 'auditTrail', 'onboarding'];
  var SUBJECTS = {
    en: ['fix: tea kettle overflow contained', 'feat: confetti on customer cards',
      'refactor: untangled the cables', 'chore: night-shift backlog sweep',
      'fix: caught the runaway booking', 'perf: prompt diet −14%', 'test: guard scenarios',
      'feat: one more wizard step', 'fix: ghost user evicted', 'docs: dusted the archive'],
    tr: ['fix: çay ocağı taşması giderildi', 'feat: müşteri kartına konfeti',
      'refactor: kablolar toplandı', 'toplu: gece mesaisi birikintisi',
      'fix: kaçak randevu yakalandı', 'perf: prompt diyeti −%14', 'test: nöbetçi senaryolar',
      'feat: sihirbaza yeni adım', 'fix: hayalet müşteri kovuldu', 'chore: arşiv tozu alındı'],
  };

  var running = false;
  var intensity = 5;
  var timers = [];
  var emitFn = null;
  var roomWeights = [];
  var n = 0;

  function rand(a) { return a[Math.floor(Math.random() * a.length)]; }
  function weighted(list) {
    var sum = list.reduce(function (s, e) { return s + e.w; }, 0);
    var r = Math.random() * sum;
    for (var i = 0; i < list.length; i++) { r -= list[i].w; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }
  function mkEvent(partial) {
    var ts = Date.now();
    return Object.assign({ v: 1, id: 'demo-' + ts + '-' + (n++), ts: ts }, partial);
  }

  function fireWork() {
    if (!running) return;
    var actor = weighted(ACTORS);
    var room = weighted(roomWeights);
    var ext = rand(['.ts', '.ts', '.tsx', '.tsx', '.test.ts', '.css', '.md', '.json']);
    var isClaude = actor.kind === 'claude';
    var evt = {
      type: isClaude ? 'agent_edit' : 'file_change',
      actor: { kind: actor.kind, id: actor.id, label: actor.label },
      path: room.id + '/' + rand(WORDS) + ext,
      roomId: room.id,
    };
    if (isClaude && Math.random() < 0.25) evt.meta = { tool: 'Read' }; // keşif de olsun
    emitFn(mkEvent(evt));
    schedule(fireWork, 9000 / intensity);
  }

  function fireCommit() {
    if (!running) return;
    var subjects = SUBJECTS[I18N.lang()] || SUBJECTS.en;
    emitFn(mkEvent({
      type: 'commit', actor: { kind: 'system', id: 'git', label: 'git' }, roomId: 'sunucu',
      meta: {
        hash: Math.random().toString(16).slice(2, 9),
        subject: rand(subjects),
        author: rand(['Dev', 'Claude-A1', 'Claude-B7']),
      },
    }));
    schedule(fireCommit, 220000 / intensity);
  }

  function schedule(fn, meanMs) {
    var delay = Math.max(250, -Math.log(1 - Math.random()) * meanMs);
    timers.push(setTimeout(fn, delay));
  }

  function startGen() {
    schedule(fireWork, 1200);
    schedule(fireWork, 2600);
    schedule(fireCommit, 90000 / intensity);
  }

  function startReplay(url) {
    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('no recording'); return r.text(); })
      .then(function (text) {
        var events = text.split('\n').filter(Boolean).map(function (l) {
          try { return JSON.parse(l); } catch (e) { return null; }
        }).filter(Boolean);
        if (!events.length) throw new Error('empty recording');
        playReplay(events, 0);
      })
      .catch(function () { startGen(); });
  }

  function playReplay(events, i) {
    if (!running) return;
    if (i >= events.length) { playReplay(events, 0); return; }
    emitFn(events[i]);
    var gap = i + 1 < events.length ? events[i + 1].ts - events[i].ts : 2500;
    gap = Math.min(Math.max(gap * 0.5, 250), 6000);
    timers.push(setTimeout(function () { playReplay(events, i + 1); }, gap / (intensity / 5)));
  }

  return {
    start: function (emit, opts) {
      if (running) return;
      running = true;
      emitFn = emit;
      roomWeights = (opts.rooms || [])
        .filter(function (r) { return !r.common; })
        .map(function (r) { return { id: r.id, w: (r.fileCount || 0) + 4 }; });
      if (opts.mode === 'replay') startReplay(opts.replayUrl || 'sessions/demo-sample.jsonl');
      else startGen();
    },
    stop: function () {
      running = false;
      timers.forEach(clearTimeout);
      timers = [];
    },
    setIntensity: function (v) { intensity = Math.min(10, Math.max(1, v)); return intensity; },
    getIntensity: function () { return intensity; },
    isRunning: function () { return running; },
  };
})();
