/**
 * ───────────────────────────────────────────────────────────────────────────
 *  OBSERVER MODE  —  the playtest observer's instrument (?observe=1)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Fail-soft session logger for the FIRST REAL KID PLAYTEST (docs/RESEARCH
 * §4.4 Step 0: "instrumented informal play sessions"). OFF in normal play:
 * the URL flag gates everything at one chokepoint — no flag → createObserver()
 * returns null, no hooks install, zero runtime cost.
 *
 * When armed (?observe=1):
 *   • a scrollable session-log overlay (bottom-left, monospace, timestamps)
 *   • timestamped entries for: quest completes, level-ups, first-mine /
 *     first-build / first-race, companion lines, deaths/resets, pauses
 *   • one-click JSON export + auto-stash on unload (localStorage, fail-soft)
 *
 * Doctrine — additive + fail-soft:
 *   • every game-side call site uses `this.observer?.` — a missing observer
 *     is a no-op (normal play is untouched)
 *   • every internal step is try/caught: the observer can never crash the yard
 *   • DOM is optional (headless tests run with no document)
 *   • the full log lives in memory; the overlay renders only the tail
 *
 * The playtest facilitator reads the overlay live and clicks EXPORT JSON at
 * minute 30 (or grabs window.__scrapcraftObserver.exportJSON() from console).
 */

