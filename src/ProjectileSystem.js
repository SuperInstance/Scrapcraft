import * as THREE from 'three';

const TYPES = {
  cannon: {
    speed: 18,       // blocks/s
    gravity: 0,
    radius: 0.12,
    color: 0xff7722,
    emissive: 0xff4400,
    splashRadius: 0,  // no splash — single block
    maxAge: 1.2,
  },
  grenade: {
    speed: 9,
    gravity: 7,      // arc trajectory
    radius: 0.18,
    color: 0x993300,
    emissive: 0xff2200,
    splashRadius: 2,  // mines 2-block radius ball
    maxAge: 2.0,
  },
};

export class ProjectileSystem {
  constructor(scene) {
    this.scene = scene;
    this._active = [];  // { mesh, x,y,z, vx,vy,vz, type, age, maxAge }
  }

  /**
   * Spawn a new projectile.
   * @param {{x,y,z}} origin
   * @param {{x,y,z}} dir  — unit vector
   * @param {string} type  — 'cannon' | 'grenade'
   */
  fire(origin, dir, type = 'cannon') {
    const def = TYPES[type];
    const geo  = new THREE.SphereGeometry(def.radius, 6, 6);
    const mat  = new THREE.MeshStandardMaterial({
      color:    def.color,
      emissive: def.emissive,
      emissiveIntensity: 1.0,
      roughness: 0.4,
      metalness: 0.6,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(origin.x, origin.y + 1.2, origin.z);
    this.scene.add(mesh);

    this._active.push({
      mesh,
      x: origin.x, y: origin.y + 1.2, z: origin.z,
      vx: dir.x * def.speed,
      vy: dir.y * def.speed + (type === 'grenade' ? 4 : 0),
      vz: dir.z * def.speed,
      type,
      age: 0,
      maxAge: def.maxAge,
      gravity: def.gravity,
      splashRadius: def.splashRadius,
    });
  }

  /**
   * Advance all projectiles. Calls onHit({ x,y,z, type, blocksDestroyed }) on collision.
   * @param {number} dt
   * @param {World} world
   * @param {function} onHit
   */
  tick(dt, world, onHit) {
    let i = this._active.length;
    while (i--) {
      const p = this._active[i];
      p.age += dt;

      // Gravity
      p.vy -= p.gravity * dt;

      // Move
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.mesh.position.set(p.x, p.y, p.z);

      // Spin (visual only)
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 6;

      const bx = Math.round(p.x), by = Math.round(p.y), bz = Math.round(p.z);
      const hit  = (by >= 0 && world.isSolidAt?.(p.x, p.y, p.z)) || p.y < 0;
      const aged = p.age >= p.maxAge;

      if (hit || aged) {
        this._remove(i);
        if (hit && onHit) {
          let destroyed = 0;
          if (p.splashRadius > 0) {
            // Splash — mine all solid blocks in sphere
            const R = p.splashRadius;
            for (let dy = -R; dy <= R; dy++) {
              for (let dz = -R; dz <= R; dz++) {
                for (let dx = -R; dx <= R; dx++) {
                  if (dx*dx + dy*dy + dz*dz > R*R) continue;
                  const tx = bx+dx, ty = Math.max(1, by+dy), tz = bz+dz;
                  if (world.getBlock(tx, ty, tz)) { world.mine(tx, ty, tz); destroyed++; }
                }
              }
            }
          } else {
            // Single block
            if (world.getBlock(bx, Math.max(1, by), bz)) { world.mine(bx, Math.max(1, by), bz); destroyed++; }
          }
          onHit({ x: bx, y: Math.max(1, by), z: bz, type: p.type, blocksDestroyed: destroyed });
        }
      }
    }
  }

  _remove(i) {
    const p = this._active[i];
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
    this.scene.remove(p.mesh);
    this._active.splice(i, 1);
  }

  dispose() {
    for (let i = this._active.length - 1; i >= 0; i--) this._remove(i);
  }
}
