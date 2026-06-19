# Dev Guide — The Drag-and-Drop Tile Editor (UI)

**Goal:** a Scratch-style editor where a kid assembles a robot brain from tiles,
hits RUN, and watches it execute on their ScrapBot in the 3D world. This is the
visible half of the Maker Lab; the engine underneath (`src/maker/`) is done and
tested.

**Effort:** ~1.5 weeks. The hard logic is already built — this is DOM + drag/drop
+ binding to the engine.

---

## The contract you build against

The editor's only job is to produce/mutate a `TileProgram`. The engine does
everything else:

```js
import { TileProgram, T, compile, MakerRuntime } from '../maker/index.js';
import { SENSORS, ACTUATORS } from '../maker/index.js';
import { toArduino, toMicroPython } from '../maker/index.js';

// RUN button:
const result = compile(program);
if (result.ok) scrapBot.setBrain(program, world, player, dayNight);
else showErrors(result.errors);

// STOP button:
scrapBot.clearBrain();

// Save:
localStorage.setItem('brain', program.toJSON());

// Load:
const program = TileProgram.fromJSON(JSON.parse(localStorage.getItem('brain')));

// Share by URL:
location.hash = '#brain=' + program.toShareCode();

// Code view:
toArduino(program);    // → real Arduino C++
toMicroPython(program); // → real MicroPython
```

**Never build a parallel data format.** Edit `TileProgram.nodes` using `T.*`
constructors. The engine serializes, validates, and executes the same object.

---

## File targets

| File | Action |
|---|---|
| `src/ui/TileEditor.js` | Create — the editor component (state + rendering + DnD) |
| `src/ui/TileRenderer.js` | Create — recursive tile-to-DOM renderer |
| `src/ui/TileEditor.css` | Create — dark scrapyard aesthetic |
| `src/Game.js` | Wire: open editor from Maker Bench station |
| `index.html` | Add `<div id="tile-editor">` overlay |

---

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  MAKER BENCH — "My Robot Brain"        [RUN] [STOP] [</>] [✕]   │
├───────────────┬──────────────────────────────────────────────────┤
│  TILE TRAY    │   PROGRAM CANVAS (vertical stack)                 │
│               │                                                    │
│  ─ SENSE ─    │   ┌ forever ──────────────────────────────────┐   │
│   ◇ brightness│   │  ┌ if  [distance ahead < 0.25] ─────────┐ │   │
│   ◇ dist ahead│   │  │   ▸ beep  [high]                      │ │   │
│   ◇ bumped    │   │  │   ▸ turn  [right] [60%]               │ │   │
│   ◇ is dark   │   │  │   ⏱ wait  [0.40 s]                    │ │   │
│   ◇ player nr │   │  └ else ──────────────────────────────────┘ │   │
│               │   │     ▸ drive [forward] [60%]                  │   │
│  ─ ACT ─      │   └──────────────────────────────────────────────┘   │
│   ▸ drive     │                                                    │
│   ▸ turn      │   [ + drop a tile here ]                           │
│   ▸ stop      │                                                    │
│   ▸ beep      │                                                    │
│   ▸ set light │                                                    │
│   ▸ arm       │                                                    │
│               │                                                    │
│  ─ CONTROL ─  │                                                    │
│   ⟳ repeat    │                                                    │
│   ∞ forever   │                                                    │
│   ⑂ if / else │                                                    │
│   ⏱ wait      │                                                    │
│   ◈ turn 90°  │                                                    │
│   ◈ drive N m │                                                    │
└───────────────┴────────────────────────────────────────────────────┘
```

---

## HTML structure

Add to `index.html` (hidden by default):

```html
<div id="tile-editor" class="panel hidden" role="dialog" aria-label="Maker Bench">
  <div class="te-header">
    <span class="te-title">MAKER BENCH — <input class="te-name" type="text" value="My Robot Brain" /></span>
    <div class="te-controls">
      <button id="te-run"  class="btn-primary">▶ RUN</button>
      <button id="te-stop" class="btn-danger" disabled>■ STOP</button>
      <button id="te-code" class="btn-secondary">&lt;/&gt;</button>
      <button id="te-close" class="btn-icon">✕</button>
    </div>
  </div>
  <div class="te-body">
    <div id="te-tray" class="te-tray"></div>
    <div id="te-canvas" class="te-canvas">
      <div id="te-nodes" class="te-node-list"></div>
      <div class="te-drop-hint">drag tiles here to build your brain</div>
    </div>
  </div>
  <div id="te-code-view" class="te-code-view hidden">
    <div class="te-code-tab">Arduino (.ino)</div>
    <pre id="te-arduino" class="te-code-pre"></pre>
    <div class="te-code-tab">MicroPython (.py)</div>
    <pre id="te-micropython" class="te-code-pre"></pre>
    <div class="te-code-actions">
      <button id="te-dl-ino">⬇ Download .ino</button>
      <button id="te-dl-py">⬇ Download .py</button>
    </div>
  </div>
  <div id="te-errors" class="te-errors hidden"></div>
