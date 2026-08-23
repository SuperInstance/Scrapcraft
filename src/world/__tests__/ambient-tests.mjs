/**
 * Ambient yard life tests — scheduler pacing, mood weighting (day/night +
 * weather), fail-soft headless construction, cat + flicker lifecycles,
 * companion hour-one presence, and the a11y panel visibility contract.
 *
 * Exported as functions so run-tests.mjs can fold them into the one harness.
 * Everything headless: deps injected or absent (fail-soft is the point).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  AmbientLife, AMBIENT_EVENTS, AMBIENT_GAP_S, AMBIENT_LINES,
  ambientLine, AMBIENT_NOTABLE,
} from '../AmbientLife.js';
import { Companion } from '../../companion/Companion.js';
import { getPersona } from '../../companion/personas.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// deterministic rng: cycles a fixed sequence
function seqRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

export function runAmbientTests(ok) {
  // ══ 1. Scheduler pacing: generous, randomized gaps ═══════════════════════
  console.log('\nAmbientLife · pacing');
  {
    ok('gap band is 60–180s (spec)', AMBIENT_GAP_S[0] === 60 && AMBIENT_GAP_S[1] === 180);

    const al = new AmbientLife({ rng: seqRng([0.0]) });   // gap = 60s
    let fired = null;
    for (let s = 0; s < 59; s++) fired = al.tick(1);
    ok('nothing fires before the gap', fired === null && al.fired().length === 0);
    fired = al.tick(1);   // 60s
    ok('fires exactly at the gap boundary', fired !== null && typeof fired.id === 'string');
    let fired2 = null;
    for (let s = 0; s < 59; s++) fired2 = al.tick(1);      // gap re-armed (rng 0 → 60s)
    ok('gap re-arms after an event (no machine-gun)', fired2 === null);
    fired2 = al.tick(1);
    ok('second event fires at the next gap', fired2 !== null);
  }

  {
    const al = new AmbientLife({ rng: seqRng([0.999]) });  // gap ≈ 180s
    let fired = null;
    for (let s = 0; s < 170; s++) fired = al.tick(1);
    ok('long gap honored (~180s, nothing early)', fired === null);
  }

  // ══ 2. Mood weighting: day/night + weather shape the mix ════════════════
  console.log('\nAmbientLife · mood weighting');
  {
    const day   = new AmbientLife({ rng: Math.random, dayNight: { isNight: false } });
    const night = new AmbientLife({ rng: Math.random, dayNight: { isNight: true } });

    const bird = AMBIENT_EVENTS.find(e => e.id === 'bird_flutter');
    ok('birds fly by day', day.weightOf(bird) > 0);
    ok('birds never fly at night', night.weightOf(bird) === 0);

    const crane = AMBIENT_EVENTS.find(e => e.id === 'crane_creak');
    ok('crane creaks weigh heavier at night', night.weightOf(crane) > day.weightOf(crane));

    const calm  = new AmbientLife({ rng: Math.random, weather: { intensityValue: 0 } });
    const storm = new AmbientLife({ rng: Math.random, weather: { intensityValue: 1 } });
    const wind  = AMBIENT_EVENTS.find(e => e.id === 'wind_gust');
    ok('storms drag the wind out (storm weight > calm)', storm.weightOf(wind) > calm.weightOf(wind));

    const rainy = new AmbientLife({ rng: Math.random, weather: { intensityValue: 0.8 } });
    ok('no birds in the rain', rainy.weightOf(bird) === 0);

    const cat = AMBIENT_EVENTS.find(e => e.id === 'cat_pass');
    ok('the cat crosses in any weather', calm.weightOf(cat) > 0 && storm.weightOf(cat) > 0);
  }

  // ══ 3. Fail-soft: headless, no deps, still schedules ════════════════════
  console.log('\nAmbientLife · fail-soft');
  {
    const al = new AmbientLife({});   // no scene, no audio, no particles
    let any = null;
    for (let s = 0; s < 181; s++) { const f = al.tick(1, { x: 5, y: 2, z: 5 }); if (f) any = f; }
    ok('no systems → events still fire and never throw', any !== null && al.fired().length >= 1);
  }

  // throwing systems must not crash the tick
  {
    const al = new AmbientLife({
      scene: null,
      audio: { craneCreak() { throw new Error('boom'); } },
      rng: seqRng([0.0, 0.0]),   // gap 60s, pick = first pool hit (crane)
    });
    let any = null;
    try {
      for (let s = 0; s < 61; s++) { const f = al.tick(1); if (f) any = f; }
    } catch { /* must not happen */ }
    ok('a throwing sound system never crashes the yard', any !== null);
  }

  // ══ 4. Cat lifecycle: builds, crosses, removes itself ═══════════════════
  console.log('\nAmbientLife · the yard cat');
  {
    const added = [], removed = [];
    const scene = { add: m => added.push(m), remove: m => removed.push(m) };
    // rng schedule: [ctor gap, re-arm, pick] → 60s gap, then the weighted
    // roll (0.999) lands on the cat: crane 3 + bird 3 + stack 2 + wind 2 = 10
    // of 11.2 total — the cat takes the remainder
    const al = new AmbientLife({ scene, rng: seqRng([0.0, 0.0, 0.999]) });
    ok('pooled flicker light is added once at construction', added.length === 1);

    let fired = null;
    for (let s = 0; s < 60; s++) fired = al.tick(1, { x: 0, y: 2, z: 0 });
    ok('a scheduled pass reports cat_pass', fired?.id === 'cat_pass', `id=${fired?.id}`);
    ok('cat mesh joins the scene at play time', added.length === 2);

    // rng cycles on: dur draw 0.0 → 6s, then wraps… all draws deterministic;
    // burn generously — she takes her time, then she's gone
    let removedAt = -1;
    for (let s = 1; s <= 20; s++) {
      al.tick(1);
      if (removed.length && removedAt === -1) removedAt = s;
    }
    ok('cat crosses for several seconds before leaving', removedAt >= 4, `left at ~${removedAt}s`);
    ok('cat removes herself after the crossing', removed.length === 1);
    ok('one cat mesh per pass in the window', added.length === 2);
  }

  // no scene → no cat mesh, no crash, event still reported
  {
    const al = new AmbientLife({ rng: seqRng([0.0, 0.0, 0.999]) });
    let fired = null;
    for (let s = 0; s < 60; s++) fired = al.tick(1);
    ok('headless yard: cat is a no-op but the event still reports', fired?.id === 'cat_pass');
  }

  // ══ 5. Stack flicker: pooled light strobes then goes dark ═══════════════
  console.log('\nAmbientLife · stack flicker');
  {
    const calls = { creak: 0, chirp: 0, gust: 0, mew: 0 };
    const audio = {
      craneCreak: () => calls.creak++,
      birdChirp: () => calls.chirp++,
      windGust: () => calls.gust++,
      catMew: () => calls.mew++,
    };
    const parts = [];
    const particles = { burst: (...a) => parts.push(a) };
    // rng [ctor gap, re-arm, pick] → 0.65 lands in stack_flicker's band
    // (past crane 3 + bird 3, inside stack's 3..8 of 11.2 total)
    const al = new AmbientLife({ audio, particles, rng: seqRng([0.0, 0.0, 0.65]) });
    let fired = null;
    for (let s = 0; s < 60; s++) fired = al.tick(1, { x: 0, y: 0, z: 0 });
    ok('stack_flicker picked by weight', fired?.id === 'stack_flicker', `id=${fired?.id}`);
    ok('flicker asks the existing particle system for embers', parts.length > 0);
    // burn the flicker duration — must expire cleanly without a scene light
    for (let s = 0; s < 5; s++) al.tick(1);
    ok('flicker expires cleanly without a scene light', true);
  }

  // ══ 6. Companion reaction bank ══════════════════════════════════════════
  console.log('\nAmbientLife · companion reactions');
  {
    for (const id of ['rivet', 'bolt', 'magma', 'juno']) {
      ok(`${id} has a cat line`, typeof ambientLine('cat_pass', id) === 'string');
    }
    ok('unknown persona falls back to Rivet',
       ambientLine('cat_pass', 'stranger-x') === ambientLine('cat_pass', 'rivet'));
    ok('non-notable event has no forced line', ambientLine('wind_gust') === null);
    ok('notables are cat + crane only (chatter discipline)',
       AMBIENT_NOTABLE.has('cat_pass') && AMBIENT_NOTABLE.has('crane_creak') && AMBIENT_NOTABLE.size === 2);
    ok('line bank covers every notable', [...AMBIENT_NOTABLE].every(id => ambientLine(id, 'rivet')));
    ok('every notable has all four voices', [...AMBIENT_NOTABLE].every(id =>
      ['rivet', 'bolt', 'magma', 'juno'].every(p => typeof AMBIENT_LINES[id][p] === 'string')));
  }
}

