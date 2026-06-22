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
import { B } from '../data/blocks.js';

// Blocks that count as "distinctly coloured" for the Vision Brain colour sensor.
const COLOURFUL_IDS = new Set([B.RUST_METAL, B.FORGE, B.OIL_DRUM, B.POWER_BOX, B.WOOD_PLANK, B.SCRAP_PILE]);
// Blocks that act as a floor "line" for line-following.
const LINE_IDS = new Set([B.WOOD_PLANK, B.OIL_DRUM, B.TRACK]);

export class GameWorldAdapter {
  /**
   * @param {World}          world     the voxel world (getBlock/isSolidAt)
   * @param {object}         player    has .pos {x,y,z}
   * @param {DayNight}       dayNight  has .timeOfDay / .isNight (optional)
   * @param {WeatherSystem}  weather   has .intensityValue (optional)
   */
  constructor(world, player, dayNight = null, weather = null, waypoint = null, bot = null, sensorRangeMult = 1) {
    this.world = world;
    this.player = player;
    this.dayNight = dayNight;
    this.weather = weather;
    this.waypoint = waypoint;      // { x, z } or null — updated live by Game._dropWaypoint
    this._bot = bot;               // ScrapBot ref — used for battery sensor
    this.sensorRangeMult = sensorRangeMult; // Wide-Angle Sensors upgrade
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
    // Floodlights placed in the world also boost brightness
    const placed = this.world._placedBlocks ?? [];
    for (const { x: bx, z: bz, id } of placed) {
      if (id !== B.FLOODLIGHT) continue;
      const d = Math.hypot(bx - x, bz - z);
      if (d < 12) g = Math.max(g, 0.7 * (1 - d / 12));
    }
    return g;
  }

  /** Raycast forward through the voxel grid; normalized clear distance. */
  distanceAhead(x, z, heading) {
    const dx = Math.sin(heading), dz = Math.cos(heading);
    const range = SONAR_RANGE * this.sensorRangeMult;
    const stepN = 24;
    for (let i = 1; i <= stepN; i++) {
      const t = (i / stepN) * range;
      if (this.isSolidAt(x + dx * t, z + dz * t)) {
        return Math.max(0, (t - 0.25) / range);
      }
    }
    return 1;
  }

  playerDistance(x, z) {
    const p = this.player?.pos;
    if (!p) return 999;
    return Math.hypot(p.x - x, p.z - z);
  }

  /** Vision Brain — detect any coloured block in a 30° cone ahead. */
  seesColor(x, z, heading) {
    for (const [, , blockId] of this._conescan(x, z, heading)) {
      if (COLOURFUL_IDS.has(blockId)) return true;
    }
    return false;
  }

  /** Vision Brain — left/right offset to the nearest target in cone (−1..+1). */
  targetBearing(x, z, heading) {
    for (const [bx, bz] of this._conescan(x, z, heading)) {
      const dx = bx - x, dz = bz - z;
      return Math.sin(Math.atan2(dx, dz) - heading);
    }
    return 0;
  }

  /** Vision Brain — normalised distance to the nearest solid block in cone. */
  targetDistance(x, z, heading) {
    for (const [bx, bz] of this._conescan(x, z, heading)) {
      return Math.min(1, Math.hypot(bx - x, bz - z) / SONAR_RANGE);
    }
    return 1;
  }

  /** Generator: yield [bx, bz, blockId] within a cone, closest first. */
  *_conescan(x, z, heading, range = SONAR_RANGE * this.sensorRangeMult, halfCone = Math.PI / 6) {
    for (let r = 1; r <= range; r++) {
      for (let a = -halfCone; a <= halfCone; a += 0.2) {
        const bx = Math.round(x + r * Math.sin(heading + a));
        const bz = Math.round(z + r * Math.cos(heading + a));
        const id = this.world.getBlock?.(bx, 1, bz);
        if (id) yield [bx, bz, id];
      }
    }
  }

