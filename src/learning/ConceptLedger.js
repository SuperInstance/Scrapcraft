/**
 * ───────────────────────────────────────────────────────────────────────────
 *  CONCEPT LEDGER  —  the mastery state machine (no tests, just truth)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Teaching that isn't measured disappears. The ledger records, per concept,
 * the highest rung the KID has actually demonstrated:
 *
 *   unseen ──▶ seen ──▶ practiced ──▶ taught
 *             (quest   (objective     (a teach-back moment answered
 *              surfaced  evidence:      correctly — teaching IS the test)
 *              in the    quest done or
 *              logbook)  program ran)
 *
 * MONOTONIC: rungs only rise, never regress — a bad afternoon can't un-teach
 * a kid. A wrong teach-back answer doesn't punish; it increments `attempts`
 * and starts a cooldown that only PRACTICE (two more program_ran events for
 * that concept) can clear — so the game re-offers the moment after the kid
 * has actually done the thing again, not on a timer.
 *
 * Injectable like Spine.js: storage (localStorage default, key
 * 'scrapcraft_concepts_v1') and a `now` clock. Corrupt saves are tolerated
 * cold-start-gate style — try/catch, fresh start, never a crash.
 *
 * Headless: no DOM, no game imports. Concepts + quest data only.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { CONCEPTS, QUEST_CONCEPTS } from './concepts.js';

const LEDGER_KEY = 'scrapcraft_concepts_v1';

const RANK = { unseen: 0, seen: 1, practiced: 2, taught: 3 };

/** TileProgram node type → concepts its use demonstrates. Auditable data. */
const NODE_CONCEPTS = {
  if:            ['conditionals'],
  if_else:       ['conditionals'],
  forever:       ['loops-forever'],
  repeat:        ['loops-counted'],
  repeat_until:  ['loops-until'],
  wait_until:    ['loops-until'],
  break:         ['loops-until'],
  set_var:       ['variables'],
  change_var:    ['variables'],
  math_var:      ['variables'],
  random_var:    ['variables'],
  read_sensor:   ['variables', 'sensors-overview'],   // reading IS sensing
  define_sub:    ['subroutines'],
  call_sub:      ['subroutines'],
};

const freshRecord = () => ({
  state: 'unseen', attempts: 0, seenCount: 0, runs: 0, runCredit: 0,
  firstSeenAt: null, taughtAt: null,
});

export class ConceptLedger {
  /**
   * @param {object} opts
   * @param {object|null} [opts.storage]  localStorage-shaped persistence
   * @param {() => number} [opts.now]     injectable clock (tests: deterministic)
   */
  constructor({ storage, now } = {}) {
    this._storage = storage !== undefined ? storage
      : (typeof localStorage !== 'undefined' ? localStorage : null);
    this._now = now ?? (() => Date.now());
    this.data = { v: 1, concepts: {} };
  }

  // ── persistence (cold-start-gate style — corrupt-tolerant) ────────────────

  save() {
    try { this._storage?.setItem(LEDGER_KEY, JSON.stringify(this.data)); } catch { /* corrupt-world tolerant */ }
  }

  load() {
    try {
      const raw = this._storage?.getItem(LEDGER_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d?.v !== 1 || typeof d.concepts !== 'object' || !d.concepts) return;
      const concepts = {};
      for (const c of CONCEPTS) {
        const r = d.concepts[c.id];
        if (!r || typeof r !== 'object') continue;
        const base = freshRecord();
        concepts[c.id] = {
          ...base,
          state: RANK[r.state] !== undefined && typeof r.state === 'string' ? r.state : base.state,
          attempts: Number.isFinite(r.attempts) ? r.attempts : 0,
          seenCount: Number.isFinite(r.seenCount) ? r.seenCount : 0,
          runs: Number.isFinite(r.runs) ? r.runs : 0,
          runCredit: Number.isFinite(r.runCredit) ? r.runCredit : 0,
          firstSeenAt: r.firstSeenAt ?? null,
          taughtAt: r.taughtAt ?? null,
        };
      }
      this.data = { v: 1, concepts };
    } catch { /* fresh start on corrupt saves */ }
  }

  // ── the state machine ─────────────────────────────────────────────────────

  _record(id) {
    if (!this.data.concepts[id]) this.data.concepts[id] = freshRecord();
    return this.data.concepts[id];
  }

  /** Rungs only rise. */
  _bump(rec, state) {
    if (RANK[state] > RANK[rec.state]) rec.state = state;
  }

