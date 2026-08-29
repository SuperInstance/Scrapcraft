/**
 * ───────────────────────────────────────────────────────────────────────────
 *  JR EDITOR  —  Scrapcraft Jr: icon-block programming for ages 6–10
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  Big chunky icon tiles. No reading required. Tap-to-place, drag-to-trash.
 *  Layered ON TOP of the Maker Bench (tile editor) — a 🧒 JR button in its
 *  header opens this; a ⬆ BIG KID button here hands the SAME program to the
 *  tile editor (converted), so a kid graduates without losing their bot.
 *
 *  Everything executes through the standard Maker Lab path:
 *      JrProgram.toTileProgram() → compile() → ScrapBot.setBrain()
 *  …which is also what toArduino()/toMicroPython() export from.
 *
 *  Design constraints (see docs/DEV_GUIDE_jr_mode.md):
 *    • one tap = one action (no dialogs, no sliders, no reading)
 *    • motor/light/sound blocks are CRAFT-GATED (build the part, earn the block)
 *    • repeat caps at 4, no nested loops, sequence caps at 16
 *    • touch-first: every drag affordance has a tap twin (✕, badges)
 */

import { JrProgram, EXAMPLE_JR_ZIGZAG } from './JrProgram.js';
import { JR_BLOCKS, JR_REPEAT_CAP, jrUnlockedBlocks, isBodyBlock } from './JrBlocks.js';
import { compile, toArduino, toMicroPython } from '../maker/index.js';
import { getItem } from '../data/items.js';

const LS_KEY = 'scrapcraft_jr_program';

const LIGHT_COLOR = { green: '#3f6', blue: '#39f', red: '#f55', off: '#555' };

export class JrEditor {
  constructor(game) {
    this._game   = game;
    this._open   = false;
    this._el     = null;      // built lazily on first open
    this._program = null;
    this._selRepeat = null;   // index of the repeat block whose body is the tap target
    this._showcase = null;

    // restore last program (or seed the first-timer with the zig-zag)
    try {
      const raw = localStorage.getItem(LS_KEY);
      this._program = raw ? JrProgram.fromJSON(JSON.parse(raw)) : null;
    } catch { this._program = null; }
    if (!this._program || !Array.isArray(this._program.steps) || !this._program.steps.length) {
      this._program = EXAMPLE_JR_ZIGZAG;
    }
  }

  get isOpen() { return this._open; }
  get program() { return this._program; }

  open() {
    if (!this._el) this._buildDOM();
    if (document.pointerLockElement) document.exitPointerLock();   // free the mouse for tapping
    this._el.style.display = 'flex';
    this._open = true;
    this._game?.observer?.menuOpen?.('jr_mode');
    this._render();
    // If the bot already finished (or never ran), GO! is ready again
    if (!this._game.scrapBot?._runtime) {
      const runBtn = this._el.querySelector('.jr-btn-run');
      const stopBtn = this._el.querySelector('.jr-btn-stop');
      if (runBtn) runBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    }
  }

  close() {
    if (!this._el || !this._open) return;
    this._el.style.display = 'none';
    this._open = false;
    this._selRepeat = null;
    this._game?.observer?.menuClose?.('jr_mode');
    this._showcase?.close();
  }

  /**
   * Called by Game.onCraft — crafting a gated part may unlock new blocks.
   * This is the crafting→programming loop: build the part, earn the block.
   */
  onCrafted(output) {
    if (!this._el) return;
    const gates = Object.values(JR_BLOCKS).filter(b => b.gate === output);
    if (!gates.length) return;
    this._render();   // refresh lock states
    const def = getItem(output);
    this._game.ui?.notify(`${def?.icon ?? '🔧'} New Jr block unlocked: ${gates.map(g => g.icon).join(' ')} — press <b>T</b> then 🧒 JR!`);
    this._game.audio?.achievement?.();
  }

  // ── Private: DOM ─────────────────────────────────────────────────────────

