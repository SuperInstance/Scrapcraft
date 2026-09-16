/**
 * Direct regression tests for VirtualRobot's own contract (src/maker/VirtualRobot.js),
 * independent of the TileVM/MakerRuntime layer that already exercises it indirectly.
 *
 * Covers: constructor defaults, setDrive/setTurn clamping, tick() integration order
 * (rotation-then-translation within the same tick), heading wraparound at ±π, forward
 * and reverse drive along heading, collision (axis-separated wall slide, and the
 * no-collision fallback when the world has no isSolidAt), stop semantics, event
 * emission + drainEvents (including the led side-effect and buffer clearing), the
 * elapsed-time clock, and the ECHO chip's replayQueue playback branch inside tick().
 *
 * Note: VirtualRobot itself has no battery field or drain logic — "battery" is a
 * world-side sensor (world.batteryLevel(), read by the `battery` primitive and the
 * EMBER chip) that primitives.js and Chips.js consume, not something VirtualRobot
 * tracks or mutates. So there is nothing of VirtualRobot's own contract to assert
 * about battery drain here; see world-adapter-tests.mjs / chips-tests.mjs for that.
 */

import { VirtualRobot } from '../VirtualRobot.js';
import { DRIVE_SPEED, TURN_RATE, BOT_RADIUS } from '../kinematics.js';
import { ECHO_STEP_S } from '../Chips.js';

const DEG2RAD = Math.PI / 180;

