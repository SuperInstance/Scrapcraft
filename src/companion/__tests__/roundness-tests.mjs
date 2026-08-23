/**
 * Roundness tests — the second layer of every voice: self-corrections,
 * pedantic One Things, quiet-attention telemetry lines, and the tier-gated
 * want-vs-flaw arcs. Every bank present, non-empty, tier-gated, fail-soft.
 *
 * Headless: injectable rng, zero DOM, no I/O.
 */

import { PERSONAS, PERSONA_IDS, getPersona } from '../personas.js';
import {
  filterRoundLines, roundnessOf,
  pickSelfCorrection, pickPedanticCorrection, pickQuietAttention,
  wantFlawBeat, pickRoundnessIdle,
} from '../roundness.js';
import { Companion } from '../Companion.js';

const seqRng = values => { let i = 0; return () => values[i++ % values.length]; };

const EMPTY_DATA = { counters: { blocksMined: 0, laps: 0, crashes: 0, repairs: 0, flashes: 0, ghostsBeaten: 0, conversations: 0, programsRun: 0 }, biomes: [] };
const FULL_DATA = {
  counters: { blocksMined: 42, laps: 7, crashes: 3, repairs: 4, flashes: 2, ghostsBeaten: 1, conversations: 6, programsRun: 5, botsBuilt: 2, races: 2, rareLoot: 1, sparkAsks: 2, nudgesFollowed: 1 },
  biomes: ['Circuit City', 'The Deep Yard'],
};

const strangerLike = { tier: 'stranger', topTrait: null, data: EMPTY_DATA };
const coworkerLike = { tier: 'coworker', topTrait: null, data: FULL_DATA };
const friendLike = { tier: 'friend', topTrait: null, data: FULL_DATA };

