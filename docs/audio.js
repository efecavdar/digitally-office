// Ses tepkisi — mikrofonu dinler (DJ setinde ortam sesi), bas/orta/tiz +
// kick vuruşu çıkarır. Mikrofon yoksa/verilmezse 126 BPM sahte ritme düşer
// ki görseller her koşulda müzikle yaşasın.
/* global window, navigator */
window.AudioFX = (function () {
  'use strict';

  var on = false, usingMic = false;
  var actx = null, analyser = null, data = null, stream = null;
  var avgBass = 0, lastKickAt = 0;
  var levels = { on: false, level: 0, bass: 0, mid: 0, treble: 0, kick: 0, bins: [] };
  var BIN_COUNT = 17; // oda sayısı kadar spektrum çubuğu

  function bandAvg(a, i0, i1) {
    var s = 0;
    for (var i = i0; i < i1 && i < a.length; i++) s += a[i];
    return s / Math.max(1, i1 - i0) / 255;
  }

  function start() {
    if (on) return Promise.resolve(usingMic);
    on = true;
    levels.on = true;
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) { usingMic = false; return Promise.resolve(false); }
    return md.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    }).then(function (s) {
      stream = s;
      actx = new (window.AudioContext || window.webkitAudioContext)();
      var src = actx.createMediaStreamSource(s);
      analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      data = new Uint8Array(analyser.frequencyBinCount);
      usingMic = true;
      return true;
    }).catch(function () {
      usingMic = false;
      return false;
    });
  }

  function stop() {
    on = false;
    levels.on = false;
    levels.kick = 0;
    if (stream) { stream.getTracks().forEach(function (tr) { tr.stop(); }); stream = null; }
    if (actx) { actx.close().catch(function () {}); actx = null; analyser = null; }
    usingMic = false;
  }

  // her karede çağrılır; t=saniye, dt=kare süresi
  function update(t, dt) {
    if (!on) return null;
    if (analyser) {
      analyser.getByteFrequencyData(data);
      levels.bass = bandAvg(data, 1, 8);
      levels.mid = bandAvg(data, 8, 40);
      levels.treble = bandAvg(data, 40, 100);
      levels.bins = [];
      for (var i = 0; i < BIN_COUNT; i++) {
        var bi = 1 + Math.floor(Math.pow(i / BIN_COUNT, 1.6) * 96);
        levels.bins.push((data[bi] || 0) / 255);
      }
      // kick sezimi: bas, kayan ortalamanın belirgin üstüne çıkarsa
      avgBass = avgBass * 0.985 + levels.bass * 0.015;
      var now = t * 1000;
      if (levels.bass > Math.max(0.22, avgBass * 1.45) && now - lastKickAt > 180) {
        lastKickAt = now;
        levels.kick = 1;
      }
    } else {
      // sahte ritim (mikrofon yok): 126 BPM dörtlük vuruş
      var beat = (t * 126 / 60) % 1;
      var pulse = Math.max(0, 1 - beat * 5);
      levels.bass = 0.25 + pulse * 0.6;
      levels.mid = 0.3 + 0.18 * Math.sin(t * 2.7);
      levels.treble = 0.22 + 0.18 * Math.abs(Math.sin(t * 5.3));
      levels.bins = [];
      for (var j = 0; j < BIN_COUNT; j++) {
        levels.bins.push(Math.max(0.05,
          pulse * (1 - j / BIN_COUNT) * 0.9 + 0.3 * Math.abs(Math.sin(t * 3 + j * 1.3))));
      }
      if (beat < 0.05) levels.kick = 1;
    }
    levels.level = (levels.bass + levels.mid + levels.treble) / 3;
    levels.kick = Math.max(0, levels.kick - dt * 4.5);
    return levels;
  }

  return {
    start: start, stop: stop, update: update,
    isOn: function () { return on; },
    usingMic: function () { return usingMic; },
  };
})();
