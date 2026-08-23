# Scrapcraft — Release Notes

## v0.2.0

> *The scrapyard is alive. Bots race under floodlights, caches hide in the dark, and Earl still doesn't trust you.*

### Features

- **World-before-menu opening** — CLOCK IN renders the yard immediately: a slow aerial orbit (lite-mode aware — closer ring when the fog pulls in) plays *behind* the welcome wizard and the Yard Gate questions, now translucent scrims instead of near-opaque panels. AmbientLife runs underneath (the crane creaks, the cat crosses), day/night and weather keep moving, and pointer lock is deliberately deferred until the last overlay closes — then the camera parks exactly at the kid's eye and the controls hand over seamlessly. Returning players skip straight to the yard, as always.
- **Mo's Ledger [J]** — the named career surface: first ore, first bot, first race + personal bests, chapters walked, jobs done + arcs, rare finds, the bot's dents, and the day streak — all read live from existing achievement/quest/bot-ledger state (fail-soft by construction). Cross-linked from the Logbook, listed in the help overlay, with a copy-to-clipboard plain-text export for teachers. *June keeps hers in marker; Mo keeps yours.*
- **128×128×10 voxel world** with 4 parallel bands (The Yard Gate, Industrial Corridor, Circuit City, The Deep Yard)
- **Procedural generation** — buildings, refineries, warehouses, race track, acid hazards, buried caches
- **Hold-to-mine** with particle effects and procedural audio
- **56 crafting recipes** (~50 unique outputs) across 3 tiers at Hand/Workbench/Forge/Smelter stations
- **49 achievements** covering crafting, exploration, Maker Lab, and progression milestones
- **XP and level system** with 5 skill nodes (Tinkerer lv1, Programmer lv3, Engineer lv5, Maker lv8, Inventor lv12)
- **Big Earl AI foreman** — Claude-powered dialogue with offline personality bank fallback
- **ScrapBot companion** with tile-based visual programming language
- **Tile Editor** — drag-and-drop robot brain builder with sensor readout
- **12 built-in presets** (Wall Avoider, Line Follower, Light Runner, etc.)
- **Spark AI build buddy** — Claude API program generation with offline fallback
- **Arduino/MicroPython/Wokwi firmware export**
- **Tile program sharing** via base64 URL parameter (`?brain=`)
- **Save/Load with autosave** (F5 save, F9 load, autosave every 60s)
- **Day/night cycle** (6-minute cycle with modulated ambient light)
- **Weather system** — clear, rain, storm (with lightning flashes)
- **Block placement** (right-click to place held block)
- **Lap timer + ghost replay** for robot racing on the oval track
- **Minimap** with fog of war (128×128 pixel)
- **Supply drops** every 90–180 seconds with compass direction indicator
- **Salvage Run challenges** — repeatable one-session objectives
- **Functional items** — headlamp, spring boots, go-kart, grapple hook, ore scanner, signal radio, scrap cannon, flare pack, waypoint flags, scrap grenade, rubber boots, speed coil, night goggles
- **Dual-bot system** — second bot unlocks at Level 5 (Engineer)
- **Fully procedural audio** — no audio files, all sounds synthesized in Web Audio API
- **Particle system** — 800-particle pool for mining, crafting, fireworks, confetti
- **27 Engineering Codex entries** — real science at middle-school reading level
- **HUD** — health, XP bar, weather indicator, day/night indicator, active item label, hotbar tooltips, notification area
- **Camera shake** on scrap cannon and grenade explosions
- **Crosshair states** — spread when moving, gold on interactable blocks, mining arc during hold-to-mine
- **Damage vignette** — red flash on hit
- **Inventory sorting** (I key)
- **36 Maker Lab unit tests** — zero dependencies, runs in <200ms (suite is now 1,196 tests across maker, quests, companions, world, ambient, opening, and ledger — still zero-framework, still <1s)

### Known Limitations

- **Browser only** — no native desktop or mobile builds yet
- **No multiplayer** — single-player only (localStorage saves are per-browser)
- **No sound on some mobile browsers** — Web Audio requires user gesture; some browsers block autoplay context
- **Save key is `scrapcraft_save_v6`** — resets on major save format changes
- **World seed is configurable** — default yard is `1337`; append `?seed=42` to the URL for a different world (any integer). No in-game seed picker yet
- **No cloud saves** — localStorage is per-device
- **AI requires API key** — Spark's live AI mode needs `VITE_ANTHROPIC_API_KEY` in `.env.local`; offline fallback covers common use cases
- **Accessibility** — no screen reader support for tile editor; color-coded blocks lack alt text
- **Performance** — world generation has brief stutter on first load; minimap render is poll-based
- **Block limit** — 128×128×10 (163,840 blocks max); no infinite world
