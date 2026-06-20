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
import { BLOCK_DEF, B } from './data/blocks.js';
import { getItem } from './data/items.js';
import { EXAMPLE_WALL_AVOIDER } from './maker/TileProgram.js';
import { TileEditor } from './TileEditor.js';

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

    this.scrapBot = new ScrapBot(this.renderer.scene, this.player);
    this.scrapBot.setUI(this.ui);
    this.scrapBot.setGame(this);

    this.tileEditor = new TileEditor(this);

    this.world.on('change', () => this.renderer.rebuildMeshes(this.world));

    this._bindInput();

    setTimeout(() => this.foreman.greet(), 1200);
    this.ui.updateHotbar(this.player);
  }

  _bindInput() {
    document.addEventListener('keydown', e => {
      if (e.code === 'KeyE') {
        if (this.ui.isOpen) { this.ui.closeInventory(); return; }
        const p = this.player.pos;
        const nearby = this.world.getNearbyInteractives(p.x, p.y, p.z, 3);
        this.ui.openInventory(nearby[0]?.station ?? 'any');
      }
      if (e.code === 'KeyT') {
        if (this.tileEditor.isOpen) { this.tileEditor.close(); }
        else { this.tileEditor.open(); }
        return;
      }
      if (e.code === 'KeyF') {
        const msg = prompt('Talk to Big Earl:') ?? '';
        if (msg) this.foreman.playerTalks(msg);
        else this.foreman.say('idle');
      }
      if (e.code === 'Escape' && this.ui.isOpen) this.ui.closeInventory();
      if (e.code === 'KeyM') this.audio.toggle();
      if (e.code === 'KeyB' && this.scrapBot.isActive) {
        if (this.scrapBot._brainMode) {
          this.scrapBot.clearBrain();
        } else {
          this.scrapBot.setBrain(EXAMPLE_WALL_AVOIDER, this.world, this.player, this.dayNight);
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
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

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
        this.foreman.onEvent(`mine_${drop}`, {});
      }
    };
    if (def.drop    && Math.random() < def.dropChance)    giveLoot(def.drop);
    if (def.altDrop && Math.random() < def.altDropChance) giveLoot(def.altDrop);

    this.achievements.track('mine', { isNight });
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

  onCraft(recipeId, output, qty) {
    this.achievements.track('craft', { id: output });
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
    this.player.tick(dt, this.world);
    this.dayNight.tick(dt);
    this.particles.tick(dt);
    this.achievements.tick(dt);
    this.scrapBot.tick(dt, this.world);
    this.audio.tick(dt, this.player, this.world);

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
  }

  _render(dt) { this.renderer.tick(dt); }
}
