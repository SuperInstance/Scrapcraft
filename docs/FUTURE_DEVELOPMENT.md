# SCRAPCRAFT — Master Development Plan

The single index for where the project is and where it's going. Start here.
Read the linked docs for depth. **Develop on branch
`claude/scrapyard-crafting-game-ree0bd`.**

---

## The vision in one line

A voxel scrapyard where clever middle-schoolers build robots and machines that
*actually work* — programmed by talking to an AI buddy and dragging tiles — and
learn real engineering, electronics, and CS (right down to flashable ESP32 code)
without ever feeling taught. The engineering hub of the CraftMind STEM universe.

Design docs, in order of altitude:
- `/ROADMAP.md` — competitive analysis & feature roadmap (game-design layer)
- `/KILLER_APP.md` — machine simulation, circuits, CraftMind integration, classroom
- `/AI_MAKER_LAB.md` — the embedded-systems + conversational-tile vision (the core bet)
- `/docs/DEV_GUIDE_*.md` — buildable, handoff-ready implementation guides

---

## Status board

| Layer | Status | Where |
|---|---|---|
| Voxel world, mining, crafting, day/night, particles, audio | ✅ shipped | `src/` |
| 4 parallel level bands, hold-to-mine, UX polish | ✅ shipped | `src/World.js`, `src/Game.js` |
| Big Earl AI foreman (Claude + offline) + quests | ✅ shipped | `src/Foreman.js` |
| **Tile engine: schema, compiler, VM, robot, firmware gen** | ✅ **built + tested (26/26)** | `src/maker/` |
| ScrapBot ↔ tile-engine integration | ⏳ next | `DEV_GUIDE_scrapbot_integration.md` |
| Drag-drop tile editor UI | ⏳ next | `DEV_GUIDE_tile_editor.md` |
| **Spark — AI build companion** | ⏳ next (the killer feature) | `DEV_GUIDE_spark_companion.md` |
| Hardware brains, vision, real-hardware export | ⏳ planned | `DEV_GUIDE_hardware_brains_and_export.md` |
| Save system, block placement, recipe expansion | ⏳ planned | `/ROADMAP.md` Phase 1 |
| Machine canvas (Incredible-Machine sim), in-world circuits | 🔭 future | `/KILLER_APP.md` |
| CraftMind cross-game progression, teacher dashboard | 🔭 future | `/KILLER_APP.md` |
| Multiplayer, mobile controls | 🔭 future | `/ROADMAP.md` Phase 4 |

`npm test` runs the tile-engine suite. `npm run build` bundles the game.

---

## Critical path to the killer-app demo

The fastest line to a jaw-dropping vertical slice ("I told a robot what to do in
plain English and it did it, then I exported it to a real chip"):

```
[DONE] Tile engine (src/maker/)
   │
   ▼
1. ScrapBot integration   ──► robot runs tiles in-world          (~1 day)
   │
   ▼
2. Tile editor UI         ──► kid builds brains by hand          (~1.5 wk)
   │
   ▼
3. Spark companion        ──► kid builds brains by TALKING       (~1.5 wk)   ★ the moment
   │
   ▼
4. Export (.ino / Wokwi)  ──► game robot → real hardware         (~1 wk)     ★ the business
```

Steps 1–4 are fully specified in the dev guides, each with acceptance criteria.
An agent can pick up any one of them cold.

---

## Phase plan (beyond the critical path)

### Phase 1 — Game fundamentals (parallelizable with the above)
From `/ROADMAP.md`. Highest non-Maker ROI:
1. **Save system** (localStorage) — eliminates the #1 churn reason. ~1 day.
2. **Block placement** — unlocks the building half of the voxel loop. ~3 days.
3. **Recipe expansion** 14 → 45 — doubles session length. ~1 day.
4. **Functional items** — spring boots bounce, go-kart drives. ~2 days.

### Phase 2 — Maker depth
- Skill tree with a **Roboticist** branch (unlock custom-tile authoring →
  tile-cracking → firmware view), per `/ROADMAP.md` 2.1 + `/AI_MAKER_LAB.md`.
- More sensors/actuators (line follower, color sensor, distance servo sweep).
- More macros / intent tiles (patrol, follow, search-pattern).
- Multi-bot programs (one mines, one carries) — the VM already supports many
  independent `MakerRuntime`s; just spawn more.

### Phase 3 — The Incredible-Machine layer
From `/KILLER_APP.md`: the Workbench becomes a 2D physics/circuit canvas (gears,
levers, pulleys, wires, logic gates). The tile VM and the machine canvas share
the same "simulate then it works" philosophy; consider unifying their runtimes
later. In-world electricity (placeable wires, AND/OR/NOT gates, switches, lamps)
bridges to **craftmind-circuits**.

### Phase 4 — CraftMind universe + classroom
- Cross-game portal + shared Discovery Score (ranch/fishing/circuits/researcher).
- **Teacher dashboard** (`/teacher`): session reports auto-tagged to NGSS / CSTA
  standards from in-game events (tiles written, circuits solved, machines built).
- Curriculum packs; class challenge mode.
- This is the revenue layer (game-based learning market $17B→$95B by 2033).

### Phase 5 — Reach
- Multiplayer co-op (4-player, server-authoritative blocks).
- Mobile/touch controls (virtual joystick, tap-to-mine).
- Build/blueprint sharing by URL (the engine already serializes via
  `TileProgram.toShareCode()`; generalize to machines + bases).

---

## Architectural guardrails (keep these true)

1. **The capability schema (`src/maker/primitives.js`) is the single source of
   truth.** New robot capability = one entry there; every layer inherits it.
2. **`compile()` sits between any authoring (human OR AI) and execution.** Never
   run unvalidated tiles. This is the Spark safety rail — do not bypass it.
3. **The engine stays Three.js-free and testable.** Game glue lives in the
   integration layer, not in `src/maker/`. Add a test for every engine change
   (`src/maker/__tests__/run-tests.mjs`).
4. **Exported firmware must be honest** — it has to actually run on the chip.
   That honesty is the entire game→reality value proposition.
5. **Two AIs, two roles:** Earl sets problems (gruff foreman); Spark helps solve
   them (giddy build buddy). Keep them distinct in voice and function.

---

## For the next agent

- Pick a `⏳` item; open its dev guide; it has context, file targets, code
  sketches, and acceptance criteria.
- Run `npm test` before and after engine changes.
- Commit to `claude/scrapyard-crafting-game-ree0bd`; don't open a PR unless asked.
- If a decision is genuinely ambiguous (not covered by a guide), ask — don't
  guess at architecture that the guardrails above already constrain.