</div>
```

---

## TileEditor.js — skeleton

```js
import { TileProgram, T, compile } from '../maker/index.js';
import { SENSORS, ACTUATORS } from '../maker/index.js';
import { toArduino, toMicroPython } from '../maker/index.js';

export class TileEditor {
  constructor(game) {
    this._game    = game;                  // for setBrain / clearBrain
    this._program = new TileProgram({ name: 'My Robot Brain', brain: 'tin' });
    this._open    = false;
    this._codeView = false;
    this._bindDOM();
    this._buildTray();
    this._render();
  }

  open()  { this._open = true;  document.getElementById('tile-editor').classList.remove('hidden'); }
  close() { this._open = false; document.getElementById('tile-editor').classList.add('hidden'); }

  /** Called by the Tile Tray when a new tile type is dropped onto the canvas. */
  addNode(tileSpec, targetPath = null) {
    const node = this._buildNode(tileSpec);
    if (targetPath) {
      insertAt(this._program.nodes, targetPath, node);
    } else {
      this._program.nodes.push(node);
    }
    this._render();
  }

  _buildNode(spec) {
    switch (spec.kind) {
      case 'action':  return T.action(spec.prim);
      case 'wait':    return T.wait(0.5);
      case 'repeat':  return T.repeat(3, []);
      case 'forever': return T.forever([]);
      case 'if':      return T.if(T.cond('distance_ahead', 'lt', 0.25), []);
      case 'if_else': return T.ifElse(T.cond('distance_ahead', 'lt', 0.25), [], []);
      case 'macro_turn': return T.macro('turn_angle', { dir: 'right', degrees: 90 });
      case 'macro_drive': return T.macro('drive_distance', { dir: 'forward', blocks: 1 });
      default: return T.wait(0);
    }
  }
}
```

---

## Building the tile tray

Generate the tray from the live registries — never hardcode the list. When a new
primitive is added to `primitives.js`, it appears automatically.

```js
_buildTray() {
  const tray = document.getElementById('te-tray');
  tray.innerHTML = '';

  // SENSE section
  tray.appendChild(this._section('SENSE'));
  for (const [id, def] of Object.entries(SENSORS)) {
    tray.appendChild(this._trayTile({ kind: 'sensor', id, label: def.label }));
  }

  // ACT section
  tray.appendChild(this._section('ACT'));
  for (const [id, def] of Object.entries(ACTUATORS)) {
    tray.appendChild(this._trayTile({ kind: 'action', prim: id, label: def.label }));
  }

  // CONTROL section (fixed set)
  tray.appendChild(this._section('CONTROL'));
  const controls = [
    { kind: 'repeat',     label: '⟳ repeat' },
    { kind: 'forever',    label: '∞ forever' },
    { kind: 'if',         label: '⑂ if' },
    { kind: 'if_else',    label: '⑂ if / else' },
    { kind: 'wait',       label: '⏱ wait' },
    { kind: 'macro_turn', label: '◈ turn 90°' },
    { kind: 'macro_drive',label: '◈ drive N m' },
  ];
  for (const c of controls) tray.appendChild(this._trayTile(c));
}

