/**
 * TileEditor — drag-and-drop visual programming interface for the Maker Lab.
 * Opens over the game with [T], wires into ScrapBot.setBrain() for live testing.
 */

import { TileProgram, EXAMPLE_WALL_AVOIDER, EXAMPLE_LIGHT_RUNNER, EXAMPLE_SQUARE, EXAMPLE_LINE_FOLLOWER, EXAMPLE_WAYPOINT_NAV, EXAMPLE_ORE_HUNTER, EXAMPLE_BATTERY_SAVER, EXAMPLE_BUMP_COUNTER } from './maker/TileProgram.js';
import { SENSORS, ACTUATORS, BRAINS, withDefaults } from './maker/primitives.js';
import { toArduino, toMicroPython, toWokwiDiagram, toWiringSVG, compile, TileVM, VirtualRobot } from './maker/index.js';
import { Avr109Flasher } from './maker/Avr109Flasher.js';
import { UNO_WIRING } from './maker/PinModel.js';
import { QuiltSheet } from './maker/QuiltSheet.js';
import { QuiltView } from './maker/QuiltView.js';
import { BotShelf } from './BotLedger.js';
import { WebSerialBridge } from './maker/WebSerialBridge.js';
import { Spark } from './Spark.js';
import { BrainGallery } from './BrainGallery.js';
import { voiceOut, voiceIn } from './voice/index.js';

const BRAIN_ORDER = ['tin', 'spark', 'vision'];

// ── Tile appearance ──────────────────────────────────────────────────────────

const NODE_META = {
  drive:          { icon: '▶',  label: 'drive',          bg: '#0c2016', tip: 'Move the robot forward or backward. Set the speed from 0 (stopped) to 1 (full speed).' },
  turn:           { icon: '↻',  label: 'turn',           bg: '#0c2016', tip: 'Spin the robot left or right in place. Higher speed = faster spin.' },
  stop:           { icon: '■',  label: 'stop',           bg: '#280e0e', tip: 'Cut the motors and come to a halt immediately.' },
  beep:           { icon: '♪',  label: 'beep',           bg: '#0c0c28', tip: 'Play a short beep. Choose high, mid, or low pitch to signal different events.' },
  led:            { icon: '●',  label: 'set light',      bg: '#0c0c28', tip: 'Change the status LED color. Use red for danger, green for all-clear, off to save power.' },
  grab:           { icon: '✋', label: 'arm',            bg: '#0c0c28', tip: 'Open or close the robot arm to pick up or release an item.' },
  wait:           { icon: '⏱', label: 'wait',           bg: '#202010', tip: 'Pause for a set number of seconds before running the next tile. Great for timed moves.' },
  forever:        { icon: '∞',  label: 'forever',        bg: '#18102a', tip: 'Repeat the tiles inside endlessly. Every real robot program has a forever loop at its core.' },
  repeat:         { icon: '↺',  label: 'repeat',         bg: '#18102a', tip: 'Run the tiles inside a fixed number of times, then continue to the next tile.' },
  if:             { icon: '?',  label: 'if',             bg: '#281a0a', tip: 'Check a sensor. If the condition is true, run the tiles inside — otherwise skip them.' },
  if_else:        { icon: '⟨⟩', label: 'if / else',     bg: '#281a0a', tip: 'Check a sensor. Run THEN tiles if true, ELSE tiles if false. Always does one or the other.' },
  turn_angle:     { icon: '⤾',  label: 'turn angle',    bg: '#1a0c1a', tip: 'Turn an exact number of degrees (e.g. 90° for a square corner). A macro — expands to turn + wait.' },
  drive_distance: { icon: '→|', label: 'drive distance', bg: '#1a0c1a', tip: 'Drive an exact distance in world units. A macro — expands to drive + timed wait.' },
  repeat_until:   { icon: '↻?', label: 'repeat until',   bg: '#18102a', tip: 'Keep running the tiles inside until the condition becomes true — like a while loop. Pairs perfectly with variables.' },
  wait_until:     { icon: '⏸?', label: 'wait until',     bg: '#202010', tip: 'Pause here — do nothing — until the condition becomes true. Like a stop sign that lifts when the sensor triggers.' },
  break:          { icon: '⛔', label: 'break',           bg: '#280e0e', tip: 'Exit the current forever or repeat loop immediately. Great for "stop when something happens" inside a forever loop.' },
  print:          { icon: '📤', label: 'print variable',  bg: '#0e1a28', tip: 'Show the current value of a variable in the serial monitor. Like console.log — great for debugging!' },
  comment:        { icon: '💬', label: 'comment',          bg: '#111111', tip: 'A note for humans — does nothing when the program runs. Use it to label sections of your program.' },
  random_var:     { icon: '🎲', label: 'random variable', bg: '#0e1a28', tip: 'Set a variable to a random number between min and max. Makes your bot unpredictable and fun!' },
  define_sub:     { icon: '⎈',  label: 'define subroutine', bg: '#1a0a2a', tip: 'Name a group of tiles as a reusable subroutine. Call it by name from anywhere in your program — like defining a function.' },
  call_sub:       { icon: '⤴',  label: 'call subroutine',   bg: '#1a0a2a', tip: 'Run a named subroutine. The bot executes all tiles inside it, then returns here.' },
  set_var:        { icon: '=',  label: 'set variable',   bg: '#0e1a28', tip: 'Create a named number and set its starting value. Run this before your forever loop.' },
  change_var:     { icon: '±',  label: 'change variable',bg: '#0e1a28', tip: 'Add (or subtract) a number from a variable. Use it inside loops to count things.' },
  read_sensor:    { icon: '📡', label: 'read sensor',    bg: '#0e1a28', tip: 'Read the live value of a sensor into a variable. Use it to store a snapshot or drive proportional behavior.' },
  math_var:       { icon: '🔢', label: 'math variable',  bg: '#0e1a28', tip: 'Do math on a variable: multiply, divide, add, or subtract a number. Great for scaling sensor values.' },
  add_score:      { icon: '⭐', label: 'add score',      bg: '#1a1500', tip: 'Add points to the bot\'s running score total. Score shows in the Maker Lab monitor. Resets each time you hit Run.' },
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
    { type: 'repeat_until' },
    { type: 'wait_until' },
    { type: 'if' },
    { type: 'if_else' },
    { type: 'break' },
  ]},
  { label: 'MACROS', items: [
    { type: 'macro', kind: 'turn_angle' },
    { type: 'macro', kind: 'drive_distance' },
  ]},
  { label: 'VARIABLES', items: [
    { type: 'set_var' },
    { type: 'change_var' },
    { type: 'math_var' },
    { type: 'random_var' },
    { type: 'read_sensor' },
    { type: 'print' },
  ]},
  { label: 'SUBROUTINES', items: [
    { type: 'define_sub' },
    { type: 'call_sub' },
  ]},
  { label: 'NOTES', items: [
    { type: 'comment' },
  ]},
  { label: 'GAME', items: [
    { type: 'action', prim: 'add_score' },
  ]},
];

const SENSOR_LIST = Object.values(SENSORS);
const CMP_OPS    = ['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'is'];
const CMP_LABELS = { gt: '>', lt: '<', gte: '≥', lte: '≤', eq: '=', neq: '≠', is: 'is' };

// ── Utilities ────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const MILE_LABEL = {
  first_brain: 'first brain — started thinking',
  first_dent: 'first dent',
  first_repair: 'first repair',
  lap_complete: 'first lap',
  ten_laps: 'ten laps',
  fifty_laps: 'fifty laps',
  crash_free_30: '30s crash-free streak',
  crash_free_120: '2min crash-free streak',
  crash_free_300: '5min crash-free streak',
};