  _buildDOM() {
    const el = document.createElement('div');
    el.id = 'jr-editor';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="jr-header">
        <span class="jr-logo">🧒 SCRAPCRAFT <b>JR</b></span>
        <input class="jr-name" type="text" maxlength="24" aria-label="bot name" spellcheck="false" />
        <div class="jr-header-actions">
          <button class="jr-btn jr-btn-run">▶ GO!</button>
          <button class="jr-btn jr-btn-stop" disabled>■ STOP</button>
          <button class="jr-btn jr-btn-code" title="see the real code">⌨ CODE</button>
          <button class="jr-btn jr-btn-show" title="show my bot to the yard">🌟 SHOW</button>
          <button class="jr-btn jr-btn-bigkid" title="open the Maker Bench (big kids)">⬆ BIG KID</button>
          <button class="jr-btn jr-btn-close">✕</button>
        </div>
      </div>
      <div class="jr-body">
        <div class="jr-tray" id="jr-tray"></div>
        <div class="jr-canvas-wrap">
          <div class="jr-flag-hint"><span class="jr-flag">🏁</span> tap blocks to build ↓</div>
          <div class="jr-seq" id="jr-seq"></div>
          <div class="jr-trash" id="jr-trash">🗑️<span>drag here to throw away</span></div>
        </div>
      </div>
      <div class="jr-code" id="jr-code" style="display:none">
        <div class="jr-code-tab">Arduino (.ino)</div><pre class="jr-code-pre" id="jr-ino"></pre>
        <div class="jr-code-tab">MicroPython (.py)</div><pre class="jr-code-pre" id="jr-py"></pre>
        <div class="jr-code-note">this is the real firmware — flash it to a real robot!</div>
      </div>`;
    document.body.appendChild(el);
    this._el = el;
    this._injectCSS();

    el.querySelector('.jr-name').value = this._program.name;
    el.querySelector('.jr-name').addEventListener('input', (e) => {
      this._program.name = e.target.value || 'My Jr Bot';
      this._save();
    });
    el.querySelector('.jr-btn-run').addEventListener('click', () => this._run());
    el.querySelector('.jr-btn-stop').addEventListener('click', () => this._stop());
    el.querySelector('.jr-btn-code').addEventListener('click', () => this._toggleCode());
    el.querySelector('.jr-btn-show').addEventListener('click', () => this._openShowcase());
    el.querySelector('.jr-btn-bigkid').addEventListener('click', () => this._graduate());
    el.querySelector('.jr-btn-close').addEventListener('click', () => this.close());
  }

  _injectCSS() {
    if (document.getElementById('jr-mode-css')) return;
    const css = document.createElement('style');
    css.id = 'jr-mode-css';
    css.textContent = `
#jr-editor{position:fixed;inset:0;z-index:60;flex-direction:column;background:rgba(8,10,14,.94);
  font-family:'Comic Sans MS','Segoe UI',system-ui,sans-serif;color:#eee}
#jr-editor .jr-header{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#1a2030;border-bottom:3px solid #f0b429}
#jr-editor .jr-logo{font-size:20px;letter-spacing:1px}
#jr-editor .jr-logo b{color:#f0b429;font-size:24px}
#jr-editor .jr-name{background:#10141f;border:2px solid #334;color:#ffd;font-size:16px;padding:6px 10px;border-radius:10px;min-width:120px}
#jr-editor .jr-header-actions{margin-left:auto;display:flex;gap:8px}
#jr-editor .jr-btn{font-family:inherit;font-size:16px;font-weight:bold;padding:10px 16px;border-radius:14px;border:2px solid #445;
  background:#232c40;color:#ffe;cursor:pointer}
#jr-editor .jr-btn:hover{border-color:#f0b429}
#jr-editor .jr-btn:disabled{opacity:.45;cursor:default}
#jr-editor .jr-btn-run{background:#0a4;border-color:#0d5;font-size:20px;padding:10px 26px}
#jr-editor .jr-btn-stop{background:#600;border-color:#833}
#jr-editor .jr-body{display:flex;flex:1;overflow:hidden}
#jr-editor .jr-tray{display:flex;flex-wrap:wrap;align-content:flex-start;gap:12px;width:300px;min-width:300px;
  padding:14px;background:#141820;border-right:2px solid #334;overflow-y:auto}
#jr-editor .jr-tray-block{width:76px;height:76px;border-radius:18px;border:3px solid #445;background:#1e2840;
  display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;user-select:none;
  font-size:34px;position:relative;transition:transform .08s}
#jr-editor .jr-tray-block:hover{transform:scale(1.08);border-color:#f0b429}
#jr-editor .jr-tray-block:active{transform:scale(.95)}
#jr-editor .jr-tray-block.jr-locked{filter:grayscale(1);opacity:.5;cursor:not-allowed}
#jr-editor .jr-tray-block .jr-lock{position:absolute;top:-8px;right:-8px;background:#421;border:2px solid #a53;border-radius:50%;
  width:26px;height:26px;font-size:14px;display:flex;align-items:center;justify-content:center}
