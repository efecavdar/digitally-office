# Digitally Office 🏢🐉

**Geliştirme aktiviteni canlı izleyen retro pixel-art ofis.**

Repo'nun her modülü bir oda olur. Pixel ajanlar — sen *ve Claude Code
oturumların* — odalar arasında dolaşır, masalara oturur, o an gerçekten
değişen şey üzerinde çalışır. Commit'ler çatıdan roket fırlatır. Bir ejderha
var. Bir de parti tuşu. 🎉

> [**▶ Canlı demo**](https://efecavdar.github.io/digitally-office/?demo=1&lang=tr)
> — tarayıcıda çalışır, kurulum yok.

## Hızlı başlangıç

```bash
cd repo-dizinin
npx digitally-office
```

Bu kadar. Repo'yu tarar, en büyük klasörleri odalara çevirir (oda boyutu ∝ kod
boyutu), dosya sistemini ve git'i izler, `http://localhost:4242`'yi açar.

### Claude Code entegrasyonu (opsiyonel, işin eğlencesi)

```bash
npx digitally-office --install-hooks
```

Küçük bir hook `.claude/hooks/` altına kopyalanır ve `.claude/settings.json`'a
(hiçbir şey ezilmeden) eklenir. Claude oturumlarını yeniden başlat; her oturum
vizörlü kendi pixel ajanı olarak mesaiye gelir: prompt gönderdiğin an 📥 görev
alır, ilk araç çağrısına dek masasında 💭 düşünür, okuduğu dosyanın odasında
🔍 kod okur, iş tipine göre (🎨 UI / ⚙️ backend / 🧪 test) çalışır, `deploy`
komutunda Sunucu Odası'nda roket rampaya çekilir 🚀, turu bitirince ✅ teslim
eder. Sunucu kapalıyken hook ~70 ms'de sessizce çıkar — Claude'u yavaşlatmaz.

## Tuşlar

`p` parti (DJ drop) · `a` müzik modu (mikrofon → görseller) · `f` tam ekran ·
`g` gece/gündüz · `r` oturum panosu · `s` scanline · `m` canlı/demo · `+`/`-` tempo

## Yapılandırma

Repo köküne `.devoffice.json` koy (hepsi opsiyonel): `signText` (çatıdaki neon,
varsayılan klasör adı), `lang` (`"tr"`), `port`, `floorNames`, `rooms` (elle
oda haritası). `?lang=tr` URL parametresi de çalışır.

## Lisans

MIT © Efe Çavdar
