/**
 * Nudge engine tests — the anti-nag coaching contract, proven deterministically.
 *
 * The load-bearing behaviour of the nudge subsystem is TIMING: grace at session
 * start, a global cooldown between nudges, and a crash-suppression window. All of
 * it is driven by `tick(dt, ctx)` with a caller-supplied dt, so every rule is
 * exercised with controlled clock advances (no wall-clock, no timers) and an
 * injected rng — fully deterministic.
 *
 * Headless: no DOM, no localStorage. The Nudger/PartyNudger only touch
 * `state.data` and `state.isNudgeDone(id)`, so a tiny in-memory stub stands in
 * for CompanionState and keeps the counters/flags under direct test control.
 */

import {
  NUDGE_COOLDOWN_S, NUDGE_GRACE_S, CRASH_SUPPRESS_S,
  TOPICS, resolveHint, defaultWeight,
  Nudger, PartyNudger,
} from '../nudge.js';

/** Minimal CompanionState-like stub: live-readable data + isNudgeDone. */
function mkState(overrides = {}) {
  const nudgesDone = overrides.nudgesDone ? [...overrides.nudgesDone] : [];
  const data = {
    counters: {
      blocksMined: 0, rareLoot: 0, botsBuilt: 0, programsRun: 0,
      laps: 0, races: 0, crashes: 0, flashes: 0, conversations: 0,
      repairs: 0, nudgesFollowed: 0, ghostsBeaten: 0, sparkAsks: 0,
      ...(overrides.counters || {}),
    },
    biomes: overrides.biomes ? [...overrides.biomes] : [],
    nudgesDone,
  };
  return {
    data,
    isNudgeDone: id => nudgesDone.includes(id),
    markNudgeDone: id => { if (!nudgesDone.includes(id)) nudgesDone.push(id); },
  };
}

/** A state where NO topic is eligible — lets us isolate a single gate. */
function noneEligibleState() {
  return mkState({
    counters: { blocksMined: 1, sparkAsks: 1 },
    biomes: ['Circuit City', 'The Deep Yard'],
  });
}

/** Deterministic rng cycling through a fixed sequence. */
const seqRng = arr => { let i = 0; return () => arr[i++ % arr.length]; };
/** Mid-of-range rng: score = weight * (0.8 + 0.5*0.4) = weight * 1.0. */
const midRng = () => 0.5;

