# Maker Lab — Tile Engine (`src/maker/`)

The hard core of the AI Maker Lab (see `/AI_MAKER_LAB.md`). This module turns a
tree of friendly drag-drop tiles into (a) live robot behaviour inside the game,
and (b) real, flashable Arduino / MicroPython firmware. It is **pure logic with
zero Three.js**, so it runs in a unit test exactly as it runs in the browser.

**Status: built, tested, and green (`npm test` → 26/26).** Everything in this
folder works today. The editor UI, the Spark AI companion, and the in-world
integration are the next pieces — see `/docs/DEV_GUIDE_*.md`.

---

## Data flow

```
   tile tree (TileProgram)         ← editor / Spark AI / saved JSON author this
        │
        │  compile()  ── validates against the capability schema,
        ▼               expands macros, emits jump-resolved bytecode
   bytecode  ───────────────┬───────────────────────────────┐
        │                   │                                │
        ▼                   ▼                                ▼
   TileVM.step(dt)     FirmwareGen.toArduino()        FirmwareGen.toMicroPython()
   drives a            real .ino sketch               real .py
   VirtualRobot        (Layer-3 view + export)        (export to Wokwi/ESP32)
        │
        ▼
   robot pose + events  → integration layer moves the ScrapBot mesh, plays beeps
```

The runtime that ties program + robot + world together is `MakerRuntime`
(`index.js`). The game calls `rt.tick(dt)` each frame.

---

## Files

| File | Role | Touch it to… |
|---|---|---|
| **`primitives.js`** | THE CONTRACT. Sensors + actuators, each with sim behaviour, hardware mapping, and firmware codegen. | add a new sensor/actuator/brain capability |
| `kinematics.js` | Shared motion constants (drive speed, turn rate, sonar range). | tune robot feel |
| `TileProgram.js` | The tile-tree data model + node constructors `T.*` + serialization + examples. | change the program format / add example brains |
| `TileCompiler.js` | tree → bytecode. Validation (AI safety rail) + macro expansion. | add a macro ("intent tile"), change codegen |
| `TileVM.js` | The resumable, non-blocking bytecode interpreter. | change execution semantics (rarely) |
| `VirtualRobot.js` | Pure-logic robot: pose, motors, physics, collision, event sink. | change robot physics |
| `FirmwareGen.js` | tree → Arduino C++ / MicroPython. | improve exported code, add a target language |
| `GameWorldAdapter.js` | Backs sensors with real World + DayNight + player. | wire a new sensor to real game state |
| `index.js` | `MakerRuntime` + public re-exports. | — |
| `__tests__/run-tests.mjs` | 26 framework-free tests. | add a regression test (always do this) |

---

## The three things that make this design work

1. **The capability schema is the single source of truth.** Add one entry to
   `primitives.js` and the compiler validates it, the VM runs it, and the
   firmware generator emits real code for it — for free. Every layer reads the
   same definition, so they can never drift apart.

2. **The compiler is the AI safety rail.** Spark (the AI companion) may only
   emit programs built from primitives in the schema. `compile()` rejects any
   `action`/`sensor` that isn't real hardware. The AI literally cannot invent an
   actuator that doesn't exist — the worst it can do is produce a program that
   fails validation, which we surface, not run.

3. **The VM is a cooperative coroutine, not a blocking interpreter.** It runs
   inside a 60fps loop and never freezes a frame. `wait` is a non-blocking
   timer; `forever` paces itself one iteration per tick (mirroring a real
   `loop()`); counted loops run hot within a tick; a hard step budget catches
   pathological cases. This is the subtle, load-bearing part — read the header
   comment in `TileVM.js` before changing it, and run the tests after.

---

## How to extend

### Add a sensor (e.g. a line-follower)
```js
// primitives.js → SENSORS
line_under: {
  id: 'line_under', category: 'sense', kind: 'digital',
  label: 'on a dark line', blurb: 'true when my floor sensor sees a black line',
  read: (robot, world) => world.lineAt?.(robot.x, robot.z) ?? false,
  hw: { platform:['uno','esp32'], peripheral:'IR reflectance sensor', pin:'A1',
        setup:{ arduino:'pinMode(LINE_PIN, INPUT);', micropython:'line = ADC(Pin(39))' } },
  firmware: { arduino:()=>'digitalRead(LINE_PIN)==LOW', micropython:()=>'(line.read()<500)' },
},
```
Then implement `lineAt()` on `GameWorldAdapter` and add a test. Done — it's now
draggable, runnable, and exportable.

### Add an actuator
Same shape under `ACTUATORS`, with an `exec(robot, params)` that mutates the
robot (use `robot.emit('kind', data)` for non-motion effects the integration
layer renders).

### Add an "intent tile" (Layer-1 macro)
Add a case to `expandMacro()` in `TileCompiler.js` returning an array of honest
primitive nodes. See `turn_angle` / `drive_distance` for the pattern. This is
exactly how a friendly one-tile concept collapses into real timed firmware.

---

## Editor source-mapping (for the UI, not built yet)

The VM exposes `pc` (program counter) and the compiler emits bytecode in source
order. To highlight "the tile running right now," have the compiler also emit a
parallel `sourceMap: [{ pc, nodeId }]` (give each tile a stable `id`). The editor
then maps `vm.pc` → tile → glow. This is noted in
`/docs/DEV_GUIDE_tile_editor.md`; it's a ~20-line compiler addition.

---

## Run it

```bash
npm test            # 26 framework-free tests
npm run build       # confirms the module bundles with the game
```
