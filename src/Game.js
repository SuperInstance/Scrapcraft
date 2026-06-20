import * as THREE from 'three';
import { World } from './World.js';
import { Renderer } from './Renderer.js';
import { Player } from './Player.js';
import { Foreman } from './Foreman.js';
import { UI } from './UI.js';
import { CraftingSystem } from './systems/CraftingSystem.js';
import { ParticleSystem } from './ParticleSystem.js';
import { AudioSystem } from './AudioSystem.js';
import { DayNight } from './DayNight.js';
import { Achievements } from './Achievements.js';
import { ScrapBot } from './ScrapBot.js';
import { BLOCK_DEF, B, ITEM_TO_BLOCK } from './data/blocks.js';
import { getItem } from './data/items.js';
import { EXAMPLE_WALL_AVOIDER, EXAMPLE_LINE_FOLLOWER } from './maker/TileProgram.js';
import { TileEditor } from './TileEditor.js';
import { SaveSystem } from './SaveSystem.js';
import { XPSystem } from './XPSystem.js';
import { WeatherSystem } from './WeatherSystem.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this._running = false;
    this._lastTime = 0;

    // Hold-to-mine state
    this._mineDown    = false;
    this._mineTarget  = null;   // { x, y, z }
    this._mineProgress = 0;     // 0..1

    // UX state
    this._lastNearStation = null;
    this._lastBandIndex   = -1;
    this._idleTimer       = 0;
    this._ambientTimer    = 0;
  }

  init() {
    this.world    = new World(128, 128, 10);
    this.world.generate(1337);

    this.renderer = new Renderer(this.canvas);
    this.renderer.rebuildMeshes(this.world);

    // Translucent ghost block shown when hovering a placement target
    this._ghostMat  = new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.4, depthWrite: false });
    this._ghostMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this._ghostMat);
    this._ghostMesh.visible = false;
    this.renderer.scene.add(this._ghostMesh);

    this.player = new Player(this.renderer.camera, this.world);
    this.player.pos.set(8, 2, 5);

    this.dayNight = new DayNight(this.renderer.scene, this.renderer.ambientLight, this.renderer.sunLight);
    this.particles = new ParticleSystem(this.renderer.scene);
    this.audio = new AudioSystem();

    this.achievements = new Achievements();
    this.achievements.on('unlock', id => this.ui?.onAchievement(id));

    this.foreman = new Foreman(this);

    this.ui = new UI(this);
    this.foreman.setUI(this.ui);

    this.craftingSystem = new CraftingSystem(this.player, this.foreman);

    this.xpSystem = new XPSystem();

    this.scrapBot = new ScrapBot(this.renderer.scene, this.player);
    this.scrapBot.setUI(this.ui);
    this.scrapBot.setGame(this);

    // Second bot — spawned at Level 5 (Engineer) via Shift+B
    this.scrapBot2 = null;

    this.weather = new WeatherSystem(this.renderer.scene, this.audio);
    // Expose weather to bot world adapters — updated by setGame() in ScrapBot
    this._weatherForBots = this.weather;

    this.tileEditor = new TileEditor(this);
    this.saveSystem = new SaveSystem(this);

    this.world.on('change', () => this.renderer.rebuildMeshes(this.world));

    // Speech bubble elements (screen-projected world-space)
    this._speechEl1 = document.getElementById('bot-speech-1');
    this._speechEl2 = document.getElementById('bot-speech-2');

    // Help overlay
    this._helpOverlay = document.getElementById('help-overlay');
    document.getElementById('help-close')?.addEventListener('click', () => this._toggleHelp(false));

    // Minimap
    this._minimapCtx   = document.getElementById('minimap')?.getContext('2d') ?? null;
    this._minimapTimer = 0;

    // Item use (G key) state
    this._fuelBoostTimer = 0;   // seconds remaining on fuel_can speed boost

    // Lap timer — tracks bots crossing the TRACK circuit start/finish gate (z≈14, x=30-46)
    this._lapState = {
      inGate:    false,
      lapStart:  0,
      bestMs:    Infinity,
      lapsEl:    document.getElementById('lap-timer'),
    };

    this._bindInput();

    // Load saved state — if none, show first-time greeting
    const loaded = this.saveSystem.load();
    if (!loaded) setTimeout(() => this.foreman.greet(), 1200);
    else         setTimeout(() => this.foreman.say('idle'), 1200);

    this.ui.updateHotbar(this.player);
  }

  _bindInput() {
    document.addEventListener('keydown', e => {
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && document.pointerLockElement) {
        this.audio.sprint();
      }
      if (e.code === 'KeyG' && document.pointerLockElement && !this.ui.isOpen) {
        this._useActiveItem();
      }
      if (e.code === 'KeyE') {
        if (this.ui.isOpen) { this.ui.closeInventory(); return; }
        const p = this.player.pos;
        const nearby = this.world.getNearbyInteractives(p.x, p.y, p.z, 3);
        this.ui.openInventory(nearby[0]?.station ?? 'any');
      }
      if (e.code === 'KeyT') {
        if (this.tileEditor.isOpen) { this.tileEditor.close(); }
        else { this.tileEditor.open(this._getBrainTier()); }
        return;
      }
      if (e.code === 'F5') { e.preventDefault(); this.saveSystem.save(); }
      if (e.code === 'F9') { e.preventDefault(); this.saveSystem.load(); }
      if (e.code === 'KeyF') {
        const msg = prompt('Talk to Big Earl:') ?? '';
        if (msg) this.foreman.playerTalks(msg);
        else this.foreman.say('idle');
      }
      if (e.code === 'Escape') {
        if (this.ui.isOpen) this.ui.closeInventory();
        else this._toggleHelp(false);
      }
      if (e.code === 'KeyH' && !this.ui.isOpen && !this.tileEditor.isOpen) this._toggleHelp();
      if (e.code === 'KeyR' && document.pointerLockElement) {
        this.player.pos.set(8, 2, 5);
        this.player.vel?.set(0, 0, 0);
        this.player.yaw = 0;
        this.ui.notify('🏁 Respawned at the yard gate.');
      }
      if (e.code === 'KeyM') this.audio.toggle();
      if (e.code === 'KeyB') {
        if (e.shiftKey) {
          // Shift+B → second bot (requires Level 5 Engineer skill)
          if (!this.xpSystem.hasSkill('engineer')) {
            this.ui.notify('⚙️ Engineer skill (Level 5) required for a second bot.');
          } else if (!this.player.hasTool('robot_helper') || this.player.countItem('robot_helper') < 2) {
            this.ui.notify('Craft a second robot_helper to run two bots.');
          } else {
            this._toggleBot2();
          }
        } else if (this.scrapBot.isActive) {
          if (this.scrapBot._brainMode) {
            this.scrapBot.clearBrain();
          } else {
            this.scrapBot.setBrain(EXAMPLE_WALL_AVOIDER, this.world, this.player, this.dayNight);
            this.achievements.track('program_run', {});
            this.xpSystem.gain(15);
          }
        }
      }
    });

    // Hold-to-mine: track button state, do work in update loop
    this.canvas.addEventListener('mousedown', e => {
      if (e.button === 0) this._mineDown = true;
    });
    this.canvas.addEventListener('mouseup', e => {
      if (e.button === 0) { this._mineDown = false; this._cancelMine(); }
    });
    this.canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (!document.pointerLockElement || this.ui.isOpen) return;
      this._tryPlace();
    });

    // Pointer lock: show/hide pause overlay
    document.addEventListener('pointerlockchange', () => {
      const locked = !!document.pointerLockElement;
      if (this._running) this.ui.setPaused(!locked);
    });

    // Click-to-resume on pause overlay
    document.getElementById('pause-overlay')?.addEventListener('click', () => {
      if (!document.pointerLockElement) this.canvas.requestPointerLock();
    });
  }

  // ── Mining ───────────────────────────────────────────────────────────

  _updateMine(dt) {
    const target = this.renderer.getTargetBlock(this.world);
    if (!target) { this._cancelMine(); return; }
    const { x, y, z } = target;
    if (y === 0) { this._cancelMine(); return; }
    const id = this.world.getBlock(x, y, z);
    if (id === B.AIR) { this._cancelMine(); return; }

    // Reset progress if target changed
    if (!this._mineTarget || this._mineTarget.x !== x || this._mineTarget.y !== y || this._mineTarget.z !== z) {
      this._mineTarget  = { x, y, z };
      this._mineProgress = 0;
    }

    const hardness = BLOCK_DEF[id]?.hardness ?? 0.5;
    this._mineProgress += dt / hardness;

    // Tell renderer to show crack overlay
    this.renderer.setTargetBlock(x, y, z, this._mineProgress);
    this.ui.setMineProgress(this._mineProgress);

    // Tick sound on first frame
    if (this._mineProgress <= dt / hardness + 0.01) this.audio.mine(id);

    if (this._mineProgress >= 1) {
      this._completeMine(x, y, z, id);
      this._cancelMine();
    }
  }

  _completeMine(x, y, z, id) {
    this.world.mine(x, y, z);
    this.audio.mine(id);
    this.particles.burst(x, y, z, 'mine', 10);

    const def = BLOCK_DEF[id];
    if (!def) return;
    const isNight = this.dayNight.isNight;

    const giveLoot = (drop) => {
      if (!drop) return;
      const leftover = this.player.addItem(drop, 1);
      if (!leftover) {
        const item = getItem(drop);
        this.ui.notify(`+ ${item?.icon ?? ''} ${item?.name ?? drop}`);
        this.audio.pickup();
        this.particles.burst(x, y + 0.5, z, 'pickup', 6);
        this.achievements.track('mine', { isNight, item: drop });
        this.xpSystem.gain(2);
        this.foreman.onEvent(`mine_${drop}`, {});
      }
    };
    if (def.drop    && Math.random() < def.dropChance)    giveLoot(def.drop);
    if (def.altDrop && Math.random() < def.altDropChance) giveLoot(def.altDrop);
    // Magnet passive: bonus drop for metallic blocks
    const METAL_BLOCKS = new Set([B.SCRAP_PILE, B.RUST_METAL, B.CLEAN_METAL, B.WALL_METAL]);
    if (this.player.hasTool('scrap_magnet') && METAL_BLOCKS.has(id) && def.drop && Math.random() < 0.6) {
      giveLoot(def.drop);
    }

    this.achievements.track('mine', { isNight });
    this.xpSystem.gain(1);
    this.saveSystem.markDirty();
    this.achievements.track('inventory', {
      fill: this.player.inventory.filter(Boolean).length / 36,
    });
    this.ui.updateHotbar(this.player);
  }

  _cancelMine() {
    this._mineTarget   = null;
    this._mineProgress = 0;
    this.renderer.setTargetBlock(null);
    this.ui.setMineProgress(0);
  }

  _tryPlace() {
    const target = this.renderer.getTargetBlock(this.world);
    if (!target) return;
    const { face } = target;
    const px = target.x + Math.round(face.x);
    const py = target.y + Math.round(face.y);
    const pz = target.z + Math.round(face.z);
    if (py < 1 || py >= this.world.height) return;

    const activeItem = this.player.activeItem;
    if (!activeItem) return;
    const blockId = ITEM_TO_BLOCK[activeItem.id];
    if (!blockId) return;

    // Prevent placing inside the player's body
    const pp = this.player.pos;
    const R  = 0.3;
    if (px + 0.5 > pp.x - R && px - 0.5 < pp.x + R &&
        pz + 0.5 > pp.z - R && pz - 0.5 < pp.z + R &&
        py + 0.5 > pp.y      && py - 0.5 < pp.y + 1.8) return;

    if (this.world.place(px, py, pz, blockId)) {
      this.player.removeItem(activeItem.id, 1);
      const item = getItem(activeItem.id);
      this.ui.notify(`Placed ${item?.icon ?? ''} ${item?.name ?? activeItem.id}`);
      if (blockId === B.FLOODLIGHT) this.audio.floodOn(); else this.audio.place();
      this.particles.burst(px, py + 0.5, pz, 'pickup', 4);
      this.achievements.track('place', { blockId: activeItem.id });
      this.xpSystem.gain(2);
      this.saveSystem.markDirty();
      this.ui.updateHotbar(this.player);
    }
  }

  _toggleHelp(forceState) {
    const show = forceState !== undefined ? forceState : !this._helpOverlay?.classList.contains('show');
    this._helpOverlay?.classList.toggle('show', show);
    if (show && document.pointerLockElement) document.exitPointerLock();
  }

  _toggleBot2() {
    if (!this.scrapBot2) {
      this.scrapBot2 = new ScrapBot(this.renderer.scene, this.player);
      this.scrapBot2.setGame(this);
      // Spawn left and behind player; activate() adds +1.5 to x, so offset accordingly
      const p = this.player.pos;
      this.scrapBot2.activate({ x: p.x - 3, y: p.y, z: p.z });
      // Orange eyes to distinguish from bot 1
      setTimeout(() => this.scrapBot2.setBotColor(0xFF8C00, 0xFF6400), 200);
      this.ui.notify('🤖 Second bot activated! Press Shift+B again to give it a brain.');
    } else if (!this.scrapBot2._brainMode) {
      this.scrapBot2.setBrain(EXAMPLE_WALL_AVOIDER, this.world, this.player, this.dayNight);
      this.xpSystem.gain(15);
      this.achievements.track('program_run', {});
    } else {
      this.scrapBot2.clearBrain();
    }
  }

  /** Returns the highest brain tier the player has in their inventory. */
  _getBrainTier() {
    const inv = this.player.inventory;
    if (inv.some(s => s?.id === 'vision_brain')) return 'vision';
    if (inv.some(s => s?.id === 'spark_brain'))  return 'spark';
    if (inv.some(s => s?.id === 'tin_brain'))    return 'tin';
    return 'tin'; // default — always get basic tile access
  }

  onCraft(recipeId, output, qty) {
    const isNew = !this.achievements.stats.crafted.has(output);
    this.achievements.track('craft', { id: output });
    this.xpSystem.gain(isNew ? 10 : 3);
    this.saveSystem.markDirty();
    this.audio.craft();
    this.particles.burst(
      this.player.pos.x, this.player.pos.y + 1, this.player.pos.z, 'craft', 18,
    );
    if (output === 'robot_helper' && !this.scrapBot.isActive) {
      setTimeout(() => this.scrapBot.activate(this.player.pos), 1000);
    }
  }

  onQuestComplete() {
    this.achievements.track('quest', {});
    this.xpSystem.gain(25);
    this.audio.questComplete();
  }

  start() {
    this._running = true;
    this._lastTime = performance.now();
    this._loop();
  }

  _loop() {
    if (!this._running) return;
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt  = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;
    this._update(dt);
    this._render(dt);
  }

  _update(dt) {
    // Fuel boost timer
    if (this._fuelBoostTimer > 0) {
      this._fuelBoostTimer -= dt;
      this.player.fuelBoosted = this._fuelBoostTimer > 0;
    } else {
      this.player.fuelBoosted = false;
    }

    this.player.tick(dt, this.world);
    this.dayNight.tick(dt);

    // Weather
    const weatherChanged = this.weather.tick(dt, this.player.pos, this.renderer.ambientLight);
    if (weatherChanged) {
      const evtName = `weather_${this.weather.state}`;
      this.foreman.onEvent(evtName, {});
      this.ui.setWeather(this.weather.state, this.weather.intensityValue);
    }

    // Auto-respawn if player falls off the world
    if (this.player.pos.y < -5) {
      this.player.pos.set(8, 2, 5);
      this.player.vel?.set(0, 0, 0);
      this.ui.notify('🏁 Respawned at the yard gate.');
      this.foreman.onEvent('player_die', {});
    }

    // Night goggles: boost ambient light at night
    if (this.player.hasTool('night_goggles') && this.dayNight.isNight) {
      this.renderer.ambientLight.intensity = Math.min(0.6,
        this.renderer.ambientLight.intensity + 0.4);
    }
    // Grapple hook: extends mining / targeting reach
    this.renderer.raycaster.far = this.player.hasTool('grapple_hook') ? 10 : 6;
    this.particles.tick(dt);
    this.achievements.tick(dt);

    // Drain newly unlocked skills → level-up toast + Earl quip
    for (const skill of this.xpSystem.drainNewSkills()) {
      this.ui?.showLevelUp(this.xpSystem.level, skill);
      setTimeout(() => this.foreman.sayLine(skill.earlQuip), 2200);
    }
    // Update XP bar (skill badge shows highest unlocked skill name)
    const lastSkillId = [...this.xpSystem.skills].at(-1);
    const lastSkillName = lastSkillId ? lastSkillId.toUpperCase() : '';
    this.ui?.setXP(this.xpSystem.level, this.xpSystem.progress, lastSkillName);

    this.scrapBot.tick(dt, this.world);
    if (this.scrapBot2) this.scrapBot2.tick(dt, this.world);

    this._tickLapTimer();
    this._tickBotTrackSparks(dt);

    // Speech bubble projection
    this._updateSpeechBubble(this.scrapBot,  this._speechEl1);
    this._updateSpeechBubble(this.scrapBot2, this._speechEl2);

    this.audio.tick(dt, this.player, this.world);
    this.saveSystem.tick(dt);

    const locked = !!document.pointerLockElement;

    // Hold-to-mine
    if (this._mineDown && !this.ui.isOpen && locked) {
      this._updateMine(dt);
    } else if (this._mineTarget) {
      this._cancelMine();
    }

    // Block label + crosshair state
    const target = this.renderer.getTargetBlock(this.world);
    if (!this.ui.isOpen && locked) {
      const id = target ? this.world.getBlock(target.x, target.y, target.z) : null;
      this.ui.setBlockLabel(id);
      const interactive = !!(id && BLOCK_DEF[id]?.interactive);
      this.ui.setCrosshairState(this.player.isMoving, interactive, this._mineProgress);
      // Show selection box on targeted block (not mining crack — that's done in _updateMine)
      if (target && !this._mineDown) this.renderer.setTargetBlock(target.x, target.y, target.z, 0);
      else if (!this._mineDown)      this.renderer.setTargetBlock(null);
    } else {
      this.ui.setBlockLabel(null);
      this.ui.setCrosshairState(false, false, 0);
      if (!this._mineDown) this.renderer.setTargetBlock(null);
    }

    // Ghost block placement preview
    {
      const activeItem = this.player.activeItem;
      const blockId    = activeItem ? ITEM_TO_BLOCK[activeItem.id] : null;
      const tgt        = (!this.ui.isOpen && locked) ? this.renderer.getTargetBlock(this.world) : null;
      if (blockId && tgt) {
        const face = tgt.face;
        const px = tgt.x + Math.round(face.x);
        const py = tgt.y + Math.round(face.y);
        const pz = tgt.z + Math.round(face.z);
        if (this.world.getBlock(px, py, pz) === B.AIR && py >= 1) {
          this._ghostMesh.position.set(px, py, pz);
          this._ghostMat.color.setHex(BLOCK_DEF[blockId]?.color ?? 0xaaddff);
          this._ghostMesh.visible = true;
        } else {
          this._ghostMesh.visible = false;
        }
      } else {
        this._ghostMesh.visible = false;
      }
    }

    // Band entry detection → toast
    const bandIdx = this.world.getBandIndex(Math.floor(this.player.pos.z));
    if (bandIdx !== this._lastBandIndex) {
      if (this._lastBandIndex >= 0) {
        this.ui.showZoneToast(this.world.getBandName(Math.floor(this.player.pos.z)));
      }
      this._lastBandIndex = bandIdx;
    }

    // Nearby station hint
    const p = this.player.pos;
    const nearby = this.world.getNearbyInteractives(p.x, p.y, p.z, 2.5);
    const nearStation = nearby[0]?.station ?? null;
    if (nearStation !== this._lastNearStation) {
      this._lastNearStation = nearStation;
      if (nearStation) this.foreman.onEvent(`near_${nearStation}`, {});
    }

    // Zone + time HUD
    this.ui.setZone(this.world.getBandName(Math.floor(p.z)), this.dayNight.label);

    // Quest progress
    if (this.foreman._activeQuest) {
      this.ui.updateQuestProgress(this.foreman._activeQuest, this.player);
    }

    // Near track hint — fire once when player enters the test circuit area
    if (!this._nearTrackSeen) {
      const px2 = p.x, pz2 = p.z;
      if (px2 >= 28 && px2 <= 48 && pz2 >= 12 && pz2 <= 25) {
        this._nearTrackSeen = true;
        this.foreman.onEvent('near_track', {});
      }
    }

    // Idle prod
    if (locked) {
      this._idleTimer += dt;
      if (this._idleTimer > 55) { this._idleTimer = 0; this.foreman.say('idle'); }
    }

    // Forge embers
    this._ambientTimer += dt;
    if (this._ambientTimer > 3 + Math.random() * 4) {
      this._ambientTimer = 0;
      const fNearby = this.world.getNearbyInteractives(p.x, p.y, p.z, 8);
      for (const s of fNearby) {
        if (s.station === 'forge' || s.station === 'smelter') {
          this.particles.burst(s.x, s.y + 0.5, s.z, 'ember', 4);
          this.audio.spark();
        }
      }
    }

    this.ui.updateHotbar(this.player);

    // Update floodlight positions
    this.renderer.updateFloodlights(this.world._placedBlocks, this.player.pos, B.FLOODLIGHT);

    // Minimap — refresh every 0.5 s
    this._minimapTimer += dt;
    if (this._minimapTimer >= 0.5) { this._minimapTimer = 0; this._updateMinimap(); }
  }

  _updateMinimap() {
    const ctx = this._minimapCtx;
    if (!ctx) return;

    const SIZE   = 96;   // canvas px
    const RADIUS = 48;   // half-side in world blocks
    const px = Math.floor(this.player.pos.x);
    const pz = Math.floor(this.player.pos.z);
    const img = ctx.createImageData(SIZE, SIZE);

    // Block-id → [r,g,b] derived from BLOCK_DEF.color hex
    const colorOf = (id) => {
      if (!id) return [20, 20, 20];
      const c = BLOCK_DEF[id]?.color ?? 0x444444;
      return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
    };

    for (let dz = 0; dz < SIZE; dz++) {
      for (let dx = 0; dx < SIZE; dx++) {
        const wx = px - RADIUS + dx;
        const wz = pz - RADIUS + dz;
        // Sample topmost block (y = 3 down to 0)
        let id = 0;
        for (let y = 3; y >= 0; y--) {
          const b = this.world.getBlock(wx, y, wz);
          if (b) { id = b; break; }
        }
        const [r, g, b] = colorOf(id);
        const i = (dz * SIZE + dx) * 4;
        img.data[i]   = r; img.data[i+1] = g;
        img.data[i+2] = b; img.data[i+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Player dot (white)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(RADIUS - 1, RADIUS - 1, 3, 3);

    // Bot 1 dot (cyan)
    if (this.scrapBot?.isActive) {
      const bx = Math.floor(this.scrapBot._pos.x) - px + RADIUS;
      const bz = Math.floor(this.scrapBot._pos.z) - pz + RADIUS;
      if (bx >= 0 && bx < SIZE && bz >= 0 && bz < SIZE) {
        ctx.fillStyle = '#00ccff';
        ctx.fillRect(bx - 1, bz - 1, 3, 3);
      }
    }
    // Bot 2 dot (orange)
    if (this.scrapBot2?.isActive) {
      const bx = Math.floor(this.scrapBot2._pos.x) - px + RADIUS;
      const bz = Math.floor(this.scrapBot2._pos.z) - pz + RADIUS;
      if (bx >= 0 && bx < SIZE && bz >= 0 && bz < SIZE) {
        ctx.fillStyle = '#ff8c00';
        ctx.fillRect(bx - 1, bz - 1, 3, 3);
      }
    }
    // Landmark dots (yellow) — workbench / forge / smelter
    for (const key of ['workbench', 'forge', 'smelter']) {
      const lm = this.world.landmarks?.[key];
      if (!lm) continue;
      const lx = lm.x - px + RADIUS;
      const lz = lm.z - pz + RADIUS;
      if (lx >= 0 && lx < SIZE && lz >= 0 && lz < SIZE) {
        ctx.fillStyle = '#f0b429';
        ctx.fillRect(lx - 1, lz - 1, 3, 3);
      }
    }
  }

  _useActiveItem() {
    const item = this.player.activeItem;
    if (!item) return;
    const p = this.player.pos;
    switch (item.id) {
      case 'repair_kit':
        this.player.removeItem('repair_kit', 1);
        this.xpSystem.gain(5);
        this.ui.notify('🩹 Repair kit used — systems patched!');
        this.audio.pickup();
        this.particles.burst(p.x, p.y + 1, p.z, 'pickup', 10);
        break;
      case 'signal_flare':
        this.player.removeItem('signal_flare', 1);
        this.ui.notify('🚨 Flare fired! Earl has been notified.');
        this.particles.burst(p.x, p.y + 1, p.z, 'ember', 30);
        this.audio.spark();
        setTimeout(() => this.foreman.say('idle', { force: true }), 800);
        break;
      case 'fuel_can':
        this.player.removeItem('fuel_can', 1);
        this._fuelBoostTimer = 8;   // 8 seconds of turbo
        this.ui.notify('🛢️ Fuel injected — turbo boost for 8 seconds!');
        this.audio.sprint();
        this.particles.burst(p.x, p.y, p.z, 'smoke', 8);
        break;
      case 'battery_pack':
        this.player.removeItem('battery_pack', 1);
        this.xpSystem.gain(15);
        this.ui.notify('🔋 Battery pack charged — +15 XP!');
        this.audio.pickup();
        this.particles.burst(p.x, p.y + 1, p.z, 'circuit', 8);
        break;
      case 'charging_pad':
        if (this.scrapBot?.isActive) {
          this.scrapBot.speak('[CHARGING] Thank you. My circuits feel warm.');
          this.ui.notify('🔌 Bot recharged!');
          this.audio.brainLoad();
          this.particles.burst(this.scrapBot._pos.x, 1.5, this.scrapBot._pos.z, 'circuit', 10);
        } else {
          this.ui.notify('No active bot to charge.');
        }
        break;
      default:
        this.ui.notify(`${item.id.replace(/_/g,' ')} has no use action (yet!)`);
    }
    this.ui.updateHotbar(this.player);
    this.saveSystem.markDirty();
  }

  _tickBotTrackSparks(dt) {
    this._sparkTimer = (this._sparkTimer ?? 0) + dt;
    if (this._sparkTimer < 0.18) return;
    this._sparkTimer = 0;
    for (const bot of [this.scrapBot, this.scrapBot2]) {
      if (!bot?.isActive || !bot._brainMode) continue;
      const bx = Math.floor(bot._pos.x), bz = Math.floor(bot._pos.z);
      if (this.world.getBlock(bx, 0, bz) === B.TRACK) {
        this.particles.burst(bot._pos.x, 1.1, bot._pos.z, 'track', 3);
      }
    }
  }

  // TRACK circuit lap timer — gate: x 30..46, z 13..15, y 0
  _tickLapTimer() {
    const ls = this._lapState;
    if (!ls.lapsEl) return;

    // Use whichever bot is running a brain program
    const bot = (this.scrapBot?._brainMode ? this.scrapBot : null)
             ?? (this.scrapBot2?._brainMode ? this.scrapBot2 : null);
    if (!bot?.isActive) {
      if (ls.inGate) { ls.inGate = false; }
      return;
    }

    const bx = bot._pos.x, bz = bot._pos.z;
    const inGate = bx >= 29.5 && bx <= 46.5 && bz >= 13.0 && bz <= 15.5;

    if (inGate && !ls.inGate) {
      // Entered the gate
      const now = performance.now();
      if (ls.lapStart > 0 && (now - ls.lapStart) > 2000) {
        // Completed a lap
        const ms = now - ls.lapStart;
        const improved = ms < ls.bestMs;
        ls.bestMs = Math.min(ls.bestMs, ms);
        const secs = (ms / 1000).toFixed(2);
        const best = (ls.bestMs / 1000).toFixed(2);
        ls.lapsEl.innerHTML = `🏁 Lap: <b>${secs}s</b>${improved ? ' 🏆 NEW BEST!' : ''}<br><span style="font-size:10px">Best: ${best}s</span>`;
        ls.lapsEl.classList.add('show');
        this.ui.notify(improved ? `🏆 New lap record: ${secs}s!` : `🏁 Lap complete: ${secs}s`);
        this.audio.lapComplete(improved);
        // Confetti burst at start/finish gate
        this.particles.burst(38, 1.5, 14, 'confetti', improved ? 30 : 14);
        this.achievements.track('lap_complete', {});
        this.xpSystem.gain(20);
        if (improved) setTimeout(() => this.foreman.onEvent('bot_lap_record', {}), 500);
        setTimeout(() => ls.lapsEl?.classList.remove('show'), 5000);
      }
      ls.lapStart = now;
    }
    ls.inGate = inGate;
  }

  _updateSpeechBubble(bot, el) {
    if (!el || !bot?.isActive) { el?.classList.remove('show'); return; }
    if (bot._speechTimer <= 0) { el.classList.remove('show'); return; }

    // Project 3D position (above bot head) to screen coordinates
    const pos = bot._pos.clone().setY(2.4);
    const proj = pos.project(this.renderer.camera);
    if (proj.z > 1) { el.classList.remove('show'); return; } // behind camera

    el.style.left = `${((proj.x + 1) / 2) * window.innerWidth}px`;
    el.style.top  = `${((1 - proj.y) / 2) * window.innerHeight}px`;
    el.textContent = bot.speechText;
    el.classList.add('show');
  }

  _render(dt) { this.renderer.tick(dt); }
}