  _stamp(id) { const rec = this._record(id); if (rec.firstSeenAt == null) rec.firstSeenAt = this._now(); }

  /**
   * The one intake. Events:
   *   {type:'quest_seen', questId}          teaching surfaced in the logbook → seen
   *   {type:'quest_done',  questId}         objective evidence → practiced
   *   {type:'program_ran', used:[ids]}      tile usage → practiced (+ cooldown credit)
   *   {type:'taught', conceptId, correct}   teach-back result (taught only on correct)
   */
  observe(event) {
    if (!event || typeof event !== 'object') return;

    if (event.type === 'quest_seen') {
      for (const id of QUEST_CONCEPTS[event.questId] ?? []) {
        const rec = this._record(id);
        this._stamp(id);
        rec.seenCount++;
        this._bump(rec, 'seen');
      }

    } else if (event.type === 'quest_done') {
      for (const id of QUEST_CONCEPTS[event.questId] ?? []) {
        const rec = this._record(id);
        this._stamp(id);
        this._bump(rec, 'practiced');
      }

    } else if (event.type === 'program_ran') {
      for (const id of (event.used ?? [])) {
        if (!(CONCEPTS.some(c => c.id === id))) continue;
        const rec = this._record(id);
        this._stamp(id);
        this._bump(rec, 'practiced');
        rec.runs++;
        rec.runCredit++;   // practice pays down a teach-back cooldown
      }

    } else if (event.type === 'taught') {
      const rec = this._record(event.conceptId);
      rec.attempts++;
      if (event.correct) {
        this._stamp(event.conceptId);
        this._bump(rec, 'taught');
        if (rec.taughtAt == null) rec.taughtAt = this._now();
      } else {
        rec.runCredit = 0;   // wrong answer → earn 2 more practice runs first
      }
    }

    this.save();
  }

  // ── reads ─────────────────────────────────────────────────────────────────

  /** @returns {{state:string, attempts:number, firstSeenAt:number|null, taughtAt:number|null}} */
  mastery(conceptId) {
    const rec = this.data.concepts[conceptId];
    if (!rec) return { state: 'unseen', attempts: 0, firstSeenAt: null, taughtAt: null };
    return {
      state: rec.state, attempts: rec.attempts,
      firstSeenAt: rec.firstSeenAt, taughtAt: rec.taughtAt,
    };
  }

  /**
   * Concepts eligible for a teach-back moment, in tier order:
   * practiced (and not cooling down after a wrong answer), or seen ≥2 times
   * with zero attempts (seen twice IS a soft practice signal).
   */
  teachableList() {
    const out = [];
    for (const c of CONCEPTS) {
      const rec = this.data.concepts[c.id];
      if (!rec) continue;
      if (rec.state === 'practiced' && !(rec.attempts > 0 && rec.runCredit < 2)) out.push(c.id);
      else if (rec.state === 'seen' && rec.seenCount >= 2 && rec.attempts === 0) out.push(c.id);
    }
    return out;
  }

  /** The single best concept to teach-back next (tier order), or null. */
  nextTeachable() { return this.teachableList()[0] ?? null; }

  /** Counts + per-concept states in tier order (the teacher dashboard row). */
  summary() {
    const counts = { unseen: 0, seen: 0, practiced: 0, taught: 0 };
    const concepts = CONCEPTS.map(c => {
      const state = this.data.concepts[c.id]?.state ?? 'unseen';
      counts[state]++;
      return { id: c.id, tier: c.tier, state };
    });
    return { ...counts, concepts };
  }

  // ── tile analysis (the program_ran caller's helper) ────────────────────────

  /**
   * Concepts a tile program actually uses, by node type (TileProgram or a
   * plain nodes array — the walk is the same tree).
   * @returns {string[]} concept ids in canonical ladder order
   */
  static conceptsInProgram(program) {
    const hits = new Set();
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      for (const id of NODE_CONCEPTS[node.type] ?? []) hits.add(id);
      if (Array.isArray(node.body)) node.body.forEach(visit);
      if (Array.isArray(node.elseBody)) node.elseBody.forEach(visit);
    };
    if (typeof program?.walk === 'function') program.walk(n => visit(n));
    else if (Array.isArray(program?.nodes)) program.nodes.forEach(visit);
    else if (Array.isArray(program)) program.forEach(visit);
    return CONCEPTS.filter(c => hits.has(c.id)).map(c => c.id);
  }
}
