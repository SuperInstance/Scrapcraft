import * as THREE from 'three';

const SPEED      = 5.2;
const JUMP_VEL   = 6.5;
const GRAVITY    = -18;
const EYE_HEIGHT = 1.62;
const PLAYER_R   = 0.28;
const FRICTION   = 0.12; // horizontal velocity lerp per second (higher = snappier)

export class Player {
  constructor(camera, world) {
    this.camera  = camera;
    this.world   = world;
    this.pos     = new THREE.Vector3(8, 2, 5);
    this.vel     = new THREE.Vector3();
    this.yaw     = 0;
    this.pitch   = 0;
    this.onGround= false;

    this.hp     = 100;
    this.maxHp  = 100;
    this.onDamage = null;  // callback(hp) set by Game

    this._prevVelY = 0;

    this.inventory   = new Array(36).fill(null);
    this.hotbarIndex = 0;
    this.crafted     = new Set();

    this._keys   = {};
    this._locked = false;
    this._bobTime = 0;
    this._landBob = 0; // extra downward squish on land

    this._bindInput();
  }

  _bindInput() {
    document.addEventListener('keydown', e => {
      this._keys[e.code] = true;
      if (e.code === 'Space' && this.onGround) {
        const boost = this.hasTool('spring_boots') ? 2.5 : 1;
        this.vel.y = JUMP_VEL * boost;
        this.onGround = false;
      }
      const n = parseInt(e.code[5]);
      if (e.code.startsWith('Digit') && n >= 1 && n <= 9) this.hotbarIndex = n - 1;
    });
    document.addEventListener('keyup',  e => { this._keys[e.code] = false; });

    document.addEventListener('mousemove', e => {
      if (!this._locked) return;
      this.yaw   -= e.movementX * 0.0018;
      this.pitch  = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01,
        this.pitch - e.movementY * 0.0018));
    });
    document.addEventListener('pointerlockchange', () => {
      this._locked = !!document.pointerLockElement;
    });
  }

  get activeItem() { return this.inventory[this.hotbarIndex]; }

  get isMoving() {
    return this._locked && (
      this._keys['KeyW'] || this._keys['KeyS'] ||
      this._keys['KeyA'] || this._keys['KeyD']
    );
  }

  addItem(id, qty = 1) {
    const { ITEMS } = require?.('./data/items.js') ?? { ITEMS: {} };
    const maxStack = 64;
    let rem = qty;
    for (let i = 0; i < this.inventory.length && rem > 0; i++) {
      const s = this.inventory[i];
      if (s?.id === id && s.qty < maxStack) { const t = Math.min(maxStack - s.qty, rem); s.qty += t; rem -= t; }
    }
    for (let i = 0; i < this.inventory.length && rem > 0; i++) {
      if (!this.inventory[i]) { const t = Math.min(maxStack, rem); this.inventory[i] = { id, qty: t }; rem -= t; }
    }
    return rem;
  }

  removeItem(id, qty = 1) {
    if (this.countItem(id) < qty) return false;
    let need = qty;
    for (let i = this.inventory.length - 1; i >= 0 && need > 0; i--) {
      const s = this.inventory[i];
      if (!s || s.id !== id) continue;
      const t = Math.min(s.qty, need); s.qty -= t; need -= t;
      if (s.qty === 0) this.inventory[i] = null;
    }
    return true;
  }

  countItem(id) { return this.inventory.reduce((n, s) => n + (s?.id === id ? s.qty : 0), 0); }
  hasTool(id)   { return this.inventory.some(s => s?.id === id); }

  takeDamage(n) {
    this.hp = Math.max(0, this.hp - n);
    this.onDamage?.(this.hp);
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
    this.onDamage?.(this.hp);
  }

  tick(dt, world) {
    if (!this._locked) return;

    const fwd   = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3( Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want  = new THREE.Vector3();

    if (this._keys['KeyW']) want.add(fwd);
    if (this._keys['KeyS']) want.sub(fwd);
    if (this._keys['KeyA']) want.sub(right);
    if (this._keys['KeyD']) want.add(right);
    const sprinting = this._keys['ShiftLeft'] || this._keys['ShiftRight'];
    const speed = SPEED * (this.hasTool('go_kart') ? 3 : (this.fuelBoosted || sprinting) ? 1.8 : 1);
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(speed);

    // Smooth horizontal accel
    this.vel.x = THREE.MathUtils.lerp(this.vel.x, want.x, Math.min(1, dt / FRICTION));
    this.vel.z = THREE.MathUtils.lerp(this.vel.z, want.z, Math.min(1, dt / FRICTION));

    // Gravity
    const wasGround = this.onGround;
    const preVelY = this.vel.y;
    this.vel.y += GRAVITY * dt;

    const newPos = this.pos.clone().addScaledVector(this.vel, dt);
    this._resolveCollision(newPos, world);

    // Landing bounce + fall damage (>12 m/s = painful)
    if (!wasGround && this.onGround) {
      this._landBob = -0.06;
      if (preVelY < -12) {
        const dmg = Math.round((-preVelY - 12) * 4);
        this.takeDamage(dmg);
      }
    }

    // Camera bob
    const moving = this.isMoving && this.onGround;
    if (moving) {
      this._bobTime += dt * 7.5;
    } else {
      this._bobTime = Math.round(this._bobTime / Math.PI) * Math.PI; // snap to rest
    }
    this._landBob = THREE.MathUtils.lerp(this._landBob, 0, dt * 12);
    const bob = Math.sin(this._bobTime) * (moving ? 0.038 : 0) + this._landBob;

    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
    this.camera.position.set(this.pos.x, this.pos.y + EYE_HEIGHT + bob, this.pos.z);
  }

  _resolveCollision(newPos, world) {
    const R = PLAYER_R, H = 1.8;
    if (this._collidesBox(newPos.x, this.pos.y, this.pos.z, R, H, world)) {
      newPos.x = this.pos.x; this.vel.x = 0;
    }
    if (this._collidesBox(newPos.x, this.pos.y, newPos.z, R, H, world)) {
      newPos.z = this.pos.z; this.vel.z = 0;
    }
    if (this.vel.y < 0) {
      const gy = Math.floor(newPos.y);
      if (['x','z'].some(ax => [-R,R].some(d => {
        const p = { x: newPos.x, z: newPos.z };
        p[ax] += d;
        return world.isSolidAt(p.x, gy, p.z);
      }))) {
        newPos.y = gy + 1; this.vel.y = 0; this.onGround = true;
      } else { this.onGround = false; }
    } else if (this.vel.y > 0) {
      const headY = Math.ceil(newPos.y + H);
      if (world.isSolidAt(newPos.x, headY, newPos.z)) { newPos.y = headY - H - 0.01; this.vel.y = 0; }
      this.onGround = false;
    }
    this.pos.copy(newPos);
  }

  _collidesBox(x, y, z, R, H, world) {
    for (let cy = Math.floor(y); cy <= Math.floor(y + H); cy++) {
      for (const [dx, dz] of [[-R,-R],[-R,R],[R,-R],[R,R]]) {
        if (world.isSolidAt(x + dx, cy, z + dz)) return true;
      }
    }
    return false;
  }
}
