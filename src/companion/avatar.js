/**
 * ───────────────────────────────────────────────────────────────────────────
 *  RIVET AVATAR  —  a small floating voxel bot near the player
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Minimal but charming: Rivet is built from a handful of boxes (voxel style
 * to match the yard), bobs on an idle sine, turns to look at whatever the
 * player is looking at, reacts to mood (dismay dip on a crash, hop on loot),
 * and shows a pulsing speech dot while talking.
 *
 * The companion brain (Rivet.js) stays headless; this is the face.
 */

import * as THREE from 'three';

const COPPER = 0xd9843b;
const DARK   = 0x5a3a1e;
const TEAL   = 0x3ee8c8;

export class RivetAvatar {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'rivet';

    const mat = (color, emissive = 0x000000, ei = 0) =>
      new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei });

    // body — chunky little toolbox torso
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.34), mat(COPPER));
    body.position.y = 0;
    this.root.add(body);
    this.body = body;

    // head — smaller, slightly forward, with the eye
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.26), mat(0xc46a2a));
    head.position.set(0, 0.3, 0.03);
    this.root.add(head);
    this.head = head;

    // eye — one expressive lens (a Rivet tell: it's a repair drone, one eye)
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.02), mat(TEAL, TEAL, 1));
    eye.position.set(0, 0.32, 0.17);
    this.root.add(eye);
    this.eye = eye;

    // wing nubs
    for (const side of [-1, 1]) {
      const nub = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.18), mat(DARK));
      nub.position.set(side * 0.26, 0.02, 0);
      this.root.add(nub);
    }

    // antenna with a tiny light
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), mat(DARK));
    stem.position.set(0.08, 0.47, 0);
    this.root.add(stem);
    this.bulb = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), mat(TEAL, TEAL, 0.8));
    this.bulb.position.set(0.08, 0.56, 0);
    this.root.add(this.bulb);

    // speech indicator — the waveform dot
    this.speechDot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat(TEAL, TEAL, 1));
    this.speechDot.position.set(-0.16, 0.52, 0.1);
    this.speechDot.visible = false;
    this.root.add(this.speechDot);

    this._t = 0;
    this._hopT = 0;      // 1 → hop animation countdown
    this._dismayT = 0;   // 1 → dismay animation countdown
    this._talkingUntil = 0;

    scene.add(this.root);
  }

  /** Speech pulse for `ms` milliseconds (wired to Rivet.say). */
  setTalking(ms = 2500) { this._talkingUntil = this._t + ms / 1000; }

  /** One-shot reactions. */
  react(mood) {
    if (mood === 'happy') this._hopT = 0.6;
    else if (mood === 'dismay') this._dismayT = 0.9;
  }

  /**
   * Per-frame update.
   * @param {number} dt seconds
   * @param {{x:number,y:number,z:number}} playerPos
   * @param {number} playerYaw radians — Rivet looks where the player looks
   * @param {string} mood 'idle'|'happy'|'dismay'|'talking'
   */
  update(dt, playerPos, playerYaw, mood = 'idle') {
    this._t += dt;

    // hover position: trailing the player's right shoulder, gently
    const orbit = playerYaw + Math.PI + 0.9;   // slightly to the right-behind
    const radius = 1.15;
    const tx = playerPos.x + Math.sin(orbit) * radius;
    const tz = playerPos.z + Math.cos(orbit) * radius;
    const bob = Math.sin(this._t * 2.1) * 0.06;
    const ty = playerPos.y + 1.35 + bob;
    this.root.position.x += (tx - this.root.position.x) * Math.min(1, dt * 3.2);
    this.root.position.y += (ty - this.root.position.y) * Math.min(1, dt * 4.0);
    this.root.position.z += (tz - this.root.position.z) * Math.min(1, dt * 3.2);

    // look at what the player looks at (lead a little)
    const targetYaw = playerYaw + Math.PI;
    let dYaw = targetYaw - this.root.rotation.y;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    this.root.rotation.y += dYaw * Math.min(1, dt * 6);

    // mood animations
    let extraTilt = 0, extraY = 0, spin = 0;
    if (this._hopT > 0) {
      this._hopT -= dt;
      extraY = Math.sin((1 - this._hopT / 0.6) * Math.PI) * 0.22;
    }
    if (this._dismayT > 0) {
      this._dismayT -= dt;
      extraTilt = Math.sin((this._dismayT / 0.9) * Math.PI) * 0.5; // wobble-drop
      extraY = -0.08 * Math.sin((this._dismayT / 0.9) * Math.PI);
    }
    if (mood === 'happy' && this._hopT <= 0) spin = Math.sin(this._t * 9) * 0.02;
    this.root.rotation.z = extraTilt;
    this.root.position.y += extraY;
    this.root.rotation.y += spin;

    // speech dot — waveform pulse while talking
    const talking = mood === 'talking' || this._t < this._talkingUntil;
    this.speechDot.visible = talking;
    if (talking) {
      const pulse = 1 + Math.abs(Math.sin(this._t * 12)) * 0.8;
      this.speechDot.scale.setScalar(pulse);
      this.speechDot.position.y = 0.52 + Math.sin(this._t * 12) * 0.04;
    }

    // idle eye glow breathing
    this.eye.material.emissiveIntensity = talking ? 1.4 : 0.7 + Math.sin(this._t * 1.7) * 0.25;
  }

  dispose(scene) { scene.remove(this.root); }
}
