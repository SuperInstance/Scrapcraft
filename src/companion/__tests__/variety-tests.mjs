/**
 * Variety tests — anti-repetition for the companion voices:
 *   1. LineMemory: ring semantics, caps, reset-on-starve, save round-trip
 *   2. No-repeat draws: every persona × every bank, sliding-window uniqueness
 *   3. Context gating: `when` predicates, ambient banks (tod/weather),
 *      null-returning observation templates suppressed before the roll
 *   4. ChatterGuard: min gap between unsolicited lines + 10-minute budget
 *   5. Live wiring: Companion speaks fresh lines, memory persists across
 *      saves, the cadence guard gates idle chatter
 *
 * Headless: injectable rng/now, zero DOM, no I/O.
 */

import { PERSONAS, PERSONA_IDS, getPersona } from '../personas.js';
import { filterLines } from '../banter.js';
import {
  LineMemory, ChatterGuard, pickBanterFresh, pickObservationFresh, DEFAULT_RING_CAP,
} from '../variety.js';
import { Companion } from '../Companion.js';

const lcg = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const mkStore = () => {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), _map: map };
};

const EMPTY_DATA = { counters: { blocksMined: 0, laps: 0, crashes: 0, repairs: 0, flashes: 0, ghostsBeaten: 0, conversations: 0, programsRun: 0, botsBuilt: 0, rareLoot: 0, races: 0, sparkAsks: 0, nudgesFollowed: 0 }, biomes: [] };
const FULL_DATA = {
  counters: { blocksMined: 42, laps: 7, crashes: 3, repairs: 4, flashes: 2, ghostsBeaten: 1, conversations: 6, programsRun: 5, botsBuilt: 2, races: 2, rareLoot: 1, sparkAsks: 2, nudgesFollowed: 1 },
  biomes: ['Circuit City', 'The Deep Yard'],
};
const friendLike = { tier: 'friend', topTrait: null, data: FULL_DATA };
const strangerLike = { tier: 'stranger', topTrait: null, data: EMPTY_DATA };

