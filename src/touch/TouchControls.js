/**
 * TouchControls — the fail-soft mobile layer.
 *
 * Pointer lock does not exist on touch, so phones get: a floating virtual
 * joystick on the left half (move), a look-drag + tap surface on the right
 * half, and a small button cluster (mode toggle, interact, mini hotbar).
 * Everything is strictly feature-detected via touchSupported() — desktop
 * never sees a joystick, and no mouse/keyboard path is touched.
 *
 * Structure note: the gesture DECISIONS live in the pure GestureDetector
 * class below (down/move/up + timestamps → tap | longpress | drag) and the
 * joystick math lives in the pure clampJoystick() function, so both are
 * unit-testable headlessly. TouchControls itself is the thin DOM shell that
 * consumes them — every handler try/catches so a touch bug can never crash
 * the yard.
 *
 * Tap-action mechanism (ONE, on purpose): the ⛏/🧱 mode button bottom-right
 * switches what a right-zone tap does — mine swing ↔ place block. We picked
 * the toggle over long-press because it's discoverable (visible affordance)
 * and immediate for kids; GestureDetector still classifies long-press so the
 * decision layer stays complete and tested. Two-finger tap = jump.
 * A stationary HOLD past the tap window mines continuously (like LMB hold).
 */

// ── Pure logic (unit-tested in __tests__/touch-tests.mjs) ──────────────────

/** True when this env is a real touch device: hardware touch points (or the
 *  legacy ontouchstart) AND a coarse pointer. Anything missing → false, so a
 *  desktop with a touchscreen-add-on or a fine-pointer hybrid stays desktop. */
export function touchSupported(env) {
  if (!env || typeof env !== 'object') return false;
  const points = Number(env.maxTouchPoints) || 0;
  const legacy = !!env.ontouchstart;
  let coarse = false;
  try {
    if (typeof env.matchMedia === 'function') {
      coarse = !!env.matchMedia('(pointer: coarse)').matches;
    }
  } catch { /* ancient browsers / locked-down iframes — treat as not coarse */ }
  return (points > 0 || legacy) && coarse;
}

/** Clamp a joystick displacement (px) to its radius r, normalized to -1..1.
 *  Inside the radius the vector scales linearly; outside it pins to the rim. */
export function clampJoystick(dx, dy, r) {
  if (!(r > 0)) return { x: 0, y: 0 };
  const len = Math.hypot(dx, dy);
  if (len <= r) return { x: dx / r, y: dy / r };
  return { x: dx / len, y: dy / len };
}

/** Decision brain for one finger: feed down/move/up with timestamps, get
 *  {type:'tap'|'longpress'|'drag', dx, dy} classifications back.
 *
 *  - move() streams per-move {type:'drag', dx, dy} deltas (movementX/Y-style)
 *    once the finger has wandered past dragPx from its start; null before.
 *  - up(t) returns the whole-gesture verdict (dx/dy = total displacement):
 *    'tap' under tapMs, 'longpress' at/after longPressMs, null in between
 *    or once the gesture dragged (drags are streamed, not reported at up).
 *  - consume() marks the gesture handled — up() will report null. Used to
 *    swallow the sibling finger of a two-finger tap. */
export class GestureDetector {
  constructor({ tapMs = 250, longPressMs = 450, dragPx = 10 } = {}) {
    this.tapMs       = tapMs;
    this.longPressMs = longPressMs;
    this.dragPx      = dragPx;
    this.active      = false;
    this.consumed    = false;
    this._sx = this._sy = 0;   // start
    this._lx = this._ly = 0;   // last
    this._t0 = 0;
    this._moved = 0;           // max distance-from-start seen
  }

  down(x, y, t) {
    this.active   = true;
    this.consumed = false;
    this._sx = this._lx = x;
    this._sy = this._ly = y;
    this._t0 = t;
    this._moved = 0;
  }

  move(x, y) {
    if (!this.active) return null;
    const dx = x - this._lx, dy = y - this._ly;
    this._lx = x; this._ly = y;
    this._moved = Math.max(this._moved, Math.hypot(x - this._sx, y - this._sy));
    if (this.dragStarted()) return { type: 'drag', dx, dy };
    return null;
  }

  /** Past the drag threshold (taps never get here). */
  dragStarted() { return this._moved > this.dragPx; }

  consume() { this.consumed = true; }

  up(t) {
    if (!this.active) return null;
    const dx = this._lx - this._sx, dy = this._ly - this._sy;
    this.active = false;
    if (this.consumed || this.dragStarted()) return null;
    const held = t - this._t0;
    if (held < this.tapMs)             return { type: 'tap', dx, dy };
    if (held >= this.longPressMs)      return { type: 'longpress', dx, dy };
    return null;   // between windows: a hold, not a gesture — caller decides
  }
}

