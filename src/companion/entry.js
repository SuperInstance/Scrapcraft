/**
 * ───────────────────────────────────────────────────────────────────────────
 *  THE YARD GATE  —  entry points, per companion
 * ───────────────────────────────────────────────────────────────────────────
 *
 * New game: Earl asks two questions at the gate. The answers decide which
 * companion gets delivered — the tutorial voice, the primary nudge source,
 * the run's story identity. Free pick is always offered (the yard doesn't
 * fence choices; it just reads them).
 *
 *   Q1 "First day at a junkyard — what pulls your eye?"
 *   Q2 "Your bot's first job, you decide right now: what is it?"
 *
 * Each answer carries entryPoints (from personas.js) — a weighted vote.
 * Highest total wins; ties break toward Rivet (the yard's default hello).
 *
 * The decision logic is PURE (headless, testable). CompanionGate is the thin
 * DOM face — vanilla, disposable, game-wired.
 */

import { PERSONAS, getPersona } from './personas.js';

export const ENTRY_QUESTIONS = [
  {
    id: 'eye',
    q: 'Earl leans on the gate. "First day at a junkyard, rookie. What pulls your eye first?"',
    answers: [
      { id: 'engines', label: 'The engines. Anything with wheels and a past.' },
      { id: 'cranes',  label: 'The big machines. Cranes, presses, things that LIFT.' },
      { id: 'lights',  label: 'The far piles. Something glinted back there. Twice.' },
      { id: 'cat',     label: 'The cat. Obviously. Everything else can wait.' },
    ],
  },
  {
    id: 'job',
    q: 'He sips from the ancient mug. "Your bot\'s first job — you decide right now. What is it?"',
    answers: [
      { id: 'race',    label: 'Race. The oval\'s right there and it\'s calling.' },
      { id: 'build',   label: 'Build the best robot the yard\'s ever seen.' },
      { id: 'explore', label: 'Explore. The yard\'s huge and nobody\'s mapped it.' },
      { id: 'helper',  label: 'Whatever the yard needs. I just want to help out.' },
    ],
  },
];

export const FREE_PICK_LABEL = '…or pick your own co-worker';
export const GATE_TITLE = '🚪 THE YARD GATE';

/**
 * Pure scoring: two answer ids → companion id.
 * @param {string} answer1 Q1 answer id (or null = skip)
 * @param {string} answer2 Q2 answer id (or null = skip)
 * @returns {string} persona id
 */
export function recommendCompanion(answer1, answer2) {
  const scores = {};
  for (const id of Object.keys(PERSONAS)) scores[id] = 0;
  for (const a of [answer1, answer2]) {
    if (!a) continue;
    for (const [pid, persona] of Object.entries(PERSONAS)) {
      const pts = persona.entryPoints?.[a] ?? 0;
      scores[pid] += pts;
    }
  }
  // highest score; ties break toward rivet (then registry order)
  let best = 'rivet';
  for (const id of Object.keys(PERSONAS)) {
    if (scores[id] > scores[best]) best = id;
  }
  return best;
}

/** The delivery line the gate speaks when a companion is chosen. */
export function gateDeliveryLine(personaId) {
  const p = getPersona(personaId);
  const map = {
    rivet: `The crate by the gate rattles. A small drone hovers out, one teal eye bright. "Oh! You're new. I'm ${p.name} — same day as you, apparently."`,
    bolt: `Something low and fast detaches from the fence line. "Bolt," it says. "Ex-pit crew. Gate says you're new. I'd have guessed newer."`,
    magma: `The ground hums, gently. A huge red lifter settles beside you and folds down to eye height. "Hello, small builder. I am ${p.name}. I will hold the heavy things."`,
    juno: `A shimmer resolves into forty-one tiny fliers, spiraling once around you. "Hi hi HI! We're ${p.name}! All of us! One of us is shy — she says hi from the back."`,
  };
  return map[personaId] ?? map.rivet;
}

