/**
 * ───────────────────────────────────────────────────────────────────────────
 *  AMBIENT LIFE  —  the yard between the beats
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The spine wakes one thing per chapter; Wakes are hours apart. Between
 * them the yard held its breath — minutes of nothing answering the kid.
 * AmbientLife is the small weather of the yard: distant crane creaks, a
 * bird startled off the piles, a stack light that flickers like it's
 * thinking, a gust that drags dust across the road, and once in a while
 * the yard cat crosses wherever she pleases.
 *
 * The contract (beta report, "the yard doesn't answer back"):
 *   - GENEROUS gaps: one event per 60–180s, randomized. Ambient is a
 *     texture, never a schedule the kid can set a watch by.
 *   - fail-soft: every playback path is optional-chained + try/catch —
 *     an ambient moment must never crash the yard. Headless (no scene,
 *     no audio) the scheduler still runs and reports events.
 *   - existing primitives only: ParticleSystem bursts, one pooled
 *     PointLight (born dark, moved never recompiled), synthesized
 *     AudioSystem sounds, DayNight/Weather for mood weighting.
 *     No new engines, no texture packing.
 *   - player-anchored: events spawn relative to the kid (offsets), so
 *     they work in every band without world queries.
 *
 * Day/night + weather shape the mix (cranes creak more at night, birds
 * only fly in daylight and dry weather, storms drag the wind out).
 */

import * as THREE from 'three';

/** One event per 60–180 real seconds — presence, not percussion. */
export const AMBIENT_GAP_S = [60, 180];

/**
 * The event registry. `weight` is the base draw weight; `nightMul`
 * multiplies it after dark; `stormBoost` multiplies it per unit of
 * weather intensity; `dayOnly` filters it out entirely at night.
 */
export const AMBIENT_EVENTS = [
  { id: 'crane_creak',   weight: 3,   nightMul: 1.6 },                 // the big crane groans in the dark
  { id: 'bird_flutter',  weight: 3,   dayOnly: true, calmOnly: true }, // something small leaves the piles
  { id: 'stack_flicker', weight: 2,   nightMul: 1.5 },                 // a stack light thinks about it
  { id: 'wind_gust',     weight: 2,   stormBoost: 3 },                 // dust crosses the road
  { id: 'cat_pass',      weight: 1.2 },                                // the yard cat, on yard business
];

/**
 * Companion reactions to ambient life — the cat is the shared citizen of
 * this yard; every soul has met her. delightLine-style per-persona bank
 * with a Rivet fallback. Tier-blind on purpose: noticing a cat is not a
 * privilege you earn.
 */
export const AMBIENT_LINES = {
  cat_pass: {
    rivet: 'The cat! That\'s the cat. She has a route. We\'ve compared notes — her route is better.',
    bolt:  'There goes the boss. Not Earl. The other boss. The one with the whiskers.',
    magma: 'Ah — the little queen passes. Bow your head, dear one. She accepts respect, and occasionally bolts.',
    juno:  'CAT! CAT CAT CAT. Okay. Playing it cool. WE ARE PLAYING IT SO COOL. …cat.',
  },
  crane_creak: {
    rivet: 'Hear that? The old crane stretching. It does that when it dreams. Probably about loads.',
    bolt:  'Crane\'s creaking again. Means the wind\'s up past the towers. Loose scrap first, corners second.',
    magma: 'The great crane sighs, little builder. Even the tall ones need to stretch. Remember that.',
    juno:  'Was that the CRANE? It TALKS! In creak! We only know a few words of creak but we\'re FLUENT-adjacent!',
  },
};

/** The right reaction line for an ambient event in a companion's voice. */
export function ambientLine(eventId, personaId = 'rivet') {
  const bank = AMBIENT_LINES[eventId];
  if (!bank) return null;
  return bank[personaId] ?? bank.rivet ?? null;
}

/** Events the companion may verbally notice (cat + the singing crane). */
export const AMBIENT_NOTABLE = new Set(['cat_pass', 'crane_creak']);

function rand(rng, [lo, hi]) { return lo + rng() * (hi - lo); }

