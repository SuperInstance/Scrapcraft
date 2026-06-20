/**
 * TileEditor — drag-and-drop visual programming interface for the Maker Lab.
 * Opens over the game with [T], wires into ScrapBot.setBrain() for live testing.
 */

import { TileProgram, EXAMPLE_WALL_AVOIDER, EXAMPLE_LIGHT_RUNNER, EXAMPLE_SQUARE, EXAMPLE_LINE_FOLLOWER } from './maker/TileProgram.js';
import { SENSORS, ACTUATORS, BRAINS, withDefaults } from './maker/primitives.js';
import { toArduino, toMicroPython, toWokwiDiagram, toWiringSVG, compile } from './maker/index.js';
import { Spark } from './Spark.js';

const BRAIN_ORDER = ['tin', 'spark', 'vision'];

// ── Tile appearance ──────────────────────────────────────────────────────────

const NODE_META = {
  drive:          { icon: '▶',  label: 'drive',          bg: '#0c2016' },
  turn:           { icon: '↻',  label: 'turn',           bg: '#0c2016' },
  stop:           { icon: '■',  label: 'stop',           bg: '#280e0e' },
  beep:           { icon: '♪',  label: 'beep',           bg: '#0c0c28' },
  led:            { icon: '●',  label: 'set light',      bg: '#0c0c28' },
  grab:           { icon: '✋', label: 'arm',            bg: '#0c0c28' },
  wait:           { icon: '⏱', label: 'wait',           bg: '#202010' },
  forever:        { icon: '∞',  label: 'forever',        bg: '#18102a' },
  repeat:         { icon: '↺',  label: 'repeat',         bg: '#18102a' },
  if:             { icon: '?',  label: 'if',             bg: '#281a0a' },
  if_else:        { icon: '⟨⟩', label: 'if / else',     bg: '#281a0a' },
  turn_angle:     { icon: '⤾',  label: 'turn angle',    bg: '#1a0c1a' },
  drive_distance: { icon: '→|', label: 'drive distance', bg: '#1a0c1a' },
};

const TRAY_GROUPS = [
  { label: 'MOTION', items: [
    { type: 'action', prim: 'drive' },
    { type: 'action', prim: 'turn' },
    { type: 'action', prim: 'stop' },
  ]},
  { label: 'OUTPUT', items: [
    { type: 'action', prim: 'beep' },
    { type: 'action', prim: 'led' },
    { type: 'action', prim: 'grab' },
  ]},
  { label: 'TIMING', items: [
    { type: 'wait' },
  ]},
  { label: 'FLOW', items: [
    { type: 'forever' },
    { type: 'repeat' },
    { type: 'if' },
    { type: 'if_else' },
  ]},
  { label: 'MACROS', items: [
    { type: 'macro', kind: 'turn_angle' },
    { type: 'macro', kind: 'drive_distance' },
  ]},
];