export async function runRoundnessTests(ok) {
  // ══ 1. Every persona has ALL roundness banks, non-empty ═════════════════
  console.log('\nRoundness · banks exist');
  {
    for (const id of PERSONA_IDS) {
      const p = getPersona(id);
      const ro = roundnessOf(p);
      ok(`${id}: has a roundness layer`, Boolean(ro));
      ok(`${id}: self-correction bank (4+) with mid-thought reversals`,
         Array.isArray(ro?.selfCorrection) && ro.selfCorrection.length >= 4
         && ro.selfCorrection.every(l => typeof l.line === 'string' && l.line.length > 0));
      // DNA 1 sanity: the reversal is IN the line (an ellipsis/em-dash beat)
      ok(`${id}: every self-correction actually turns mid-thought`,
         ro.selfCorrection.every(l => /…|\.\.\./.test(l.line)));
      ok(`${id}: pedantic One Thing documented + 2+ lines`,
         typeof ro?.pedanticCorrection?.what === 'string' && ro.pedanticCorrection.what.length > 8
           && ro.pedanticCorrection.lines.length >= 2);
      ok(`${id}: quiet-attention bank (3+)`,
         Array.isArray(ro?.quietAttention) && ro.quietAttention.length >= 3);
      const wf = ro?.wantFlaw;
      ok(`${id}: want AND flaw stated, and they fight`,
         typeof wf?.want === 'string' && typeof wf?.flaw === 'string'
           && wf.want.length > 8 && wf.flaw.length > 8 && wf.want !== wf.flaw);
      ok(`${id}: arc beats for all three tiers (guarded → cracked open)`,
         ['stranger', 'coworker', 'friend'].every(t => (wf?.beats?.[t]?.length ?? 0) >= 1));
      // every beat is a reasonable-length spoken line
      ok(`${id}: all beats are non-empty strings`,
         ['stranger', 'coworker', 'friend'].every(t =>
           wf.beats[t].every(b => (typeof b === 'string' ? b : b?.line)?.length > 20)));
    }
    // trait tags in roundness banks must be REAL axes for that persona
    for (const id of PERSONA_IDS) {
      const p = getPersona(id);
      const axes = new Set(Object.keys(p.traits));
      const tagged = [...p.roundness.selfCorrection, ...p.roundness.pedanticCorrection.lines];
      ok(`${id}: roundness trait tags match the persona's axes`,
         tagged.every(l => !l.trait || axes.has(l.trait)));
    }
  }

  // ══ 2. Tier gating: strangers never hear deeper lines ═══════════════════
  console.log('\nRoundness · tier gates');
  {
    for (const id of PERSONA_IDS) {
      const p = getPersona(id);
      const ro = p.roundness;
      ok(`${id}: self-corrections resolve at stranger tier`,
         filterRoundLines(ro.selfCorrection, 0).length >= 1);
      ok(`${id}: pedantic lines resolve at stranger tier`,
         filterRoundLines(ro.pedanticCorrection.lines, 0).length >= 1);
      // no higher-tier line is structurally reachable at stranger (200 draws)
      const tier0Set = new Set(filterRoundLines(ro.selfCorrection, 0).map(l => l.line));
      let leak = null;
      for (let i = 0; i < 200 && !leak; i++) {
        const l = pickSelfCorrection(p, strangerLike, seqRng([i / 200]));
        if (l && !tier0Set.has(l)) leak = l;
      }
      ok(`${id}: 200 stranger-tier draws never surface a deeper self-correction`, leak === null, leak ?? '');
      // quiet attention also gates (expected set = tier-0 entries rendered with full data)
      const qa0 = new Set();
      for (const e of filterRoundLines(ro.quietAttention, 0)) {
        if (typeof e.line === 'function') { try { const r = e.line(FULL_DATA); if (typeof r === 'string') qa0.add(r); } catch { /* skip */ } }
        else qa0.add(e.line);
      }
      let qaLeak = null;
      for (let i = 0; i < 200 && !qaLeak; i++) {
        const l = pickQuietAttention(p, { tier: 'stranger', topTrait: null, data: FULL_DATA }, seqRng([i / 200]));
        if (typeof l === 'string' && !qa0.has(l)) qaLeak = l;
      }
      ok(`${id}: quiet attention never leaks a deeper line at stranger`, qaLeak === null, qaLeak ?? '');
      // friend tier CAN reach everything the persona knows
      const friendSelf = new Set(filterRoundLines(ro.selfCorrection, 2).map(l => l.line));
      let heard = false;
      for (let i = 0; i < 200 && !heard; i++) {
        if (pickSelfCorrection(p, friendLike, seqRng([i / 200])) === [...friendSelf][friendSelf.size - 1]) heard = true;
      }
      ok(`${id}: friend tier reaches the deepest self-corrections`, heard);
    }
  }

  // ══ 3. Quiet attention: telemetry templates render, never throw ═════════
  console.log('\nRoundness · quiet attention');
  {
    for (const id of PERSONA_IDS) {
      const p = getPersona(id);
      let rendered = 0, threw = 0;
      for (const entry of p.roundness.quietAttention) {
        for (const data of [EMPTY_DATA, FULL_DATA]) {
          try {
            const out = (typeof entry.line === 'function')
              ? (() => { try { return entry.line(data); } catch { threw++; return 'X'; } })()
              : entry.line;
            if (typeof out === 'string' && out.length > 0) rendered++;
            else if (out !== null) threw++;
          } catch { threw++; }
        }
      }
      ok(`${id}: template lines render without throwing (rendered=${rendered}, bad=${threw})`, threw === 0 && rendered >= 2);
      // precision-as-haunting: at least one line carries a real number or a
      // concrete callback the game can grow into (lap/repair/build telemetry)
      ok(`${id}: at least one telemetry callback wired (fn of state)`,
         p.roundness.quietAttention.some(e => typeof e.line === 'function'));
    }
    // a populated career surfaces the counted life
    const boltLine = pickQuietAttention(getPersona('bolt'), { tier: 'friend', topTrait: null, data: FULL_DATA }, () => 0.3);
    ok('bolt\'s quiet attention counts the player\'s crashes back at them', /3 crashes/.test(boltLine ?? ''), boltLine ?? '');
  }

  // ══ 4. Fail-soft: missing/partial banks never crash ═════════════════════
  console.log('\nRoundness · fail-soft');
  {
    const nobody = {};
    ok('persona without roundness: every picker returns null',
       [pickSelfCorrection, pickPedanticCorrection].every(f => f(nobody, friendLike, () => 0) === null)
         && pickQuietAttention(nobody, friendLike, () => 0) === null
         && wantFlawBeat(nobody, 'friend', () => 0) === null
         && pickRoundnessIdle(nobody, friendLike, () => 0) === null);
    const partial = { roundness: { selfCorrection: [{ tier: 0, line: 'half a bank' }] } };
    ok('partial roundness: missing banks → null, present bank works',
       pickSelfCorrection(partial, strangerLike, () => 0) === 'half a bank'
         && pickPedanticCorrection(partial, strangerLike, () => 0) === null
         && pickQuietAttention(partial, strangerLike, () => 0) === null
         && wantFlawBeat(partial, 'friend', () => 0) === null);
    ok('unknown tier name → null', wantFlawBeat(getPersona('rivet'), 'enemy', () => 0) === null);
    // a throwing template is silenced, not fatal
    const spicy = { roundness: { quietAttention: [{ tier: 0, line: s => s.boom.kaboom }] } };
    ok('throwing template returns null (no crash)', pickQuietAttention(spicy, strangerLike, () => 0) === null);
  }

  // ══ 5. Earned vulnerability: arcs fire at tier-up, never at idle ════════
  console.log('\nRoundness · earned vulnerability');
  {
    for (const id of PERSONA_IDS) {
      const p = getPersona(id);
      // idle rotation, 600 draws at stranger tier: no beat text ever appears
      const beats = [...p.roundness.wantFlaw.beats.coworker, ...p.roundness.wantFlaw.beats.friend]
        .map(b => (typeof b === 'string' ? b : b.line));
      let leak = null;
      for (let i = 0; i < 600 && !leak; i++) {
        const l = pickRoundnessIdle(p, { tier: 'stranger', topTrait: null, data: FULL_DATA }, seqRng([(i % 100) / 100]));
        if (l && beats.includes(l)) leak = l;
      }
      ok(`${id}: 600 idle draws never surface a want/flaw beat`, leak === null, leak ?? '');
    }

    // the tier-up moment speaks the arc beat right after the promotion line
    const spoken = [];
    const bolt = new Companion({ persona: 'bolt', speak: (_t, meta) => spoken.push({ text: _t, event: meta.event }), rng: seqRng([0, 0.001, 0.001]) });
    let guard = 0;
    while (bolt.state.tier === 'stranger' && guard++ < 50) bolt.observe('bot_built');
    ok('bolt promoted mid-test (setup sanity)', bolt.state.tier === 'coworker');
    const ups = spoken.filter(s => s.event === 'tier_up');
    ok('tier-up speaks TWO beats: the promotion line, then the arc beat', ups.length === 2, JSON.stringify(ups.map(u => u.text.slice(0, 24))));
    const expectedBeat = wantFlawBeat(getPersona('bolt'), 'coworker', () => 0);
    ok('the second line IS the coworker arc beat (the fight shows)', ups[1]?.text === expectedBeat, ups[1]?.text ?? '');
    ok('the arc beat is NOT the friend-tier crack (that stays earned)', ups[1]?.text !== wantFlawBeat(getPersona('bolt'), 'friend', () => 0));
  }

  // ══ 6. Wiring: idle rotation + graceful fallback in the live engine ═════
  console.log('\nRoundness · live wiring');
  {
    // rivet with mined blocks: an idle beat produces the counted telemetry
    const spoken = [];
    const c = new Companion({ persona: 'rivet', speak: (t, m) => spoken.push({ text: t, event: m.event }), rng: seqRng([0.001, 0.001, 0.001, 0.001, 0.001, 0.001]), managed: true });
    for (let i = 0; i < 5; i++) c.observe('block_mined');
    spoken.length = 0;
    c.update(80, { locked: true, moving: false, midFlow: false });   // cross IDLE_AFTER + cooldown
    ok('idle tick speaks exactly one line', spoken.length === 1 && spoken[0].event === 'observation');
    ok('the idle line is rivet\'s quiet attention on the mine count (5 blocks)',
       /5 blocks mined/.test(spoken[0]?.text ?? '') && /shiny/.test(spoken[0]?.text ?? ''), spoken[0]?.text ?? '');

    // high roll → classic observation bank, unchanged behavior
    const spoken2 = [];
    const c2 = new Companion({ persona: 'rivet', speak: (t, m) => spoken2.push({ text: t, event: m.event }), rng: () => 0.99, managed: true });
    c2.update(80, { locked: true, moving: false, midFlow: false });
    ok('high roll falls back to classic observations (no roundness)', spoken2.length === 1 && spoken2[0].event === 'observation');

    // a persona with NO roundness layer runs exactly as before
    const spoken3 = [];
    const bare = { ...getPersona('rivet'), roundness: undefined };
    const c3 = new Companion({ persona: bare, speak: (t, m) => spoken3.push({ text: t, event: m.event }), rng: seqRng([0.1, 0.1, 0.1]), managed: true });
    c3.update(80, { locked: true, moving: false, midFlow: false });
    ok('persona without roundness: idle still observes, zero crash', spoken3.length === 1 && typeof spoken3[0].text === 'string');
  }
}