export class AmbientLife {
  /**
   * All deps optional — headless/testing passes none and the scheduler
   * still reports fires (fail-soft by construction).
   * @param {object} [opts]
   * @param {object} [opts.scene]       THREE.Scene-like ({add, remove})
   * @param {object} [opts.audio]       AudioSystem-like
   * @param {object} [opts.particles]   ParticleSystem-like
   * @param {object} [opts.dayNight]    DayNight-like (isNight)
   * @param {object} [opts.weather]     WeatherSystem-like (intensityValue)
   * @param {() => number} [opts.rng]
   */
  constructor(opts = {}) {
    this.scene     = opts.scene ?? null;
    this.audio     = opts.audio ?? null;
    this.particles = opts.particles ?? null;
    this.dayNight  = opts.dayNight ?? null;
    this.weather   = opts.weather ?? null;
    this.rng       = opts.rng ?? Math.random;

    this._timer = rand(this.rng, AMBIENT_GAP_S);
    this._fired = [];                                     // ids this session (tests/introspection)

    // one pooled PointLight for the stack flicker — born dark, never added
    // or removed again (no shader recompiles mid-play). Fail-soft: no
    // scene → no light, the flicker degrades to particles only.
    this._light = null;
    this._lightScene = null;
    try {
      if (this.scene) {
        this._light = new THREE.PointLight(0xffb266, 0, 18, 2);
        this.scene.add(this._light);
        this._lightScene = this.scene;
      }
    } catch { this._light = null; }

    // transient event states
    this._flicker = null;   // { t, dur, x, y, z }
    this._cat     = null;   // { mesh, t, dur, from, to }
  }

  /** Elapsed-event helper for tests. */
  fired() { return [...this._fired]; }

  /** Effective draw weight of an event given the yard's mood. */
  weightOf(ev) {
    const night = this.dayNight?.isNight ?? false;
    const intensity = this.weather?.intensityValue ?? 0;
    if (ev.dayOnly && night) return 0;
    if (ev.calmOnly && intensity > 0.25) return 0;        // no birds fly in rain
    let w = ev.weight;
    if (night && ev.nightMul) w *= ev.nightMul;
    if (ev.stormBoost) w *= 1 + ev.stormBoost * intensity;
    return w;
  }

  _pickEvent() {
    const pool = AMBIENT_EVENTS.map(ev => ({ ev, w: this.weightOf(ev) })).filter(e => e.w > 0);
    if (!pool.length) return null;
    const total = pool.reduce((a, e) => a + e.w, 0);
    let roll = this.rng() * total;
    for (const e of pool) {
      roll -= e.w;
      if (roll <= 0) return e.ev;
    }
    return pool[pool.length - 1].ev;
  }

  /**
   * Tick the yard's small life. Returns `{ id }` the frame an event fires
   * (so the game can route companion reactions), else null.
   * @param {number} dt seconds
   * @param {{x:number,y:number,z:number}} [playerPos]
   */
  tick(dt, playerPos = { x: 0, y: 0, z: 0 }) {
    this._tickFlicker(dt);
    this._tickCat(dt);

    this._timer -= dt;
    if (this._timer > 0) return null;
    this._timer = rand(this.rng, AMBIENT_GAP_S);

    const ev = this._pickEvent();
    if (!ev) return null;
    try {
      this['_play_' + ev.id]?.(playerPos);
    } catch { /* ambient life never crashes the yard */ }
    this._fired.push(ev.id);
    return { id: ev.id };
  }

  // ── the events ─────────────────────────────────────────────────────────

  /** Distant crane creak — audio only, the sound of something huge turning over. */
  _play_crane_creak() {
    this.audio?.craneCreak?.();
  }

  /** A bird leaves the piles: chirp + a small pickup-colored burst above a stack. */
  _play_bird_flutter(p) {
    const a = this.rng() * Math.PI * 2;
    const r = 9 + this.rng() * 7;
    const x = p.x + Math.cos(a) * r;
    const z = p.z + Math.sin(a) * r;
    const y = Math.max(2, p.y) + 2 + this.rng() * 3;
    this.particles?.burst(x, y, z, 'pickup', 5);
    this.audio?.birdChirp?.();
  }

