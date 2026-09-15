/**
 * Maker Challenge test harness — run with:
 *   node src/maker/__tests__/challenge-tests.mjs
 *
 * Self-contained (own pass/fail counter). Covers the challenge engine (star
 * ratings, tile counting, the compile safety rail, determinism), every shipped
 * challenge (proven passable by a correct program and failable by a wrong one),
 * the ChallengeProgress store, and shipped-content integrity (every Spark
 * offline recipe + built-in example compiles). Exits non-zero on any failure.
 */

import { compile } from '../TileCompiler.js';
import {
  TileProgram, T,
  EXAMPLE_WALL_AVOIDER, EXAMPLE_LIGHT_RUNNER, EXAMPLE_SQUARE, EXAMPLE_BUMP_COUNTER,
} from '../TileProgram.js';
import { runChallenge, getChallenge, MAKER_CHALLENGES, ChallengeWorld, countTiles } from '../MakerChallenge.js';
import { ChallengeProgress } from '../ChallengeProgress.js';
import { OFFLINE_RECIPES } from '../../SparkOfflineRecipes.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
};

// ── Engine: world, safety rail, stars, tiles ────────────────────────────────
console.log('\nChallenge engine');
{
  ok('bank has >= 8 challenges', MAKER_CHALLENGES.length >= 8);
  ok('every challenge has id/title/brief/check', MAKER_CHALLENGES.every(c =>
    c.id && c.title && c.brief && typeof c.check === 'function'));
  ok('getChallenge resolves by id', getChallenge('reach-and-stop')?.title === 'Reach the Bay');
  ok('getChallenge returns null for unknown', getChallenge('nope') === null);

  const w = new ChallengeWorld({ bounds: { x0:-2, z0:-2, x1:2, z1:2 }, walls: [[0,1,0,1]], lines: [[0,0,0,5]] });
  ok('CW: inside bounds not solid', !w.isSolidAt(0, 0));
  ok('CW: outside bounds is solid', w.isSolidAt(9, 9));
  ok('CW: wall cell is solid', w.isSolidAt(0, 1));
  ok('CW: distanceAhead sees a wall (<1)', w.distanceAhead(0, -1, 0) < 1);
  ok('CW: distanceAhead clear = 1', new ChallengeWorld({}).distanceAhead(0,0,0) === 1);
  ok('CW: lineUnder true on a line cell', w.lineUnder(0, 3));
  ok('CW: lineUnder false off the line', !w.lineUnder(2, 3));

  ok('countTiles walks nested bodies', countTiles([
    T.forever([ T.action('beep'), T.ifElse(T.is('bumped', true), [T.action('stop')], [T.action('drive')]) ]),
  ]) === 5);

  // Safety rail: uncompilable program never runs.
  const bad = runChallenge(new TileProgram({ nodes: [T.action('frobnicate')] }), getChallenge('reach-and-stop'));
  ok('rail: uncompilable is blocked', bad.passed === false && bad.stars === 0);
  ok('rail: compiler errors surfaced', bad.compileErrors.length > 0);
  ok('rail: no ticks executed', bad.ticks === 0);

  // Stars: lean solution → 3; bloated but valid → fewer; failed → 0.
  const lean = new TileProgram({ brain:'tin', nodes:[
    T.repeatUntil(T.cond('distance_ahead','lt',0.30), [ T.action('drive',{dir:'forward',speed:0.5}) ]),
    T.action('stop'),
  ]});
  const r = runChallenge(lean, getChallenge('reach-and-stop'));
  ok('lean solution earns 3 stars', r.passed && r.stars === 3, `stars=${r.stars}`);
  const bloated = new TileProgram({ brain:'tin', nodes:[
    T.comment('a'), T.comment('b'), T.comment('c'), T.comment('d'), T.comment('e'),
    T.repeatUntil(T.cond('distance_ahead','lt',0.30), [ T.action('drive',{dir:'forward',speed:0.5}) ]),
    T.action('stop'),
  ]});
  const r2 = runChallenge(bloated, getChallenge('reach-and-stop'));
  ok('bloated but valid passes with fewer stars', r2.passed && r2.stars < r.stars, `stars=${r2.stars}`);
  ok('failed run earns 0 stars', runChallenge(new TileProgram({brain:'tin',nodes:[T.action('stop')]}), getChallenge('reach-and-stop')).stars === 0);

  // Determinism
  const p = new TileProgram({ brain:'tin', nodes:[ T.repeat(6, [ T.action('add_score',{amount:1}), T.wait(0.1) ]) ]});
  const a = runChallenge(p, getChallenge('score-sprint'));
  const b = runChallenge(p, getChallenge('score-sprint'));
  ok('challenges are deterministic', a.passed === b.passed && a.stars === b.stars && a.elapsed === b.elapsed);
}