export function runNudgeTests(ok, fail) {
  const check = (name, cond, extra = '') => (cond ? ok(name) : fail(name, extra));

  // ── constants + registry shape ───────────────────────────────────────────
  check('NUDGE_COOLDOWN_S is 120', NUDGE_COOLDOWN_S === 120, `got ${NUDGE_COOLDOWN_S}`);
  check('NUDGE_GRACE_S is 45', NUDGE_GRACE_S === 45, `got ${NUDGE_GRACE_S}`);
  check('CRASH_SUPPRESS_S is 20', CRASH_SUPPRESS_S === 20, `got ${CRASH_SUPPRESS_S}`);
  check('TOPICS is a non-empty array', Array.isArray(TOPICS) && TOPICS.length > 0);
  check('every topic has id/label/depends/hint',
    TOPICS.every(t => t.id && t.label && Array.isArray(t.depends) && typeof t.hint === 'function'));
  check('topic ids are unique', new Set(TOPICS.map(t => t.id)).size === TOPICS.length);

  // ── defaultWeight / weightOf ─────────────────────────────────────────────
  check('defaultWeight = total - index', defaultWeight({}, 3, 12) === 9,
    `got ${defaultWeight({}, 3, 12)}`);
  check('defaultWeight: earlier topic is heavier',
    defaultWeight(TOPICS[0], 0, TOPICS.length) > defaultWeight(TOPICS[1], 1, TOPICS.length));
  {
    const nDefault = new Nudger({ state: mkState(), rng: midRng });
    check('weightOf falls back to defaultWeight without overrides',
      nDefault.weightOf(TOPICS[1], 1, TOPICS.length) === defaultWeight(TOPICS[1], 1, TOPICS.length));
    const nWeighted = new Nudger({ state: mkState(), weights: { mine_iron: 999 }, rng: midRng });
    check('weightOf honours a persona weight override',
      nWeighted.weightOf(TOPICS[0], 0, TOPICS.length) === 999);
    check('weightOf falls back per-topic when only some are overridden',
      nWeighted.weightOf(TOPICS[1], 1, TOPICS.length) === defaultWeight(TOPICS[1], 1, TOPICS.length));
  }

  // ── resolveHint ──────────────────────────────────────────────────────────
  {
    const t = TOPICS[0]; // mine_iron
    const shared = resolveHint(t, mkState().data, 'rivet');
    check('resolveHint returns a non-empty string for a valid topic',
      typeof shared === 'string' && shared.length > 0);
    check('resolveHint uses the persona voice when present',
      resolveHint(t, mkState().data, 'bolt') !== shared);
    check('resolveHint falls back to the shared voice for an unknown persona',
      resolveHint(t, mkState().data, 'nobody') === shared);
    check('resolveHint returns null when prerequisites are unmet',
      resolveHint(t, mkState({ counters: { blocksMined: 3 } }).data, 'rivet') === null);
  }

  // ── candidates(): eligibility, dependency-gating, done-exclusion ──────────
  {
    const cands = new Nudger({ state: mkState(), rng: midRng }).candidates();
    const ids = cands.map(c => c.topic.id);
    check('fresh state surfaces mine_iron as a candidate', ids.includes('mine_iron'));
    check('candidates carry a non-empty line',
      cands.every(c => typeof c.line === 'string' && c.line.length > 0));
    check('candidates carry numeric weight and score',
      cands.every(c => typeof c.weight === 'number' && typeof c.score === 'number'));
    check('dependency-gated topic is excluded until its prereq is done',
      !ids.includes('build_first_bot'));

    // mine_iron done + enough scrap → build_first_bot becomes eligible.
    const st2 = mkState({ counters: { blocksMined: 5 }, nudgesDone: ['mine_iron'] });
    const ids2 = new Nudger({ state: st2, rng: midRng }).candidates().map(c => c.topic.id);
    check('a done topic is excluded from candidates', !ids2.includes('mine_iron'));
    check('topic with satisfied deps + counters becomes a candidate',
      ids2.includes('build_first_bot'));
  }

  // ── fire() / fired(): one nudge per topic per session ────────────────────
  {
    const n = new Nudger({ state: mkState(), rng: midRng });
    check('fired() is empty on a fresh nudger', n.fired().length === 0);
    const cand = n.candidates().find(c => c.topic.id === 'mine_iron');
    const res = n.fire(cand);
    check('fire() returns the fired topic id and line',
      res && res.topic === 'mine_iron' && res.line === cand.line, JSON.stringify(res));
    check('fired() records the fired topic', n.fired().includes('mine_iron'));
    check('a fired topic is not offered as a candidate again',
      !n.candidates().some(c => c.topic.id === 'mine_iron'));
    check('fire(null) is a no-op returning null', n.fire(null) === null);
  }

  // ── GRACE: no nudge within the first NUDGE_GRACE_S ───────────────────────
  {
    const n = new Nudger({ state: mkState(), rng: midRng });
    let firedInGrace = false;
    for (let t = 0; t < NUDGE_GRACE_S - 5; t += 5) { if (n.tick(5)) firedInGrace = true; }
    check('no nudge fires within the grace window', !firedInGrace);
    const first = n.tick(10); // crosses NUDGE_GRACE_S
    check('a nudge fires once the grace window elapses',
      first && first.topic === 'mine_iron', JSON.stringify(first));
    check('fired nudge exposes a line string',
      first && typeof first.line === 'string' && first.line.length > 0);
  }

  // ── COOLDOWN: no second nudge until NUDGE_COOLDOWN_S has elapsed ──────────
  {
    const n = new Nudger({ state: mkState(), rng: midRng });
    const first = n.tick(NUDGE_GRACE_S + 1); // fires mine_iron
    check('cooldown scenario fires an initial nudge',
      first && first.topic === 'mine_iron', JSON.stringify(first));
    let firedInCooldown = false;
    for (let t = 0; t < NUDGE_COOLDOWN_S - 20; t += 20) { if (n.tick(20)) firedInCooldown = true; }
    check('no second nudge fires during the cooldown', !firedInCooldown);
    const second = n.tick(40); // crosses cooldown
    check('a second nudge fires after the cooldown elapses', !!second, JSON.stringify(second));
    check('the second nudge is a different topic (no immediate repeat)',
      second && second.topic !== 'mine_iron', JSON.stringify(second));
  }

  // ── CRASH SUPPRESSION: no nudge for CRASH_SUPPRESS_S after noteCrash() ────
  {
    // Start with nothing eligible so grace/cooldown don't consume a fire,
    // then crash, then make a topic eligible — only the crash gate remains.
    const st = noneEligibleState();
    const n = new Nudger({ state: st, rng: midRng });
    check('no nudge when nothing is eligible', n.tick(NUDGE_GRACE_S + 5) === null);
    n.noteCrash();
    st.data.counters.blocksMined = 0; // mine_iron now eligible
    let firedInCrash = false;
    for (let t = 0; t < CRASH_SUPPRESS_S - 5; t += 5) { if (n.tick(5)) firedInCrash = true; }
    check('no nudge fires within the crash-suppress window', !firedInCrash);
    const after = n.tick(10); // crosses CRASH_SUPPRESS_S
    check('a nudge fires once crash suppression lifts',
      after && after.topic === 'mine_iron', JSON.stringify(after));
  }

  // ── MID-FLOW: racing/editor/talking suppresses, clock still advances ─────
  {
    const n = new Nudger({ state: mkState(), rng: midRng });
    check('mid-flow suppresses nudging even past grace',
      n.tick(NUDGE_GRACE_S + 15, { midFlow: true }) === null);
    const after = n.tick(1, { midFlow: false });
    check('nudging resumes on the first out-of-flow tick',
      after && after.topic === 'mine_iron', JSON.stringify(after));
  }

  // ── PartyNudger: shared clock, grace, cooldown ───────────────────────────
  {
    const party = new PartyNudger({
      members: [
        { id: 'rivet', nudger: new Nudger({ state: mkState(), rng: midRng }) },
        { id: 'bolt', nudger: new Nudger({ state: mkState(), personaId: 'bolt', rng: midRng }) },
      ],
      rng: midRng, // 0.5 >= 0.3 → no objection, deterministic
    });
    check('party: no nudge within the grace window', party.tick(NUDGE_GRACE_S - 5) === null);
    const spoke = party.tick(10);
    check('party: a member speaks after grace',
      spoke && typeof spoke.id === 'string' && typeof spoke.topic === 'string'
        && typeof spoke.line === 'string', JSON.stringify(spoke));
    check('party: no objection when rng is at/above threshold', spoke && spoke.objection === null);
    let firedInCooldown = false;
    for (let t = 0; t < NUDGE_COOLDOWN_S - 20; t += 20) { if (party.tick(20)) firedInCooldown = true; }
    check('party: cooldown blocks a second nudge', !firedInCooldown);
  }

  // ── PartyNudger: the runner-up occasionally objects (rng < 0.3) ──────────
  {
    const party = new PartyNudger({
      members: [
        { id: 'rivet', nudger: new Nudger({ state: mkState(), rng: midRng }) },
        { id: 'bolt', nudger: new Nudger({ state: mkState(), personaId: 'bolt', rng: midRng }) },
      ],
      rng: seqRng([0.1, 0.0]), // < 0.3 → objection; index 0
    });
    const res = party.tick(NUDGE_GRACE_S + 1);
    check('party: winner is well-formed', res && res.id && res.topic && res.line, JSON.stringify(res));
    check('party: a runner-up objects when rng is below 0.3',
      res && res.objection && typeof res.objection.line === 'string', JSON.stringify(res && res.objection));
    check('party: the objection is a different member than the winner',
      res && res.objection && res.objection.id !== res.id);
    check('party: the objection is a different topic than the winner',
      res && res.objection && res.objection.topic !== res.topic);
  }

  // ── PartyNudger: crash suppression + mid-flow ────────────────────────────
  {
    const st = noneEligibleState();
    const party = new PartyNudger({
      members: [{ id: 'rivet', nudger: new Nudger({ state: st, rng: midRng }) }],
      rng: midRng,
    });
    check('party: mid-flow suppresses nudging',
      party.tick(NUDGE_GRACE_S + 5, { midFlow: true }) === null);
    check('party: nothing eligible → no nudge', party.tick(1) === null);
    party.noteCrash();
    st.data.counters.blocksMined = 0; // mine_iron now eligible
    let firedInCrash = false;
    for (let t = 0; t < CRASH_SUPPRESS_S - 5; t += 5) { if (party.tick(5)) firedInCrash = true; }
    check('party: crash suppresses nudging', !firedInCrash);
    const after = party.tick(10);
    check('party: nudging resumes after the crash window',
      after && after.topic === 'mine_iron', JSON.stringify(after));
  }
}