  /** A stack light flickers like a thought — pooled light + a few embers. */
  _play_stack_flicker(p) {
    const a = this.rng() * Math.PI * 2;
    const r = 7 + this.rng() * 8;
    const x = p.x + Math.cos(a) * r;
    const z = p.z + Math.sin(a) * r;
    const y = Math.max(2, p.y) + 3 + this.rng() * 2;
    this._flicker = { t: 0, dur: 1.6 + this.rng(), x, y, z, seed: this.rng() * 10 };
    this.particles?.burst(x, y, z, 'ember', 3);
  }

  _tickFlicker(dt) {
    const f = this._flicker;
    if (!f) return;
    f.t += dt;
    if (f.t >= f.dur || !this._light) {
      if (this._light) this._light.intensity = 0;
      this._flicker = null;
      return;
    }
    // strobe-ish: sharp stutters, gaps, a bright catch — like a dying fluorescent
    const phase = Math.sin((f.t * 22) + f.seed) * Math.sin((f.t * 7.3) + f.seed * 2);
    this._light.position.set(f.x, f.y, f.z);
    this._light.intensity = Math.max(0, phase) * 1.8;
  }

  /** A gust drags dust across the road + a wind swell. */
  _play_wind_gust(p) {
    const dir = this.rng() * Math.PI * 2;
    const dx = Math.cos(dir), dz = Math.sin(dir);
    for (let i = 0; i < 4; i++) {
      const along = -6 + i * 3.5 + this.rng() * 2;
      const side = (this.rng() - 0.5) * 6;
      this.particles?.burst(
        p.x + dx * along - dz * side,
        Math.max(1, p.y) + 0.6 + this.rng() * 1.2,
        p.z + dz * along + dx * side,
        'smoke', 5,
      );
    }
    this.audio?.windGust?.();
  }

  /**
   * The yard cat crosses the road — a flat dark silhouette (two boxes and
   * a tail, primitives only) slipping between the stacks, gone in ~7s.
   */
  _play_cat_pass(p) {
    if (!this.scene || this._cat) return;
    try {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.22, 0.18),
        new THREE.MeshBasicMaterial({ color: 0x14161a }),
      );
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.16, 0.16),
        new THREE.MeshBasicMaterial({ color: 0x14161a }),
      );
      head.position.set(0.33, 0.12, 0);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, 0.34),
        new THREE.MeshBasicMaterial({ color: 0x14161a }),
      );
      tail.position.set(-0.32, 0.08, 0.05);
      const cat = new THREE.Group();
      cat.add(body, head, tail);
      cat.position.y = 0.12;

      // a straight-ish crossing, 10–16 blocks out, perpendicular-ish to view
      const heading = this.rng() * Math.PI * 2;
      const dist = 10 + this.rng() * 6;
      const cx = p.x + Math.cos(heading) * dist;
      const cz = p.z + Math.sin(heading) * dist;
      const dx = Math.cos(heading + Math.PI / 2);
      const dz = Math.sin(heading + Math.PI / 2);
      const half = 3.5 + this.rng() * 2;
      const dur = 6 + this.rng() * 2.5;
      cat.position.set(cx - dx * half, Math.max(0.12, p.y - 1.4), cz - dz * half);
      cat.lookAt(cx + dx * half, cat.position.y, cz + dz * half);
      this.scene.add(cat);
      this._cat = { mesh: cat, t: 0, dur, from: { x: cx - dx * half, z: cz - dz * half }, to: { x: cx + dx * half, z: cz + dz * half }, bobSeed: this.rng() * 9 };
      this.audio?.catMew?.();
    } catch { /* no cat today — the yard goes on */ }
  }

  _tickCat(dt) {
    const c = this._cat;
    if (!c) return;
    c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    if (k >= 1 || !c.mesh) {
      try { this.scene?.remove?.(c.mesh); } catch { /* already gone */ }
      this._cat = null;
      return;
    }
    const e = k * k * (3 - 2 * k);  // smoothstep: she isn't racing
    const x = c.from.x + (c.to.x - c.from.x) * e;
    const z = c.from.z + (c.to.z - c.from.z) * e;
    c.mesh.position.x = x;
    c.mesh.position.z = z;
    // a low prowl bob + the tail forever moving
    c.mesh.position.y += Math.sin(c.t * 9 + c.bobSeed) * 0.0015;
    c.mesh.children[2] && (c.mesh.children[2].rotation.x = Math.sin(c.t * 5 + c.bobSeed) * 0.5);
  }
}
