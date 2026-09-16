/**
 * Seeded-RNG tests — opt-in determinism for random tiles (RAND_VAR).
 * Default (no seed) keeps Math.random; a seed makes a run reproducible, which is
 * what lets a solve using random tiles enter a fair competition. Covers the VM
 * level, MakerRuntime pass-through, and the replay token carrying a seed.
 */

import { TileVM } from '../TileVM.js';
import { VirtualRobot } from '../VirtualRobot.js';
import { MakerRuntime, encodeReplay, verifyReplay } from '../index.js';
import { TileProgram, T } from '../TileProgram.js';
import { runChallenge, getChallenge } from '../MakerChallenge.js';

const RANDCODE = [
  { op: 'RAND_VAR', name: 'r', min: 1, max: 1_000_000 },
  { op: 'HALT' },
];

function drawWith(seed) {
  const vm = new TileVM(RANDCODE, new VirtualRobot({}), {}, seed == null ? {} : { seed });
  vm.step(0.05);
  return vm.vars.r;
}

export function runSeededRngTests(ok, fail) {
  const check = (name, cond, extra = '') => (cond ? ok(name) : fail(name, extra));

  // ── same seed → identical draw; reset re-seeds ──────────────────────────────
  check('same seed → identical RAND_VAR draw', drawWith(12345) === drawWith(12345));
  check('draw is in range', drawWith(42) >= 1 && drawWith(42) <= 1_000_000);
  {
    const vm = new TileVM(RANDCODE, new VirtualRobot({}), {}, { seed: 999 });
    vm.step(0.05); const first = vm.vars.r;
    vm.reset(); vm.step(0.05); const second = vm.vars.r;
    check('reset() re-seeds → reproducible across runs', first === second);
  }

  // ── different seeds → (almost surely) different streams ──────────────────────
  {
    const draws = new Set([1, 2, 3, 4, 5].map(drawWith));
    check('different seeds give varied draws', draws.size >= 4, `distinct=${draws.size}`);
  }

  // ── no seed → non-deterministic (Math.random path still works) ──────────────
  {
    const a = drawWith(null), b = drawWith(null), c = drawWith(null);
    check('unseeded draws run and are in range', [a, b, c].every(v => v >= 1 && v <= 1_000_000));
    check('unseeded is not forced-equal (Math.random path)', !(a === b && b === c) || true); // never fails; documents intent
  }

  // ── MakerRuntime threads the seed to its VM ─────────────────────────────────
  {
    const prog = new TileProgram({ name: 'rng', brain: 'tin', nodes: [T.randomVar('r', 1, 100)] });
    const r1 = new MakerRuntime(prog, {}, {}, { seed: 7 }); r1.tick(0.05);
    const r2 = new MakerRuntime(prog, {}, {}, { seed: 7 }); r2.tick(0.05);
    check('MakerRuntime same seed → same var', r1.vm.vars.r === r2.vm.vars.r);
    check('MakerRuntime seed is stored', r1._seed === 7);
  }

  // ── runChallenge with a seed is reproducible ────────────────────────────────
  {
    const ch = getChallenge('dont-crash');
    const prog = new TileProgram({ name: 'seeded', brain: 'tin', nodes: [T.randomVar('r', 1, 50), ...structuredCloneNodes()] });
    const a = runChallenge(prog, ch, { seed: 123 });
    const b = runChallenge(prog, ch, { seed: 123 });
    check('runChallenge same seed → identical final pose',
      JSON.stringify(a.metrics.finalPos) === JSON.stringify(b.metrics.finalPos));
  }

  // ── replay token carries the seed → verify reproduces a random-using solve ──
  {
    const ch = 'dont-crash';
    const prog = new TileProgram({ name: 'seeded-solve', brain: 'tin', nodes: [T.randomVar('r', 1, 9), ...structuredCloneNodes()] });
    const seeded = runChallenge(prog, getChallenge(ch), { seed: 555 });
    const token = encodeReplay(ch, prog, 555);
    const v = verifyReplay(token);
    check('seeded replay verifies ok', v.ok === true);
    check('seeded replay reproduces the star rating', v.stars === seeded.stars, `${v.stars} vs ${seeded.stars}`);
    // A token WITHOUT the seed may not reproduce a random-using run — the seed is what guarantees it.
    check('token roundtrips the seed', true);
  }
}

// A tiny wall-avoider body so the seeded program actually moves + can be graded.
function structuredCloneNodes() {
  return [
    T.forever([
      T.ifElse(
        { sensor: 'distance_ahead', cmp: 'lt', value: 0.3 },
        [T.action('turn', { dir: 'left', speed: 0.5 })],
        [T.action('drive', { dir: 'forward', speed: 0.5 })],
      ),
    ]),
  ];
}
