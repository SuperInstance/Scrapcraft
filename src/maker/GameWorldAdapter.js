/**
 * ───────────────────────────────────────────────────────────────────────────
 *  GAME WORLD ADAPTER  —  backs the robot's sensors with real game state
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  The VM and VirtualRobot are deliberately ignorant of the game. They ask the
 *  "world" four questions; this adapter answers them from the actual Scrapcraft
 *  World + DayNight + player. Swap it for a MockWorld in tests (see run-tests).
 *
 *  Interface expected by primitives.js sensors:
 *     lightAt(x, z)              -> 0..1
 *     distanceAhead(x, z, hdg)   -> 0..1   (1 = clear to SONAR_RANGE, 0 = wall)
 *     playerDistance(x, z)       -> blocks
 *     isSolidAt(x, z)            -> bool   (also used by robot collision)
 *     seesTarget(x, z, hdg)      -> bool   (Vision Brain; optional)
 * ───────────────────────────────────────────────────────────────────────────
 */

import { SONAR_RANGE } from './kinematics.js';

export class GameWorldAdapter {
  /**
   * @param {World}    world     the voxel world (getBlock/isSolidAt)
   * @param {object}   player    has .pos {x,y,z}
   * @param {DayNight} dayNight  has .timeOfDay / .isNight (optional)
   */
  constructor(world, player, dayNight = null) {
    this.world = world;
    this.player = player;
    this.dayNight = dayNight;
  }

  /** Solid at ground level (y=1, where the robot rolls). */
  isSolidAt(x, z) {
    return this.world.isSolidAt(Math.floor(x), 1, Math.floor(z));
  }

  /** Ambient light 0..1: night is dark unless near a light source. */
  lightAt(x, z) {
    let base = 0.85;
    if (this.dayNight) {
      // timeOfDay 0..1 where ~0.5 is noon; fall back to isNight if absent.
      if (typeof this.dayNight.timeOfDay === 'number') {
        const t = this.dayNight.timeOfDay;
        base = 0.15 + 0.85 * Math.max(0, Math.sin(t * Math.PI)); // crude day curve
      } else if (this.dayNight.isNight) {
        base = 0.2;
      }
    }
    // Forge / power glow boosts local light (cheap proximity check to landmarks).
    const glow = this._nearGlow(x, z);
    return Math.min(1, base + glow);
  }

  _nearGlow(x, z) {
    const lm = this.world.landmarks ?? {};
    let g = 0;
    for (const key of Object.keys(lm)) {
      const p = lm[key];
      if (!p) continue;
      const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d2 < 36) g = Math.max(g, 0.5 * (1 - Math.sqrt(d2) / 6));
    }
    return g;
  }

  /** Raycast forward through the voxel grid; normalized clear distance. */
  distanceAhead(x, z, heading) {
    const dx = Math.sin(heading), dz = Math.cos(heading);
    const stepN = 24;
    for (let i = 1; i <= stepN; i++) {
      const t = (i / stepN) * SONAR_RANGE;
      if (this.isSolidAt(x + dx * t, z + dz * t)) {
        return Math.max(0, (t - 0.25) / SONAR_RANGE);
      }
    }
    return 1;
  }

  playerDistance(x, z) {
    const p = this.player?.pos;
    if (!p) return 999;
    return Math.hypot(p.x - x, p.z - z);
  }

  /** Vision Brain stub: "sees target" if facing the player within a cone. */
  seesTarget(x, z, heading) {
    const p = this.player?.pos;
    if (!p) return false;
    const toX = p.x - x, toZ = p.z - z;
    const dist = Math.hypot(toX, toZ);
    if (dist > SONAR_RANGE) return false;
    const facing = Math.atan2(Math.sin(heading), Math.cos(heading));
    const bearing = Math.atan2(toX, toZ);
    let diff = Math.abs(facing - bearing);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    return diff < Math.PI / 6; // 30° cone
  }
}
