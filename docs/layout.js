// Kat planı geometrisi: sunucudan gelen oda listesi (kat + dosya sayısı) →
// 640×360 dünya. Genişlikler sqrt(dosyaSayısı) ölçekli — kod büyüdükçe oda büyür.
/* global window */
window.Layout = (function () {
  'use strict';

  var W = 640, H = 360;
  var LEFT = 8, STAIR_X0 = 600, STAIR_X1 = 632;
  var F1 = { y0: 64, y1: 174 };
  var SLAB = { y0: 174, y1: 182 };
  var F0 = { y0: 182, y1: 292 };
  var GROUND = { y0: 292, y1: 300 };

  var FIXED_WIDTHS = { cay: 48, sunucu: 58, arsiv: 34 }; // ortak alanlar ölçeklenmez
  var F1_FILLS = ['#3d3550', '#463a52', '#3a3d55', '#42364e'];
  var F0_FILLS = ['#33303f', '#2e3342', '#363042', '#303845'];

  function widthsFor(order, byId, usable, minW, maxW) {
    var scaledIds = order.filter(function (id) { return FIXED_WIDTHS[id] === undefined; });
    var fixedSum = order.reduce(function (s, id) { return s + (FIXED_WIDTHS[id] || 0); }, 0);
    var pool = usable - fixedSum;
    // az odalı repolarda bina yine de tam genişliğe otursun
    if (scaledIds.length) maxW = Math.max(maxW, pool / scaledIds.length);
    var weights = {}, sum = 0;
    scaledIds.forEach(function (id) {
      weights[id] = Math.sqrt(((byId[id] && byId[id].fileCount) || 0) + 6);
      sum += weights[id];
    });
    var out = {}, clampedSum = 0, freeSum = 0;
    scaledIds.forEach(function (id) {
      var w = (pool * weights[id]) / sum;
      if (w < minW) { out[id] = minW; clampedSum += minW; }
      else if (w > maxW) { out[id] = maxW; clampedSum += maxW; }
      else { out[id] = w; freeSum += w; }
    });
    var leftover = pool - clampedSum - freeSum;
    if (Math.abs(leftover) > 0.5 && freeSum > 0) {
      scaledIds.forEach(function (id) {
        if (out[id] > minW && out[id] < maxW) out[id] += (leftover * out[id]) / freeSum;
      });
    }
    order.forEach(function (id) { if (FIXED_WIDTHS[id] !== undefined) out[id] = FIXED_WIDTHS[id]; });
    return out;
  }

  function buildFloor(defs, band, floorNo) {
    var byId = {}, order = [];
    defs.forEach(function (r) { byId[r.id] = r; order.push(r.id); });
    var usable = STAIR_X0 - LEFT;
    var widths = widthsFor(order, byId, usable, floorNo === 1 ? 42 : 36, 110);
    var rooms = [];
    var x = LEFT;
    var fills = floorNo === 1 ? F1_FILLS : F0_FILLS;
    order.forEach(function (id, i) {
      var def = byId[id];
      var w = widths[id];
      var walkY = band.y1 - 4;
      var deskCount = def.common ? 0 : Math.max(1, Math.min(3, Math.floor((w - 14) / 26)));
      var deskXs = [];
      for (var d = 0; d < deskCount; d++) {
        deskXs.push(Math.round(x + (w * (d + 1)) / (deskCount + 1)));
      }
      rooms.push({
        id: id, name: def.name, label: String(def.name).toUpperCase().slice(0, 12),
        floor: floorNo, common: !!def.common, fileCount: def.fileCount || 0,
        x0: Math.round(x), x1: Math.round(x + w), y0: band.y0, y1: band.y1,
        walkY: walkY, deskXs: deskXs, fill: fills[i % fills.length],
      });
      x += w;
    });
    return rooms;
  }

  function build(layoutData) {
    var all = layoutData.rooms || [];
    var rooms = buildFloor(all.filter(function (r) { return r.floor === 1; }), F1, 1)
      .concat(buildFloor(all.filter(function (r) { return r.floor !== 1; }), F0, 0));
    var roomById = {};
    rooms.forEach(function (r) { roomById[r.id] = r; });
    return {
      W: W, H: H, LEFT: LEFT, F1: F1, F0: F0, SLAB: SLAB, GROUND: GROUND,
      stair: {
        x0: STAIR_X0, x1: STAIR_X1, cx: (STAIR_X0 + STAIR_X1) / 2,
        topWalkY: F1.y1 - 4, botWalkY: F0.y1 - 4,
      },
      rooms: rooms, roomById: roomById,
      signText: layoutData.signText || 'DIGITALLY',
      floorNames: layoutData.floorNames || null,
      humanLabel: layoutData.humanLabel || 'Dev',
      walkYFor: function (floorNo) { return floorNo === 1 ? F1.y1 - 4 : F0.y1 - 4; },
    };
  }

  return { build: build };
})();
