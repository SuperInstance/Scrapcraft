import * as THREE from 'three';

function rand(min, max) { return min + Math.random() * (max - min); }

const DUR = {
  clear: [120, 240],
  rain:  [ 40,  90],
  storm: [ 25,  60],
};

export class WeatherSystem {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.state = 'clear';
    this._intensity       = 0;
    this._targetIntensity = 0;
    this._timer           = rand(...DUR.clear);
    this._thunderTimer    = 0;
    this._lightningFlash  = 0;
    this._changed         = false; // consumed by Game.js each frame

    // Rain point cloud
    const N = 1800;
    this._rainN   = N;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i*3]     = (Math.random()-0.5)*52;
      pos[i*3+1]   = Math.random()*24;
      pos[i*3+2]   = (Math.random()-0.5)*52;
    }
    this._rainPos = pos;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._rainGeo = geo;

    this._rainMat  = new THREE.PointsMaterial({
      color: 0xaaccff, size: 0.06, sizeAttenuation: true,
      transparent: true, opacity: 0,
    });
    this._rainMesh = new THREE.Points(geo, this._rainMat);
    this._rainMesh.frustumCulled = false;
    scene.add(this._rainMesh);
  }

  /** Normalized weather value: 0 = clear, ~0.65 = rain, 1.0 = storm */
  get intensityValue() { return this._intensity; }

  /**
   * Tick the weather.
   * Returns true the frame the state changes (so Game.js can fire Earl).
   */
  tick(dt, playerPos, ambientLight) {
    this._changed = false;

    // ── Countdown / state change ─────────────────────────────────────
    this._timer -= dt;
    if (this._timer <= 0) {
      const prev = this.state;
      if (this.state === 'clear') {
        this.state = Math.random() < 0.55 ? 'rain' : 'storm';
        this._timer = rand(...DUR[this.state]);
        this._targetIntensity = this.state === 'storm' ? 1.0 : 0.65;
      } else {
        this.state = 'clear';
        this._timer = rand(...DUR.clear);
        this._targetIntensity = 0;
      }
      if (this.state !== prev) {
        this._changed = true;
        if (this.state !== 'clear') this.audio?.rainStart?.();
        else                        this.audio?.rainStop?.();
      }
    }

    // ── Intensity lerp ───────────────────────────────────────────────
    const rate = this._intensity < this._targetIntensity ? 0.25 : 0.6;
    this._intensity += (this._targetIntensity - this._intensity) * Math.min(1, dt * rate);

    // ── Rain particle movement ───────────────────────────────────────
    this._rainMat.opacity = this._intensity * 0.55;
    if (this._intensity > 0.02) {
      const px = playerPos.x, pz = playerPos.z;
      const fallSpeed = 16 + this._intensity * 12;
      for (let i = 0; i < this._rainN; i++) {
        const b = i * 3;
        this._rainPos[b+1] -= dt * fallSpeed;
        if (this._rainPos[b+1] < 0
            || Math.abs(this._rainPos[b]   - px) > 28
            || Math.abs(this._rainPos[b+2] - pz) > 28) {
          this._rainPos[b]   = px + (Math.random()-0.5)*52;
          this._rainPos[b+1] = 22 + Math.random()*4;
          this._rainPos[b+2] = pz + (Math.random()-0.5)*52;
        }
      }
      this._rainGeo.attributes.position.needsUpdate = true;
    }

    // ── Thunder & lightning ──────────────────────────────────────────
    if (this.state === 'storm' && this._intensity > 0.4) {
      this._thunderTimer -= dt;
      if (this._thunderTimer <= 0) {
        this._thunderTimer   = rand(5, 14);
        this._lightningFlash = 1.0;
        this.audio?.thunder?.();
      }
    }
    if (this._lightningFlash > 0) {
      this._lightningFlash -= dt * 6;
      if (this._lightningFlash < 0) this._lightningFlash = 0;
      ambientLight.intensity += this._lightningFlash * 2.5;
    }

    return this._changed;
  }

  /** Imperatively set weather (e.g. for debug / Earl dialogue). */
  forceState(state) {
    const prev = this.state;
    this.state = state;
    this._targetIntensity = state === 'clear' ? 0 : state === 'storm' ? 1.0 : 0.65;
    this._timer = rand(...DUR[state]);
    this._thunderTimer = 0;
    return state !== prev;
  }
}
