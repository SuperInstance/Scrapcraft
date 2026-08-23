/**
 * ───────────────────────────────────────────────────────────────────────────
 *  CUTSCENE DIRECTOR — the player-facing cutscene engine
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Orchestrates playback of a cutscene: updates the camera, renders letterbox
 * bars and subtitles to the DOM, and handles player skip. Fail-soft contract:
 * no camera/DOM → all updates are safe no-ops, never throws. Idempotent:
 * playing while playing cleanly replaces the current playback.
 *
 * Pause-safe: `setPaused()` flag gates time advancement; `bindKeys()` wires
 * player skip. DOM elements use fixed IDs (cs-bar-top, cs-bar-bot, cs-subtitle,
 * cs-skip-hint) so the host can style them.
 */

import { evalTimeline, validateTimeline, cutsceneById } from './Timeline.js';
// Side-effect: registering the authored cutscenes into the shared registry.
// The director must resolve ids no matter who imports it first — the
// registry never silently comes up empty.
import './data/cutscenes.js';

// Fake element class for tests (no-op DOM methods)
class FakeEl {
  constructor(tag = '') {
    this.tag = tag;
    this.classList = { add: () => {}, remove: () => {} };
    this.style = {};
    this.textContent = '';
    this.children = [];
  }
  appendChild(child) {
    this.children.push(child);
  }
}

export class CutsceneDirector {
  /**
   * @param {object} [opts]
   * @param {object} [opts.camera] THREE camera (or any { position:{set()}, lookAt() })
   * @param {object} [opts.world] world object (optional, unused for now)
   * @param {object} [opts.game] game object (optional, unused for now)
   * @param {HTMLElement} [opts.container] DOM element to attach bars/subtitles (default: document.body)
   */
  constructor(opts = {}) {
    this._camera = opts.camera ?? null;
    this._world = opts.world ?? null;
    this._game = opts.game ?? null;
    this._container = opts.container ?? (typeof document !== 'undefined' ? document.body : null);

    this._active = false;
    this._paused = false;
    this._t = 0;
    this._def = null;
    this._onDone = null;
    this._subtitleEl = null;
    this._onDoneFired = false;
    this._keyListener = null;
    this._keyTarget = null;

    // DOM elements
    this._barTop = null;
    this._barBot = null;
    this._barHeight = 0; // CSS percentage
    this._skipped = false;
  }

  get active() { return this._active; }
  get paused() { return this._paused; }

  /**
   * Set paused state. When paused, update() does not advance time.
   * @param {boolean} value
   */
  setPaused(value) {
    this._paused = Boolean(value);
  }

  /**
   * Play a cutscene by id. Replaces any active playback. Validates before playing.
   * @param {string} id - cutscene id
   * @param {object} [opts]
   * @param {function} [opts.onDone] callback when done or skipped
   * @param {HTMLElement} [opts.subtitleEl] optional container for subtitles (default: creates one)
   * @returns {boolean} true if play began, false if id invalid/not found
   */
  play(id, opts = {}) {
    // End current playback cleanly
    if (this._active) {
      this.end();
    }

    const def = cutsceneById(id);
    if (!def) {
      // Invalid id: call onDone once and return false
      if (opts.onDone) {
        try {
          opts.onDone();
        } catch { /* silently ignore */ }
      }
      return false;
    }

    const validation = validateTimeline(def);
    if (!validation.ok) {
      // Invalid def: call onDone once and return false
      if (opts.onDone) {
        try {
          opts.onDone();
        } catch { /* silently ignore */ }
      }
      return false;
    }

    // Mark as seen
    this._markSeen(id);

    this._def = def;
    this._onDone = opts.onDone ?? null;
    this._t = 0;
    this._active = true;
    this._paused = false;
    this._onDoneFired = false;
    this._skipped = false;

    // Create or use provided subtitle element
    this._subtitleEl = opts.subtitleEl ?? this._createSubtitleEl();

    // Create letterbox bars
    this._createLetterboxBars();

    return true;
  }

