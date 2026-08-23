/**
 * ───────────────────────────────────────────────────────────────────────────
 *  THE LOGBOOK  —  the learning made visible (vessel-quest's soul, ported)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Vessel-quest's insight: the game was ALWAYS being played; the scoreboard
 * makes it visible. Applied here: a Scrapcraft player was always learning
 * embedded engineering — mining is materials science, lapping is closed-loop
 * control, flashing is bootloaders. The Logbook converts completed quests into
 * dated memory entries, one per lesson, written as the player would remember
 * it. It is the transcript for teachers: every entry is evidence of a concept
 * met, in the player's own voice, with the companion who walked them through.
 *
 * Sacred like a paper logbook: entries are append-only, never rewritten.
 * Headless: injectable storage, zero DOM.
 */

const LOGBOOK_KEY = 'scrapcraft_logbook';
const LOGBOOK_VERSION = 1;

export class Logbook {
  /**
   * @param {object} [opts]
   * @param {Storage|object|null} [opts.storage]
   */
  constructor(opts = {}) {
    this._storage = opts.storage !== undefined ? opts.storage
      : (typeof localStorage !== 'undefined' ? localStorage : null);
    this.data = { v: LOGBOOK_VERSION, entries: [] };
    this.load();
  }

  load() {
    try {
      const raw = this._storage?.getItem(LOGBOOK_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && d.v === LOGBOOK_VERSION && Array.isArray(d.entries)) this.data = d;
    } catch { /* a corrupted logbook is a tragedy, not a crash */ }
  }

  save() {
    try { this._storage?.setItem(LOGBOOK_KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }

  /**
   * Record a completed quest as a memory entry. Append-only.
   * @param {object} quest   the quest definition
   * @param {object} [meta]  { day: number, date: Date|string }
   * @returns {object} the entry
   */
  record(quest, meta = {}) {
    if (this.data.entries.some(e => e.questId === quest.id)) return null;   // once, ever
    const when = meta.date instanceof Date ? meta.date : new Date();
    const entry = {
      n: this.data.entries.length + 1,
      questId: quest.id,
      title: quest.title,
      arc: quest.arc,
      companion: quest.affinity,
      concept: quest.teaching?.concept ?? '',
      memory: quest.teaching?.memory ?? quest.title,
      kidPhrase: quest.teaching?.kidPhrase ?? '',
      day: meta.day ?? null,                       // yard day (daysPlayed)
      at: when.toISOString(),
      dateLabel: when.toLocaleDateString?.() ?? when.toISOString().slice(0, 10),
    };
    this.data.entries.push(entry);
    this.save();
    return entry;
  }

  /** Entries in completion order (the order the learning happened). */
  entries() { return [...this.data.entries]; }

  /** Newest first — the journal view. */
  recentFirst() { return [...this.data.entries].reverse(); }

  /** Grouped by arc — the campaign shape a teacher reads. */
  byArc() {
    const out = {};
    for (const e of this.data.entries) {
      (out[e.arc] ??= []).push(e);
    }
    return out;
  }

  /** Plain-text teacher transcript — concepts + dates, ready to paste. */
  transcript() {
    const lines = ['SCRAPCRAFT LOGBOOK — learning transcript', ''];
    for (const e of this.data.entries) {
      lines.push(`${e.n}. ${e.concept}  (${e.dateLabel}${e.day != null ? `, yard day ${e.day}` : ''})`);
      lines.push(`   "${e.memory}"`);
    }
    const concepts = new Set(this.data.entries.map(e => e.concept)).size;
    lines.push('');
    lines.push(`${this.data.entries.length} entries · ${concepts} distinct concepts met`);
    return lines.join('\n');
  }

  /** Distinct concepts met — the coverage number teachers actually want. */
  conceptCount() { return new Set(this.data.entries.map(e => e.concept)).size; }

  count() { return this.data.entries.length; }
}
