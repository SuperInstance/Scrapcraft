/**
 * Liveliness tests — the companion keeps up with the kid and starts things
 * on its own. Playtest fixes:
 *   1. Fast lane: big moments (rare loot, crash, race win) speak immediately
 *      — no reactive-debounce swallow, budget-exempt like tier-ups, and a
 *      fallback bank GUARANTEES a line when the banter bank draws null
 *   2. Variety guarantee: never the same reaction type twice in a row
 *      (observation after observation, question after question) — fast-lane
 *      big moments and tier-ups are the only exempt kinds
 *   3. Question spacing: first ~5 min in, ≥8 min apart, capped per session —
 *      the companion asks, but it never interrogates
 *   4. Notice beat: ONE gentle "you've been quiet" after ~2 min of real yard
 *      time without interaction — and it resets on any interaction
 *   5. Bank completeness: every persona has fallbacks + initiative banks
 *
 * Headless: injectable rng/now, zero DOM, no I/O.
 */

import { PERSONA_IDS, getPersona } from '../personas.js';
import { LineMemory, ChatterGuard, pickBanterFresh } from '../variety.js';
import { Companion } from '../Companion.js';
import {
  isBigMoment, BIG_MOMENT_EVENTS, BIG_MOMENT_FALLBACK,
  initiativeBankOf, pickInitiative, pickBigMomentFallback,
} from '../liveliness.js';

const lcg = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const mkStore = () => {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), _map: map };
};

const EMPTY_DATA = { counters: { blocksMined: 0, laps: 0, crashes: 0, repairs: 0, flashes: 0, ghostsBeaten: 0, conversations: 0, programsRun: 0, botsBuilt: 0, rareLoot: 0, races: 0, sparkAsks: 0, nudgesFollowed: 0 }, biomes: [] };
const strangerLike = { tier: 'stranger', topTrait: null, data: EMPTY_DATA };