#jr-editor .jr-canvas-wrap{flex:1;display:flex;flex-direction:column;padding:14px 20px;overflow-y:auto;background:#161c28}
#jr-editor .jr-flag-hint{font-size:18px;margin-bottom:8px;color:#9ab}
#jr-editor .jr-flag{font-size:30px;vertical-align:middle}
#jr-editor .jr-seq{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;min-height:110px}
#jr-editor .jr-step{border-radius:18px;border:3px solid #445;min-width:80px;padding:8px 10px;cursor:pointer;user-select:none;
  display:flex;flex-direction:column;align-items:center;gap:4px;font-size:36px;position:relative;background:#1c2438}
#jr-editor .jr-step:hover{border-color:#f0b429}
#jr-editor .jr-step .jr-x{position:absolute;top:-10px;right:-10px;background:#421;border:2px solid #a53;border-radius:50%;
  width:28px;height:28px;font-size:15px;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
#jr-editor .jr-step .jr-x:hover{background:#e33;border-color:#f99}
#jr-editor .jr-step .jr-badge{font-size:13px;font-weight:bold;color:#ffd;background:#0009;border-radius:8px;padding:1px 8px}
#jr-editor .jr-step.jr-sel{border-color:#f0b429;box-shadow:0 0 14px #f0b42988}
#jr-editor .jr-body-row{display:flex;flex-direction:column;gap:6px}
#jr-editor .jr-inner{display:flex;flex-wrap:wrap;gap:8px;border:3px dashed #f0b42966;border-radius:14px;padding:8px;margin-top:6px;min-height:70px}
#jr-editor .jr-inner .jr-step{font-size:28px;min-width:64px}
#jr-editor .jr-inner-hint{font-size:14px;color:#f0b429;padding:4px}
#jr-editor .jr-trash{margin-top:auto;align-self:flex-start;display:flex;align-items:center;gap:10px;font-size:40px;
  border:3px dashed #556;border-radius:18px;padding:10px 20px;color:#778;margin:16px 0 4px}
