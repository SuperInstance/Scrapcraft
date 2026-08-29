# DESIGN BRIEF — The Two E-Menus: BUILD & PROGRAM (with inference chips)

*Source canon: `ai-writings/papers/223-inference-chips.md` (commit 5bc416f7) — read it first. This brief translates it into build instructions for this repo.*

## Two E-command menus (context-aware E key)

**[E] BUILD — physical assembly.** Panel of parts: chassis, wheels (per-size drive constants), motors, battery, bumpers, and the **Arduino with two chip sockets**. Assembled parts determine what PROGRAM may assume: no wheels → no drive blocks; no socket → no chips. Reuse existing inventory/crafting (items.js/recipes.js) and any existing bot-assembly UI (check BotUpgrades.js, TileEditor bot wiring). If a full assembly UI doesn't exist, a drag-part-to-slot panel is enough for v0: one slot per part type.

**[E] PROGRAM — tile programming (existing editor) + chip rail.** Chips mounted in BUILD appear on a rail; each mounted chip unlocks its agentic tile (table below). Agentic tiles slot into the SAME TileProgram → compile() → Arduino/MicroPython path. No parallel runtime.

## The six chips (v0)

| Chip | Mask | Tile | Minimal honest codegen |
|---|---|---|---|
| ECHO | road behind | remember-path | replay recorded drive/turn seq (ring buffer) |
| SENTRY | yard ahead | watch-obstacle | proximity guard + hysteresis around a chosen block |
| RUMOR | gallery wall | hear-share | serial/bt packet tx-rx one fact byte |
| WITNESS | journal | log-tick | EEPROM.write milestone counters |
| PILOT | track | seek-line | line-sensor P-control correcting toward lane |
| EMBER | own heat | keep-warm | low-battery guard: park + flash LED |

## Chip growth (crafting)

Recipe v0: salvaged wafer + failure shards (count controls temperament) → acid bath → **cold shelf timer** (real minutes, ticked by game loop) → chip. Seed = SHA-256 of (recipe + shard count + shelf start tick) — deterministic per world. Cracked outcome (shards > threshold, seeded) = mumbled timing (±15% seeded jitter) — NOT a bug, canon (see paper). Mounting: drag chip to Arduino socket in BUILD.

## Integration notes

- E key: if near bench/inventory open → BUILD; if a bot selected → PROGRAM. Both panels share the existing panel/frame styling.
- Jr mode interplay: Jr blocks stay ungated except movement already gated by motor craft; chips are a big-kid layer, no Jr changes required.
- Save: mounted chips + grown chips persist via existing save payload pattern (follow MosLedger toSaveData/fromSaveData precedent).
- Docs: extend DEV_GUIDE_hardware_brains_and_export.md with a CHIPS section; curriculum note (ages 10-12, after tile editor basics).

## Verify

npm run build clean; npm test green (add unit tests: chip growth determinism, mask gating of tiles, codegen snapshots for all six chips in both targets). Commit prefix "chips:". Push. Do NOT deploy (deploy is parent's).