function _instrSummary(instr) {
  if (!instr) return '';
  switch (instr.op) {
    case 'ACT':   return `→ ${instr.action}`;
    case 'SENSE': return `← ${instr.sensor}`;
    case 'WAIT':  return `⏱ ${instr.seconds}s`;
    case 'LOOP':  return instr.forever ? '∞ forever' : `↺ ×${instr.count}`;
    case 'NEXT':  return '↩ next';
    case 'UNTIL': return '↩ until';
    case 'BREAK':     return '⛔ break';
    case 'PRINT_VAR': return `📤 ${instr.name}`;
    case 'RAND_VAR':    return `🎲 ${instr.name} ∈ [${instr.min},${instr.max}]`;
    case 'CALL_SUB':    return `⤴ ${instr.name}()`;
    case 'SUB_RETURN':  return `↩ return`;
    case 'READ_SENSOR': return `📡 ${instr.name} ← ${instr.sensor}`;
    case 'MATH_VAR': {
      const sym = { add: '+', sub: '-', mul: '×', div: '÷' }[instr.mathOp] ?? '?';
      return `🔢 ${instr.name} ${sym}= ${instr.operand}`;
    }
    case 'JZ':    return `? → ${instr.target}`;
    case 'JMP':   return `→ ${instr.target}`;
    case 'HALT':       return '⏹';
    case 'SET_VAR':    return `${instr.name} = 0`;
    case 'GET_VAR':    return `← var:${instr.name}`;
    case 'CHANGE_VAR': return `${instr.name} ${(instr.delta ?? 0) >= 0 ? '+' : ''}${instr.delta}`;
    default:           return '';
  }
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
    case 'repeat_until':
      return { type: 'repeat_until', id, cond: { sensor: 'distance_ahead', cmp: 'lt', value: 0.25 }, body: [] };
    case 'wait_until':
      return { type: 'wait_until', id, cond: { sensor: 'distance_ahead', cmp: 'lt', value: 0.25 } };
    case 'break':
      return { type: 'break', id };
    case 'print':
      return { type: 'print', id, name: 'count' };
    case 'comment':
      return { type: 'comment', id, text: 'note' };
    case 'random_var':
      return { type: 'random_var', id, name: 'x', min: 1, max: 10 };
    case 'define_sub':
      return { type: 'define_sub', id, name: 'patrol', body: [] };
    case 'call_sub':
      return { type: 'call_sub', id, name: 'patrol' };
    case 'set_var':    return { type: 'set_var',    id, name: 'count', value: 0 };
    case 'change_var': return { type: 'change_var', id, name: 'count', delta: 1 };
    case 'read_sensor': return { type: 'read_sensor', id, name: 'dist', sensor: 'distance_ahead' };
    case 'math_var':    return { type: 'math_var', id, name: 'dist', op: 'mul', operand: 0.5 };
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
    this._wiringEl   = null;
    this._statsEl    = null;

    this._gallery    = null;

    // Step debugger
    this._stepMode   = false;
    this._debugRt    = null;   // { vm, sourceMap } — debug VM instance
    this._stepBtn    = null;
    this._stepInfoEl = null;

    // Undo/redo history (snapshots of program JSON)
    this._history    = [];
    this._histIdx    = -1;
    this._undoBtn    = null;
    this._redoBtn    = null;

    // WebSerial hardware bridge
    this._bridge       = null;
    this._flashBtn     = null;
    this._serialEl     = null;
    this._serialLinesEl = null;
    this._serialLog    = [];   // [{ts, text}]
    this._flashStatus  = 'disconnected'; // disconnected|connecting|connected|flashing|running|error

    // One-shot callback: fires the first time _run() succeeds (tutorial step 4 hook)
    this.onFirstRun = null;
    this._earlSaidVar = false;
    this._earlSaidVarCond = false;

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
    this._wiringEl   = this._panel.querySelector('#te-wiring-svg');
    this._statsEl    = this._panel.querySelector('#te-stats');

    this._nameIn.addEventListener('input', () => {
      this._program.name = this._nameIn.value || 'My Brain';
    });
    this._brainSel.addEventListener('change', () => {
      this._saveHistory();
      this._program.brain = this._brainSel.value;
      this._showErrors();
    });
    this._btnRun.addEventListener('click',  () => this._run());
    this._btnStop.addEventListener('click', () => this._stop());

    this._panel.querySelector('#te-code-btn').addEventListener('click',  () => this._toggleCode());
    this._panel.querySelector('#te-close-btn').addEventListener('click', () => this.close());
    this._panel.querySelector('#te-upgrades-btn')?.addEventListener('click', () => this._game._toggleBotUpgradePanel?.());
    this._panel.querySelector('#te-botcard-btn')?.addEventListener('click', () => this._toggleBotCard());
    this._panel.querySelector('#te-spark-btn')?.addEventListener('click', () => this._toggleSpark());
    this._panel.querySelector('#te-share-btn')?.addEventListener('click', () => this._shareProgram());
    this._panel.querySelector('#te-receipt-btn')?.addEventListener('click', () => this._showFlashReceipt());
    this._panel.querySelector('#te-gallery-btn')?.addEventListener('click', () => this._gallery?.open());

    this._undoBtn = this._panel.querySelector('#te-undo-btn');
    this._redoBtn = this._panel.querySelector('#te-redo-btn');
    this._undoBtn?.addEventListener('click', () => this._undo());
    this._redoBtn?.addEventListener('click', () => this._redo());
    // Keyboard undo/redo (only when the editor panel is open)
    document.addEventListener('keydown', (e) => {
      if (!this._open) return;
      // Don't intercept when typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key === 'z') { e.preventDefault(); this._undo(); }
      if (mod &&  e.shiftKey && e.key === 'z') { e.preventDefault(); this._redo(); }
      if (mod && !e.shiftKey && e.key === 'y') { e.preventDefault(); this._redo(); }
    });

    this._stepBtn    = this._panel.querySelector('#te-step-btn');
    this._stepInfoEl = this._panel.querySelector('#te-step-info');
    this._stepBtn?.addEventListener('click', () => this._handleStep());
    this._panel.querySelector('#te-dl').addEventListener('click', () => this._download());
    this._panel.querySelector('#te-dl-wokwi')?.addEventListener('click', () => this._downloadWokwi());

    // Flash Receipt modal wiring (persistent DOM, wired once)
    const fr = document.getElementById('flash-receipt');
    if (fr && !fr.dataset.wired) {
      fr.dataset.wired = '1';
      const close = () => fr.classList.remove('show');
      document.getElementById('fr-close')?.addEventListener('click', close);
      document.getElementById('fr-close-btn2')?.addEventListener('click', close);
      fr.addEventListener('click', e => { if (e.target === fr) close(); });
      document.getElementById('fr-share-btn')?.addEventListener('click', () => this._shareProgram());
      document.getElementById('fr-wokwi-dl-btn')?.addEventListener('click', () => this._downloadWokwi());
    }

    // WebSerial flash button
    this._flashBtn     = this._panel.querySelector('#te-flash');
    this._serialEl     = this._panel.querySelector('#te-serial-monitor');
    this._serialLinesEl = this._panel.querySelector('#te-serial-lines');
    if (this._flashBtn) {
      if (!new WebSerialBridge().isSupported) {
        this._flashBtn.style.display = 'none';
      } else {
        this._flashBtn.addEventListener('click', () => this._handleFlash());
        this._panel.querySelector('#te-serial-clear')
          ?.addEventListener('click', () => this._clearSerial());
        this._panel.querySelector('#te-serial-disc')
          ?.addEventListener('click', () => this._bridge?.disconnect());
      }
    }

    // AVR109 .hex flasher (Leonardo/Pro Micro/STM32duino) — degrades to "keep simulating"
    this._hexBtn  = this._panel.querySelector('#te-hex-flash');
    this._hexFile = this._panel.querySelector('#te-hex-file');
    this._avr     = new Avr109Flasher();
    if (this._hexBtn) {
      if (!this._avr.isSupported) this._hexBtn.style.display = 'none';
      else this._hexBtn.addEventListener('click', () => this._handleHexFlash());
    }
    this._hexFile?.addEventListener('change', () => this._onHexFile());

    // Hardware twin — live wiring/pin view over the canvas
    this._pinBtn = this._panel.querySelector('#te-pin-view');
    this._pinOpen = false;
    this._pinPanel = null;
    this._pinTimer = null;
    this._pinBtn?.addEventListener('click', () => this._togglePinView());

    // Quilt view — the FLIP: bot as a live spreadsheet
    this._quiltBtn = this._panel.querySelector('#te-quilt-btn');
    this._quiltOpen = false;
    this._quiltSheet = new QuiltSheet();
    this._quiltView = null;
    this._quiltTimer = null;
    this._quiltBtn?.addEventListener('click', () => this._toggleQuilt());

    this._botSel    = this._panel.querySelector('#te-bot-sel');
    this._presetSel = this._panel.querySelector('#te-preset-sel');
    if (this._presetSel) {
      this._presetSel.addEventListener('change', () => {
        const PRESETS = {
          wall_avoider:    EXAMPLE_WALL_AVOIDER,
          line_follower:   EXAMPLE_LINE_FOLLOWER,
          light_runner:    EXAMPLE_LIGHT_RUNNER,
          square:          EXAMPLE_SQUARE,
          waypoint_nav:    EXAMPLE_WAYPOINT_NAV,
          ore_hunter:      EXAMPLE_ORE_HUNTER,
          battery_saver:   EXAMPLE_BATTERY_SAVER,
          bump_counter:    EXAMPLE_BUMP_COUNTER,
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
        this._updateFlashBtn();
      });
    });

    this._buildTray();
    this._buildSparkPanel();
    this._gallery = new BrainGallery(this);
    this._renderProgram();
  }

  _buildSparkPanel() {
    this._sparkPanel = this._panel.querySelector('#spark-panel');
    if (!this._sparkPanel) return;
    this._sparkLog   = this._sparkPanel.querySelector('.sp-log');
    this._sparkInput = this._sparkPanel.querySelector('.sp-input');
    const sendBtn    = this._sparkPanel.querySelector('.sp-send');

    this._spark = new Spark(this);
    this._sparkFirstOpen = true;
    this._voiceInProgress = false;

    const send = async () => {
      const text = this._sparkInput.value.trim();
      if (!text) return;
      this._sparkInput.value = '';
      this._hideSparkChips();
      this._sparkLog.innerHTML += `<div class="sp-msg sp-user">${_esc(text)}</div>`;
      this._sparkLog.scrollTop = this._sparkLog.scrollHeight;

      const thinking = document.createElement('div');
      thinking.className = 'sp-msg sp-spark sp-thinking';
      thinking.textContent = '⚡ …';
      this._sparkLog.appendChild(thinking);
      this._sparkLog.scrollTop = this._sparkLog.scrollHeight;

      this._game?.companions?.observe('spark_consult', { note: String(text).slice(0, 30) });
      this._game?.quests?.onSparkAsk?.(text);   // full question text — quest objectives match on it
      const reply = await this._spark.ask(text);

      thinking.remove();
      const cls = reply.kind === 'program' ? 'sp-msg sp-spark sp-built' : 'sp-msg sp-spark';
      this._sparkLog.innerHTML += `<div class="${cls}">⚡ ${_esc(reply.text)}</div>`;
      if (reply.kind === 'program') {
        this._game.achievements?.track('spark_program', {});
        this._game.xpSystem?.gain(10);
        this._game.dailyContract?.onSpark();
      }
      this._sparkLog.scrollTop = this._sparkLog.scrollHeight;
    };

    // Mic button for voice input — click to start, click again to send.
    // Hold V anywhere (while the Spark panel is open and you're not typing) works too.
    const micBtn = document.createElement('button');
    micBtn.textContent = '🎤';
    micBtn.title = 'Click (or hold V) and speak your question';
    micBtn.style.cssText = 'margin-right:8px;padding:4px 8px;cursor:pointer;background:#333;color:#0f0;border:1px solid #0f0;border-radius:4px;';
    micBtn.addEventListener('click', () => {
      if (this._voiceRecording) this._voiceStop();
      else this._voiceStart();
    });

    const sendBtnParent = sendBtn.parentNode;
    if (sendBtnParent) sendBtnParent.insertBefore(micBtn, sendBtn);

    sendBtn.addEventListener('click', send);
    this._sparkInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') send();
    });

    // Hold V for push-to-talk — global listener, only while the Spark panel is
    // visible AND the player isn't typing (so the letter 'v' never hijacks chat).
    this._voiceKeyDown = false;
    document.addEventListener('keydown', e => {
      if (e.code !== 'KeyV' || e.repeat) return;
      if (!this._sparkPanel?.offsetParent) return;                       // panel closed
      if (document.activeElement === this._sparkInput) return;           // typing
      if (!this._voiceKeyDown && !this._voiceInProgress && !this._voiceRecording) {
        this._voiceKeyDown = true;
        this._voiceStart();
      }
    });
    document.addEventListener('keyup', e => {
      if (e.code === 'KeyV' && this._voiceKeyDown) {
        this._voiceKeyDown = false;
        if (this._voiceRecording) this._voiceStop();
      }
    });

    // Seed with a welcome line
    this._sparkLog.innerHTML = `<div class="sp-msg sp-spark">⚡ Tell me what your robot should do and I'll build it!</div>`;

    this._buildSparkChips(send);
  }

  // ── Starter chips — kill the blank-page problem ─────────────────────────
  // Every chip matches an offline recipe, so one tap works even with NO api
  // key and NO internet: a kid's first Spark success never depends on setup.

  _chipPool() {
    return [
      { label: '🏁 follow the track',   prompt: 'make it follow the track' },
      { label: '🟨 drive in a square',  prompt: 'make it drive in a square' },
      { label: '💡 chase the light',    prompt: 'chase the brightest light' },
      { label: '⚡ zigzag',             prompt: 'make it drive in a zigzag' },
      { label: '🌈 rainbow lights',     prompt: 'blink rainbow colors' },
      { label: '🛡️ avoid walls',        prompt: 'avoid walls and turn away' },
      { label: '🏎️ max speed',         prompt: 'go as fast as possible' },
      { label: '🎵 play a song',        prompt: 'play a song' },
      { label: '😴 sneak slowly',       prompt: 'move slowly and carefully' },
      { label: '🧭 go to the flag',     prompt: 'navigate to the waypoint flag' },
    ];
  }

  _buildSparkChips(send) {
    const inputRow = this._sparkInput?.parentElement;
    if (!inputRow) return;
    this._sparkChips = document.createElement('div');
    this._sparkChips.className = 'sp-chips';
    this._sparkPanel.insertBefore(this._sparkChips, inputRow);

    const die = document.createElement('button');
    die.className = 'sp-chip sp-chip-dice';
    die.textContent = '🎲';
    die.title = 'More ideas';
    die.addEventListener('click', () => { this._chipOffset += 4; this._renderSparkChips(send); });

    this._chipOffset = 0;
    this._renderSparkChips(send, die);
  }

  _renderSparkChips(send, die) {
    const pool = this._chipPool();
    if (!die) die = this._sparkChips?.querySelector('.sp-chip-dice');
    this._sparkChips.innerHTML = '';
    const start = this._chipOffset % pool.length;
    for (let i = 0; i < 4; i++) {
      const c = pool[(start + i) % pool.length];
      const chip = document.createElement('button');
      chip.className = 'sp-chip';
      chip.textContent = c.label;
      chip.title = c.prompt;
      chip.addEventListener('click', () => {
        this._sparkInput.value = c.prompt;
        send();
      });
      this._sparkChips.appendChild(chip);
    }
    if (die) this._sparkChips.appendChild(die);
  }

  /** After the first real send the kid knows what Spark is — chips retire. */
  _hideSparkChips() {
    if (this._sparkChips) this._sparkChips.style.display = 'none';
  }

  // Push-to-talk: begin recording (hold V or first mic click)
  async _voiceStart() {
    if (this._voiceInProgress || this._voiceRecording) return;
    this._voiceRecording = true;
    const micBtn = this._sparkPanel?.querySelector('button[title^="Click"]');
    if (micBtn) { micBtn.textContent = '⏹'; micBtn.style.background = '#0f0'; micBtn.style.color = '#000'; }
    try {
      await voiceIn.start();
    } catch (err) {
      console.debug('[voice] microphone unavailable', err);
      this._voiceRecording = false;
      if (micBtn) { micBtn.textContent = '🎤'; micBtn.style.background = '#333'; micBtn.style.color = '#0f0'; }
    }
  }

  // Push-to-talk: release → stop recording, send the question to Spark
  async _voiceStop() {
    if (!this._voiceRecording) return;
    this._voiceRecording = false;
    this._voiceInProgress = true;
    const micBtn = this._sparkPanel?.querySelector('button[title^="Click"]');
    if (micBtn) { micBtn.textContent = '🎤'; micBtn.style.background = '#333'; micBtn.style.color = '#0f0'; }

    let transcript = '';
    try {
      transcript = await voiceIn.stop();
    } catch (err) {
      console.debug('[voice] input failed', err);
    }
    if (!transcript) {
      this._voiceInProgress = false;
      return;
    }
    this._voiceHandleTranscript(transcript);
  }

  // Send a spoken (or typed) question through the voice dialogue loop: the
  // worker's /dialogue answers + speaks it; if the worker is unreachable we
  // still show the question in chat and let the in-game Spark answer in text.
  _voiceHandleTranscript(text) {
    this._sparkInput.value = text;
    const send = async () => {
      const q = this._sparkInput.value.trim();
      if (!q) { this._voiceInProgress = false; return; }
      this._sparkInput.value = '';
      this._hideSparkChips();
      this._sparkLog.innerHTML += `<div class="sp-msg sp-user">${_esc(q)}</div>`;
      const thinking = document.createElement('div');
      thinking.className = 'sp-msg sp-spark sp-thinking';
      thinking.textContent = '⚡ …';
      this._sparkLog.appendChild(thinking);
      this._sparkLog.scrollTop = this._sparkLog.scrollHeight;

      let handled = false;
      try {
        // Preferred: full voice loop — Spark's answer comes back spoken.
        const res = await voiceIn.ask(q);
        if (res?.answer) {
          thinking.remove();
          this._sparkLog.innerHTML += `<div class="sp-msg sp-spark">⚡ ${_esc(res.answer)}</div>`;
          this._sparkLog.scrollTop = this._sparkLog.scrollHeight;
          if (res.playAudio) res.playAudio();
          handled = true;
        }
      } catch (_) { /* worker down — fall through to in-game Spark */ }

      if (!handled) {
        try {
          this._game?.companions?.observe('spark_consult', { note: String(q).slice(0, 30) });
          this._game?.quests?.onSparkAsk?.(q);   // full question text — quest objectives match on it
          const reply = await this._spark.ask(q);
          thinking.remove();
          const cls = reply.kind === 'program' ? 'sp-msg sp-spark sp-built' : 'sp-msg sp-spark';
          this._sparkLog.innerHTML += `<div class="${cls}">⚡ ${_esc(reply.text)}</div>`;
          if (reply.kind === 'program') {
            this._game.achievements?.track('spark_program', {});
            this._game.xpSystem?.gain(10);
            this._game.dailyContract?.onSpark();
          }
          this._sparkLog.scrollTop = this._sparkLog.scrollHeight;
          // Speak the in-game Spark's reply through the voice worker
          voiceOut.speak(reply.text, { voice: 'spark' });
        } catch (_) {
          thinking.remove();
        }
      }
      this._voiceInProgress = false;
    };
    setTimeout(send, 100);
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
    if (meta.tip) head.title = meta.tip;
    head.innerHTML = `<span class="te-nicon">${meta.icon ?? '?'}</span>`
      + `<span class="te-nlbl">${meta.label ?? key}</span>`;

    // Help chip
    if (meta.tip) {
      const help = document.createElement('button');
      help.className = 'te-help-btn';
      help.textContent = '?';
      help.title = 'What does this tile do?';
      help.addEventListener('click', e => {
        e.stopPropagation();
        let tip = el.querySelector('.te-tip-popup');
        if (tip) { tip.remove(); return; }
        tip = document.createElement('div');
        tip.className = 'te-tip-popup';
        tip.textContent = meta.tip;
        el.appendChild(tip);
      });
      head.appendChild(help);
    }

    const dup = document.createElement('button');
    dup.className = 'te-dup';
    dup.textContent = '⧉';
    dup.title = 'Duplicate tile';
    dup.addEventListener('click', e => { e.stopPropagation(); this._duplicateNode(node.id); });
    head.appendChild(dup);

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

    // Condition row (if / if_else / repeat_until / wait_until)
    if (node.type === 'if' || node.type === 'if_else' || node.type === 'repeat_until' || node.type === 'wait_until') {
      el.appendChild(this._renderCond(node));
    }

    // Body regions
    if (node.type === 'forever' || node.type === 'repeat') {
      el.appendChild(this._renderBody(node.body, 'DO'));
    }
    if (node.type === 'repeat_until' || node.type === 'define_sub') {
      el.appendChild(this._renderBody(node.body, 'DO'));
    }
    // wait_until has NO body (it only has a condition)
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
    } else if (node.type === 'set_var') {
      rows.push(this._textRow('name', node.name, v => { node.name = v.replace(/[^a-z0-9_]/gi, '_') || 'count'; this._showErrors(); }));
      rows.push(this._numRow('value', node.value, -999, 999, 1, v => { node.value = v; }));
    } else if (node.type === 'change_var') {
      rows.push(this._textRow('name', node.name, v => { node.name = v.replace(/[^a-z0-9_]/gi, '_') || 'count'; this._showErrors(); }));
      rows.push(this._numRow('by', node.delta, -100, 100, 1, v => { node.delta = v; }));
    } else if (node.type === 'print') {
      rows.push(this._textRow('variable', node.name, v => { node.name = v.replace(/[^a-z0-9_]/gi, '_') || 'count'; }));
    } else if (node.type === 'comment') {
      rows.push(this._textRow('note', node.text, v => { node.text = v || 'note'; }));
    } else if (node.type === 'random_var') {
      rows.push(this._textRow('name', node.name, v => { node.name = v.replace(/[^a-z0-9_]/gi, '_') || 'x'; }));
      rows.push(this._numRow('min', node.min, -999, 999, 1, v => { node.min = Math.floor(v); }));
      rows.push(this._numRow('max', node.max, -999, 999, 1, v => { node.max = Math.floor(v); }));
    } else if (node.type === 'define_sub' || node.type === 'call_sub') {
      rows.push(this._textRow('name', node.name, v => { node.name = v.replace(/[^a-z0-9_]/gi, '_') || 'sub'; this._showErrors(); }));
    } else if (node.type === 'read_sensor') {
      rows.push(this._textRow('into var', node.name, v => { node.name = v.replace(/[^a-z0-9_]/gi, '_') || 'dist'; this._showErrors(); }));
      rows.push(this._sensorSelectRow('sensor', node.sensor, v => { node.sensor = v; this._showErrors(); }));
    } else if (node.type === 'math_var') {
      rows.push(this._textRow('variable', node.name, v => { node.name = v.replace(/[^a-z0-9_]/gi, '_') || 'dist'; this._showErrors(); }));
      rows.push(this._enumRow('op', ['mul', 'div', 'add', 'sub'], node.op, v => { node.op = v; }));
      rows.push(this._numRow('by', node.operand, -999, 999, 0.1, v => { node.operand = v; }));
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
      this._saveHistory();
      node.cond.not = !node.cond.not;
      notBtn.classList.toggle('active', !!node.cond.not);
      this._showErrors();
    });
    div.appendChild(notBtn);

    // Sensor select — filter to what the selected brain tier supports, plus declared variables
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
    // Add variable group
    const varNames = this._collectVarNames();
    if (varNames.length) {
      const grp = document.createElement('optgroup');
      grp.label = 'VARIABLES';
      varNames.forEach(name => {
        const o = document.createElement('option');
        o.value = `var:${name}`; o.textContent = `var: ${name}`;
        if (cond.sensor === `var:${name}`) o.selected = true;
        grp.appendChild(o);
      });
      ssel.appendChild(grp);
    }
    ssel.addEventListener('change', () => {
      this._saveHistory();
      node.cond.sensor = ssel.value;
      const isVar = ssel.value.startsWith('var:');
      const s = SENSORS[ssel.value];
      node.cond.cmp   = (!isVar && s?.kind === 'digital') ? 'is' : 'gt';
      node.cond.value = (!isVar && s?.kind === 'digital') ? true : (isVar ? 0 : 0.5);
      this._renderProgram();
    });
    div.appendChild(ssel);

    // CMP select
    const isVarSensor = cond.sensor?.startsWith('var:');
    const sensor = isVarSensor ? null : SENSORS[cond.sensor];
    const csel   = document.createElement('select');
    csel.className = 'te-select';
    const ops = (!isVarSensor && sensor?.kind === 'digital') ? ['is'] : CMP_OPS.filter(c => c !== 'is');
    ops.forEach(op => {
      const o = document.createElement('option');
      o.value = op; o.textContent = CMP_LABELS[op] ?? op;
      if (op === cond.cmp) o.selected = true;
      csel.appendChild(o);
    });
    csel.addEventListener('change', () => { this._saveHistory(); node.cond.cmp = csel.value; this._showErrors(); });
    div.appendChild(csel);

    // Value widget
    if (!isVarSensor && (sensor?.kind === 'digital' || cond.cmp === 'is')) {
      const vsel = document.createElement('select');
      vsel.className = 'te-select';
      ['true', 'false'].forEach(v => {
        const o = document.createElement('option');
        o.value = v; o.textContent = v;
        if (String(cond.value) === v) o.selected = true;
        vsel.appendChild(o);
      });
      vsel.addEventListener('change', () => { this._saveHistory(); node.cond.value = vsel.value === 'true'; this._showErrors(); });
      div.appendChild(vsel);
    } else if (isVarSensor) {
      // "vs var" toggle button — switches between constant and variable comparison
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'te-cond-not' + (cond.varValue ? ' active' : '');
      toggleBtn.textContent = 'var';
      toggleBtn.title = 'Compare to another variable (toggle)';
      toggleBtn.addEventListener('click', () => {
        this._saveHistory();
        if (cond.varValue) {
          delete node.cond.varValue;
        } else {
          const names = this._collectVarNames();
          node.cond.varValue = names[0] || 'count';
        }
        this._renderProgram();
      });
      div.appendChild(toggleBtn);

      if (cond.varValue) {
        // RHS is another variable
        const rhsSel = document.createElement('select');
        rhsSel.className = 'te-select';
        this._collectVarNames().forEach(name => {
          const o = document.createElement('option');
          o.value = name; o.textContent = name;
          if (name === cond.varValue) o.selected = true;
          rhsSel.appendChild(o);
        });
        rhsSel.addEventListener('change', () => { this._saveHistory(); node.cond.varValue = rhsSel.value; this._showErrors(); });
        div.appendChild(rhsSel);
      } else {
        const inp = document.createElement('input');
        inp.type = 'number'; inp.className = 'te-num-inp';
        inp.min = -9999; inp.max = 9999; inp.step = 1;
        inp.value = cond.value ?? 0;
        inp.style.width = '60px';
        inp.addEventListener('change', () => { this._saveHistory(); node.cond.value = Number(inp.value); this._showErrors(); });
        div.appendChild(inp);
      }
    } else {
      const inp = document.createElement('input');
      inp.type = 'number'; inp.className = 'te-num-inp';
      inp.min = 0; inp.max = 1; inp.step = 0.05;
      inp.value = cond.value ?? 0.5;
      inp.style.width = '60px';
      inp.addEventListener('change', () => { this._saveHistory(); node.cond.value = Number(inp.value); this._showErrors(); });
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
    slider.addEventListener('change', () => { this._saveHistory(); });
    num.addEventListener('change', () => {
      const v = Math.min(max, Math.max(min, Number(num.value) || min));
      this._saveHistory();
      num.value = v; slider.value = v; onChange(v);
    });

    row.appendChild(slider);
    row.appendChild(num);
    return row;
  }

  _textRow(key, current, onChange) {
    const row = document.createElement('div');
    row.className = 'te-param-row';
    const lbl = document.createElement('span');
    lbl.className = 'te-param-key'; lbl.textContent = key;
    row.appendChild(lbl);
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'te-param-text'; inp.value = current;
    inp.addEventListener('change', () => { this._saveHistory(); onChange(inp.value); });
    row.appendChild(inp);
    return row;
  }

  _sensorSelectRow(key, current, onChange) {
    const row = document.createElement('div');
    row.className = 'te-param-row';
    const lbl = document.createElement('span');
    lbl.className = 'te-param-key'; lbl.textContent = key;
    row.appendChild(lbl);
    const sel = document.createElement('select');
    sel.className = 'te-select';
    const brainIdx = BRAIN_ORDER.indexOf(this._program.brain);
    SENSOR_LIST.filter(s => !s.requiresBrain || BRAIN_ORDER.indexOf(s.requiresBrain) <= brainIdx)
      .forEach(s => {
        const o = document.createElement('option');
        o.value = s.id; o.textContent = s.label;
        if (s.id === current) o.selected = true;
        sel.appendChild(o);
      });
    sel.addEventListener('change', () => { this._saveHistory(); onChange(sel.value); });
    row.appendChild(sel);
    return row;
  }

  /** Collect all variable names declared in the program (set_var / change_var / read_sensor tiles). */
  _collectVarNames() {
    const names = new Set();
    this._program.walk(n => {
      if ((n.type === 'set_var' || n.type === 'change_var' || n.type === 'math_var' || n.type === 'read_sensor') && n.name) names.add(n.name);
    });
    return [...names];
  }

  /** True if any condition in the program reads a variable via var: prefix. */
  _hasVarCond() {
    let found = false;
    this._program.walk(n => { if (n.cond?.sensor?.startsWith('var:')) found = true; });
    return found;
  }

  // ── Undo / redo ───────────────────────────────────────────────────────────

  _saveHistory() {
    const snap = JSON.stringify(this._program.toJSON());
    // Drop any forward history after current position
    this._history.splice(this._histIdx + 1);
    this._history.push(snap);
    if (this._history.length > 20) this._history.shift();
    this._histIdx = this._history.length - 1;
    this._updateUndoRedo();
  }

  _undo() {
    if (this._histIdx <= 0) return;
    this._histIdx--;
    this._program = TileProgram.fromJSON(JSON.parse(this._history[this._histIdx]));
    this._renderProgram();
    this._showErrors();
    this._updateUndoRedo();
  }

  _redo() {
    if (this._histIdx >= this._history.length - 1) return;
    this._histIdx++;
    this._program = TileProgram.fromJSON(JSON.parse(this._history[this._histIdx]));
    this._renderProgram();
    this._showErrors();
    this._updateUndoRedo();
  }

  _updateUndoRedo() {
    if (this._undoBtn) this._undoBtn.disabled = this._histIdx <= 0;
    if (this._redoBtn) this._redoBtn.disabled = this._histIdx >= this._history.length - 1;
  }

  // ── Drag / drop ───────────────────────────────────────────────────────────

  _handleDrop(list, idx) {
    const data = this._dragData;
    if (!data) return;
    this._dropOK = true;

    if (data.kind === 'new') {
      const node = makeNode(data.spec);
      if (node) { this._saveHistory(); list.splice(idx, 0, node); this._renderProgram(); this._game?.saveSystem?.markDirty(); }
    } else if (data.kind === 'move') {
      const found = this._findNode(data.nodeId);
      if (!found) return;
      this._saveHistory();
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
    if (found) { this._saveHistory(); found.list.splice(found.idx, 1); this._renderProgram(); }
  }

  _duplicateNode(id) {
    const found = this._findNode(id);
    if (!found) return;
    this._saveHistory();
    const clone = JSON.parse(JSON.stringify(found.node));
    this._freshIds([clone]);
    found.list.splice(found.idx + 1, 0, clone);
    this._renderProgram();
    this._game?.saveSystem?.markDirty();
  }

  /** Forcibly assign new UUIDs to every node in the tree (for cloning). */
  _freshIds(nodes) {
    for (const n of nodes) {
      n.id = crypto.randomUUID();
      if (n.body)     this._freshIds(n.body);
      if (n.elseBody) this._freshIds(n.elseBody);
    }
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
    if (this._codeLang === 'wiring') {
      this._codePre.style.display = 'none';
      if (this._wiringEl) {
        this._wiringEl.style.display = 'block';
        try {
          this._wiringEl.innerHTML = toWiringSVG(this._program);
        } catch (err) {
          this._wiringEl.innerHTML = `<p style="color:#f66;padding:8px;">Wiring error: ${err.message}</p>`;
        }
      }
      return;
    }
    this._codePre.style.display = '';
    if (this._wiringEl) this._wiringEl.style.display = 'none';
    try {
      this._codePre.textContent = this._codeLang === 'arduino'
        ? toArduino(this._program)
        : toMicroPython(this._program);
    } catch (err) {
      this._codePre.textContent = `// Code generation error:\n// ${err.message}`;
    }
  }

  _download() {
    if (this._codeLang === 'wiring') { this._downloadSVG(); return; }
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

  // ── WebSerial hardware bridge ─────────────────────────────────────────────

  _updateFlashBtn() {
    if (!this._flashBtn) return;
    const isPy = this._codeLang === 'micropython';
    const isSupported = new WebSerialBridge().isSupported;
    this._flashBtn.style.display = (isPy && isSupported) ? '' : 'none';
  }

  async _handleFlash() {
    if (!this._bridge || !this._bridge.isConnected) {
      await this._connectAndFlash();
    } else {
      await this._doFlash();
    }
  }

  // ── AVR109 .hex flashing (hardware bridge milestone) ─────────────────────

  async _handleHexFlash() {
    if (!this._avr.isConnected) {
      this._hexBtn.textContent = 'Connecting…';
      const conn = await this._avr.connect();
      this._hexBtn.textContent = '🔥 Flash .hex';
      if (!conn.ok) {
        // GRACEFUL DEGRADATION: the game never treats this as an error state.
        // The sim keeps running; the kid gets a friendly, honest message.
        this._game.ui?.notify(`🔌 ${conn.message}`);
        this._game.audio?.error?.();
        return;
      }
      this._game.ui?.notify(`✅ ${conn.message}`);
    }
    this._hexFile?.click();   // pick the .hex (compiled in Arduino IDE / Wokwi)
  }

  async _onHexFile() {
    const file = this._hexFile?.files?.[0];
    if (!file) return;
    this._hexFile.value = '';
    const hexText = await file.text();
    this._hexBtn.textContent = 'Flashing…';
    this._hexBtn.disabled = true;
    const res = await this._avr.flash(hexText);
    this._hexBtn.textContent = '🔥 Flash .hex';
    this._hexBtn.disabled = false;
    this._game.ui?.notify(res.ok ? `🚀 ${res.message}` : `⚠️ ${res.message}`);
    if (res.ok) {
      this._game.achievements?.track('hardware_flash', {});
      this._game.foreman?.say('hardware_flash');
      // Rivet was holding the metaphorical flashlight
      this._game.rivet?.observe('flash_success');
    }
  }

  // ── Hardware twin: live Uno pin/wiring view ──────────────────────────────

  _togglePinView() {
    this._pinOpen = !this._pinOpen;
    if (!this._pinOpen) {
      clearInterval(this._pinTimer);
      this._pinTimer = null;
      this._pinPanel?.remove();
      this._pinPanel = null;
      this._pinBtn && (this._pinBtn.style.borderColor = '');
      return;
    }
    this._pinPanel = document.createElement('div');
    this._pinPanel.id = 'te-pin-panel';
    this._pinPanel.innerHTML = `
      <div class="tp-head">
        <span>📐 HARDWARE TWIN — Arduino Uno</span>
        <span class="tp-sub">your tiles, running on real pins</span>
      </div>
      <div class="tp-body">
        <div class="tp-col" id="tp-digital"></div>
        <div class="tp-col" id="tp-analog"></div>
      </div>
      <div class="tp-legend" id="tp-legend"></div>
      <div class="tp-warn" id="tp-warn"></div>`;
    this._canvas.parentElement.appendChild(this._pinPanel);
    this._pinBtn && (this._pinBtn.style.borderColor = '#ffb020');
    this._renderPinView();
    this._pinTimer = setInterval(() => this._renderPinView(), 200);
  }

  _renderPinView() {
    const bot = this._activeBot();
    const pm = bot?.pinModel;
    if (!pm || !this._pinPanel) return;    const snap = pm.snapshot();

    const dEl = this._pinPanel.querySelector('#tp-digital');
    dEl.innerHTML = snap.digital.map(p => {
      const on = p.level === 1;
      const duty = p.pwm !== undefined && p.pwm >= 0
        ? `<span class="tp-duty">PWM ${p.pwm}</span>` : '';
      const glow = on ? (p.isLed ? ' tp-led' : ' tp-on') : '';
      const tone = p.tone ? `<span class="tp-tone">♪${p.tone}Hz</span>` : '';
      const cap = p.isPwmCapable ? '<span class="tp-pwmcap">~</span>' : '';
      return `<div class="tp-row${glow}"><span class="tp-pin">${p.pin}${cap}</span>` +
             `<span class="tp-mode">${p.mode === 'OUTPUT' ? 'OUT' : p.mode === 'INPUT' ? 'IN' : 'PULL'}</span>` +
             `<span class="tp-lvl">${on ? 'HIGH' : 'LOW'}</span>${duty}${tone}</div>`;
    }).join('');

    const aEl = this._pinPanel.querySelector('#tp-analog');
    aEl.innerHTML = snap.analog.map((p, i) => {
      const wire = Object.entries(UNO_WIRING.sensors).find(([, w]) => w.pin === `A${i}`);
      return `<div class="tp-row"><span class="tp-pin">${p.pin}</span>` +
             `<span class="tp-lvl">${p.counts}</span>` +
             `<span class="tp-volt">${p.volts}V</span>` +
             (wire ? `<span class="tp-src">${wire[1].label.split(' ')[0]}</span>` : '') + `</div>`;
    }).join('');

    const legend = this._pinPanel.querySelector('#tp-legend');
    legend.innerHTML = Object.entries(UNO_WIRING.actuators)
      .map(([k, w]) => `<span class="tp-chip">${w.pin.includes('D') || !Array.isArray(w.pin) ? (w.pin ?? '') : ''} ${w.label}</span>`)
      .join('') +
      `<span class="tp-chip">~ = PWM-capable pin (D3,5,6,9,10,11)</span>`;

    const warnEl = this._pinPanel.querySelector('#tp-warn');
    const ws = pm.warnings.slice(-3);
    warnEl.innerHTML = ws.length
      ? ws.map(w => `<div>💡 ${_esc(w)}</div>`).join('')
      : '<div style="opacity:.5">Pin notes appear here — the Uno is honest about its own limits.</div>';
  }

  // ── Quilt view: the FLIP ─────────────────────────────────────────────

  _toggleQuilt() {
    this._quiltOpen = !this._quiltOpen;
    if (!this._quiltOpen) {
      clearInterval(this._quiltTimer);
      this._quiltTimer = null;
      this._quiltView?.destroy();
      this._quiltView = null;
      this._quiltBtn && (this._quiltBtn.style.borderColor = '');
      return;
    }
    this._quiltView = new QuiltView(this._canvas.parentElement, this._quiltSheet);
    this._quiltBtn && (this._quiltBtn.style.borderColor = '#7dd3fc');
    const tick = () => this._updateQuilt();
    tick();
    this._quiltTimer = setInterval(tick, 200);
  }

  _updateQuilt() {
    const bot = this._activeBot();
    const rt = bot?._runtime;
    const robot = rt?.robot;
    const world = rt?.world;
    if (!this._quiltView) return;

    const sensors = world && robot ? {
      distance_ahead: world.distanceAhead?.(robot.x, robot.z, robot.heading) ?? 0,
      light:          world.lightAt?.(robot.x, robot.z) ?? 0,
      temperature:    world.temperatureAt?.(robot.x, robot.z) ?? 0,
      line_under:     !!world.lineUnder?.(robot.x, robot.z),
      motion_nearby:  (world.playerDistance?.(robot.x, robot.z) ?? 999) < 4,
    } : undefined;

    this._quiltSheet.update({
      robot:   robot ?? undefined,
      sensors,
      program: rt ? {
        tileLabel:    this._activeTileLabel(rt),
        stepsPerSec:  rt.stepsPerSec ?? 0,
        budgetPct:    rt.budgetPct ?? 0,
        beeps:        this._quiltBeeps(rt),
      } : undefined,
      pins:    bot?.pinModel?.snapshot(),
      companions: this._game?.companions?.quilt(),
      heart: {
        name:  bot?.personality?.name,
        bond:  Math.floor((bot?.personality?.bond ?? 0) / 25),
        dents: bot?.ledger?.dents?.length ?? 0,
        laps:  bot?.ledger?.countMilestones?.('lap_complete') ?? 0,
      },
    });
    this._quiltView.render();
  }

  _activeTileLabel(rt) {
    if (!rt?.vm || !rt.sourceMap) return '—';
    let activeId = null;
    for (const e of rt.sourceMap) {
      if (e.pc <= rt.vm.pc) activeId = e.nodeId;
      else break;
    }
    if (!activeId) return '—';
    const node = this._findNode(this._program?.nodes ?? [], activeId);
    if (!node) return '—';
    const bits = [node.type];
    if (node.prim) bits.push(node.prim);
    if (node.cond?.sensor) bits.push(`if ${node.cond.sensor}`);
    if (node.seconds !== undefined) bits.push(`${node.seconds}s`);
    if (node.type === 'forever') return 'forever ∞';
    return bits.join(' ');
  }

  _findNode(nodes, id) {
    for (const n of nodes) {
      if (n.id === id) return n;
      const inBody = n.body ? this._findNode(n.body, id) : null;
      if (inBody) return inBody;
      const inElse = n.elseBody ? this._findNode(n.elseBody, id) : null;
      if (inElse) return inElse;
    }
    return null;
  }

  _quiltBeeps(rt) {
    // best-effort: count beep events since view opened
    if (!rt) return 0;
    this._qBeepTotal ??= 0;
    const evs = rt.drainEvents ? [] : [];   // events drained by Game; approximate via robot.events length
    this._qBeepTotal += (rt.robot?.events ?? []).filter(e => e.kind === 'beep').length;
    return this._qBeepTotal;
  }

  // ── The heart: Bot Card (name, dents, repairs, milestones, retirement) ───

  _toggleBotCard() {
    if (this._botCardEl) { this._botCardEl.remove(); this._botCardEl = null; return; }
    const bot = this._activeBot();
    const ledger = bot?.ledger;
    const el = document.createElement('div');
    el.id = 'bot-card';
    el.className = 'bot-card';
    this._botCardEl = el;
    document.body.appendChild(el);

    if (!ledger) {
      el.innerHTML = `<div class="bc-card"><div class="bc-head">💛 BOT CARD</div>
        <div class="bc-empty">No bot with a brain yet.<br>Craft a robot_helper, give it a program, and press ▶ Run.<br><br>When it thinks for the first time, it becomes <i>someone</i>.</div>
        <button class="bc-close">Close</button></div>`;
      el.querySelector('.bc-close').addEventListener('click', () => this._toggleBotCard());
      return;
    }

    const shelf = BotShelf.list();
    const dents = ledger.dents.slice(-6).reverse();
    const repairs = ledger.repairs.slice(-5).reverse();
    const miles = ledger.milestones.slice(-9).reverse();
    const ago = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : Math.round(m / 60) + 'h ago'; };

    el.innerHTML = `<div class="bc-card">
      <div class="bc-head">💛 ${_esc(ledger.name)}
        <span class="bc-slot">${bot === this._game.scrapBot ? 'Bot 1' : 'Bot 2'}</span>
        <button class="bc-close">✕</button>
      </div>
      ${ledger.isRetired ? `<div class="bc-retired">🏅 RETIRED — "${_esc(ledger.epitaph ?? '')}"</div>` : ''}

      <div class="bc-rename">
        <input id="bc-name" maxlength="24" value="${_esc(ledger.name)}" placeholder="name your bot" />
        <button id="bc-rename">Rename</button>
      </div>

      <div class="bc-stats">
        <div class="bc-stat"><b>${ledger.dents.length}</b><span>dents</span></div>
        <div class="bc-stat"><b>${ledger.repairs.length}</b><span>repairs</span></div>
        <div class="bc-stat"><b>${ledger.laps}</b><span>laps</span></div>
        <div class="bc-stat"><b>${Math.floor(ledger.runtimeS)}s</b><span>run time</span></div>
      </div>

      <div class="bc-sec">🔨 DENTS (the good stories)</div>
      ${dents.length ? dents.map(d => `<div class="bc-li">💥 at (${d.x}, ${d.z}) · speed ${Math.round(d.speed * 100)}% · ${ago(d.at)}</div>`).join('')
                      : '<div class="bc-dim">none yet — suspiciously careful driving</div>'}

      ${(() => {
        // ── Dumpster-Fire Panic Button (fun-review #5) ──
        // 3+ crashes without a completed task → the big red button. Not a fix — a recovery toy.
        const panic = this._game?.panicStatusFor?.(bot);
        if (!panic?.show) return '';
        if (!panic.enabled) {
          const mins = Math.ceil(panic.cooldownRemainingMs / 60000);
          return `<div class="bc-sec">🚨 PANIC</div>
            <button id="bc-panic" disabled style="width:100%;padding:10px;margin:4px 0 8px;
              background:#3a0d0d;color:#a66;border:2px solid #733;border-radius:8px;
              font-family:inherit;font-size:13px;font-weight:bold;letter-spacing:2px;cursor:not-allowed;">
              🔥 PANIC — cooling down (${mins}m)</button>`;
        }
        return `<div class="bc-sec">🚨 PANIC</div>
          <button id="bc-panic" style="width:100%;padding:12px;margin:4px 0 8px;
            background:#c62828;color:#fff;border:2px solid #ff5252;border-radius:8px;
            font-family:inherit;font-size:15px;font-weight:bold;letter-spacing:3px;cursor:pointer;
            box-shadow:0 0 18px rgba(255,40,40,0.45); animation:bpanic 0.9s ease-in-out infinite alternate;">
            🚨 PANIC — ROCKET OVERDRIVE 🚨</button>
          <div class="bc-dim" style="margin-bottom:6px">${panic.crashCount} crashes, no completed task. Push it. You know you want to. (Smoke, speed, smashes 5 junk blocks, pops a loot cache. 5 min cooldown.)</div>`;
      })()}

      <div class="bc-sec">🔧 REPAIR LOG</div>
      ${repairs.length ? repairs.map(r => `<div class="bc-li">🩹 ${r.dentsFixed} dent${r.dentsFixed > 1 ? 's' : ''} fixed (${r.tool}) · ${ago(r.at)}</div>`).join('')
                       : '<div class="bc-dim">no repairs needed so far</div>'}

      <div class="bc-sec">⭐ MILESTONES REMEMBERED</div>
      ${miles.length ? miles.map(m => `<div class="bc-li">⭐ ${_esc(MILE_LABEL[m.id] ?? m.id)}${m.detail ? ' — ' + _esc(m.detail) : ''} · ${ago(m.at)}</div>`).join('')
                     : '<div class="bc-dim">the first one is out there waiting</div>'}

      ${!ledger.isRetired ? `
      <div class="bc-sec">🎖 RETIREMENT</div>
      <div class="bc-dim" style="margin-bottom:4px">A retired bot goes to the shelf with its stats frozen and its name honored — forever. Needs 60s+ of run time.</div>
      <div class="bc-rename">
        <input id="bc-epitaph" maxlength="140" placeholder="epitaph — e.g. 'Never once found the waypoint. Never once stopped trying.'" />
        <button id="bc-retire">Retire to shelf</button>
      </div>` : ''}

      <div class="bc-sec">📚 THE RETIREMENT SHELF</div>
      ${shelf.length ? shelf.slice(0, 6).map(s => `<div class="bc-li">🏅 <b>${_esc(s.name)}</b> — "${_esc(s.epitaph)}" · ${s.laps} laps · ${s.totalDents} dents · ${Math.floor(s.runtimeS)}s</div>`).join('')
                     : '<div class="bc-dim">empty for now. The first bot you retire will live here.</div>'}
    </div>`;

    el.querySelector('.bc-close').addEventListener('click', () => this._toggleBotCard());
    el.querySelector('#bc-panic')?.addEventListener('click', () => {
      const fired = this._game?.triggerPanic?.(bot);
      if (!fired) this._game?.ui?.notify?.('🚨 PANIC not ready — still cooling down.');
      else { this._toggleBotCard(); this._toggleBotCard(); }   // re-render (button gone, cooldown started)
    });
    el.querySelector('#bc-rename')?.addEventListener('click', () => {
      const v = el.querySelector('#bc-name').value.trim();
      if (v && ledger.rename(v)) {
        if (bot?.personality) bot.personality.name = v;
        this._game.ui?.notify(`💛 Renamed to "${v}".`);
        this._toggleBotCard(); this._toggleBotCard();   // re-render
      }
    });
    el.querySelector('#bc-retire')?.addEventListener('click', () => {
      const epitaph = el.querySelector('#bc-epitaph').value.trim() || 'A good bot.';
      const entry = ledger.retire(epitaph);
      if (!entry) {
        this._game.ui?.notify(ledger.isRetired ? 'Already enjoying retirement.' : 'Not yet — let it run at least 60 seconds first.');
        return;
      }
      this._game.achievements?.track('bot_retired', {});
      this._game.xpSystem?.gain(100);
      this._game.ui?.notify(`🏅 ${entry.name} retired to the shelf. "${entry.epitaph}" — ${entry.laps} laps, ${entry.totalDents} dents, ${entry.milestones} milestones. Honored forever.`);
      this._game.foreman?.say?.('bot_retire');
      this._toggleBotCard(); this._toggleBotCard();
    });
  }

  async _connectAndFlash() {
    this._setFlashStatus('connecting');
    try {
      this._bridge = new WebSerialBridge();
      this._bridge.onStatus = (s) => this._setFlashStatus(s);
      this._bridge.onLine   = (line) => this._appendSerial(line);
      await this._bridge.connect();
      this._appendSerial('─── Connected ───');
      await this._doFlash();
    } catch (e) {
      if (e.name === 'NotFoundError') {
        // User cancelled port picker — clean up silently.
        this._bridge = null;
        this._setFlashStatus('disconnected');
      } else {
        this._appendSerial(`⚠ Connect failed: ${e.message}`);
        this._setFlashStatus('error');
      }
    }
  }

  async _doFlash() {
    if (!this._bridge?.isConnected) return;
    try {
      const code = toMicroPython(this._program);
      await this._bridge.flash(code);
      this._appendSerial('─── Flashed ───');
      this._game.achievements?.track('hardware_flash', {});
      this._game.xpSystem?.gain(30);
      this._game.ui?.notify('⚡ Flashed to device! Check your serial monitor.');
      this._game.foreman?.say('hardware_flash');
      this._showFlashReceipt();
    } catch (e) {
      this._appendSerial(`⚠ Flash failed: ${e.message}`);
      this._setFlashStatus('error');
    }
  }

  _setFlashStatus(status) {
    this._flashStatus = status;
    if (!this._flashBtn) return;

    const LABEL = {
      disconnected: '⚡ Flash to Device',
      connecting:   'Connecting…',
      connected:    '⚡ Flash',
      flashing:     'Flashing…',
      running:      '▶ Re-Flash',
      error:        '⚠ Retry Flash',
    };
    const DISABLED = { connecting: true, flashing: true };

    this._flashBtn.textContent  = LABEL[status] ?? '⚡ Flash to Device';
    this._flashBtn.disabled     = !!DISABLED[status];
    this._flashBtn.dataset.status = status;

    // Show/hide serial monitor
    const show = status !== 'disconnected';
    if (this._serialEl) this._serialEl.style.display = show ? 'flex' : 'none';

    // Update status indicator inside serial monitor
    const indicator = this._serialEl?.querySelector('#te-serial-status');
    if (indicator) {
      const STATUS_LABEL = { connected: '● Connected', flashing: '⚡ Flashing', running: '▶ Running', error: '⚠ Error' };
      indicator.textContent = STATUS_LABEL[status] ?? '● ' + status;
      indicator.dataset.status = status;
    }
  }

  _showPrintOutput(name, value) {
    // Show the serial monitor panel for virtual-run print output, then append line
    if (this._serialEl && this._serialEl.style.display === 'none') {
      this._serialEl.style.display = 'flex';
    }
    const disp = typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(3)) : value;
    this._appendSerial(`${name} = ${disp}`);
  }

  _showScore(total, delta) {
    if (this._serialEl && this._serialEl.style.display === 'none') {
      this._serialEl.style.display = 'flex';
    }
    this._appendSerial(`⭐ +${delta}  (score: ${total})`);
  }

  _appendSerial(line) {
    if (!this._serialLinesEl) return;
    const ts = new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');
    entry.className = 'tse-line';
    entry.innerHTML = `<span class="tse-ts">${ts}</span><span class="tse-text">${line.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`;
    this._serialLinesEl.appendChild(entry);
    // Keep last 60 lines
    while (this._serialLinesEl.children.length > 60) this._serialLinesEl.firstChild.remove();
    this._serialLinesEl.scrollTop = this._serialLinesEl.scrollHeight;
  }

  _clearSerial() {
    if (this._serialLinesEl) this._serialLinesEl.innerHTML = '';
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

  _showFlashReceipt() {
    const fr = document.getElementById('flash-receipt');
    if (!fr) return;

    const prog = this._program;
    const bot  = this._activeBot();
    const rt   = bot?._runtime;
    const vm   = rt?.vm;

    // Program identity
    document.getElementById('fr-prog-name').textContent = prog.name || 'My Brain';
    document.getElementById('fr-brain-badge').textContent =
      ({ tin: 'TIN BRAIN', spark: 'SPARK BRAIN', vision: 'VISION BRAIN' }[prog.brain] ?? prog.brain.toUpperCase()) + ' ▲';

    // Efficiency grade from budgetPct
    const budget = rt?.budgetPct ?? 0;
    const gradeEl = document.getElementById('fr-grade-badge');
    let grade = 'D', gradeColor = '#f44336', gradeBg = '#180808';
    if      (budget < 5)  { grade = 'A+'; gradeColor = '#44ffaa'; gradeBg = '#041808'; }
    else if (budget < 20) { grade = 'A';  gradeColor = '#44ee88'; gradeBg = '#041408'; }
    else if (budget < 50) { grade = 'B';  gradeColor = '#aadd44'; gradeBg = '#0c1404'; }
    else if (budget < 80) { grade = 'C';  gradeColor = '#f0b429'; gradeBg = '#181002'; }
    gradeEl.textContent = grade;
    gradeEl.style.color = gradeColor;
    gradeEl.style.background = gradeBg;
    gradeEl.style.border = `1px solid ${gradeColor}44`;

    // Stats row
    let tileCount = 0;
    prog.walk?.(() => tileCount++);
    const { actuators, sensors } = prog.usedPrimitives();
    const statsEl = document.getElementById('fr-stats-row');
    const stat = (val, lbl) =>
      `<div class="fr-stat"><div class="fr-stat-val">${val}</div><div class="fr-stat-lbl">${lbl}</div></div>`;
    statsEl.innerHTML =
      stat(tileCount,        'TILES') +
      stat(sensors.length,   'SENSORS') +
      stat(actuators.length, 'ACTUATORS') +
      stat(vm ? `${budget}%` : '—', 'BUDGET') +
      stat(grade,            'GRADE');

    // Generated code preview (first 24 lines)
    const arduino = toArduino(prog);
    const lines   = arduino.split('\n').slice(0, 24);
    const codeEl  = document.getElementById('fr-code');
    codeEl.innerHTML = lines.map(l =>
      l.startsWith('//') ? `<span class="fr-comment">${l.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`
                         : l.replace(/</g,'&lt;').replace(/>/g,'&gt;')
    ).join('\n') + (arduino.split('\n').length > 24 ? '\n<span class="fr-comment">// … (see full code in &lt;/&gt; CODE view)</span>' : '');

    fr.classList.add('show');
    this._game.achievements?.track('receipt_view', {});
    this._game.foreman?.onEvent('receipt_view', {});
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
    // Variable achievement + challenge + XP tracking
    const varNames = this._collectVarNames();
    const hasCond  = this._hasVarCond();
    if (varNames.length > 0) {
      this._game.achievements?.track('var_program_run', {
        varCount: varNames.length,
        hasCond,
      });
      this._game.challenge?.onVariableProgram?.(varNames.length, hasCond);
      this._game.challengeSystem?.onVariableProgramRun?.(varNames.length > 0, hasCond);
      this._game.xpSystem?.trackVariables(varNames);
      // Earl one-shot reactions
      if (!this._earlSaidVar) {
        this._earlSaidVar = true;
        this._game.foreman?.onEvent('first_variable_program', {});
      }
      if (hasCond && !this._earlSaidVarCond) {
        this._earlSaidVarCond = true;
        setTimeout(() => this._game.foreman?.onEvent('variable_cond_used', {}), 3000);
      }
    }
    // Notify challenge system about which sensors are in use
    const sensorIds = bot._extractSensorIds?.(this._program?.nodes ?? []) ?? new Set();
    this._game.challenge?.onBrainLoaded(sensorIds);
    this._game.xpSystem?.gain(15);
    this._btnRun.disabled  = true;
    this._btnStop.disabled = false;
    this._running = true;
    if (!this._rafId) this._rafId = requestAnimationFrame(() => this._tickHL());

    // Rivet counts every program run — and notices line-following specifically
    this._game.rivet?.observe('program_run', {
      note: sensorIds.size ? [...sensorIds].join('+') : 'basic',
    });
    if (sensorIds.has('line_under')) {
      this._game.rivet?.state.markNudgeDone('line_follow');
    }

    // One-shot tutorial callback
    if (this.onFirstRun) { this.onFirstRun(); this.onFirstRun = null; }
  }

  _stop() {
    // Read variable peak before clearBrain wipes the runtime
    const rt = this._activeBot()?.makerRuntime;
    const vars = rt?.vm?.vars ?? {};
    const peak = Object.values(vars).reduce((m, v) => Math.max(m, Number(v) || 0), 0);
    if (peak > 0) this._game.achievements?.track('var_peak_value', { value: peak });

    this._activeBot()?.clearBrain();
    this._game.audio?.brainStop();
    this._running = false;
    this._btnRun.disabled  = false;
    this._btnStop.disabled = true;
    this._clearHL();
    this._exitStepMode();
    if (this._sensorsEl) this._sensorsEl.style.display = 'none';
    if (this._statsEl)   this._statsEl.style.display   = 'none';
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
      this._refreshStats(rt);
    } else {
      this._clearHL();
      if (this._sensorsEl) this._sensorsEl.style.display = 'none';
      if (this._statsEl)   this._statsEl.style.display   = 'none';
    }

    this._rafId = requestAnimationFrame(() => this._tickHL());
  }

  _clearHL() {
    this._canvas.querySelectorAll('.te-active').forEach(el => el.classList.remove('te-active'));
    this._canvas.querySelectorAll('.te-step-active').forEach(el => el.classList.remove('te-step-active'));
    this._activeId = null;
  }

  _refreshSensors(rt) {
    if (!this._sensorsEl) return;
    const robot = rt.robot;
    const world = rt.world;
    if (!robot || !world) return;

    // Read all sensors that exist on the world adapter
    const dist = world.distanceAhead?.(robot.x, robot.z, robot.heading) ?? null;
    const coreSensors = [
      { key: 'distance',   val: dist, kind: 'analog' },
      { key: 'brightness', val: world.lightAt?.(robot.x, robot.z) ?? null, kind: 'analog' },
      { key: 'bumped',     val: dist !== null ? dist < 0.08 : null, kind: 'digital' },
      { key: 'player',     val: (world.playerDistance?.(robot.x, robot.z) ?? 999) < 4, kind: 'digital' },
      { key: 'line',       val: world.lineUnder?.(robot.x, robot.z) ?? null, kind: 'digital' },
      { key: 'temp',       val: world.temperatureAt?.(robot.x, robot.z) ?? null, kind: 'analog' },
    ].filter(r => r.val !== null && r.val !== undefined);
    // Context sensors only shown when active (non-zero means something interesting)
    const contextSensors = [
      { key: 'beacon',  val: world.beaconSignal?.(robot.x, robot.z) ?? null, kind: 'analog' },
      { key: 'weather', val: world.weatherIntensity?.() ?? null, kind: 'analog' },
    ].filter(r => r.val !== null && r.val !== undefined && r.val > 0);
    const readings = [...coreSensors, ...contextSensors];
    this._lastSensors = readings;

    // Heading compass (N/NE/E/SE/S/SW/W/NW)
    const hdgDeg = ((robot.heading ?? 0) * 180 / Math.PI + 360) % 360;
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    const hdgLabel = dirs[Math.round(hdgDeg / 45) % 8];
    const posLabel = `(${robot.x?.toFixed(1)}, ${robot.z?.toFixed(1)})`;

    const varEntries = Object.entries(rt.vm?.vars ?? {});
    const varHtml = varEntries.length
      ? `<div class="te-sensor-row te-var-header"><span style="color:#88aaff;font-size:9px;letter-spacing:0.05em">VARIABLES</span></div>`
        + varEntries.map(([name, val]) =>
          `<div class="te-sensor-row"><span class="te-sensor-key" style="color:#88aaff">${_esc(name)}</span>`
        + `<span class="te-sensor-val" style="color:#aaccff">${Number.isInteger(val) ? val : val.toFixed(2)}</span>`
        + `<div class="te-sensor-bar"><div class="te-sensor-fill" style="width:${Math.min(100, Math.abs(val / 10) * 100).toFixed(0)}%;background:#3355aa"></div></div></div>`
        ).join('')
      : '';

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
    }).join('') + varHtml;
  }

  _refreshStats(rt) {
    if (!this._statsEl) return;
    const vm = rt?.vm;
    if (!vm) { this._statsEl.style.display = 'none'; return; }

    const ms      = rt.elapsedMs ?? 0;
    const secs    = Math.floor(ms / 1000);
    const mins    = Math.floor(secs / 60);
    const timeStr = mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;

    const steps   = vm.steps;
    const budget  = rt.budgetPct ?? 0;
    const sensors = vm.sensorReads ?? 0;
    const motors  = vm.motorActs   ?? 0;

    // Efficiency grade: lower budget use = leaner program = better grade
    let grade = 'A'; let gradeColor = '#00ff88';
    if      (budget < 5)  { grade = 'A+'; gradeColor = '#00ffaa'; }
    else if (budget < 20) { grade = 'A';  gradeColor = '#00ff88'; }
    else if (budget < 50) { grade = 'B';  gradeColor = '#88cc44'; }
    else if (budget < 80) { grade = 'C';  gradeColor = '#f0b429'; }
    else                  { grade = 'D';  gradeColor = '#f44336'; }
    this._lastGrade = grade;

    this._statsEl.style.display = 'flex';
    this._statsEl.innerHTML =
      `<div class="te-stat-item"><span class="te-stat-lbl">RUNTIME</span><span class="te-stat-val">${timeStr}</span></div>`
    + `<div class="te-stat-item"><span class="te-stat-lbl">STEPS</span><span class="te-stat-val">${steps.toLocaleString()}</span></div>`
    + `<div class="te-stat-item"><span class="te-stat-lbl">BUDGET</span><span class="te-stat-val">${budget}%</span></div>`
    + `<div class="te-stat-item"><span class="te-stat-lbl">SENSORS</span><span class="te-stat-val">${sensors.toLocaleString()}</span></div>`
    + `<div class="te-stat-item"><span class="te-stat-lbl">MOTORS</span><span class="te-stat-val">${motors.toLocaleString()}</span></div>`
    + `<div class="te-stat-item"><span class="te-stat-lbl">EFFICIENCY</span><span class="te-stat-val" style="color:${gradeColor}">${grade}</span></div>`;
  }

  // ── Spark panel ───────────────────────────────────────────────────────────

  _toggleSpark() {
    if (!this._sparkPanel) return;
    this._sparkOpen = !this._sparkOpen;
    this._sparkPanel.style.display = this._sparkOpen ? 'flex' : 'none';
    const btn = this._panel.querySelector('#te-spark-btn');
    if (btn) { btn.style.borderColor = this._sparkOpen ? '#00ccff' : ''; btn.style.color = this._sparkOpen ? '#00ccff' : ''; }
    if (this._sparkOpen) {
      this._showDailyChallenge();
      // Play greeting on first open per session
      if (this._sparkFirstOpen) {
        this._sparkFirstOpen = false;
        this._playSparkGreeting();
      }
    }
  }

  async _playSparkGreeting() {
    try {
      const worker = localStorage.getItem('scrapcraft_voice_worker') ?? 'https://scrap-voice.casey-digennaro.workers.dev';
      const res = await fetch(`${worker}/bank/spark-greeting`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const blob = await res.blob();
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        const arrayBuf = await blob.arrayBuffer();
        const audioData = await ctx.decodeAudioData(arrayBuf);
        const source = ctx.createBufferSource();
        source.buffer = audioData;
        const gain = ctx.createGain();
        gain.gain.value = 0.7;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start(0);
      }
    } catch (_) {
      // Silently fail if no greeting available
    }
  }

  /** Fetch today's challenge + failure wall from scrap-spark; show once per open. */
  async _showDailyChallenge() {
    if (!this._sparkLog || this._dcShown) return;
    const dc = await this._spark?.cloud?.dailyChallenge?.();
    if (!dc?.challenge) return;
    this._dcShown = true;
    const fails = (dc.failure_of_the_week ?? []).slice(0, 2)
      .map(f => `💥 <b>${_esc(String(f.title ?? '')).slice(0, 60)}</b> (${f.likes ?? 0} 🧡)`)
      .join('<br>');
    const div = document.createElement('div');
    div.className = 'sp-msg sp-hint';
    div.style.cssText = 'border-left:3px solid #ffb020;padding-left:8px;opacity:.95';
    div.innerHTML = `🎯 <b>DAILY MISSION — ${_esc(dc.challenge.title)}</b><br>${_esc(dc.challenge.brief)}` +
      (fails ? `<br><span style="opacity:.8">Most Interesting Failures of the Week:</span><br>${fails}` : '') +
      `<br><span style="opacity:.6">Failures are publishable art. Crash loud, learn loud.</span>`;
    this._sparkLog.prepend(div);
  }

  /** Called by Spark, share-link loader, or SaveSystem restore when building a program. */
  loadProgram(program) {
    this._program = program;
    this._assignIds(this._program.nodes);
    if (this._nameIn)   this._nameIn.value   = program.name  ?? 'Spark Brain';
    if (this._brainSel) this._brainSel.value = program.brain ?? 'tin';
    // Seed undo history with the new program as the baseline
    this._history = [JSON.stringify(program.toJSON())];
    this._histIdx = 0;
    this._updateUndoRedo();
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
    this._exitStepMode();
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    // Workshop OOM hardening — dispose live sub-views on close. Quilt (X-RAY)
    // and pin views each run a 200ms interval + their own DOM; leaving them
    // alive behind a hidden panel leaks memory in fragile environments.
    if (this._quiltOpen) this._toggleQuilt();
    if (this._pinOpen)   this._togglePinView();
  }

  // ── Step debugger ─────────────────────────────────────────────────────────

  _handleStep() {
    if (this._running) return; // can't step while live-running
    if (!this._stepMode) {
      this._enterStepMode();
    } else {
      this._stepOnce();
    }
  }

  _enterStepMode() {
    const result = compile(this._program);
    if (!result.ok && result.errors.length) {
      this._game.ui?.notify('⚠ Fix errors before stepping.');
      return;
    }
    const bot = this._activeBot();
    const pos  = bot?._pos ?? { x: 64, z: 64 };
    const robot = new VirtualRobot({ x: pos.x, z: pos.z, heading: 0 });
    const world = bot?._runtime?.world ?? {};
    this._debugRt = {
      vm:        new TileVM(result.bytecode, robot, world),
      sourceMap: result.sourceMap,
    };
    this._stepMode = true;
    if (this._stepBtn) {
      this._stepBtn.textContent = '▷ STEP';
      this._stepBtn.style.borderColor = '#f0b429';
      this._stepBtn.style.color = '#f0b429';
    }
    if (this._stepInfoEl) this._stepInfoEl.style.display = 'flex';
    this._updateStepHighlight();
  }

  _exitStepMode() {
    if (!this._stepMode) return;
    this._stepMode = false;
    this._debugRt  = null;
    this._clearHL();
    if (this._stepBtn) {
      this._stepBtn.textContent = '▷ STEP';
      this._stepBtn.style.borderColor = '';
      this._stepBtn.style.color = '';
    }
    if (this._stepInfoEl) this._stepInfoEl.style.display = 'none';
  }

  _stepOnce() {
    if (!this._debugRt) return;
    const { vm, sourceMap } = this._debugRt;
    if (vm.halted) {
      this._game.ui?.notify('Program halted — click STEP to restart.');
      this._exitStepMode();
      this._enterStepMode();
      return;
    }
    vm.stepOneNode(sourceMap);
    this._updateStepHighlight();
  }

  _updateStepHighlight() {
    if (!this._debugRt) return;
    const { vm, sourceMap } = this._debugRt;
    this._clearHL();
    const pc = vm.pc;
    let activeId = null;
    for (const e of sourceMap) {
      if (e.pc <= pc) activeId = e.nodeId;
      else break;
    }
    if (activeId) {
      const el = this._canvas.querySelector(`[data-node-id="${activeId}"]`);
      el?.classList.add('te-step-active');
      this._activeId = activeId;
    }
    const instr = vm.code[pc];
    if (this._stepInfoEl) {
      const varStr = Object.entries(vm.vars ?? {})
        .map(([k, v]) => `${k}=${Number.isInteger(v) ? v : v.toFixed(2)}`).join(' ');
      const base = vm.halted
        ? '⏹ HALTED — click STEP to reset'
        : `PC=${pc} op=${instr?.op ?? '?'} ${_instrSummary(instr)}`;
      this._stepInfoEl.textContent = varStr ? `${base}  |  ${varStr}` : base;
    }
  }

  get isOpen()      { return this._open; }
  get isRunning()   { return !!this._runtime?.running; }
  get lastSensors() { return this._lastSensors ?? []; }
  get lastGrade()   { return this._lastGrade ?? null; }
  get lastBudgetPct() { return this._runtime?.budgetPct ?? 0; }
}
