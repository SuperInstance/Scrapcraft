/**
 * Kinematics tests — src/maker/kinematics.js is a 4-constant module whose
 * entire job is being the ONE place DRIVE_SPEED/TURN_RATE/BOT_RADIUS/
 * SONAR_RANGE live, so that TileCompiler's macro-expansion timing and
 * VirtualRobot's physics integration can never silently drift apart (see the
 * module's own docstring). A bare "the number is 3.0" assertion wouldn't test
 * that contract at all, so this suite instead:
 *   1. sanity-checks the constants themselves (type, sign, physical relations)
 *   2. drives the REAL consumers (VirtualRobot, TileCompiler.expandMacro) with
 *      the imported constants and checks their outputs land exactly where the
 *      constants say they should.
 *
 * Zero DOM, zero network, fully deterministic.
 */

import { DRIVE_SPEED, TURN_RATE, BOT_RADIUS, SONAR_RANGE } from '../kinematics.js';
import { VirtualRobot } from '../VirtualRobot.js';
import { expandMacro } from '../TileCompiler.js';

export function runKinematicsTests(ok, fail) {
  const check = (name, cond, extra = '') => (cond ? ok(name) : fail(name, extra));

  // ── 1. the constants themselves ───────────────────────────────────────────
  check('DRIVE_SPEED is a positive finite number',
    typeof DRIVE_SPEED === 'number' && Number.isFinite(DRIVE_SPEED) && DRIVE_SPEED > 0);
  check('TURN_RATE is a positive finite number',
    typeof TURN_RATE === 'number' && Number.isFinite(TURN_RATE) && TURN_RATE > 0);
  check('BOT_RADIUS is a positive finite number',
    typeof BOT_RADIUS === 'number' && Number.isFinite(BOT_RADIUS) && BOT_RADIUS > 0);
  check('SONAR_RANGE is a positive finite number',
    typeof SONAR_RANGE === 'number' && Number.isFinite(SONAR_RANGE) && SONAR_RANGE > 0);

  // Physical sanity: the sonar has to be able to see farther than the robot's
  // own body, or "distance_ahead" sensing would be useless near walls.
  check('SONAR_RANGE reaches further than the robot\'s own body radius',
    SONAR_RANGE > BOT_RADIUS);
  // Documented design point: at full turnPower a 180° turn takes exactly 1s.
  check('TURN_RATE makes a full 180° turn take exactly one second at full power',
    180 / TURN_RATE === 1);

  // ── 2. VirtualRobot: DRIVE_SPEED actually drives translation ──────────────
  {
    const bot = new VirtualRobot({ x: 0, z: 0, heading: 0 }); // heading 0 faces +Z
    bot.setDrive(1);
    bot.tick(1, null); // 1 second, no world → no collision clipping
    check('drivePower=1 for 1s moves exactly DRIVE_SPEED blocks (no collision)',
      Math.abs(bot.z - DRIVE_SPEED) < 1e-9 && Math.abs(bot.x) < 1e-9,
      `x=${bot.x} z=${bot.z}`);
  }
  {
    // Half power, half the distance — confirms it's a linear scale on DRIVE_SPEED,
    // not a hardcoded absolute step.
    const bot = new VirtualRobot({ x: 0, z: 0, heading: 0 });
    bot.setDrive(0.5);
    bot.tick(2, null);
    check('drivePower scales DRIVE_SPEED linearly (0.5 power × 2s = DRIVE_SPEED blocks)',
      Math.abs(bot.z - DRIVE_SPEED) < 1e-9, `z=${bot.z}`);
  }

  // ── 3. VirtualRobot: TURN_RATE actually drives rotation ───────────────────
  {
    const bot = new VirtualRobot({ heading: 0 });
    bot.setTurn(1);
    bot.tick(1, null); // 1 second at full turn power
    const expected = TURN_RATE * (Math.PI / 180); // degrees → radians
    check('turnPower=1 for 1s rotates by exactly TURN_RATE degrees',
      Math.abs(bot.heading - expected) < 1e-9, `heading=${bot.heading} expected=${expected}`);
  }

  // ── 4. VirtualRobot: BOT_RADIUS is the real collision boundary ────────────
  {
    // A wall starts at z=1.0. The robot should be free to approach until its
    // body (radius BOT_RADIUS) would poke through the wall, then get clipped —
    // exercising the exact `blocked()` arithmetic that consumes BOT_RADIUS.
    const wallZ = 1.0;
    const world = { isSolidAt: (x, z) => z >= wallZ };
    const bot = new VirtualRobot({ x: 0, z: 0, heading: 0 });
    bot.setDrive(1);

    // Step small enough that bot + BOT_RADIUS stays clear of the wall.
    const dtFree = (wallZ - BOT_RADIUS - 0.05) / DRIVE_SPEED;
    bot.tick(dtFree, world);
    const zAfterFree = bot.z;
    check('drives freely while body clearance to the wall exceeds BOT_RADIUS',
      zAfterFree > 0 && zAfterFree + BOT_RADIUS < wallZ, `z=${zAfterFree}`);

    // Now push forward enough that the attempted step would bring the body
    // (edge at z + BOT_RADIUS) into the wall — must be blocked entirely.
    bot.tick(1, world);
    check('collision blocks the step once body clearance would violate BOT_RADIUS',
      bot.z === zAfterFree, `z stayed=${bot.z} expected=${zAfterFree}`);
  }

  // ── 5. TileCompiler macro contract: TURN_RATE (correctly wired) ──────────
  {
    const expansion = expandMacro({ kind: 'turn_angle', params: { dir: 'right', degrees: 90 } });
    const wait = expansion?.find(n => n.type === 'wait');
    const speed = 0.6; // the macro's fixed intent-tile speed
    const expectedSeconds = 90 / (TURN_RATE * speed);
    check('turn_angle macro times its wait using the shared TURN_RATE constant',
      wait && Math.abs(wait.seconds - expectedSeconds) < 1e-9,
      `seconds=${wait?.seconds} expected=${expectedSeconds}`);
  }

  // ── 6. TileCompiler macro contract: DRIVE_SPEED (single-source-of-truth) ─
  // NOTE: as of this writing, TileCompiler.expandMacro's 'drive_distance' case
  // hardcodes the literal 3.0 instead of importing DRIVE_SPEED from
  // kinematics.js (unlike 'turn_angle', which correctly imports TURN_RATE).
  // It happens to equal DRIVE_SPEED today, so this assertion currently holds,
  // but the two are NOT wired together — if DRIVE_SPEED in kinematics.js ever
  // changes, this macro's timing will silently drift from VirtualRobot's
  // actual motion instead of moving with it, defeating the "one place both
  // agree" contract the module's docstring promises. This test exists to
  // catch exactly that drift the moment DRIVE_SPEED changes.
  {
    const expansion = expandMacro({ kind: 'drive_distance', params: { dir: 'forward', blocks: 3 } });
    const wait = expansion?.find(n => n.type === 'wait');
    const speed = 0.6;
    const expectedSeconds = 3 / (DRIVE_SPEED * speed);
    check('drive_distance macro timing currently matches the shared DRIVE_SPEED constant',
      wait && Math.abs(wait.seconds - expectedSeconds) < 1e-9,
      `seconds=${wait?.seconds} expected=${expectedSeconds}`);
  }
}