/** URL gate: ?observe=1 (or =true) arms the observer. Anything else → OFF. */
export function observerFromURL(search = '') {
  try {
    const v = new URLSearchParams(search).get('observe');
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

/** Wall-clock ISO at session start (also the file-name stamp). */
function isoNow() {
  try { return new Date().toISOString(); } catch { return null; }
}

const MILESTONE_KINDS = new Set(['first_mine', 'first_build', 'first_race', 'reset']);

export class SessionObserver {
  /**
   * @param {object} [opts]
   *   search  — location.search (or ''), used for the seed/tag only
   *   seed    — world seed, recorded into the export for reproducibility
   *   source  — session tag, e.g. 'kid-session-1'
   *   now     — clock fn override for tests (defaults to performance.now)
   */
  constructor(opts = {}) {
    this.enabled    = true;
    this.seed       = opts.seed ?? null;
    this.source     = opts.source ?? 'kid-session';
    this._now       = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this._t0        = this._now();
    this.startedAt  = isoNow();
    this.entries    = [];
    this.milestones = {};      // kind → { t, detail } (first occurrence only)
    this._flagged   = new Set(MILESTONE_KINDS);   // kinds that log once
    this._seen      = new Set();                  // exact-once keys (e.g. first_mine)
    this._overlay   = null;
    this._listEl    = null;
    this._clockEl   = null;
    this._timer     = null;
    this._ended     = false;
    this._stashed   = false;

    // Session start is always the first entry.
    this._push('session_start', `observer armed (seed ${this.seed ?? '?'})`, null);

    // Overlay is a pure garnish — built lazily, guarded, headless-safe.
    try {
      if (typeof document !== 'undefined') this._buildOverlay();
    } catch { /* the log survives without the overlay */ }
  }

  // ── recording ──────────────────────────────────────────────────────────

  /** Session-relative seconds, 1 decimal. */
  _t() { return Math.max(0, (this._now() - this._t0) / 1000); }

  _push(kind, detail, milestone = null) {
    const t = this._t();
    this.entries.push({
      t: +t.toFixed(1),
      iso: isoNow(),
      kind,
      detail: String(detail ?? ''),
    });
    if (milestone !== null) this.milestones[kind] = { t: +t.toFixed(1), detail: String(detail ?? '') };
    this._renderTail();
    this._stash();   // incremental auto-stash (throttled inside)
  }

  /** Log an ordinary entry (quests, level-ups, companions, deaths…). */
  log(kind, detail = '') {
    try {
      if (this._ended) return;
      this._push(kind, detail, null);
    } catch { /* fail-soft */ }
  }

  /** Log a once-ever milestone (first mine / build / race / reset…). */
  milestone(kind, detail = '') {
    try {
      if (this._ended) return;
      if (this._seen.has(kind)) return;      // once per session
      this._seen.add(kind);
      this._push(kind, detail, MILESTONE_KINDS.has(kind) ? kind : null);
    } catch { /* fail-soft */ }
  }

  // ── semantic helpers (the vocabulary the game speaks) ──────────────────

  quest(q)            { this.log('quest', `${q?.arc ?? '?'}/${q?.id ?? '?'} — ${q?.title ?? ''}`); }
  levelUp(level)      { this.log('levelup', `Level ${level}`); }
  companion(name, text) { this.log('companion', `${name}: ${text}`); }
  death()             { this.log('death', 'player death / respawn'); }
  reset(reason = 'save') { this.milestone('reset', `session reset (${reason})`); }
  pause(paused)       { this.log(paused ? 'pause' : 'resume', paused ? 'paused' : 'resumed'); }
  note(text)          { this.log('note', text); }   // facilitator scratchpad

  firstMine()         { this.milestone('first_mine', 'first block mined'); }
  firstBuild(detail = '') { this.milestone('first_build', detail || 'first build'); }
  firstRace()         { this.milestone('first_race', 'first oval race start'); }

  // ── export ─────────────────────────────────────────────────────────────

  /** Full session as a plain JSON-safe object. */
  exportJSON() {
    return {
      schema: 'scrapcraft/observer-session/v1',
      game: 'Scrapcraft',
      source: this.source,
      startedAt: this.startedAt,
      durationSec: +this._t().toFixed(1),
      seed: this.seed,
      milestones: this.milestones,
      entries: this.entries,
    };
  }

  /** End the session: stop the clock, final stash, one last entry. */
  endSession() {
    if (this._ended) return this.exportJSON();
    this._ended = true;
    // Push the final entry directly — log() is gated on _ended and would
    // swallow it; the session_end line must always land.
    this._push('session_end', `session ended at ${+this._t().toFixed(1)}s — ${this.entries.length + 1} entries`, null);
    if (this._timer) { try { clearInterval(this._timer); this._timer = null; } catch { /* fail-soft */ } }
    this._stash();
    this._updateClock();
    return this.exportJSON();
  }

  /** Trigger a browser download of the JSON export (facilitator's minute-30 click). */
  downloadJSON() {
    try {
      const json = JSON.stringify(this.exportJSON(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = (this.startedAt ?? '').replace(/[:.]/g, '-').slice(0, 19) || String(Date.now());
      a.href = url;
      a.download = `scrapcraft-session-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch { /* fail-soft */ } }, 500);
      this.note('📦 session JSON exported');
    } catch { /* downloads are a browser garnish */ }
  }

  /**
   * Crash insurance: stash the running log into localStorage so an accidental
   * tab-close doesn't destroy the playtest data. Throttled to ~1 write/5s.
   * Fail-soft: private mode / blocked storage → the in-memory log still works.
   */
  _stash() {
    if (this._stashed) return;
    try {
      const key = 'scrapcraft.observer.session';
      const now = Date.now();
      const last = Number(localStorage.getItem('scrapcraft.observer.stashAt') ?? 0);
      if (now - last < 5000) return;          // throttle
      localStorage.setItem('scrapcraft.observer.stashAt', String(now));
      localStorage.setItem(key, JSON.stringify(this.exportJSON()));
    } catch { /* storage optional */ }
  }

  /** Recover a stashed log after a crash (console aid for the facilitator). */
  static recoverStash() {
    try {
      const raw = localStorage.getItem('scrapcraft.observer.session');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // ── overlay DOM (optional garnish, headless-safe) ──────────────────────

  _buildOverlay() {
    const el = document.createElement('div');
    el.id = 'observer-overlay';
    el.style.cssText = `
      position:fixed; left:12px; bottom:12px; z-index:1200;
      width:380px; max-height:42vh; display:flex; flex-direction:column;
      background:rgba(10,12,10,0.92); border:1px solid #f0b429; border-radius:8px;
      font-family:'Courier New',monospace; font-size:11px; color:#cfd8cf;
      box-shadow:0 6px 28px rgba(0,0,0,0.55); overflow:hidden;`;

    const head = document.createElement('div');
    head.style.cssText = `
      display:flex; align-items:center; gap:8px; padding:6px 10px;
      background:#1a1d18; border-bottom:1px solid #3a3f36; color:#f0b429;
      font-size:10px; letter-spacing:1px; flex:0 0 auto;`;
    head.innerHTML = `<b>OBSERVER</b> <span id="observer-clock" style="flex:1;opacity:.8"></span>`;
    const exportBtn = document.createElement('button');
    exportBtn.textContent = '⤓ JSON';
    exportBtn.style.cssText = `
      background:#f0b429; color:#141414; border:none; border-radius:4px;
      padding:2px 8px; font-family:inherit; font-size:10px; font-weight:bold;
      cursor:pointer;`;
    exportBtn.onclick = () => { try { this.endSession(); this.downloadJSON(); } catch { /* fail-soft */ } };
    const endBtn = document.createElement('button');
    endBtn.textContent = '■ END';
    endBtn.style.cssText = `
      background:#5a1a1a; color:#ffd0a0; border:1px solid #8a2a2a; border-radius:4px;
      padding:2px 8px; font-family:inherit; font-size:10px; cursor:pointer;`;
    endBtn.onclick = () => { try { this.endSession(); } catch { /* fail-soft */ } };
    const hideBtn = document.createElement('button');
    hideBtn.textContent = '–';
    hideBtn.style.cssText = `
      background:transparent; color:#888; border:1px solid #444; border-radius:4px;
      padding:2px 7px; font-family:inherit; font-size:10px; cursor:pointer;`;
    hideBtn.onclick = () => { try { el.style.display = el.style.display === 'none' ? '' : 'none'; } catch { /* fail-soft */ } };
    head.appendChild(exportBtn);
    head.appendChild(endBtn);
    head.appendChild(hideBtn);

    const list = document.createElement('div');
    list.style.cssText = `
      flex:1 1 auto; overflow-y:auto; padding:4px 8px; min-height:60px;
      scrollbar-width:thin;`;
    el.appendChild(head);
    el.appendChild(list);
    document.body.appendChild(el);

    this._overlay = el;
    this._listEl  = list;
    this._clockEl = el.querySelector('#observer-clock');
    this._timer   = setInterval(() => this._updateClock(), 1000);
    this._updateClock();
    this._renderTail();
  }

  _updateClock() {
    if (!this._clockEl) return;
    const t = this._ended ? this.entries[this.entries.length - 1]?.t ?? 0 : this._t();
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(Math.floor(t % 60)).padStart(2, '0');
    this._clockEl.textContent = `${mm}:${ss}`;
  }

  /** Render only the tail (last ~150 entries) — the full log is in memory. */
  _renderTail() {
    if (!this._listEl) return;
    try {
      const tail = this.entries.slice(-150);
      const frag = document.createDocumentFragment();
      for (const e of tail) {
        const line = document.createElement('div');
        const mm = String(Math.floor(e.t / 60)).padStart(2, '0');
        const ss = String(Math.floor(e.t % 60)).padStart(2, '0');
        line.textContent = `[${mm}:${ss}] ${e.kind} · ${e.detail}`;
        line.style.whiteSpace = 'nowrap';
        line.style.overflow = 'hidden';
        line.style.textOverflow = 'ellipsis';
        if (e.kind.startsWith('first_')) line.style.color = '#ffd970';
        else if (e.kind === 'quest')  line.style.color = '#9fd0ff';
        else if (e.kind === 'levelup') line.style.color = '#a8e6a8';
        else if (e.kind === 'death' || e.kind === 'reset') line.style.color = '#ff9d9d';
        else if (e.kind === 'companion') line.style.color = '#e0b0ff';
        frag.appendChild(line);
      }
      this._listEl.innerHTML = '';
      this._listEl.appendChild(frag);
      this._listEl.scrollTop = this._listEl.scrollHeight;
    } catch { /* rendering never crashes the logger */ }
  }
}

/**
 * One chokepoint for the whole feature. Returns a SessionObserver when the
 * URL arms it, null otherwise — so every call site can be `obs?.` and normal
 * play pays nothing. Throws nothing.
 *
 * @param {object} [opts]  { search, seed, source } — see SessionObserver
 * @returns {SessionObserver|null}
 */
export function createObserver(opts = {}) {
  try {
    if (!observerFromURL(opts.search ?? '')) return null;
    const obs = new SessionObserver(opts);
    if (typeof window !== 'undefined') window.__scrapcraftObserver = obs;
    return obs;
  } catch {
    return null;   // fail-soft: an observer bug must never take the game down
  }
}