/**
 * CompanionGate — minimal DOM overlay for the two questions + pick.
 * Headless environments never construct it; Game wires it on new game.
 */
export class CompanionGate {
  /**
   * @param {object} opts
   * @param {HTMLElement} [opts.mount] container (default document.body)
   * @param {(personaId:string) => void} opts.onChosen callback once picked
   * @param {boolean} [opts.showAllOnPick] free-pick shows all four (default true)
   */
  constructor(opts = {}) {
    this._onChosen = opts.onChosen ?? (() => {});
    this._showAll = opts.showAllOnPick !== false;
    this._answers = [null, null];
    this._step = 0;
    this._el = null;
    const mount = opts.mount ?? (typeof document !== 'undefined' ? document.body : null);
    if (mount) this._build(mount);
  }

  _build(mount) {
    this._el = document.createElement('div');
    this._el.id = 'companion-gate';
    this._el.style.cssText =
      'position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(10,12,16,0.82);font-family:inherit;';
    mount.appendChild(this._el);
    this._render();
  }

  _render() {
    if (!this._el) return;
    if (this._step < ENTRY_QUESTIONS.length) {
      const q = ENTRY_QUESTIONS[this._step];
      this._el.innerHTML = `
        <div style="max-width:560px;padding:28px;background:#1a1f26;border:2px solid #d9843b;border-radius:14px;color:#eee">
          <div style="font-size:12px;letter-spacing:2px;color:#d9843b;margin-bottom:10px">${GATE_TITLE}</div>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5">${q.q}</p>
          ${q.answers.map(a => `<button data-a="${a.id}" style="display:block;width:100%;margin:6px 0;padding:10px 14px;text-align:left;background:#242b34;color:#eee;border:1px solid #3a4652;border-radius:8px;cursor:pointer;font-size:14px">${a.label}</button>`).join('')}
          <button data-a="__pick" style="display:block;width:100%;margin:10px 0 0;padding:8px 14px;text-align:left;background:none;color:#8a94a6;border:none;cursor:pointer;font-size:13px;font-style:italic">${FREE_PICK_LABEL}</button>
        </div>`;
      for (const btn of this._el.querySelectorAll('button[data-a]')) {
        btn.addEventListener('click', () => {
          const v = btn.dataset.a;
          if (v === '__pick') { this._step = ENTRY_QUESTIONS.length + 1; this._render(); return; }
          this._answers[this._step] = v;
          this._step++;
          this._render();
        });
      }
      return;
    }

    // free pick screen (step === len + 1) or recommended delivery
    if (this._step === ENTRY_QUESTIONS.length) {
      const rec = recommendCompanion(this._answers[0], this._answers[1]);
      this._chosen(rec, gateDeliveryLine(rec));
      return;
    }

    // free pick: all four
    this._el.innerHTML = `
      <div style="max-width:560px;padding:28px;background:#1a1f26;border:2px solid #d9843b;border-radius:14px;color:#eee">
        <div style="font-size:12px;letter-spacing:2px;color:#d9843b;margin-bottom:10px">${GATE_TITLE}</div>
        <p style="margin:0 0 16px;font-size:15px">Earl shrugs. "Fancy that. Pick your co-worker, then."</p>
        ${Object.values(PERSONAS).map(p =>
          `<button data-p="${p.id}" style="display:block;width:100%;margin:6px 0;padding:10px 14px;text-align:left;background:#242b34;color:#eee;border:1px solid #3a4652;border-radius:8px;cursor:pointer;font-size:14px">${p.emoji} <b>${p.name}</b> — <span style="color:#8a94a6">${p.subtitle}</span></button>`).join('')}
      </div>`;
    for (const btn of this._el.querySelectorAll('button[data-p]')) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.p;
        this._chosen(id, gateDeliveryLine(id));
      });
    }
  }

  _chosen(personaId, delivery) {
    this.close();
    this._onChosen(personaId, delivery);
  }

  close() { this._el?.remove(); this._el = null; }
}
