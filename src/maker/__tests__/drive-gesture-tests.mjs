/**
 * DriveGesture tests — the three-order reading of a robot's path.
 *
 * Exports runDriveGestureTests(ok) where ok(name, cond, extra?) matches the
 * Maker Lab harness. Pure, deterministic, zero-dep — same as the module.
 */
import { readPathGesture, driveGesture } from '../DriveGesture.js';
import { runChallenge, getChallenge } from '../MakerChallenge.js';
import { TileProgram, T } from '../TileProgram.js';

export function runDriveGestureTests(ok) {
  // ── 1. Degenerate input is safe (never throws, sane zeros) ────────────────
  {
    const empty = readPathGesture([]);
    ok('empty path → 0 readings, no throw', empty.readings === 0 && empty.arcLength === 0);
    const one = readPathGesture([[1, 2, 3]]);
    ok('single point → 0 arc, planarity 1', one.arcLength === 0 && one.planarity === 1);
    ok('junk entries are filtered out', readPathGesture([[0, 0], 'x', null, [1, 1]]).readings === 2);
  }

  // ── 2. Straight vs jerky: bending is the jerkiness signal ─────────────────
  {
    const straight = [];
    for (let i = 0; i < 10; i++) straight.push([i, 0, 0]); // due +x, heading fixed
    const gS = readPathGesture(straight, { normalize: false });
    ok('a straight drive barely bends', gS.bendingEnergy < 1e-6, `bend=${gS.bendingEnergy}`);
    ok('a straight, non-turning drive has no twist', gS.twistEnergy < 1e-6, `twist=${gS.twistEnergy}`);
    ok('a straight drive reads planarity 1', Math.abs(gS.planarity - 1) < 1e-9);

    const zig = [];
    for (let i = 0; i < 10; i++) zig.push([i, i % 2 ? 1 : 0, 0]); // saw-tooth in z
    const gZ = readPathGesture(zig, { normalize: false });
    ok('a zig-zag bends much more than a straight line', gZ.bendingEnergy > gS.bendingEnergy + 1,
      `zig=${gZ.bendingEnergy.toFixed(2)} vs straight=${gS.bendingEnergy.toFixed(2)}`);
  }

  // ── 3. Torsion is real: a turn-and-drive arc helixes → twist > 0, while a
  //      stop-and-turn drive stays planar → twist ≈ 0 (honest about its limits).
  {
    // Circle: turn + drive together. heading ramps while (x,z) trace the circle
    // it implies — a helix in (x,z,heading), which has genuine torsion.
    const helix = [];
    for (let i = 0; i < 16; i++) {
      const h = i * 0.4;
      helix.push([Math.sin(h), Math.cos(h), h]); // (x,z) on the unit circle, heading = h
    }
    const gH = readPathGesture(helix); // normalized so metres/radians compare
    ok('a turn-and-drive arc (helix) shows genuine twist', gH.twistEnergy > 0.05,
      `twist=${gH.twistEnergy.toFixed(3)}`);
    ok('… so its planarity drops below 1 (it screws out of a plane)', gH.planarity < 0.999,
      `planarity=${gH.planarity.toFixed(3)}`);

    // Stop-and-turn: straight leg, pivot, straight leg — an L in one plane.
    const lshape = [
      [0, 0, 0], [0, 1, 0], [0, 2, 0],   // drive +z
      [0, 2, 0.5], [0, 2, 1.0],          // pivot in place
      [1, 2, 1.0], [2, 2, 1.0],          // drive +x
    ];
    const gL = readPathGesture(lshape);
    ok('a stop-and-turn L-drive is planar → ~no twist', gL.twistEnergy < 1e-6,
      `twist=${gL.twistEnergy}`);
    ok('the helix arcs far more than the L-drive', gH.twistEnergy > gL.twistEnergy + 0.05);
  }

  // ── 4. driveGesture() coaching scalars are bounded and ordered ────────────
  {
    const glide = [];
    for (let i = 0; i < 12; i++) glide.push({ x: i * 0.25, z: 0, heading: 0 });
    const jerk = [];
    for (let i = 0; i < 12; i++) jerk.push({ x: i * 0.25, z: i % 2 ? 0.4 : -0.4, heading: i % 2 ? 0.6 : -0.6 });
    const arc = [];
    for (let i = 0; i < 16; i++) { const h = i * 0.4; arc.push({ x: Math.sin(h), z: Math.cos(h), heading: h }); }
    const gGlide = driveGesture(glide);
    const gJerk = driveGesture(jerk);
    const gArc = driveGesture(arc);
    ok('smoothness stays within [0,1]', gGlide.smoothness >= 0 && gGlide.smoothness <= 1);
    ok('arcFlow stays within [0,1]', gArc.arcFlow >= 0 && gArc.arcFlow <= 1);
    ok('a glide reads smoother than a jerky drive', gGlide.smoothness > gJerk.smoothness,
      `glide=${gGlide.smoothness} jerk=${gJerk.smoothness}`);
    ok('an arcing drive reads more arcFlow than a straight glide', gArc.arcFlow > gGlide.arcFlow,
      `arc=${gArc.arcFlow} glide=${gGlide.arcFlow}`);
    ok('empty poses → 0 readings, no throw', driveGesture([]).readings === 0);
  }

  // ── 5. Determinism + purity (matches the sim's own guarantees) ────────────
  {
    const p = [[0, 0, 0], [1, 1, 0.2], [2, 0.5, 0.4], [3, 2, 0.1]];
    const frozen = JSON.stringify(p);
    const a = readPathGesture(p);
    const b = readPathGesture(p);
    ok('same path → identical reading (deterministic)', JSON.stringify(a) === JSON.stringify(b));
    ok('reading never mutates its input (pure)', JSON.stringify(p) === frozen);
  }

  // ── 6. End-to-end: runChallenge attaches a driveGesture to its metrics ────
  {
    const prog = new TileProgram({ nodes: [
      T.action('drive', { dir: 'forward', speed: 0.6 }),
      T.wait(1.0),
      T.action('stop'),
    ]});
    const ch = getChallenge('reach-and-stop') || getChallenge(undefined);
    if (ch) {
      const r1 = runChallenge(prog, ch);
      const r2 = runChallenge(prog, ch);
      ok('runChallenge exposes metrics.driveGesture', !!r1.metrics.driveGesture &&
        Number.isFinite(r1.metrics.driveGesture.smoothness));
      ok('driveGesture is deterministic across runs',
        JSON.stringify(r1.metrics.driveGesture) === JSON.stringify(r2.metrics.driveGesture));
      ok('a compile failure still returns a well-formed result (no gesture crash)',
        (() => { const bad = runChallenge(new TileProgram({ nodes: [T.action('frobnicate')] }), ch);
          return bad.passed === false && Array.isArray(bad.compileErrors); })());
    } else {
      ok('challenge fixture present for end-to-end drive-gesture test', false, 'no challenge found');
    }
  }
}