// ── DOM layer ──────────────────────────────────────────────────────────────

const JOY_R      = 56;    // joystick radius, px
const TAP_MS     = 250;   // down→up window that still counts as a tap
const SWING_MS   = 260;   // one tap-swing of mining before auto-release
const STYLE_ID   = 'scrapcraft-touch-styles';
const CSS = `
#scrapcraft-touch-root { position:fixed; inset:0; pointer-events:none; z-index:95;
  user-select:none; -webkit-user-select:none; -webkit-tap-highlight-color:transparent; }
.scrapcraft-touch-zone { position:absolute; top:0; height:100%; touch-action:none;
  pointer-events:auto; }
.scrapcraft-touch-move { left:0;  width:50%; }
.scrapcraft-touch-look { right:0; width:50%; }
.scrapcraft-touch-joy-base { position:absolute; width:104px; height:104px; margin:-52px 0 0 -52px;
  border-radius:50%; border:2px solid rgba(240,180,40,.55); background:rgba(10,12,8,.35);
  display:none; pointer-events:none; }
.scrapcraft-touch-joy-nub { position:absolute; width:46px; height:46px; margin:-23px 0 0 -23px;
  border-radius:50%; background:rgba(240,180,40,.85); box-shadow:0 0 12px rgba(240,180,40,.5);
  display:none; pointer-events:none; }
.scrapcraft-touch-btn { position:absolute; pointer-events:auto; touch-action:none;
  width:52px; height:52px; border-radius:10px; border:1px solid rgba(240,180,40,.5);
  background:rgba(10,12,8,.6); color:#ffd970; font-size:22px; line-height:1;
  display:flex; align-items:center; justify-content:center; }
.scrapcraft-touch-mode  { right:14px; bottom:120px; }
.scrapcraft-touch-inter { right:14px; bottom:62px;  font-size:17px; }
.scrapcraft-touch-hotbar { position:absolute; left:50%; bottom:10px; transform:translateX(-50%);
  display:flex; gap:4px; pointer-events:auto; }
.scrapcraft-touch-hslot { width:30px; height:30px; border-radius:6px; touch-action:none;
  border:1px solid rgba(240,180,40,.35); background:rgba(10,12,8,.6); color:#ffd970;
  font-size:12px; font-family:'Courier New',monospace; display:flex; align-items:center;
  justify-content:center; }
`;

export class TouchControls {
  /** All callbacks optional: onLook(dxPx, dyPx), onMove(nx, ny), onMineStart(),
   *  onMineStop(), onPlace(), onJump(), onInteract(), onHotbar(index). */
  constructor(callbacks = {}) {
    this._cb = callbacks;
    this._enabled  = true;
    this._mode     = 'mine';            // ⛏ tap mines · 🧱 tap places
    this._root     = null;
    this._joyId    = null;
    this._joyBaseX = 0;
    this._joyBaseY = 0;
    this._joyR     = JOY_R;
    this._moveX    = 0;                 // last emitted joystick vector
    this._moveY    = 0;
    this._lookPointers = new Map();     // pointerId → { g, holdTimer, holding }
    this._multiTouch = false;
    this._multiTapAt = 0;               // last two-finger-tap time (stray-swing guard)
    this._swingTimer = null;
    this._styleEl = null;
  }

  get enabled() { return this._enabled; }

  /** Snapshot for tests/telemetry: last stick vector + any finger down. */
  get state() {
    return {
      moving: { x: this._moveX, y: this._moveY },
      active: this._joyId !== null || this._lookPointers.size > 0,
    };
  }

