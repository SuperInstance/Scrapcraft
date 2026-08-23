/**
 * ───────────────────────────────────────────────────────────────────────────
 *  OPENING CINEMATIC  —  the world before the menu
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The beta feel report's first flat note: "menu-before-world." The kid
 * answered Earl's gate questions over a dark, flat screen — ~90 seconds of
 * near-opaque menus before a single voxel of the yard earned its keep.
 *
 * The fix is structural, not cosmetic: from CLOCK IN (the renderer's
 * birth) until the last opening overlay closes, the camera slow-orbits the
 * yard. The wizard and the gate keep their jobs — they just stop hiding
 * the world while they do them. Their scrims went translucent; the yard
 * (day/night, weather, AmbientLife — the crane, the cat) glows through.
 *
 * Contract:
 *   - fail-soft: no camera / no DOM → begin()/update() are no-ops, never
 *     throws. The cinematic is a garnish on boot, never a gate.
 *   - deterministic core: `orbitPose(t, opts)` is pure math — the pose at
 *     time t with no THREE dependency (headless-testable).
 *   - clean handoff: `end()` freezes the orbit; Game parks the camera at
 *     the player's eye and takes the pointer lock, so the first locked
 *     frame is exactly where the kid stands. No snap, no spin.
 *
 * Pace: ~0.04 rad/s — a full lap of the yard takes about two and a half
 * minutes. The gate questions take ninety seconds. Most kids see most of
 * one orbit, drifting, before the world is theirs.
 */

/** Pure orbit math — position of the cinematic camera at time t (seconds). */
export function orbitPose(t, opts = {}) {
  const {
    center = { x: 64, z: 62 },
    radius = 50,
    height = 30,
    bobAmp = 2.4,      // gentle vertical drift, ±meters
    bobFreq = 0.07,    // one breath every ~14s
    startAngle = 0,
    rate = 0.042,      // rad/s — full orbit ≈ 150s
  } = opts;
  const a = startAngle + rate * t;
  const y = height + Math.sin(t * bobFreq) * bobAmp;
  return {
    x: center.x + Math.cos(a) * radius,
    y,
    z: center.z + Math.sin(a) * radius,
  };
}

export class OpeningCinematic {
  /**
   * @param {object} [opts]
   * @param {object} [opts.camera]  THREE camera (or any { position, lookAt })
   * @param {object} [opts.center]  orbit center {x,z}
   * @param {number} [opts.radius]  orbit radius (m)
   * @param {number} [opts.height]  orbit altitude (m)
   * @param {number} [opts.startAngle] starting angle (rad); default: random
   * @param {() => number} [opts.rng] injectable randomness (tests)
   */
  constructor(opts = {}) {
    this._camera = opts.camera ?? null;
    this._center = opts.center ?? { x: 64, z: 62 };
    this._radius = opts.radius ?? 50;
    this._height = opts.height ?? 30;
    this._startAngle = opts.startAngle ?? (opts.rng?.() ?? Math.random()) * Math.PI * 2;
    this._rate = 0.042;
    this._active = false;
    this._t = 0;
  }

  get active() { return this._active; }

  /** Start (or restart) the orbit. Safe any number of times. */
  begin() {
    this._t = 0;
    this._active = true;
    return this;
  }

  /** Advance the orbit one frame. No camera / not active → no-op. */
  update(dt) {
    if (!this._active || !this._camera) return false;
    this._t += dt;
    const p = orbitPose(this._t, {
      center: this._center,
      radius: this._radius,
      height: this._height,
      startAngle: this._startAngle,
      rate: this._rate,
    });
    try {
      this._camera.position.set(p.x, p.y, p.z);
      this._camera.lookAt(this._center.x, 2, this._center.z);
    } catch { /* a camera that can't be posed can't crash a boot */ }
    return true;
  }

  /** Freeze the orbit. Game parks the camera at the player's eye after. */
  end() { this._active = false; }
}
