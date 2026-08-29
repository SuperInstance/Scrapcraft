# Dev Guide — Scrapcraft Jr (Icon-Block Mode, Ages 6–10)

**Goal:** a pre-literacy programming lane LAYERED ON TOP of the tile editor.
Big chunky icon blocks, no reading required, craft-gated actuator blocks, and —
the whole point — **the same compile path**: a 7-year-old's 4-block program
exports to the same real Arduino C++ / MicroPython as a 13-year-old's
wall-avoider. Jr is a dialect of the same language, not a toy.

**Read first:** `docs/DEV_GUIDE_tile_editor.md` (the editor this layers onto),
`src/maker/primitives.js` (the primitive vocabulary both lanes share),
`src/jr/JrBlocks.js` (the Jr registry — this file's tables live in code).

---

## 1. Design rationale

**Why a second lane at all?** The tile editor is honest for ages ~10+:
text labels, dropdowns, sliders, nested forever/if/else. ScratchJr's insight
(age 5–7) is that reading is the bottleneck, not logic. Kids who can't read
"drive forward 60%" can absolutely sequence 🏁 → ⬆️ → 🎵 → 🛑 and watch a bot
do it. Jr removes the reading, not the engineering: every block maps to a real
primitive with a real firmware statement.

**Layered, not forked.** Jr never touches the Maker Lab engine. The whole
bridge is one function: `JrProgram.toTileProgram()`. From there it's the
standard path — `compile()` → `TileVM` → `ScrapBot.setBrain()`, and
`toArduino()` / `toMicroPython()` / Wokwi for export. No parallel runtime, no
parallel data format, no export special cases. When the tile editor gains a
feature, Jr inherits it for free.

**One tap = one action.** No dialogs, no sliders, no number entry. Options
cycle on tap (wait 1→2→3→4 s, repeat ×2→×3→×4→×1, light green→blue→red→off,
sound mid→high→low). Every drag affordance has a tap twin (✕ buttons), so it
works on touch tablets where HTML5 drag doesn't.

**Loops, gently.** Repeat caps at 4 (tap cycles the count), nesting is
forbidden (a 🔁 cannot contain a 🔁), sequence caps at 16 blocks, repeat bodies
cap at 8. "Sequence + one shallow loop" is the whole control-flow universe —
that's the developmentally right ceiling for 6–10, and the tile editor's
forever/if/else becomes the graduation prize, not a wall.

**Hardware first, then software.** Motor/light/sound blocks are locked until
the kid crafts the matching part. This mirrors the scrapyard economy, teaches
the deepest embedded lesson (you can't drive motors you haven't built), and
gives crafting a programming payoff within one session.

## 2. The block list

| Block | Icon | Always available? | Tap options |
|---|---|---|---|
| when-start | 🏁 | ✅ (fixed program head) | — |
| motor forward | ⬆️ | 🔒 craft **Motor Driver (L298N)** | — |
| motor left | ⬅️ | 🔒 craft **Motor Driver (L298N)** | — |
| motor right | ➡️ | 🔒 craft **Motor Driver (L298N)** | — |
| wait | ⏰ | ✅ | 1 → 2 → 3 → 4 seconds |
| repeat | 🔁 | ✅ | ×2 → ×3 → ×4 → ×1 (cap 4, no nesting) |
| light | 💡 | 🔒 craft **LED Module** | green → blue → red → off |
| sound | 🎵 | 🔒 craft **Piezo Buzzer** | mid → high → low |
| stop | 🛑 | ✅ | — |

Rules enforced in `JrProgram.validate()` and the editor: program starts with
🏁, sequence ≤ 16 blocks, repeat count ≤ 4, repeat bodies hold plain blocks
only (≤ 8 each).

## 3. Crafting gates

Gates read **ever-crafted** (`player.crafted` — persists after the part is
consumed) OR **currently in inventory** (`countItem`). Free starter kit:
flag/wait/repeat/stop. Earned: motors, light, sound.

| To unlock | Craft | Recipe (workbench, tier 1) |
|---|---|---|
| ⬆️ ⬅️ ➡️ motor blocks | Motor Driver (L298N) — existing | circuit board ×1, iron scrap ×2 |
| 💡 light block | LED Module — **new item** `led_module` | circuit board ×1, copper wire ×1, glass shard ×1 |
| 🎵 sound block | Piezo Buzzer — existing | gear ×1, copper wire ×1 |

`Game.onCraft` calls `jrEditor.onCrafted(output)`; when a gated part comes off
the bench the tray re-renders, a fanfare plays, and a notification tells the
kid which icon block just unlocked. That crafting→programming loop is the lane's
core delight.

## 4. Codegen mapping — block → craft → firmware

The verbatim table (also in `src/jr/JrBlocks.js` header):

| Jr icon block | Craft gate | TileProgram nodes |
|---------------|------------|-------------------|
| 🏁 start | — (always) | (program head; no emitted node) |
| ⬆️ forward | motor_driver | drive(forward, 0.6) + wait(1.0) |
| ⬅️ left | motor_driver | turn(left, 0.6) + wait(0.5) |
| ➡️ right | motor_driver | turn(right, 0.6) + wait(0.5) |
| ⏰ wait | — (always) | wait(n), n ∈ 1..4 s (tap cycles) |
| 🔁 repeat | — (always) | repeat(n ≤ 4, body) — no nesting |
| 💡 light | led_module | led(state), state cycles on tap |
| 🎵 sound | buzzer_module | beep(pitch), pitch cycles on tap |
| 🛑 stop | — (always) | stop() |

Motor blocks are **actuate + one beat** (drive then a fixed 1 s wait, turn
then 0.5 s) because that's what a non-reading kid expects an arrow to mean —
"go for a bit" — and it's honest firmware: the motors run during the delay.
`drive(FORWARD, 153)` + `pauseMs(1000)` on the Arduino side; `m.drive("forward",
0.60)` + `sleep(1.0)` in MicroPython. One speed (0.6), no slider, no fractions
to read.

Generated firmware for the seeded `Zig Zag Bot` (🏁 ⬆️ 🎵 🔁×3[⬅️ ⬆️] 🛑):

```cpp
// inside loop():
  drive(FORWARD, 153);
  pauseMs(1000);
  tone(BUZZ_PIN, 990, 150);
  for (int jr0 = 0; jr0 < 3; jr0++) {
    turn(LEFT, 153);
    pauseMs(500);
    drive(FORWARD, 153);
    pauseMs(1000);
  }
  stopMotors();
```

The `⌨ CODE` button in the Jr editor shows exactly this — real, flashable
output, same as the Maker Bench.

## 5. UI shape & files

| File | Role |
|---|---|
| `src/jr/JrBlocks.js` | Pure: block registry, gates, caps, `jrStepToNodes()` codegen |
| `src/jr/JrProgram.js` | Pure: program model, `toTileProgram()`, `validate()`, save/share |
| `src/jr/JrEditor.js` | DOM: tray + sequence + trash, run/stop, code peek, graduate |
| `src/jr/JrShowcase.js` | Shared wall on the scrap-spark gallery (see §7) |
| `src/jr/JrPresence.js` | Live-presence seam (see §7) |
| `src/jr/__tests__/jr-tests.mjs` | 59 assertions folded into `run-tests.mjs` |

Entry points:
- **Shift+T** anywhere — toggle the Jr editor (plain **T** stays the Maker Bench).
- **🧒 JR** button in the Maker Bench header.
- **⬆ BIG KID** button in the Jr editor — graduates the kid to the tile editor
  with the Jr program already converted and loaded (`loadProgram`). Nobody
  loses their bot by growing up.

While the Jr editor is open it owns the keyboard (Escape closes), matching the
tile editor's modal behavior. Programs persist to `localStorage
scrapcraft_jr_program`; first-timers seed with the `Zig Zag Bot` example.

## 6. Curriculum positioning (ages 6–10, BEFORE the tile editor)

The honest concept ladder (`docs/CURRICULUM.md`) starts at Tier 1 SENSE /
Tier 2 THINK for middle schoolers. Jr is the **on-ramp tier 0** for ages 6–10:

- **Sequence** — blocks run in order, top to bottom (pre-`if`, pre-forever).
- **Iteration (shallow)** — 🔁 ×n is "do it again" before `repeat_until`/`forever`.
- **Symbolic correspondence** — an icon *means* an actuator command; the code
  peek shows the same idea as text. That's the whole trick of programming.
- **Hardware-software coupling** — the craft gates make "no motor block
  without a motor" felt, not told.

A kid who outgrows Jr arrives at the tile editor already owning sequence +
loops, so conditionals (`if`) are the only genuinely new idea — exactly where
Tier 2 begins. Jr tracks `program_run` achievement events and observer
`menu_open('jr_mode')` surface events, so playtest data flows through the
existing instrument (`?observe=1`).

## 7. Vibe with the team — showcase + presence seam

**What's live:** no WebSocket/multiplayer plumbing exists in the fleet (all
cloud is request/response via Cloudflare Workers: saves, class joins, gallery).
So Jr's shared surface rides the **scrap-spark gallery** — the same wall the
big kids' Brain Gallery publishes to:

- 🌟 SHOW publishes the Jr program (`JrProgram` JSON, base64) with a
  `JR · <name>` title prefix and a small XP + achievement reward.
- The showcase panel browses the wall, filters `JR ·` entries, and renders each
  as a **block strip** — the program's icon blocks drawn on a small canvas.
  That's the deterministic, kid-legible "bot screenshot" (no WebGL
  preserveDrawingBuffer games, works headless).
- → TRY IT loads any showcased program into the editor in one tap.

**What stayed a seam:** live presence — teammates' bots roaming the yard in
real time, co-building, cursor ghosts. `src/jr/JrPresence.js` defines the
interface (`connect / subscribe / publish / close`, `isLive`, peer list) with an
offline no-op default. When a Durable Object / WebSocket layer lands, implement
`LivePresence extends JrPresence` and swap the `jrPresence` singleton — one
file, no UI branching (surfaces check `isLive` only for cosmetic badges).

## 8. Acceptance criteria (all verified by `npm test` + `npm run build`)

- All 9 blocks exist with icons; the 5 gated blocks gate on exactly
  motor_driver / led_module / buzzer_module.
- Fresh player sees flag/wait/repeat/stop only; crafting each part unlocks
  exactly its blocks; inventory OR crafted-set both open gates.
- Every codegen row of the §4 table has a test asserting the exact nodes.
- `toTileProgram()` output compiles through the REAL `compile()`; hostile
  inputs (repeat 99, junk options, nested loops) clamp or drop, never throw.
- Firmware export sanity: Arduino `drive(FORWARD`/`turn(LEFT`/`tone(BUZZ_PIN`/
  `stopMotors()` + counted `for` loop; MicroPython `m.drive`/`m.turn`/`beep(`/
  `m.stop()` + `range(n)` loop.
- JSON + share-code round-trips preserve steps and options.

## Don't

- Don't put behaviour in the Jr UI. Blocks map to `T.*` constructors; the VM,
  compiler, and FirmwareGen do everything else. If you write
  `if (block === 'forward') moveRobot()` in JrEditor.js, stop.
- Don't invent Jr-only firmware paths. If a Jr program can't export, the bug is
  in the mapping table, not a reason to fork FirmwareGen.
- Don't raise the caps quietly. The caps ARE the curriculum; changing them is a
  design decision, not a tuning knob.