#jr-editor .jr-trash span{font-size:15px}
#jr-editor .jr-trash.jr-trash-hot{border-color:#f44;background:#311;color:#f88}
#jr-editor .jr-code{background:#0a0e18;padding:12px;overflow:auto;max-height:45%}
#jr-editor .jr-code-tab{color:#f0b429;font-size:13px;margin:8px 0 4px;letter-spacing:1px}
#jr-editor .jr-code-pre{background:#0f1520;border-radius:8px;padding:10px;font-size:11px;color:#9f9;white-space:pre-wrap;margin:0}
#jr-editor .jr-code-note{color:#789;font-size:12px;margin-top:8px}`;
    document.head.appendChild(css);
  }

  // ── Private: rendering ───────────────────────────────────────────────────

  _unlocked() { return jrUnlockedBlocks(this._game.player); }

  _render() {
    if (!this._el) return;
    this._renderTray();
    this._renderSeq();
  }

  _renderTray() {
    const tray = this._el.querySelector('#jr-tray');
    const unlocked = this._unlocked();
    tray.innerHTML = '';
    for (const def of Object.values(JR_BLOCKS)) {
      if (def.id === 'start') continue;   // the flag is fixed at the head
      const b = document.createElement('div');
      b.className = 'jr-tray-block' + (unlocked.has(def.id) ? '' : ' jr-locked');
      b.title = unlocked.has(def.id) ? def.hint : `Craft the ${getItem(def.gate)?.name ?? 'part'} to unlock!`;
      const partIcon = def.gate ? `<span class="jr-lock">${getItem(def.gate)?.icon ?? '🔒'}</span>` : '';
      b.innerHTML = `${def.icon}${partIcon}`;
      b.addEventListener('click', () => {
        if (!unlocked.has(def.id)) {
          const part = getItem(def.gate);
          this._game.ui?.notify(`🔒 Craft ${part?.icon ?? ''} ${part?.name ?? 'the part'} at the workbench to unlock ${def.icon}!`);
          return;
        }
        this._addBlock(def);
      });
      tray.appendChild(b);
    }
  }

  _renderSeq() {
    const seq = this._el.querySelector('#jr-seq');
    seq.innerHTML = '';
    const steps = this._program.steps;

    // flag (head)
    seq.appendChild(this._flagEl());

    steps.forEach((step, i) => {
      if (step.block === 'start') return;   // flag rendered above
      seq.appendChild(this._stepEl(step, [i]));
    });

    const trash = this._el.querySelector('#jr-trash');
    this._wireTrash(trash);
  }

  _flagEl() {
    const el = document.createElement('div');
    el.className = 'jr-step';
    el.style.borderColor = '#0d5';
    el.style.background = '#0c2016';
    el.innerHTML = `<span style="font-size:36px">🏁</span>`;
    el.title = 'my program starts here';
    return el;
  }

  _stepEl(step, path) {
    const def = JR_BLOCKS[step.block];
    const el = document.createElement('div');
    el.className = 'jr-step' + (step.block === 'repeat' && this._selRepeat === path[0] ? ' jr-sel' : '');
    el.draggable = true;
    el.title = def?.hint ?? step.block;

    // option badge (tap the block to cycle)
    let badge = '';
    if (step.block === 'wait')   badge = `<span class="jr-badge">${step.opt ?? 1}s</span>`;
    if (step.block === 'repeat') badge = `<span class="jr-badge">×${step.opt ?? 2}</span>`;
    if (step.block === 'light')  badge = `<span class="jr-badge" style="background:${LIGHT_COLOR[step.opt ?? 'green']}">${(step.opt ?? 'green') === 'off' ? 'OFF' : '●'}</span>`;
    if (step.block === 'sound')  badge = `<span class="jr-badge">${{ low: '·', mid: '··', high: '···' }[step.opt ?? 'mid']} </span>`;

    el.innerHTML = `${def?.icon ?? '?'}${badge}
      <button class="jr-x" title="throw away">✕</button>`;

    // ✕ = tap twin of drag-to-trash (touch-first)
    el.querySelector('.jr-x').addEventListener('click', (e) => {
      e.stopPropagation();
      this._deleteAt(path);
    });

    // tap: cycle option, or select repeat (to fill its body)
    el.addEventListener('click', () => {
      if (step.block === 'repeat') {
        this._selRepeat = this._selRepeat === path[0] ? null : path[0];
        this._render();
        return;
      }
      if (def?.opts) {
        const opts = def.opts;
        const idx = opts.indexOf(step.opt ?? opts[0]);
        step.opt = opts[(idx + 1) % opts.length];
        this._save();
        this._render();
      }
    });

    // drag-to-trash payload
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/jr-step', JSON.stringify(path));
      e.dataTransfer.effectAllowed = 'move';
    });

    // repeat body — inline, indented, gold-dashed home
    if (step.block === 'repeat') {
      const wrap = document.createElement('div');
      wrap.className = 'jr-body-row';
      wrap.appendChild(el);
      const inner = document.createElement('div');
      inner.className = 'jr-inner';
      if (this._selRepeat === path[0]) {
        inner.innerHTML = `<div class="jr-inner-hint">tap tray blocks to put them INSIDE 🔁${JR_REPEAT_CAP === 4 ? '' : ''} (max ×${JR_REPEAT_CAP})</div>`;
      }
      for (let j = 0; j < (step.body ?? []).length; j++) {
        inner.appendChild(this._stepEl(step.body[j], [...path, j]));
      }
      wrap.appendChild(inner);
      return wrap;
    }
    return el;
  }

  _wireTrash(trash) {
    if (!trash || trash._wired) { if (trash) this._bindTrashDrop(trash); return; }
    trash._wired = true;
    this._bindTrashDrop(trash);
  }

  _bindTrashDrop(trash) {
    trash.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      trash.classList.add('jr-trash-hot');
    });
    trash.addEventListener('dragleave', () => trash.classList.remove('jr-trash-hot'));
    trash.addEventListener('drop', (e) => {
      e.preventDefault();
      trash.classList.remove('jr-trash-hot');
      const raw = e.dataTransfer.getData('text/jr-step');
      if (!raw) return;
      try { this._deleteAt(JSON.parse(raw)); } catch { /* bad payload — ignore */ }
    });
  }

  // ── Private: mutation ────────────────────────────────────────────────────

  _addBlock(def) {
    // Repeat selected → blocks go INSIDE it (and stay simple: no loops in loops)
    if (this._selRepeat !== null && isBodyBlock(def.id)) {
      const rep = this._program.steps[this._selRepeat];
      if (!rep || rep.block !== 'repeat') { this._selRepeat = null; return this._addBlock(def); }
      if ((rep.body ?? []).length >= 8) {
        this._game.ui?.notify('That 🔁 is full — add a new 🔁!');
        return;
      }
      rep.body = rep.body ?? [];
      rep.body.push(this._newStep(def));
    } else {
      if (this._program.steps.length >= 17) {   // flag + 16 blocks
        this._game.ui?.notify('Program is full! Throw some blocks away 🗑️');
        return;
      }
      this._program.steps.push(this._newStep(def));
    }
    this._save();
    this._render();
    this._game.audio?.place?.();
  }
  _newStep(def) {
    const step = { block: def.id };
    if (def.opts) {
      // wait starts at 1s, repeat at ×2 — first option that reads naturally
      step.opt = def.id === 'wait' ? 1 : def.opts[0];
    }
    if (def.id === 'repeat') step.body = [];
    return step;
  }

  _deleteAt(path) {
    const steps = this._program.steps;
    if (path.length === 1) {
      const i = path[0];
      if (this._selRepeat === i) this._selRepeat = null;
      else if (this._selRepeat !== null && this._selRepeat > i) this._selRepeat--;
      steps.splice(i, 1);
    } else if (path.length === 2) {
      const rep = steps[path[0]];
      if (rep?.body) rep.body.splice(path[1], 1);
    }
    this._save();
    this._render();
    this._game.audio?.pickup?.();
  }

  _save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this._program.toJSON())); } catch { /* quota — ignore */ }
  }

  // ── Private: run / stop / code / graduate ────────────────────────────────

  _run() {
    const tp = this._program.toTileProgram();
    const result = compile(tp);
    if (!result.ok) {
      this._game.ui?.notify(`⚠ ${result.errors[0] ?? 'Something is wrong with the program.'}`);
      return;
    }
    const bot = this._game.scrapBot;
    if (!bot?.isActive) {
      this._game.ui?.notify('Craft a robot_helper first, then GO!');
      return;
    }
    bot.setBrain(tp, this._game.world, this._game.player, this._game.dayNight);
    this._game.audio?.brainLoad?.();
    this._game.achievements?.track('program_run', {});
    this._game._noteProgramRunDelight?.(bot);
    const runBtn = this._el.querySelector('.jr-btn-run');
    const stopBtn = this._el.querySelector('.jr-btn-stop');
    runBtn.disabled = true; stopBtn.disabled = false;
    this.close();   // watch the bot go!
  }

  _stop() {
    this._game.scrapBot?.clearBrain();
    const runBtn = this._el?.querySelector('.jr-btn-run');
    const stopBtn = this._el?.querySelector('.jr-btn-stop');
    if (runBtn) runBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  }

  _toggleCode() {
    const code = this._el.querySelector('#jr-code');
    const show = code.style.display === 'none';
    code.style.display = show ? 'block' : 'none';
    if (show) {
      const tp = this._program.toTileProgram();
      this._el.querySelector('#jr-ino').textContent = toArduino(tp);
      this._el.querySelector('#jr-py').textContent  = toMicroPython(tp);
    }
  }

  /** 🌟 SHOW — the shared Jr build showcase (scrap-spark gallery). */
  _openShowcase() {
    if (!this._showcase) {
      import('./JrShowcase.js').then(({ JrShowcase }) => {
        this._showcase = new JrShowcase(this);
        this._showcase.open();
      }).catch(() => this._game.ui?.notify('⚠ Showcase is not available right now.'));
      return;
    }
    this._showcase.open();
  }

  /**
   * ⬆ BIG KID — graduate to the full tile editor, program in hand.
   * The Jr program converts to a TileProgram the Maker Bench can keep editing.
   */
  _graduate() {
    const tp = this._program.toTileProgram();
    this.close();
    const te = this._game.tileEditor;
    te?.loadProgram?.(tp);
    te?.open?.(this._game._getBrainTier?.() ?? 'tin');
    this._game.ui?.notify('⬆ Your Jr program is in the Maker Bench — welcome, big kid!');
  }
}
