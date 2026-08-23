/**
 * ───────────────────────────────────────────────────────────────────────────
 *  BANTER VARIETY  —  no kid hears the same line twice in a short session
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The anti-repetition layer that sits between the banks and the mouth:
 *
 *   LineMemory          a ring of recently-spoken line texts per bank. Picks
 *                      EXCLUDE the ring, so a pool of N lines plays N
 *                      different lines before any can repeat. Fails soft:
 *                      when the ring would starve a small pool, it resets
 *                      (worst case a 2-line pool alternates A,B,A,B — a
 *                      back-to-back repeat is impossible while pool ≥ 2).
 *                      Save-persisted: round-trips through
 *                      CompanionState.data.banterRecent (fail-soft, capped).
 *
 *   pickBanterFresh     pickBanter's tier/trait rules + ring memory +
 *                      `when` context gating (time-of-day, weather, event
 *                      telemetry). A line tagged `when` only speaks when the
 *                      world actually says so — lines that reference things
 *                      that haven't happened stay silent.
 *
 *   pickObservationFresh pickObservation, hardened: templates that render
 *                      null (the event they reference hasn't happened) are
 *                      suppressed BEFORE the roll, so a wasted cooldown
 *                      never eats the idle slot. Ambient banks
 *                      (persona.ambient — {when(ctx), line}) join the pool
 *                      only when their gate matches the live context.
 *
 *   ChatterGuard        cadence: a minimum gap between UNSOLICITED lines
 *                      (observations, ambient, nudges) and a rolling budget
 *                      per 10 minutes — the companion is a character, not
 *                      a noise source. Every spoken line (even reactive)
 *                      extends the quiet gap.
 *
 * Pure module: no I/O, injectable rng/now, every accessor fail-soft.
 */

import { TIER_NAMES, filterLines } from './banter.js';

export const DEFAULT_RING_CAP = 5; // per bank: the N most recent line texts

// ── LineMemory ─────────────────────────────────────────────────────────────

/**
 * Ring-buffer of recently spoken line texts, one per bank key.
 * @param {Record<string, string[]>} [rings] pre-loaded rings (from a save)
 * @param {number} [cap] max remembered lines per bank (before pool shrink)
 */
export class LineMemory {
  constructor(rings = {}, cap = DEFAULT_RING_CAP) {
    this.rings = {};
    this.cap = Math.max(1, cap);
    try {
      for (const [k, v] of Object.entries(rings ?? {})) {
        if (typeof k === 'string' && k.length <= 64 && Array.isArray(v)) {
          const texts = v.filter(t => typeof t === 'string' && t.length > 0).slice(-2 * this.cap);
          if (texts.length) this.rings[k] = texts;
        }
      }
    } catch { this.rings = {}; }   // garbage in → empty memory out
  }

  /** Load from a save-shaped object (state.data.banterRecent). Fail-soft. */
  static from(dataLike, cap = DEFAULT_RING_CAP) {
    if (!dataLike || typeof dataLike !== 'object' || Array.isArray(dataLike)) return new LineMemory({}, cap);
    return new LineMemory(dataLike, cap);
  }

  /** Save-shaped snapshot ({ bankKey: [texts] }) — small by construction. */
  toData() {
    const out = {};
    for (const [k, v] of Object.entries(this.rings)) out[k] = [...v];
    return out;
  }

  /** The texts recently spoken for `key`. */
  recent(key) { return this.rings[key] ?? []; }

  /**
   * Pool entries whose line text is NOT in the ring. If that would starve
   * the pool, the ring resets and the full pool returns — a small bank keeps
   * talking instead of going silent (and never repeats back-to-back).
   * @param {Array<{line:string}>} pool
   * @param {string} key
   */
  eligible(pool, key) {
    if (!Array.isArray(pool) || pool.length === 0) return [];
    const ring = this.rings[key];
    if (!ring || ring.length === 0) return pool;
    const seen = new Set(ring);
    const fresh = pool.filter(l => !seen.has(l?.line));
    if (fresh.length > 0) return fresh;
    delete this.rings[key];   // pool fully exhausted → new cycle
    return pool;
  }

