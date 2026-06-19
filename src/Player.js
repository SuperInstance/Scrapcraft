import * as THREE from 'three';
import { BLOCK_DEF } from './data/blocks.js';
import { getItem } from './data/items.js';

const SPEED = 5;
const JUMP_VEL = 6;
const GRAVITY = -16;
const EYE_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.3;

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;

    this.pos = new THREE.Vector3(8, 2, 8);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;

    // Inventory: 36 slots { id, qty } | null
    this.inventory = new Array(36).fill(null);
    // Hotbar is slots 0-8
    this.hotbarIndex = 0;

    // Crafted items unlock tracker
    this.crafted = new Set();

    // Keys held
    this._keys = {};
    this._locked = false;

    this._bindInput();
  }

  _bindInput() {
    document.addEventListener('keydown', e => {
      this._keys[e.code] = true;
      if (e.code === 'Space' && this.onGround) this.vel.y = JUMP_VEL;
      // hotbar 1-9
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code[5]) - 1;
        if (n >= 0 && n <= 8) this.hotbarIndex = n;
      }
    });
    document.addEventListener('keyup', e => { this._keys[e.code] = false; });

    document.addEventListener('mousemove', e => {
      if (!this._locked) return;
      this.yaw   -= e.movementX * 0.002;
      this.pitch -= e.movementY * 0.002;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    });

    document.addEventListener('pointerlockchange', () => {
      this._locked = !!document.pointerLockElement;
    });
  }

  lock() { this.camera.domElement?.requestPointerLock?.(); }
  unlock() { document.exitPointerLock?.(); }

  lockPointer() {
    document.getElementById('game-canvas').requestPointerLock();
  }

  get activeItem() {
    return this.inventory[this.hotbarIndex];
  }

  /** Add items to inventory. Returns leftover count. */
  addItem(id, qty = 1) {
    const def = getItem(id);
    const maxStack = def?.stackSize ?? 64;
    let remaining = qty;

    // Try to fill existing stacks first
    for (let i = 0; i < this.inventory.length && remaining > 0; i++) {
      const slot = this.inventory[i];
      if (slot?.id === id && slot.qty < maxStack) {
        const room = maxStack - slot.qty;
        const take = Math.min(room, remaining);
        slot.qty += take;
        remaining -= take;
      }
    }
    // Open slots
    for (let i = 0; i < this.inventory.length && remaining > 0; i++) {
      if (!this.inventory[i]) {
        const take = Math.min(maxStack, remaining);
        this.inventory[i] = { id, qty: take };
        remaining -= take;
      }
    }
    return remaining; // leftover (inventory full)
  }

  /** Remove items. Returns true if successful. */
  removeItem(id, qty = 1) {
    let need = qty;
    // Count available
    const have = this.countItem(id);
    if (have < need) return false;
    for (let i = this.inventory.length - 1; i >= 0 && need > 0; i--) {
      const slot = this.inventory[i];
      if (!slot || slot.id !== id) continue;
      const take = Math.min(slot.qty, need);
      slot.qty -= take;
      need -= take;
      if (slot.qty === 0) this.inventory[i] = null;
    }
    return true;
  }

  countItem(id) {
    return this.inventory.reduce((s, slot) => s + (slot?.id === id ? slot.qty : 0), 0);
  }

  hasTool(toolId) {
    return this.inventory.some(s => s?.id === toolId);
  }

  tick(dt, world) {
    if (!this._locked) return;

    // Movement direction relative to camera yaw
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right   = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move    = new THREE.Vector3();

    if (this._keys['KeyW']) move.add(forward);
    if (this._keys['KeyS']) move.sub(forward);
    if (this._keys['KeyA']) move.sub(right);
    if (this._keys['KeyD']) move.add(right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(SPEED);

    // Gravity
    this.vel.y += GRAVITY * dt;
    this.vel.x = move.x;
    this.vel.z = move.z;

    // Integrate position with simple AABB collision
    const newPos = this.pos.clone().addScaledVector(this.vel, dt);
    this._resolveCollision(newPos, world);

    // Camera
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
    this.camera.position.set(this.pos.x, this.pos.y + EYE_HEIGHT, this.pos.z);
  }

  _resolveCollision(newPos, world) {
    const R = PLAYER_RADIUS;
    const H = 1.8;

    // Test X
    let testX = newPos.clone(); testX.x = newPos.x;
    if (this._collidesBox(testX.x, this.pos.y, this.pos.z, R, H, world)) {
      newPos.x = this.pos.x;
      this.vel.x = 0;
    }
    // Test Z
    let testZ = newPos.clone();
    if (this._collidesBox(newPos.x, this.pos.y, newPos.z, R, H, world)) {
      newPos.z = this.pos.z;
      this.vel.z = 0;
    }
    // Test Y
    if (this.vel.y < 0) {
      // Falling – check ground
      const groundY = Math.floor(newPos.y);
      if (world.isSolidAt(newPos.x - R, groundY, newPos.z - R) ||
          world.isSolidAt(newPos.x + R, groundY, newPos.z - R) ||
          world.isSolidAt(newPos.x - R, groundY, newPos.z + R) ||
          world.isSolidAt(newPos.x + R, groundY, newPos.z + R)) {
        newPos.y = groundY + 1;
        this.vel.y = 0;
        this.onGround = true;
      } else {
        this.onGround = false;
      }
    } else if (this.vel.y > 0) {
      const headY = Math.ceil(newPos.y + H);
      if (world.isSolidAt(newPos.x, headY, newPos.z)) {
        newPos.y = headY - H - 0.01;
        this.vel.y = 0;
      }
      this.onGround = false;
    }

    this.pos.copy(newPos);
  }

  _collidesBox(x, y, z, R, H, world) {
    for (let cy = Math.floor(y); cy <= Math.floor(y + H); cy++) {
      if (world.isSolidAt(x - R, cy, z - R)) return true;
      if (world.isSolidAt(x + R, cy, z - R)) return true;
      if (world.isSolidAt(x - R, cy, z + R)) return true;
      if (world.isSolidAt(x + R, cy, z + R)) return true;
    }
    return false;
  }
}
