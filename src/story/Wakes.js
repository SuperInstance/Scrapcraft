/**
 * WAKES — Thread 3 of "The Yard Remembers": the yard is asleep and wakes,
 * one dormant thing per completed spine chapter, permanently and visibly.
 * Ambient by design — no text dumps, the kid FEELS the yard changing.
 * See workspace/story-design/yard-remembers.md for the thread bible.
 *
 * Additive + fail-soft: no spine/storage → inert. The yard wakes, it never
 * sleeps again (monotonic), and nothing here ever gates the spine or race.
 */

export const WAKE_EVENTS = [
  { id: 'wake-yardlight',    chapter: 2,  hint: 'nightLight',   name: 'The East Road Light' },
  { id: 'wake-fencewhistle', chapter: 4,  hint: 'audioCue',     name: 'The Fence Whistle' },
  { id: 'wake-smelterpilot', chapter: 6,  hint: 'pilotLight',   name: "The Smelter's Own Flame" },
  { id: 'wake-oldbot-turn',  chapter: 9,  hint: 'oldBotShift',  name: 'The Long Route Home' },
  { id: 'wake-racenight',    chapter: 12, hint: 'allLights',    name: 'The Night Everything Was On' },
];

export class Wakes {
  /** @param {{ storage?: object }} deps */
  constructor({ storage } = {}) {
    this._storage = storage ?? null;
    /** @type {Record<string, boolean>} chapter-number → awake */
    this._awake = {};
    this._load();
  }

  _key() { return 'scrap.wakes.v1'; }
  _load() {
    if (!this._storage?.getItem) return;
    try {
      const raw = this._storage.getItem(this._key());
      if (raw) this._awake = JSON.parse(raw);
    } catch { /* corrupt save: start the awake-map over, never crash the yard */ }
  }
  _save() {
    try { this._storage?.setItem?.(this._key(), JSON.stringify(this._awake)); } catch { /* quota */ }
  }

  /**
   * Scan the spine and wake everything whose chapter is complete.
   * Idempotent + monotonic: called on quest events by QuestSystem._checkSpine.
   * @param {{ chapters: Array, chapterComplete: (ch)=>boolean }} spine
   * @returns {string[]} ids newly woken this call (for one-shot ambience)
   */
  sync(spine) {
    const newly = [];
    if (!spine?.chapters || typeof spine.chapterComplete !== 'function') return newly;
    for (const ev of WAKE_EVENTS) {
      const ch = spine.chapters.find(c => (c.n ?? spine.indexOf(c.id)) === ev.chapter);
      if (!ch) continue;
      if (!this._awake[String(ev.chapter)] && spine.chapterComplete(ch)) {
        this._awake[String(ev.chapter)] = true;   // monotonic: never un-wake
        newly.push(ev.id);
      }
    }
    if (newly.length) this._save();
    return newly;
  }

  /** Is a wake event active? (id or chapter number accepted) */
  active(idOrN) {
    const ev = typeof idOrN === 'string'
      ? WAKE_EVENTS.find(e => e.id === idOrN)
      : WAKE_EVENTS.find(e => e.chapter === idOrN);
    return ev ? !!this._awake[String(ev.chapter)] : false;
  }

  /** Names of awake events — the Logbook's "what woke" list (Earl never explains). */
  awakeNames() {
    return WAKE_EVENTS.filter(e => this.active(e.chapter)).map(e => e.name);
  }

  /** How many dormant things have woken (0..5) — drives ambient intensity. */
  count() { return this.awakeNames().length; }
}