_trayTile(spec) {
  const el = document.createElement('div');
  el.className = 'te-tray-tile';
  el.textContent = spec.label;
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/tile-spec', JSON.stringify(spec));
    e.dataTransfer.effectAllowed = 'copy';
  });
  return el;
}

_section(label) {
  const el = document.createElement('div');
  el.className = 'te-tray-section';
  el.textContent = label;
  return el;
}
```

---

## Rendering program nodes (TileRenderer.js)

The canvas re-renders from scratch after every mutation. Trees are small (< 200
nodes in any real program), so a full re-render is fine and keeps state simple.

```js
// src/ui/TileRenderer.js
export function renderNodes(nodes, container, onMutate, depth = 0) {
  container.innerHTML = '';
  if (!nodes.length) {
    const hint = document.createElement('div');
    hint.className = 'te-drop-zone';
    hint.textContent = '+ drop here';
    wireDropZone(hint, nodes, 0, onMutate);
    container.appendChild(hint);
    return;
  }
  for (let i = 0; i < nodes.length; i++) {
    // Blank drop zone BEFORE each tile
    const dz = dropZone(nodes, i, onMutate);
    container.appendChild(dz);
    // The tile itself
    const el = renderNode(nodes[i], onMutate, depth);
    container.appendChild(el);
  }
  // Trailing drop zone
  container.appendChild(dropZone(nodes, nodes.length, onMutate));
}

function renderNode(node, onMutate, depth) {
  const el = document.createElement('div');
  el.className = `te-node te-node-${node.type}`;
  el.style.marginLeft = `${depth * 16}px`;
  el.dataset.nodeId = node.id;         // stable id for live highlight

  switch (node.type) {
    case 'action':
      el.appendChild(renderAction(node, onMutate));
      break;

    case 'wait':
      el.innerHTML = `⏱ wait `;
      el.appendChild(numberInput(node, 'seconds', 0.1, 30, 0.1, onMutate));
      el.appendChild(text(' s'));
      break;

    case 'repeat':
      el.innerHTML = `⟳ repeat `;
      el.appendChild(numberInput(node, 'count', 1, 99, 1, onMutate));
      el.appendChild(text(' times'));
      el.appendChild(renderBody(node.body, onMutate, depth + 1));
      break;

    case 'forever':
      el.innerHTML = '∞ forever';
      el.appendChild(renderBody(node.body, onMutate, depth + 1));
      break;

    case 'if':
      el.appendChild(text('⑂ if '));
      el.appendChild(renderCondition(node, onMutate));
      el.appendChild(renderBody(node.body, onMutate, depth + 1));
      break;

    case 'if_else':
      el.appendChild(text('⑂ if '));
      el.appendChild(renderCondition(node, onMutate));
      el.appendChild(renderBody(node.body, onMutate, depth + 1));
      el.appendChild(labelDiv('else'));
      el.appendChild(renderBody(node.elseBody, onMutate, depth + 1));
      break;

    case 'macro':
      el.appendChild(renderMacro(node, onMutate));
      break;
  }

  // Delete button
  const del = document.createElement('button');
  del.className = 'te-node-delete';
  del.textContent = '✕';
  del.addEventListener('click', () => {
    removeNode(node.id, onMutate);   // find + splice from tree
  });
  el.appendChild(del);

  return el;
}
```

### Rendering an `action` tile

Shows the actuator label + one knob per param from the schema.

```js
function renderAction(node, onMutate) {
  const def = ACTUATORS[node.prim];
  const wrap = document.createElement('span');
  wrap.innerHTML = `▸ ${def?.label ?? node.prim} `;
  for (const [key, schema] of Object.entries(def?.params ?? {})) {
    wrap.appendChild(renderParam(node, key, schema, onMutate));
    wrap.appendChild(text(' '));
  }
  return wrap;
}