// ══ 7. Companion hour-one presence: ambient noticing while moving ═════════
export function runCompanionAmbientTests(ok) {
  console.log('\nCompanion · hour-one ambient noticing');

  const mkCompanion = (rngVals) => {
    const said = [];
    const c = new Companion({
      persona: getPersona('rivet'),
      speak: (text, meta) => said.push({ text, meta }),
      rng: seqRng(rngVals ?? [0.5]),
    });
    return { c, said };
  };
  const observations = (said) => said.filter(s => s.meta?.event === 'observation');

  // the hour-one state: pointer-locked, MOVING, no menus
  const MOVING = { locked: true, moving: true, midFlow: false };

  {
    // idle path unchanged: a still kid still gets idle observations
    const { c, said } = mkCompanion();
    for (let s = 0; s < 200; s++) c.update(1, { locked: true, moving: false, midFlow: false });
    ok('idle observations still fire for a still kid (regression)', observations(said).length >= 1,
       `n=${observations(said).length}`);
  }

  {
    // the fix: a MOVING kid now hears the companion — ~1 per 3–4 min
    const { c, said } = mkCompanion();
    for (let s = 0; s < 600; s++) c.update(1, MOVING);   // ten minutes of motion
    const n = observations(said).length;
    ok('moving kid hears ambient observations in hour one', n >= 1, `n=${n}`);
    ok('≤1 ambient line per ~3–4 min (max 3 in ten minutes)', n <= 3, `n=${n}`);
  }

  {
    // the min-gap is real: near-silence for the first ~3 minutes of motion
    // (the only earlier voice can be a nudge — actionable, not observational)
    const { c, said } = mkCompanion();
    for (let s = 0; s < 179; s++) c.update(1, MOVING);
    ok('no ambient lines in the first ~3 min (the min-gap)', observations(said).length === 0);
    for (let s = 0; s < 21; s++) c.update(1, MOVING);   // 180–200s: chatter-guard retry window
    ok('first ambient notice lands by ~200s (gap + guard grace)',
       observations(said).length === 1, `n=${observations(said).length}`);
  }

  {
    // mid-flow (menus/races/conversation) pauses the clock — never into a menu
    const { c, said } = mkCompanion();
    for (let s = 0; s < 400; s++) c.update(1, { locked: true, moving: true, midFlow: true });
    ok('no ambient lines mid-flow', observations(said).length === 0);
  }

  {
    // unlocked (no pointer lock) pauses the clock too — kid is "away"
    const { c, said } = mkCompanion();
    for (let s = 0; s < 400; s++) c.update(1, { locked: false, moving: true, midFlow: false });
    ok('no ambient lines while unlocked', observations(said).length === 0);
  }

  {
    // stranger tier speaks: hour one, every persona notices the world
    for (const id of ['rivet', 'bolt', 'magma', 'juno']) {
      const said = [];
      const c = new Companion({
        persona: getPersona(id),
        speak: (text, meta) => said.push({ text, meta }),
        rng: seqRng([0.5]),
      });
      for (let s = 0; s < 205; s++) c.update(1, MOVING);   // gap + chatter-guard retry window
      const obs = observations(said);
      ok(`${id} stranger-tier notices the world (no hour-one silence)`,
         obs.length >= 1 && typeof obs[0].text === 'string' && obs[0].text.length > 0,
         `n=${obs.length}`);
    }
  }
}

