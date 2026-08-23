/**
 * Touch layer tests — everything pure, zero browser: the touchSupported
 * truth table (desktop must NEVER see a joystick), the joystick clamping
 * math, the GestureDetector's tap/drag/long-press decisions, and the
 * TouchControls lifecycle guards (construction, enable/disable, idempotent
 * destroy, non-HTMLElement attach refusal).
 *
 * Exported as runTouchTests(pass, fail) so run-tests.mjs can fold this into
 * the one harness, ambient-tests style.
 */

import { touchSupported, clampJoystick, GestureDetector, TouchControls } from '../TouchControls.js';

export function runTouchTests(pass, fail) {
  const ok = (name, cond, extra = '') => {
    if (cond) pass(name);
    else fail(name, extra);
  };
  const near = (v, x, y, eps = 1e-9) =>
    Math.abs(v.x - x) <= eps && Math.abs(v.y - y) <= eps;

  // ══ 1. touchSupported truth table ═════════════════════════════════════
  console.log('\nTouch · touchSupported truth table');
  {
    const desktop = { maxTouchPoints: 0, ontouchstart: false, matchMedia: () => ({ matches: false }) };
    ok('desktop env is NOT touch (no regression, ever)', touchSupported(desktop) === false);

    ok('touch points + fine pointer (touchscreen laptop) is NOT touch',
       touchSupported({ maxTouchPoints: 5, ontouchstart: true, matchMedia: () => ({ matches: false }) }) === false);
    ok('coarse pointer + zero touch points is NOT touch',
       touchSupported({ maxTouchPoints: 0, ontouchstart: false, matchMedia: () => ({ matches: true }) }) === false);
    ok('points + coarse = touch',
       touchSupported({ maxTouchPoints: 1, ontouchstart: false, matchMedia: () => ({ matches: true }) }) === true);
    ok('legacy ontouchstart + coarse = touch',
       touchSupported({ maxTouchPoints: 0, ontouchstart: true, matchMedia: () => ({ matches: true }) }) === true);
    ok('maxTouchPoints as numeric string still counts',
       touchSupported({ maxTouchPoints: '2', matchMedia: () => ({ matches: true }) }) === true);
    ok('null env fails soft to false', touchSupported(null) === false);
    ok('missing matchMedia fails soft to false (needs the coarse check)',
       touchSupported({ maxTouchPoints: 5 }) === false);
    ok('throwing matchMedia fails soft to false',
       touchSupported({ maxTouchPoints: 5, matchMedia: () => { throw new Error('iframe'); } }) === false);
  }

  // ══ 2. Joystick clamping math ═════════════════════════════════════════
  console.log('\nTouch · clampJoystick');
  {
    ok('inside the radius scales linearly', near(clampJoystick(10, 0, 50), 0.2, 0));
    ok('negative quadrant scales too', near(clampJoystick(-25, 25, 50), -0.5, 0.5));
    ok('at the rim stays put', near(clampJoystick(30, 40, 50), 0.6, 0.8));
    ok('past the rim clamps to the unit rim (keeps direction)',
       near(clampJoystick(60, 80, 50), 0.6, 0.8));
    ok('far past the rim clamps to exactly 1', near(clampJoystick(100, 0, 50), 1, 0));
    ok('dead center is zero', near(clampJoystick(0, 0, 50), 0, 0));
    ok('zero radius fails soft to zero', near(clampJoystick(30, 40, 0), 0, 0));

    let maxMag = 0;
    for (let i = 0; i < 500; i++) {
      const dx = (Math.random() - 0.5) * 300, dy = (Math.random() - 0.5) * 300;
      const v = clampJoystick(dx, dy, 56);
      maxMag = Math.max(maxMag, Math.hypot(v.x, v.y));
      if (Math.hypot(dx, dy) > 1 && Math.hypot(v.x, v.y) > 1 + 1e-9) {
        ok('fuzz: magnitude never exceeds 1', false, `dx=${dx} dy=${dy}`);
        break;
      }
    }
    ok('fuzz: magnitude never exceeds 1', maxMag <= 1 + 1e-9, `max=${maxMag}`);
  }

  // ══ 3. GestureDetector: tap vs drag threshold ═════════════════════════
  console.log('\nTouch · GestureDetector tap vs drag');
  {
    // clean tap
    const g = new GestureDetector();
    g.down(100, 100, 0);
    ok('down marks the gesture active', g.active === true);
    const r = g.up(200);
    ok('quick release is a tap', r?.type === 'tap' && r.dx === 0 && r.dy === 0);
    ok('up deactivates the gesture', g.active === false);

    // jittery tap (under threshold) still taps, reports total drift
    const g2 = new GestureDetector();
    g2.down(100, 100, 0);
    g2.move(104, 103);
    g2.move(97, 99);
    const r2 = g2.up(220);
    ok('sub-threshold jitter still classifies as tap', r2?.type === 'tap');
    ok('tap reports total displacement', r2?.dx === -3 && r2?.dy === -1);

    // drag: no deltas until 10px from start, then movementX/Y-style streams
    const g3 = new GestureDetector();
    g3.down(0, 0, 0);
    ok('small move streams nothing (below threshold)', g3.move(5, 0) === null);
    ok('8px still below threshold', g3.move(8, 0) === null);
    const d1 = g3.move(20, 0);
    ok('past threshold the move streams a drag', d1?.type === 'drag' && d1?.dx === 12 && d1?.dy === 0,
       `d1=${JSON.stringify(d1)}`);
    const d2 = g3.move(26, 2);
    ok('subsequent moves stream per-move deltas', d2?.type === 'drag' && d2?.dx === 6 && d2?.dy === 2);
    ok('up after a drag reports null (drag already streamed)', g3.up(400) === null);

    // diagonal distance governs the threshold, not per-axis totals
    const g4 = new GestureDetector();
    g4.down(0, 0, 0);
    g4.move(8, 8);   // hypot ≈ 11.3 > 10 → drag
    ok('diagonal distance counts toward the threshold', g4.move(9, 9)?.type === 'drag');
  }

  // ══ 4. GestureDetector: timing windows ════════════════════════════════
  console.log('\nTouch · GestureDetector timing');
  {
    const mk = () => { const g = new GestureDetector({ tapMs: 250, longPressMs: 450 }); g.down(10, 10, 0); return g; };
    ok('release at 249ms is a tap', mk().up(249)?.type === 'tap');
    ok('release at exactly 250ms is NOT a tap (window is <)', mk().up(250) === null);
    ok('release at 300ms is neither tap nor long-press (a hold)', mk().up(300) === null);
    ok('release at exactly 450ms is a long-press', mk().up(450)?.type === 'longpress');
    ok('long release at 2s is a long-press', mk().up(2000)?.type === 'longpress');
    ok('long-press carries its displacement', (() => {
      const g = mk(); g.move(14, 7); const r = g.up(600);
      return r?.type === 'longpress' && r.dx === 4 && r.dy === -3;
    })());

    // consume(): the sibling finger of a two-finger tap stays silent
    const g5 = mk();
    g5.consume();
    ok('consumed gesture reports nothing at up', g5.up(100) === null);

    // custom thresholds are honored
    const g6 = new GestureDetector({ tapMs: 100, longPressMs: 200, dragPx: 4 });
    g6.down(0, 0, 0);
    g6.move(3, 0);
    ok('custom dragPx threshold respected', g6.move(5, 0)?.type === 'drag');
  }

  // ══ 5. TouchControls lifecycle (headless — no DOM required) ════════════
  console.log('\nTouch · TouchControls lifecycle');
  {
    let tc = null;
    try { tc = new TouchControls(); } catch { /* must not throw */ }
    ok('constructs with no callbacks at all', tc instanceof TouchControls);
    ok('enabled by default', tc.enabled === true);
    ok('state snapshot has the right shape',
       tc.state && tc.state.moving.x === 0 && tc.state.moving.y === 0 && tc.state.active === false);

    tc.setEnabled(false);
    ok('setEnabled(false) flips enabled', tc.enabled === false);
    tc.setEnabled(true);
    ok('setEnabled(true) flips it back', tc.enabled === true);

    let threw = false;
    try { tc.destroy(); tc.destroy(); } catch { threw = true; }
    ok('destroy before attach is a no-op and idempotent', threw === false);

    ok('attach refuses a non-HTMLElement root (Node, fail-soft)',
       tc.attach({}) === false && tc.attach(null) === false);

    // callbacks are optional through every code path we can reach headlessly
    const tc2 = new TouchControls();
    let threw2 = false;
    try {
      tc2.setEnabled(false);
      tc2.destroy();
    } catch { threw2 = true; }
    ok('no callback + lifecycle churn never throws', threw2 === false);
  }
}