export async function runVarietyTests(ok) {
  // ══ 1. LineMemory: ring semantics ════════════════════════════════════════
  console.log('\nVariety · LineMemory');
  {
    const pool = [{ line: 'a' }, { line: 'b' }, { line: 'c' }, { line: 'd' }];
    const mem = new LineMemory();
    ok('eligible starts as the whole pool', mem.eligible(pool, 'k').length === 4);
    mem.remember('k', 'a', 4); mem.remember('k', 'b', 4);
    ok('remembered lines leave the eligible pool',
       !mem.eligible(pool, 'k').some(l => l.line === 'a' || l.line === 'b')
         && mem.eligible(pool, 'k').length === 2);
    ok('recent() reports the ring', mem.recent('k').join(',') === 'a,b');
    // ring trims to min(cap, pool-1): a 4-line pool remembers at most 3
    mem.remember('k', 'c', 4); mem.remember('k', 'd', 4);
    ok('ring caps at pool-1 so one line always stays fresh',
       mem.recent('k').length === 3 && mem.eligible(pool, 'k').length === 1,
       JSON.stringify(mem.recent('k')));
    // a 2-line pool alternates forever — back-to-back repeats impossible
    const pair = [{ line: 'x' }, { line: 'y' }];
    const mem2 = new LineMemory();
    let alternates = true;
    for (let i = 0; i < 20; i++) {
      const el = mem2.eligible(pair, 'p');
      const pick = el[Math.floor(lcg(i)() * el.length)].line;
      mem2.remember('p', pick, 2);
      if (i > 0 && pick === last) alternates = false;
      var last = pick; // eslint-disable-line no-var
    }
    ok('2-line pool: 20 draws never repeat back-to-back', alternates);
    // single-line pool: starves → resets → keeps talking (no crash, no silence)
    const solo = [{ line: 'only' }];
    const mem3 = new LineMemory();
    mem3.remember('s', 'only', 1);
    ok('1-line pool starves → reset → still eligible, ring cleared',
       mem3.eligible(solo, 's').length === 1 && mem3.recent('s').length === 0);
    // pre-loaded ring larger than a shrunken pool → reset, not starvation
    const mem4 = new LineMemory({ shrunk: ['a', 'b', 'c'] });
    ok('oversized saved ring resets instead of starving',
       mem4.eligible([{ line: 'a' }, { line: 'b' }], 'shrunk').length === 2);
    // save round-trip + corruption tolerance
    const mem5 = new LineMemory({}, 3);
    mem5.remember('bank', 'line-1', 9); mem5.remember('bank', 'line-2', 9);
    const snap = mem5.toData();
    ok('toData/from round-trips', LineMemory.from(snap).recent('bank').join(',') === 'line-1,line-2');
    ok('corrupt save shapes load empty, never throw',
       LineMemory.from(null).recent('x').length === 0
         && LineMemory.from('garbage').recent('x').length === 0
         && LineMemory.from({ k: [42, null, 'ok'] }).recent('k').join(',') === 'ok'
         && LineMemory.from({ [`${'x'.repeat(200)}`]: ['nope'] }).recent('x'.repeat(200)).length === 0);
  }

  // ══ 2. No-repeat draws across every persona × bank ══════════════════════
  console.log('\nVariety · no-repeat draws');
  {
    for (const id of PERSONA_IDS) {
      const p = getPersona(id);
      let worstBank = 'n/a', worstWindow = 0;
      for (const [event, bank] of Object.entries(p.banter)) {
        if (event === 'tier_up') continue;               // placeholder bank
        const pool = filterLines(event, 2, p.banter);     // friend sees the most (whole-bank filter)
        if (pool.length < 2) continue;
        const mem = new LineMemory();
        const rng = lcg(7 + pool.length);
        const draws = [];
        for (let i = 0; i < pool.length * 3; i++) {
          const line = pickBanterFresh(event, friendLike, rng, p.banter, mem, { prefix: id });
          draws.push(line);
        }
        // invariant 1: never the same line twice in a row
        let backToBack = null;
        for (let i = 1; i < draws.length; i++) if (draws[i] === draws[i - 1]) backToBack = draws[i];
        ok(`${id}/${event}: ${draws.length} draws, zero back-to-back repeats`, backToBack === null, backToBack ?? '');
        // invariant 2: no repeat inside a sliding window of min(pool, cap+1)
        const w = Math.min(pool.length, DEFAULT_RING_CAP + 1);
        let dupe = null;
        outer: for (let i = 0; i + w <= draws.length; i++) {
          const win = draws.slice(i, i + w);
          if (new Set(win).size !== w) { dupe = win.join('|'); break outer; }
        }
        if (dupe === null && w > worstWindow) { worstWindow = w; worstBank = event; }
        ok(`${id}/${event}: no repeat within ${w}-pick window (pool ${pool.length})`,
           dupe === null && draws.every(d => typeof d === 'string' && d.length > 0), dupe ?? '');
      }
      ok(`${id}: memory exercised on real banks (widest window ${worstWindow} on ${worstBank})`, worstWindow >= 6);
    }
    // tier slicing still respected under memory: stranger draws stay tier-0
    const p = getPersona('rivet');
    const mem = new LineMemory();
    const strangerLines = new Set(filterLines('rare_loot', 0, p.banter).map(l => l.line));
    let leak = null;
    const rng4 = lcg(4242);
    for (let i = 0; i < 200 && !leak; i++) {
      const l = pickBanterFresh('rare_loot', strangerLike, rng4, p.banter, mem);
      if (!strangerLines.has(l)) leak = l;
    }
    ok('stranger-tier fresh picks never leak deeper lines', leak === null, leak ?? '');
  }

  // ══ 3. Context gating ═══════════════════════════════════════════════════
  console.log('\nVariety · context gating');
  {
    // (a) `when` on banter entries: ineligible lines never surface
    const gatedBank = {
      greet_return: [
        { tier: 0, line: 'always here' },
        { tier: 0, when: () => false, line: 'never here' },
        { tier: 0, when: (d, data) => (data?.counters?.laps ?? 0) > 0, line: 'needs laps' },
        { tier: 0, when: () => { throw new Error('boom'); }, line: 'exploding gate' },
        { tier: 0, when: (d, _data, ctx) => ctx?.weather === 'storm', line: 'storm only' },
      ],
    };
    const seen = new Set();
    const rng1 = lcg(999);
    for (let i = 0; i < 300; i++) {
      seen.add(pickBanterFresh('greet_return', strangerLike, rng1, gatedBank, new LineMemory(),
        { detail: {}, data: EMPTY_DATA, context: { tod: 'Morning', weather: 'clear' } }));
    }
    ok('false-gated and unsatisfied lines never surface',
       !seen.has('never here') && !seen.has('needs laps') && !seen.has('storm only') && seen.has('always here'),
       [...seen].join(' | '));
    const seen2 = new Set();
    const rng2 = lcg(12345);                    // one generator across draws (spread rng use)
    for (let i = 0; i < 300; i++) {
      seen2.add(pickBanterFresh('greet_return', { tier: 'friend', data: FULL_DATA }, rng2, gatedBank, new LineMemory(),
        { detail: {}, data: FULL_DATA, context: { tod: 'Night', weather: 'storm' } }));
    }
    ok('satisfied gates surface their lines (laps>0, storm)',
       seen2.has('needs laps') && seen2.has('storm only') && !seen2.has('never here') && !seen2.has('exploding gate'),
       [...seen2].join(' | '));
    // (b) null-returning observation templates are suppressed BEFORE the roll
    const obs = [() => null, s => (s.counters.crashes > 0 ? 'crashy' : null), () => 'always ok'];
    let wasted = 0, badPick = null;
    const rng3 = lcg(777);
    for (let i = 0; i < 200; i++) {
      const l = pickObservationFresh(strangerLike, rng3, obs, new LineMemory());
      if (l === null) wasted++;
      if (l !== 'always ok') badPick = l;
    }
    ok('null templates suppressed pre-roll: every draw lands on a real line',
       wasted === 0 && badPick === null, `${wasted} wasted / bad=${badPick ?? ''}`);
    // (c) ambient banks: gates match only their moment
    for (const id of PERSONA_IDS) {
      const p = getPersona(id);
      ok(`${id}: ambient bank present (6+) with when+line shape`,
         Array.isArray(p.ambient) && p.ambient.length >= 6
           && p.ambient.every(a => typeof a.when === 'function' && typeof a.line === 'string' && a.line.length > 10));
      const tods = ['Night', 'Dawn', 'Morning', 'Midday', 'Afternoon', 'Dusk'];
      const weathers = ['clear', 'rain', 'storm'];
      const renders = new Map(); // line → set of matching combos
      for (const a of p.ambient) {
        for (const tod of tods) for (const w of weathers) {
          if (a.when({ tod, weather: w })) {
            if (!renders.has(a.line)) renders.set(a.line, []);
            renders.get(a.line).push(`${tod}/${w}`);
          }
        }
      }
      ok(`${id}: every ambient line renders for some world state and none renders for all`,
         renders.size === p.ambient.length
           && [...renders.values()].every(combos => combos.length < tods.length * weathers.length));
      // night context admits only night lines into the idle pool
      const pool3 = pickObservationFresh(strangerLike, () => 0.99, [() => 'plain obs'], new LineMemory(), p.ambient, { tod: 'Night', weather: 'clear' }, 'obs-t');
      const nightLines = p.ambient.filter(a => a.when({ tod: 'Night', weather: 'clear' })).map(a => a.line).concat('plain obs');
      ok(`${id}: Night context pool = night ambient + classic obs only`,
         nightLines.includes(pool3), `${pool3?.slice(0, 40)}…`);
      // no context at all → ambient silent, classic obs still speak
      const noCtx = pickObservationFresh(strangerLike, () => 0.99, [() => 'plain obs'], new LineMemory(), p.ambient, null, 'obs-t2');
      ok(`${id}: null context disables ambient (fail-soft)`, noCtx === 'plain obs');
    }
  }

  // ══ 4. ChatterGuard: gap + budget ═══════════════════════════════════════
  console.log('\nVariety · cadence guard');
  {
    let t = 1000;
    const g = new ChatterGuard({ minGapS: 20, windowS: 600, maxUnsolicited: 6, now: () => t });
    ok('fresh guard allows unsolicited speech', g.canSpeakUnsolicited() === true);
    g.commitUnsolicited();                       // t=1000
    t = 1010;
    ok('min gap enforced: 10s after a line is too soon', g.canSpeakUnsolicited() === false);
    ok('canSpeakUnsolicited is a pure check (no stamp)', g.canSpeakUnsolicited() === false && g.unsolicitedCount() === 1);
    t = 1021;
    ok('gap elapsed → allowed again', g.canSpeakUnsolicited() === true);
    // any speech (reactive!) extends the quiet gap
    t = 1030; g.noteSpeech();
    t = 1040;
    ok('a reactive line resets the gap for unsolicited chatter', g.canSpeakUnsolicited() === false);
    // budget: 6 per rolling 10 minutes
    t = 1050; g.commitUnsolicited();
    t = 1080; g.commitUnsolicited();
    t = 1110; g.commitUnsolicited();
    t = 1140; g.commitUnsolicited();
    t = 1170; g.commitUnsolicited();             // 6 total (1000…1170)
    t = 1180;
    ok('budget hit: 6 unsolicited in 10 min → 7th denied', g.canSpeakUnsolicited() === false && g.unsolicitedCount() === 6);
    t = 1601;                                     // first stamp (1000) left the window
    ok('window rolls: oldest line expired → speech returns', g.canSpeakUnsolicited() === true && g.unsolicitedCount() === 5);
  }

  // ══ 5. Live wiring: fresh lines, persistence, gated chatter ═════════════
  console.log('\nVariety · live wiring');
  {
    // (a) same event twice in a session → different lines (memory, not luck).
    // Promote to friend first so the crash pool is deep (7 lines, ring holds 5).
    const spoken = [];
    const store = mkStore();
    const c = new Companion({
      persona: 'rivet', storage: store, managed: true, rng: () => 0.001,
      speak: (text, meta) => spoken.push({ text, event: meta.event }),
    });
    let guard = 0;
    while (c.state.tier !== 'friend' && guard++ < 40) c.observe('bot_built');
    ok('companion promoted to friend mid-test (setup sanity)', c.state.tier === 'friend');
    c.update(6, { locked: false });               // clear the reactive debounce
    c.observe('crash_survived');
    c.update(6, { locked: false });
    c.observe('crash_survived');
    const crashes = spoken.filter(s => s.event === 'crash_survived').map(s => s.text);
    ok('two crashes in one session → two DIFFERENT lines (rng was pinned)',
       crashes.length === 2 && crashes[0] !== crashes[1],
       crashes.join(' | '));

    // (b) memory persists through the save slot
    const ring = JSON.parse(store._map.get('scrapcraft_rivet')).banterRecent;
    ok('variety rings persisted into the companion save',
       ring && Array.isArray(ring['rivet:crash']) && ring['rivet:crash'].length >= 1,
       JSON.stringify(ring ?? null));
    const c2spoken = [];
    const c2 = new Companion({
      persona: 'rivet', storage: store, managed: true, rng: () => 0.001,
      speak: (text, meta) => c2spoken.push({ text, event: meta.event }),
    });
    c2.update(6, {});
    c2.observe('crash_survived');
    const third = c2spoken.find(s => s.event === 'crash_survived')?.text;
    ok('a reloaded companion never repeats either recent crash line',
       typeof third === 'string' && third !== crashes[0] && third !== crashes[1], third ?? '');

    // (c) the cadence guard gates idle observations
    const spokenG = [];
    const strictClockGuard = new ChatterGuard({ minGapS: 100000, windowS: 600, maxUnsolicited: 6, now: () => 1000 });
    strictClockGuard.noteSpeech();                  // someone spoke at t=1000
    const strict = new Companion({
      persona: 'juno', storage: null, managed: true, rng: () => 0.99,
      chatter: strictClockGuard,
      speak: (text, meta) => spokenG.push({ text, event: meta.event }),
    });
    strict.update(80, { locked: true, moving: false, midFlow: false });
    strict.update(80, { locked: true, moving: false, midFlow: false });
    ok('strict guard: idle observations stay silent', spokenG.filter(s => s.event === 'observation').length === 0);
    const spokenN = [];
    const normal = new Companion({
      persona: 'juno', storage: null, managed: true, rng: () => 0.99,
      speak: (text, meta) => spokenN.push({ text, event: meta.event }),
    });
    normal.update(80, { locked: true, moving: false, midFlow: false });
    ok('default guard: the first idle observation still speaks',
       spokenN.filter(s => s.event === 'observation').length === 1);

    // (d) ambient context flows through update() without breaking anything
    const spokenA = [];
    const amb = new Companion({
      persona: 'bolt', storage: null, managed: true, rng: lcg(99),
      speak: (text, meta) => spokenA.push({ text, event: meta.event }),
    });
    amb.update(80, { locked: true, moving: false, midFlow: false, tod: 'Night', weather: 'storm' });
    const obsA = spokenA.find(s => s.event === 'observation');
    ok('tod/weather ctx: idle line speaks, no crash, line is a real string',
       typeof obsA?.text === 'string' && obsA.text.length > 10, obsA?.text?.slice(0, 60) ?? '');

    // (e) bank growth: every event bank ≥6 per persona, trait tags valid
    for (const id of PERSONA_IDS) {
      const p = getPersona(id);
      const thin = Object.entries(p.banter).filter(([k, v]) => k !== 'tier_up' && v.length < 6);
      ok(`${id}: no thin banks left (<6 lines)`, thin.length === 0, thin.map(([k, v]) => `${k}:${v}`).join(' '));
      const axes = new Set(Object.keys(p.traits));
      const badTags = [];
      for (const [ev, bank] of Object.entries(p.banter)) {
        for (const l of bank) if (l.trait && !axes.has(l.trait)) badTags.push(`${ev}:${l.trait}`);
      }
      ok(`${id}: every banter trait tag is a real axis`, badTags.length === 0, badTags.join(','));
    }
  }
}
