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

const MINE_COOLDOWN  = 0.32;
const PLACE_COOLDOWN = 0.25;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this._running = false;
    this._lastTime = 0;
    this._mineCooldown = 0;
    this._placeCooldown = 0;
    this._idleTimer = 0;
    this._lastNearStation = null;
    this._ambientTimer = 0;
  }

  init() {
    // ── Core systems ──────────────────────────────────────────────────────
    this.world    = new World(64, 64, 8);
    this.world.generate(1337);

    this.renderer = new Renderer(this.canvas);
    this.renderer.rebuildMeshes(this.world);

    this.player = new Player(this.renderer.camera, this.world);
    this.player.pos.set(8, 2, 5);

    // ── Atmosphere ────────────────────────────────────────────────────────
    this.dayNight = new DayNight(
      this.renderer.scene,
      this.renderer.ambientLight,
      this.renderer.sunLight,
    );

    // ── Particles ─────────────────────────────────────────────────────────
    this.particles = new ParticleSystem(this.renderer.scene);

    // ── Audio ─────────────────────────────────────────────────────────────
    this.audio = new AudioSystem();

    // ── Achievements ──────────────────────────────────────────────────────
    this.achievements = new Achievements();
    this.achievements.on('unlock', id => this.ui?.onAchievement(id));

    // ── Foreman ───────────────────────────────────────────────────────────
    this.foreman = new Foreman(this);

    // ── UI ────────────────────────────────────────────────────────────────
    this.ui = new UI(this);
    this.foreman.setUI(this.ui);

    // ── Crafting ──────────────────────────────────────────────────────────
    this.craftingSystem = new CraftingSystem(this.player, this.foreman);

    // ── ScrapBot (inactive until built) ───────────────────────────────────
    this.scrapBot = new ScrapBot(this.renderer.scene, this.player);
    this.scrapBot.setUI(this.ui);

    // ── Wiring ────────────────────────────────────────────────────────────
    this.world.on('change', () => this.renderer.rebuildMeshes(this.world));
    this._bindGameInput();

    setTimeout(() => this.foreman.greet(), 1200);
    this.ui.updateHotbar(this.player);
  }

  _bindGameInput() {
    document.addEventListener('keydown', e => {
      if (e.code === 'KeyE') {
        if (this.ui.isOpen) { this.ui.closeInventory(); return; }
        const p = this.player.pos;
        const nearby = this.world.getNearbyInteractives(p.x, p.y, p.z, 3);
        const station = nearby.length > 0 ? nearby[0].station : 'any';
        this.ui.openInventory(station);
      }
      if (e.code === 'KeyF') {
        const msg = prompt("Talk to Big Earl (or just press Enter for a random quip):") ?? '';
        if (msg) this.foreman.playerTalks(msg);
        else this.foreman.say('idle');
      }
      if (e.code === 'Escape' && this.ui.isOpen) this.ui.closeInventory();
      if (e.code === 'KeyM') this.audio.toggle();
    });

    this.canvas.addEventListener('mousedown', e => {
      if (this.ui.isOpen) return;
      if (!document.pointerLockElement) return;
      if (e.button === 0) this._tryMine();
      if (e.button === 2) this._tryPlace();
    });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  _tryMine() {
    if (this._mineCooldown > 0) return;
    const target = this.renderer.getTargetBlock(this.world);
    if (!target) return;
    const { x, y, z } = target;
    if (y === 0) return;

    const id = this.world.mine(x, y, z);
    if (id === null) return;
    this._mineCooldown = MINE_COOLDOWN;

    // Particles & sound
    this.particles.burst(x, y, z, 'mine', 10);
    this.audio.mine(id);

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

    if (def.drop && Math.random() < def.dropChance) giveLoot(def.drop);
    if (def.altDrop && Math.random() < def.altDropChance) giveLoot(def.altDrop);

    this.achievements.track('mine', { isNight });

    // Inventory fill stat
    const filled = this.player.inventory.filter(s => s !== null).length;
    this.achievements.track('inventory', { fill: filled / 36 });

    this.ui.updateHotbar(this.player);
  }

  _tryPlace() {
    if (this._placeCooldown > 0) return;
    // For now placing is disabled (crafting game, not survival)
    this._placeCooldown = PLACE_COOLDOWN;
  }

  /** Called by CraftingSystem after successful craft */
  onCraft(recipeId, output, qty) {
    this.achievements.track('craft', { id: output });
    this.audio.craft();
    this.particles.burst(
      this.player.pos.x, this.player.pos.y + 1, this.player.pos.z,
      'craft', 18,
    );

    // Activate ScrapBot once built
    if (output === 'robot_helper' && !this.scrapBot.isActive) {
      setTimeout(() => this.scrapBot.activate(this.player.pos), 1000);
    }

    this.ui.notify(`Crafted ${qty}x ${getItem(output)?.name ?? output}! ${getItem(output)?.icon ?? ''}`);
  }

  /** Called by Foreman when a quest completes */
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
    const dt = Math.min((now - this._lastTime) / 1000, 0.1);
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

    this._mineCooldown  = Math.max(0, this._mineCooldown - dt);
    this._placeCooldown = Math.max(0, this._placeCooldown - dt);

    // Block targeting label
    if (!this.ui.isOpen && document.pointerLockElement) {
      const target = this.renderer.getTargetBlock(this.world);
      this.ui.setBlockLabel(target ? this.world.getBlock(target.x, target.y, target.z) : null);
    } else {
      this.ui.setBlockLabel(null);
    }

    // Idle foreman
    if (document.pointerLockElement) {
      this._idleTimer += dt;
      if (this._idleTimer > 55) { this._idleTimer = 0; this.foreman.say('idle'); }
    }

    // Nearby station (fires once per approach)
    const p = this.player.pos;
    const nearby = this.world.getNearbyInteractives(p.x, p.y, p.z, 2.5);
    const nearStation = nearby.length > 0 ? nearby[0].station : null;
    if (nearStation !== this._lastNearStation) {
      this._lastNearStation = nearStation;
      if (nearStation) this.foreman.onEvent(`near_${nearStation}`, {});
    }

    // Quest progress
    if (this.foreman._activeQuest) {
      this.ui.updateQuestProgress(this.foreman._activeQuest, this.player);
    }

    // Zone label + time
    const zone = this.world.getZoneLabel(Math.floor(p.x), Math.floor(p.z));
    this.ui.setZone(zone, this.dayNight.label);

    // Ambient forge spark particles
    this._ambientTimer += dt;
    if (this._ambientTimer > 3 + Math.random() * 4) {
      this._ambientTimer = 0;
      // Near forge/smelter
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

  _render(dt) {
    this.renderer.tick(dt);
  }
}
