# Scrapcraft — Architecture Deep-Dive

This document covers the data flow, module contracts, and extension points for contributors. It complements `src/maker/README.md` (which covers the Maker Lab engine specifically) and the per-system `DEV_GUIDE_*.md` files.

---

## Module dependency graph

```
index.html
    │
    └── src/Game.js  ← the root; owns and ticks everything
          │
          ├── World.js          voxel data + procedural generation
          ├── Player.js         movement, inventory, collision
          ├── Renderer.js       Three.js scene, instances, lighting
          ├── UI.js             HUD, overlays, toasts, Codex
          ├── AudioSystem.js    Web Audio API synthesis
          ├── ParticleSystem.js 800-particle pool
          ├── DayNight.js       sky/ambient cycle
          ├── XPSystem.js       XP + level milestones
          ├── Achievements.js   stats bag + unlock checks
          ├── SaveSystem.js     localStorage + autosave
          ├── Foreman.js        Earl NPC + quests
          ├── TileEditor.js     visual editor + Spark chat UI
          ├── Spark.js          Claude API + offline fallback
          └── ScrapBot.js       companion robot
                │
                └── src/maker/  ← Three.js-free engine
                      ├── MakerRuntime (index.js)
                      │     ├── TileCompiler  (tree → bytecode)
                      │     ├── TileVM        (bytecode interpreter)
                      │     └── VirtualRobot  (physics + events)
                      ├── FirmwareGen   (bytecode → real firmware)
                      └── GameWorldAdapter  (sensors ← game state)
```

`Game.js` is the only module that imports from most others. Nothing else cross-imports at the top level — this keeps the dependency graph acyclic and testable.

---

## Frame loop

```
Game.tick(dt)
  ├─ world  (no tick — purely data)
  ├─ player.tick(dt, world)        movement, collision, camera
  ├─ dayNight.tick(dt)             sky + ambient light
  ├─ _tickBotTrackSparks(dt)       yellow particles when bot on TRACK
  ├─ _tickLapTimer()               gate detection, time display
  ├─ bot1.tick(dt, world)          follow AI or tile program
  ├─ bot2.tick(dt, world)
  ├─ particles.tick(dt)            advance + recycle pool
  ├─ achievements.tick(dt)         60s recent-craft timer
  ├─ _handleMining(dt)             raycast, progress bar, loot drop
  ├─ renderer.render(world, player, bots, particles)
  └─ ui.update(player, ...)        hotbar, XP bar, HUD text
```

`dt` is clamped to 0.1s so a paused tab or slow frame doesn't cause physics tunneling.

---

## World representation

```
World.blocks  Uint8Array[128 × 128 × 10]
```

Index formula: `x + z * 128 + y * 128 * 128`.

Block 0 is always air. Block IDs 1–18 are defined in `src/data/blocks.js`. IDs > 127 would require widening to `Uint16Array` — avoid until needed.

### Mutable diffs

The world is generated procedurally and never serialized in full. Only player-caused changes are tracked:

```js
world._minedBlocks  = [{ x, y, z }]         // blocks removed by player
world._placedBlocks = [{ x, y, z, id }]     // blocks placed by player
```

`SaveSystem._collect()` saves these two arrays. `_apply()` calls `setBlock()` for each entry to reconstruct the modified world on load.

---

## Renderer

`Renderer.js` maintains one `THREE.InstancedMesh` per block type. On `world.on('change')`:

1. Rebuild the surface block list for the affected column.
2. Call `mesh.setMatrixAt(i, matrix)` for each visible block instance.
3. Call `mesh.instanceMatrix.needsUpdate = true`.

No chunk system, no frustum culling beyond Three.js defaults. This works fine for 128×128 at 10 layers because the total instance count stays under 50k and most blocks are underground or interior.

### PointLight pool for floodlights

Six `THREE.PointLight` objects are pre-created and recycled. When `B.FLOODLIGHT` blocks are placed, the nearest pool light is repositioned and enabled. Pool lights are turned off when no floodlight is in range.

---

## Player physics

`Player.tick(dt)` uses a simple AABB sweep-and-slide:

1. Compute desired velocity from `WASD` + gravity.
2. Project X only → `_collidesBox()` → revert X on hit.
3. Project Z only → `_collidesBox()` → revert Z on hit.
4. Project Y → floor check (4 foot corners) → snap to `gy+1` on landing.
5. Copy `newPos` to `this.pos`.

`PLAYER_R = 0.28` (capsule approximated as box corners), `EYE_HEIGHT = 1.62`, `PLAYER_H = 1.8`.

Camera bob is applied on top of eye position: `sin(bobTime) * 0.038` while moving, with a separate `_landBob = -0.06` squish on landing (lerped out at 12Hz).

---

## ScrapBot integration

`ScrapBot` has two operating modes:

| Mode | Trigger | Behavior |
|---|---|---|
| **Follow** | `B` key | Steers toward player, wall-avoids at 45° |
| **Program** | `_run()` in TileEditor | Hands control to `MakerRuntime.tick(dt)` |