// ── Every challenge: correct passes, wrong fails ────────────────────────────
console.log('\nChallenge solutions');
{
  const cases = [
    ['reach-and-stop',
      new TileProgram({brain:'tin',nodes:[ T.repeatUntil(T.cond('distance_ahead','lt',0.30),[T.action('drive',{dir:'forward',speed:0.5})]), T.action('stop') ]}),
      new TileProgram({brain:'tin',nodes:[ T.forever([T.action('drive',{dir:'forward',speed:0.7})]) ]})],
    ['dont-crash',
      new TileProgram({brain:'tin',nodes:[ T.forever([ T.ifElse(T.cond('distance_ahead','lt',0.4),[T.action('turn',{dir:'right',speed:0.9}),T.wait(0.2)],[T.action('drive',{dir:'forward',speed:0.4})]) ]) ]}),
      new TileProgram({brain:'tin',nodes:[ T.forever([T.action('drive',{dir:'forward',speed:0.8})]) ]})],
    ['timed-halt',
      new TileProgram({brain:'tin',nodes:[ T.action('drive',{dir:'forward',speed:0.5}), T.waitUntil(T.cond('timer','gte',3.0)), T.action('stop') ]}),
      new TileProgram({brain:'tin',nodes:[ T.forever([T.action('drive',{dir:'forward',speed:0.5})]) ]})],
    ['score-sprint',
      new TileProgram({brain:'tin',nodes:[ T.repeat(6,[T.action('add_score',{amount:1}),T.wait(0.05)]) ]}),
      new TileProgram({brain:'tin',nodes:[ T.forever([T.action('drive',{dir:'forward',speed:0.3})]) ]})],
    ['line-hold',
      new TileProgram({brain:'tin',nodes:[ T.forever([T.action('drive',{dir:'forward',speed:0.4})]) ]}),
      new TileProgram({brain:'tin',nodes:[ T.forever([T.action('turn',{dir:'right',speed:0.8})]) ]})],
    ['wake-on-dark',
      new TileProgram({brain:'tin',nodes:[ T.forever([ T.if(T.is('is_dark',true),[T.action('led',{state:'green'})]) ]) ]}),
      new TileProgram({brain:'tin',nodes:[ T.forever([T.action('drive',{dir:'forward',speed:0.3})]) ]})],
    ['count-to-three',
      new TileProgram({brain:'tin',nodes:[ T.repeat(3,[T.action('beep',{pitch:'high'}),T.wait(0.1)]), T.action('stop') ]}),
      new TileProgram({brain:'tin',nodes:[ T.repeat(5,[T.action('beep',{pitch:'high'})]) ]})],
    ['signal-boost',
      new TileProgram({brain:'tin',nodes:[ T.readSensor('v','brightness'), T.mathVar('v','mul',100), T.print('v') ]}),
      new TileProgram({brain:'tin',nodes:[ T.readSensor('v','brightness'), T.print('v') ]})],
  ];
  for (const [id, good, wrong] of cases) {
    ok(`${id}: correct program passes`, runChallenge(good, getChallenge(id)).passed);
    ok(`${id}: wrong program fails`, !runChallenge(wrong, getChallenge(id)).passed);
  }
}

// ── ChallengeProgress ───────────────────────────────────────────────────────
console.log('\nChallengeProgress');
{
  let backing = null;
  const store = { get: () => backing, set: (v) => { backing = v; } };
  const p = new ChallengeProgress(store);
  ok('starts empty', p.best('reach-and-stop') === 0 && !p.solved('reach-and-stop'));
  ok('record returns improved=true', p.record('reach-and-stop', 2) === true);
  ok('best reflects recorded stars', p.best('reach-and-stop') === 2 && p.solved('reach-and-stop'));
  ok('lower score does not downgrade', p.record('reach-and-stop', 1) === false && p.best('reach-and-stop') === 2);
  ok('higher score upgrades', p.record('reach-and-stop', 3) === true && p.best('reach-and-stop') === 3);
  ok('stars clamped 0..3', (() => { p.record('dont-crash', 9); return p.best('dont-crash') === 3; })());
  ok('persists across instances', new ChallengeProgress(store).best('reach-and-stop') === 3);
  const s = p.summary(MAKER_CHALLENGES);
  ok('summary counts solved/total', s.total === MAKER_CHALLENGES.length && s.solved === 2);
  ok('summary sums stars & maxStars', s.stars === 6 && s.maxStars === MAKER_CHALLENGES.length * 3);
  ok('summary not complete yet', s.complete === false);
  p.reset();
  ok('reset clears progress', p.best('reach-and-stop') === 0 && p.summary(MAKER_CHALLENGES).solved === 0);
  ok('bad JSON falls back to empty', new ChallengeProgress({ get: () => '{bad', set: () => {} }).best('x') === 0);
  ok('throwing store still works in-memory', (() => {
    const q = new ChallengeProgress({ get: () => { throw new Error('boom'); }, set: () => { throw new Error('boom'); } });
    q.record('a', 2); return q.best('a') === 2;
  })());
}

// ── Shipped content integrity ───────────────────────────────────────────────
console.log('\nShipped content integrity');
{
  ok('offline recipe bank is non-trivial', OFFLINE_RECIPES.length >= 20);
  const bad = OFFLINE_RECIPES.filter(r => !compile(r.program).ok).map(r => r.program.name);
  ok('every Spark offline recipe compiles', bad.length === 0, bad.join(', '));
  const examples = { EXAMPLE_WALL_AVOIDER, EXAMPLE_LIGHT_RUNNER, EXAMPLE_SQUARE, EXAMPLE_BUMP_COUNTER };
  const badEx = Object.entries(examples).filter(([, p]) => !compile(p).ok).map(([n]) => n);
  ok('every built-in example compiles', badEx.length === 0, badEx.join(', '));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
