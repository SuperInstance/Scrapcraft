/**
 * ───────────────────────────────────────────────────────────────────────────
 *  CHALLENGE PROGRESS  —  remembers best star rating per Maker Challenge
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  Tiny, dependency-free store of "how well did I solve each challenge."
 *  Keyed by challenge id → best stars (0..3). Persistence is pluggable:
 *
 *    • default: browser localStorage (survives reloads on the kid's machine);
 *    • tests / SSR: pass an in-memory store, or none (a Map is used).
 *
 *  Every storage access is wrapped — a private window, cleared site data, or a
 *  quota error must never break the Maker Lab. On any failure we fall back to an
 *  in-memory Map so the current session still tracks progress.
 * ───────────────────────────────────────────────────────────────────────────
 */

const KEY = 'scrapcraft.challenges.v1';

/** A localStorage-backed store, or null if unavailable. */
function localStore() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    // probe once — private mode can throw on write
    const probe = '__sc_probe__';
    ls.setItem(probe, '1'); ls.removeItem(probe);
    return {
      get: () => ls.getItem(KEY),
      set: (v) => ls.setItem(KEY, v),
    };
  } catch { return null; }
}

/** An in-memory fallback with the same shape. */
function memStore() {
  let v = null;
  return { get: () => v, set: (x) => { v = x; } };
}

export class ChallengeProgress {
  /** @param {object} [store] optional { get(), set(v) }; defaults to localStorage → memory. */
  constructor(store) {
    this.store = store || localStore() || memStore();
    this.data = this._load();
  }

  _load() {
    try {
      const raw = this.store.get();
      const obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === 'object') ? obj : {};
    } catch { return {}; }
  }

  _save() {
    try { this.store.set(JSON.stringify(this.data)); } catch { /* best-effort */ }
  }

  /** Record a run; keeps the BEST stars ever earned. Returns true if it improved. */
  record(id, stars) {
    const s = Math.max(0, Math.min(3, Math.floor(stars || 0)));
    const prev = this.data[id] || 0;
    if (s > prev) { this.data[id] = s; this._save(); return true; }
    return false;
  }

  /** Best stars for a challenge (0 if never solved). */
  best(id) { return this.data[id] || 0; }

  /** Has this challenge been solved at all (≥1 star)? */
  solved(id) { return (this.data[id] || 0) >= 1; }

  /**
   * Roll-up across a list of challenge ids (or objects with .id).
   * @returns {{solved, total, stars, maxStars, complete}}
   */
  summary(challenges = []) {
    const ids = challenges.map(c => (typeof c === 'string' ? c : c.id));
    let solved = 0, stars = 0;
    for (const id of ids) { const s = this.data[id] || 0; if (s >= 1) solved++; stars += s; }
    const total = ids.length;
    return { solved, total, stars, maxStars: total * 3, complete: total > 0 && solved === total };
  }

  /** Wipe all progress (e.g. a "reset" button). */
  reset() { this.data = {}; this._save(); }
}