function renderParam(node, key, schema, onMutate) {
  if (schema.type === 'enum') {
    const sel = document.createElement('select');
    sel.className = 'te-param-enum';
    for (const v of schema.values) {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      if (node.params[key] === v) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      node.params[key] = sel.value;
      onMutate();
    });
    return sel;
  }
  if (schema.type === 'number') {
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.className = 'te-param-number';
    inp.min = schema.min ?? 0; inp.max = schema.max ?? 1; inp.step = schema.step ?? 0.05;
    inp.value = node.params[key] ?? schema.default ?? 0;
    const lbl = document.createElement('span');
    lbl.className = 'te-param-value';
    lbl.textContent = Number(inp.value).toFixed(2);
    inp.addEventListener('input', () => {
      node.params[key] = Number(inp.value);
      lbl.textContent = Number(inp.value).toFixed(2);
      onMutate();
    });
    const wrap = document.createElement('span');
    wrap.appendChild(inp); wrap.appendChild(lbl);
    return wrap;
  }
  if (schema.type === 'bool') {
    const inp = document.createElement('input');
    inp.type = 'checkbox'; inp.checked = !!node.params[key];
    inp.addEventListener('change', () => { node.params[key] = inp.checked; onMutate(); });
    return inp;
  }
  return text('');
}
```

### Rendering a condition (`if` / `if_else`)

```js
function renderCondition(node, onMutate) {
  const wrap = document.createElement('span');
  wrap.className = 'te-cond';

  // Sensor dropdown (populated from SENSORS registry)
  const sensorSel = document.createElement('select');
  sensorSel.className = 'te-cond-sensor';
  for (const [id, def] of Object.entries(SENSORS)) {
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = def.label;
    if (node.cond?.sensor === id) opt.selected = true;
    sensorSel.appendChild(opt);
  }

  // Comparator dropdown
  const CMPS = ['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'is'];
  const cmpSel = document.createElement('select');
  cmpSel.className = 'te-cond-cmp';
  for (const c of CMPS) {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    if (node.cond?.cmp === c) opt.selected = true;
    cmpSel.appendChild(opt);
  }

  // Value input
  const valInp = document.createElement('input');
  valInp.type = 'text';
  valInp.className = 'te-cond-value';
  valInp.value = node.cond?.value ?? 0;

  const update = () => {
    node.cond = T.cond(sensorSel.value, cmpSel.value, isNaN(valInp.value) ? valInp.value : Number(valInp.value));
    onMutate();
  };
  sensorSel.addEventListener('change', update);
  cmpSel.addEventListener('change', update);
  valInp.addEventListener('input', update);

  wrap.appendChild(sensorSel); wrap.appendChild(cmpSel); wrap.appendChild(valInp);
  return wrap;
}
```

---

## Drag and drop

Plain HTML5 DnD (the game is desktop-first; mobile touch is Phase 5).

Each `te-drop-zone` div inside the canvas handles the drop target:

```js
function wireDropZone(el, targetArray, insertIdx, onMutate) {
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    el.classList.add('te-drop-active');
  });
  el.addEventListener('dragleave', () => el.classList.remove('te-drop-active'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('te-drop-active');
    const raw = e.dataTransfer.getData('text/tile-spec');
    if (!raw) return;
    const spec = JSON.parse(raw);
    const node = buildNode(spec);
    node.id = crypto.randomUUID();   // stable id for highlight + delete
    targetArray.splice(insertIdx, 0, node);
    onMutate();
  });
}
```

Tiles being MOVED within the canvas also use DnD — on `dragstart` from an
existing tile, store the node id in the transfer data, find + remove it from the
tree on `drop`, then re-insert at the drop zone. One set of drop zones handles
both cases.

---

## RUN / STOP

```js
_bindDOM() {
  document.getElementById('te-run').addEventListener('click', () => this._run());
  document.getElementById('te-stop').addEventListener('click', () => this._stop());
  document.getElementById('te-code').addEventListener('click', () => this._toggleCode());
  document.getElementById('te-close').addEventListener('click', () => this.close());
  document.getElementById('te-dl-ino').addEventListener('click', () => this._download('ino'));
  document.getElementById('te-dl-py').addEventListener('click', () => this._download('py'));
}

