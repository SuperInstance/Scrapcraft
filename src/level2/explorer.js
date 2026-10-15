/**
 * ───────────────────────────────────────────────────────────────────────────
 *  EXPLORER — the camera plays the game
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Not an orbit. Not a turntable. The explorer is a player with a camera:
 * it picks destinations across the voxel yard, flies there on curved 3D
 * paths, drops to ground level, climbs for aerials, and looks at what
 * matters. Depth pops because the camera moves THROUGH depth — down
 * corridors, over the oval, through the gate.
 *
 * The explorer replaces orbitKeys(): instead of circling a point, each beat
 * gets a flight plan — a chain of legs between points of interest. The
 * camera travels, it doesn't spin.
 *
 * Yard: x∈[0,128], z∈[0,130], y∈[3,40]. Center ≈ (64, 62).
 * Bands: 0 gate/shed (z 0–31), 1 industrial (z 32–63),
 *        2 circuit city + oval (z 64–95), 3 deep yard (z 96–127).
 */

import * as THREE from 'three';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Points of interest — where a player would actually go.
const POIS = [
  { id: 'gate',       x: 36, z: 30,  y: 6,  lookY: 4,  name: 'The Gate' },
  { id: 'shed',       x: 20, z: 18,  y: 5,  lookY: 3,  name: 'The Shed' },
  { id: 'workbench',  x: 64, z: 48,  y: 7,  lookY: 4,  name: 'The Workbench' },
  { id: 'kiln',       x: 82, z: 55,  y: 6,  lookY: 5,  name: 'The Kiln' },
  { id: 'oval-near',  x: 64, z: 72,  y: 4,  lookY: 2,  name: 'The Oval' },
  { id: 'oval-far',   x: 64, z: 88,  y: 5,  lookY: 3,  name: 'The Oval' },
  { id: 'grandstand', x: 48, z: 84,  y: 12, lookY: 6,  name: 'The Grandstand' },
  { id: 'aerial',     x: 64, z: 62,  y: 34, lookY: 0,  name: 'The Yard' },
  { id: 'deep-yard',  x: 64, z: 110, y: 8,  lookY: 5,  name: 'The Deep Yard' },
  { id: 'circuit',    x: 90, z: 78,  y: 6,  lookY: 4,  name: 'Circuit City' },
  { id: 'fence',      x: 100, z: 40, y: 5,  lookY: 3,  name: 'The Fence' },
];

/**
 * Smooth 3D path between two points — a lifted curve, not a straight line.
 * The camera rises, travels, and descends, like a player flying.
 * Returns {pos(t), look(t)} for t∈[0,1].
 */
function flightLeg(from, to, lift = 8) {
  const mx = (from.x + to.x) / 2;
  const mz = (from.z + to.z) / 2;
  const my = Math.max(from.y, to.y) + lift;
  return {
    pos(t) {
      // Quadratic bezier: from → mid (lifted) → to
      const u = 1 - t;
      return {
        x: u * u * from.x + 2 * u * t * mx + t * t * to.x,
        y: u * u * from.y + 2 * u * t * my + t * t * to.y,
        z: u * u * from.z + 2 * u * t * mz + t * t * to.z,
      };
    },
    look(t) {
      // Look ahead along the path, blending to the destination
      const ahead = Math.min(1, t + 0.15);
      const p = this.pos(ahead);
      return {
        x: p.x * 0.6 + to.x * 0.4,
        y: p.y * 0.5 + to.lookY * 0.5,
        z: p.z * 0.6 + to.z * 0.4,
      };
    },
  };
}

/**
 * Generate keyframes for an exploration flight.
 * 
 * @param {Object} opts
 * @param {Array}  opts.stops  POI ids to visit, in order
 * @param {number} opts.dur    total seconds
 * @param {number} opts.n      keyframes to generate
 * @param {Object} opts.start  {x, y, z} starting position (defaults to first stop)
 * 
 * Unlike orbitKeys (which circles), this TRAVELS — the camera moves through
 * the world, and the look target leads the motion. Depth happens.
 */
export function exploreKeys({ stops, dur, n = 24, start = null }) {
  const waypoints = stops.map(id => POIS.find(p => p.id === id)).filter(Boolean);
  if (!waypoints.length) return [];
  
  const keys = [];
  const legs = [];
  let prev = start || { ...waypoints[0] };
  
  // Build legs between consecutive waypoints
  for (let i = 0; i < waypoints.length; i++) {
    const to = waypoints[i];
    // Vary the lift: sometimes skim low, sometimes soar
    const lift = 4 + Math.random() * 14;
    legs.push({ leg: flightLeg(prev, to, lift), to, durFrac: 1 / waypoints.length });
    prev = { ...to };
  }
  
  // Sample keyframes along the legs
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    const legIdx = Math.min(legs.length - 1, Math.floor(f * legs.length));
    const legF = (f * legs.length) - legIdx;
    // Smooth the leg transition
    const t = legF * legF * (3 - 2 * legF); // smoothstep
    
    const { leg, to } = legs[legIdx];
    const p = leg.pos(t);
    const l = leg.look(t);
    
    keys.push({
      t: +(dur * f).toFixed(3),
      x: +clamp(p.x, 0, 128).toFixed(2),
      y: +clamp(p.y, 3, 40).toFixed(2),
      z: +clamp(p.z, 0, 130).toFixed(2),
      look: {
        x: +clamp(l.x, 0, 128).toFixed(2),
        y: +clamp(l.y, 0, 40).toFixed(2),
        z: +clamp(l.z, 0, 130).toFixed(2),
      },
      ease: 'linear',
    });
  }
  
  return keys;
}

/**
 * A continuous explorer — for when the film isn't running beats.
 * Picks a random POI, flies there, looks around, picks another.
 * Call update(dt) every frame; it drives the camera directly.
 */
export class Explorer {
  constructor(camera) {
    this.camera = camera;
    this.current = null;
    this.target = null;
    this.leg = null;
    this.t = 0;
    this.legDur = 8;
    this.lookAt = new THREE.Vector3(64, 5, 62);
    this.pos = new THREE.Vector3(64, 10, 90);
  }
  
  pickNext() {
    // Don't go straight back where we came from
    const options = POIS.filter(p => p !== this.current);
    this.target = options[(Math.random() * options.length) | 0];
    const from = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    const to = { x: this.target.x, y: this.target.y, z: this.target.z, lookY: this.target.lookY };
    this.leg = flightLeg(from, to, 4 + Math.random() * 12);
    this.t = 0;
    // 6–14 seconds per leg, based on distance
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    this.legDur = 6 + (dist / 100) * 8;
  }
  
  update(dt) {
    if (!this.leg) this.pickNext();
    
    this.t += dt / this.legDur;
    if (this.t >= 1) {
      this.current = this.target;
      this.pickNext();
      return;
    }
    
    const t = this.t * this.t * (3 - 2 * this.t); // smoothstep
    const p = this.leg.pos(t);
    const l = this.leg.look(t);
    
    this.pos.set(
      clamp(p.x, 0, 128),
      clamp(p.y, 3, 40),
      clamp(p.z, 0, 130)
    );
    this.lookAt.set(
      clamp(l.x, 0, 128),
      clamp(l.y, 0, 40),
      clamp(l.z, 0, 130)
    );
    
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.lookAt);
  }
  
  // For telemetry
  get state() {
    return {
      target: this.target?.name || '—',
      progress: this.t,
    };
  }
}
