import * as THREE from 'three';

/**
 * ScrapBot — your robot companion, built from the robot_helper recipe.
 * Follows the player around, highlights nearby resources, says funny things.
 */

const BOT_SPEED = 4.5;
const FOLLOW_DIST = 3;

const BOT_LINES = [
  '[BLEEP] I DETECT SCRAP NEARBY. PRIORITIZE SCRAP.',
  '[WHIRR] IRON SCRAP LOCATED. PERMISSION TO ASSIST?',
  '[BOOP] EARL SMELLS LIKE OIL. THIS IS NOT A COMPLAINT.',
  '[CALCULATING] 2 + 2 = CRAFTING TIME.',
  '[BLEEP] MY LOYALTY CHIP IS AT 98%. THE OTHER 2% IS SELF-PRESERVATION.',
  '[SCAN] AREA CONTAINS SUBOPTIMAL ORGANIZATION. INITIATING JUDGEMENT.',
  '[MOTOR NOISES] I AM NOT ON FIRE. DO NOT BE ALARMED.',
  '[WHIRR] DETECTING HUMAN INEFFICIENCY. AS USUAL.',
  '[BLOOP] IF I HAD A FACE, I WOULD BE SMILING. PROBABLY.',
  '[ALERT] CIRCUIT BOARD DETECTED. EMOTIONAL RESPONSE: EXCITEMENT.',
  '[BLEEP] QUERY: WHY IS THERE A RUBBER CHUNK IN THE FORGE? QUERY: NEVER MIND.',
  '[PROCESSING] MY DREAMS ARE MADE OF COPPER WIRE AND AMBITION.',
];

export class ScrapBot {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this._mesh = null;
    this._active = false;
    this._lineTimer = 0;
    this._lineInterval = 25 + Math.random() * 20;
    this._velocity = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._ui = null;
    this._glowTimer = 0;
    this._glowLight = null;
  }

  setUI(ui) { this._ui = ui; }

  activate(spawnPos) {
    if (this._active) return;
    this._active = true;
    this._pos.copy(spawnPos).add(new THREE.Vector3(1.5, 0, 0));
    this._buildMesh();
    this.speak('[BOOT SEQUENCE COMPLETE] SCRAP BOT ONLINE. GREETINGS, BIOLOGICAL UNIT.');
  }

  get isActive() { return this._active; }

  _buildMesh() {
    const group = new THREE.Group();

    const mat = (color, emissive = 0x000000) => new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: 0.4 });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.35), mat(0x7A8A9A));
    body.position.y = 0.8;
    group.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.35, 0.35), mat(0x8A9AAA));
    head.position.y = 1.25;
    group.add(head);

    // Eyes (emissive cyan)
    const eyeMat = mat(0x00FFFF, 0x00AAFF);
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
    eyeL.position.set(-0.1, 1.28, 0.175);
    group.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.set(0.1, 1.28, 0.175);
    group.add(eyeR);

    // Antenna
    const ant = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), mat(0xCCCCCC));
    ant.position.y = 1.55;
    group.add(ant);
    const antTip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mat(0xFF4400, 0xFF2200));
    antTip.position.y = 1.67;
    group.add(antTip);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.15, 0.45, 0.15);
    const armL = new THREE.Mesh(armGeo, mat(0x6A7A8A));
    armL.position.set(-0.35, 0.72, 0);
    group.add(armL);
    const armR = armL.clone();
    armR.position.set(0.35, 0.72, 0);
    group.add(armR);
    this._armL = armL; this._armR = armR;

    // Legs
    const legGeo = new THREE.BoxGeometry(0.16, 0.35, 0.16);
    const legL = new THREE.Mesh(legGeo, mat(0x5A6A7A));
    legL.position.set(-0.15, 0.28, 0);
    group.add(legL);
    const legR = legL.clone();
    legR.position.set(0.15, 0.28, 0);
    group.add(legR);
    this._legL = legL; this._legR = legR;

    group.position.copy(this._pos);
    group.castShadow = true;
    this._mesh = group;
    this.scene.add(group);

    // Glow light
    this._glowLight = new THREE.PointLight(0x00AAFF, 0.8, 3);
    group.add(this._glowLight);
  }

  speak(line) {
    this._ui?.notify(`🤖 ${line}`);
  }

  tick(dt, world) {
    if (!this._active || !this._mesh) return;

    // Follow player
    const target = this.player.pos.clone();
    const toTarget = target.clone().sub(this._pos);
    toTarget.y = 0;
    const dist = toTarget.length();

    if (dist > FOLLOW_DIST) {
      toTarget.normalize().multiplyScalar(BOT_SPEED * Math.min(1, (dist - FOLLOW_DIST + 1)));
      this._velocity.lerp(toTarget, 5 * dt);
    } else {
      this._velocity.multiplyScalar(0.9);
    }

    this._pos.addScaledVector(this._velocity, dt);
    // Stay on ground
    this._pos.y = 1;

    this._mesh.position.copy(this._pos);

    // Look at player
    const look = target.clone().sub(this._pos);
    if (look.length() > 0.1) {
      this._mesh.rotation.y = Math.atan2(look.x, look.z);
    }

    // Walking animation
    const walk = this._velocity.length() > 0.5;
    const swing = walk ? Math.sin(Date.now() * 0.008) * 0.3 : 0;
    this._legL.rotation.x = swing;
    this._legR.rotation.x = -swing;
    this._armL.rotation.x = -swing * 0.5;
    this._armR.rotation.x = swing * 0.5;

    // Glow pulse
    this._glowTimer += dt;
    this._glowLight.intensity = 0.6 + Math.sin(this._glowTimer * 2) * 0.2;

    // Random speech
    this._lineTimer += dt;
    if (this._lineTimer >= this._lineInterval) {
      this._lineTimer = 0;
      this._lineInterval = 20 + Math.random() * 30;
      const line = BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)];
      this.speak(line);
    }
  }
}