  /**
   * Advance playback. Only advances time when active and not paused.
   * @param {number} dt - delta time (seconds)
   */
  update(dt) {
    if (!this._active || this._paused || !this._def) return;

    this._t += dt;

    const state = evalTimeline(this._def, this._t);

    // Update camera if available
    if (this._camera && state.pose) {
      try {
        const { pose } = state;
        this._camera.position.set(pose.x, pose.y, pose.z);
        if (pose.look) {
          this._camera.lookAt(pose.look.x, pose.look.y, pose.look.z);
        }
      } catch { /* camera mutation failed; continue */ }
    }

    // Update letterbox bars
    this._updateLetterboxBars(state.letterbox, this._def.letterbox?.height ?? 0.11);

    // Update subtitle
    if (this._subtitleEl) {
      try {
        if (state.subtitle) {
          const { speaker, text } = state.subtitle;
          let html = '';
          if (speaker) {
            html = `<strong>${escapeHtml(speaker)}</strong> ${escapeHtml(text)}`;
          } else {
            html = escapeHtml(text);
          }
          this._subtitleEl.innerHTML = html;
          this._subtitleEl.style.opacity = '1';
        } else {
          this._subtitleEl.innerHTML = '';
          this._subtitleEl.style.opacity = '0';
        }
      } catch { /* DOM update failed */ }
    }

    // Check if done
    if (state.done && !this._onDoneFired) {
      this._finishOnDone();
      this.end();
    }
  }

  /** Fire the pending onDone exactly once (done, skip, and replace paths). */
  _finishOnDone() {
    if (this._onDoneFired) return;
    this._onDoneFired = true;
    if (this._onDone) {
      try {
        this._onDone();
      } catch { /* callback threw */ }
    }
  }

  /**
   * Skip the cutscene. Fast-forwards letterbox out, fires onDone once.
   */
  skip() {
    if (!this._active) return;

    this._skipped = true;

    // Fast-forward letterbox out
    try {
      if (this._barTop) this._barTop.style.transform = 'translateY(-100%)';
      if (this._barBot) this._barBot.style.transform = 'translateY(100%)';
    } catch { /* style failed */ }

    // Clear subtitle
    if (this._subtitleEl) {
      try {
        this._subtitleEl.innerHTML = '';
        this._subtitleEl.style.opacity = '0';
      } catch { /* DOM update failed */ }
    }

    if (this._onDone) {
      this._finishOnDone();
    }

    this.end();
  }

  /**
   * Clean up the cutscene. Removes DOM elements, unbinds keys, clears state.
   * If a pending onDone never fired (replace, external end), fire it once —
   * the host must always learn the cinema is over, never strand a callback.
   */
  end() {
    if (this._active) this._finishOnDone();
    this._active = false;
    this._unbindKeys();

    // Remove DOM elements
    try {
      if (this._barTop?.parentElement) this._barTop.parentElement.removeChild(this._barTop);
      if (this._barBot?.parentElement) this._barBot.parentElement.removeChild(this._barBot);
      if (this._subtitleEl?.parentElement) this._subtitleEl.parentElement.removeChild(this._subtitleEl);
    } catch { /* DOM removal failed */ }

    this._def = null;
    this._barTop = null;
    this._barBot = null;
  }

  /**
   * Check if a cutscene has been seen (played at least once).
   * @param {string} id
   * @returns {boolean}
   */
  seen(id) {
    if (!id) return false;
    try {
      const storage = this._getStorage();
      const seen = JSON.parse(storage.getItem('scrap.cinema.seen.v1') || '{}');
      return seen[id] === true;
    } catch {
      return false;
    }
  }

  /**
   * Bind key events to trigger skip. Attaches a single keydown listener.
   * @param {EventTarget} target - element to bind to (e.g., document)
   */
  bindKeys(target) {
    if (!target || this._keyListener) return; // Already bound or no target

    this._keyTarget = target;
    this._keyListener = () => this.skip();
    try {
      target.addEventListener('keydown', this._keyListener);
    } catch { /* addEventListener failed */ }
  }

