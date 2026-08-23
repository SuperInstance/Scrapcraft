import * as THREE from 'three';

const MAX = 800;

const PRESETS = {
  mine:    { r:[1,0.5,0],    g:[0.6,0.3,0],    b:[0,0,0],      speed:3,   life:0.6, spread:0.4, gravity: 5 },
  pickup:  { r:[0.4,0.6,0],  g:[1,0.9,0.5],    b:[0.4,0.5,0],  speed:2,   life:0.5, spread:0.2, gravity: 2 },
  craft:   { r:[0.4,0.8,1],  g:[0.6,1,0.8],    b:[1,1,1],      speed:2.5, life:0.8, spread:0.5, gravity: 1 },
  ember:   { r:[1,0.8,0],    g:[0.3,0.2,0],    b:[0,0,0],      speed:1.5, life:1.0, spread:0.3, gravity:-1 },
  smoke:   { r:[0.5,0.5,0.5],g:[0.5,0.5,0.5],  b:[0.5,0.5,0.5],speed:0.5, life:2,   spread:0.2, gravity:-1 },
  track:   { r:[1,1,0.6],    g:[0.8,0.6,0.1],  b:[0,0,0],      speed:1,   life:0.3, spread:0.3, gravity: 6 },
  circuit: { r:[0,0.6,1],    g:[0.2,0.9,0.8],  b:[0.5,1,1],    speed:2,   life:0.6, spread:0.6, gravity: 0 },
  confetti:{ r:[1,0,0.5],    g:[0.8,1,0],      b:[0,0.6,1],    speed:3,   life:1.2, spread:0.8, gravity: 3 },
};

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this._particles = [];
    this._free = [];

    // Pre-allocate geometry
    this._positions = new Float32Array(MAX * 3);
    this._colors    = new Float32Array(MAX * 3);
    this._sizes     = new Float32Array(MAX);

    this._geo = new THREE.BufferGeometry();
    this._geo.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    this._geo.setAttribute('color',    new THREE.BufferAttribute(this._colors, 3));
    this._geo.setAttribute('size',     new THREE.BufferAttribute(this._sizes, 1));

    const mat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
    });

    this._points = new THREE.Points(this._geo, mat);
    this._points.frustumCulled = false;
    scene.add(this._points);

    // Pre-fill free list
    for (let i = 0; i < MAX; i++) {
      this._positions[i * 3 + 2] = 9999; // park far away
      this._free.push(i);
    }
  }

  _alloc() {
    return this._free.pop() ?? null;
  }

  _release(idx) {
    this._positions[idx * 3 + 2] = 9999;
    this._free.push(idx);
  }

  /**
   * Spawn a burst of particles at (x,y,z).
   * type: 'mine' | 'pickup' | 'craft' | 'ember' | 'smoke'
   */
  burst(x, y, z, type = 'mine', count = 12) {
    const p = PRESETS[type] ?? PRESETS.mine;

    for (let i = 0; i < count; i++) {
      const idx = this._alloc();
      if (idx === null) break;

      const t = Math.random();
      const cr = p.r[0] + (p.r[1] - p.r[0]) * t + (Math.random() - 0.5) * (p.r[2] ?? 0);
      const cg = p.g[0] + (p.g[1] - p.g[0]) * t + (Math.random() - 0.5) * (p.g[2] ?? 0);
      const cb = p.b[0] + (p.b[1] - p.b[0]) * t + (Math.random() - 0.5) * (p.b[2] ?? 0);

      const angle = Math.random() * Math.PI * 2;
      const elev  = Math.random() * Math.PI;
      const spd   = p.speed * (0.5 + Math.random() * 0.5);

      this._particles.push({
        idx,
        x: x + (Math.random() - 0.5) * 0.3,
        y: y + (Math.random() - 0.5) * 0.3,
        z: z + (Math.random() - 0.5) * 0.3,
        vx: Math.sin(elev) * Math.cos(angle) * spd * p.spread,
        vy: Math.abs(Math.cos(elev)) * spd + 1,
        vz: Math.sin(elev) * Math.sin(angle) * spd * p.spread,
        cr, cg, cb,
        life: p.life * (0.7 + Math.random() * 0.3),
        maxLife: p.life,
        gravity: p.gravity,
      });

      this._colors[idx * 3]     = cr;
      this._colors[idx * 3 + 1] = cg;
      this._colors[idx * 3 + 2] = cb;
      this._positions[idx * 3]     = x;
      this._positions[idx * 3 + 1] = y;
      this._positions[idx * 3 + 2] = z;
    }
  }

  tick(dt) {
    let i = 0;
    while (i < this._particles.length) {
      const p = this._particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this._release(p.idx);
        // Swap-remove: move last to this position
        this._particles[i] = this._particles[this._particles.length - 1];
        this._particles.pop();
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const alpha = p.life / p.maxLife;
      const ii = p.idx * 3;
      this._positions[ii]     = p.x;
      this._positions[ii + 1] = p.y;
      this._positions[ii + 2] = p.z;
      this._colors[ii]     = p.cr * alpha;
      this._colors[ii + 1] = p.cg * alpha;
      this._colors[ii + 2] = p.cb * alpha;
      i++;
    }

    this._geo.attributes.position.needsUpdate = true;
    this._geo.attributes.color.needsUpdate    = true;
  }
}
