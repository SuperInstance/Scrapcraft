import * as THREE from 'three';

// Full day cycle = 6 real minutes (middle-schooler pace: enough to notice but not annoying)
const CYCLE = 360; // seconds

const TIMES = [
  // t(0–1), skyColor, fogColor, ambientColor, ambientInt, sunInt
  { t: 0.00, sky: 0x0a0a1e, fog: 0x0a0a1e, amb: 0x112244, aI: 0.15, sI: 0.0 }, // midnight
  { t: 0.20, sky: 0x1a1a3e, fog: 0x1a1a3e, amb: 0x224488, aI: 0.2,  sI: 0.1 }, // pre-dawn
  { t: 0.28, sky: 0xff6633, fog: 0xff8844, amb: 0xff8844, aI: 0.5,  sI: 0.6 }, // sunrise
  { t: 0.35, sky: 0x8aabbb, fog: 0x8aabbb, amb: 0xffeedd, aI: 0.6,  sI: 1.2 }, // morning
  { t: 0.50, sky: 0x6699cc, fog: 0x8aabbb, amb: 0xffffff, aI: 0.7,  sI: 1.4 }, // noon
  { t: 0.65, sky: 0x8aabbb, fog: 0x8aabbb, amb: 0xffeedd, aI: 0.6,  sI: 1.1 }, // afternoon
  { t: 0.75, sky: 0xff4422, fog: 0xff6633, amb: 0xff8844, aI: 0.5,  sI: 0.5 }, // sunset
  { t: 0.82, sky: 0x221133, fog: 0x110a22, amb: 0x332266, aI: 0.2,  sI: 0.05 }, // dusk
  { t: 1.00, sky: 0x0a0a1e, fog: 0x0a0a1e, amb: 0x112244, aI: 0.15, sI: 0.0 }, // midnight again
];

function lerpColor(a, b, t) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab_ = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb_ = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bb = Math.round(ab_ + (bb_ - ab_) * t);
  return (r << 16) | (g << 8) | bb;
}

function lerp(a, b, t) { return a + (b - a) * t; }

export class DayNight {
  constructor(scene, ambientLight, sunLight) {
    this.scene  = scene;
    this.amb    = ambientLight;
    this.sun    = sunLight;
    this._time  = 0.35; // start at morning
    this._stars = this._buildStars();
    scene.add(this._stars);
  }

  _buildStars() {
    const N = 300;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(Math.random() * 2 - 1);
      pos[i * 3]     = Math.sin(phi) * Math.cos(theta) * 90;
      pos[i * 3 + 1] = Math.abs(Math.cos(phi)) * 90 + 10;
      pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * 90;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  get timeOfDay() { return this._time; } // 0–1
  get isNight() { return this._time < 0.25 || this._time > 0.78; }
  get label() {
    const h = Math.round(this._time * 24);
    if (h < 5)  return 'Night';
    if (h < 8)  return 'Dawn';
    if (h < 12) return 'Morning';
    if (h < 14) return 'Midday';
    if (h < 18) return 'Afternoon';
    if (h < 20) return 'Dusk';
    return 'Night';
  }

  tick(dt) {
    this._time = (this._time + dt / CYCLE) % 1;
    const t = this._time;

    // Find surrounding keyframes
    let lo = TIMES[TIMES.length - 2], hi = TIMES[TIMES.length - 1];
    for (let i = 0; i < TIMES.length - 1; i++) {
      if (t >= TIMES[i].t && t < TIMES[i + 1].t) {
        lo = TIMES[i]; hi = TIMES[i + 1]; break;
      }
    }
    const f = (t - lo.t) / (hi.t - lo.t + 0.0001);

    const skyColor = lerpColor(lo.sky, hi.sky, f);
    this.scene.background = new THREE.Color(skyColor);
    this.scene.fog.color  = new THREE.Color(lerpColor(lo.fog, hi.fog, f));

    this.amb.color.set(new THREE.Color(lerpColor(lo.amb, hi.amb, f)));
    this.amb.intensity = lerp(lo.aI, hi.aI, f);
    this.sun.intensity = lerp(lo.sI, hi.sI, f);

    // Sun arc
    const angle = t * Math.PI * 2 - Math.PI / 2;
    this.sun.position.set(Math.cos(angle) * 50, Math.sin(angle) * 50 + 10, 20);

    // Stars visible at night
    const starAlpha = this.isNight ? Math.min(1, (this._time < 0.25 ? 1 - this._time / 0.25 : (this._time - 0.78) / 0.22)) : 0;
    this._stars.material.opacity = starAlpha;
    this._stars.material.transparent = true;
  }
}
