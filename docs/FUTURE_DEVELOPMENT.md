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
| Hardware brains, vision, real-hardware export | ⏳ next | `DEV_GUIDE_hardware_brains_and_export.md` |
| Save system (localStorage) | ⏳ planned | `DEV_GUIDE_save_system.md` |
| Block placement | ⏳ planned | `DEV_GUIDE_block_placement.md` |
| Recipe expansion (14 → 45) | ⏳ planned | `src/data/recipes.js`, `src/data/items.js` |
| Functional items (spring boots, go-kart) | ⏳ planned | `src/Player.js`, `src/Game.js` |
| Machine canvas (Incredible-Machine sim) | 🔭 future | `/KILLER_APP.md` |
| In-world circuits (placeable wires, gates) | 🔭 future | `/KILLER_APP.md` |
| CraftMind cross-game progression, teacher dashboard | 🔭 future | `/KILLER_APP.md` |
| Multiplayer, mobile controls | 🔭 future | `/ROADMAP.md` Phase 4-5 |

`npm test` runs the tile-engine suite. `npm run build` bundles the game.

---

## Critical path to the killer-app demo

The fastest line to a jaw-dropping vertical slice:

```
[DONE] Tile engine (src/maker/)
   │
   ▼
1. ScrapBot integration   ──► robot runs tiles in-world          (~1 day)
   │                          DEV_GUIDE_scrapbot_integration.md
   ▼
2. Tile editor UI         ──► kid builds brains by hand          (~1.5 wk)
   │                          DEV_GUIDE_tile_editor.md
   ▼
3. Spark companion        ──► kid builds brains by TALKING       (~1.5 wk)   ★ the moment
   │                          DEV_GUIDE_spark_companion.md
   ▼
4. Export (.ino / Wokwi)  ──► game robot → real hardware         (~1 wk)     ★ the business
                              DEV_GUIDE_hardware_brains_and_export.md
```

Steps 1–4 are fully specified in the dev guides, each with acceptance criteria
and complete code. An agent can pick up any one of them cold.

---

## Phase plan (beyond the critical path)

### Phase 1 — Game fundamentals (parallelizable with the Maker path)

Highest non-Maker ROI. Each item has a dedicated dev guide.

#### 1.1 Save system (`DEV_GUIDE_save_system.md`) — ~1 day

Eliminates the #1 churn reason. localStorage schema v3:

```
player { pos, health, facing }
inventory { [itemId]: count }
crafted string[]
achievements { unlocked[], stats{} }
earl { history[], questState{} }
world { seed, placedBlocks[], minedBlocks[] }
makerBrain TileProgram JSON | null
```

Key files: new `src/SaveSystem.js`, `src/Game.js` (autosave timer), `src/World.js`
(diff tracking), `src/Player.js` + `src/Achievements.js` + `src/Foreman.js`
(expose `toSaveData` / `fromSaveData`).

#### 1.2 Block placement (`DEV_GUIDE_block_placement.md`) — ~3 days

Right-click-to-place with ghost block preview and hotbar selection. The
ITEM_TO_BLOCK map defines what's placeable. Incremental InstancedMesh rebuild
via `renderer.refreshChunk()`.

Makes the Maker Bench station craftable and placeable — the physical entry
point for the tile editor.

#### 1.3 Recipe expansion (14 → 45) — ~1 day

Target: double average session length by adding a crafting progression curve.
Current 14 recipes are all Tier 1/2/3 basics. Add:

| Category | Count | Examples |
|---|---|---|
| Maker Lab brains + modules | 10 | tin_brain, spark_brain, vision_brain, ultrasonic, servo… |
| Functional items | 8 | spring_boots, go_kart, magnetic_boots, grapple_hook… |
| Building blocks | 6 | reinforced_wall, glass_panel, pipe_section, catwalk… |
| Station upgrades | 5 | upgraded_forge, deep_smelter, component_extractor… |
| Utility / consumable | 6 | repair_kit, fuel_canister, signal_flare, goggles… |

Full list to be authored in `src/data/recipes.js` + `src/data/items.js`.
Follow the existing `{ id, result, count, station, tier, unlockAfter, ingredients }` shape.

#### 1.4 Functional items — ~2 days

Items that actively change player physics or movement when equipped:

