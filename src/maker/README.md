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
   tile tree (TileProgram)
        │
        │  TileCompiler.compile()
        │   • validates against capability schema
        │   • expands macros (intent tiles → honest primitives)
        │   • emits jump-resolved flat bytecode
        ▼
   bytecode ───────────────┬────────────────────────────────┐
                           │                                │
                    TileVM.step(dt)                FirmwareGen.toArduino()
                    (one game frame)               FirmwareGen.toMicroPython()
                    drives VirtualRobot            real .ino / .py
                           │
                    VirtualRobot.tick(dt)
                    applies physics + collision
                           │
               robot pose (x, z, heading)   robot events (beep, led, grab)
                  copied to Three.js mesh      played as audio / particles
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

**1. The capability schema is the single source of truth.**
Add one entry to `primitives.js` and the compiler validates it, the VM runs it,
and the firmware generator emits real code for it — for free. Every layer reads
the same definition, so they can never drift apart.

**2. The compiler is the AI safety rail.**
Spark (the AI companion) may only emit programs built from primitives in the
schema. `compile()` rejects any `action`/`sensor` that isn't real hardware. The
AI literally cannot invent an actuator that doesn't exist — the worst it can do
is produce a program that fails validation, which we surface, not run.

**3. The VM is a cooperative coroutine, not a blocking interpreter.**
It runs inside a 60fps loop and never freezes a frame.
- `wait` is a non-blocking countdown timer; `step()` returns immediately.
- `forever` paces itself — one iteration per game tick, mirroring real Arduino
  `loop()` (one call per scheduler slot).
- Counted `repeat` loops run hot within a tick (like a real `for` loop inside
  `loop()`). A 3-iteration repeat fires 3 beeps in one frame.
- A hard step budget (4096) catches pathological cases.

This is the subtle, load-bearing invariant. Read the header comment in
`TileVM.js` before changing it and run the tests after.

---

## How to extend

### Add a sensor (e.g. a line-follower)

```js
// primitives.js → SENSORS
line_under: {
  id: 'line_under',
  category: 'sense',
  kind: 'digital',
  label: 'on a dark line',
  blurb: 'true when my floor sensor sees a black line',
  read: (robot, world) => world.lineAt?.(robot.x, robot.z) ?? false,
  hw: {
    platform: ['uno', 'esp32'],
    peripheral: 'IR reflectance sensor (TCRT5000)',
    pin: 'A1',
    setup: {
      arduino: 'pinMode(LINE_PIN, INPUT);',
      micropython: 'line = ADC(Pin(39))',
    },
  },
  firmware: {
    arduino: () => '(analogRead(LINE_PIN) < 500)',
    micropython: () => '(line.read() < 2000)',
  },
},
```

Then implement `world.lineAt(x, z)` in `GameWorldAdapter.js` (return `true`
when the floor tile under the robot is a dark-coloured block). Add a test
in `run-tests.mjs`. Done — the sensor is now draggable, runnable, and exportable.

### Add an actuator

Same shape under `ACTUATORS`. Key fields:

```js
exec: (robot, params) => {
  // Motion: robot.setDrive(v) or robot.setTurn(v)  (−1..+1, persistent)
  // Non-motion: robot.emit('kind', { ...data })    (event sink, drained by integration)
  robot.gripping = (params.state === 'close');
},
```

`robot.emit()` events are drained by `ScrapBot._handleEffect()` in the integration
layer. Supported event kinds: `'beep'`, `'led'`, `'grab'`. Add new event kinds
by handling them there.

### Add an intent tile (Layer-1 macro)

Add a `case` to `expandMacro()` in `TileCompiler.js` returning an array of honest
primitive `TileProgram` nodes. See `turn_angle` / `drive_distance` for the pattern:

```js
case 'spin_360': {
  const speed = 0.6;
  const seconds = 360 / (TURN_RATE * speed);
  return [
    { type: 'action', prim: 'turn', params: withDefaults('turn', { dir: 'right', speed }) },
    { type: 'wait', seconds },
    { type: 'action', prim: 'turn', params: withDefaults('turn', { dir: 'right', speed: 0 }) },
  ];
}
```

The `FirmwareGen` walks the same expanded tree, so the exported sketch is honest.

### Add a new firmware target (e.g. CircuitPython)

1. Add a `circuitpython` key to each primitive's `firmware` field.
2. Add `toCircuitPython(program)` in `FirmwareGen.js`, mirroring `toMicroPython`.
3. Add it to the code-view panel in the tile editor.

---

## Bytecode reference

Emitted by `TileCompiler.compile()`, consumed by `TileVM.step()`.

