/**
 * GameWorldAdapter tests — the bridge that backs the robot's sensors with real
 * game state. This is core robot-correctness code (every sensor tile reads
 * through it) and was previously untested. Fully headless: a small MockWorld
 * supplies blocks / solids / landmarks / placed blocks, and each sensor's
 * contract is asserted deterministically. Storm-noise paths (Date.now-based) are
 * deliberately avoided by keeping weather intensity ≤ 0.5.
 */

import { GameWorldAdapter } from '../GameWorldAdapter.js';
import { SONAR_RANGE } from '../kinematics.js';
import { B } from '../../data/blocks.js';

class MockWorld {
  constructor() {
    this.blocks = new Map();
    this.solids = new Set();
    this.landmarks = {};
    this._placedBlocks = [];
    this.height = 10;
  }
  _k(x, y, z) { return `${x},${y},${z}`; }
  setBlock(x, y, z, id) { this.blocks.set(this._k(x, y, z), id); return this; }
  getBlock(x, y, z) { return this.blocks.get(this._k(x, y, z)) ?? 0; }
  setSolid(x, y, z) { this.solids.add(this._k(x, y, z)); return this; }
  isSolidAt(x, y, z) { return this.solids.has(this._k(x, y, z)); }
}

export function runWorldAdapterTests(ok, fail) {
  const check = (name, cond, extra = '') => (cond ? ok(name) : fail(name, extra));
  const approx = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;

  // ── isSolidAt: floor-rounds to ground level y=1 ─────────────────────────────
  {
    const w = new MockWorld().setSolid(3, 1, 4);
    const a = new GameWorldAdapter(w, null);
    check('isSolidAt true at the block (fractional coords floor down)', a.isSolidAt(3.2, 4.7) === true);
    check('isSolidAt false off the block', a.isSolidAt(3, 5) === false);
    check('isSolidAt ignores non-ground y (only checks y=1)', a.isSolidAt(3, 4) === true);
  }

  // ── lightAt: base / day curve / night / weather dim / glow, clamped 0..1 ─────
  {
    const w = new MockWorld();
    check('lightAt base with no dayNight', approx(new GameWorldAdapter(w, null).lightAt(0, 0), 0.85));
    check('lightAt night (isNight fallback)', approx(new GameWorldAdapter(w, null, { isNight: true }).lightAt(0, 0), 0.2));
    check('lightAt noon (timeOfDay 0.5) → full', approx(new GameWorldAdapter(w, null, { timeOfDay: 0.5 }).lightAt(0, 0), 1.0));
    check('lightAt midnight (timeOfDay 0) → dark', approx(new GameWorldAdapter(w, null, { timeOfDay: 0 }).lightAt(0, 0), 0.15));
    const stormy = new GameWorldAdapter(w, null, null, { intensityValue: 1 });
    check('lightAt storm dims by 0.45', approx(stormy.lightAt(0, 0), 0.4));
    const glowW = new MockWorld();
    glowW.landmarks = { forge1: { x: 0, z: 0 } };
    check('lightAt boosted by nearby landmark glow', new GameWorldAdapter(glowW, null).lightAt(0, 0) > 0.85);
    check('lightAt never exceeds 1', new GameWorldAdapter(glowW, null, { timeOfDay: 0.5 }).lightAt(0, 0) === 1);
  }

  // ── distanceAhead: raycast, normalized (no-weather path is deterministic) ────
  {
    const w = new MockWorld().setSolid(0, 1, 3);   // wall straight ahead (+z)
    const a = new GameWorldAdapter(w, null);
    const d = a.distanceAhead(0, 0, 0);
    check('distanceAhead detects wall ahead (normalized ≈0.46)', approx(d, (3 - 0.25) / SONAR_RANGE, 0.03), String(d));
    check('distanceAhead clear when facing away (-z)', a.distanceAhead(0, 0, Math.PI) === 1);
    // Wide-Angle upgrade doubles range → same wall reads as relatively closer share of a longer beam
    const wide = new GameWorldAdapter(w, null, null, null, null, null, 2);
    check('sensorRangeMult extends the beam', wide.distanceAhead(0, 0, 0) < 1);
  }

  // ── playerDistance ──────────────────────────────────────────────────────────
  {
    check('playerDistance = euclidean', new GameWorldAdapter(new MockWorld(), { pos: { x: 3, z: 4 } }).playerDistance(0, 0) === 5);
    check('playerDistance = 999 with no player', new GameWorldAdapter(new MockWorld(), null).playerDistance(0, 0) === 999);
  }

  // ── lineUnder / colorUnder: floor block set membership ──────────────────────
  {
    const w = new MockWorld().setBlock(2, 0, 2, B.TRACK).setBlock(5, 0, 5, B.RUST_METAL).setBlock(7, 0, 7, B.CONCRETE);
    const a = new GameWorldAdapter(w, null);
    check('lineUnder true over a track block', a.lineUnder(2.4, 2.9) === true);
    check('lineUnder false over concrete', a.lineUnder(7, 7) === false);
    check('lineUnder false over empty floor', a.lineUnder(0, 0) === false);
    check('colorUnder true over a colourful block', a.colorUnder(5, 5) === true);
    check('colorUnder false over track (not in colourful set)', a.colorUnder(2, 2) === false);
  }

  // ── lineBearing: two-sensor P-control (+1 right, -1 left, 0 centred, 0.6 lost) ─
  {
    const right = new MockWorld().setBlock(0, 0, 0, B.TRACK);           // under right sample only
    check('lineBearing +1 line to the right', new GameWorldAdapter(right, null).lineBearing(0, 0, 0) === 1);
    const left = new MockWorld().setBlock(-1, 0, 0, B.TRACK);           // under left sample only
    check('lineBearing -1 line to the left', new GameWorldAdapter(left, null).lineBearing(0, 0, 0) === -1);
    const both = new MockWorld().setBlock(0, 0, 0, B.TRACK).setBlock(-1, 0, 0, B.TRACK);
    check('lineBearing 0 centred on line', new GameWorldAdapter(both, null).lineBearing(0, 0, 0) === 0);
    check('lineBearing 0.6 when lost', new GameWorldAdapter(new MockWorld(), null).lineBearing(0, 0, 0) === 0.6);
  }

  // ── temperatureAt: forge radiates heat ──────────────────────────────────────
  {
    const w = new MockWorld(); w.landmarks = { forge_main: { x: 0, z: 0 }, beacon: { x: 50, z: 50 } };
    const a = new GameWorldAdapter(w, null);
    check('temperatureAt hot on the forge', approx(a.temperatureAt(0, 0), 1.0));
    check('temperatureAt base far from forge', approx(a.temperatureAt(40, 40), 0.3));
    check('temperatureAt ignores non-forge landmarks', approx(a.temperatureAt(50, 50), 0.3));
  }

  // ── weatherIntensity passthrough ────────────────────────────────────────────
  {
    check('weatherIntensity passes through', new GameWorldAdapter(new MockWorld(), null, null, { intensityValue: 0.65 }).weatherIntensity() === 0.65);
    check('weatherIntensity 0 with no weather', new GameWorldAdapter(new MockWorld(), null).weatherIntensity() === 0);
  }

  // ── waypoint distance + bearing ─────────────────────────────────────────────
  {
    const a = new GameWorldAdapter(new MockWorld(), null, null, null, { x: 3, z: 0 });
    check('waypointDistance normalized', approx(a.waypointDistance(0, 0), 0.5));
    check('waypointDistance clamps to 1 when far', new GameWorldAdapter(new MockWorld(), null, null, null, { x: 100, z: 0 }).waypointDistance(0, 0) === 1);
    check('waypointBearing +1 dead right', approx(new GameWorldAdapter(new MockWorld(), null, null, null, { x: 6, z: 0 }).waypointBearing(0, 0, 0), 1));
    check('waypointDistance 1 with no waypoint', new GameWorldAdapter(new MockWorld(), null).waypointDistance(0, 0) === 1);
    check('waypointBearing 0 with no waypoint', new GameWorldAdapter(new MockWorld(), null).waypointBearing(0, 0, 0) === 0);
  }

  // ── oreNearby: magnetic scan for crystal ore ────────────────────────────────
  {
    const here = new MockWorld().setBlock(0, 0, 0, B.CRYSTAL_ORE);
    check('oreNearby = 1 standing on ore', new GameWorldAdapter(here, {}).oreNearby(0, 0) === 1);
    const near = new MockWorld().setBlock(5, 0, 0, B.CRYSTAL_ORE);
    check('oreNearby falls off with distance', approx(new GameWorldAdapter(near, {}).oreNearby(0, 0), 0.5));
    check('oreNearby 0 with no ore in range', new GameWorldAdapter(new MockWorld(), {}).oreNearby(0, 0) === 0);
    // signal_amp tool extends range from 10 to 16
    const far = new MockWorld().setBlock(13, 0, 0, B.CRYSTAL_ORE);
    check('oreNearby 0 beyond base range', new GameWorldAdapter(far, { hasTool: () => false }).oreNearby(0, 0) === 0);
    check('oreNearby detects with signal_amp', new GameWorldAdapter(far, { hasTool: (t) => t === 'signal_amp' }).oreNearby(0, 0) > 0);
  }

  // ── floorType: material reflectance tiers ───────────────────────────────────
  {
    const w = new MockWorld()
      .setBlock(0, 0, 0, B.TRACK).setBlock(1, 0, 0, B.RUST_METAL)
      .setBlock(2, 0, 0, B.CONCRETE).setBlock(3, 0, 0, B.WOOD_PLANK);
    const a = new GameWorldAdapter(w, null);
    check('floorType 1.0 for track', a.floorType(0, 0) === 1.0);
    check('floorType 0.66 for metal', a.floorType(1, 0) === 0.66);
    check('floorType 0.33 for concrete', a.floorType(2, 0) === 0.33);
    check('floorType 0.1 for misc (wood)', a.floorType(3, 0) === 0.1);
    check('floorType 0 for empty column', a.floorType(9, 9) === 0);
  }

  // ── beaconSignal: placed BEACON RSSI ────────────────────────────────────────
  {
    const w = new MockWorld(); w._placedBlocks = [{ x: 0, z: 0, id: B.BEACON }];
    check('beaconSignal 1 on the beacon', new GameWorldAdapter(w, null).beaconSignal(0, 0) === 1);
    const w2 = new MockWorld(); w2._placedBlocks = [{ x: 6, z: 0, id: B.BEACON }];
    check('beaconSignal halves at half range', approx(new GameWorldAdapter(w2, null).beaconSignal(0, 0), 0.5));
    check('beaconSignal 0 with none placed', new GameWorldAdapter(new MockWorld(), null).beaconSignal(0, 0) === 0);
    const w3 = new MockWorld(); w3._placedBlocks = [{ x: 20, z: 0, id: B.BEACON }];
    check('beaconSignal 0 beyond range', new GameWorldAdapter(w3, null).beaconSignal(0, 0) === 0);
  }

  // ── batteryLevel ────────────────────────────────────────────────────────────
  {
    check('batteryLevel from bot', new GameWorldAdapter(new MockWorld(), null, null, null, null, { battery: 50 }).batteryLevel() === 0.5);
    check('batteryLevel default full (no bot)', new GameWorldAdapter(new MockWorld(), null).batteryLevel() === 1);
    check('batteryLevel clamps 0..1', new GameWorldAdapter(new MockWorld(), null, null, null, null, { battery: 250 }).batteryLevel() === 1);
  }

  // ── seesTarget: 30° cone toward the player ──────────────────────────────────
  {
    check('seesTarget true facing player ahead', new GameWorldAdapter(new MockWorld(), { pos: { x: 0, z: 3 } }).seesTarget(0, 0, 0) === true);
    check('seesTarget false player behind', new GameWorldAdapter(new MockWorld(), { pos: { x: 0, z: -3 } }).seesTarget(0, 0, 0) === false);
    check('seesTarget false player out of range', new GameWorldAdapter(new MockWorld(), { pos: { x: 0, z: 20 } }).seesTarget(0, 0, 0) === false);
    check('seesTarget false with no player', new GameWorldAdapter(new MockWorld(), null).seesTarget(0, 0, 0) === false);
  }

  // ── Vision Brain cone: seesColor / targetDistance / targetBearing ───────────
  {
    const w = new MockWorld().setBlock(0, 1, 2, B.RUST_METAL);   // colourful block dead ahead
    const a = new GameWorldAdapter(w, null);
    check('seesColor true with colourful block in cone', a.seesColor(0, 0, 0) === true);
    check('targetDistance normalized to nearest block', approx(a.targetDistance(0, 0, 0), 2 / SONAR_RANGE, 0.05));
    check('targetBearing ~0 dead ahead', approx(a.targetBearing(0, 0, 0), 0, 0.2));
    const empty = new GameWorldAdapter(new MockWorld(), null);
    check('seesColor false in empty cone', empty.seesColor(0, 0, 0) === false);
    check('targetDistance 1 in empty cone', empty.targetDistance(0, 0, 0) === 1);
    check('targetBearing 0 in empty cone', empty.targetBearing(0, 0, 0) === 0);
  }
}