export function runVirtualRobotTests(ok, fail) {
  function check(name, cond, extra = '') {
    if (cond) ok(name); else fail(name, extra);
  }
  function approx(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }

  // ── Constructor defaults ───────────────────────────────────────────────────
  {
    const r = new VirtualRobot();
    check('defaults: x/z/heading are 0', r.x === 0 && r.z === 0 && r.heading === 0);
    check('defaults: drivePower/turnPower are 0', r.drivePower === 0 && r.turnPower === 0);
    check('defaults: gripping is false', r.gripping === false);
    check('defaults: led is off', r.led === 'off');
    check('defaults: clock starts at 0', r.clock === 0);
    check('defaults: events buffer starts empty', Array.isArray(r.events) && r.events.length === 0);

    const r2 = new VirtualRobot({ x: 1, z: 2, heading: 0.5 });
    check('constructor honours x/z/heading overrides', r2.x === 1 && r2.z === 2 && r2.heading === 0.5);
  }

  // ── setDrive / setTurn clamp to [-1, 1] ─────────────────────────────────────
  {
    const r = new VirtualRobot();
    r.setDrive(5);
    check('setDrive clamps above range to 1', r.drivePower === 1, `drivePower=${r.drivePower}`);
    r.setDrive(-5);
    check('setDrive clamps below range to -1', r.drivePower === -1, `drivePower=${r.drivePower}`);
    r.setTurn(5);
    check('setTurn clamps above range to 1', r.turnPower === 1, `turnPower=${r.turnPower}`);
    r.setTurn(-5);
    check('setTurn clamps below range to -1', r.turnPower === -1, `turnPower=${r.turnPower}`);
    r.setDrive(0.4);
    check('setDrive passes values inside range through unchanged', r.drivePower === 0.4);
  }

  // ── Forward drive: distance = drivePower * DRIVE_SPEED * dt along heading ──
  {
    const r = new VirtualRobot({ heading: 0 });
    r.setDrive(1);
    r.tick(1.0, null);
    check('forward drive at heading 0 advances +z by DRIVE_SPEED*dt',
      approx(r.z, DRIVE_SPEED, 1e-9) && approx(r.x, 0, 1e-9), `x=${r.x} z=${r.z}`);
  }

  // ── Reverse drive moves the opposite way along heading ──────────────────────
  {
    const r = new VirtualRobot({ heading: 0 });
    r.setDrive(-1);
    r.tick(1.0, null);
    check('reverse drive (drivePower=-1) moves -z', approx(r.z, -DRIVE_SPEED, 1e-9), `z=${r.z}`);
  }

  // ── Turn changes heading at TURN_RATE deg/s, scaled by turnPower ────────────
  {
    const r = new VirtualRobot({ heading: 0 });
    r.setTurn(1);
    r.tick(0.5, null);
    const expected = 1 * TURN_RATE * DEG2RAD * 0.5;
    check('right turn (turnPower=1) advances heading by TURN_RATE*dt',
      approx(r.heading, expected, 1e-9), `heading=${r.heading} expected=${expected}`);

    const rLeft = new VirtualRobot({ heading: 0 });
    rLeft.setTurn(-1);
    rLeft.tick(0.5, null);
    check('left turn (turnPower=-1) advances heading negatively',
      approx(rLeft.heading, -expected, 1e-9), `heading=${rLeft.heading}`);
  }

  // ── Combined drive+turn in one tick: translation uses the POST-rotation
  //    heading (rotation is integrated before translation within tick()) ─────
  {
    const r = new VirtualRobot({ heading: 0 });
    r.setDrive(1);
    r.setTurn(1);
    const dt = 0.1;
    r.tick(dt, null);
    const expHeading = 1 * TURN_RATE * DEG2RAD * dt;
    const dist = 1 * DRIVE_SPEED * dt;
    const ex = Math.sin(expHeading) * dist;
    const ez = Math.cos(expHeading) * dist;
    check('combined tick: heading updates as expected',
      approx(r.heading, expHeading, 1e-9), `heading=${r.heading}`);
    check('combined tick: translation is applied along the NEW heading, not the old one',
      approx(r.x, ex, 1e-9) && approx(r.z, ez, 1e-9), `x=${r.x} z=${r.z} ex=${ex} ez=${ez}`);
  }

  // ── Heading wraps into [-π, π] ───────────────────────────────────────────────
  {
    const start = Math.PI - 0.1;
    const r = new VirtualRobot({ heading: start });
    r.setTurn(1);
    const dt = 0.2 / Math.PI; // angular step of +0.2 rad, pushes just past +π
    r.tick(dt, null);
    check('heading wraps from just under +π to negative side',
      approx(r.heading, -(Math.PI - 0.1), 1e-6) && r.heading <= Math.PI && r.heading >= -Math.PI,
      `heading=${r.heading}`);

    const start2 = -(Math.PI - 0.1);
    const r2 = new VirtualRobot({ heading: start2 });
    r2.setTurn(-1);
    r2.tick(dt, null);
    check('heading wraps from just above -π to positive side',
      approx(r2.heading, Math.PI - 0.1, 1e-6) && r2.heading <= Math.PI && r2.heading >= -Math.PI,
      `heading=${r2.heading}`);
  }

  // ── Stop: zeroing both powers freezes pose on subsequent ticks ─────────────
  {
    const r = new VirtualRobot({ heading: 0 });
    r.setDrive(1);
    r.setTurn(1);
    r.tick(0.1, null);
    r.setDrive(0);
    r.setTurn(0);
    const { x, z, heading } = r;
    r.tick(0.5, null);
    check('setDrive(0)+setTurn(0) freezes x/z/heading on later ticks',
      r.x === x && r.z === z && r.heading === heading,
      `x=${r.x} z=${r.z} heading=${r.heading}`);
  }

  // ── Collision: stops the bot short of a wall ahead ──────────────────────────
  {
    const r = new VirtualRobot({ x: 0, z: 0, heading: 0 });
    const wall = { isSolidAt: (x, z) => z >= 2 };
    r.setDrive(1);
    for (let i = 0; i < 60; i++) r.tick(0.05, wall);
    check('collision stops the bot before the wall (accounting for BOT_RADIUS)',
      r.z < 2 - BOT_RADIUS + 0.05 && r.z > 1.0, `z=${r.z}`);
  }

  // ── Collision: axes resolve independently, so the bot slides along a wall
  //    that only blocks one axis instead of freezing entirely ─────────────────
  {
    const wall = { isSolidAt: (x, z) => x >= 1 };
    const r = new VirtualRobot({ heading: Math.PI / 4 }); // 45°: drives into both +x and +z
    r.setDrive(1);
    for (let i = 0; i < 300; i++) r.tick(0.02, wall);
    check('x-axis freezes just shy of the wall', r.x > 0.5 && r.x < 1 - BOT_RADIUS + 0.05, `x=${r.x}`);
    check('z keeps advancing while x is blocked (axis-separated slide)', r.z > 5, `z=${r.z}`);
  }

  // ── No isSolidAt on the world (or no world at all) → free movement ─────────
  {
    const r = new VirtualRobot({ heading: 0 });
    r.setDrive(1);
    r.tick(1.0, {}); // world present but lacks isSolidAt
    check('world without isSolidAt behaves like unobstructed movement',
      approx(r.z, DRIVE_SPEED, 1e-9), `z=${r.z}`);

    const r2 = new VirtualRobot({ heading: 0 });
    r2.setDrive(1);
    r2.tick(1.0, null); // no world at all
    check('null world behaves like unobstructed movement',
      approx(r2.z, DRIVE_SPEED, 1e-9), `z=${r2.z}`);
  }

  // ── Heading convention: π/2 drives along +x, not +z ─────────────────────────
  {
    const r = new VirtualRobot({ heading: Math.PI / 2 });
    r.setDrive(1);
    r.tick(1.0, null);
    check('heading π/2 drives along +x with ~0 change in z',
      approx(r.x, DRIVE_SPEED, 1e-9) && approx(r.z, 0, 1e-6), `x=${r.x} z=${r.z}`);
  }

  // ── emit(): pushes an event and 'led' additionally updates robot.led ───────
  {
    const r = new VirtualRobot();
    r.emit('beep', { pitch: 'high' });
    check('emit("beep") does not change led', r.led === 'off');
    r.emit('led', { state: 'green' });
    check('emit("led") updates robot.led as a side effect', r.led === 'green', `led=${r.led}`);
    check('events buffer accumulated both emitted events', r.events.length === 2);
  }

  // ── drainEvents(): returns the buffered events and empties the buffer ─────
  {
    const r = new VirtualRobot();
    r.emit('beep', { pitch: 'low' });
    r.emit('grab', { ok: true });
    const first = r.drainEvents();
    check('drainEvents returns the accumulated events in order', first.length === 2 &&
      first[0].kind === 'beep' && first[1].kind === 'grab', JSON.stringify(first));
    const second = r.drainEvents();
    check('drainEvents empties the buffer (nothing left to drain)', second.length === 0);
  }

  // ── clock: advances by dt every tick, independent of drive/turn state ─────
  {
    const r = new VirtualRobot();
    r.tick(0.3, null);
    r.tick(0.2, null);
    check('clock accumulates elapsed dt across ticks', approx(r.clock, 0.5, 1e-9), `clock=${r.clock}`);
  }

  // ── ECHO replay: tick() drains a pre-seeded replayQueue at a fixed cadence
  //    (ECHO_STEP_S per step), and stops the motors once the queue is spent ──
  {
    const r = new VirtualRobot();
    r.replayQueue = [{ drive: 0.5, turn: 0.2 }, { drive: -0.5, turn: -0.2 }];
    r._replayT = 0;
    r.tick(ECHO_STEP_S, {});
    check('first replay step applies its drive/turn and consumes one entry',
      approx(r.drivePower, 0.5, 1e-9) && approx(r.turnPower, 0.2, 1e-9) && r.replayQueue.length === 1,
      `drivePower=${r.drivePower} turnPower=${r.turnPower} queueLen=${r.replayQueue?.length}`);
    r.tick(ECHO_STEP_S, {});
    check('replay ends by stopping the motors and clearing the queue',
      r.drivePower === 0 && r.turnPower === 0 && r.replayQueue === null,
      `drivePower=${r.drivePower} turnPower=${r.turnPower} queue=${r.replayQueue}`);
  }
}
