import * as THREE from 'three';
import { MakerRuntime, GameWorldAdapter } from './maker/index.js';
import { EXAMPLE_WALL_AVOIDER } from './maker/TileProgram.js';

/**
 * ScrapBot — your robot companion, built from the robot_helper recipe.
 * Follows the player around in default mode; can be given a tile-program brain
 * via setBrain() to run autonomously.
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

    // Maker Lab brain
    this._runtime   = null;
    this._brainMode = false;
    this._game      = null;

    // Eye material refs for LED / neopixel colour changes
    this._eyeMat  = null;
    this._bodyMat = null;  // for neopixel body glow tint

    // Speech bubble state (read by Game.js for screen projection)
    this.speechText  = '';
    this._speechTimer = 0;
  }

  setUI(ui) { this._ui = ui; }

  /** Called from Game.init() — gives access to audio + particles. */
  setGame(game) { this._game = game; }

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

    // Body (store ref for neopixel tint)
    const bodyMat = mat(0x7A8A9A);
    this._bodyMat = bodyMat;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.35), bodyMat);
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
    this._eyeMat = eyeMat;   // store ref for LED tile colour changes

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

  /**
   * Load a tile program and switch to autonomous mode.
   * @param {TileProgram} program
   * @param {World}       world
   * @param {Player}      player
   * @param {DayNight}    dayNight  optional
   */
  setBrain(program, world, player, dayNight = null) {
    const spawn = {
      x: this._pos.x,
      z: this._pos.z,
      heading: this._mesh?.rotation.y ?? 0,
    };
    const adapter = new GameWorldAdapter(world, player, dayNight);
    this._runtime   = new MakerRuntime(program, spawn, adapter);
    this._brainMode = true;

    // Award XP for each distinct sensor type used in this program
    if (this._game?.xpSystem) {
      this._extractSensorIds(program.nodes ?? []).forEach(id =>
        this._game.xpSystem.trackSensor(id)
      );
    }

    if (this._runtime.errors.length) {
      this.speak(`[COMPILE ERROR] ${this._runtime.errors[0]}`);
    } else {
      this.speak(`[BRAIN LOADED] Running "${program.name || 'custom program'}".`);
    }
  }

  /** Recursively extract all sensor IDs referenced in condition tiles. */
  _extractSensorIds(nodes) {
    const ids = new Set();
    const scan = (node) => {
      if (node.cond?.sensor) ids.add(node.cond.sensor);
      ['body', 'elseBody'].forEach(k => (node[k] ?? []).forEach(scan));
    };
    nodes.forEach(scan);
    return ids;
  }

  /** Tint the bot's body/eyes with a custom accent color (for bot 2, etc.). */
  setBotColor(eyeHex, glowHex) {
    if (this._eyeMat) {
      this._eyeMat.color.setHex(eyeHex);
      this._eyeMat.emissive.setHex(glowHex);
    }
    if (this._glowLight) this._glowLight.color.setHex(glowHex);
  }

  /** Return to follow-player mode. */
  clearBrain() {
    this._brainMode = false;
    this._runtime   = null;
    this.speak('[BRAIN CLEARED] Back to following you around. Lucky you.');
  }

  tick(dt, world) {
    if (!this._active || !this._mesh) return;

    if (this._brainMode && this._runtime) {
      this._tickBrain(dt);
    } else {
      this._tickFollow(dt, world);
    }

    this._tickCommon(dt);
  }

  // ── Private tick methods ───────────────────────────────────────────────────

  _tickFollow(dt, world) {
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
    this._pos.y = 1;
    this._mesh.position.copy(this._pos);

    const look = target.clone().sub(this._pos);
    if (look.length() > 0.1) {
      this._mesh.rotation.y = Math.atan2(look.x, look.z);
    }

    const walk = this._velocity.length() > 0.5;
    const swing = walk ? Math.sin(Date.now() * 0.008) * 0.3 : 0;
    this._legL.rotation.x = swing;
    this._legR.rotation.x = -swing;
    this._armL.rotation.x = -swing * 0.5;
    this._armR.rotation.x = swing * 0.5;
  }

  _tickBrain(dt) {
    this._runtime.tick(dt);

    const r = this._runtime.robot;
    this._pos.set(r.x, 1, r.z);
    this._mesh.position.copy(this._pos);
    this._mesh.rotation.y = r.heading;

    // Walking animation when motors are running
    const moving = Math.abs(r.drivePower) > 0.05 || Math.abs(r.turnPower) > 0.05;
    const swing = moving ? Math.sin(Date.now() * 0.012) * 0.4 : 0;
    this._legL.rotation.x = swing;
    this._legR.rotation.x = -swing;

    for (const ev of this._runtime.drainEvents()) {
      this._handleEffect(ev);
    }
  }

  _tickCommon(dt) {
    this._glowTimer += dt;
    if (this._glowLight && !this._brainMode) {
      // Gentle cyan pulse in follow mode; brain mode controls glow directly
      this._glowLight.intensity = 0.6 + Math.sin(this._glowTimer * 2) * 0.2;
      this._glowLight.color.setHex(0x00AAFF);
    }
    if (this._speechTimer > 0) this._speechTimer -= dt;

    // Random speech only in follow mode; brain programs have their own moments
    if (!this._brainMode) {
      this._lineTimer += dt;
      if (this._lineTimer >= this._lineInterval) {
        this._lineTimer = 0;
        this._lineInterval = 20 + Math.random() * 30;
        this.speak(BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)]);
      }
    }
  }

  _handleEffect(ev) {
    switch (ev.kind) {
      case 'beep':
        this._game?.audio?.spark?.();
        break;
      case 'led':
        this._setEyeColor(ev.state);
        break;
      case 'grab':
        this._game?.particles?.burst(this._pos.x, 1, this._pos.z, 'pickup', 4);
        break;
      case 'speak':
        this.speechText   = `"${ev.phrase}"`;
        this._speechTimer = 2.5;
        this._game?.audio?.spark?.();
        break;
      case 'servo':
        // Tilt the head to reflect arm angle (0=closed=head down, 180=open=head up)
        if (this._mesh) {
          const head = this._mesh.children.find(c => c.position.y > 1.15 && c.position.y < 1.4);
          if (head) head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (ev.angle - 90) * 0.008, 0.3);
        }
        break;
      case 'neopixel':
        this._setNeopixelColor(ev.color);
        break;
    }
  }

  _setEyeColor(state) {
    const COLOURS = {
      off:   { color: 0x00FFFF, emissive: 0x00AAFF },
      red:   { color: 0xFF2200, emissive: 0xAA0000 },
      green: { color: 0x00FF44, emissive: 0x00AA22 },
      blue:  { color: 0x2244FF, emissive: 0x0022AA },
      white: { color: 0xFFFFFF, emissive: 0xAAAAAA },
    };
    const c = COLOURS[state] ?? COLOURS.off;
    if (!this._eyeMat) return;
    this._eyeMat.color.setHex(c.color);
    this._eyeMat.emissive.setHex(c.emissive);
  }

  _setNeopixelColor(colorName) {
    const HEX = {
      off: 0x000000, red: 0xff0000, orange: 0xff6400, yellow: 0xdcb400,
      green: 0x00c800, cyan: 0x00c8c8, blue: 0x0000ff, purple: 0x960096, white: 0xffffff,
    };
    const hex = HEX[colorName] ?? 0x00c800;
    if (this._bodyMat) {
      this._bodyMat.emissive.setHex(hex === 0 ? 0 : hex);
      this._bodyMat.emissiveIntensity = hex === 0 ? 0 : 0.9;
    }
    if (this._glowLight) {
      this._glowLight.color.setHex(hex === 0 ? 0x00aaff : hex);
      this._glowLight.intensity = hex === 0 ? 0.6 : 1.8;
    }
  }
}
