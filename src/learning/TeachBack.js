/**
 * ───────────────────────────────────────────────────────────────────────────
 *  TEACH-BACK  —  the invisible assessment engine
 * ───────────────────────────────────────────────────────────────────────────
 *
 * A quiz asks "do you know it?" A teach-back asks "can you TEACH it?" — the
 * highest rung of learning, and the one that never feels like a test.
 *
 * Mechanics: when the ConceptLedger says a concept is ready (practiced, or
 * seen enough times), a companion persona asks a NAIVE question about it
 * ("wait, which mouth of the if eats the true answer?"). The kid answers as
 * the teacher. Correct → the ledger records `taught` (teaching IS the test).
 * Wrong → fail-soft: a retryLine that gently corrects the misconception the
 * wrong option reveals, no penalty, and the concept cools down until the kid
 * banks two more practice runs of it (attempts-based, not timer-based —
 * re-offer follows re-DOING, not the clock).
 *
 * Content lives in data/teachback.json (schema pinned in
 * docs/briefs/BRIEF-SYSTEMS.md); rng + content are injectable for tests.
 *
 * Headless: no DOM, no game imports.
 * ───────────────────────────────────────────────────────────────────────────
 */

import contentDefaults from './data/teachback.json' with { type: 'json' };
import { ConceptLedger } from './ConceptLedger.js';

/** Persona rotation — everyone in the yard gets a turn being the student. */
const ASKERS = ['rivet', 'bolt', 'juno', 'magma', 'spark'];

function shuffle(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class TeachBack {
  /**
   * @param {object} opts
   * @param {ConceptLedger} opts.ledger  the shared mastery state
   * @param {object} [opts.content]      teachback.json-shaped content
   * @param {() => number} [opts.rng]    injectable randomness (option shuffle)
   */
  constructor({ ledger, content, rng } = {}) {
    this._ledger = ledger ?? new ConceptLedger();
    this._content = content ?? contentDefaults;
    this._rng = rng ?? Math.random;
    this._askerIdx = 0;
    this._asked = 0;
    /** questionId → the shuffled options AS PRESENTED (correctness travels with them). */
    this._presented = new Map();
  }

  get questions() { return this._content?.questions ?? []; }

  /**
   * The next teachable moment: the first ledger-teachable concept (tier
   * order) that has authored questions. Returns the question (with a
   * rotated asker) plus options shuffled — correctness rides along, so
   * answer() always grades against the exact order the kid saw.
   * Null when nothing is teachable.
   */
  nextMoment() {
    const withContent = new Set(this.questions.map(q => q.conceptId));
    const conceptId = this._ledger.teachableList().find(id => withContent.has(id));
    if (!conceptId) return null;

    const pool = this.questions.filter(q => q.conceptId === conceptId);
    const q = pool[this._asked % pool.length];
    this._asked++;

    const asker = ASKERS[this._askerIdx % ASKERS.length];
    this._askerIdx++;

    const options = shuffle(q.options, this._rng);   // correctness travels with the copies
    this._presented.set(q.id, options);

    return {
      question: { id: q.id, conceptId: q.conceptId, asker, naiveQuestion: q.naiveQuestion },
      options,
    };
  }

  /**
   * Grade one answer against the options as they were presented.
   * @returns {{correct:boolean, taughtLine?:string, retryLine?:string,
   *            misconception?:string|null, ledgerUpdated:boolean}}
   */
  answer(questionId, optionIdx) {
    const q = this.questions.find(x => x.id === questionId);
    if (!q) return { correct: false, retryLine: '', ledgerUpdated: false };
    const options = this._presented.get(questionId) ?? q.options;
    const opt = options[optionIdx];
    if (!opt) return { correct: false, retryLine: '', ledgerUpdated: false };

    if (opt.correct) {
      this._ledger.observe({ type: 'taught', conceptId: q.conceptId, correct: true });
      return { correct: true, taughtLine: q.taughtLine, ledgerUpdated: true };
    }

    // Fail-soft: gently correct the misconception the wrong option reveals;
    // the ledger starts the practice-based cooldown.
    this._ledger.observe({ type: 'taught', conceptId: q.conceptId, correct: false });
    return {
      correct: false,
      retryLine: q.retryLine,
      misconception: opt.misconception ?? null,
      ledgerUpdated: true,
    };
  }

  /** How many concepts could be taught-back right now — for UI badges. */
  available() {
    const withContent = new Set(this.questions.map(q => q.conceptId));
    return this._ledger.teachableList().filter(id => withContent.has(id)).length;
  }
}