  // ─── Private ────────────────────────────────────────────────────────────

  _createLetterboxBars() {
    if (!this._container) return;

    try {
      this._barTop = this._createElement('div');
      this._barTop.id = 'cs-bar-top';
      this._barTop.style.position = 'fixed';
      this._barTop.style.top = '0';
      this._barTop.style.left = '0';
      this._barTop.style.width = '100%';
      this._barTop.style.height = '11%';
      this._barTop.style.backgroundColor = 'black';
      this._barTop.style.transform = 'translateY(-100%)';
      this._barTop.style.transition = 'transform 0.4s ease-out';
      // (no inline z-index — stacking is the host's call; index.html parks
      // the cinema just under the pause overlay, see #cs-bar-top CSS)
      this._container.appendChild(this._barTop);

      this._barBot = this._createElement('div');
      this._barBot.id = 'cs-bar-bot';
      this._barBot.style.position = 'fixed';
      this._barBot.style.bottom = '0';
      this._barBot.style.left = '0';
      this._barBot.style.width = '100%';
      this._barBot.style.height = '11%';
      this._barBot.style.backgroundColor = 'black';
      this._barBot.style.transform = 'translateY(100%)';
      this._barBot.style.transition = 'transform 0.4s ease-out';
      this._container.appendChild(this._barBot);
    } catch { /* DOM creation failed */ }
  }

  _updateLetterboxBars(letterboxRamp, barHeight) {
    if (!this._barTop || !this._barBot) return;

    try {
      // Ramp value 0..1 maps to visibility: 0 = hidden, 1 = visible at full height
      const moveY = -100 * (1 - letterboxRamp);
      this._barTop.style.transform = `translateY(${moveY}%)`;
      this._barBot.style.transform = `translateY(${-moveY}%)`;
    } catch { /* style update failed */ }
  }

  _createSubtitleEl() {
    if (!this._container) return null;

    try {
      const el = this._createElement('div');
      el.id = 'cs-subtitle';
      el.style.position = 'fixed';
      el.style.bottom = '20vh';
      el.style.left = '50%';
      el.style.transform = 'translateX(-50%)';
      el.style.maxWidth = '80%';
      el.style.textAlign = 'center';
      el.style.color = 'white';
      el.style.fontSize = '16px';
      el.style.fontFamily = 'Arial, sans-serif';
      el.style.textShadow = '2px 2px 8px rgba(0,0,0,0.8)';
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s ease';
      el.style.pointerEvents = 'none';
      this._container.appendChild(el);
      return el;
    } catch {
      return null;
    }
  }

  _markSeen(id) {
    try {
      const storage = this._getStorage();
      const seen = JSON.parse(storage.getItem('scrap.cinema.seen.v1') || '{}');
      seen[id] = true;
      storage.setItem('scrap.cinema.seen.v1', JSON.stringify(seen));
    } catch { /* storage write failed */ }
  }

  _getStorage() {
    // Returns localStorage or a Map-based fake for tests
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
    // Fallback: use a Map-based fake storage for headless tests
    if (!this._fakeStorage) {
      this._fakeStorage = new Map();
      this._fakeStorage.getItem = (k) => this._fakeStorage.get(k) ?? null;
      this._fakeStorage.setItem = (k, v) => this._fakeStorage.set(k, v);
    }
    return this._fakeStorage;
  }

  _unbindKeys() {
    if (this._keyListener && this._keyTarget) {
      try {
        this._keyTarget.removeEventListener('keydown', this._keyListener);
      } catch { /* removeEventListener failed */ }
    }
    this._keyListener = null;
    this._keyTarget = null;
  }

  _createElement(tag) {
    if (typeof document !== 'undefined') {
      return document.createElement(tag);
    }
    return new FakeEl(tag);
  }
}

// Helper: escape HTML entities to prevent XSS
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}