In program mode, `ScrapBot._tickProgram(dt)` calls `this._runtime.tick(dt)` and drains the event queue from `VirtualRobot`:

```js
for (const ev of this._runtime.robot.events) {
  if (ev.kind === 'beep') this._game.audio.spark(ev.freq);
  if (ev.kind === 'led')  this._updateLEDColor(ev.color);
}
this._runtime.robot.events = [];
```

The `VirtualRobot` position is copied to the Three.js mesh each frame.

---

## Achievements system

```
achievements.track(event, data)
    │
    └── updates stats bag
          │
          └── _check() → iterate ACHIEVEMENT_LIST
                │
                └── ach.check(stats) → true → emit('unlock', id)
                      │
                      └── UI shows toast, audio.achievement() plays
```

`check(stats)` is a pure function — no side effects. This means `_check()` can be called after every stat update without concern.

Stats persist via `SaveSystem`. New stats should default to `0` in both `Achievements` constructor and `SaveSystem._apply()`.

---

## Spark AI pipeline

```
User types message in TileEditor chat
    │
    └── Spark.ask(message, inventory)
          │
          ├── [API available] → Claude API (claude-sonnet-4-6)
          │     system prompt: sensors, actuators, node format
          │     tools: [ emit_tiles(program_json) ]
          │     response: tool_use → program JSON
          │
          └── [offline / error] → matchRecipe(message)
                keyword match against 18 SparkOfflineRecipes
                returns TileProgram

    ↓
TileProgram (either path)
    │
    └── compile(program)        ← AI safety rail — always called
          │
          ├── validates all sensors/actuators against primitives.js
          ├── rejects unknown names (AI cannot invent hardware)
          └── returns { ok, bytecode } or { ok: false, error }

    ↓ (if ok)
ScrapBot.setBrain(program)
    └── new MakerRuntime(program, ...)  → compile() called again internally
```

The double `compile()` call (once in TileEditor, once in MakerRuntime constructor) is intentional — belt and suspenders. The second call is cheap and ensures correctness even if `setBrain()` is called from paths other than TileEditor.

---

## Audio system

All sounds are synthesized in real time. No audio files load. This means:

- Zero network requests for audio.
- Works offline.
- No licensing concerns.
- Chromebook / low-memory safe.

Key patterns:

```js
// Oscillator + gain envelope (the most common pattern)
const ctx = this._ctx;
const osc = ctx.createOscillator();
const gain = ctx.createGain();
osc.connect(gain); gain.connect(ctx.destination);
osc.frequency.setValueAtTime(freq, ctx.currentTime);
gain.gain.setValueAtTime(0.3, ctx.currentTime);
gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
osc.start(); osc.stop(ctx.currentTime + duration);
```

AudioContext is created on the first user gesture (pointer lock change) to comply with browser autoplay policy.

---

## Save format (v4)

```js
{
  version: 4,
  player: { pos: {x,y,z}, yaw, pitch, hotbarIndex },
  inventory: [ null | { id, qty }, ... ],   // 36 slots
  xp: number,
  level: number,
  achievements: { unlocked: string[], stats: { ... } },
  quests: { completed: string[], active: string | null },
  world: {
    mined:  [ {x,y,z}, ... ],
    placed: [ {x,y,z,id}, ... ],
  },
  bestLapMs: number | null,
}
```

Version is checked on load. An unknown version clears and reinitializes rather than crashing.

---

## Extension points

### New block

1. `src/data/blocks.js` → add ID and definition.
2. `Renderer.js` → no change needed (auto-discovers new IDs from block definitions).
3. Optionally: `GameWorldAdapter.js` if the block affects a sensor.

### New item

1. `src/data/items.js` → add entry.
2. `src/data/recipes.js` → add recipe(s).
3. `Game.js._useActiveItem()` → handle `G` key behavior if consumable.

### New sensor or actuator

See `src/maker/README.md` — "How to extend". Requires: `primitives.js` entry, `GameWorldAdapter.js` wiring, at least one test.

### New achievement

See main `README.md` — "Adding an achievement". Three files: `Achievements.js`, `Achievements.js` stats bag, `SaveSystem.js`.

### New quest

`Foreman.js`:
1. Add a quest object `{ id, title, desc, goal(game), reward[] }` to `this._quests`.
2. Add to `this._quests` array.
3. Add any event reactions to `this.onEvent` map.
4. Add quip bank lines if desired.

---

## Invariants (never break these)

1. **`compile()` is always called before execution.** Any path that calls `ScrapBot.setBrain()` or `MakerRuntime` constructor must have called `compile()` on the program first.
2. **`src/maker/` is Three.js-free.** No import from `'three'` in any file under `src/maker/`. The test suite would break.
3. **`primitives.js` is the single source of truth for sensors/actuators.** Don't hardcode sensor names in the VM, firmware generator, or compiler — always read from the primitives object.
4. **`dt` is always clamped.** `Game.js` clamps `dt = Math.min(dt, 0.1)` before passing to any subsystem. Do not remove this — it prevents physics tunneling on slow frames.
5. **Test count only goes up.** Adding engine functionality without adding a test is a red flag.