export async function runLivelinessTests(ok) {
  // ══ 1. Fast lane: big moments speak now ══════════════════════════════════
  console.log('\nLiveliness · fast lane');
  {
    ok('big-moment set is exactly the three loudest events',
       BIG_MOMENT_EVENTS.length === 3 && isBigMoment('rare_loot') && isBigMoment('crash_survived') && isBigMoment('lap_complete'));
    ok('ordinary events are not big moments', !isBigMoment('block_mined') && !isBigMoment('bot_built'));

    const spoken = [];
    const c = new Companion({
      persona: 'rivet', storage: mkStore(), managed: true, rng: () => 0.01,
      speak: (text, meta) => spoken.push({ text, event: meta.event, type: meta.type }),
    });
    c.observe('rare_loot', { note: 'flux_coil' });
    ok('rare loot speaks on the observe call (zero latency)', spoken.length === 1, spoken.join(' | '));
    // a crash lands <5s later — inside the old debounce window
    c.observe('crash_survived', { note: 'speed 3' });
    ok('a crash inside the debounce window STILL speaks (fast lane)', spoken.length === 2, spoken.join(' | '));
    // and a race win right after that — three big moments, three reactions
    c.observe('lap_complete', { secs: '9.8' });
    ok('a race win back-to-back also speaks (fast lane, no line queue)',
       spoken.length === 3 && spoken[2].event === 'lap_complete', spoken.join(' | '));
    ok('fast-lane lines are typed reactive for the variety guard',
       spoken.every(s => s.type === 'reactive'));

    // non-big events still respect the reactive debounce (guarded change)
    const spoken2 = [];
    const c2 = new Companion({
      persona: 'rivet', storage: mkStore(), managed: true, rng: () => 0.01,
      speak: (text, meta) => spoken2.push({ text, event: meta.event }),
    });
    c2.observe('block_mined');
    c2.observe('bot_built');   // <5s later, not a big moment
    ok('ordinary events still respect the reactive debounce', spoken2.length === 1, spoken2.join(' | '));
    ok('debounced events still grow the relationship', c2.state.data.counters.botsBuilt === 1);

    // budget-exempt like tier-ups: exhaust the 10-min unsolicited budget,
    // and the fast lane still speaks
    const spoken3 = [];
    const c3 = new Companion({
      persona: 'bolt', storage: mkStore(), managed: true, rng: () => 0.01,
      speak: (text, meta) => spoken3.push({ text, event: meta.event }),
    });
    for (let i = 0; i < 6; i++) c3._chatter.commitUnsolicited();
    ok('setup: the unsolicited budget is exhausted', c3._chatter.canSpeakUnsolicited() === false);
    c3.observe('lap_complete', { secs: '10.0' });
    ok('fast lane is budget-exempt (speaks with the chatter budget spent)',
       spoken3.length === 1, spoken3.join(' | '));

    // min-gap exemption: even an enormous ChatterGuard quiet-gap can't hold
    // the fast lane — like tier-ups, big moments don't wait in the
    // unsolicited line
    const spoken6 = [];
    const strictGap = new ChatterGuard({ minGapS: 100000, windowS: 600, maxUnsolicited: 6, now: () => 1000 });
    strictGap.noteSpeech();   // someone just spoke — unsolicited chatter is locked
    ok('setup: the min gap is active', strictGap.canSpeakUnsolicited() === false);
    const c6 = new Companion({
      persona: 'rivet', storage: mkStore(), managed: true, rng: () => 0.01, chatter: strictGap,
      speak: (text, meta) => spoken6.push({ text, event: meta.event }),
    });
    c6.observe('rare_loot', { note: 'min_gap_test' });
    ok('fast lane is exempt from the ChatterGuard min gap (like tier-ups)',
       spoken6.length === 1, spoken6.join(' | '));

    // fallback guarantee: empty banter bank → the fallback bank still speaks
    const spoken4 = [];
    const c4 = new Companion({
      // a CLONE with an empty rare_loot bank — never mutate the shared persona
      persona: { ...getPersona('rivet'), banter: { rare_loot: [] } },
      storage: mkStore(), managed: true, rng: () => 0.99,
      speak: (text, meta) => spoken4.push({ text, event: meta.event }),
    });
    c4.observe('rare_loot', { note: 'test' });
    ok('a big moment still speaks when the banter bank draws null (fallback)',
       spoken4.length === 1 && typeof spoken4[0].text === 'string' && spoken4[0].text.length > 0,
       spoken4[0]?.text ?? '');
    ok('fallback lines are tier-legal for every persona',
       PERSONA_IDS.every(id => BIG_MOMENT_FALLBACK[id].every(l => l.tier >= 0 && l.tier <= 2 && typeof l.line === 'string' && l.line.length > 10)));
  }

  // ══ 2. Variety guarantee: never the same type twice in a row ═════════════
  console.log('\nLiveliness · reaction-type variety');
  {
    const c = new Companion({ persona: 'rivet', storage: mkStore(), managed: true, speak: () => {} });
    ok('variety: no last type yet → anything may speak', c._typeVarietyOk('observation') === true);
    c.say('a line', { type: 'observation' });
    ok('variety: the same type is blocked right after speaking it', c._typeVarietyOk('observation') === false);
    ok('variety: a different type is allowed', c._typeVarietyOk('question') === true);
    ok('variety: exempt kinds bypass the block (fast lane, tier-ups)', c._typeVarietyOk('observation', true) === true);
    ok('variety: say() tracks the kind from meta', c._lastType === 'observation');
    c.say('no meta', {});
    ok('variety: untagged lines count as their own kind', c._lastType === 'line' && c._typeVarietyOk('line') === false);

    // integration: two eligible observations in a row → the second is HELD
    const spoken = [];
    const c2 = new Companion({
      persona: 'rivet', storage: mkStore(), managed: true, rng: () => 0.99,
      speak: (text, meta) => spoken.push({ event: meta.event, type: meta.type }),
    });
    const ctx = { locked: true, moving: false, midFlow: false };
    c2._sinceObservation = 999;
    for (let i = 0; i < 40; i++) c2.update(1, ctx);
    ok('first idle observation speaks', spoken.filter(s => s.event === 'observation').length === 1, spoken.map(s => s.event).join(','));
    c2._sinceObservation = 999;
    for (let i = 0; i < 40; i++) c2.update(1, ctx);
    ok('a second consecutive observation is HELD (variety guarantee)',
       spoken.filter(s => s.event === 'observation').length === 1, spoken.map(s => s.event).join(','));
    // a different kind (a nudge) intervenes → observations may speak again
    c2.say('(a nudge)', { type: 'nudge' });
    c2._sinceObservation = 999;
    for (let i = 0; i < 40; i++) c2.update(1, ctx);
    ok('observations resume once a different type intervenes',
       spoken.filter(s => s.event === 'observation').length === 2, spoken.map(s => s.event).join(','));

    // a fast-lane big moment right after a reactive is still allowed (exempt)
    const spoken5 = [];
    const c5 = new Companion({
      persona: 'rivet', storage: mkStore(), managed: true, rng: () => 0.01,
      speak: (text, meta) => spoken5.push({ event: meta.event }),
    });
    c5.observe('flash_success');      // reactive (has a bank, not a big moment)
    c5.observe('lap_complete');       // reactive again, but big → exempt
    ok('fast-lane big moments are exempt from the variety guarantee',
       spoken5.length === 2 && spoken5[1].event === 'lap_complete', spoken5.map(s => s.event).join(','));
  }

  // ══ 3. Question spacing: first ~5 min, then ≥8 min apart, capped ═════════
  console.log('\nLiveliness · companion questions');
  {
    // loose cadence guard with a test-owned clock so only the SPACING rules
    // are under test (the chatter budget never interferes)
    let clock = 0;
    const loose = new ChatterGuard({ minGapS: 20, windowS: 600, maxUnsolicited: 1000, now: () => clock });
    const spoken = [];
    const c = new Companion({
      persona: 'juno', storage: mkStore(), managed: true, rng: () => 0.01, chatter: loose,
      speak: (text, meta) => spoken.push({ event: meta.event, text }),
    });
    const ctx = { locked: true, moving: true, midFlow: false };   // moving: no idle path, ambient only
    const count = () => spoken.filter(s => s.event === 'question').length;
    const tick = n => { for (let i = 0; i < n; i++) { clock += 1; c.update(1, ctx); } };

    tick(299);
    ok('no question before the ~5-min first window', count() === 0);
    tick(1);
    const t1 = clock;
    ok('first question fires at ~5 min', count() === 1, spoken.map(s => s.event).join(','));

    // spacing: nothing within 479s of the first
    tick(479);
    ok('no second question within the ≥8-min gap', count() === 1);
    let guard = 0;
    while (count() < 2 && guard++ < 120) tick(1);
    const t2 = clock;
    ok('second question fires once the gap elapses', count() === 2, `guard=${guard}`);
    ok('questions are spaced ≥8 min apart (480s+)', t2 - t1 >= 480, `gap=${t2 - t1}s`);

    guard = 0;
    while (count() < 3 && guard++ < 600) tick(1);
    const t3 = clock;
    ok('third question eventually fires', count() === 3, `guard=${guard}`);
    ok('third question also respected the ≥8-min gap', t3 - t2 >= 480, `gap=${t3 - t2}s`);

    tick(900);
    ok('session cap: never more than 3 questions', count() === 3);

    // the kind flips to a challenge when the roll says so
    const challBank = initiativeBankOf(getPersona('bolt'));
    const challenge = pickInitiative(challBank, 'challenges', strangerLike, () => 0);
    ok('challenge lines pick per persona', typeof challenge === 'string' && challenge.length > 0, challenge ?? '');
    const question = pickInitiative(challBank, 'questions', strangerLike, () => 0.5);
    ok('question lines pick per persona', typeof question === 'string' && question.length > 0, question ?? '');
    ok('missing bank → null (fail-soft)', pickInitiative(null, 'questions', strangerLike) === null && pickInitiative({}, 'questions', strangerLike) === null);
  }

  // ══ 4. Notice beat: one gentle "you've been quiet" ═══════════════════════
  console.log('\nLiveliness · noticing the kid');
  {
    const spoken = [];
    const c = new Companion({
      persona: 'magma', storage: mkStore(), managed: true, rng: () => 0.01,
      speak: (text, meta) => spoken.push({ event: meta.event, text }),
    });
    const ctx = { locked: true, moving: true, midFlow: false };
    const notices = () => spoken.filter(s => s.event === 'notice').length;

    for (let i = 0; i < 119; i++) c.update(1, ctx);
    ok('no notice inside the first 2 minutes', notices() === 0);
    c.update(1, ctx);
    ok('notice fires after ~2 min of quiet yard time', notices() === 1, spoken.map(s => s.event).join(','));
    ok('the notice is a gentle in-character line', spoken.find(s => s.event === 'notice')?.text?.length > 10);
    for (let i = 0; i < 300; i++) c.update(1, ctx);
    ok('the notice beat fires ONCE per session', notices() === 1);

    // interaction resets the clock: observe at 119s → no notice until 120s later
    const spoken2 = [];
    const c2 = new Companion({
      persona: 'rivet', storage: mkStore(), managed: true, rng: () => 0.01,
      speak: (text, meta) => spoken2.push({ event: meta.event }),
    });
    const notices2 = () => spoken2.filter(s => s.event === 'notice').length;
    for (let i = 0; i < 119; i++) c2.update(1, ctx);
    c2.observe('block_mined');                       // the kid IS interacting
    for (let i = 0; i < 119; i++) c2.update(1, ctx);
    ok('an interaction resets the 2-min notice clock', notices2() === 0, spoken2.map(s => s.event).join(','));
    c2.update(1, ctx);
    ok('notice arrives 2 min after the last interaction', notices2() === 1);

    // mid-flow (menu/editor) time doesn't count toward the notice
    const spoken3 = [];
    const c3 = new Companion({
      persona: 'bolt', storage: mkStore(), managed: true, rng: () => 0.01,
      speak: (text, meta) => spoken3.push({ event: meta.event }),
    });
    for (let i = 0; i < 300; i++) c3.update(1, { locked: true, moving: true, midFlow: true });
    ok('mid-flow time never triggers the notice', spoken3.filter(s => s.event === 'notice').length === 0);
  }

  // ══ 5. Bank completeness: every persona has a voice for all of it ════════
  console.log('\nLiveliness · bank completeness');
  {
    for (const id of PERSONA_IDS) {
      const p = getPersona(id);
      const bank = initiativeBankOf(p);
      ok(`${id}: initiative bank present`, bank !== null);
      ok(`${id}: ≥2 questions legal at stranger tier`,
         bank.questions.filter(l => (l.tier ?? 0) === 0).length >= 2);
      ok(`${id}: ≥1 challenge legal at stranger tier`,
         bank.challenges.filter(l => (l.tier ?? 0) === 0).length >= 1);
      ok(`${id}: ≥1 notice line`, Array.isArray(bank.notice) && bank.notice.length >= 1);
      ok(`${id}: every initiative line is a real string`,
         [...bank.questions, ...bank.challenges, ...bank.notice].every(l => typeof l.line === 'string' && l.line.length > 10));

      // the fast lane can always find a real line at stranger tier — the
      // bank never starves a big moment (fallback or not)
      for (const ev of BIG_MOMENT_EVENTS) {
        const bankKey = ev === 'crash_survived' ? 'crash' : ev;
        const line = pickBanterFresh(bankKey, strangerLike, () => 0.99, p.banter, new LineMemory(), { prefix: id });
        ok(`${id}: ${ev} has a stranger-tier banter line (fast lane never starves)`,
           typeof line === 'string' && line.length > 0, line ?? '');
      }
      const fb = pickBigMomentFallback(p, strangerLike, () => 0.99);
      ok(`${id}: fallback picker returns a real line`, typeof fb === 'string' && fb.length > 0, fb ?? '');
    }
  }
}
