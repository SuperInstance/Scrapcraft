import * as THREE from 'three';
import { World } from './World.js';
import { Renderer } from './Renderer.js';
import { Player } from './Player.js';
import { Foreman } from './Foreman.js';
import { UI } from './UI.js';
import { CraftingSystem } from './systems/CraftingSystem.js';
import { BLOCK_DEF, B } from './data/blocks.js';
import { getItem } from './data/items.js';

const MINE_COOLDOWN = 0.35;  // seconds between mines
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
  }

  init() {
    // World
    this.world = new World(64, 64, 8);
    this.world.generate(1337);

    // Renderer
    this.renderer = new Renderer(this.canvas);
    this.renderer.rebuildMeshes(this.world);

    // Player spawns near the workbench area
    this.player = new Player(this.renderer.camera, this.world);
    this.player.pos.set(8, 3, 5);

    // Foreman
    this.foreman = new Foreman(this);

    // UI
    this.ui = new UI(this);
    this.foreman.setUI(this.ui);

    // Crafting
    this.craftingSystem = new CraftingSystem(this.player, this.foreman);

    // Rebuild world on block change
    this.world.on('change', () => {
      this.renderer.rebuildMeshes(this.world);
    });

    // Input
    this._bindGameInput();

    // Start with foreman greeting after a beat
    setTimeout(() => this.foreman.greet(), 1200);

    this.ui.updateHotbar(this.player);
  }

  _bindGameInput() {
    document.addEventListener('keydown', e => {
      if (e.code === 'KeyE') {
        if (this.ui.isOpen) {
          this.ui.closeInventory();
          return;
        }
        // Check for nearby interactive station
        const p = this.player.pos;
        const nearby = this.world.getNearbyInteractives(p.x, p.y, p.z, 3);
        if (nearby.length > 0) {
          this._currentStation = nearby[0].station;
          this.ui.openInventory(nearby[0].station);
        } else {
          this._currentStation = 'any';
          this.ui.openInventory('any');
        }
      }
      if (e.code === 'KeyF') {
        const msg = prompt("Talk to Big Earl:") || '';
        if (msg) this.foreman.playerTalks(msg);
      }
      if (e.code === 'Escape') {
        if (this.ui.isOpen) this.ui.closeInventory();
      }
    });

    // Mouse: left click = mine, right click = place
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
    if (y === 0) return; // don't mine the base layer

    const id = this.world.mine(x, y, z);
    if (id === null) return;

    this._mineCooldown = MINE_COOLDOWN;

    const def = BLOCK_DEF[id];
    if (!def) return;

    // Drop loot
    if (def.drop && Math.random() < def.dropChance) {
      const leftover = this.player.addItem(def.drop, 1);
      const item = getItem(def.drop);
      if (!leftover) {
        this.ui.notify(`+ ${item?.icon ?? ''} ${item?.name ?? def.drop}`);
        this.foreman.onEvent(`mine_${def.drop}`, {});
      }
    }
    if (def.altDrop && Math.random() < def.altDropChance) {
      const leftover = this.player.addItem(def.altDrop, 1);
      const item = getItem(def.altDrop);
      if (!leftover) {
        this.ui.notify(`+ ${item?.icon ?? ''} ${item?.name ?? def.altDrop}`);
        this.foreman.onEvent(`mine_${def.altDrop}`, {});
      }
    }

    this.ui.updateHotbar(this.player);

    // Check quest progress
    this.foreman.onEvent('mine', { blockId: id });
  }

  _tryPlace() {
    if (this._placeCooldown > 0) return;
    const active = this.player.activeItem;
    if (!active) return;

    const target = this.renderer.getTargetBlock(this.world);
    if (!target) return;

    // Place on the face normal offset
    const px = target.x + target.face.x;
    const py = target.y + target.face.y;
    const pz = target.z + target.face.z;

    // Don't place where player is standing
    const pp = this.player.pos;
    if (Math.abs(px - pp.x) < 0.8 && py >= Math.floor(pp.y) && py <= Math.floor(pp.y + 1.8)
        && Math.abs(pz - pp.z) < 0.8) return;

    // Can only place blocks from active slot if it's a placeable item
    // For now, players can't place blocks — this is a crafting game, not survival
    // TODO: allow placing workbench/forge from inventory
    this._placeCooldown = PLACE_COOLDOWN;
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

    this._mineCooldown = Math.max(0, this._mineCooldown - dt);
    this._placeCooldown = Math.max(0, this._placeCooldown - dt);

    // Block label
    if (!this.ui.isOpen && document.pointerLockElement) {
      const target = this.renderer.getTargetBlock(this.world);
      this.ui.setBlockLabel(target ? this.world.getBlock(target.x, target.y, target.z) : null);
    } else {
      this.ui.setBlockLabel(null);
    }

    // Foreman idle prod
    if (document.pointerLockElement) {
      this._idleTimer += dt;
      if (this._idleTimer > 60) {
        this._idleTimer = 0;
        this.foreman.say('idle');
      }
    }

    // Quest UI update
    if (this.foreman._activeQuest) {
      this.ui.updateQuestProgress(this.foreman._activeQuest, this.player);
    }

    // Nearby station hint — fire once per approach, not every tick
    const p = this.player.pos;
    const nearby = this.world.getNearbyInteractives(p.x, p.y, p.z, 2.5);
    const nearStation = nearby.length > 0 ? nearby[0].station : null;
    if (nearStation !== this._lastNearStation) {
      this._lastNearStation = nearStation;
      if (nearStation) this.foreman.onEvent(`near_${nearStation}`, {});
    }

    this.ui.updateHotbar(this.player);
  }

  _render(dt) {
    this.renderer.tick(dt);
  }
}
