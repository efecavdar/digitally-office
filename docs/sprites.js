// Pixel sprite'lar — tamamı programatik (görsel asset yok).
// Koordinat sözleşmesi: (x, y) = karakterin AYAK ORTA noktası.
/* global window */
window.Sprites = (function () {
  'use strict';

  // Retro palet — ajan gövde renkleri (aktör kimliğinden deterministik seçilir)
  var AGENT_COLORS = ['#e8554d', '#4da6e8', '#53c66e', '#e8a23f', '#b06ee8', '#e86eb0', '#5fd6c9', '#c9d65f'];
  var HAIR_COLORS = ['#2b2118', '#4a3423', '#6e2f1f', '#1d1d2e', '#5e5e6e'];
  var SKIN = '#eeb98c';
  var PANTS = '#28283c';
  var CLAUDE_VISOR = '#ffd66e'; // Claude ajanlarının alâmetifarikası: parlak vizör

  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function colorsFor(actor) {
    var h = hashStr(actor.id || 'x');
    return {
      body: actor.kind === 'human' ? '#e8554d' : AGENT_COLORS[h % AGENT_COLORS.length],
      hair: HAIR_COLORS[h % HAIR_COLORS.length],
      hat: (h % 4) === 0 ? AGENT_COLORS[(h + 3) % AGENT_COLORS.length] : null, // bazıları şapkalı
      claude: actor.kind === 'claude',
    };
  }

  function px(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  // state: 'idle' | 'walk' | 'work' | 'coffee' | 'celebrate'
  // frame: artan sayaç (animasyon fazı bundan türetilir)
  function drawAgent(ctx, x, y, opts) {
    var c = opts.colors;
    var f = Math.floor(opts.frame / 8) % 2; // ~4fps'lik iki kare
    var bob = 0;
    if (opts.state === 'work') bob = f; // klavye başında hafif sallanma
    if (opts.state === 'walk') bob = f ? -1 : 0; // yürüyüş zıplaması
    if (opts.state === 'celebrate') bob = -2 - f * 2; // zıplama

    var top = y - 14 + bob; // baş üstü

    // saç/şapka + baş
    if (c.hat) {
      px(ctx, x - 2, top, 4, 2, c.hat);
      px(ctx, x - 3, top + 1, 6, 1, c.hat); // siper
    } else {
      px(ctx, x - 2, top, 4, 2, c.hair);
    }
    px(ctx, x - 2, top + 2, 4, 3, SKIN);
    if (c.claude) px(ctx, x - 2, top + 2, 4, 1, CLAUDE_VISOR); // vizör bandı

    // gövde
    px(ctx, x - 3, top + 5, 6, 5, c.body);

    // kollar
    if (opts.state === 'work') {
      px(ctx, x + 3, top + 6 + f, 2, 2, SKIN); // klavyeye uzanan kol
    } else if (opts.state === 'coffee') {
      px(ctx, x + 3, top + 5, 1, 3, c.body);
      px(ctx, x + 4, top + 5, 2, 2, '#f4f4f4'); // fincan
      px(ctx, x + 4, top + 4, 1, 1, '#c8c8d8');
    } else if (opts.state === 'celebrate') {
      px(ctx, x - 4, top + 3, 1, 3, SKIN); // eller havada
      px(ctx, x + 3, top + 3, 1, 3, SKIN);
    } else {
      px(ctx, x - 4, top + 6, 1, 3, c.body);
      px(ctx, x + 3, top + 6, 1, 3, c.body);
    }

    // bacaklar
    if (opts.state === 'walk') {
      px(ctx, x - 3, top + 10, 2, 4 - f, PANTS);
      px(ctx, x + 1, top + 10, 2, 3 + f, PANTS);
    } else {
      px(ctx, x - 3, top + 10, 2, 4, PANTS);
      px(ctx, x + 1, top + 10, 2, 4, PANTS);
    }

    // taşınan paket (göğüs hizasında küçük koli)
    if (opts.carrying) drawPackage(ctx, x + (opts.dir < 0 ? -8 : 5), y - 9 + bob);
  }

  function drawPackage(ctx, x, y) {
    px(ctx, x, y, 6, 5, '#c98d4a');
    px(ctx, x, y + 2, 6, 1, '#e8c07a'); // bant
    px(ctx, x + 2, y, 2, 5, '#a9713a');
  }

  // Konuşma balonu glifleri — 5×5 ızgarada piksel listeleri
  var GLYPHS = {
    unlem: [[2, 0], [2, 1], [2, 2], [2, 4]],
    uyku: [[0, 0], [1, 0], [2, 0], [3, 0], [2, 1], [1, 2], [0, 3], [0, 4], [1, 4], [2, 4], [3, 4]],
    cay: [[0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [0, 3], [1, 3], [2, 3], [1, 0]],
    nota: [[3, 0], [3, 1], [3, 2], [1, 3], [2, 3], [1, 4], [2, 4], [4, 0]],
    soru: [[1, 0], [2, 0], [3, 1], [2, 2], [2, 4]],
  };

  // (x, y) = balonun oturacağı nokta (karakterin başının üstü)
  function drawBubble(ctx, x, y, glyphKey) {
    var g = GLYPHS[glyphKey] || GLYPHS.unlem;
    var bx = Math.round(x) - 4, by = Math.round(y) - 10;
    px(ctx, bx - 1, by - 1, 11, 9, '#1a1626'); // kenarlık
    px(ctx, bx, by, 9, 7, '#f4f2ff');
    px(ctx, x, y - 2, 1, 2, '#f4f2ff'); // kuyruk
    ctx.fillStyle = '#2c2740';
    g.forEach(function (p) { ctx.fillRect(bx + 2 + p[0], by + 1 + p[1], 1, 1); });
  }

  // İş tipi ikonu — çalışan ajanın başının üstünde durur; (x, y) = ikon merkezi
  function drawWorkIcon(ctx, x, y, type) {
    var bx = Math.round(x) - 3, by = Math.round(y) - 3;
    function q(px2, py, w, h, c) { ctx.fillStyle = c; ctx.fillRect(bx + px2, by + py, w, h); }
    switch (type) {
      case 'ui': // fırça
        q(0, 4, 2, 2, '#ff5fa2'); q(2, 3, 1, 1, '#c98d4a'); q(3, 2, 1, 1, '#c98d4a');
        q(4, 1, 1, 1, '#c98d4a'); q(5, 0, 1, 1, '#7a5c3a');
        break;
      case 'backend': case 'kod': // dişli
        q(2, 0, 2, 1, '#9aa2b8'); q(0, 2, 1, 2, '#9aa2b8'); q(5, 2, 1, 2, '#9aa2b8');
        q(2, 5, 2, 1, '#9aa2b8'); q(1, 1, 4, 4, '#6a7286'); q(2, 2, 2, 2, '#2c2740');
        break;
      case 'test': // deney tüpü
        q(2, 0, 2, 1, '#c8c8d8'); q(2, 1, 2, 2, '#d8ecf4'); q(1, 3, 4, 2, '#53c66e');
        q(2, 5, 2, 1, '#3aa05a');
        break;
      case 'kesif': // büyüteç
        q(1, 0, 3, 1, '#c8c8d8'); q(0, 1, 1, 3, '#c8c8d8'); q(4, 1, 1, 3, '#c8c8d8');
        q(1, 4, 2, 1, '#c8c8d8'); q(1, 1, 3, 3, 'rgba(255,230,140,0.6)'); q(4, 4, 2, 2, '#8a6a3a');
        break;
      case 'terminal': // >_
        q(0, 1, 1, 1, '#7dff8a'); q(1, 2, 1, 1, '#7dff8a'); q(0, 3, 1, 1, '#7dff8a');
        q(3, 4, 3, 1, '#7dff8a');
        break;
      case 'deploy': // mini roket
        q(2, 0, 2, 1, '#e8554d'); q(2, 1, 2, 3, '#e8e8f4'); q(1, 3, 1, 2, '#e8554d');
        q(4, 3, 1, 2, '#e8554d'); q(2, 4, 2, 2, '#ff8a3a');
        break;
      case 'build': // vinç kancası / çark (amber)
        q(0, 0, 5, 1, '#e8a23f'); q(4, 1, 1, 2, '#e8a23f'); q(3, 3, 3, 1, '#c8862f');
        q(4, 4, 1, 1, '#c8862f'); q(0, 1, 1, 4, '#a06a28');
        break;
      case 'dokuman': // sayfa
        q(1, 0, 4, 6, '#f4f2ff'); q(4, 0, 1, 1, '#8a86b0'); q(2, 2, 2, 1, '#8a86b0');
        q(2, 4, 2, 1, '#8a86b0');
        break;
      case 'dusunce': // düşünce baloncukları
        q(0, 5, 1, 1, '#d8d4ec'); q(1, 3, 2, 2, '#e8e4f8'); q(3, 0, 3, 3, '#f4f2ff');
        break;
      case 'goz': // göz atma
        q(1, 1, 4, 3, '#e8e4f8'); q(2, 2, 2, 1, '#2c2740');
        break;
      case 'config': // İngiliz anahtarı
        q(0, 0, 2, 2, '#9aa2b8'); q(1, 1, 1, 1, '#2c2740'); q(2, 2, 1, 1, '#9aa2b8');
        q(3, 3, 1, 1, '#9aa2b8'); q(4, 4, 2, 2, '#6a7286');
        break;
    }
  }

  // Ejderha — binanın etrafında süzülür; (x, y) = gövde merkezi
  // o: { dir: 1|-1, flap: bool, fire: bool, night: bool }
  function drawDragon(ctx, x, y, o) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(o.dir, 1);
    var B = '#3aa06a', D = '#2c7a50', W = '#53c66e';
    // kuyruk
    ctx.fillStyle = D;
    ctx.fillRect(-12, 0, 4, 2);
    ctx.fillRect(-15, -1, 3, 2);
    // gövde + karın
    ctx.fillStyle = B;
    ctx.fillRect(-8, -1, 10, 4);
    ctx.fillStyle = '#7dd6a0';
    ctx.fillRect(-8, 2, 10, 1);
    // kanat (çırpma: 2 kare)
    ctx.fillStyle = W;
    if (o.flap) {
      ctx.fillRect(-6, -7, 7, 6);
      ctx.fillRect(-4, -9, 4, 2);
    } else {
      ctx.fillRect(-5, -3, 6, 3);
    }
    // boyun + kafa + boynuz + göz
    ctx.fillStyle = B;
    ctx.fillRect(2, -3, 3, 3);
    ctx.fillRect(4, -5, 5, 4);
    ctx.fillStyle = D;
    ctx.fillRect(8, -4, 2, 1);
    ctx.fillRect(4, -6, 1, 1);
    ctx.fillStyle = o.night ? '#ff5050' : '#ffd66e';
    ctx.fillRect(6, -4, 1, 1);
    // alev püskürtme
    if (o.fire) {
      for (var i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#ffd66e' : '#ff8a3a';
        ctx.fillRect(10 + i * 2 + Math.random() * 3, -5 + Math.random() * 5, 2, 2);
      }
    }
    ctx.restore();
  }

  return { drawAgent: drawAgent, drawPackage: drawPackage, drawBubble: drawBubble, drawDragon: drawDragon, drawWorkIcon: drawWorkIcon, colorsFor: colorsFor, hashStr: hashStr };
})();