  /**
   * Record a spoken line. The ring trims itself to leave at least one line
   * unsaid whenever possible (pool 8 → remember 5; pool 2 → remember 1).
   */
  remember(key, text, poolSize = Infinity) {
    if (typeof key !== 'string' || typeof text !== 'string' || !text) return;
    const eff = Math.max(1, Math.min(this.cap, (Number.isFinite(poolSize) ? poolSize : this.cap) - 1));
    const ring = this.rings[key] ?? [];
    const next = [...ring.filter(t => t !== text), text];
    this.rings[key] = next.slice(-eff);
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function tierIndexOf(stateLike) {
  if (typeof stateLike?.tierIndex === 'function') {
    try { return stateLike.tierIndex(); } catch { return 0; }
  }
  return TIER_NAMES.indexOf(stateLike?.tier ?? 'stranger');
}

function topTraitOf(stateLike) {
  if (typeof stateLike?.topTrait === 'function') {
    try { return stateLike.topTrait(); } catch { return null; }
  }
  return stateLike?.topTrait ?? null;
}

/** Run a `when` gate; a throwing gate means "not now", never a crash. */
function gateOk(when, ...args) {
  if (typeof when !== 'function') return true;
  try { return Boolean(when(...args)); } catch { return false; }
}

/** Render an observation-style entry against the state data. null → skip. */
function renderEntry(entry, data, context) {
  try {
    if (typeof entry === 'function') {
      const out = entry(data);
      return typeof out === 'string' && out.length > 0 ? out : null;
    }
    if (entry && typeof entry === 'object') {
      if (entry.when && !gateOk(entry.when, context ?? {}, data)) return null;
      const out = typeof entry.line === 'function' ? entry.line(data) : entry.line;
      return typeof out === 'string' && out.length > 0 ? out : null;
    }
    return null;
  } catch { return null; }
}

// ── pick-with-memory: reactive banter ──────────────────────────────────────

/**
 * pickBanter's personality rules (tier reach-down, trait flavor, exact-tier
 * preference) + ring memory + `when` gating. Same call shape as pickBanter
 * plus opts, so callers can adopt it one line at a time.
 *
 * @param {string} event bank key ('crash', 'greet_return', …)
 * @param {object} stateLike RivetState/CompanionState-like (tier, topTrait, data)
 * @param {() => number} rng injectable random
 * @param {object} bank persona banter bank
 * @param {LineMemory|null} [memory] ring memory (null → plain pickBanter rules)
 * @param {object} [opts] { prefix='b', detail, context, data }
 *   detail     event detail ({biome}, {secs}) — also passed to `when` gates
 *   context    ambient context ({tod, weather}) at speak time
 *   data       counters-shaped state for `when` gates (defaults stateLike.data)
 * @returns {string|null}
 */
export function pickBanterFresh(event, stateLike, rng = Math.random, bank, memory = null, opts = {}) {
  const idx = tierIndexOf(stateLike);
  let pool = filterLines(event, idx, bank);
  if (pool.length === 0) return null;

  // context gating — lines keyed to moments that aren't happening stay quiet
  const detail = opts.detail ?? {};
  const context = opts.context ?? null;
  const data = opts.data ?? stateLike?.data ?? null;
  if (pool.some(l => l.when)) {
    pool = pool.filter(l => gateOk(l.when, detail, data, context));
    if (pool.length === 0) return null;
  }

  const key = `${opts.prefix ?? 'b'}:${event}`;
  const candidates = memory ? memory.eligible(pool, key) : pool;
  if (candidates.length === 0) return null;

  const top = topTraitOf(stateLike);
  const flavored = candidates.filter(l => l.trait === top);
  const exact = candidates.filter(l => l.tier === idx);
  const bankPick = (flavored.length && rng() < 0.65) ? flavored
    : exact.length && rng() < 0.75 ? exact
    : candidates;
  const line = bankPick[Math.floor(rng() * bankPick.length)]?.line ?? null;
  if (line && memory) memory.remember(key, line, pool.length);
  return line;
}

// ── pick-with-memory: idle observations + ambient lines ────────────────────

/**
 * pickObservation, hardened for variety:
 *   - templates that render null (event hasn't happened) are suppressed
 *     BEFORE the roll — no wasted cooldowns, no lines about ghosts un-beaten
 *   - the persona's ambient bank (tod/weather-gated flavor) joins the pool
 *     only when the live context matches
 *   - ring memory keeps recent lines out of the rotation
 * @param {object} stateLike
 * @param {() => number} rng
 * @param {Array} observations persona observation bank (fns or {when,line})
 * @param {LineMemory|null} [memory]
 * @param {Array<{when:(ctx:object)=>boolean, line:string}>} [ambient] persona ambient bank
 * @param {object} [context] { tod, weather } — null disables ambient entirely
 * @param {string} [prefix] memory key prefix
 * @returns {string|null}
 */
export function pickObservationFresh(stateLike, rng = Math.random, observations, memory = null, ambient = null, context = null, prefix = 'obs') {
  const idx = tierIndexOf(stateLike);
  const data = stateLike?.data ?? stateLike ?? {};

  // tier slice, same shape as pickObservation (gentle first, personal later)
  const slice = idx >= 2 ? observations
    : idx === 1 ? observations.slice(0, Math.max(3, observations.length - 2))
    : observations.slice(0, Math.min(3, observations.length));

  // render candidates; null-returning templates are suppressed, not wasted
  const candidates = [];
  for (const entry of slice ?? []) {
    const text = renderEntry(entry, data, context);
    if (text) candidates.push(text);
  }
  // ambient lines join only when their gate matches the live world
  if (Array.isArray(ambient) && context) {
    for (const entry of ambient) {
      const text = renderEntry(entry, data, context);
      if (text) candidates.push(text);
    }
  }
  if (candidates.length === 0) return null;

  const fresh = memory ? memory.eligible(candidates.map(t => ({ line: t })), prefix) : candidates.map(t => ({ line: t }));
  const pick = fresh[Math.floor(rng() * fresh.length)]?.line ?? null;
  if (pick && memory) memory.remember(prefix, pick, candidates.length);
  return pick;
}

// ── cadence guard ──────────────────────────────────────────────────────────

/**
 * The companion never becomes noise:
 *   - UNSOLICITED lines (observations, ambient, nudges) respect a minimum
 *     gap since the last spoken line of ANY kind (reactive lines reset the
 *     quiet clock too — chatter right after a celebration reads as noise)
 *   - a rolling window budget caps unsolicited lines per 10 minutes
 *   - warnings (low battery) and player-initiated lines (talk, tier-ups)
 *     are exempt from the gate — actionable info beats cadence — but they
 *     still extend the gap via noteSpeech()
 * All clock access goes through injectable now() (seconds).
 */
export class ChatterGuard {
  /**
   * @param {object} [opts]
   * @param {number} [opts.minGapS=20]   min seconds between unsolicited lines
   * @param {number} [opts.windowS=600]  rolling budget window (10 min)
   * @param {number} [opts.maxUnsolicited=6] max unsolicited lines per window
   * @param {() => number} [opts.now]    seconds clock (injectable, tests)
   */
  constructor(opts = {}) {
    this.minGapS = opts.minGapS ?? 20;
    this.windowS = opts.windowS ?? 600;
    this.maxUnsolicited = opts.maxUnsolicited ?? 6;
    this.now = opts.now ?? (() => Date.now() / 1000);
    this._lastSpeechAt = -Infinity;
    this._unsolicited = [];   // rolling timestamps
  }

  /** ANY spoken line — reactive, talk, tier-up, warning — extends the gap. */
  noteSpeech() {
    this._lastSpeechAt = this.now();
    this._prune();
  }

  /** True when an unsolicited line may speak right now (no side effects). */
  canSpeakUnsolicited() {
    this._prune();
    const t = this.now();
    if (t - this._lastSpeechAt < this.minGapS) return false;
    if (this._unsolicited.length >= this.maxUnsolicited) return false;
    return true;
  }

  /** Record a spoken unsolicited line (call right after speaking one). */
  commitUnsolicited() {
    this._unsolicited.push(this.now());
    this.noteSpeech();
  }

  /** Unsolicited lines inside the current window (introspection/tests). */
  unsolicitedCount() { this._prune(); return this._unsolicited.length; }

  _prune() {
    const cutoff = this.now() - this.windowS;
    while (this._unsolicited.length && this._unsolicited[0] <= cutoff) this._unsolicited.shift();
  }
}