| Op | Operands | Stack effect | Notes |
|---|---|---|---|
| `CONST` | `value` | `→ value` | Push a literal |
| `SENSE` | `sensor` | `→ reading` | Call `def.read(robot, world)` |
| `CMP` | `cmp` | `a, b → bool` | `a cmp b` → 0 or 1 |
| `NOT` | — | `a → !a` | 0↔1 invert |
| `JZ` | `target` | `a →` | Jump to `target` if top of stack is 0 |
| `JMP` | `target` | — | Unconditional jump |
| `ACT` | `action, params` | — | Call `def.exec(robot, params)` |
| `WAIT` | `seconds` | — | Set `waitRemaining`, yield tick |
| `LOOP` | `count, forever, end` | — | Push loop frame; skip body if count=0 |
| `NEXT` | `head` | — | Counted: decrement + jump back. Forever: jump back + yield |
| `HALT` | — | — | Cut motors; stop program |

---

## Editor source-mapping (live tile highlight)

To glow the tile that's currently executing:

**Step 1** — add a parallel `sourceMap` to compile output (20 lines in compiler):

```js
// TileCompiler.js — in ctx:
ctx.sourceMap = [];

// When emitting instructions for a user-authored node, before pushing to ctx.out:
ctx.sourceMap.push({ pc: ctx.out.length, nodeId: node.id ?? null });
```

Return `sourceMap` alongside `bytecode`.

**Step 2** — store on `MakerRuntime`:

```js
this.sourceMap = result.sourceMap ?? [];
```

**Step 3** — poll from the editor's animation loop:

```js
const pc = runtime.vm.pc;
const entry = runtime.sourceMap.find(e => e.pc === pc);
document.querySelector(`[data-node-id="${entry?.nodeId}"]`)?.classList.toggle('te-node-active', true);
```

Full implementation in `DEV_GUIDE_tile_editor.md` → "Live highlight".

---

## Testing guide

### Run

```bash
npm test    # framework-free; plain Node.js; no build step required
```

### Test coverage

```
Compiler:          6 tests — compile, HALT, AI safety rail (×2), macro expansion (×2)
VM wait:           2 tests — WAIT timer; HALT cuts motors
VM forever:        2 tests — one pass per tick; never halts
VM counted loop:   2 tests — 3 beeps in one tick; halts cleanly
VM conditionals:   3 tests — clear path / wall path / digital sensor
VirtualRobot:      3 tests — drive distance, turn angle, wall collision
End-to-end:        2 tests — wall-avoider stays shy of walls; turns
FirmwareGen:       6 tests — Arduino loop / helpers / motor call / pin defines; MicroPython while / brightness
TOTAL:            26/26
```

### Adding a test

```js
// __tests__/run-tests.mjs — add at the bottom of any section:
{
  const prog = new TileProgram({ brain: 'tin', nodes: [T.macro('spin_360')] });
  const result = compile(prog);
  assert(result.ok, 'spin_360 macro compiles');
  const rt = new MakerRuntime(prog, { x: 5, z: 5, heading: 0 }, mockWorld());
  for (let i = 0; i < 100; i++) rt.tick(0.016);
  assertClose(rt.robot.heading % (2 * Math.PI), 0, 0.15, 'spin_360 completes full rotation');
}
```

### Troubleshooting

**`forever executes exactly one pass per tick` fails:**
`TileVM.js` → `NEXT` instruction's `forever` branch must set `this._yield = true`
after jumping back to `head`. Without that, the loop runs until budget exhaustion.

**`wall-avoider stays > 0.1 blocks from wall` fails:**
`VirtualRobot.tick()` → heading-to-velocity decomposition must use
`Math.sin(heading)` for X and `Math.cos(heading)` for Z (Three.js Y-up,
Z-forward convention). A sign flip sends the robot into walls.

**`Arduino output has correct pin constants` fails:**
`FirmwareGen.collectPins()` parses `NAME=NUMBER` fragments from `hw.pin` / `hw.pins`.
Verify the primitive uses exactly that format (e.g. `'TRIG_PIN=5, ECHO_PIN=18'`),
not `'TRIG=5'` (which would produce `TRIG`, not `TRIG_PIN`).

---

## Architectural guardrails (never break these)

1. **`primitives.js` is the single source of truth.** New capability = one entry
   there. Never hardcode sensor/actuator names anywhere else.
2. **`compile()` is always called before execution.** Spark, the editor, the save
   system — all hand programs to `MakerRuntime` which calls `compile()` in its
   constructor. Raw AI tool output or saved JSON never runs directly.
3. **This folder is Three.js-free.** Keep all game/render references in the
   integration layer (`ScrapBot.js`, `GameWorldAdapter.js`). This allows the test
   suite to run headlessly with zero DOM setup.
4. **Exported firmware must be honest.** If the VM does something, the firmware
   does the same thing. Walk the same tile tree in both. Never shortcut one path.
5. **Add a test for every engine change.** The test count should only ever go up.

---

## Run it

```bash
npm test            # 26 framework-free tests
npm run build       # confirms the module bundles with the game
npm run dev         # dev server; press B in-game to test with EXAMPLE_WALL_AVOIDER
```
