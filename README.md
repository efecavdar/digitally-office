# Digitally Office 🏢🐉

**A retro pixel-art office that visualizes your dev activity — live.**

Every module of your repo becomes a room. Pixel agents — you *and your Claude
Code sessions* — walk between rooms, sit at desks and work on whatever is
actually being changed. Commits launch a rocket off the roof. There's a dragon.
And a party button. 🎉

> [**▶ Live demo**](https://efecavdar.github.io/digitally-office/?demo=1) — runs
> entirely in your browser, no install.

*Türkçe: [README.tr.md](README.tr.md)*

## Quick start

```bash
cd your-repo
npx digitally-office
```

That's it. It scans your repo, turns your biggest directories into rooms
(room size ∝ codebase size — as the code grows, the room grows), watches the
file system and git, and opens `http://localhost:4242`.

### Claude Code integration (optional, the fun part)

```bash
npx digitally-office --install-hooks
```

This copies a tiny hook into `.claude/hooks/` and merges it into
`.claude/settings.json` (nothing is overwritten). Restart your Claude Code
sessions and each one appears as its own visor-wearing pixel agent:

- 📥 gets a task the moment you send a prompt, 💭 thinks at a desk until the
  first tool call
- 🔍 reads code in the room of the file it's reading, 🎨/⚙️/🧪 edits with
  work-type-specific monitors, icons and room effects
- 🖥️ terminal work happens in the Server Room; `deploy` commands roll a rocket
  onto the launch pad — liftoff when the deploy goes quiet 🚀
- ✅ announces when it delivers the turn, ☕ hits the tea corner when idle

The hook is fail-silent: when the office server isn't running it exits in
~70 ms and never slows Claude down.

## What's in the office

- **Live mode** — file watcher + git poll + Claude hooks; a session roster
  (who · where · doing what · which file), name tags, floating file names.
- **Demo mode** — works with zero server: open `docs/index.html` from disk or
  add `?demo=1`. Synthetic activity or a replay; auto-fallback when the live
  connection drops. Built for projecting at live-coding/DJ sets.
- **Music mode** (`a`) — listens to your microphone: every room's floor becomes
  a spectrum bar, the neon sign pulses with the bass, kicks shake the scene and
  make the dragon breathe fire. No mic? A 126 BPM fake beat kicks in.
- **Ambience** — day/night cycle from your clock, drifting clouds, shooting
  stars, street cats and cars, a patrolling vacuum robot, CRT scanlines, and a
  neon rooftop sign with your repo's name.

## Keys

| Key | Action |
|---|---|
| `p` | 🎉 party mode: confetti rain + rainbow floors + rocket (the DJ drop button) |
| `a` | 🎵 music mode (microphone → visuals) |
| `f` | fullscreen |
| `g` | clock: auto → night → day |
| `r` | toggle the session roster |
| `s` | CRT scanlines on/off |
| `m` | live ↔ demo |
| `+` / `-` | demo tempo (1-10) |

## Configuration (optional)

Drop a `.devoffice.json` in your repo root:

```json
{
  "signText": "ACME",
  "lang": "tr",
  "port": 4242,
  "floorNames": { "1": "PRODUCT", "0": "MACHINE ROOM" },
  "rooms": [
    { "id": "crm", "name": "CRM Lounge", "floor": 1,
      "paths": ["modules/CRM", "functions/src/crm"] }
  ]
}
```

Everything is optional — `signText` defaults to your repo folder's name,
`rooms` to the auto-generated map, `lang` to English (`?lang=tr` works too).

## How it works

One zero-dependency Node server (`node:http` + Server-Sent Events +
`fs.watch`) and one static vanilla-JS canvas page at 640×360, scaled with
`image-rendering: pixelated`. No build step, no frameworks, no assets — every
sprite is drawn from code. Session logs are written to
`~/.digitally-office/sessions/` as JSONL, so you can replay a good day later.

## License

MIT © Efe Çavdar
