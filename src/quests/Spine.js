/**
 * ───────────────────────────────────────────────────────────────────────────
 *  THE SPINE, LIVE  —  chapter position, ceremonies, soft band unlocks
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The spine data cut (spine.json) declared the twelve chapters as a reading
 * order over quests that already run. This module makes that map LIVE:
 *
 *   chapter position  the furthest chapter the player has touched — a
 *                     carrier completed or the chapter's opener (first
 *                     listed carrier) surfaced by the tracker. Monotonic:
 *                     completed sets only grow and prerequisites never
 *                     un-meet, so the position never walks backwards.
 *   ceremonies        a chapter OPEN ceremony fires the moment its content
 *                     is first reached — once ever per chapter, persisted
 *                     cold-start-gate style (no replay on reload).
 *   soft bands        bands are chapter geography, not walls. The spine
 *                     exposes unlockedBand() (deepest band the story has
 *                     opened); Game.js uses it to swap the normal zone
 *                     quip for one gentle Earl nudge — never a block. The
 *                     failsafe is structural: push deep enough to finish a
 *                     chapter's carriers and the position — and the band —
 *                     advance on their own.
 *
 * Headless like the rest of src/quests' engine tier: no DOM, no game
 * imports. The tracker is read; QuestSystem owns the presentation.
 */

const SPINE_KEY = 'scrapcraft_spine_v1';

export class SpineState {
  /**
   * @param {object}   opts
   * @param {object[]} opts.spine        SPINE chapters (data/index.js)
   * @param {object}   opts.tracker      QuestTracker (read-only)
   * @param {object|null} [opts.storage] injectable persistence
   */
  constructor({ spine, tracker, storage }) {
    this.chapters = spine;
    this._tracker = tracker;
    this._storage = storage !== undefined ? storage
      : (typeof localStorage !== 'undefined' ? localStorage : null);
    this.data = { v: 1, opened: {}, bandNudged: {}, completedCh: {}, completedEver: false };
  }

  // ── persistence (cold-start-gate style) ───────────────────────────────────

  save() {
    try { this._storage?.setItem(SPINE_KEY, JSON.stringify(this.data)); } catch { /* corrupt-world tolerant */ }
  }
  load() {
    try {
      const raw = this._storage?.getItem(SPINE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && d.v === 1) {
        this.data = { v: 1, opened: d.opened ?? {}, bandNudged: d.bandNudged ?? {},
          completedCh: d.completedCh ?? {}, completedEver: d.completedEver ?? false };
      }
    } catch { /* fresh start on corrupt saves */ }
  }

  // ── chapter status (all derived from tracker state — no shadow truth) ─────

  /** The chapter record by 1-based position (or null). */
  chapter(n) { return this.chapters[n - 1] ?? null; }
  byId(id) { return this.chapters.find(c => c.id === id) ?? null; }
  indexOf(id) { return this.chapters.findIndex(c => c.id === id) + 1; }

  /** A chapter is COMPLETE when every carrier quest is completed. */
  chapterComplete(ch) {
    return ch.quests.every(qid => this._tracker.isCompleted(qid));
  }

  /** A chapter has STARTED when any carrier is done (the elastic middle —
   *  arcs surface wherever the kid actually plays), OR when the authored
   *  reading order reaches it: every earlier chapter walked AND its opener
   *  (the first listed carrier) is available. Availability alone only counts
   *  in reading order, so far-ahead available quests never inflate position. */
  chapterStarted(ch) {
    if (ch.quests.some(qid => this._tracker.isCompleted(qid))) return true;
    const i = this.indexOf(ch.id);
    if (i > 1 && !this.chapters.slice(0, i - 1).every(c => this.chapterComplete(c))) return false;
    const opener = this._tracker.def(ch.quests[0]);
    if (!opener) return false;
    return this._tracker.available().some(q => q.id === opener.id);
  }