  /** Build + mount the DOM. Validates the root; never throws. */
  attach(root) {
    try {
      if (typeof HTMLElement === 'undefined' || !(root instanceof HTMLElement)) return false;
      this.destroy();
      this._injectStyles();
      this._root = document.createElement('div');
      this._root.id = 'scrapcraft-touch-root';

      this._moveZone = document.createElement('div');
      this._moveZone.className = 'scrapcraft-touch-zone scrapcraft-touch-move';
      this._joyBase = document.createElement('div');
      this._joyBase.className = 'scrapcraft-touch-joy-base';
      this._joyNub = document.createElement('div');
      this._joyNub.className = 'scrapcraft-touch-joy-nub';
      this._moveZone.append(this._joyBase, this._joyNub);

      this._lookZone = document.createElement('div');
      this._lookZone.className = 'scrapcraft-touch-zone scrapcraft-touch-look';

      this._modeBtn = document.createElement('button');
      this._modeBtn.className = 'scrapcraft-touch-btn scrapcraft-touch-mode';
      this._modeBtn.textContent = '⛏';
      this._modeBtn.setAttribute('aria-label', 'Switch tap action: mine');

      this._interactBtn = document.createElement('button');
      this._interactBtn.className = 'scrapcraft-touch-btn scrapcraft-touch-inter';
      this._interactBtn.textContent = '⚒';
      this._interactBtn.setAttribute('aria-label', 'Interact');

      this._hotbarEl = document.createElement('div');
      this._hotbarEl.className = 'scrapcraft-touch-hotbar';
      this._hotSlots = [];
      for (let i = 0; i < 9; i++) {
        const s = document.createElement('div');
        s.className = 'scrapcraft-touch-hslot';
        s.textContent = String(i + 1);
        this._hotbarEl.appendChild(s);
        this._hotSlots.push(s);
      }

      this._root.append(this._moveZone, this._lookZone, this._modeBtn,
        this._interactBtn, this._hotbarEl);
      root.appendChild(this._root);
      this._bind();
      this.setEnabled(this._enabled);
      return true;
    } catch (e) {
      console.warn('[TouchControls] attach failed — continuing without touch layer.', e);
      return false;
    }
  }

