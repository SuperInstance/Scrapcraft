/**
 * ───────────────────────────────────────────────────────────────────────────
 *  VIRTUAL ROBOT  —  the simulated machine the VM drives
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  Pure logic, ZERO Three.js — so it runs in a unit test as happily as in the
 *  game. It holds the robot's pose and persistent motor state (just like real
 *  motor-driver pins stay set until changed) and integrates simple kinematics
 *  each physics tick. Collisions resolve against an injected world via
 *  `isSolidAt(x, z)`.
 *
 *  Actuators (primitives.js) mutate this object:
 *     setDrive(v)  v ∈ [-1,1]   forward/back motor power
 *     setTurn(v)   v ∈ [-1,1]   right(+)/left(−) spin power
 *     emit(kind,d)            non-motion effects (beep/led/grab) → event sink
 *
 *  The integration layer (DEV_GUIDE_scrapbot_integration.md) reads x/z/heading
 *  each frame to position the Three.js ScrapBot mesh, and drains `events` to
 *  fire audio/particles for beeps, LEDs, etc.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { DRIVE_SPEED, TURN_RATE, BOT_RADIUS } from './kinematics.js';

const DEG2RAD = Math.PI / 180;

export class VirtualRobot {
  constructor({ x = 0, z = 0, heading = 0 } = {}) {
    this.x = x;
    this.z = z;
    this.heading = heading;   // radians; 0 faces +Z, matches ScrapBot.rotation.y convention
    this.drivePower = 0;      // [-1,1]
    this.turnPower = 0;       // [-1,1]
    this.gripping = false;
    this.events = [];         // drained by integration layer each frame
    this.led = 'off';
  }

  // ── Actuator interface (called by primitives.exec) ────────────────────────
  setDrive(v) { this.drivePower = clamp(v, -1, 1); }
  setTurn(v)  { this.turnPower  = clamp(v, -1, 1); }
  emit(kind, data = {}) {
    if (kind === 'led') this.led = data.state;
    this.events.push({ kind, ...data });
  }

  /** Drain accumulated non-motion effects (beeps, leds, grabs). */
  drainEvents() { const e = this.events; this.events = []; return e; }

  // ── Physics integration ───────────────────────────────────────────────────
  /**
   * @param {number} dt    seconds
   * @param {object} world must provide isSolidAt(x, z) -> bool (optional; no
   *                       collision if absent)
   */
  tick(dt, world) {
    // Rotation first.
    if (this.turnPower !== 0) {
      this.heading += this.turnPower * TURN_RATE * DEG2RAD * dt;
      // keep heading in [-π, π]
      if (this.heading >  Math.PI) this.heading -= 2 * Math.PI;
      if (this.heading < -Math.PI) this.heading += 2 * Math.PI;
    }

    // Translation along heading.
    if (this.drivePower !== 0) {
      const dist = this.drivePower * DRIVE_SPEED * dt;
      const nx = this.x + Math.sin(this.heading) * dist;
      const nz = this.z + Math.cos(this.heading) * dist;
      if (!world?.isSolidAt) {
        this.x = nx; this.z = nz;
      } else {
        // Axis-separated slide so the bot scrapes along walls instead of sticking.
        if (!blocked(world, nx, this.z)) this.x = nx;
        if (!blocked(world, this.x, nz)) this.z = nz;
      }
    }
  }
}

function blocked(world, x, z) {
  // Sample a few points around the robot's radius.
  const r = BOT_RADIUS;
  return (
    world.isSolidAt(x + r, z) ||
    world.isSolidAt(x - r, z) ||
    world.isSolidAt(x, z + r) ||
    world.isSolidAt(x, z - r)
  );
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
