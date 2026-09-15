# Scrapcraft — the Fleet connection & the frontier

*A scouting synthesis: where Scrapcraft already sits inside the SuperInstance
fleet, and where the cutting edge leaves it uniquely positioned. Repo and
code claims below were verified against the live GitHub org and this
codebase; forward-looking claims are marked **[aspirational]**.*

---

## 1. Scrapcraft is already a fleet node (verified)

Two dedicated bridge repos exist in `SuperInstance` — this game is not an
island:

- **`scrap-spark`** — Cloudflare Worker for Spark: cached Claude responses +
  shared build gallery. (Matches `cloudflare/` here and `src/Spark.js`.)
- **`scrap-quilt`** — a Scrapcraft × Quilt bridge (TypeScript). *Investigate
  before building anything Quilt-facing — it may already scaffold the path
  below.*

And the game already speaks two of the fleet's core dialects:

- **Quilt** (`SuperInstance/quilt`: "a spreadsheet where every cell is a live,
  addressable capability; the grid is the runtime") — Scrapcraft's
  `src/maker/QuiltSheet.js` + `QuiltView.js` are a **real reactive cell
  graph**: `sensor.distance`, `motor.drive` (value cells), `motor.left =
  drive + turn` (formula cell with `deps`), a "Bot Heart" group — cells that
  flash when they change so a kid *sees causality*. That is the Quilt pattern,
  already shipping. The fleet has **~104 quilt-* repos**, including
  polyformalism ports that run the same cell fabric byte-exact across Go, Rust,
  C++, Julia, J, Verilog, plus `quilt-foundation` (a 5-opcode VM),
  `quilt-agent`, `quilt-swarm`, `quilt-nomad`, and `quilt-mhs` (× Anthropic's
  Model Hardware Standard).
- **A bytecode VM** — `src/maker/TileVM.js` is a small deterministic VM; the
  fleet's FLUX/quilt-foundation VMs are the same idea one layer out.

The **Lucineer** family (~14 repos) is Scrapcraft's mirror in another medium:
`lucineer-system` is "a persistent AI game-building companion — Roblox,
browser, Godot," `lucineer-brain` routes natural language through multiple
models to *generate build commands*, `lucineer-memory` is D1 + Vectorize
recall, and **`Lucineer-Stem-quest`** is literally a "STEM learning quest
framework." Scrapcraft's Spark + Earl + Maker Lab is the same shape, aimed at
embedded engineering instead of Roblox Lua.

> **The one-line frame:** Scrapcraft is the **fleet's teaching sensory-organ** —
> where a human learns to author the tile/cell programs that the rest of the
> fleet runs on real silicon.

---

## 2. The moat — what almost nobody else has (verified against the landscape)

The competitive scout surveyed micro:bit/MakeCode, Tinkercad Circuits, Wokwi,
Scratch/Blockly/Snap!, CodeCombat, Roblox, Minecraft Education, and the AI-tutor
crop. Three things are genuinely **uncontested**:

1. **A game world whose tiles compile to real, flashable firmware.** Minecraft
   Education has a world but no hardware target; Wokwi/Tinkercad have hardware
   sim but no game; block editors stop at a sandbox. Scrapcraft is the only one
   that goes voxel-game → tiles → **real Arduino/MicroPython on a $6 ESP32**.
2. **A deterministic simulation VM.** Perfect, replayable robot behavior is
   rare — and it is the substrate for things the others *structurally cannot
   do* (below).
3. **One browser path: program → sim → flash (WebSerial).** No tool-hopping.

Everything else Scrapcraft does — voxel mining, block-based coding, quests,
game-based learning — is a **crowded commodity**. The strategic rule follows:
*lead with the three above; treat the Minecraft-shell as the thinnest possible
on-ramp.*

---

## 3. Three frontier plays the moat unlocks (near-term, buildable)

Each of these is a thing competitors **can't** copy without a deterministic VM
+ a firmware bridge — i.e. they compound the moat instead of chasing parity.

1. **Reproducible robot competitions.** Deterministic physics ⇒ every kid runs
   the *same* challenge and any solution replays exactly — fair classroom
   tournaments, peer code you can actually re-run. **This already has its
   substrate here:** the Maker-Challenge engine + star ratings (deterministic,
   gradeable, class-comparable) shipped in the open PRs. This is the
   "Midnight Race" made real and social.
2. **AI deterministic debugging.** When a bot overshoots, Spark explains *why*
   from the actual execution trace + physics state ("your turn is `angle ×
   1.0`; the sim shows +12° overshoot — try 0.9"). Text-only AI tutors can't;
   they have no trace. This is undefended pedagogical ground.
3. **Sim ↔ reality replay.** Program in the voxel world → flash to a real
   Arduino → record the real run → replay it *back in the voxel world* against
   the sim ghost. The "Game ≠ Reality" gap becomes the lesson, not a footnote.

---

## 4. The fleet endgame — three tiers **[aspirational, architecture-ready]**

The scout's thesis, de-hyped to what the code actually supports:

- **Today (shipping):** one bot, programmed with tiles, running in-browser or
  flashed to real hardware.
- **Near-term (small bridges, not rewrites):** tile programs persist as
  heritable artifacts (fleet `cocapn` repo-first pattern); Spark gains a
  multi-model dispatch like `lucineer-brain`; the QuiltSheet cell-fabric is the
  natural wire format between two bots.
- **Endgame [aspirational]:** a classroom of Scrapcraft-programmed **real**
  robots, their live state exposed as a Quilt sheet, coordinated the way
  `quilt-swarm`/`quilt-nomad` coordinate a cluster — "edit a cell, the swarm
  reconfigures." The wiring (Quilt cell fabric, MHS via `quilt-mhs`, edge
  compute for the Jetson "Vision Brain") exists as fleet repos; the missing
  work is **integration threads, not new architecture.**

Worldbuilding hook: the in-fiction "fleet," the Ghost, and the Midnight Race
already gesture at this. Make the narrative honest to it — *the yard is where
you earn your way from one bot to commanding a fleet.* The game's story and the
platform's roadmap become the same arc.

---

## 5. Risks the frontier carries (verified, must-track)

- **WebSerial is Chrome/Edge-only** (Safari unsupported; Firefox experimental).
  The "flash to real hardware" climax is gated to some browsers — the sim +
  Wokwi path must stay a first-class, equally-celebrated fallback so no kid is
  stranded.
- **LEGO Education "Computer Science & AI" ships June 2026** (SPIKE Prime's
  successor). If it adds a game layer + visual→Python, the commodity parts get
  squeezed. Defense = the moat in §2, not feature parity.
- **Fleet claims are young repos.** Many quilt-*/lucineer-* repos are days-to-
  weeks old and lightly tested. Treat the endgame as a real direction, but
  verify each bridge repo before depending on it (start with `scrap-quilt`).

---

## 6. Concrete next bridges (small, high-leverage)

1. **Read `scrap-quilt`** and either adopt or document it — it's the one repo
   named for exactly this seam.
2. **Ship the deterministic competition** (frontier play #1) on top of the
   Maker-Challenge/star engine already in review — the single highest-leverage
   move, because it turns the moat into a social loop.
3. **Prototype AI deterministic debugging** (#2): feed Spark the VM trace +
   physics state on a failed challenge; it already has the challenge verdict +
   metrics to explain from.
4. **Keep the on-ramp thin:** first "program → bot does something surprising"
   in under three minutes; mining stays garnish.

---

*Sources: SuperInstance GitHub org (lucineer-\*, quilt-\*, scrap-spark,
scrap-quilt — verified present); this repo's `src/maker/QuiltSheet.js`,
`TileVM.js`, `FirmwareGen.js`; and two scouting passes (fleet + competitive
landscape). Forward-looking integration and market claims are directional —
verify each dependency before building on it.*