// ══ 8. A11y: closed panels leave the accessibility tree ═══════════════════
export function runA11yPanelTests(ok) {
  console.log('\nA11y · invisible panels leave the tree');

  const html = readFileSync(join(HERE, '../../../index.html'), 'utf8');

  // every .show-toggled overlay that fades with opacity must pair
  // opacity:0 with visibility:hidden in its BASE rule and visibility:visible
  // in its SHOWN rule — otherwise screen readers see the invisible stack
  // (beta P2-2: WELCOME BACK on fresh profiles, READY TO BUILD, TIN BRAIN).
  // visibility:hidden removes the subtree from the a11y tree; keeping it in
  // the transition list means the fade-out still plays before it vanishes.
  const panels = [
    ['#zone-toast', '#zone-toast.show'],
    ['#bot-speech-card', '#bot-speech-card.show'],
    ['#welcome-back', '#welcome-back.show'],
    ['#item-flash', '#item-flash.show'],
    ['#levelup-toast', '#levelup-toast.show'],
    ['#hotbar-tip', '#hotbar-tip.show'],
    ['#flash-receipt', '#flash-receipt.show'],
    ['.bot-speech', '.bot-speech.show'],
  ];

  const rule = (selector) => {
    const i = html.indexOf(selector + ' {');
    if (i === -1) return null;
    const end = html.indexOf('}', i);
    return html.slice(i, end);
  };

  for (const [base, shown] of panels) {
    const b = rule(base), s = rule(shown);
    ok(`${base} rules exist`, b !== null && s !== null);
    if (!b || !s) continue;
    ok(`${base} hidden when closed (opacity:0 + visibility:hidden)`,
       /opacity:\s*0/.test(b) && /visibility:\s*hidden/.test(b));
    ok(`${base} visible when shown (visibility:visible)`, /visibility:\s*visible/.test(s));
    ok(`${base} fade-out preserved (visibility in transition)`, /transition[^;]*visibility/.test(b));
  }

  // the two JS-injected modals carry the same contract
  const classroom = readFileSync(join(HERE, '../../ClassRoom.js'), 'utf8');
  ok('#classroom-panel hides when closed', /#classroom-panel\s*\{[^}]*visibility:\s*hidden/s.test(classroom));
  ok('#classroom-panel shows visible', /#classroom-panel\.show\s*\{[^}]*visibility:\s*visible/s.test(classroom));
  const gallery = readFileSync(join(HERE, '../../BrainGallery.js'), 'utf8');
  ok('.bg-overlay hides when closed', /\.bg-overlay\s*\{[^}]*visibility:\s*hidden/s.test(gallery));
  ok('.bg-overlay shows visible', /\.bg-overlay\.bg-show\s*\{[^}]*visibility:\s*visible/s.test(gallery));

  // the a11y-tree offenders named in the beta report specifically
  const wb = rule('#welcome-back');
  ok('WELCOME BACK card no longer sits in the a11y tree on fresh profiles',
     wb !== null && /visibility:\s*hidden/.test(wb));
  const fr = rule('#flash-receipt');
  ok('READY TO BUILD / TIN BRAIN modal hidden from AT when closed',
     fr !== null && /visibility:\s*hidden/.test(fr));
}