_run() {
  this._program.name = document.querySelector('.te-name').value || 'My Robot Brain';
  const result = compile(this._program);

  const errEl = document.getElementById('te-errors');
  if (!result.ok) {
    errEl.textContent = result.errors.join('\n');
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');

  this._game.scrapBot.setBrain(this._program, this._game.world, this._game.player, this._game.dayNight);
  document.getElementById('te-run').disabled = true;
  document.getElementById('te-stop').disabled = false;
  this.close();   // let the kid watch the robot move
}

_stop() {
  this._game.scrapBot.clearBrain();
  document.getElementById('te-run').disabled = false;
  document.getElementById('te-stop').disabled = true;
}
```

---

## Live highlight (the best polish feature, ~½ day)

While the robot runs, highlight which tile is currently executing. Kids love
watching the glow move through their program.

### 1. Add a sourceMap in the compiler (20-line addition to `TileCompiler.js`):

When emitting each `ACT` / `WAIT` / etc., also push `{ pc: ctx.out.length - 1, nodeId: node.id }` to a parallel `ctx.sourceMap`. Return `sourceMap` alongside `bytecode`.

### 2. Store the map in `MakerRuntime`:

```js
this.sourceMap = result.sourceMap ?? [];  // [{ pc, nodeId }]
```

### 3. Poll from the editor's `requestAnimationFrame` loop:

```js
_startHighlight() {
  const rt = this._game.scrapBot._runtime;
  if (!rt) return;
  const map = rt.sourceMap;

  const step = () => {
    if (!this._open) return;
    document.querySelectorAll('.te-node-active').forEach(el => el.classList.remove('te-node-active'));
    const pc = rt.vm.pc;
    const entry = map.find(e => e.pc === pc);
    if (entry) {
      document.querySelector(`[data-node-id="${entry.nodeId}"]`)?.classList.add('te-node-active');
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
```

The `.te-node-active` CSS rule adds a cyan glow:

```css
.te-node-active {
  outline: 2px solid #00FFFF;
  box-shadow: 0 0 8px #00FFFF88;
}
```

---

## The `</>` code view and export

```js
_toggleCode() {
  this._codeView = !this._codeView;
  document.getElementById('te-code-view').classList.toggle('hidden', !this._codeView);
  if (this._codeView) {
    document.getElementById('te-arduino').textContent    = toArduino(this._program);
    document.getElementById('te-micropython').textContent = toMicroPython(this._program);
  }
}

_download(ext) {
  const code = ext === 'ino' ? toArduino(this._program) : toMicroPython(this._program);
  const blob = new Blob([code], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${this._program.name || 'robot'}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## CSS skeleton (`src/ui/TileEditor.css`)

```css
#tile-editor {
  position: fixed; inset: 0; background: rgba(0,0,0,0.85);
  display: flex; flex-direction: column;
  font-family: 'Courier New', monospace; color: #ddd;
}
.te-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 16px; background: #1a2030; border-bottom: 1px solid #334;
}
.te-body {
  display: flex; flex: 1; overflow: hidden;
}
.te-tray {
  width: 180px; min-width: 180px; overflow-y: auto;
  background: #141820; padding: 8px; border-right: 1px solid #334;
}
.te-tray-section { color: #556; font-size: 0.7em; margin: 12px 0 4px; letter-spacing: 2px; }
.te-tray-tile {
  padding: 6px 10px; margin: 2px 0; border-radius: 4px;
  background: #1e2840; cursor: grab; user-select: none;
  border: 1px solid #334; font-size: 0.85em;
}
.te-tray-tile:hover { background: #253050; border-color: #557; }
.te-canvas {
  flex: 1; overflow-y: auto; padding: 12px 20px;
  background: #161c28;
}
.te-node {
  position: relative; padding: 6px 10px; margin: 2px 0 2px;
  border-radius: 4px; border: 1px solid #334; background: #1c2438;
  font-size: 0.9em; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.te-node-forever { border-color: #228; background: #0e1428; }
.te-node-repeat  { border-color: #252; background: #0e1818; }
.te-node-if,
.te-node-if_else { border-color: #552; background: #181408; }
.te-node-action  { border-color: #2a4; }
.te-node-wait    { border-color: #446; }
.te-node-delete {
  margin-left: auto; background: none; border: none;
  color: #556; cursor: pointer; padding: 2px 4px; font-size: 0.8em;
}
.te-node-delete:hover { color: #f44; }
.te-drop-zone {
  height: 8px; border: 1px dashed #334; border-radius: 4px; margin: 1px 0;
  transition: height 0.1s, background 0.1s;
}
.te-drop-active { height: 24px; background: #223; border-color: #00FFFF; }
.te-param-enum, .te-param-number { background: #0e1220; border: 1px solid #336; color: #cde; border-radius: 3px; }
.te-param-value { color: #7af; font-size: 0.8em; }
.te-cond { display: inline-flex; gap: 4px; align-items: center; }
.te-cond select, .te-cond input { background: #0e1220; border: 1px solid #336; color: #cde; border-radius: 3px; }
.te-errors { background: #300; color: #f88; padding: 12px; white-space: pre-wrap; font-size: 0.85em; }
.te-code-view { background: #0a0e18; padding: 12px; }
.te-code-pre { background: #0f1520; padding: 12px; border-radius: 4px; overflow: auto; font-size: 0.8em; color: #9f9; max-height: 300px; }
.te-node-active { outline: 2px solid #00FFFF; box-shadow: 0 0 8px #00FFFF88; }
.btn-primary  { background: #0a4; color: #fff; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; }
.btn-danger   { background: #600; color: #fff; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; }
.btn-secondary{ background: #224; color: #99c; border: 1px solid #446; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
.hidden { display: none !important; }
```

---

## Opening the editor from a Maker Bench station

In `Game.js`, the player walking near stations triggers Earl's context lines via
`near_<station>`. Add a `near_maker` path:

```js
// in whatever station-proximity code already exists:
case 'maker':
  this.tileEditor?.open();
  break;
```

If the editor hasn't been instantiated yet, create it lazily in `Game.init()`:

```js
import { TileEditor } from './ui/TileEditor.js';
// ...
this.tileEditor = new TileEditor(this);
```

---

## Acceptance criteria

- Dragging from the tray and dropping on the canvas inserts a tile.
- Tiles nest correctly (forever → drop zone inside → if → body).
- All sensors and actuators from `SENSORS`/`ACTUATORS` appear in the tray automatically.
- Each param knob (slider, dropdown, toggle) updates the tile and re-renders.
- RUN → `compile()` → if errors shown in red; if ok → `scrapBot.setBrain()` → editor closes.
- Robot moves according to the tiles; live highlight glows on the active tile.
- STOP → robot returns to follow mode; editor reopens with current program.
- `</>` → shows real Arduino C++ and MicroPython for the current program.
- Download buttons produce valid `.ino` / `.py` files.
- Save → `toJSON()` → `localStorage`; reload → `fromJSON()` restores the program.
- Share → `toShareCode()` in URL hash; loading that URL restores the program.

## Don't

- Don't put behaviour in the editor. If you find yourself writing `if (tile.type === 'drive') moveRobot()`, stop — that belongs in `primitives.js` + the VM.
- Don't call `compile()` on every keypress / slider drag — only on RUN.
- Don't recreate the Three.js scene — the editor is a DOM overlay, not a canvas replacement.