  /** IR line-following: true if the floor block under the bot is a dark track block. */
  lineUnder(x, z) {
    const id = this.world.getBlock?.(Math.floor(x), 0, Math.floor(z));
    return LINE_IDS.has(id);
  }

  /**
   * Ambient temperature: forge blocks radiate heat; open yard is cool.
   * Returns 0..1 (0 = arctic, 1 = next to a forge).
   */
  temperatureAt(x, z) {
    const base = 0.3;
    const lm = this.world.landmarks ?? {};
    let heat = 0;
    for (const key of Object.keys(lm)) {
      if (!key.includes('forge')) continue;
      const p = lm[key];
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < 8) heat = Math.max(heat, 0.7 * (1 - d / 8));
    }
    return Math.min(1, base + heat);
  }

  /** ESP32 color sensor: true when the floor block under the bot is distinctly coloured. */
  colorUnder(x, z) {
    const id = this.world.getBlock?.(Math.floor(x), 0, Math.floor(z));
    return COLOURFUL_IDS.has(id);
  }

  /** Weather intensity: 0 clear → 0.65 rain → 1.0 storm */
  weatherIntensity() {
    return this.weather?.intensityValue ?? 0;
  }

  /** Normalized distance to the active waypoint (0 = at waypoint, 1 = far away). */
  waypointDistance(x, z) {
    if (!this.waypoint) return 1;
    return Math.min(1, Math.hypot(this.waypoint.x - x, this.waypoint.z - z) / SONAR_RANGE);
  }

  /** Signed bearing to the waypoint from current heading (−1 = full left, +1 = full right). */
  waypointBearing(x, z, heading) {
    if (!this.waypoint) return 0;
    const dx = this.waypoint.x - x, dz = this.waypoint.z - z;
    return Math.sin(Math.atan2(dx, dz) - heading);
  }

  /**
   * Magnetic ore proximity scanner: returns 0 (no ore in range) → 1 (ore right here).
   * Scans a 10-block radius; each check is a direct array lookup, so it's cheap.
   */
  oreNearby(x, z) {
    const RANGE = this.player?.hasTool?.('signal_amp') ? 16 : 10;
    const range2 = RANGE * RANGE;
    let minDist2 = range2 + 1;
    const wx = Math.round(x), wz = Math.round(z);
    for (let dz = -RANGE; dz <= RANGE; dz++) {
      for (let dx = -RANGE; dx <= RANGE; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 >= minDist2) continue;
        for (let y = 0; y < (this.world.height ?? 10); y++) {
          if (this.world.getBlock?.(wx + dx, y, wz + dz) === B.CRYSTAL_ORE) {
            minDist2 = d2;
            break;
          }
        }
      }
    }
    if (minDist2 >= range2) return 0;
    return Math.max(0, 1 - Math.sqrt(minDist2) / RANGE);
  }

  /**
   * Floor material type under the bot: 0 = bare dirt/void, 0.33 = concrete,
   * 0.66 = metal/scrap, 1.0 = track/crystal — mirrors real IR reflectance sensor
   * that distinguishes surface materials by reflective index.
   */
  floorType(x, z) {
    const wx = Math.floor(x), wz = Math.floor(z);
    for (let y = 2; y >= 0; y--) {
      const id = this.world.getBlock?.(wx, y, wz);
      if (!id) continue;
      if (id === B.TRACK || id === B.CRYSTAL_ORE) return 1.0;
      if (id === B.RUST_METAL || id === B.CLEAN_METAL || id === B.WALL_METAL || id === B.SCRAP_PILE) return 0.66;
      if (id === B.CONCRETE || id === B.GRAVEL) return 0.33;
      return 0.1; // dirt / wood / misc
    }
    return 0;
  }

  /** Battery level as a 0..1 fraction (feeds the battery sensor tile). */
  batteryLevel() {
    return Math.max(0, Math.min(1, (this._bot?.battery ?? 100) / 100));
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
