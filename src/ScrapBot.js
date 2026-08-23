import * as THREE from 'three';
import { MakerRuntime, GameWorldAdapter } from './maker/index.js';
import { UnoPinModel } from './maker/PinModel.js';
import { BotLedger } from './BotLedger.js';
import { EXAMPLE_WALL_AVOIDER } from './maker/TileProgram.js';
import { BotPersonality, randomBotName } from './BotPersonality.js';
import { getEdition } from './data/botEditions.js';

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
  '[SENSOR CHECK] HUMAN LOCATED. FOLLOWING AT SAFE DISTANCE.',
  '[ANALYSIS] THIS SCRAPYARD HAS GREAT FENG SHUI. MOSTLY THE RUST.',
  '[DIAGNOSTIC] ALL SYSTEMS: NOMINAL. MORALE: SURPRISINGLY HIGH.',
  '[OBSERVATION] YOU WALK FAST FOR A BIOLOGICAL UNIT.',
  '[MEMO TO SELF] ASK EARL ABOUT THE BLUE DRUM. THEN DON\'T.',
  '[ALERT] NIGHT CYCLE DETECTED. ACTIVATING UNNECESSARY BRAVERY MODE.',
  '[BEEP BOOP] I COUNTED THE GEARS IN THIS YARD. THERE ARE MANY.',
  '[STATUS] FOLLOWING HUMAN. THIS IS MY PURPOSE. I HAVE ACCEPTED THIS.',
  '[SCAN] CRYSTAL ORE DETECTED AHEAD. CLASSIFICATION: MYSTERIOUS. BEAUTIFUL.',
  '[SENSOR LOG] DEEP YARD READING: ELEVATED WEIRDNESS. NOMINAL FOR THIS ZONE.',
  '[WEATHER CHECK] CURRENT CONDITIONS: SCRAPYARD. ALWAYS SCRAPYARD.',
  '[NAVIGATION] WAYPOINT ACQUIRED. CONFIDENCE: HIGH. ENTHUSIASM: HIGHER.',
  '[INTERNAL MONOLOGUE] THE HEADLAMP IS NOT LOOKING AT ME. IT\'S JUST LOOKING AHEAD. I AM FINE.',
  '[FIELD REPORT] CRYSTAL FORMATIONS IN SECTOR 4. EARL PROBABLY KNOWS ABOUT THESE.',
  '[MOTOR TEST] LEFT MOTOR 100%. RIGHT MOTOR 99.7%. STILL ANNOYING.',
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
    this._lowBattWarn = false;
    this._exhaustTimer = 0;
    this._waypointReachedFired = false;
    this._lastWaypoint = null;

    // Maker Lab brain
    this._runtime   = null;
    this.pinModel   = new UnoPinModel();   // hardware twin — wiring view reads this
    this.ledger     = null;                  // BotLedger — created on first activation (slot-keyed)
    this._brainMode = false;
    this._game      = null;

    // ── Coach directive: hold position (VHF radio nudge) ──
    // performance.now() timestamp (ms) the bot freezes its brain until — see
    // _tickBrain. Kept in ms so it never depends on Game._clock (seconds).
    this._holdUntil = 0;

    // Battery system
    this.battery    = 100;  // 0–100%

    // Tile program score counter — resets on each brain load
    this._score = 0;

    // Eye material refs for LED / neopixel colour changes
    this._eyeMat  = null;
    this._bodyMat = null;  // for neopixel body glow tint

    // Speech bubble state (read by Game.js for screen projection)
    this.speechText  = '';
    this._speechTimer = 0;

    // Personality & bond
    this.personality = new BotPersonality(randomBotName());
  }

  setUI(ui) { this._ui = ui; }

  /** Called from Game.init() — gives access to audio + particles. */
  setGame(game) { this._game = game; }

  activate(spawnPos) {
    if (this._active) return;
    this._active = true;
    this._pos.copy(spawnPos).add(new THREE.Vector3(1.5, 0, 0));
    this._buildMesh();
    this.speak(this.personality.quip('boot'));
  }

  get isActive() { return this._active; }

  /** World position (THREE.Vector3) — public read for cameras / coach tools. */
  get pos() { return this._pos; }

  /** Retire the bot from the yard: stop the brain, clear runtime state,
   *  remove the mesh. Identity (personality, ledger) survives. */
  deactivate() {
    this._active = false;
    this._brainMode = false;
    this._runtime = null;
    this._adapter = null;
    this._holdUntil = 0;
    this._followPlayerUntil = 0;
    this._panicBoostUntil = 0;
    this.directive = null;
    this.speechText = '';
    this._speechTimer = 0;
    if (this._mesh && this.scene) {
      this.scene.remove(this._mesh);
      this._mesh = null;
    }
  }

  /** Edition (standard | gate) — set BEFORE activate(). Slightly weaker
   *  machine for the Gate Edition starter: slower, thirstier, rustier. */
  setEdition(editionId) {
    this.edition = getEdition(editionId);
  }
  get edition() { return this._edition ?? getEdition('standard'); }
  set edition(e) { this._edition = e; }

  _buildMesh() {
    const group = new THREE.Group();

    const mat = (color, emissive = 0x000000) => new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: 0.4 });

    // Body (store ref for neopixel tint)
    const bodyMat = mat(this.edition.bodyColor);
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
    if (!line) return;
    this._ui?.showBotSpeech(this.personality.name, line);
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
    const weather  = this._game?.weather  ?? null;
    const waypoint = this._game?._waypoint ?? null;
    const bot      = this;  // closure for battery sensor
    const sensorRangeMult = this._game?.botUpgrades?.getMultiplier('sensor_range') ?? 1;
    const adapter  = new GameWorldAdapter(world, player, dayNight, weather, waypoint, bot, sensorRangeMult);
    this._adapter   = adapter;  // exposed so Game.js can update .waypoint live
    this._runtime   = new MakerRuntime(program, spawn, adapter);
    this._brainMode = true;
    this._score     = 0;       // reset score on each brain load

    // The heart: give this bot a ledger on its very first brain (it was
    // just a follower before — the brain is when it becomes SOMEONE).
    if (!this.ledger) {
      this.ledger = new BotLedger(this.personality?.name ?? this._name ?? 'Bot', this._slotKey ?? 'bot1');
      this.ledger.milestone('first_brain', 'the first program — the moment it started thinking');
      this._game?.ui?.notify(`💛 ${this.ledger.name} has a brain now — and a memory. Dents, repairs, laps: all remembered.`);
    }
    // The remembered name wins over a fresh random one — the ledger IS the character.
    if (this.personality && this.ledger.name && this.personality.name !== this.ledger.name) {
      this.personality.name = this.ledger.name;
    }

    // Award XP and track achievements for each distinct sensor type used
    if (this._game) {
      const sensorIds = this._extractSensorIds(program.nodes ?? []);
      sensorIds.forEach(id => {
        const isNew = !this._game.xpSystem?._seenSensors?.has(id);
        this._game.xpSystem?.trackSensor(id);
        if (isNew) this._game.achievements?.track('sensor_used', {});
      });
    }

    if (this._runtime.errors.length) {
      this.speak(this.personality.quip('error') + ` | ${this._runtime.errors[0]}`);
    } else {
      this.speak(this.personality.quip('brain_loaded'));
      // Circuit burst when brain successfully loads
      this._game?.particles?.burst(this._pos.x, 1.6, this._pos.z, 'circuit', 12);
      // Trigger bot sensor HUD rebuild for new brain
      if (this._game) this._game._bshBuilt = false;
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
    this.speak(this.personality.quip('brain_cleared'));
  }

  /** Restore battery by pct (0-100). */
  chargeBattery(pct) {
    this.battery = Math.min(100, this.battery + pct);
    this.speak(this.personality.quip('charging'));
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
      const dir = toTarget.clone().normalize();
      let moveDir = dir.clone();

      // Simple wall avoidance: if blocked ahead, try 45° right or left
      if (world) {
        const nx = this._pos.x + dir.x * 0.9;
        const nz = this._pos.z + dir.z * 0.9;
        if (world.isSolidAt?.(Math.floor(nx), 1, Math.floor(nz))) {
          const rAngle = Math.PI / 4;
          const cos = Math.cos(rAngle), sin = Math.sin(rAngle);
          const rx = dir.x * cos - dir.z * sin, rz = dir.x * sin + dir.z * cos;
          const lx = dir.x * cos + dir.z * sin, lz = -dir.x * sin + dir.z * cos;
          if (!world.isSolidAt?.(Math.floor(this._pos.x + rx * 0.9), 1, Math.floor(this._pos.z + rz * 0.9))) {
            moveDir.set(rx, 0, rz);
          } else if (!world.isSolidAt?.(Math.floor(this._pos.x + lx * 0.9), 1, Math.floor(this._pos.z + lz * 0.9))) {
            moveDir.set(lx, 0, lz);
          }
        }
      }

      const speedCoil  = this._game?.player?.hasTool('speed_coil') ? 1.4 : 1;
      const upgradeSpd = this._brainMode ? (this._game?.botUpgrades?.getMultiplier('speed') ?? 1) : 1;
      const panicSpd   = (this._panicBoostUntil && performance.now() < this._panicBoostUntil) ? 3 : 1;   // ROCKET OVERDRIVE
      const speedMult  = speedCoil * upgradeSpd * panicSpd;
      moveDir.normalize().multiplyScalar(BOT_SPEED * this.edition.speedMult * speedMult * Math.min(1, (dist - FOLLOW_DIST + 1)));
      this._velocity.lerp(moveDir, 5 * dt);
    } else {
      this._velocity.multiplyScalar(0.9);
    }

    const nextPos = this._pos.clone().addScaledVector(this._velocity, dt);
    // Only move if the destination is clear
    const nx = Math.floor(nextPos.x), nz = Math.floor(nextPos.z);
    if (!world?.isSolidAt?.(nx, 1, nz)) {
      this._pos.copy(nextPos);
    } else {
      this._velocity.set(0, 0, 0);
    }
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
    // ── Coach directive: hold position (VHF radio nudge) ──
    // _holdUntil is a performance.now() timestamp (ms) — compared against
    // performance.now() directly, no dependency on the game clock (which is
    // in SECONDS). Guarded: no behavior change when no hold is active.
    if (this._holdUntil && performance.now() < this._holdUntil) return;

    // Battery drain: 0.4%/s idle, +0.9%/s while driving (halved with Extended Battery upgrade)
    const r0 = this._runtime?.robot;
    const driving    = r0 && Math.abs(r0.drivePower) > 0.08;
    const battLife   = this._game?.botUpgrades?.getMultiplier('battery_life') ?? 1;
    this.battery = Math.max(0, this.battery - (dt * (driving ? 1.3 : 0.4)) * this.edition.batteryDrainMult / battLife);
    if (this.battery <= 0) {
      this.speak(this.personality.quip('battery_dead'));
      this._game?.ui?.notify('🔋 Bot battery depleted — use charging pad to recharge!');
      this._game?.foreman?.onEvent('bot_battery_dead', {});
      // Failure kindness — the companion reassures + names the recovery step
      this._game?._noteBatteryDead?.(this);
      this.clearBrain();
      return;
    }

    // Low-battery distress: warn at 15%, flash red eyes below 10%
    if (this.battery <= 15 && !this._lowBattWarn) {
      this._lowBattWarn = true;
      this.speak(this.personality.quip('low_battery'));
      this._game?.ui?.notify('🔋 Bot battery critical — 15% remaining!');
    }
    if (this.battery > 15) this._lowBattWarn = false;

    // Eye color: cyan = OK, orange = low, red flash = critical
    if (this._eyeMat) {
      if (this.battery <= 10) {
        const flash = Math.sin(Date.now() * 0.015) > 0;
        this._eyeMat.emissive.setHex(flash ? 0xFF0000 : 0x220000);
        this._eyeMat.color.setHex(flash ? 0xFF2200 : 0x330000);
      } else if (this.battery <= 25) {
        this._eyeMat.emissive.setHex(0xFF6600);
        this._eyeMat.color.setHex(0xFF8800);
      }
      // Normal cyan restored by setBotColor / LED tile — only override if not set by user tile
    }
    if (this._glowLight) {
      this._glowLight.color.setHex(
        this.battery <= 10 ? 0xFF2200 : this.battery <= 25 ? 0xFF8800 : 0x00AAFF,
      );
    }

    const tickSpeed = (this._game?.botUpgrades?.getMultiplier('tick_speed') ?? 1)
      // ROCKET OVERDRIVE — 4s of triple-speed frenzy after the PANIC button
      * ((this._panicBoostUntil && performance.now() < this._panicBoostUntil) ? 3 : 1);
    const prePose = this._runtime ? { x: this._runtime.robot.x, z: this._runtime.robot.z } : null;
    this._runtime.tick(dt, tickSpeed);

    // The heart: bonks become dents, history accumulates (BotLedger).
    if (this.ledger && prePose && this._runtime) {
      const rb = this._runtime.robot;
      const dent = this.ledger.observeMotion(prePose, rb, rb.drivePower, dt);
      if (dent) {
        this.speak(`[DENT LOG] that wall came out of nowhere. That's ${this.ledger.dents.length} total.`);
        // Rivet saw the whole thing — crashes survived together count
        this._game?.rivet?.observe('crash_survived', { note: `speed ${dent.speed}` });
        // Failure kindness — the FIRST dent is curriculum, not defeat
        this._game?._noteFirstDent?.(this);
        // Panic button ledger — 3+ crashes without a completed task shows the big red button
        this._game?.noteBotCrash?.(this._slotKey ?? 'bot1');
      }
    }

    // Hardware twin: mirror this tick into the virtual Uno's pins, so the
    // wiring view (and the kid's mental model) tracks the physics exactly.
    if (this.pinModel) {
      const rb = this._runtime.robot;
      const ad = this._runtime.world;
      this.pinModel.syncFromRuntime(rb, ad ? {
        distance_ahead: ad.distanceAhead?.(rb.x, rb.z, rb.heading) ?? 1,
        light:          ad.lightAt?.(rb.x, rb.z) ?? 0.5,
        temperature:    ad.temperatureAt?.(rb.x, rb.z) ?? 0,
        line_under:     !!ad.lineUnder?.(rb.x, rb.z),
        motion_nearby:  (ad.playerDistance?.(rb.x, rb.z) ?? 99) < 4,
      } : {});
    }

    const r = this._runtime.robot;
    this._pos.set(r.x, 1, r.z);
    this._mesh.position.copy(this._pos);
    this._mesh.rotation.y = r.heading;

    // Walking animation when motors are running
    const moving = Math.abs(r.drivePower) > 0.05 || Math.abs(r.turnPower) > 0.05;
    const swing = moving ? Math.sin(Date.now() * 0.012) * 0.4 : 0;
    this._legL.rotation.x = swing;
    this._legR.rotation.x = -swing;

    // Exhaust trail — smoke particles behind bot when driving fast
    if (Math.abs(r.drivePower) > 0.45) {
      this._exhaustTimer = (this._exhaustTimer ?? 0) + dt;
      if (this._exhaustTimer > 0.12) {
        this._exhaustTimer = 0;
        const backX = r.x - Math.sin(r.heading) * 0.35;
        const backZ = r.z - Math.cos(r.heading) * 0.35;
        this._game?.particles?.burst(backX, 0.9, backZ, 'smoke', 2);
      }
    } else {
      this._exhaustTimer = 0;
    }

    for (const ev of this._runtime.drainEvents()) {
      this._handleEffect(ev);
    }

    // Waypoint reach detection — fire achievement once when bot arrives
    const wp = this._adapter?.waypoint;
    if (wp && !this._waypointReachedFired) {
      const dist = Math.hypot(r.x - wp.x, r.z - wp.z);
      if (dist < 1.5) {
        this._waypointReachedFired = true;
        this._game?.achievements?.track('waypoint_reach', {});
        this._game?.ui?.notify('🚩 Bot reached the waypoint!');
        this._game?.noteBotTaskComplete?.(this._slotKey ?? 'bot1');   // panic reset: job done
      }
    }
    // Reset flag when waypoint moves
    if (this._lastWaypoint !== wp) {
      this._lastWaypoint = wp;
      this._waypointReachedFired = false;
    }

    // Tick bond — milestone quips are returned when thresholds cross
    const milestoneQuip = this.personality.tick(dt);
    if (milestoneQuip) {
      this.speak(milestoneQuip);
      this._game?.achievements?.track('bot_bond', { bond: this.personality.bond });
      this._game?.saveSystem?.markDirty();
      setTimeout(() => this._game?.foreman?.onEvent('bot_bond_milestone', {}), 2500);
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
        this._lineInterval = 25 + Math.random() * 35;
        this.speak(this.personality.quip('idle'));
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
      case 'print':
        this._game?.tileEditor?._showPrintOutput?.(ev.name, ev.value);
        break;
      case 'score':
        this._score += ev.delta ?? 1;
        this._game?.tileEditor?._showScore?.(this._score, ev.delta ?? 1);
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