  _injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
    this._styleEl = el;
  }

  _bind() {
    // pointer events + capture, NOT mouse events — one code path for
    // finger/stylus/mouse-on-hybrid, and capture keeps drags alive past
    // the zone edge.
    this._moveZone.addEventListener('pointerdown', e => this._onJoyDown(e));
    this._moveZone.addEventListener('pointermove', e => this._onJoyMove(e));
    this._moveZone.addEventListener('pointerup',   e => this._onJoyUp(e));
    this._moveZone.addEventListener('pointercancel', e => this._onJoyUp(e));

    this._lookZone.addEventListener('pointerdown', e => this._onLookDown(e));
    this._lookZone.addEventListener('pointermove', e => this._onLookMove(e));
    this._lookZone.addEventListener('pointerup',   e => this._onLookUp(e));
    this._lookZone.addEventListener('pointercancel', e => this._onLookUp(e));

    this._modeBtn.addEventListener('pointerdown', e => {
      try { e.preventDefault(); e.stopPropagation(); } catch {}
      this._toggleMode();
    });
    this._interactBtn.addEventListener('pointerdown', e => {
      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try { if (this._enabled) this._cb.onInteract?.(); } catch {}
    });
    this._hotSlots.forEach((s, i) => {
      s.addEventListener('pointerdown', e => {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        try { if (this._enabled) this._cb.onHotbar?.(i); } catch {}
      });
    });
  }

  _toggleMode() {
    try {
      if (!this._enabled) return;
      this._mode = this._mode === 'mine' ? 'place' : 'mine';
      this._modeBtn.textContent = this._mode === 'mine' ? '⛏' : '🧱';
      this._modeBtn.setAttribute('aria-label',
        this._mode === 'mine' ? 'Switch tap action: mine' : 'Switch tap action: place');
    } catch { /* a toggle must never crash */ }
  }

  // ── Left half: floating joystick ────────────────────────────────────────

  _onJoyDown(e) {
    if (!this._enabled) return;
    try {
      if (this._joyId !== null) return;          // one thumb drives the stick
      this._joyId = e.pointerId;
      this._moveZone.setPointerCapture?.(e.pointerId);
      this._joyBaseX = e.clientX;
      this._joyBaseY = e.clientY;
      this._joyBase.style.left = `${e.clientX}px`;
      this._joyBase.style.top  = `${e.clientY}px`;
      this._joyBase.style.display = 'block';
      this._joyNub.style.left = `${e.clientX}px`;
      this._joyNub.style.top  = `${e.clientY}px`;
      this._joyNub.style.display = 'block';
      this._emitMove(e.clientX, e.clientY);
    } catch { /* fail-soft */ }
  }

  _onJoyMove(e) {
    if (!this._enabled || e.pointerId !== this._joyId) return;
    try { this._emitMove(e.clientX, e.clientY); } catch { /* fail-soft */ }
  }

  _emitMove(x, y) {
    const { x: nx, y: ny } = clampJoystick(x - this._joyBaseX, y - this._joyBaseY, this._joyR);
    this._moveX = nx;
    this._moveY = -ny;   // screen-up = forward
    this._joyNub.style.transform =
      `translate(${(nx * this._joyR).toFixed(1)}px, ${(ny * this._joyR).toFixed(1)}px)`;
    this._cb.onMove?.(this._moveX, this._moveY);
  }

  _onJoyUp(e) {
    if (e.pointerId !== this._joyId) return;
    try {
      this._joyId = null;
      this._joyBase.style.display = 'none';
      this._joyNub.style.display = 'none';
      this._joyNub.style.transform = '';
      this._moveX = 0; this._moveY = 0;
      this._cb.onMove?.(0, 0);
    } catch { /* fail-soft */ }
  }

  // ── Right half: look-drag + taps ────────────────────────────────────────

  _onLookDown(e) {
    if (!this._enabled) return;
    try {
      this._lookZone.setPointerCapture?.(e.pointerId);
      const g = new GestureDetector({ tapMs: TAP_MS });
      g.down(e.clientX, e.clientY, performance.now());
      const entry = { g, holdTimer: null, holding: false };
      this._lookPointers.set(e.pointerId, entry);
      if (this._lookPointers.size >= 2) this._multiTouch = true;
      // Stationary hold past the tap window = mine continuously (LMB-style).
      entry.holdTimer = setTimeout(() => {
        try {
          if (!this._enabled || !g.active || g.dragStarted() || g.consumed) return;
          g.consume();
          entry.holding = true;
          this._multiTapAt = 0;   // a hold cancels any pending tap-pair grace
          this._cb.onMineStart?.();
        } catch { /* never throw from a timer */ }
      }, TAP_MS);
    } catch { /* fail-soft */ }
  }

  _onLookMove(e) {
    if (!this._enabled) return;
    try {
      const entry = this._lookPointers.get(e.pointerId);
      if (!entry) return;
      // Only the first finger on the look zone steers the camera; a second
      // finger is half of a two-finger tap, not a second camera.
      const firstId = this._lookPointers.keys().next().value;
      if (e.pointerId !== firstId) return;
      const ev = entry.g.move(e.clientX, e.clientY);
      if (ev) this._cb.onLook?.(ev.dx, ev.dy);
    } catch { /* fail-soft */ }
  }

  _onLookUp(e) {
    try {
      const entry = this._lookPointers.get(e.pointerId);
      if (!entry) return;
      clearTimeout(entry.holdTimer);
      const g = entry.g;
      this._lookPointers.delete(e.pointerId);
      if (this._lookPointers.size === 0) this._multiTouch = false;

      if (entry.holding) { this._cb.onMineStop?.(); return; }
      const res = g.up(performance.now());
      if (!res || res.type !== 'tap') return;   // holds + long-presses: no tap action
      const now = performance.now();
      if (this._multiTouch) {
        // two-finger tap = jump; swallow the sibling finger's tap too
        for (const [, other] of this._lookPointers) other.g.consume();
        this._multiTapAt = now;   // grace window: the sibling's release must not swing
        this._cb.onJump?.();
        return;
      }
      // The other half of a two-finger tap lifting after its partner — a tap
      // in shape, but it already spent its action on the jump.
      if (this._multiTapAt && now - this._multiTapAt < 400) return;
      if (this._mode === 'place') { this._cb.onPlace?.(); return; }
      this._swing();
    } catch { /* fail-soft */ }
  }

  /** One tap-swing: press the mine path for SWING_MS, then release. */
  _swing() {
    this._cb.onMineStart?.();
    clearTimeout(this._swingTimer);
    this._swingTimer = setTimeout(() => {
      try { this._cb.onMineStop?.(); } catch { /* never throw from a timer */ }
    }, SWING_MS);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  setEnabled(on) {
    this._enabled = !!on;
    try {
      if (this._root) this._root.style.display = this._enabled ? '' : 'none';
      if (!this._enabled) this._releaseAll();
    } catch { /* fail-soft */ }
  }

  /** Drop every in-flight gesture: center the stick, stop mining, clear timers. */
  _releaseAll() {
    try {
      if (this._joyId !== null) {
        this._joyId = null;
        this._joyBase.style.display = 'none';
        this._joyNub.style.display = 'none';
        this._moveX = 0; this._moveY = 0;
        this._cb.onMove?.(0, 0);
      }
      let wasHolding = false;
      for (const [, entry] of this._lookPointers) {
        clearTimeout(entry.holdTimer);
        if (entry.holding) wasHolding = true;
        entry.g.consume();
      }
      this._lookPointers.clear();
      this._multiTouch = false;
      if (wasHolding) this._cb.onMineStop?.();
      clearTimeout(this._swingTimer);
    } catch { /* fail-soft */ }
  }

  /** Remove DOM + listeners. Idempotent. */
  destroy() {
    try {
      this._releaseAll();
      this._root?.remove();
      this._root = null;
      // Only pull the style tag if we injected it (a second instance may be
      // sharing it — the id check in _injectStyles covers re-attach).
      this._styleEl?.remove();
      this._styleEl = null;
    } catch { /* fail-soft */ }
  }
}
