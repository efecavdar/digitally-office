// Canvas renderer — statik kat planı bir kez offscreen'e çizilir,
// her karede yalnız blit + dinamikler (ajan/partikül/ışık/gece tonu).
/* global window, document, Sprites */
window.Render = (function () {
  'use strict';

  var WALL = '#171322';
  var ROOF = '#241f30';
  var FLOOR_F1 = '#6b5a48';
  var FLOOR_F0 = '#494956';
  var DESK = '#8a683f';
  var DESK_DARK = '#6e5232';
  var MONITOR = '#0e0e18';
  var GLASS = '#262240';

  function init(canvas, geo) {
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Dinamik çizim için kayıt defterleri (statik çizim sırasında doldurulur)
    var reg = {
      windows: [],   // {roomId, x, y, w, h}
      leds: [],      // {x, y}
      steam: [],     // {x, y}  çaydanlık ağzı
      screens: {},   // roomId → [{x,y,w,h}] masa monitör ekranları
      antenna: null, // {x, y}
      stars: [],     // {x, y, tw}
    };

    // sin tabanlı saçılım — hash art arda gelen i'lerde çapraz örgü kuruyor
    var frac = function (v) { return v - Math.floor(v); };
    var skyH = Math.max(14, geo.F1.y0 - 18);
    for (var i = 0; i < 60; i++) {
      reg.stars.push({
        x: Math.floor(frac(Math.sin(i * 127.1 + 311.7) * 43758.55) * (geo.W - 16)) + 8,
        y: Math.floor(frac(Math.sin(i * 269.5 + 183.3) * 28001.87) * skyH) + 2,
        tw: frac(Math.sin(i * 419.2) * 9173.29),
      });
    }
    reg.clouds = [];
    for (var ci = 0; ci < 3; ci++) {
      reg.clouds.push({
        x: 60 + ci * 210, y: 10 + (ci % 2) * 14, w: 34 + ci * 10, speed: 2.2 + ci * 0.9,
      });
    }

    // ufuktaki silüet şehir (binanın arkasında, gece pencereleri yanar)
    reg.skyline = [];
    var sx = -6, sbi = 0;
    while (sx < geo.W + 10) {
      var bw = 16 + (Sprites.hashStr('bw' + sbi) % 34);
      var bh = 10 + (Sprites.hashStr('bh' + sbi) % 30);
      reg.skyline.push({ x: sx, w: bw, h: bh, seed: sbi });
      sx += bw + 2 + (Sprites.hashStr('bg' + sbi) % 9);
      sbi++;
    }

    // çatıdaki neon tabela — metin config'den gelir (varsayılan: repo adı)
    var signText = String(geo.signText || 'DIGITALLY');
    var neonCols = signText.length * 4 - 1;
    var neonScale = neonCols * 3 + 12 <= 320 ? 3 : 2;
    reg.neon = {
      text: signText, cols: neonCols, scale: neonScale,
      x: Math.round(geo.W / 2 - (neonCols * neonScale) / 2),
      yTop: geo.F1.y0 - 32,
    };
    reg.props = []; // oda içi animasyonlu eşyalar (drawRoom doldurur)

    var staticCv = document.createElement('canvas');
    staticCv.width = geo.W;
    staticCv.height = geo.H;
    drawStatic(staticCv.getContext('2d'), geo, reg);

    return {
      frame: function (state, env) { drawFrame(ctx, staticCv, geo, reg, state, env); },
      reg: reg,
    };
  }

  function px(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  // ── Statik katman ─────────────────────────────────────────────────
  function drawStatic(c, geo, reg) {
    var top = geo.F1.y0 - 8; // çatı üst çizgisi

    // dış duvar bloğu + çatı
    px(c, geo.LEFT - 4, top, geo.stair.x1 - geo.LEFT + 8, geo.GROUND.y1 - top, WALL);
    px(c, geo.LEFT - 6, top, geo.stair.x1 - geo.LEFT + 12, 8, ROOF);
    reg.antenna = { x: geo.LEFT + 76, y: top - 8 };
    px(c, reg.antenna.x, reg.antenna.y, 2, 8, '#3a3450'); // anten direği
    px(c, geo.stair.x1 - 40, top - 5, 26, 5, '#2c2740'); // çatı klima ünitesi
    px(c, geo.stair.x1 - 38, top - 3, 4, 1, '#4a4468');

    // neon tabela panosu + ayaklar (harfler dinamik çizilir)
    var nn = reg.neon;
    var nw = nn.cols * nn.scale + 12, nh = 5 * nn.scale + 8;
    px(c, nn.x - 6, nn.yTop - 4, nw, nh, '#1a1626');
    px(c, nn.x - 5, nn.yTop - 3, nw - 2, nh - 2, '#241f30');
    px(c, nn.x + 4, nn.yTop + nh - 4, 3, top - (nn.yTop + nh - 4), '#2c2740');
    px(c, nn.x + nw - 14, nn.yTop + nh - 4, 3, top - (nn.yTop + nh - 4), '#2c2740');

    // kat arası döşeme + zemin
    px(c, geo.LEFT - 4, geo.SLAB.y0, geo.stair.x1 - geo.LEFT + 8, geo.SLAB.y1 - geo.SLAB.y0, ROOF);
    px(c, geo.LEFT - 6, geo.GROUND.y0, geo.stair.x1 - geo.LEFT + 12, geo.GROUND.y1 - geo.GROUND.y0, '#100d18');

    geo.rooms.forEach(function (r) { drawRoom(c, geo, reg, r); });

    // Kat 0 tavan boruları (makine dairesi havası)
    for (var bx = geo.LEFT + 2; bx < geo.stair.x0 - 4; bx += 2) {
      px(c, bx, geo.F0.y0 + 5, 2, 2, (bx / 2) % 12 === 0 ? '#6a7086' : '#4e5468');
    }

    drawStair(c, geo);
    drawStreet(c, geo, reg);
  }

  function drawStreet(c, geo, reg) {
    px(c, 0, geo.GROUND.y1, geo.W, geo.H - geo.GROUND.y1, '#0d0b16'); // sokak
    px(c, 0, geo.GROUND.y1, geo.W, 2, '#1c1930'); // kaldırım çizgisi
    reg.lamps = [];
    [110, 380, 560].forEach(function (lx) {
      px(c, lx, geo.GROUND.y1 + 8, 2, 34, '#2c2c40'); // direk
      px(c, lx - 2, geo.GROUND.y1 + 6, 6, 3, '#3a3a52'); // kafa
      reg.lamps.push({ x: lx + 1, y: geo.GROUND.y1 + 8 });
    });
  }

  function drawRoom(c, geo, reg, r) {
    var floorCol = r.floor === 1 ? FLOOR_F1 : FLOOR_F0;
    px(c, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, r.fill); // arka duvar
    px(c, r.x0, r.y1 - 4, r.x1 - r.x0, 4, floorCol);     // taban
    // odalar arası duvar + kapı boşluğu (alt 24px açık)
    px(c, r.x1 - 1, r.y0, 2, (r.y1 - r.y0) - 24, WALL);

    // pencere (arka duvarda, gece parlar)
    if (!r.common || r.id === 'cay') {
      var wx = Math.round((r.x0 + r.x1) / 2) - 6;
      var win = { roomId: r.id, x: wx, y: r.y0 + 14, w: 12, h: 15 };
      px(c, win.x - 1, win.y - 1, win.w + 2, win.h + 2, WALL);
      px(c, win.x, win.y, win.w, win.h, GLASS);
      px(c, win.x + 5, win.y, 1, win.h, WALL);
      px(c, win.x, win.y + 7, win.w, 1, WALL);
      reg.windows.push(win);
    }

    // geniş odalara duvar rafı + kitap pikselleri (boşluk dolgusu)
    if (!r.common && (r.x1 - r.x0) > 66) {
      var sy = r.y0 + 38;
      var sx0 = r.x0 + 6, sw = Math.min(26, r.x1 - r.x0 - 46);
      px(c, sx0, sy + 6, sw, 1, '#2c2740');
      var books = ['#e8554d', '#4da6e8', '#53c66e', '#e8a23f', '#b06ee8'];
      for (var b = 0; b < Math.floor(sw / 4) - 1; b++) {
        px(c, sx0 + 1 + b * 4, sy, 3, 6, books[(Sprites.hashStr(r.id) + b) % books.length]);
      }
    }

    // masalar + monitörler
    reg.screens[r.id] = [];
    r.deskXs.forEach(function (dx) {
      var wy = r.walkY;
      px(c, dx - 8, wy - 12, 16, 2, DESK);
      px(c, dx - 8, wy - 10, 2, 10, DESK_DARK);
      px(c, dx + 6, wy - 10, 2, 10, DESK_DARK);
      px(c, dx - 3, wy - 17, 7, 5, MONITOR);
      var scr = { x: dx - 2, y: wy - 16, w: 5, h: 3 };
      px(c, scr.x, scr.y, scr.w, scr.h, '#1c2a38');
      reg.screens[r.id].push(scr);
    });

    // tema köşeleri
    if (r.id === 'cay') drawCay(c, reg, r);
    if (r.id === 'sunucu') drawSunucu(c, reg, r);
    if (r.id === 'arsiv') drawArsiv(c, r);
    drawRoomProps(c, reg, r);
    if (!r.common && (r.x1 - r.x0) > 62) { // geniş odalara saksı
      px(c, r.x0 + 4, r.walkY - 8, 5, 4, '#7a4030');
      px(c, r.x0 + 5, r.walkY - 13, 3, 5, '#3f7d46');
      px(c, r.x0 + 4, r.walkY - 15, 2, 3, '#4f994f');
    }
  }

  function drawCay(c, reg, r) {
    var bx = r.x0 + 8;
    px(c, bx, r.walkY - 12, r.x1 - r.x0 - 16, 3, '#8a4a52'); // tezgah
    px(c, bx + 2, r.walkY - 9, 2, 9, '#5e3038');
    px(c, r.x1 - r.x0 - 16 + bx - 4, r.walkY - 9, 2, 9, '#5e3038');
    // çaydanlık
    px(c, bx + 6, r.walkY - 18, 8, 6, '#d84848');
    px(c, bx + 5, r.walkY - 16, 1, 2, '#d84848');
    px(c, bx + 8, r.walkY - 19, 4, 1, '#a83838');
    reg.steam.push({ x: bx + 10, y: r.walkY - 20 });
    // fincanlar
    px(c, bx + 18, r.walkY - 14, 3, 2, '#f4f4f4');
    px(c, bx + 23, r.walkY - 14, 3, 2, '#f4f4f4');
  }

  function drawSunucu(c, reg, r) {
    var n = Math.floor((r.x1 - r.x0 - 12) / 14);
    for (var i = 0; i < n; i++) {
      var rx = r.x0 + 7 + i * 14;
      px(c, rx, r.y1 - 40, 10, 36, '#1d2230');
      px(c, rx + 1, r.y1 - 39, 8, 1, '#2c3446');
      for (var row = 0; row < 6; row++) {
        reg.leds.push({ x: rx + 2, y: r.y1 - 36 + row * 5 });
        reg.leds.push({ x: rx + 6, y: r.y1 - 36 + row * 5 });
        px(c, rx + 1, r.y1 - 33 + row * 5, 8, 1, '#12141c'); // hava ızgarası
      }
    }
  }

  function drawArsiv(c, r) {
    var y = r.walkY;
    [[4, -5], [11, -5], [7, -10], [4, -15]].forEach(function (b) {
      px(c, r.x0 + b[0], y + b[1], 6, 5, '#c98d4a');
      px(c, r.x0 + b[0], y + b[1] + 2, 6, 1, '#e8c07a');
    });
    px(c, r.x0 + 4, y - 22, 14, 1, '#3a3450'); // tozlu raf
  }

  // Her odaya kimlik veren eşyalar — jenerik havuzdan oda id'sinin hash'iyle
  // deterministik seçilir; böylece HER repo'da odalar çeşitli ve tutarlı olur.
  var PROP_POOL = ['kanban', 'poster', 'camera', 'map', 'telescope', 'frames',
    'counter', 'easel', 'screenwall', 'conveyor', 'dots', 'switchboard',
    'coins', 'cctv', 'stove', 'drip', 'flask'];
  var FLOOR_PROPS = { camera: 1, telescope: 1, easel: 1, counter: 1, stove: 1, conveyor: 1, coins: 1, flask: 1 };

  function drawRoomProps(c, reg, r) {
    if (r.common) return;
    var w = r.x1 - r.x0;
    var rx = r.x1 - 24, wy = r.y0 + 34;
    var pick = PROP_POOL[Sprites.hashStr('prop' + r.id) % PROP_POOL.length];
    if (FLOOR_PROPS[pick] && w < 52) pick = 'dots'; // dar odaya zemin eşyası sığmaz
    switch (pick) {
      case 'flask': { // fokurdayan deney şişesi + formül panosu
        var fdx = r.deskXs[0] || (r.x0 + 16);
        px(c, fdx + 9, r.walkY - 15, 3, 3, '#53c66e');
        px(c, fdx + 10, r.walkY - 17, 1, 2, '#b8e8c0');
        reg.props.push({ type: 'flask', x: fdx + 9, y: r.walkY - 17 });
        px(c, r.x0 + 6, r.y0 + 10, 12, 9, '#efe6d0');
        px(c, r.x0 + 7, r.y0 + 12, 10, 1, '#8a8070');
        px(c, r.x0 + 7, r.y0 + 15, 7, 1, '#8a8070');
        break; }
      case 'kanban': { // kanban panosu
        px(c, rx, wy, 18, 13, '#efe6d0');
        px(c, rx, wy, 18, 1, '#8a8070');
        var st = ['#e8554d', '#ffd66e', '#53c66e', '#4da6e8', '#b06ee8', '#e86eb0'];
        for (var i = 0; i < 6; i++) px(c, rx + 2 + (i % 3) * 5, wy + 3 + Math.floor(i / 3) * 5, 3, 3, st[i]);
        break; }
      case 'poster': // neon çerçeveli afiş
        px(c, rx, wy, 14, 18, '#1a1626');
        px(c, rx + 1, wy + 1, 12, 16, '#2c2740');
        px(c, rx + 2, wy + 3, 10, 3, '#ff5fa2');
        px(c, rx + 2, wy + 8, 10, 3, '#5fd6ff');
        px(c, rx + 2, wy + 13, 7, 2, '#ffd66e');
        break;
      case 'camera': { // kamera tripodu
        var cx = r.x1 - 14;
        px(c, cx - 1, r.walkY - 16, 6, 4, '#1d2230');
        px(c, cx + 5, r.walkY - 15, 2, 2, '#5fd6ff'); // lens
        px(c, cx, r.walkY - 12, 1, 12, '#3a3450');
        px(c, cx - 3, r.walkY - 4, 3, 1, '#3a3450');
        px(c, cx + 2, r.walkY - 4, 3, 1, '#3a3450');
        break; }
      case 'map': // duvar haritası + rota pinleri
        px(c, rx, wy, 18, 13, '#24303c');
        px(c, rx, wy, 18, 1, '#8a8070');
        px(c, rx + 3, wy + 3, 2, 2, '#e8554d');
        px(c, rx + 9, wy + 7, 2, 2, '#ffd66e');
        px(c, rx + 13, wy + 4, 2, 2, '#53c66e');
        px(c, rx + 5, wy + 5, 4, 1, '#4a5a6a');
        break;
      case 'telescope': { // teleskop
        var tx = r.x1 - 16;
        px(c, tx, r.walkY - 18, 8, 3, '#4a4468');
        px(c, tx + 7, r.walkY - 20, 3, 3, '#5a5478');
        px(c, tx + 2, r.walkY - 15, 1, 11, '#3a3450');
        px(c, tx, r.walkY - 5, 2, 1, '#3a3450');
        px(c, tx + 4, r.walkY - 5, 2, 1, '#3a3450');
        break; }
      case 'frames': // diploma çerçeveleri
        px(c, rx, wy, 7, 9, '#a08a3a');
        px(c, rx + 1, wy + 1, 5, 7, '#efe6d0');
        px(c, rx + 10, wy, 7, 9, '#a08a3a');
        px(c, rx + 11, wy + 1, 5, 7, '#efe6d0');
        break;
      case 'counter': { // karşılama bankosu + zil
        var bx = r.x0 + Math.floor(w / 2) - 9;
        px(c, bx, r.walkY - 13, 18, 3, '#7a5c3a');
        px(c, bx + 1, r.walkY - 10, 2, 10, '#5e4429');
        px(c, bx + 15, r.walkY - 10, 2, 10, '#5e4429');
        px(c, bx + 8, r.walkY - 16, 3, 2, '#ffd66e');
        px(c, bx + 9, r.walkY - 17, 1, 1, '#a08a3a');
        break; }
      case 'easel': { // ressam şövalesi
        var ex = r.x1 - 18;
        px(c, ex, r.walkY - 22, 12, 10, '#efe6d0');
        px(c, ex + 2, r.walkY - 20, 3, 3, '#e8554d');
        px(c, ex + 6, r.walkY - 19, 3, 3, '#4da6e8');
        px(c, ex + 4, r.walkY - 16, 3, 2, '#53c66e');
        px(c, ex + 1, r.walkY - 12, 1, 12, '#7a5c3a');
        px(c, ex + 10, r.walkY - 12, 1, 12, '#7a5c3a');
        break; }
      case 'screenwall': { // ekran duvarı (mavi akış dinamik)
        var screens = [];
        for (var mi = 0; mi < 3; mi++) {
          var mx = rx - 4 + mi * 8;
          px(c, mx, wy, 7, 6, '#10141e');
          screens.push({ x: mx + 1, y: wy + 1, w: 5, h: 4 });
        }
        reg.props.push({ type: 'screenwall', screens: screens });
        break; }
      case 'conveyor': { // yürüyen bant (kutular dinamik)
        var b0 = r.x0 + 5, b1 = r.x1 - 5;
        px(c, b0, r.walkY - 26, b1 - b0, 3, '#3a3450');
        px(c, b0, r.walkY - 26, b1 - b0, 1, '#5a5478');
        px(c, b0 + 2, r.walkY - 23, 2, 4, '#2c2740');
        px(c, b1 - 4, r.walkY - 23, 2, 4, '#2c2740');
        reg.props.push({ type: 'conveyor', x0: b0, x1: b1, y: r.walkY - 26 });
        break; }
      case 'dots': // dört renkli nokta
        px(c, rx + 2, wy + 2, 3, 3, '#4285f4');
        px(c, rx + 7, wy + 2, 3, 3, '#ea4335');
        px(c, rx + 2, wy + 7, 3, 3, '#fbbc04');
        px(c, rx + 7, wy + 7, 3, 3, '#34a853');
        break;
      case 'switchboard': // santral panosu (ışıklar dinamik)
        px(c, rx, wy, 14, 11, '#20242e');
        px(c, rx, wy, 14, 1, '#2c3446');
        reg.props.push({ type: 'switchboard', x: rx, y: wy });
        break;
      case 'coins': { // kasa + altınlar
        px(c, rx, r.walkY - 14, 12, 14, '#3a3d55');
        px(c, rx + 4, r.walkY - 9, 4, 4, '#5a5478');
        px(c, rx + 5, r.walkY - 8, 2, 2, '#2c2740'); // kadran
        px(c, rx - 6, r.walkY - 2, 5, 2, '#ffd66e');
        px(c, rx - 5, r.walkY - 4, 3, 2, '#ffd66e');
        reg.props.push({ type: 'coins', x: rx - 6, y: r.walkY - 4 });
        break; }
      case 'cctv': { // CCTV duvarı (titreme dinamik)
        var scr = [];
        px(c, rx + 1, wy, 8, 6, '#10141e');
        scr.push({ x: rx + 2, y: wy + 1, w: 6, h: 4 });
        px(c, rx + 1, wy + 8, 8, 6, '#10141e');
        scr.push({ x: rx + 2, y: wy + 9, w: 6, h: 4 });
        reg.props.push({ type: 'cctv', screens: scr });
        break; }
      case 'stove': { // mutfak: ocak + tencere (alev dinamik)
        var sx = r.x1 - 18;
        px(c, sx, r.walkY - 12, 12, 12, '#3a3d55');
        px(c, sx, r.walkY - 13, 12, 1, '#5a5478');
        px(c, sx + 3, r.walkY - 18, 7, 4, '#2c3446');
        px(c, sx + 2, r.walkY - 16, 1, 2, '#2c3446'); // kulp
        reg.props.push({ type: 'stove', x: sx + 3, y: r.walkY - 14 });
        break; }
      case 'drip': // vana + damlayan boru
        px(c, r.x0 + 8, r.y0 + 8, 4, 4, '#8a4a52');
        px(c, r.x0 + 9, r.y0 + 9, 2, 2, '#b06060');
        reg.props.push({ type: 'drip', x: r.x0 + 16, y0: r.y0 + 8, y1: r.walkY });
        break;
    }
  }

  function drawStair(c, geo) {
    px(c, geo.stair.x0, geo.F1.y0, geo.stair.x1 - geo.stair.x0, geo.F0.y1 - geo.F1.y0, '#221d33');
    // basamaklar (iki kat arası zigzag)
    var steps = 9;
    for (var i = 0; i < steps; i++) {
      var t = i / (steps - 1);
      var y = geo.F0.y1 - 6 - t * (geo.F0.y1 - geo.F1.y1);
      var x = geo.stair.x0 + 3 + (i % 2 === 0 ? 0 : 13);
      px(c, x, y, 13, 2, '#48416a');
    }
    px(c, geo.stair.x0 + 2, geo.F1.y0 + 6, 2, geo.F0.y1 - geo.F1.y0 - 12, '#2c2740'); // korkuluk
  }

  // ── Dinamik kare ──────────────────────────────────────────────────
  function lerpCol(a, b, t) {
    return 'rgb(' +
      Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }
  var NIGHT_SKY = [11, 14, 42], DAY_SKY = [116, 190, 224];

  function drawFrame(ctx, staticCv, geo, reg, state, env) {
    var t = env.tsec;
    var day = env.dayness;
    var audio = state.audio;

    // kick vuruşunda tüm sahne titrer
    var shook = false;
    if (audio && audio.kick > 0.12) {
      ctx.save();
      shook = true;
      var sh = audio.kick * 2.4;
      ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    }

    // gökyüzü + yıldız + güneş/ay (titreme payı için taşmalı boyanır)
    ctx.fillStyle = lerpCol(NIGHT_SKY, DAY_SKY, day);
    ctx.fillRect(-4, -4, geo.W + 8, geo.H + 8);
    if (day < 0.55) {
      reg.stars.forEach(function (s) {
        var a = (0.55 - day) * 1.8 * (0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + s.tw * 7)));
        ctx.fillStyle = 'rgba(255,255,230,' + a.toFixed(2) + ')';
        ctx.fillRect(s.x, s.y, 1, 1);
      });
    }
    // ufuk aydınlığı (gündüz çatı üstü hafif ağarır)
    if (day > 0.05) {
      ctx.fillStyle = 'rgba(255,250,230,' + (day * 0.14).toFixed(3) + ')';
      ctx.fillRect(0, geo.F1.y0 - 30, geo.W, 22);
    }

    var hourT = ((env.hour + env.minute / 60) % 24) / 24;
    var orbX = 20 + ((hourT * 2) % 1) * (geo.W - 40);
    if (day > 0.15) { px(ctx, orbX, 8, 8, 8, '#ffd66e'); px(ctx, orbX + 1, 9, 6, 6, '#ffe9a8'); }
    else { px(ctx, orbX, 8, 7, 7, '#d8d8e8'); px(ctx, orbX + 1, 9, 3, 3, '#b0b0c8'); }

    // süzülen bulutlar (gündüz belirgin, gece silik)
    (reg.clouds || []).forEach(function (cl) {
      var cx = (cl.x + t * cl.speed) % (geo.W + cl.w) - cl.w;
      ctx.fillStyle = 'rgba(240,244,255,' + (0.10 + day * 0.45).toFixed(3) + ')';
      ctx.fillRect(cx, cl.y, cl.w, 5);
      ctx.fillRect(cx + 6, cl.y - 3, cl.w - 14, 3);
      ctx.fillRect(cx + 4, cl.y + 5, cl.w - 8, 2);
    });

    drawCritters(ctx, geo, t, day); // kuşlar / kayan yıldız / sokak hayatı (bina arkası)
    drawSkyline(ctx, geo, reg, day);

    ctx.drawImage(staticCv, 0, 0);

    drawNeon(ctx, reg, t, day, audio);
    drawDragonFly(ctx, geo, t, day, audio);
    drawPropAnims(ctx, reg, t, day);

    drawStreetLife(ctx, geo, t, day); // araba + kedi + roomba (bina önü/sokak)

    // anten ışığı
    var blink = Math.sin(t * 2.4) > 0.4;
    if (blink) px(ctx, reg.antenna.x, reg.antenna.y - 2, 2, 2, '#ff5050');

    // oda aktivite ışıması (taban şeridi)
    state.roomGlow.forEach(function (g, roomId) {
      var r = geo.roomById[roomId];
      if (!r || g < 0.03) return;
      ctx.fillStyle = 'rgba(255,214,110,' + (g * 0.3).toFixed(3) + ')';
      ctx.fillRect(r.x0, r.y1 - 4, r.x1 - r.x0, 4);
    });

    // PARTİ MODU: gökkuşağı zeminler (DJ drop görseli)
    if (state.partyUntil && state.partyUntil > Date.now()) {
      geo.rooms.forEach(function (r, ri) {
        var hue = Math.floor(t * 220 + ri * 34) % 360;
        ctx.fillStyle = 'hsla(' + hue + ',85%,60%,0.4)';
        ctx.fillRect(r.x0, r.y1 - 4, r.x1 - r.x0, 4);
      });
    }

    // SES TEPKİSİ: her oda bir spektrum çubuğu — zeminden yükselen ekolayzır
    if (audio && audio.bins && audio.bins.length) {
      var eqRooms = geo.rooms.filter(function (r) { return !r.common; });
      eqRooms.forEach(function (r, ei) {
        var lvl = audio.bins[ei % audio.bins.length];
        var h = Math.round(2 + lvl * 15);
        var hue = Math.floor(190 + ei * 10 + audio.kick * 60) % 360;
        ctx.fillStyle = 'hsla(' + hue + ',85%,62%,0.45)';
        ctx.fillRect(r.x0 + 2, r.y1 - 4 - h, r.x1 - r.x0 - 4, h);
      });
    }

    // iş tipine göre oda efektleri (yalnız iş sürerken)
    state.agents.forEach(function (a) {
      if (a.anim !== 'work' || !a.workType || !a.room) return;
      var wr = geo.roomById[a.room];
      if (wr) drawWorkFx(ctx, wr, a, t);
    });

    // deploy rampası: Sunucu Odası'nda roket bekler, geri sayım ışıkları yanar
    if (state.deployUntil && state.deployUntil > Date.now()) {
      drawLaunchPad(ctx, geo.roomById.sunucu, t, state);
    }

    // ajanlar + konuşma balonları + iş ikonu
    var nowMs = Date.now();
    state.agents.forEach(function (a) {
      Sprites.drawAgent(ctx, a.x, a.y, {
        colors: a.colors, frame: a.frame, state: a.anim, dir: a.dir, carrying: a.carrying,
      });
      if (a.bubble && a.bubble.until > nowMs) {
        Sprites.drawBubble(ctx, a.x, a.y - 16, a.bubble.glyph);
      } else if (a.anim === 'work' && a.workType) {
        Sprites.drawWorkIcon(ctx, a.x, a.y - 20 + Math.round(Math.sin(t * 3) * 1), a.workType);
      }
    });

    drawParticles(ctx, state, t);

    // gece tonu (bina + içindekiler kararır)…
    var nightA = (1 - day) * 0.4;
    if (nightA > 0.01) {
      var top = geo.F1.y0 - 8;
      ctx.fillStyle = 'rgba(13,16,58,' + nightA.toFixed(3) + ')';
      ctx.fillRect(geo.LEFT - 6, top - 6, geo.stair.x1 - geo.LEFT + 12, geo.GROUND.y1 - top + 6);
      // sokak lambaları yanar
      (reg.lamps || []).forEach(function (l) {
        ctx.fillStyle = 'rgba(255,214,110,0.85)';
        ctx.fillRect(l.x - 2, l.y - 2, 4, 2);
        ctx.fillStyle = 'rgba(255,214,110,' + (nightA * 0.28).toFixed(3) + ')';
        ctx.fillRect(l.x - 9, l.y, 18, 34);
      });
    }

    // …ışıklar tonun ÜSTÜNE (pencereler, monitörler, LED'ler)
    var workingRooms = {};
    state.agents.forEach(function (a) {
      if (a.anim === 'work' && a.room) workingRooms[a.room] = true;
    });
    reg.windows.forEach(function (w, i) {
      var lit = workingRooms[w.roomId] || (state.roomGlow.get(w.roomId) || 0) > 0.2;
      var idleLit = day < 0.4 && (Sprites.hashStr(w.roomId + env.hour) % 3) === 0; // gece nöbetçi ışıklar
      if (lit || idleLit) {
        ctx.fillStyle = 'rgba(255,214,110,' + (lit ? 0.5 : 0.22) + ')';
        ctx.fillRect(w.x, w.y, w.w, w.h);
      }
    });
    var busyScreens = [];
    state.agents.forEach(function (a) {
      if (a.anim !== 'work' || !a.deskScreen) return;
      var s = a.deskScreen;
      busyScreens.push(s);
      drawScreenContent(ctx, s, a.workType || 'kod', t);
    });
    // boş ekranlarda loş screensaver nabzı (ofis hiç ölü durmasın)
    var si = 0;
    Object.keys(reg.screens).forEach(function (roomId) {
      reg.screens[roomId].forEach(function (s) {
        si++;
        if (busyScreens.indexOf(s) !== -1) return;
        var a2 = 0.05 + 0.06 * Math.sin(t * 0.8 + si * 2.1);
        if (a2 <= 0.02) return;
        ctx.fillStyle = 'rgba(110,200,235,' + a2.toFixed(3) + ')';
        ctx.fillRect(s.x, s.y, s.w, s.h);
      });
    });
    var burst = state.ledBurst > 0 || (audio && audio.bass > 0.55);
    reg.leds.forEach(function (l, i) {
      var on = burst || ((Sprites.hashStr('led' + i) + Math.floor(t * (burst ? 9 : 2))) % 3) === 0;
      if (!on) return;
      ctx.fillStyle = burst ? '#5fe87a' : (i % 4 === 0 ? '#ffb04a' : '#53c66e');
      ctx.fillRect(l.x, l.y, 2, 2);
    });

    // çay buharı sabit kaynağı
    reg.steam.forEach(function (s) {
      if (Math.random() < 0.06) state.particles.push(makeSteam(s.x, s.y));
    });

    if (shook) ctx.restore();
  }

  function makeSteam(x, y) {
    return { kind: 'steam', x: x, y: y, vx: 0, vy: -9, life: 2.2, max: 2.2, seed: Math.random() * 7 };
  }

  function tri(v) { v = v % 2; return v < 1 ? v : 2 - v; }

  function drawSkyline(ctx, geo, reg, day) {
    var base = geo.F1.y0; // ufuk = ana binanın çatı hattı
    var col = lerpCol([22, 20, 44], [122, 158, 188], day * 0.85);
    reg.skyline.forEach(function (b) {
      ctx.fillStyle = col;
      ctx.fillRect(b.x, base - b.h, b.w, b.h);
      if (day < 0.4) { // gece: uzak pencereler
        for (var wi = 0; wi < 8; wi++) {
          if ((Sprites.hashStr('uw' + b.seed + '_' + wi) % 4) !== 0) continue;
          var wx = b.x + 2 + (Sprites.hashStr('ux' + b.seed + wi) % Math.max(2, b.w - 4));
          var wy = base - b.h + 2 + (Sprites.hashStr('uy' + b.seed + wi) % Math.max(2, b.h - 4));
          ctx.fillStyle = 'rgba(255,214,110,' + ((0.4 - day) * 1.1).toFixed(2) + ')';
          ctx.fillRect(wx, wy, 1, 1);
        }
      }
    });
  }

  // Neon harfler (3×5 piksel font, A-Z 0-9) — gece renkli yanar, tek tek
  // seğirir; gündüz sönük. Müzik açıksa bas ile nabız atar, kick'te hepsi parlar.
  var NEON_MAP = {
    A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
    C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'],
    E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
    G: ['111', '100', '101', '101', '111'], H: ['101', '101', '111', '101', '101'],
    I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'],
    K: ['101', '110', '100', '110', '101'], L: ['100', '100', '100', '100', '111'],
    M: ['101', '111', '111', '101', '101'], N: ['101', '111', '111', '111', '101'],
    O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
    Q: ['010', '101', '101', '110', '011'], R: ['110', '101', '110', '110', '101'],
    S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
    U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'],
    W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
    Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
    2: ['110', '001', '010', '100', '111'], 3: ['110', '001', '010', '001', '110'],
    4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '110', '001', '110'],
    6: ['011', '100', '110', '101', '010'], 7: ['111', '001', '010', '010', '010'],
    8: ['010', '101', '010', '101', '010'], 9: ['010', '101', '011', '001', '110'],
    ' ': ['000', '000', '000', '000', '000'],
  };
  var NEON_COLORS = ['#ff5fa2', '#5fd6ff', '#ffd66e', '#7dff8a'];

  function drawNeon(ctx, reg, t, day, audio) {
    var nn = reg.neon, s = nn.scale;
    var kick = audio ? audio.kick : 0;
    for (var li = 0; li < nn.text.length; li++) {
      var map = NEON_MAP[nn.text[li]] || NEON_MAP[' '];
      var lx = nn.x + li * 4 * s;
      var slot = Math.floor(t * 1.7) + li * 7;
      var lit = (day < 0.55 && (Sprites.hashStr('neon' + slot) % 8) !== 0) || kick > 0.5;
      var col = lit ? NEON_COLORS[li % NEON_COLORS.length] : (day < 0.55 ? '#2c2740' : '#3a3450');
      if (lit) { // hale (basla büyür)
        var halo = 0.12 + (audio ? audio.bass * 0.3 : 0);
        ctx.fillStyle = 'rgba(255,120,190,' + halo.toFixed(2) + ')';
        ctx.fillRect(lx - 2, nn.yTop - 2, 3 * s + 4, 5 * s + 4);
      }
      ctx.fillStyle = col;
      for (var ry = 0; ry < 5; ry++) {
        for (var rx = 0; rx < 3; rx++) {
          if (map[ry][rx] === '1') ctx.fillRect(lx + rx * s, nn.yTop + ry * s, s, s);
        }
      }
    }
  }

  // Ejderha — ofisin etrafında süzülür, ara ara alçalıp cephenin önünden geçer;
  // ~9 saniyede bir (ya da kick vuruşunda) alev püskürtür 🐉
  function drawDragonFly(ctx, geo, t, day, audio) {
    var ang = t * 0.22;
    var x = geo.W / 2 + Math.cos(ang) * (geo.W / 2 - 48);
    var y = 26 + Math.sin(ang * 2) * 13;
    var sw = t % 53;
    if (sw > 46) y += Math.sin(((sw - 46) / 7) * Math.PI) * 85; // dalış turu
    var slotFire = (Sprites.hashStr('ates' + Math.floor(t / 9)) % 3) === 0 && (t % 9) < 1.1;
    Sprites.drawDragon(ctx, x, y, {
      dir: -Math.sin(ang) >= 0 ? 1 : -1,
      flap: Math.floor(t * 6) % 2 === 0,
      fire: slotFire || (audio && audio.kick > 0.55),
      night: day < 0.3,
    });
  }

  // Monitör içeriği — yapılan işin tekniğini yansıtır (5×3 piksel tuval!)
  function drawScreenContent(ctx, s, type, t) {
    ctx.fillStyle = '#0c1018';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    var f = Math.floor(t * 3);
    if (type === 'ui') { // renkli arayüz blokları
      ctx.fillStyle = '#ff5fa2'; ctx.fillRect(s.x, s.y, 2, 1);
      ctx.fillStyle = '#5fd6ff'; ctx.fillRect(s.x + 3, s.y + (f % 2), 2, 1);
      ctx.fillStyle = '#ffd66e'; ctx.fillRect(s.x, s.y + 2, 2 + (f % 2), 1);
    } else if (type === 'test') { // tik/çarpı noktaları
      for (var i = 0; i < 5; i++) {
        ctx.fillStyle = ((Sprites.hashStr('t' + i) + f) % 4) === 0 ? '#ff5050' : '#53c66e';
        ctx.fillRect(s.x + i, s.y + 1, 1, 1);
      }
    } else if (type === 'kesif') { // gezen tarama çubuğu
      ctx.fillStyle = 'rgba(255,230,140,0.9)';
      ctx.fillRect(s.x + (Math.floor(t * 6) % s.w), s.y, 1, s.h);
    } else if (type === 'terminal' || type === 'build' || type === 'deploy') { // imleç
      ctx.fillStyle = '#7dff8a';
      ctx.fillRect(s.x, s.y, 3, 1);
      if (f % 2) ctx.fillRect(s.x + (f % 3), s.y + 2, 2, 1);
    } else if (type === 'dokuman') { // beyaz sayfa + satırlar
      ctx.fillStyle = '#e8e8f4'; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#8a86b0'; ctx.fillRect(s.x + 1, s.y + 1, 3, 1);
    } else if (type === 'dusunce') { // mor nabız (LLM düşünüyor)
      var pa = 0.4 + 0.5 * Math.abs(Math.sin(t * 1.6));
      ctx.fillStyle = 'rgba(176,110,232,' + pa.toFixed(2) + ')';
      ctx.fillRect(s.x + 1, s.y, 3, s.h);
    } else if (type === 'config') { // amber ızgara
      ctx.fillStyle = '#e8a23f';
      ctx.fillRect(s.x + (f % 2), s.y, 1, s.h);
      ctx.fillRect(s.x + 3, s.y + 1, 1, 1);
    } else { // backend/kod: akan yeşil satırlar
      for (var r2 = 0; r2 < 3; r2++) {
        ctx.fillStyle = 'rgba(125,255,138,' + (r2 === (f % 3) ? '0.95' : '0.45') + ')';
        ctx.fillRect(s.x, s.y + r2, 2 + ((r2 + f) % 3), 1);
      }
    }
  }

  // Oda düzeyi iş efektleri — yalnız o iş sürerken görünür
  function drawWorkFx(ctx, r, a, t) {
    var type = a.workType;
    if (type === 'ui') { // masa dibinde boya damlaları
      var cols = ['#ff5fa2', '#5fd6ff', '#ffd66e'];
      for (var i = 0; i < 3; i++) {
        ctx.fillStyle = cols[i];
        ctx.fillRect((a.deskX || r.x0 + 12) - 12 + i * 4, r.y1 - 5, 2, 1);
      }
    } else if (type === 'test') { // oda köşesinde durum lambaları
      for (var li = 0; li < 3; li++) {
        var ok = ((Sprites.hashStr('lamp' + li) + Math.floor(t * 2)) % 4) !== 0;
        ctx.fillStyle = ok ? '#53c66e' : '#ff5050';
        ctx.fillRect(r.x1 - 14 + li * 4, r.y0 + 24, 2, 2);
      }
    } else if (type === 'backend' || type === 'kod') { // dönen dişli
      var gx = r.x0 + 8, gy = r.y0 + 24;
      ctx.fillStyle = '#9aa2b8';
      if (Math.floor(t * 4) % 2) { // '+' konumu
        ctx.fillRect(gx + 2, gy, 2, 6); ctx.fillRect(gx, gy + 2, 6, 2);
      } else { // 'x' konumu
        for (var d2 = 0; d2 < 3; d2++) {
          ctx.fillRect(gx + d2 * 2, gy + d2 * 2, 2, 2);
          ctx.fillRect(gx + 4 - d2 * 2, gy + d2 * 2, 2, 2);
        }
      }
    } else if (type === 'kesif') { // zeminde ışık taraması
      var sweep = r.x0 + ((t * 30) % Math.max(8, r.x1 - r.x0 - 10));
      ctx.fillStyle = 'rgba(255,230,140,0.22)';
      ctx.fillRect(sweep, r.y1 - 14, 8, 10);
    } else if (type === 'dokuman') { // süzülen kağıtlar
      for (var pi = 0; pi < 2; pi++) {
        var py = r.y1 - 12 - ((t * 9 + pi * 13) % 26);
        ctx.fillStyle = 'rgba(244,242,255,0.8)';
        ctx.fillRect((a.deskX || r.x0 + 14) + 8 + pi * 5, py, 2, 3);
      }
    }
  }

  // Deploy rampası: rampada bekleyen roket + geri sayım ışıkları + duman
  function drawLaunchPad(ctx, r, t, state) {
    var x = r.x1 - 14, base = r.y1 - 4;
    px(ctx, x - 2, base - 1, 9, 1, '#4a4468'); // platform
    px(ctx, x, base - 9, 4, 8, '#e8e8f4');     // gövde
    px(ctx, x, base - 11, 4, 2, '#e8554d');    // burun
    px(ctx, x - 1, base - 3, 1, 2, '#e8554d'); // kanatçıklar
    px(ctx, x + 4, base - 3, 1, 2, '#e8554d');
    var cd = Math.floor(t * 4) % 2;            // geri sayım ışıkları
    px(ctx, x - 2, base - 13, 2, 2, cd ? '#ff5050' : '#3a3450');
    px(ctx, x + 5, base - 13, 2, 2, cd ? '#3a3450' : '#ffd66e');
    if (Math.random() < 0.12) {                // rampa dumanı
      state.particles.push({
        kind: 'dust', x: x + 1 + Math.random() * 3, y: base,
        vx: (Math.random() - 0.5) * 8, vy: -3, life: 0.7, max: 0.7,
      });
    }
  }

  // Oda eşyalarının animasyonlu kısımları (statik gövdeler drawRoom'da)
  function drawPropAnims(ctx, reg, t, day) {
    reg.props.forEach(function (p) {
      if (p.type === 'conveyor') { // yürüyen bant kutuları
        var span = p.x1 - p.x0 - 8;
        for (var i = 0; i < 2; i++) {
          var bx = p.x0 + ((t * 13 + i * span / 2) % span);
          px(ctx, bx, p.y - 5, 6, 5, i % 2 ? '#c98d4a' : '#8aa04a');
          px(ctx, bx, p.y - 3, 6, 1, '#e8c07a');
        }
      } else if (p.type === 'flask') { // fokurdayan deney şişesi
        for (var fb = 0; fb < 2; fb++) {
          var fy = (t * 9 + fb * 7) % 13;
          ctx.fillStyle = 'rgba(140,240,170,' + (0.8 - fy / 16).toFixed(2) + ')';
          ctx.fillRect(p.x + (fb % 2), p.y - 3 - fy, 1, 1);
        }
      } else if (p.type === 'stove') { // ocak alevi
        var ff = Math.floor(t * 9) % 2;
        px(ctx, p.x, p.y, 2, 2, ff ? '#ff8a3a' : '#ffd66e');
        px(ctx, p.x + 3, p.y, 2, 2, ff ? '#ffd66e' : '#ff8a3a');
        if (Math.random() < 0.04) ctx.fillRect(p.x + 2, p.y - 8 - Math.random() * 4, 1, 1); // buhar
      } else if (p.type === 'cctv') { // güvenlik ekranları titrer
        p.screens.forEach(function (sc, si2) {
          var on = ((Sprites.hashStr('cctv' + si2) + Math.floor(t * 1.3)) % 5) !== 0;
          ctx.fillStyle = on ? 'rgba(150,190,220,0.5)' : 'rgba(60,70,90,0.5)';
          ctx.fillRect(sc.x, sc.y, sc.w, sc.h);
          if (on && Math.floor(t * 10) % 7 === si2 % 7) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(sc.x, sc.y + Math.floor(t * 30) % sc.h, sc.w, 1); // tarama çizgisi
          }
        });
      } else if (p.type === 'screenwall') { // meta ekran duvarı mavi akış
        p.screens.forEach(function (sc, si3) {
          var a = 0.3 + 0.3 * Math.abs(Math.sin(t * 2.2 + si3 * 1.7));
          ctx.fillStyle = 'rgba(90,160,255,' + a.toFixed(2) + ')';
          ctx.fillRect(sc.x, sc.y, sc.w, sc.h);
        });
      } else if (p.type === 'switchboard') { // santral panosu ışıkları
        for (var sl = 0; sl < 12; sl++) {
          if (((Sprites.hashStr('swb' + sl) + Math.floor(t * 3)) % 3) !== 0) continue;
          ctx.fillStyle = ['#ff5fa2', '#5fd6ff', '#7dff8a', '#ffd66e'][sl % 4];
          ctx.fillRect(p.x + 1 + (sl % 4) * 3, p.y + 1 + Math.floor(sl / 4) * 3, 2, 2);
        }
      } else if (p.type === 'drip') { // tesisat damlası
        var dy = (t * 26) % (p.y1 - p.y0);
        ctx.fillStyle = 'rgba(140,190,235,0.8)';
        ctx.fillRect(p.x, p.y0 + dy, 1, 2);
        if (dy > (p.y1 - p.y0) - 5) ctx.fillRect(p.x - 1, p.y1 - 1, 3, 1); // sıçrama
      } else if (p.type === 'coins') { // kasa parıltısı
        if ((Math.floor(t * 2) % 4) === 0) {
          ctx.fillStyle = '#fff8d0';
          var sp = Math.floor(t * 8) % 3;
          ctx.fillRect(p.x + sp * 2, p.y - 2 - sp, 1, 1);
        }
      }
    });
  }

  // Zaman-dilimli, durum tutmayan ambiyans canlıları: her "slot"un hash'i
  // o slotta canlı geçip geçmeyeceğine karar verir — state yönetimi gerekmez.
  function drawCritters(ctx, geo, t, day) {
    // kuş sürüsü (gündüz, ~18 sn'de bir)
    if (day > 0.3) {
      var bslot = Math.floor(t / 18);
      var bprog = (t % 18) / 18;
      if ((Sprites.hashStr('kus' + bslot) % 3) !== 0 && bprog < 0.45) {
        var bx = (bprog / 0.45) * (geo.W + 70) - 35;
        var by = 10 + (Sprites.hashStr('kusy' + bslot) % 22);
        var flap = Math.floor(t * 7) % 2;
        for (var b = 0; b < 3; b++) {
          var ox = bx - b * 10, oy = by + (b % 2) * 4;
          ctx.fillStyle = '#232334';
          ctx.fillRect(ox, oy + (flap ? 0 : 1), 2, 1);
          ctx.fillRect(ox + 2, oy + (flap ? 1 : 0), 2, 1);
        }
      }
    }
    // kayan yıldız (gece, seyrek ve hızlı)
    if (day < 0.25) {
      var sslot = Math.floor(t / 13);
      var sp = t % 13;
      if ((Sprites.hashStr('yildiz' + sslot) % 4) === 0 && sp < 0.7) {
        var sx = (Sprites.hashStr('yx' + sslot) % (geo.W - 140)) + 100 + sp * 120;
        var sy = 4 + (Sprites.hashStr('yy' + sslot) % 20) + sp * 34;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.95 - sp).toFixed(2) + ')';
        ctx.fillRect(sx, sy, 2, 2);
        ctx.fillRect(sx - 4, sy - 2, 2, 1);
        ctx.fillRect(sx - 8, sy - 4, 1, 1);
      }
    }
  }

  function drawStreetLife(ctx, geo, t, day) {
    var streetY = geo.GROUND.y1;
    // araba (~11 sn'de bir, iki yönlü)
    var cslot = Math.floor(t / 11);
    var cp = (t % 11) / 11;
    if ((Sprites.hashStr('araba' + cslot) % 3) === 0 && cp < 0.5) {
      var dir = (Sprites.hashStr('yon' + cslot) % 2) ? 1 : -1;
      var span = geo.W + 44;
      var cx = dir > 0 ? (cp / 0.5) * span - 22 : geo.W + 22 - (cp / 0.5) * span;
      var cy = streetY + 28;
      var gövde = ['#b03a48', '#3a6ab0', '#3aa06a', '#a08a3a'][Sprites.hashStr('renk' + cslot) % 4];
      px(ctx, cx - 8, cy, 16, 4, gövde);
      px(ctx, cx - 4, cy - 3, 8, 3, '#1c2234');
      px(ctx, cx - 6, cy + 4, 2, 2, '#0e0e16');
      px(ctx, cx + 4, cy + 4, 2, 2, '#0e0e16');
      if (day < 0.4) px(ctx, cx + (dir > 0 ? 8 : -10), cy + 1, 2, 2, '#ffe9a8'); // farlar
    }
    // kedi (~29 sn'de bir kaldırımdan geçer)
    var kslot = Math.floor(t / 29);
    var kp = (t % 29) / 29;
    if ((Sprites.hashStr('kedi' + kslot) % 2) === 0 && kp < 0.6) {
      var kx = (kp / 0.6) * (geo.W + 24) - 12;
      var ky = streetY + 44;
      px(ctx, kx, ky, 6, 3, '#15151f');
      px(ctx, kx + 5, ky - 2, 3, 3, '#15151f');
      px(ctx, kx + 6, ky - 3, 1, 1, '#15151f'); // kulak
      px(ctx, kx - 1, ky - 2 + (Math.floor(t * 3) % 2), 1, 2, '#15151f'); // kuyruk
      if (day < 0.3) px(ctx, kx + 6, ky - 1, 1, 1, '#7fe86a'); // gece parlayan göz
    }
    // paspas robotu — Kat 0 koridor devriyesi
    var rspan = geo.stair.x0 - geo.LEFT - 34;
    var rx = geo.LEFT + 14 + tri(t * 0.055) * rspan;
    var ry = geo.F0.y1 - 7;
    px(ctx, rx, ry, 8, 3, '#39415a');
    px(ctx, rx + 1, ry - 1, 6, 1, '#4d5878');
    px(ctx, rx + ((Math.floor(t * 2) % 2) ? 1 : 6), ry - 1, 1, 1, '#7fe8ff'); // led
  }

  function drawParticles(ctx, state, t) {
    state.particles.forEach(function (p) {
      var a = Math.max(0, p.life / p.max);
      if (p.kind === 'spark') {
        ctx.fillStyle = 'rgba(255,230,120,' + a.toFixed(2) + ')';
        ctx.fillRect(p.x, p.y, 1, 1);
      } else if (p.kind === 'steam') {
        ctx.fillStyle = 'rgba(220,220,235,' + (a * 0.5).toFixed(2) + ')';
        ctx.fillRect(p.x + Math.sin(t * 3 + p.seed) * 2, p.y, 2, 2);
      } else if (p.kind === 'dust') {
        ctx.fillStyle = 'rgba(185,185,205,' + (a * 0.5).toFixed(2) + ')';
        ctx.fillRect(p.x, p.y, 1, 1);
      } else if (p.kind === 'pop') {
        // yükselen minik dosya ikonu (olay geldi sinyali)
        ctx.globalAlpha = a;
        ctx.fillStyle = '#f4f2ff';
        ctx.fillRect(p.x, p.y, 4, 5);
        ctx.fillStyle = '#8a86b0';
        ctx.fillRect(p.x + 3, p.y, 1, 1);
        ctx.fillRect(p.x + 1, p.y + 2, 2, 1);
        ctx.globalAlpha = 1;
      } else if (p.kind === 'confetti') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a;
        ctx.fillRect(p.x, p.y, 2, 2);
        ctx.globalAlpha = 1;
      } else if (p.kind === 'parcel') {
        var k = 1 - p.life / p.max;
        var y = p.y0 + (p.ty - p.y0) * k - Math.sin(k * Math.PI) * 26;
        Sprites.drawPackage(ctx, p.x0 + (p.tx - p.x0) * k, y);
      } else if (p.kind === 'rocket') {
        // deploy roketi 🚀
        var rx2 = p.x + Math.sin(p.y * 0.08) * 1.5;
        ctx.fillStyle = '#e8e8f4';
        ctx.fillRect(rx2, p.y, 3, 6);
        ctx.fillStyle = '#e8554d';
        ctx.fillRect(rx2, p.y - 2, 3, 2);
        ctx.fillStyle = (Math.floor(t * 16) % 2) ? '#ffd66e' : '#ff8a3a';
        ctx.fillRect(rx2, p.y + 6, 3, 3);
      }
    });
  }

  return { init: init, makeSteam: makeSteam };
})();
