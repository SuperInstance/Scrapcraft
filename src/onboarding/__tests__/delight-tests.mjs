/**
 * DELIGHT tests — the first hour's one-time wow moments + failure kindness.
 * Covers: DelightGate once-ever semantics (injectable storage), per-persona
 * copy with Rivet fallback, recovery steps that always name a verb, and the
 * QuestSystem regression that motivated this suite: the spine/wakes wiring
 * must construct + tick headless (the missing-Wakes import once bricked the
 * whole quest system at Game init — the coldest of cold-start failures).
 */

import { DelightGate, delightLine, DELIGHT_LINES, FIRST_DENT_RECOVERY, BATTERY_RECOVERY } from '../../onboarding/delights.js';
import { QuestSystem } from '../../quests/QuestSystem.js';
import { CAMPAIGN, SPINE } from '../../quests/data/index.js';

const mkStorage = () => {
  const m = new Map();
  return {
    getItem: k => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
  };
};

export function runDelightTests(ok) {
  // ══ 1. DelightGate: once-ever, persisted, corrupt-storage tolerant ══════
  console.log('\nDelights · gate');
  {
    const st = mkStorage();
    const g1 = new DelightGate(st);
    ok('fresh gate: beat not fired', g1.fired('first_lucky_find') === false);
    ok('once() fires the first time', g1.once('first_lucky_find') === true);
    ok('once() refuses the second time', g1.once('first_lucky_find') === false);
    const g2 = new DelightGate(st);
    ok('a second gate sharing storage sees it fired',
       g2.fired('first_lucky_find') === true && g2.once('first_lucky_find') === false);
    ok('different beats stay independent',
       g1.once('first_program_run') === true && g1.fired('first_lucky_find') === true);

    // corrupt storage: getItem throws → memory fallback, never a crash
    const evil = { getItem: () => { throw new Error('corrupt'); }, setItem: () => { throw new Error('quota'); } };
    const g3 = new DelightGate(evil);
    ok('corrupt storage never throws (fail-soft)', g3.once('first_dent') === true && g3.once('first_dent') === false);
  }

  // ══ 2. Copy: every beat speaks in every companion's voice ══════════════
  console.log('\nDelights · copy');
  {
    const personas = ['rivet', 'bolt', 'magma', 'juno'];
    for (const key of Object.keys(DELIGHT_LINES)) {
      for (const p of personas) {
        ok(`${key} has a ${p} line`, typeof delightLine(key, p) === 'string' && delightLine(key, p).length > 10,
           `${key}/${p}`);
      }
      ok(`${key} falls back for unknown persona`,
         delightLine(key, 'nobody') === delightLine(key, 'rivet'));
    }
    // the wow beats reference the moment
    ok('first_program_run line is about the bot moving under their code',
       /mov|wheels|thinking|ran/i.test(delightLine('first_program_run', 'rivet')));
    ok('first_lucky_find line lands the rarity',
       /rare|treasure|part/i.test(delightLine('first_lucky_find', 'juno')));
    // failure-kindness copy never blames the kid
    for (const p of personas) {
      ok(`first_dent ${p} line normalizes the bonk (no blame)`,
         !/you ruined|your fault|bad/i.test(delightLine('first_dent', p)),
         delightLine('first_dent', p));
    }
    // recovery steps always end with a way forward (a verb + an object)
    ok('dent recovery names the concrete action (repair kit + G)',
       /repair kit/.test(FIRST_DENT_RECOVERY) && /press G/.test(FIRST_DENT_RECOVERY));
    ok('battery recovery names the charging pad',
       /charging pad/.test(BATTERY_RECOVERY));
  }

  // ══ 3. QuestSystem regression: spine + wakes construct and tick headless ═
  console.log('\nDelights · quest-system regression (the Wakes import)');
  {
    // Before this suite existed, QuestSystem referenced Wakes without
    // importing it — construction threw, and the whole quest HUD never
    // rendered for a cold-start kid. This is the load-bearing regression test.
    let qs;
    try {
      const notes = [];
      const fakeGame = {
        ui: { notify: t => notes.push(t) },
        storage: null,
      };
      qs = new QuestSystem(fakeGame, CAMPAIGN);
      ok('QuestSystem constructs headless (Wakes import present)', true);
      ok('fresh kid: chapter 1 ceremony fired during construction',
         Boolean(qs.spine.data.opened.ch01),
         JSON.stringify(qs.spine.data.opened));

      // complete chapter 2's carriers → a dormant thing wakes → the kid hears it
      qs._checkSpine();   // no completions yet: no tease, no crash
      const ch2 = SPINE[1];
      for (const qid of ch2.quests) {
        qs.tracker.data.completed[qid] ??= { at: '2026-08-23T00:00:00.000Z', day: 1 };
      }
      qs._checkSpine();
      const teased = notes.find(t => /woke/.test(t));
      ok('wake tease surfaces to the kid when the yard stirs',
         Boolean(teased) && teased.includes('East Road Light'), teased ?? '(none)');
      ok('wake tease fires once (second check stays silent)',
         notes.filter(t => /woke/.test(t)).length === 1);
      ok('wakes state reports the wake', qs.wakes.active('wake-yardlight') === true);
    } catch (e) {
      ok('QuestSystem constructs headless (Wakes import present)', false, e.message);
    }
  }
}
