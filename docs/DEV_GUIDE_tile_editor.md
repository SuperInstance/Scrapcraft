# Dev Guide — The Drag-and-Drop Tile Editor (UI)

**Goal:** a Scratch-style editor where a kid assembles a robot brain from tiles,
hits RUN, and watches it execute on their ScrapBot. This is the visible half of
the Maker Lab; the engine underneath (`src/maker/`) is done and tested.

**Effort:** ~1.5 weeks. The hard logic is already built — this is DOM + drag/drop
+ binding to the engine.

---

## The contract you build against

You are producing/editing a `TileProgram` (see `src/maker/TileProgram.js`). That
is literally the editor's document model. Everything else already works:

```js
import { TileProgram, T, compile, MakerRuntime } from '../maker/index.js';
import { SENSORS, ACTUATORS } from '../maker/index.js';

// the editor's job: let the user build `program.nodes` visually, then:
scrapBot.setBrain(program, world, player, dayNight);   // RUN button
// and for the firmware/export view:
import { toArduino } from '../maker/index.js';  toArduino(program);
```

**Do not invent a parallel data format.** Edit `TileProgram` nodes directly using
the `T.*` constructors. Save = `program.toJSON()`. Load = `TileProgram.fromJSON`.
Share = `program.toShareCode()` → `?brain=<code>`.

---

## Layout (matches the existing dark UI in `index.html`)

```
┌──────────────────────────────────────────────────────────┐
│  MAKER BENCH — "My Robot Brain"        [RUN] [STOP] [</>]  │
├───────────────┬──────────────────────────────────────────┤
│  TILE TRAY    │   PROGRAM CANVAS (vertical stack)         │
│               │                                            │
│  SENSE        │   ┌ forever ───────────────────────────┐  │
│   ◇ brightness│   │  ┌ if  [distance ahead < 0.25] ──┐  │  │
│   ◇ bumped    │   │  │   ▸ beep (high)               │  │  │
│  ACT          │   │  │   ▸ turn (right, 60%)          │  │  │
│   ▸ drive     │   │  │   ▸ wait 0.4s                  │  │  │
│   ▸ turn      │   │  └ else ────────────────────────┘  │  │
│   ▸ beep      │   │     ▸ drive (forward, 60%)         │  │  │
│  CONTROL      │   └────────────────────────────────────┘  │
│   ⟳ repeat    │                                            │
│   ∞ forever   │   [+ drop tiles here]                      │
│   ⑂ if / else │                                            │
│   ⏱ wait      │                                            │
└───────────────┴──────────────────────────────────────────┘
```

- **Tile tray** is generated from `SENSORS` and `ACTUATORS` (don't hardcode the
  list — iterate the registries so new primitives appear automatically). Control
  tiles (repeat/forever/if/if_else/wait/macro) are a fixed small set.
- **Canvas** renders `program.nodes` recursively. Nesting (`body`, `elseBody`)
  renders as an indented drop-zone. Use the same recursion shape as
  `TileProgram.walk()`.

## Tile rendering

Each `action` tile shows the primitive's `label` and a knob per `params` entry,
typed by the schema (`number`→slider, `enum`→dropdown, `bool`→toggle). Use
`coerceParam` (exported indirectly via `withDefaults`) so values stay valid.
**Surface only the params present in the schema** — that's the "expose just the
knobs that matter" principle from the design doc.

Condition tiles (`if`/`if_else`) need a small condition editor:
`[sensor ▾] [cmp ▾] [value]`. Populate `sensor` from `SENSORS`, `cmp` from
`['gt','lt','gte','lte','eq','neq','is']`, and for digital sensors default to
`is true`.

## Drag and drop

Plain HTML5 DnD is fine (the game is desktop-first; mobile is later). On drop:
mutate the `program.nodes` tree at the target path, then re-render. Keep a single
`program` object as state; re-render from it after every edit (immutable-ish:
simplest is mutate + full re-render, the trees are tiny).

Give each node a stable `id` (e.g. `crypto.randomUUID()`) when created — you'll
want it for selection, deletion, and the run-time highlight below.

## RUN / STOP

- **RUN:** `compile(program)` first. If `result.errors.length`, show them inline
  (red banner) — friendly text is already in the error strings. Otherwise
  `scrapBot.setBrain(program, …)` and close/minimize the editor so the kid sees
  the robot move.
- **STOP:** `scrapBot.clearBrain()`.
- **Live highlight (polish):** add a `sourceMap` to the compiler (see
  `src/maker/README.md` → "Editor source-mapping"), then each frame read
  `runtime.vm.pc`, map to a tile `id`, and add a glow class. Kids LOVE watching
  the highlight move through their program — high impact, ~½ day.

## The `</>` (code view) button

Toggle a panel showing `toArduino(program)` and `toMicroPython(program)`
side-by-side, read-only, syntax-tinted. This is the Layer-3 "show me the real
code" feature and the gateway to export (see
`DEV_GUIDE_hardware_brains_and_export.md`).

---

## Acceptance criteria

- Dragging tiles builds a valid `TileProgram`; RUN drives the ScrapBot.
- Invalid programs (e.g. an `if` with no condition) show the compiler's friendly
  error instead of crashing.
- Save/reload round-trips through `toJSON`/`fromJSON` with no loss.
- The code-view shows real firmware that matches what the robot just did.

## Don't

- Don't put behaviour in the editor. The editor only edits data. All execution
  is the engine's job. If you find yourself writing `if (tile.type === 'drive')
  moveRobot()`, stop — that's `primitives.js` + the VM, already done.