  /** 1-based positions of every started chapter. */
  startedChapters() {
    const out = [];
    this.chapters.forEach((c, i) => { if (this.chapterStarted(c)) out.push(i + 1); });
    return out;
  }

  /** The player's chapter position: the earliest chapter on the authored
   *  path that isn't yet walked in full (reading order governs — the elastic
   *  middle can surface arcs early without dragging the position forward).
   *  Monotonic: completions never regress, so the walk only moves forward. */
  currentChapterIndex() {
    for (let i = 1; i <= this.chapters.length; i++) {
      const c = this.chapter(i);
      if (!c || !this.chapterComplete(c)) return i;
    }
    return this.chapters.length;
  }
  currentChapter() { return this.chapter(this.currentChapterIndex()); }

  /** Deepest band the story has soft-unlocked (monotonic per validateSpine). */
  unlockedBand() { return this.currentChapter()?.unlockBand ?? 0; }

  /** All pre-finale carriers done — the spine's own road to the Midnight
   *  Race, for kids who walk every chapter without finishing two arcs. */
  spineCompletePreFinale() {
    return this.chapters.slice(0, -1).every(c =>
      c.quests.every(qid => qid === 'finale-midnight-race' || this._tracker.isCompleted(qid)));
  }

  // ── ceremonies: once ever per chapter ─────────────────────────────────────

  /** Chapters whose content is reached but whose ceremony hasn't fired. */
  dueCeremonies() {
    return this.chapters.filter(c => this.chapterStarted(c) && !this.data.opened[c.id]);
  }
  markOpened(id) { this.data.opened[id] = new Date().toISOString(); this.save(); }

  /** Silently mark every started chapter as opened — returning players from
   *  before the spine (and migrated saves) don't get a wall of catch-up
   *  cards; ceremonies are for chapters reached LIVE. @returns count marked */
  markAllStartedAsOpened() {
    let n = 0;
    for (const c of this.dueCeremonies()) { this.data.opened[c.id] = 'migrated'; n++; }
    if (n) this.save();
    return n;
  }

  // ── chapter completion ceremonies: once ever per completed chapter ────────

  /** Chapters that are complete but whose completion ceremony hasn't fired. */
  dueCompletedCeremonies() {
    return this.chapters.filter(c => this.chapterComplete(c) && !this.data.completedCh[c.id]);
  }

  /** Mark a chapter's completion ceremony as shown (persisted — the card
   *  must never re-fire after a reload). Accepts the chapter id. */
  markCompleted(id) { this.data.completedCh[id] = new Date().toISOString(); this.save(); }

  /** Silently mark every completed chapter as ceremonied — returning players
   *  don't get a wall of catch-up completion cards. @returns count marked */
  markAllCompletedAsCeremonied() {
    let n = 0;
    for (const c of this.dueCompletedCeremonies()) { this.data.completedCh[c.id] = 'migrated'; n++; }
    if (n) this.save();
    return n;
  }

  // ── soft band nudges: once ever per band ──────────────────────────────────

  bandNudged(band) { return Boolean(this.data.bandNudged[band]); }
  markBandNudged(band) { this.data.bandNudged[band] = new Date().toISOString(); this.save(); }
}

// ── the Logbook's spine rail (pure — renderable + testable headless) ────────

/**
 * Chapter rows for the vertical rail: completed chapters filled, the current
 * one glowing, started-but-not-current chapters open (title shown, dim), and
 * future ones as silhouettes — title hidden, one teaser word.
 * @returns {{n:number, id:string, act:number, title:string, teaser:string,
 *            state:'done'|'current'|'open'|'future'}[]}
 */
export function spineRailRows(spineState) {
  const cur = spineState.currentChapterIndex();
  return spineState.chapters.map((c, i) => {
    const n = i + 1;
    const state = spineState.chapterComplete(c) ? 'done'
      : n === cur ? 'current'
      : spineState.chapterStarted(c) ? 'open'
      : 'future';
    return { n, id: c.id, act: c.act, title: c.title, teaser: c.teaser ?? '', state };
  });
}