const SENSOR_LIST = Object.values(SENSORS);
const CMP_OPS    = ['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'is'];
const CMP_LABELS = { gt: '>', lt: '<', gte: '≥', lte: '≤', eq: '=', neq: '≠', is: 'is' };

// ── Utilities ────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Node factory ─────────────────────────────────────────────────────────────

function makeNode(spec) {
  const id = crypto.randomUUID();
  switch (spec.type) {
    case 'action':
      return { type: 'action', id, prim: spec.prim, params: withDefaults(spec.prim, {}) };
    case 'wait':
      return { type: 'wait', id, seconds: 1 };
    case 'forever':
      return { type: 'forever', id, body: [] };
    case 'repeat':
      return { type: 'repeat', id, count: 3, body: [] };
    case 'if':
      return { type: 'if', id, cond: { sensor: 'distance_ahead', cmp: 'lt', value: 0.25 }, body: [] };
    case 'if_else':
      return { type: 'if_else', id, cond: { sensor: 'distance_ahead', cmp: 'lt', value: 0.25 }, body: [], elseBody: [] };
    case 'macro':
      return {
        type: 'macro', id, kind: spec.kind,
        params: spec.kind === 'turn_angle'
          ? { dir: 'right', degrees: 90 }
          : { dir: 'forward', blocks: 3 },
      };
    default: return null;
  }
}

// ── TileEditor ───────────────────────────────────────────────────────────────

export class TileEditor {
  constructor(game) {
    this._game    = game;
    this._program = new TileProgram({ name: 'My Brain', brain: 'tin', nodes: [] });
    this._open    = false;
    this._running = false;
    this._dragData   = null;
    this._dropOK     = false;
    this._activeId   = null;
    this._rafId      = null;
    this._codeLang   = 'arduino';
    this._codeOpen   = false;
    this._brainTier  = 'tin'; // highest tier player has crafted

    this._panel  = null;
    this._canvas = null;
    this._tray   = null;

    this._spark      = null;
    this._sparkOpen  = false;
    this._sparkPanel = null;
    this._sparkLog   = null;
    this._sparkInput = null;
    this._botSel     = null;
    this._presetSel  = null;
    this._sensorsEl  = null;

    this._buildDOM();
  }

  // ── DOM setup ─────────────────────────────────────────────────────────────

  _buildDOM() {
    this._panel = document.getElementById('tile-editor');
    if (!this._panel) return;

    this._canvas   = this._panel.querySelector('#te-canvas');
    this._tray     = this._panel.querySelector('#te-tray');
    this._nameIn   = this._panel.querySelector('#te-name');
    this._brainSel = this._panel.querySelector('#te-brain');
    this._btnRun   = this._panel.querySelector('#te-run');
    this._btnStop  = this._panel.querySelector('#te-stop');
    this._codeView   = this._panel.querySelector('#te-code-view');
    this._codePre    = this._panel.querySelector('#te-code-pre');
    this._errView    = this._panel.querySelector('#te-errors');
    this._sensorsEl  = this._panel.querySelector('#te-sensors');

    this._nameIn.addEventListener('input', () => {
      this._program.name = this._nameIn.value || 'My Brain';
    });
    this._brainSel.addEventListener('change', () => {
      this._program.brain = this._brainSel.value;
      this._showErrors();
    });
    this._btnRun.addEventListener('click',  () => this._run());
    this._btnStop.addEventListener('click', () => this._stop());

    this._panel.querySelector('#te-code-btn').addEventListener('click',  () => this._toggleCode());
    this._panel.querySelector('#te-close-btn').addEventListener('click', () => this.close());
    this._panel.querySelector('#te-spark-btn')?.addEventListener('click', () => this._toggleSpark());
    this._panel.querySelector('#te-share-btn')?.addEventListener('click', () => this._shareProgram());
    this._panel.querySelector('#te-dl').addEventListener('click', () => this._download());
    this._panel.querySelector('#te-dl-wokwi')?.addEventListener('click', () => this._downloadWokwi());
    this._panel.querySelector('#te-dl-svg')?.addEventListener('click',   () => this._downloadSVG());

    this._botSel    = this._panel.querySelector('#te-bot-sel');
    this._presetSel = this._panel.querySelector('#te-preset-sel');
    if (this._presetSel) {
      this._presetSel.addEventListener('change', () => {
        const PRESETS = {
          wall_avoider:  EXAMPLE_WALL_AVOIDER,
          line_follower: EXAMPLE_LINE_FOLLOWER,
          light_runner:  EXAMPLE_LIGHT_RUNNER,
          square:        EXAMPLE_SQUARE,
        };
        const prog = PRESETS[this._presetSel.value];
        if (prog) { this.loadProgram(prog); this._game.ui?.notify(`📋 Loaded: ${prog.name}`); }
        this._presetSel.value = '';
      });
    }

    this._panel.querySelectorAll('.te-code-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._codeLang = btn.dataset.lang;
        this._panel.querySelectorAll('.te-code-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (this._codeOpen) this._refreshCode();
      });
    });

    this._buildTray();
    this._buildSparkPanel();
    this._renderProgram();
  }

  _buildSparkPanel() {
    this._sparkPanel = this._panel.querySelector('#spark-panel');
    if (!this._sparkPanel) return;
    this._sparkLog   = this._sparkPanel.querySelector('.sp-log');
    this._sparkInput = this._sparkPanel.querySelector('.sp-input');
    const sendBtn    = this._sparkPanel.querySelector('.sp-send');

    this._spark = new Spark(this);

    const send = async () => {
      const text = this._sparkInput.value.trim();
      if (!text) return;
      this._sparkInput.value = '';
      this._sparkLog.innerHTML += `<div class="sp-msg sp-user">${_esc(text)}</div>`;
      this._sparkLog.scrollTop = this._sparkLog.scrollHeight;

      const thinking = document.createElement('div');
      thinking.className = 'sp-msg sp-spark sp-thinking';
      thinking.textContent = '⚡ …';
      this._sparkLog.appendChild(thinking);
      this._sparkLog.scrollTop = this._sparkLog.scrollHeight;

      const reply = await this._spark.ask(text);

      thinking.remove();
      const cls = reply.kind === 'program' ? 'sp-msg sp-spark sp-built' : 'sp-msg sp-spark';
      this._sparkLog.innerHTML += `<div class="${cls}">⚡ ${_esc(reply.text)}</div>`;
      if (reply.kind === 'program') {
        this._game.achievements?.track('spark_program', {});
        this._game.xpSystem?.gain(10);
      }
      this._sparkLog.scrollTop = this._sparkLog.scrollHeight;
    };

    sendBtn.addEventListener('click', send);
    this._sparkInput.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

    // Seed with a welcome line
    this._sparkLog.innerHTML = `<div class="sp-msg sp-spark">⚡ Tell me what your robot should do and I'll build it!</div>`;
  }

  _buildTray() {
    for (const { label, items } of TRAY_GROUPS) {
      const hdr = document.createElement('div');
      hdr.className = 'te-tray-group';
      hdr.textContent = label;
      this._tray.appendChild(hdr);

      for (const spec of items) {
        const key  = spec.prim ?? spec.kind ?? spec.type;
        const meta = NODE_META[key] ?? {};

        const tile = document.createElement('div');
        tile.className = 'te-tray-tile';
        tile.style.background = meta.bg ?? '#181818';
        tile.draggable = true;
        tile.innerHTML = `<span class="te-tile-icon">${meta.icon ?? '?'}</span>`
          + `<span class="te-tile-label">${meta.label ?? key}</span>`;
        tile.title = `Drag to add "${meta.label ?? key}"`;

        tile.addEventListener('dragstart', e => {
          this._dragData = { kind: 'new', spec };
          e.dataTransfer.effectAllowed = 'copy';
          tile.classList.add('te-dragging');
        });
        tile.addEventListener('dragend', () => {
          tile.classList.remove('te-dragging');
          if (!this._dropOK) this._dragData = null;
          this._dropOK = false;
        });

        this._tray.appendChild(tile);
      }
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  _renderProgram() {
    this._canvas.innerHTML = '';
    const nodes = this._program.nodes;

    if (nodes.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'te-empty';
      hint.innerHTML = `<div>← Drag tiles here to build your robot's brain</div>`
        + `<div class="te-empty-sub">Start with <b>forever</b> so it loops until you stop it.</div>`;
      this._canvas.appendChild(hint);
    }

    this._canvas.appendChild(this._makeDZ(nodes, 0));
    for (let i = 0; i < nodes.length; i++) {
      this._canvas.appendChild(this._renderNode(nodes[i]));
      this._canvas.appendChild(this._makeDZ(nodes, i + 1));
    }

    this._showErrors();
    if (this._codeOpen) this._refreshCode();
  }

  _renderNode(node) {
    const key  = node.prim ?? node.kind ?? node.type;
    const meta = NODE_META[key] ?? {};

    const el = document.createElement('div');
    el.className = `te-node te-node-${node.type}`;
    el.style.setProperty('--nbg', meta.bg ?? '#181818');
    if (node.id) el.setAttribute('data-node-id', node.id);
    el.draggable = true;

    el.addEventListener('dragstart', e => {
      e.stopPropagation();
      this._dragData = { kind: 'move', nodeId: node.id };
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('te-dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('te-dragging');
      if (!this._dropOK) this._dragData = null;
      this._dropOK = false;
    });

    // Header
    const head = document.createElement('div');
    head.className = 'te-node-head';
    head.innerHTML = `<span class="te-nicon">${meta.icon ?? '?'}</span>`
      + `<span class="te-nlbl">${meta.label ?? key}</span>`;
    const del = document.createElement('button');
    del.className = 'te-del';
    del.textContent = '✕';
    del.title = 'Remove tile';
    del.addEventListener('click', e => { e.stopPropagation(); this._deleteNode(node.id); });
    head.appendChild(del);
    el.appendChild(head);

    // Inline params
    const pDiv = this._renderParams(node);
    if (pDiv) el.appendChild(pDiv);

    // Condition row (if / if_else)
    if (node.type === 'if' || node.type === 'if_else') {
      el.appendChild(this._renderCond(node));
    }

    // Body regions
    if (node.type === 'forever' || node.type === 'repeat') {
      el.appendChild(this._renderBody(node.body, 'DO'));
    }
    if (node.type === 'if' || node.type === 'if_else') {
      el.appendChild(this._renderBody(node.body, 'THEN'));
      if (node.type === 'if_else') el.appendChild(this._renderBody(node.elseBody, 'ELSE'));
    }

    return el;
  }

  _renderBody(list, label) {
    const wrap = document.createElement('div');
    wrap.className = 'te-body';

    const lbl = document.createElement('div');
    lbl.className = 'te-body-lbl';
    lbl.textContent = label;
    wrap.appendChild(lbl);

    const inner = document.createElement('div');
    inner.className = 'te-body-inner';
    if (list.length === 0) {
      const ph = document.createElement('div');
      ph.className = 'te-body-ph';
      ph.textContent = 'drop tiles here';
      inner.appendChild(ph);
    }
    inner.appendChild(this._makeDZ(list, 0));
    for (let i = 0; i < list.length; i++) {
      inner.appendChild(this._renderNode(list[i]));
      inner.appendChild(this._makeDZ(list, i + 1));
    }
    wrap.appendChild(inner);
    return wrap;
  }

  _makeDZ(list, idx) {
    const dz = document.createElement('div');
    dz.className = 'te-dz';
    dz.addEventListener('dragover', e => {
      if (this._dragData) { e.preventDefault(); e.stopPropagation(); dz.classList.add('active'); }
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('active'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      dz.classList.remove('active');
      this._handleDrop(list, idx);
    });
    return dz;
  }

  _renderParams(node) {
    const rows = [];

    if (node.type === 'action') {
      const def = ACTUATORS[node.prim];
      for (const [key, schema] of Object.entries(def?.params ?? {})) {
        rows.push(this._paramRow(key, schema, node.params[key], val => {
          node.params[key] = val;
          this._showErrors();
        }));
      }
    } else if (node.type === 'wait') {
      rows.push(this._numRow('seconds', node.seconds, 0.1, 10, 0.1, v => { node.seconds = v; }));
    } else if (node.type === 'repeat') {
      rows.push(this._numRow('count', node.count, 1, 20, 1, v => { node.count = Math.floor(v); }));
    } else if (node.type === 'macro') {
      if (node.kind === 'turn_angle') {
        rows.push(this._enumRow('dir', ['left', 'right'], node.params.dir, v => { node.params.dir = v; }));
        rows.push(this._numRow('degrees', node.params.degrees, 0, 360, 15, v => { node.params.degrees = v; }));
      } else if (node.kind === 'drive_distance') {
        rows.push(this._enumRow('dir', ['forward', 'backward'], node.params.dir, v => { node.params.dir = v; }));
        rows.push(this._numRow('blocks', node.params.blocks, 0.5, 20, 0.5, v => { node.params.blocks = v; }));
      }
    }

    if (!rows.length) return null;
    const div = document.createElement('div');
    div.className = 'te-params';
    rows.forEach(r => div.appendChild(r));
    return div;
  }

  _renderCond(node) {
    const cond = node.cond ?? {};
    const div  = document.createElement('div');
    div.className = 'te-cond';

    // NOT toggle
    const notBtn = document.createElement('button');
    notBtn.className = 'te-cond-not' + (cond.not ? ' active' : '');
    notBtn.textContent = 'NOT';
    notBtn.title = 'Invert condition';
    notBtn.addEventListener('click', () => {
      node.cond.not = !node.cond.not;
      notBtn.classList.toggle('active', !!node.cond.not);
      this._showErrors();
    });
    div.appendChild(notBtn);

    // Sensor select — filter to what the selected brain tier supports
    const ssel = document.createElement('select');
    ssel.className = 'te-select';
    const brainIdx = BRAIN_ORDER.indexOf(this._program.brain);
    SENSOR_LIST.filter(s => !s.requiresBrain || BRAIN_ORDER.indexOf(s.requiresBrain) <= brainIdx)
      .forEach(s => {
        const o = document.createElement('option');
        o.value = s.id; o.textContent = s.label;
        if (s.id === cond.sensor) o.selected = true;
        ssel.appendChild(o);
      });
    ssel.addEventListener('change', () => {
      node.cond.sensor = ssel.value;
      const s = SENSORS[ssel.value];
      node.cond.cmp   = s?.kind === 'digital' ? 'is' : 'gt';
      node.cond.value = s?.kind === 'digital' ? true : 0.5;
      // Re-render this node (cmp/value widgets depend on sensor kind)
      this._renderProgram();
    });
    div.appendChild(ssel);

    // CMP select
    const sensor = SENSORS[cond.sensor];
    const csel   = document.createElement('select');
    csel.className = 'te-select';
    const ops = sensor?.kind === 'digital' ? ['is'] : CMP_OPS.filter(c => c !== 'is');
    ops.forEach(op => {
      const o = document.createElement('option');
      o.value = op; o.textContent = CMP_LABELS[op] ?? op;
      if (op === cond.cmp) o.selected = true;
      csel.appendChild(o);
    });
    csel.addEventListener('change', () => { node.cond.cmp = csel.value; this._showErrors(); });
    div.appendChild(csel);

    // Value widget
    if (sensor?.kind === 'digital' || cond.cmp === 'is') {
      const vsel = document.createElement('select');
      vsel.className = 'te-select';
      ['true', 'false'].forEach(v => {
        const o = document.createElement('option');
        o.value = v; o.textContent = v;
        if (String(cond.value) === v) o.selected = true;
        vsel.appendChild(o);
      });
      vsel.addEventListener('change', () => { node.cond.value = vsel.value === 'true'; this._showErrors(); });
      div.appendChild(vsel);
    } else {
      const inp = document.createElement('input');
      inp.type = 'number'; inp.className = 'te-num-inp';
      inp.min = 0; inp.max = 1; inp.step = 0.05;
      inp.value = cond.value ?? 0.5;
      inp.style.width = '60px';
      inp.addEventListener('change', () => { node.cond.value = Number(inp.value); this._showErrors(); });
      div.appendChild(inp);
    }

    return div;
  }

  // ── Param helpers ─────────────────────────────────────────────────────────

  _paramRow(key, schema, value, onChange) {
    if (schema.type === 'enum')   return this._enumRow(key, schema.values, value, onChange);
    if (schema.type === 'number') return this._numRow(key, value, schema.min ?? 0, schema.max ?? 1, schema.step ?? 0.1, onChange);
    const row = document.createElement('div');
    row.className = 'te-param-row';
    row.textContent = key;
    return row;
  }

  _enumRow(key, values, current, onChange) {
    const row = document.createElement('div');
    row.className = 'te-param-row';
    const lbl = document.createElement('span');
    lbl.className = 'te-param-key'; lbl.textContent = key;
    row.appendChild(lbl);
    const sel = document.createElement('select');
    sel.className = 'te-select';
    values.forEach(v => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      if (v === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => onChange(sel.value));
    row.appendChild(sel);
    return row;
  }

  _numRow(key, current, min, max, step, onChange) {
    const row = document.createElement('div');
    row.className = 'te-param-row';
    const lbl = document.createElement('span');
    lbl.className = 'te-param-key'; lbl.textContent = key;
    row.appendChild(lbl);

    const slider = document.createElement('input');
    slider.type = 'range'; slider.className = 'te-slider';
    slider.min = min; slider.max = max; slider.step = step; slider.value = current;

    const num = document.createElement('input');
    num.type = 'number'; num.className = 'te-num-inp';
    num.min = min; num.max = max; num.step = step; num.value = current;

    slider.addEventListener('input', () => { num.value = slider.value; onChange(Number(slider.value)); });
    num.addEventListener('change', () => {
      const v = Math.min(max, Math.max(min, Number(num.value) || min));
      num.value = v; slider.value = v; onChange(v);
    });

    row.appendChild(slider);
    row.appendChild(num);
    return row;
  }

  // ── Drag / drop ───────────────────────────────────────────────────────────

  _handleDrop(list, idx) {
    const data = this._dragData;
    if (!data) return;
    this._dropOK = true;

    if (data.kind === 'new') {
      const node = makeNode(data.spec);
      if (node) { list.splice(idx, 0, node); this._renderProgram(); this._game?.saveSystem?.markDirty(); }
    } else if (data.kind === 'move') {
      const found = this._findNode(data.nodeId);
      if (!found) return;
      let at = idx;
      if (found.list === list && found.idx < idx) at--;
      found.list.splice(found.idx, 1);
      list.splice(Math.max(0, at), 0, found.node);
      this._renderProgram();
      this._game?.saveSystem?.markDirty();
    }

    this._dragData = null;
  }

  // ── Tree helpers ──────────────────────────────────────────────────────────

  _findNode(id, list = this._program.nodes) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { node: list[i], list, idx: i };
      const inB = list[i].body     ? this._findNode(id, list[i].body)     : null; if (inB) return inB;
      const inE = list[i].elseBody ? this._findNode(id, list[i].elseBody) : null; if (inE) return inE;
    }
    return null;
  }

  _deleteNode(id) {
    const found = this._findNode(id);
    if (found) { found.list.splice(found.idx, 1); this._renderProgram(); }
  }

  // ── Errors / code ─────────────────────────────────────────────────────────

  _showErrors() {
    const result = compile(this._program);
    const errs = result.errors.map(e => `<div class="te-err">⚠ ${e}</div>`).join('');
    const warns = result.warnings.map(w => `<div class="te-warn">💡 ${w}</div>`).join('');
    const html  = errs + warns;
    this._errView.style.display = html ? 'block' : 'none';
    this._errView.innerHTML = html;
  }

  _toggleCode() {
    this._codeOpen = !this._codeOpen;
    this._codeView.style.display = this._codeOpen ? 'flex' : 'none';
    const btn = this._panel.querySelector('#te-code-btn');
    btn.style.borderColor = this._codeOpen ? '#f0b429' : '';
    btn.style.color       = this._codeOpen ? '#f0b429' : '';
    if (this._codeOpen) this._refreshCode();
  }

  _refreshCode() {
    try {
      this._codePre.textContent = this._codeLang === 'arduino'
        ? toArduino(this._program)
        : toMicroPython(this._program);
    } catch (err) {
      this._codePre.textContent = `// Code generation error:\n// ${err.message}`;
    }
  }

  _download() {
    const isArd  = this._codeLang === 'arduino';
    const text   = isArd ? toArduino(this._program) : toMicroPython(this._program);
    const ext    = isArd ? 'ino' : 'py';
    const name   = (this._program.name || 'brain').replace(/[^a-z0-9]+/gi, '_');
    const blob   = new Blob([text], { type: 'text/plain' });
    const a      = document.createElement('a');
    a.href       = URL.createObjectURL(blob);
    a.download   = `${name}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  _downloadWokwi() {
    const name   = (this._program.name || 'brain').replace(/[^a-z0-9]+/gi, '_');
    const sketch = toArduino(this._program);
    const diagram= toWokwiDiagram(this._program);
    this._dlBlob(sketch,  `${name}.ino`,    'text/plain');
    setTimeout(() => this._dlBlob(diagram, 'diagram.json', 'application/json'), 150);
    this._game.ui?.notify('⬇ Saved sketch + diagram.json — paste both into Wokwi!');
    this._game.achievements?.track('wokwi_export', {});
    this._game.xpSystem?.gain(20);
  }

  _downloadSVG() {
    const name = (this._program.name || 'brain').replace(/[^a-z0-9]+/gi, '_');
    this._dlBlob(toWiringSVG(this._program), `${name}_wiring.svg`, 'image/svg+xml');
  }

  _dlBlob(text, filename, mime) {
    const blob = new Blob([text], { type: mime });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  _shareProgram() {
    try {
      const code = this._program.toShareCode();
      const url  = `${location.origin}${location.pathname}?brain=${code}`;
      navigator.clipboard.writeText(url).then(() => {
        this._game.ui?.notify('🔗 Share link copied to clipboard!');
      }).catch(() => {
        prompt('Copy this share link:', url);
      });
      this._game.achievements?.track('brain_share', {});
    } catch (e) {
      console.warn('[TileEditor] Share failed:', e);
    }
  }

  // ── Runtime ───────────────────────────────────────────────────────────────

  _activeBot() {
    const sel = this._botSel?.value ?? '1';
    return sel === '2' ? this._game.scrapBot2 : this._game.scrapBot;
  }

  _run() {
    const bot = this._activeBot();
    if (!bot?.isActive) {
      const sel = this._botSel?.value ?? '1';
      this._game.ui?.notify(sel === '2'
        ? 'Spawn Bot 2 first (Shift+B, requires Level 5)!'
        : 'Craft a robot_helper first, then run your brain!');
      return;
    }
    bot.setBrain(this._program, this._game.world, this._game.player, this._game.dayNight);
    this._game.audio?.brainLoad();
    this._game.achievements?.track('program_run', {});
    this._game.xpSystem?.gain(15);
    this._btnRun.disabled  = true;
    this._btnStop.disabled = false;
    this._running = true;
    if (!this._rafId) this._rafId = requestAnimationFrame(() => this._tickHL());
  }

  _stop() {
    this._activeBot()?.clearBrain();
    this._game.audio?.brainStop();
    this._running = false;
    this._btnRun.disabled  = false;
    this._btnStop.disabled = true;
    this._clearHL();
    if (this._sensorsEl) this._sensorsEl.style.display = 'none';
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }

  // ── Live highlight ────────────────────────────────────────────────────────

  _tickHL() {
    if (!this._running || !this._open) { this._rafId = null; return; }

    const bot = this._activeBot();
    const rt  = bot?._runtime;
    if (rt?.vm) {
      const pc  = rt.vm.pc;
      const map = rt.sourceMap;
      let activeId = null;
      for (const e of map) {
        if (e.pc <= pc) activeId = e.nodeId;
        else break;
      }
      if (activeId !== this._activeId) {
        this._clearHL();
        const el = this._canvas.querySelector(`[data-node-id="${activeId}"]`);
        el?.classList.add('te-active');
        this._activeId = activeId;
      }
      this._refreshSensors(rt);
    } else {
      this._clearHL();
      if (this._sensorsEl) this._sensorsEl.style.display = 'none';
    }

    this._rafId = requestAnimationFrame(() => this._tickHL());
  }

  _clearHL() {
    this._canvas.querySelectorAll('.te-active').forEach(el => el.classList.remove('te-active'));
    this._activeId = null;
  }

  _refreshSensors(rt) {
    if (!this._sensorsEl) return;
    const robot = rt.robot;
    const world = rt.world;
    if (!robot || !world) return;

    // Read all sensors that exist on the world adapter
    const dist = world.distanceAhead?.(robot.x, robot.z, robot.heading) ?? null;
    const readings = [
      { key: 'distance',   val: dist, kind: 'analog' },
      { key: 'brightness', val: world.lightAt?.(robot.x, robot.z) ?? null, kind: 'analog' },
      { key: 'bumped',     val: dist !== null ? dist < 0.08 : null, kind: 'digital' },
      { key: 'player',     val: (world.playerDistance?.(robot.x, robot.z) ?? 999) < 4, kind: 'digital' },
      { key: 'line',       val: world.lineUnder?.(robot.x, robot.z) ?? null, kind: 'digital' },
      { key: 'temp',       val: world.temperatureAt?.(robot.x, robot.z) ?? null, kind: 'analog' },
    ].filter(r => r.val !== null && r.val !== undefined);

    // Heading compass (N/NE/E/SE/S/SW/W/NW)
    const hdgDeg = ((robot.heading ?? 0) * 180 / Math.PI + 360) % 360;
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    const hdgLabel = dirs[Math.round(hdgDeg / 45) % 8];
    const posLabel = `(${robot.x?.toFixed(1)}, ${robot.z?.toFixed(1)})`;

    this._sensorsEl.style.display = 'flex';
    this._sensorsEl.innerHTML = `<div class="te-sensor-row" style="font-size:9px;color:#777;width:100%">`
      + `<span>pos ${posLabel}</span><span style="margin-left:auto">hdg ${hdgLabel} ${Math.round(hdgDeg)}°</span></div>`
      + readings.map(r => {
      const fval = typeof r.val === 'boolean'
        ? (r.val ? '<span style="color:#00ff88">ON</span>' : '<span style="color:#445">OFF</span>')
        : r.val.toFixed(2);
      const bar = r.kind === 'analog'
        ? `<div class="te-sensor-bar"><div class="te-sensor-fill" style="width:${Math.round(r.val * 100)}%"></div></div>`
        : '';
      return `<div class="te-sensor-row"><span class="te-sensor-key">${r.key}</span>`
           + `<span class="te-sensor-val">${fval}</span>${bar}</div>`;
    }).join('');
  }

  // ── Spark panel ───────────────────────────────────────────────────────────

  _toggleSpark() {
    if (!this._sparkPanel) return;
    this._sparkOpen = !this._sparkOpen;
    this._sparkPanel.style.display = this._sparkOpen ? 'flex' : 'none';
    const btn = this._panel.querySelector('#te-spark-btn');
    if (btn) { btn.style.borderColor = this._sparkOpen ? '#00ccff' : ''; btn.style.color = this._sparkOpen ? '#00ccff' : ''; }
  }

  /** Called by Spark, share-link loader, or SaveSystem restore when building a program. */
  loadProgram(program) {
    this._program = program;
    this._assignIds(this._program.nodes);
    if (this._nameIn)   this._nameIn.value   = program.name  ?? 'Spark Brain';
    if (this._brainSel) this._brainSel.value = program.brain ?? 'tin';
    this._renderProgram();
    this._game?.saveSystem?.markDirty();
  }

  _assignIds(nodes) {
    for (const n of nodes) {
      if (!n.id) n.id = crypto.randomUUID();
      if (n.body)     this._assignIds(n.body);
      if (n.elseBody) this._assignIds(n.elseBody);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  open(brainTier = 'tin') {
    if (!this._panel) return;
    this._brainTier = brainTier;
    // Limit brain selector to tiers the player has earned
    if (this._brainSel) {
      const maxIdx = BRAIN_ORDER.indexOf(brainTier);
      Array.from(this._brainSel.options).forEach(opt => {
        opt.disabled = BRAIN_ORDER.indexOf(opt.value) > maxIdx;
      });
    }
    this._panel.style.display = 'flex';
    this._open = true;
    if (this._running && !this._rafId) this._rafId = requestAnimationFrame(() => this._tickHL());
  }

  close() {
    if (!this._panel) return;
    this._panel.style.display = 'none';
    this._open = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }

  get isOpen() { return this._open; }
}
