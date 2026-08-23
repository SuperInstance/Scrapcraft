/**
 * LEARNING tests — the concept ladder engine: taxonomy derivation, the
 * mastery ledger's state machine, the teach-back engine's fail-soft flow,
 * and the broken-bot clinics (whose seeded bugs must FAIL verify and whose
 * hand-fixed programs must PASS — the physics is the answer key).
 * Headless: framework-free, no DOM.
 */

import { CONCEPTS, TIER_ORDER, QUEST_CONCEPTS, deriveConceptsFromTeaching, isConceptId } from '../concepts.js';
import { ConceptLedger } from '../ConceptLedger.js';
import { TeachBack } from '../TeachBack.js';
import content from '../data/teachback.json' with { type: 'json' };
import { BrokenBot, SCENARIOS, conceptsInScenario } from '../BrokenBot.js';
import { CAMPAIGN } from '../../quests/data/index.js';
import { TileProgram, T, compile } from '../../maker/index.js';

const mkStore = () => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
};
const mkClock = () => { let t = 1000; return () => (t += 100); };
const sorted = a => [...a].sort();
const has = (arr, x) => arr.includes(x);

export function runLearningTests(ok) {
  // ══ 1. concepts.js — taxonomy + quest derivation ══════════════════════════
  console.log('\nLearning · concepts');
  {
    // 3+6+3+5 = 17: the brief's "16" miscounts its own tier enumeration —
    // the ids are the contract, so every one of them must be here.
    ok('seventeen concepts (the fixed id contract), unique ids',
       CONCEPTS.length === 17 && new Set(CONCEPTS.map(c => c.id)).size === 17);
    ok('every tier is one of the four', CONCEPTS.every(c => TIER_ORDER.includes(c.tier)));
    ok('all four tiers are used', new Set(CONCEPTS.map(c => c.tier)).size === 4);
    ok('chapters respect tier ranges (SENSE≥4, THINK 4-6, ACT 3-5, ENGINEER≥7)',
       CONCEPTS.every(c =>
         (c.tier === 'SENSE' && c.chapter >= 4) ||
         (c.tier === 'THINK' && c.chapter >= 4 && c.chapter <= 6) ||
         (c.tier === 'ACT' && c.chapter >= 3 && c.chapter <= 5) ||
         (c.tier === 'ENGINEER' && c.chapter >= 7)));
    ok('every concept has kidPhrase + description',
       CONCEPTS.every(c => c.kidPhrase && c.description && c.name));

    // quest coverage over the REAL campaign data
    const withTeaching = CAMPAIGN.filter(q => q.teaching?.concept);
    const mapped = withTeaching.filter(q => (QUEST_CONCEPTS[q.id] ?? []).length > 0);
    const unmapped = withTeaching.filter(q => (QUEST_CONCEPTS[q.id] ?? []).length === 0).map(q => q.id);
    ok(`QUEST_CONCEPTS covers ≥80% of teaching quests (${mapped.length}/${withTeaching.length})`,
       withTeaching.length > 0 && mapped.length / withTeaching.length >= 0.8);
    // audit trail: which quests the ladder deliberately doesn't claim yet
    console.log(`  // unmapped quest ids (early salvage/crafting content): ${unmapped.join(', ') || '(none)'}`);

    ok('every mapped concept id is real',
       Object.values(QUEST_CONCEPTS).flat().every(isConceptId));
    ok('BrokenBot clinics are quest_done carriers in QUEST_CONCEPTS',
       has(QUEST_CONCEPTS['brokenbot-left-forever'] ?? [], 'debugging') &&
       has(QUEST_CONCEPTS['brokenbot-never-stops'] ?? [], 'loops-until') &&
       has(QUEST_CONCEPTS['brokenbot-wrong-sensor'] ?? [], 'sensors-overview'));

    // the keyword matcher, pinned
    const a = deriveConceptsFromTeaching('Line-following and sensor thresholds');
    ok('keywords: thresholds + sensors-overview from line-following',
       has(a, 'thresholds') && has(a, 'sensors-overview'));
    ok('keywords: PWM → actuation (exact)',
       sorted(deriveConceptsFromTeaching('PWM (pulse-width modulation)')).join() === 'actuation');
    ok('keywords: closed-loop feedback → feedback-loop',
       has(deriveConceptsFromTeaching('Closed-loop feedback — sensors guide action'), 'feedback-loop'));
    ok('keywords: unrelated text → empty', deriveConceptsFromTeaching('Nothing robotic at all').length === 0);
    ok('keywords: science "variable" false positive is real (overridden for juno-4)',
       has(deriveConceptsFromTeaching('Scientific method and controlled variable testing'), 'variables'));
    ok('override beats keyword: juno-4 maps to calibration, not variables',
       sorted(QUEST_CONCEPTS['juno-4']).join() === 'calibration');
  }

  // ══ 2. ConceptLedger — the mastery state machine ══════════════════════════
  console.log('\nLearning · ConceptLedger');
  {
    // full ladder walk: unseen → seen → practiced → taught (via earl-6 → conditionals)
    const lg = new ConceptLedger({ storage: mkStore(), now: mkClock() });
    ok('unknown concept reports unseen', lg.mastery('conditionals').state === 'unseen');
    lg.observe({ type: 'quest_seen', questId: 'earl-6' });
    ok('quest_seen → seen', lg.mastery('conditionals').state === 'seen');
    ok('firstSeenAt stamped', typeof lg.mastery('conditionals').firstSeenAt === 'number');
    lg.observe({ type: 'quest_done', questId: 'earl-6' });
    ok('quest_done → practiced', lg.mastery('conditionals').state === 'practiced');
    lg.observe({ type: 'taught', conceptId: 'conditionals', correct: true });
    const m = lg.mastery('conditionals');
    ok('taught correct → taught + taughtAt', m.state === 'taught' && typeof m.taughtAt === 'number');
    ok('the try counted as an attempt', m.attempts === 1);

    // monotonicity — nothing un-teaches
    lg.observe({ type: 'quest_seen', questId: 'earl-6' });
    lg.observe({ type: 'quest_done', questId: 'earl-6' });
    lg.observe({ type: 'program_ran', used: ['conditionals'] });
    lg.observe({ type: 'taught', conceptId: 'conditionals', correct: false });
    ok('taught never regresses (even a wrong re-answer)', lg.mastery('conditionals').state === 'taught');

    // wrong answer → stay practiced + practice-based cooldown
    const cool = new ConceptLedger({ storage: null, now: mkClock() });
    cool.observe({ type: 'program_ran', used: ['conditionals'] });
    ok('program_ran → practiced', cool.mastery('conditionals').state === 'practiced');
    ok('practiced concept is nextTeachable', cool.nextTeachable() === 'conditionals');
    cool.observe({ type: 'taught', conceptId: 'conditionals', correct: false });
    ok('wrong answer: stays practiced, attempts incremented',
       cool.mastery('conditionals').state === 'practiced' && cool.mastery('conditionals').attempts === 1);
    ok('cooldown starts: not re-offered', cool.nextTeachable() === null);
    cool.observe({ type: 'program_ran', used: ['conditionals'] });
    ok('one more practice run is not enough', cool.nextTeachable() === null);
    cool.observe({ type: 'program_ran', used: ['conditionals'] });
    ok('two more practice runs clear the cooldown', cool.nextTeachable() === 'conditionals');

    // seen ≥2 (attempts 0) is a soft practice signal. earl-7 lands feedback-loop
    // only; earl-9 lands feedback-loop + sensors-overview — so after both,
    // feedback-loop has been seen twice but sensors-overview just once.
    const soft = new ConceptLedger({ storage: null, now: mkClock() });
    soft.observe({ type: 'quest_seen', questId: 'earl-7' });
    ok('one sighting is not teachable yet', soft.nextTeachable() === null);
    soft.observe({ type: 'quest_seen', questId: 'earl-9' });
    const teachable = soft.teachableList();
    ok('seen twice → teachable; once (sensors-overview) stays out',
       teachable.length === 1 && teachable[0] === 'feedback-loop' &&
       soft.nextTeachable() === 'feedback-loop');

    // program_ran usage analysis — conceptsInProgram
    const prog = new TileProgram({ nodes: [
      T.setVar('laps', 0),
      T.repeat(4, [
        T.ifElse(T.cond('distance_ahead', 'lt', 0.3),
          [T.action('turn', { dir: 'right', speed: 0.6 })],
          [T.action('drive', { dir: 'forward', speed: 0.6 })]),
        T.changeVar('laps', 1),
      ]),
    ]});
    ok('conceptsInProgram: if_else + repeat + set/change_var → exact set',
       sorted(ConceptLedger.conceptsInProgram(prog)).join() === 'conditionals,loops-counted,variables');
    ok('conceptsInProgram: read_sensor → variables AND sensors-overview',
       sorted(ConceptLedger.conceptsInProgram(new TileProgram({ nodes: [T.readSensor('d', 'distance_ahead')] }))).join()
         === 'sensors-overview,variables');
    ok('conceptsInProgram: plain nodes array also walks',
       sorted(ConceptLedger.conceptsInProgram([T.forever([T.break()])])).join() === 'loops-forever,loops-until');

    // summary counts (teacher dashboard row)
    const sum = cool.summary();
    ok('summary counts partition all 17 in tier order',
       sum.unseen + sum.seen + sum.practiced + sum.taught === 17 &&
       sum.practiced === 1 && sum.concepts.length === 17 &&
       sum.concepts[0].id === 'sensors-overview' && sum.concepts[0].tier === 'SENSE');

    // save/load round-trip
    const store = mkStore();
    const a = new ConceptLedger({ storage: store, now: mkClock() });
    a.observe({ type: 'quest_done', questId: 'earl-6' });
    a.observe({ type: 'taught', conceptId: 'conditionals', correct: true });
    const b = new ConceptLedger({ storage: store, now: mkClock() });
    b.load();
    ok('save/load round-trip keeps the rung + timestamps',
       b.mastery('conditionals').state === 'taught' &&
       b.mastery('conditionals').taughtAt === a.mastery('conditionals').taughtAt);

    // corrupt storage tolerated — fresh start, no throw
    const bad = mkStore();
    bad.setItem('scrapcraft_concepts_v1', '{this is not json');
    const c = new ConceptLedger({ storage: bad, now: mkClock() });
    c.load();
    ok('corrupt save → fresh ledger (17 unseen)', c.summary().unseen === 17);
    const junk = mkStore();
    junk.setItem('scrapcraft_concepts_v1', JSON.stringify({ v: 1, concepts: { 'conditionals': { state: 'weird' } } }));
    const d = new ConceptLedger({ storage: junk, now: mkClock() });
    d.load();
    ok('corrupt record fields sanitized to defaults', d.mastery('conditionals').state === 'unseen');
  }

  // ══ 3. TeachBack — invisible assessment ═══════════════════════════════════
  console.log('\nLearning · TeachBack');
  {
    ok('content ships one correct + two misconception-tagged wrongs per question',
       content.questions.length >= 3 && content.questions.every(q =>
         q.options.filter(o => o.correct).length === 1 &&
         q.options.filter(o => !o.correct).every(o => typeof o.misconception === 'string')));

    // nothing teachable → no moment, badge 0
    const fresh = new TeachBack({ ledger: new ConceptLedger({ storage: null, now: mkClock() }), content, rng: () => 0.5 });
    ok('nothing teachable → nextMoment null', fresh.nextMoment() === null);
    ok('badge count 0 when nothing teachable', fresh.available() === 0);

    // correct answer → taught
    {
      const lg = new ConceptLedger({ storage: null, now: mkClock() });
      const tb = new TeachBack({ ledger: lg, content, rng: () => 0.5 });
      lg.observe({ type: 'program_ran', used: ['conditionals'] });
      ok('badge counts teachable concepts with content', tb.available() === 1);
      const moment = tb.nextMoment();
      ok('moment targets the practiced concept', moment.question.conceptId === 'conditionals');
      ok('question carries a naive question + persona asker',
         typeof moment.question.naiveQuestion === 'string' && typeof moment.question.asker === 'string');
      ok('options shuffled but still exactly one correct', moment.options.length === 3 &&
         moment.options.filter(o => o.correct).length === 1);
      const correctIdx = moment.options.findIndex(o => o.correct);
      const res = tb.answer(moment.question.id, correctIdx);
      ok('answering the tracked correct index → taughtLine + ledger taught',
         res.correct === true && typeof res.taughtLine === 'string' && res.ledgerUpdated === true &&
         lg.mastery('conditionals').state === 'taught');
    }

    // asker rotation across moments
    {
      const lg = new ConceptLedger({ storage: null, now: mkClock() });
      const tb = new TeachBack({ ledger: lg, content, rng: () => 0.5 });
      lg.observe({ type: 'program_ran', used: ['conditionals', 'loops-until'] });
      const m1 = tb.nextMoment();
      const m2 = tb.nextMoment();
      ok('asker rotates between moments', m1.question.asker !== m2.question.asker);
    }

    // wrong answer → retryLine + stays practiced + cooldown respected
    {
      const lg = new ConceptLedger({ storage: null, now: mkClock() });
      const tb = new TeachBack({ ledger: lg, content, rng: () => 0.5 });
      lg.observe({ type: 'program_ran', used: ['conditionals'] });
      const moment = tb.nextMoment();
      const wrongIdx = moment.options.findIndex(o => !o.correct);
      const res = tb.answer(moment.question.id, wrongIdx);
      ok('wrong answer → retryLine + the misconception revealed',
         res.correct === false && typeof res.retryLine === 'string' && typeof res.misconception === 'string');
      ok('wrong answer keeps the concept practiced', lg.mastery('conditionals').state === 'practiced');
      ok('cooldown: moment not re-offered, badge 0', tb.nextMoment() === null && tb.available() === 0);
      lg.observe({ type: 'program_ran', used: ['conditionals'] });
      ok('cooldown holds after one practice run', tb.nextMoment() === null);
      lg.observe({ type: 'program_ran', used: ['conditionals'] });
      ok('two practice runs re-arm the moment', tb.nextMoment() !== null && tb.available() === 1);
    }
  }

  // ══ 4. BrokenBot — debugging as play ══════════════════════════════════════
  console.log('\nLearning · BrokenBot');
  {
    const bot = new BrokenBot();

    ok('three clinics with unique ids',
       SCENARIOS.length === 3 && new Set(SCENARIOS.map(s => s.id)).size === 3);
    ok('scenario shape: symptom, earlLine, 3 hypotheses (1 right), 2 hints, patch, verify',
       SCENARIOS.every(s => s.symptom && s.earlLine && s.hintLadder.length === 2 &&
         s.fix.expectedNodePatch && typeof s.verify === 'function' &&
         s.hypotheses.length === 3 && s.hypotheses.filter(h => h.correct).length === 1));
    ok('every broken program is a real, compilable TileProgram',
       SCENARIOS.every(s => compile(s.brokenProgram).ok));

    // hand-fixed programs (built here like a kid would build them)
    const fixedPrograms = {
      'left-forever': new TileProgram({ name: 'Fixed Wall Avoider', brain: 'tin', nodes: [
        T.forever([
          T.ifElse(
            T.cond('distance_ahead', 'lt', 0.3),
            [T.action('turn', { dir: 'left', speed: 0.6 }), T.wait(0.4)],
            [T.action('drive', { dir: 'forward', speed: 0.6 })],
          ),
        ]),
      ]}),
      'never-stops': new TileProgram({ name: 'Fixed Wall Parker', brain: 'tin', nodes: [
        T.forever([
          T.action('drive', { dir: 'forward', speed: 0.6 }),
          T.if(T.cond('distance_ahead', 'lt', 0.25), [T.break()]),
        ]),
        T.action('stop'),
      ]}),
      'wrong-sensor': new TileProgram({ name: 'Fixed Light Runner', brain: 'spark', nodes: [
        T.forever([
          T.ifElse(
            T.cond('brightness', 'gt', 0.6),
            [T.action('led', { state: 'red' }), T.action('drive', { dir: 'forward', speed: 1 })],
            [T.action('led', { state: 'blue' }), T.action('drive', { dir: 'forward', speed: 0.3 })],
          ),
        ]),
      ]}),
    };

    for (const sc of SCENARIOS) {
      const broken = bot.attemptFix(sc.id, sc.brokenProgram);
      ok(`[${sc.id}] seeded bug is REAL — broken program fails verify`,
         broken.fixed === false && broken.verifyDetail.length > 0, broken.verifyDetail);
      const right = sc.hypotheses.findIndex(h => h.correct);
      const wrong = sc.hypotheses.findIndex(h => !h.correct);
      const nudged = bot.diagnose(sc.id, wrong);
      const nodded = bot.diagnose(sc.id, right);
      ok(`[${sc.id}] wrong-then-right diagnosis flow`,
         !nudged.correct && typeof nudged.earlNudge === 'string' &&
         nodded.correct && typeof nodded.earlNod === 'string');
      const fixed = bot.attemptFix(sc.id, fixedPrograms[sc.id]);
      ok(`[${sc.id}] hand-fixed program PASSES verify`, fixed.fixed === true, fixed.verifyDetail);
      ok(`[${sc.id}] concepts: debugging + the bug's concept`,
         conceptsInScenario[sc.id][0] === 'debugging' && conceptsInScenario[sc.id].length === 2);
    }

    ok('diagnose with a bogus index fails soft',
       bot.diagnose('left-forever', 99).correct === false);
    ok('unknown scenario attempts fail soft',
       bot.attemptFix('no-such', fixedPrograms['left-forever']).fixed === false);

    // clinic completion feeds the ledger
    const lg = new ConceptLedger({ storage: null, now: mkClock() });
    const events = bot.ledgerEvent('left-forever');
    ok('ledgerEvent: program_ran + quest_done carrier',
       events.length === 2 && events[0].type === 'program_ran' && events[1].type === 'quest_done');
    for (const ev of events) lg.observe(ev);
    ok('observing clinic events practices debugging + conditionals',
       lg.mastery('debugging').state === 'practiced' && lg.mastery('conditionals').state === 'practiced');
  }
}