| Item | Effect | Implementation |
|---|---|---|
| Spring Boots | Jump height × 2.5 | `Player.jump()` — if equipped, set `jumpForce * 2.5` |
| Go-Kart | Movement speed × 3, must stay on ground | `Player.tick()` — speed multiplier; disable vertical look |
| Magnetic Boots | Stick to walls / ceilings | Modify gravity vector based on surface normal |
| Grapple Hook | Fire projectile; player flies toward it | Projectile + spring physics |
| Night Goggles | Ambient light boost for player view | `Renderer.js` — boost directional light intensity |

Each is a `category: 'equipment'` item. Add an `equipped` slot to `Player`
and check it in `tick()`.

---

### Phase 2 — Maker depth

After the critical path is working and Phase 1 is shipped:

#### 2.1 Skill tree / XP system — ~1 week

An in-world skill map visible as physical stations in a hidden area of the
scrapyard. The **Roboticist** branch unlocks:

```
Level 1: Tin Brain (unlock tile editor)
Level 2: Custom tiles (add your own action with a name + body)
Level 3: Tile cracking (edit the generated Arduino code in-game)
Level 4: Firmware export (download + flash badge)
Level 5: Vision Brain (full CV pipeline)
```

XP awarded for: blocks mined, recipes crafted, tiles built, quests completed,
distinct sensor types used, firmware exported.

Skill tree stored as a set of unlocked node IDs in the save system.

#### 2.2 Additional sensor/actuator depth

Phase 2 primitives to add to `primitives.js`:

| Primitive | Category | Platform | Effect |
|---|---|---|---|
| `line_under` | sensor | all | IR floor sensor — line-following |
| `compass` | sensor | esp32 | Heading in degrees (MPU6050) |
| `temperature` | sensor | all | DHT11 — ambient temp 0..1 |
| `color_sensor` | sensor | esp32/jetson | APDS9960 — color detection |
| `speak` | actuator | esp32 | TTS module — robot says a word |
| `servo_angle` | actuator | esp32/jetson | Precise servo position (0..180) |
| `neopixel` | actuator | esp32 | WS2812 RGB strip |

#### 2.3 Multi-bot programs

The VM already supports many independent `MakerRuntime` instances (each runs
its own bytecode + `VirtualRobot`). To spawn multiple bots:

- Add a `BotManager` that holds an array of `{ scrapBot, runtime }` pairs.
- Bots can share a `GameWorldAdapter` (same world) but have independent robots.
- Spark can target a specific bot by name: "make the red bot be the carrier."

The most impressive demo: one bot mines, one carries. Already architecturally
possible; just need the management layer.

---

### Phase 3 — The Incredible-Machine layer

From `/KILLER_APP.md`. The Workbench becomes a 2D physics/circuit canvas:

```
┌─ Machine Canvas ────────────────────────────────────────────┐
│                                                              │
│  [Ball]──►[Ramp]──►[Pulley]──►[Switch]──►[Motor]──►[Door]  │
│                                                              │
│  [ SIMULATE ] — physics runs, does it work?                 │
└──────────────────────────────────────────────────────────────┘
```

Key components:
- **2D rigid-body physics** (Matter.js or Planck.js — lightweight, browser-safe)
- **Part library**: ball, ramp, lever, pulley, spring, fan, conveyor, switch, weight
- **PLAY button moment**: place parts, hit Play, watch the Rube Goldberg run
- **Tile-to-machine bridge**: a tile program can actuate a machine part (the
  robot presses the switch → the lever moves → the ball falls)

The tile VM and the machine canvas share the "simulate then it works" philosophy.
Consider a unified `SimEvent` system that both can fire into.

In-world electricity (Phase 3.5):
- Placeable wire blocks (follow the ITEM_TO_BLOCK pattern from block placement)
- Logic gate blocks: AND, OR, NOT (each has inputs + output)
- Switch block (can be toggled by tile programs or by the player)
- Lamp block (lights up when powered)

This bridges to **craftmind-circuits** — the sibling game where circuits are the
primary mechanic. A Scrapcraft circuit solution can unlock a corresponding puzzle
in craftmind-circuits.

---

### Phase 4 — CraftMind universe + classroom

#### 4.1 Cross-game portal

A physical portal block in the deep scrapyard band connects to other CraftMind
games. What the player has built in Scrapcraft affects what they unlock in sibling
games:

| Scrapcraft accomplishment | Reward in sibling |
|---|---|
| Built + exported a working robot | craftmind-researcher: blueprint analysis unlocked |
| Solved a tile-logic puzzle (10 unique sensor types) | craftmind-circuits: Logic IQ bonus |
| Crafted all three brains | craftmind-ranch: automated feeding system blueprint |
| Completed the fishing-drone quest | craftmind-fishing: sonar upgrade for boat |

The **Discovery Score** is a universal metric across all CraftMind games,
earned by applying knowledge in multiple domains.

Implementation path:
- Shared cross-game API endpoint (or localStorage keyed by student ID)
- `CraftMindBridge.emit(event, data)` in `Game.js` — fires on quest complete,
  brain crafted, firmware exported
- Portal block spawns a modal with "Continue in craftmind-circuits?" if the
  student has a linked account

#### 4.2 Teacher dashboard (`/teacher` route)

A separate React/Svelte page (served from the same Vite project):

```
/teacher
├─ Class view:    [Students] × [Sessions] grid, colour-coded by engagement
├─ Student drill: timeline of events for one student
└─ Standards map: which NGSS/CSTA standards were met by in-game events
```

Events to instrument (fire from game logic, collect in localStorage, sync to
a simple Cloudflare Worker endpoint):

```js
const TEACHER_EVENTS = {
  block_mined:        { standard: 'MS-ETS1-1' },  // define the problem
  first_craft:        { standard: 'MS-ETS1-2' },  // evaluate competing solutions
  tile_built:         { standard: '3A-AP-14' },   // CSTA: create artifacts
  spark_used:         { standard: '3A-AP-13' },   // CSTA: decompose problems
  firmware_exported:  { standard: '3A-CS-01' },   // CSTA: computing systems
  vision_brain_built: { standard: 'MS-PS4-2' },   // wave properties (EM / optics)
};
```

Revenue model: teacher accounts → site license ($4/student/month) →
access to dashboard, class challenge mode, curriculum packs.

---

### Phase 5 — Reach

#### 5.1 Multiplayer co-op (4-player)

- Server-authoritative block changes (Cloudflare Worker + Durable Objects for
  real-time sync)
- Players can see each other's bots running in the same world
- Cooperative build challenges: "4 players, 4 bots, one machine"

#### 5.2 Mobile / touch controls

- Virtual joystick (left thumb: move, right: look)
- Tap-to-mine (hold finger on a block)
- Drag-to-build (swipe to place from hotbar)
- Tile editor adapted for touch: tap to add, long-press to delete

#### 5.3 Blueprint sharing by URL

`TileProgram.toShareCode()` already serialises a robot brain into a URL-safe
string. Generalise this to machines (Phase 3) and full bases (layout + placed
blocks). Shareable URL format:

```
https://scrapcraft.game/play?brain=<code>
https://scrapcraft.game/play?machine=<code>
https://scrapcraft.game/play?base=<code>
```

Social mechanic: "Earl's Scoreboard" highlights the most creative builds
submitted that week (moderated, kid-safe).

---

## Architectural guardrails (keep these true)

1. **The capability schema (`src/maker/primitives.js`) is the single source of
   truth.** New robot capability = one entry there; every layer inherits it.
2. **`compile()` sits between any authoring (human OR AI) and execution.** Never
   run unvalidated tiles. This is the Spark safety rail — do not bypass it.
3. **The engine stays Three.js-free and testable.** Game glue lives in the
   integration layer, not in `src/maker/`. Add a test for every engine change.
4. **Exported firmware must be honest** — it has to actually run on the chip.
   That honesty is the entire game→reality value proposition.
5. **Two AIs, two roles:** Earl sets problems (gruff foreman); Spark helps solve
   them (giddy build buddy). Keep them distinct in voice and function.

---

## For the next agent

- Pick a `⏳` item; open its dev guide; it has context, file targets, complete
  code sketches, and acceptance criteria.
- Run `npm test` before and after engine changes (26/26 must stay green).
- Commit to `claude/scrapyard-crafting-game-ree0bd`; don't open a PR unless asked.
- If a decision is genuinely ambiguous (not covered by a guide), ask — don't
  guess at architecture that the guardrails above already constrain.

### Order of execution (recommended)

```
Day 1:    ScrapBot integration (B key → bot runs)
Week 1-2: Tile editor UI
Week 2-3: Spark companion ← biggest visible impact
Week 3-4: Hardware brains + export ← biggest business impact
Parallel:  Save system (1 day, unblocked)
           Block placement (3 days, unblocked after renderer check)
           Recipe expansion (1 day, pure data)
```
