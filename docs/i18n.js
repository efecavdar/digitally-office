// i18n — EN default, TR available (?lang=tr or .devoffice.json { "lang": "tr" })
/* global window */
window.I18N = (function () {
  'use strict';

  var dict = {
    en: {
      mode_live: '● LIVE', mode_demo: '◆ DEMO', mode_replay: '◆ REPLAY', mode_connecting: '… CONNECTING',
      tk_replay: 'REPLAY ▸ {r}',
      stats: '{n} events · {c} commits',
      office_suffix: ' OFFICE',
      floor1: 'FLOOR 1', floor0: 'FLOOR 0',
      wl_ui: '🎨 painting UI', wl_backend: '⚙️ grinding backend', wl_kod: '⌨️ writing code',
      wl_test: '🧪 running tests', wl_kesif: '🔍 reading code', wl_terminal: '🖥️ in the terminal',
      wl_deploy: '🚀 prepping DEPLOY', wl_build: '🏗️ building', wl_dokuman: '📄 writing docs',
      wl_config: '🔧 tweaking config', wl_dusunce: '💭 thinking', wl_goz: '👀 browsing',
      working: 'working',
      tk_arrive: '{l} clocked in 🤖', tk_left: '{l} clocked out 👋',
      tk_task: '{l} 📥 got a task', tk_done: '{l} ✅ delivered the turn',
      tk_commit: 'COMMIT ▸ ', tk_branch: 'BRANCH ▸ ',
      tk_live: 'LIVE ▸ watching the repo',
      tk_demo: 'DEMO MODE ▸ {r} · intensity {i} (use +/-)',
      tk_party: '🎉 PARTY MODE! everyone hit the floor',
      tk_deploy_prep: '🚀 launch pad prepping — deploy started',
      tk_deploy_go: '🚀 LIFTOFF! deploy on its way',
      tk_roster_on: 'session panel shown', tk_roster_off: 'session panel hidden',
      tk_audio_off: '🔇 music mode off', tk_mic_wait: '🎤 requesting microphone…',
      tk_music_mic: '🎵 MUSIC MODE ▸ listening to the mic, office is in the groove',
      tk_music_fake: '🎵 MUSIC MODE ▸ no mic, fake beat (126 BPM)',
      tk_clock: 'clock ▸ {m}', clock_auto: 'auto', clock_day: 'day', clock_night: 'night',
      tk_tempo: 'tempo ▸ {n}', tk_pulse: 'office pulse',
      demo_request: 'by request', demo_fallback: 'no live connection', demo_manual: 'switched manually',
      ro_wait: 'idle', ro_office: 'around the office', ro_guest: 'Guest',
      fillers: [
        'DIGITALLY OFFICE ▸ every module is a room, every commit a celebration',
        'events so far ▸ {n}',
        'the tea is fresh ☕',
        'servers humming along',
        'dragon on patrol 🐉',
        'keys ▸ [s]canlines · [g] day/night · [m]ode · [f]ullscreen · [p]arty 🎉 · [a] music 🎵 · [r]oster · [+/-] tempo',
      ],
    },
    tr: {
      mode_live: '● CANLI', mode_demo: '◆ DEMO', mode_replay: '◆ KAYIT', mode_connecting: '… BAĞLANIYOR',
      tk_replay: 'KAYITTAN OYNATMA ▸ {r}',
      stats: '{n} olay · {c} commit',
      office_suffix: ' OFİSİ',
      floor1: 'KAT 1', floor0: 'KAT 0',
      wl_ui: '🎨 UI boyuyor', wl_backend: '⚙️ backend işliyor', wl_kod: '⌨️ kod yazıyor',
      wl_test: '🧪 test koşuyor', wl_kesif: '🔍 kod okuyor', wl_terminal: '🖥️ terminalde',
      wl_deploy: '🚀 DEPLOY hazırlıyor', wl_build: '🏗️ build alıyor', wl_dokuman: '📄 doküman yazıyor',
      wl_config: '🔧 ayar kurcalıyor', wl_dusunce: '💭 düşünüyor', wl_goz: '👀 göz atıyor',
      working: 'çalışıyor',
      tk_arrive: '{l} mesaiye geldi 🤖', tk_left: '{l} mesaiyi bitirdi 👋',
      tk_task: '{l} 📥 görev aldı', tk_done: '{l} ✅ turu teslim etti',
      tk_commit: 'COMMIT ▸ ', tk_branch: 'DAL ▸ ',
      tk_live: 'CANLI YAYIN ▸ repo dinleniyor',
      tk_demo: 'DEMO MODU ▸ {r} · yoğunluk {i} (+/- ile)',
      tk_party: '🎉 PARTİ MODU! herkes piste',
      tk_deploy_prep: '🚀 rampa hazırlanıyor — deploy başladı',
      tk_deploy_go: '🚀 FIRLATILDI! deploy yolda',
      tk_roster_on: 'oturum panosu açık', tk_roster_off: 'oturum panosu gizlendi',
      tk_audio_off: '🔇 ses tepkisi kapandı', tk_mic_wait: '🎤 mikrofon isteniyor…',
      tk_music_mic: '🎵 MÜZİK MODU ▸ mikrofon dinleniyor, ofis ritme girdi',
      tk_music_fake: '🎵 MÜZİK MODU ▸ mikrofon yok, sahte ritim (126 BPM)',
      tk_clock: 'saat kipi ▸ {m}', clock_auto: 'otomatik', clock_day: 'gündüz', clock_night: 'gece',
      tk_tempo: 'tempo ▸ {n}', tk_pulse: 'ofis nabzı',
      demo_request: 'istekle', demo_fallback: 'bağlantı yok', demo_manual: 'elle geçildi',
      ro_wait: 'bekliyor', ro_office: 'ofiste', ro_guest: 'Misafir',
      fillers: [
        'DIGITALLY ▸ her modül bir oda, her commit bir kutlama',
        'olay sayısı ▸ {n}',
        'çay taze ☕',
        'sunucular mırıl mırıl çalışıyor',
        'ejderha devriyede 🐉',
        'tuşlar ▸ [s]canline · [g]ece/gündüz · [m]od · [f]ullscreen · [p]arti 🎉 · [a] müzik 🎵 · [r]oster · [+/-] tempo',
      ],
    },
  };

  var lang = 'en';

  function t(key, vars) {
    var s = (dict[lang] && dict[lang][key] !== undefined) ? dict[lang][key] : dict.en[key];
    if (s === undefined) return key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = (typeof s === 'string') ? s.split('{' + k + '}').join(vars[k]) : s;
      });
    }
    return s;
  }

  return {
    set: function (l) { lang = dict[l] ? l : 'en'; },
    lang: function () { return lang; },
    t: t,
  };
})();
