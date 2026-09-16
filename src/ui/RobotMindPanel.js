/**
 * ───────────────────────────────────────────────────────────────────────────
 *  ROBOT MIND PANEL  —  the trace-debugger, surfaced
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  Three ways to understand a running robot, in one panel (press Y):
 *
 *    1. WHY (always on, offline, deterministic) — the live decision trace,
 *       narrated by explain.js: what it's doing now + the sensor/branch that
 *       caused it + recent history. Refreshes while the panel is open.
 *    2. ASK AI (opt-in) — POST /chat on the scrap-quilt Worker, grounded in the
 *       live cells: a conversational "why?" that can reason beyond the last tile.
 *    3. PREDICT (opt-in) — POST /predict: a ghost-racer forward-sim of where the
 *       robot is heading over the next N ticks.
 *
 *  The cloud buttons appear only when the Live Cloud Sheet is enabled in
 *  Settings; everything is fail-soft (a failed request shows a friendly note,
 *  never throws, never touches gameplay). Dynamic response text is written via
 *  textContent, so a Worker response can't inject markup.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { isQuiltBridgeEnabled, snapshotFromRun } from '../maker/QuiltBridge.js';

export class RobotMindPanel {
  /** @param {Game} game  needs .scrapBot/.scrapBot2 and ._quiltBridge */
  constructor(game) {
    this._game = game;
    this._el = null;
    this._timer = null;
    this._onKey = null;
    this._busy = false;
  }

  isOpen() { return !!this._el; }
  toggle() { this._el ? this.close() : this.open(); }

  /** The bot currently running a brain (prefer one in brain mode), or null. */
  _active() {
    const g = this._game;
    const bot = [g?.scrapBot, g?.scrapBot2].find(b => b?._brainMode && b?._runtime) ?? g?.scrapBot;
    return { bot, rt: bot?._runtime ?? null };
  }

  open() {
    if (this._el) return;
    const el = document.createElement('div');
    el.id = 'robot-mind-panel';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Robot Mind — why did it do that?');
    el.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'width:min(340px,calc(100vw - 32px))',
      'max-height:min(70vh,560px)', 'overflow:auto', 'z-index:9500',
      'background:rgba(18,20,24,.96)', 'color:#e8eef3', 'border:1px solid #2b3540',
      'border-radius:12px', 'box-shadow:0 8px 30px rgba(0,0,0,.5)',
      'font:13px/1.45 system-ui,sans-serif', 'padding:12px 14px 14px',
      'backdrop-filter:blur(4px)',
    ].join(';');

    const cloud = isQuiltBridgeEnabled();
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <b style="font-size:14px">🧠 Robot Mind</b>
        <span id="rmp-bot" style="opacity:.7;font-size:12px"></span>
        <button id="rmp-close" aria-label="Close" style="margin-left:auto;background:none;border:none;color:#9fb0bd;font-size:18px;cursor:pointer;line-height:1">×</button>
      </div>
      <div id="rmp-headline" style="font-size:15px;font-weight:600;margin:2px 0 4px"></div>
      <div id="rmp-reason" style="opacity:.85;min-height:1.2em"></div>
      <details style="margin-top:6px"><summary style="cursor:pointer;opacity:.7;font-size:12px">recent steps</summary>
        <ol id="rmp-history" style="margin:6px 0 0;padding-left:18px;opacity:.8;font-size:12px"></ol>
      </details>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button id="rmp-why" ${cloud ? '' : 'disabled'} style="flex:1;min-width:120px;padding:7px 8px;border-radius:8px;border:1px solid #3a6ea5;background:${cloud ? '#1c3a5e' : '#1a1d22'};color:${cloud ? '#dbeafe' : '#5a6570'};cursor:${cloud ? 'pointer' : 'not-allowed'};font-size:12px">🤔 Ask AI why</button>
        <button id="rmp-predict" ${cloud ? '' : 'disabled'} style="flex:1;min-width:120px;padding:7px 8px;border-radius:8px;border:1px solid #7a5aa5;background:${cloud ? '#2e1c5e' : '#1a1d22'};color:${cloud ? '#e6dbfe' : '#5a6570'};cursor:${cloud ? 'pointer' : 'not-allowed'};font-size:12px">👻 Predict path</button>
      </div>
      <div id="rmp-cloud" style="margin-top:9px;font-size:12.5px;min-height:1em"></div>
      ${cloud ? '' : '<div style="margin-top:8px;font-size:11.5px;opacity:.6">Turn on <b>Live Cloud Sheet</b> in Settings for AI answers &amp; ghost-race prediction.</div>'}
    `;
    document.body.appendChild(el);
    this._el = el;

    el.querySelector('#rmp-close').addEventListener('click', () => this.close());
    const whyBtn = el.querySelector('#rmp-why');
    const predBtn = el.querySelector('#rmp-predict');
    if (cloud) {
      whyBtn.addEventListener('click', () => this._askWhy());
      predBtn.addEventListener('click', () => this._predict());
    }

    this._onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.close(); } };
    document.addEventListener('keydown', this._onKey, true);

    this.render();
    // Refresh the deterministic view while the panel is open so it tracks the run.
    this._timer = setInterval(() => this.render(), 500);
  }

  close() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._onKey) { document.removeEventListener('keydown', this._onKey, true); this._onKey = null; }
    this._el?.remove();
    this._el = null;
  }

  /** Repaint the always-on deterministic explanation. */
  render() {
    if (!this._el) return;
    const { bot, rt } = this._active();
    const nameEl = this._el.querySelector('#rmp-bot');
    const head = this._el.querySelector('#rmp-headline');
    const reason = this._el.querySelector('#rmp-reason');
    const hist = this._el.querySelector('#rmp-history');
    if (nameEl) nameEl.textContent = bot?.personality?.name ? `· ${bot.personality.name}` : '';

    if (!rt?.explain) {
      head.textContent = '🤖 No brain running';
      reason.textContent = 'Open the Maker Lab (T), build a brain, and hit ▶ RUN — then come back.';
      hist.innerHTML = '';
      return;
    }
    const ex = rt.explain();
    head.textContent = ex.headline || '…';
    reason.textContent = ex.reason || '';
    hist.innerHTML = '';
    for (const line of ex.history ?? []) {
      const li = document.createElement('li');
      li.textContent = line;
      hist.appendChild(li);
    }
  }

  _cloudEl() { return this._el?.querySelector('#rmp-cloud'); }

  /** Snapshot the running bot's cells for a cloud request, or null. */
  _cells() {
    const { rt } = this._active();
    return rt ? snapshotFromRun(rt, rt.world) : null;
  }

  async _askWhy() {
    const out = this._cloudEl();
    const bridge = this._game?._quiltBridge;
    const cells = this._cells();
    if (!out) return;
    if (!bridge || !cells) { out.textContent = '🤖 Nothing running to ask about yet.'; return; }
    if (this._busy) return;
    this._busy = true;
    out.textContent = '🤔 Asking Spark…';
    try {
      const res = await bridge.chat('Why did the robot just do that? Explain simply for a kid.', cells);
      out.textContent = res ? `💬 ${this._readChat(res)}` : '⚠️ No answer (offline or the cloud sheet is unreachable).';
    } catch {
      out.textContent = '⚠️ Could not reach the cloud sheet.';
    } finally {
      this._busy = false;
    }
  }

  async _predict() {
    const out = this._cloudEl();
    const bridge = this._game?._quiltBridge;
    const cells = this._cells();
    if (!out) return;
    if (!bridge || !cells) { out.textContent = '🤖 Nothing running to predict.'; return; }
    if (this._busy) return;
    this._busy = true;
    out.textContent = '👻 Running the ghost racer…';
    try {
      const res = await bridge.predict(cells, 40);
      out.textContent = res ? `👻 ${this._readPredict(res)}` : '⚠️ No prediction (offline or the cloud sheet is unreachable).';
    } catch {
      out.textContent = '⚠️ Could not reach the cloud sheet.';
    } finally {
      this._busy = false;
    }
  }

  /** Best-effort extraction of a human answer from an unknown /chat response. */
  _readChat(res) {
    if (typeof res === 'string') return res;
    const s = res.answer ?? res.reply ?? res.text ?? res.message ?? res.response;
    if (typeof s === 'string' && s.trim()) return s.trim();
    try { return JSON.stringify(res).slice(0, 400); } catch { return 'got a reply.'; }
  }

  /** Best-effort summary of a /predict (ghost-racer) response. The deployed
   *  Worker returns { ghosts: [{ tick, lapCrossings, cells:{…} }, …] }; we
   *  summarize the endpoint ghost. Also handles flat/wrapped cell shapes. */
  _readPredict(res) {
    if (typeof res === 'string') return res;
    if (typeof res.summary === 'string' && res.summary.trim()) return res.summary.trim();

    const ghosts = Array.isArray(res.ghosts) ? res.ghosts : null;
    const endCells = (ghosts && ghosts.length)
      ? (ghosts[ghosts.length - 1].cells ?? {})
      : (res.cells ?? res.predicted ?? res);
    const g = (id) => {
      const v = endCells?.[id];
      return (v && typeof v === 'object') ? v.v : v;
    };
    const n = ghosts ? ghosts.length : 40;
    const bits = [];
    const x = g('robot.x'), z = g('robot.z');
    if (typeof x === 'number' && typeof z === 'number') bits.push(`heads toward (${x.toFixed(1)}, ${z.toFixed(1)})`);
    const think = g('robot.think');
    if (think) bits.push(`plan: ${think}`);
    const lap = g('race.lapFrac');
    if (typeof lap === 'number') bits.push(`lap ${Math.round(lap * 100)}%`);
    else if (g('race.lap') != null) bits.push(`lap ${g('race.lap')}`);
    const crossings = ghosts ? ghosts.reduce((s, gh) => s + (gh.lapCrossings || 0), 0) : 0;
    if (crossings > 0) bits.push(`crosses the line ${crossings}×`);
    if (res.crash || g('robot.crash')) bits.push('⚠️ likely to crash');
    if (bits.length) return `In ~${n} ticks it ${bits.join(', ')}.`;
    try { return JSON.stringify(res).slice(0, 400); } catch { return 'ran the sim.'; }
  }
}
