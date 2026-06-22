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
import { getSensor } from './maker/primitives.js';
import { TileEditor } from './TileEditor.js';
import { SaveSystem } from './SaveSystem.js';
import { XPSystem } from './XPSystem.js';
import { WeatherSystem } from './WeatherSystem.js';
import { ProjectileSystem } from './ProjectileSystem.js';
import { Challenge } from './Challenge.js';
import { OnboardingWizard } from './onboarding/OnboardingWizard.js';

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

    // Tutorial state machine (shown on first load)
    this._tutorialActive  = false;
    this._tutorialStep    = -1; // -1 = not started, 0..3 = steps, 4 = done
    this._tutorialNagged  = false;
    this._tutorialWarned  = false;
    this._tutorialHintEl  = document.getElementById('tutorial-hint');

    // Auto-help — show help overlay after 15s of idle play
    this._helpAutoTimer   = -1;
    this._helpWasShown    = false;

    // Band-entry notify flags (show once per band)
    this._notifiedBand2   = false;
    this._notifiedBand3   = false;

    // First-time craft tracking
    this._notifiedWrench  = false;
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

    this.projectiles = new ProjectileSystem(this.renderer.scene);

    this.tileEditor = new TileEditor(this);
    this.saveSystem = new SaveSystem(this);
    this.challenge  = new Challenge(this);

    // Radio tower endgame — track installed components + activated state
    const TOWER_REQS = { signal_amp: 1, crystal_fragment: 5, circuit_board: 4, battery_pack: 3 };
    this._towerReqs      = TOWER_REQS;
    this._towerSlots     = Object.fromEntries(Object.keys(TOWER_REQS).map(k => [k, 0]));
    this._towerActivated = false;
    this._towerNearNotified = false;

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

    // Fog of war — Uint8Array 128×128 (1 = visited, 0 = unexplored)
    // Pre-reveal the spawn area so the minimap isn't black on first load
    this._fogMap = new Uint8Array(128 * 128);
    { const sx = 8, sz = 5, sr = 8;
      for (let dz = -sr; dz <= sr; dz++) for (let dx = -sr; dx <= sr; dx++) {
        if (dx * dx + dz * dz > sr * sr) continue;
        const wx = sx + dx, wz = sz + dz;
        if (wx >= 0 && wx < 128 && wz >= 0 && wz < 128) this._fogMap[wz * 128 + wx] = 1;
      }
    }

    // Item use (G key) state
    this._fuelBoostTimer  = 0;   // seconds remaining on fuel_can speed boost
    this._headlampOn      = false;
    this._flyingMode     = false; // toggled by flying_machine
    this._savedGravity   = 0;     // restored when landing

    // Waypoint system — player drops a flag at their position (Y key or waypoint_flag item G)
    this._waypoint = null;  // { x, z } or null
    this._waypointMarkerTimer = 0;
    this._waypointFlagMesh = null;  // THREE.Group, created lazily

    // Supply drop system — random airdrop every 90-180s
    this._airdropTimer    = 90 + Math.random() * 90;
    this._airdropCrates   = new Set();  // "x,y,z" keys for mined loot overrides

    // Lap timer — tracks bots crossing the TRACK circuit start/finish gate (z≈14, x=30-46)
    this._lapState = {
      inGate:    false,
      lapStart:  0,
      bestMs:    Infinity,
      lapsEl:    document.getElementById('lap-timer'),
    };

    // Ghost lap replay — records best lap as [x,z,yaw,ms] frames, plays back translucent bot
    this._ghostFrames     = [];
    this._bestGhostFrames = [];
    this._ghostPbTime     = 0;
    this._ghostRecTimer   = 0;
    this._ghostBotMesh    = null;

    // Uninitialized variable guards
    this._oreDetectCooldown = 0;
    this._nearTrackSeen    = false;
    this._nightBonusShown  = false;

    // ── Onboarding wizard (first-run only) ──
    this.onboarding = new OnboardingWizard(this);
    if (!this.onboarding.isComplete()) {
      setTimeout(() => this.onboarding.show(), 500);
    }
    this.onboarding.loadConfig();

    this._bindInput();

    // Wire health callback: any damage/heal updates HUD + flashes vignette on damage
    this.player.onDamage = (hp) => {
      this.ui.setHealth(hp, this.player.maxHp);
      if (hp < this.player.maxHp) this.ui.flashDamage();
      if (hp > 0 && hp < 15) this.achievements?.track('narrow_escape');
    };
    this.ui.setHealth(100, 100);

    // Load saved state — if none, show first-time greeting + tutorial
    const loaded = this.saveSystem.load();
    if (!loaded) {
      setTimeout(() => this.foreman.greet(), 1200);
      this._startTutorial();
    } else {
      setTimeout(() => this.foreman.say('idle'), 1200);
    }

    this.ui.updateHotbar(this.player);
  }

  // ── Tutorial (first-time player onboarding) ────────────────────────

  _startTutorial() {
    this._tutorialActive = true;
    this._tutorialStep   = 0;
    this._showTutorialHint();
  }

  _showTutorialHint() {
    const STEPS = [
      '⬆️  Press <b>W A S D</b> to move around the yard',
      '⛏️  Hold <b>left-click</b> on scrap piles to mine them',
      '🔧  Press <b>E</b> to open the Workshop & inventory',
      '🧠  Press <b>T</b> to open the Maker Bench (robot brain!)',
    ];
    const el = this._tutorialHintEl;
    if (!el) return;
    if (this._tutorialStep >= 0 && this._tutorialStep < STEPS.length) {
      el.innerHTML = STEPS[this._tutorialStep];
      el.classList.add('show');
      // Also notify in the notification area
      this.ui?.notify(STEPS[this._tutorialStep].replace(/<[^>]+>/g, ''));
    } else if (this._tutorialStep >= STEPS.length) {
      el.classList.remove('show');
      this._tutorialActive = false;
      this.ui?.notify('✅ Tutorial complete! Press <b>H</b> anytime for help.');
    }
  }

  _advanceTutorial() {
    if (!this._tutorialActive || this._tutorialStep < 0) return;
    this._tutorialStep++;
    if (this._tutorialStep >= 4) {
      this._tutorialActive = false;
      if (this._tutorialHintEl) this._tutorialHintEl.classList.remove('show');
      this.ui?.notify('✅ Tutorial complete! Press H for help.');
      return;
    }
    this._showTutorialHint();
  }

  _bindInput() {
    document.addEventListener('keydown', e => {
      // Any keypress resets the auto-help timer
      this._helpAutoTimer = -1;

      // ── Tutorial: detect WASD to advance step 0 ──
      if (this._tutorialActive && this._tutorialStep === 0 && /^(Key[WASD])$/.test(e.code)) {
        this._advanceTutorial();
      }

      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && document.pointerLockElement) {
        this.audio.sprint();
      }
      if (e.code === 'KeyG' && document.pointerLockElement && !this.ui.isOpen) {
        this._useActiveItem();
      }
      // ── Tutorial: detect E to advance step 2 ──
      if (e.code === 'KeyE') {
        if (this._tutorialActive && this._tutorialStep === 2) this._advanceTutorial();
        if (this.ui.isOpen) { this.ui.closeInventory(); return; }
        // Toggle tower panel closed if it's already open
        if (this.ui._towerPanelOpen) {
          document.getElementById('tower-panel')?.remove();
          this.ui._towerPanelOpen = false;
          document.getElementById('game-canvas')?.requestPointerLock();
          return;
        }
        // Radio tower interaction — takes priority when nearby
        const tower = this.world.landmarks?.radio_tower;
        if (tower) {
          const p0 = this.player.pos;
          if ((p0.x - tower.x) ** 2 + (p0.z - tower.z) ** 2 < 36) {
            this.ui.showTowerPanel(this._towerSlots, this._towerReqs, this._towerActivated,
              () => this._installTowerComponents(),
              () => this._activateTower());
            return;
          }
        }
        const p = this.player.pos;
        const nearby = this.world.getNearbyInteractives(p.x, p.y, p.z, 3);
        this.ui.openInventory(nearby[0]?.station ?? 'any');
      }
      // ── Tutorial: detect T to advance step 3 ──
      if (e.code === 'KeyT') {
        if (this._tutorialActive && this._tutorialStep === 3) this._advanceTutorial();
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
      if (e.code === 'KeyI' && this.ui.isOpen) {
        this._sortInventory();
      }
      if (e.code === 'KeyN' && !this.tileEditor.isOpen) {
        this.ui.toggleFieldNotes();
      }
      if (e.code === 'KeyH' && !this.ui.isOpen && !this.tileEditor.isOpen) this._toggleHelp();
      if (e.code === 'KeyR' && document.pointerLockElement) {
        this.player.pos.set(8, 2, 5);
        this.player.vel?.set(0, 0, 0);
        this.player.yaw = 0;
        this.ui.notify('🏁 Respawned at the yard gate.');
      }
      if (e.code === 'KeyM') this.audio.toggle();
      if (e.code === 'KeyY' && document.pointerLockElement) {
        this._dropWaypoint();
      }
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
        this.challenge.onCollect(drop);
      }
    };
    if (def.drop    && Math.random() < def.dropChance)    {
      const qty = def.dropQty ?? 1;
      for (let q = 0; q < qty; q++) giveLoot(def.drop);
    }
    if (def.altDrop && Math.random() < def.altDropChance) giveLoot(def.altDrop);
    // Magnet passive: bonus drop for metallic blocks
    const METAL_BLOCKS = new Set([B.SCRAP_PILE, B.RUST_METAL, B.CLEAN_METAL, B.WALL_METAL]);
    if (this.player.hasTool('scrap_magnet') && METAL_BLOCKS.has(id) && def.drop && Math.random() < 0.6) {
      giveLoot(def.drop);
    }

    // Lucky Find — 3% base chance (8% at night) of bonus rare item from junk blocks
    const LUCKY_BLOCKS = new Set([B.SCRAP_PILE, B.OIL_DRUM, B.JUNK_CAR]);
    const LUCKY_LOOT   = ['battery_pack', 'ir_module', 'circuit_board', 'ldr_module', 'spring', 'gear_small', 'crystal_fragment'];
    const luckyChance  = isNight ? 0.08 : 0.03;
    if (LUCKY_BLOCKS.has(id) && Math.random() < luckyChance) {
      const lucky = LUCKY_LOOT[Math.floor(Math.random() * LUCKY_LOOT.length)];
      this.player.addItem(lucky, 1);
      const lDef = getItem(lucky);
      const prefix = isNight ? '🌙 Night Find!' : '🍀 Lucky Find!';
      this.ui.notify(`${prefix} ${lDef?.icon ?? ''} ${lDef?.name ?? lucky} hidden in the junk!`);
      this.particles.burst(x, y + 1, z, 'confetti', 14);
      this.audio.pickup();
      this.foreman.onEvent('lucky_find', {});
      this.achievements.track('lucky_find', {});
      this.xpSystem.gain(5);
    }
    // Night bonus HUD indicator (first mine of the night)
    if (isNight && !this._nightBonusShown) {
      this._nightBonusShown = true;
      this.ui.notify('🌙 Night Bonus active — rare drop rate 8% from junk piles!');
    }
    if (!isNight) this._nightBonusShown = false;

    // Supply drop bonus loot
    const crateKey = `${x},${y},${z}`;
    if (this._airdropCrates?.has(crateKey)) {
      this._airdropCrates.delete(crateKey);
      const LOOT = [
        { item: 'circuit_board', w: 3 }, { item: 'battery_pack', w: 3 },
        { item: 'crystal_fragment', w: 2 }, { item: 'ir_module', w: 2 },
        { item: 'copper_wire', w: 4 }, { item: 'gear_small', w: 3 },
        { item: 'scrap_grenade', w: 1 }, { item: 'fuel_can', w: 2 },
      ];
      const total = LOOT.reduce((s, l) => s + l.w, 0);
      const pick = () => {
        let r = Math.random() * total;
        for (const l of LOOT) { r -= l.w; if (r <= 0) return l.item; }
        return LOOT[0].item;
      };
      const drops = new Map();
      for (let i = 0; i < 3; i++) { const it = pick(); drops.set(it, (drops.get(it) ?? 0) + 1); }
      for (const [it, qty] of drops) {
        this.player.addItem(it, qty);
        const def = getItem(it);
        this.ui.notify(`📦 Airdrop: +${qty}× ${def?.icon ?? ''} ${def?.name ?? it}`);
      }
      this.foreman.onEvent('airdrop_looted', {});
      this.achievements.track('airdrop_loot', {});
      this.xpSystem.gain(20);
      this.particles.burst(x, y + 1, z, 'confetti', 20);
    }

    // Buried signal cache — special loot when the BURIED_CACHE block is mined
    if (id === B.BURIED_CACHE) this._lootBuriedCache(x, z);

    // Tutorial: first mine advances step 1
    if (this._tutorialActive && this._tutorialStep === 1) this._advanceTutorial();

    this.achievements.track('mine', { isNight });
    this.challenge.onMine(id);
    if (id === B.CRYSTAL_ORE) {
      this.achievements.track('crystal_mine', {});
      this.xpSystem.gain(5);  // bonus XP for rare ore
    }
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

    // Interact with scrap cannon on right-click
    const targetId = this.world.getBlock(target.x, target.y, target.z);
    if (targetId === B.SCRAP_CANNON) {
      this._fireScrapCannon(target.x, target.y, target.z);
      return;
    }

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

  _applyBandSky(bandIdx) {
    // Each band gets a distinct sky/fog palette for visual biome feel
    const PALETTES = [
      { sky: 0x8aabbb, fog: 0x8aabbb },  // Band 0: Yard Gate — default blue-grey
      { sky: 0x707080, fog: 0x807080 },  // Band 1: Industrial — grey industrial haze
      { sky: 0x3a6040, fog: 0x3a5030 },  // Band 2: Circuit City — deep teal/green
      { sky: 0x1a0a0a, fog: 0x2a0a0a },  // Band 3: Deep Yard — near-dark red-black
    ];
    const pal = PALETTES[bandIdx] ?? PALETTES[0];
    const scene = this.renderer.scene;
    scene.background = new THREE.Color(pal.sky);
    scene.fog.color  = new THREE.Color(pal.fog);
  }

  _fireScrapCannon(cx, cy, cz) {
    const p = this.player.pos;
    const dx = cx - p.x, dz = cz - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const dir = { x: dx / len, y: 0, z: dz / len };

    this.projectiles.fire({ x: cx, y: cy, z: cz }, dir, 'cannon');
    this.particles.burst(cx, cy + 0.5, cz, 'smoke', 6);
    this.audio.mine(B.RUST_METAL);
    this.achievements.track('cannon_fire', {});
    this.foreman.onEvent('cannon_fire', {});
    this.xpSystem.gain(1);
    this.ui.notify('💥 Scrap Cannon fired!');
  }

  _throwGrenade() {
    const p = this.player.pos;
    const yaw = this.player.yaw ?? 0;
    const dir = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
    this.projectiles.fire({ x: p.x, y: p.y, z: p.z }, dir, 'grenade');
    this.player.removeItem('scrap_grenade', 1);
    this.audio.mine(B.SCRAP_PILE);
    this.ui.updateHotbar(this.player);
    this.ui.notify('💣 Grenade thrown!');
  }

  _onProjectileHit({ x, y, z, type, blocksDestroyed }) {
    this.particles.burst(x, y + 0.5, z, type === 'grenade' ? 'ember' : 'mine', type === 'grenade' ? 20 : 10);
    if (type === 'grenade') {
      this.particles.burst(x, y + 1, z, 'smoke', 8);
      this._cameraShake(0.15, 0.25);
      // Friendly-fire splash: player within 2.5 blocks of explosion takes damage
      const pp = this.player.pos;
      const d = Math.hypot(pp.x - x, pp.z - z);
      if (d < 2.5) {
        const dmg = Math.round((1 - d / 2.5) * 25);
        this.player.takeDamage(dmg);
        this.ui.notify(`💥 Caught in blast! −${dmg} HP`);
      }
      if (blocksDestroyed >= 3) {
        this.achievements.track('grenade_splash', { count: blocksDestroyed });
        this.foreman.onEvent('grenade_big_hit', {});
      } else {
        this.foreman.onEvent('grenade_fire', {});
      }
      if (blocksDestroyed > 0) {
        this.ui.notify(`💥 Grenade — ${blocksDestroyed} block${blocksDestroyed > 1 ? 's' : ''} destroyed!`);
        this.xpSystem.gain(blocksDestroyed * 2);
      }
    }
    this.audio.mine(B.RUST_METAL);
    this.saveSystem.markDirty();
  }

  _tickOreScanner() {
    const hud = document.getElementById('ore-scanner-hud');
    if (!hud) return;
    const active = this.player.activeItem?.id === 'ore_scanner';
    hud.classList.toggle('active', active);
    if (!active) return;

    // Find nearest crystal ore within 24 blocks of player
    const p   = this.player.pos;
    const px  = Math.round(p.x), pz = Math.round(p.z);
    const RANGE = 24;
    let bestDist2 = RANGE * RANGE + 1;
    let bestX = null, bestZ = null;
    for (let dz = -RANGE; dz <= RANGE; dz++) {
      for (let dx = -RANGE; dx <= RANGE; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 >= bestDist2) continue;
        for (let y = 0; y < this.world.height; y++) {
          if (this.world.getBlock(px + dx, y, pz + dz) === B.CRYSTAL_ORE) {
            bestDist2 = d2; bestX = px + dx; bestZ = pz + dz; break;
          }
        }
      }
    }

    if (bestX === null) {
      // Also check crystal_cave landmark (may be >24 blocks)
      const lm = this.world.landmarks?.crystal_cave;
      if (lm) { bestX = lm.x; bestZ = lm.z; bestDist2 = (lm.x - px) ** 2 + (lm.z - pz) ** 2; }
    }

    const arrow = document.getElementById('ors-arrow');
    const dist  = document.getElementById('ors-dist');
    if (!arrow || !dist) return;

    if (bestX === null) {
      arrow.textContent = '?'; dist.textContent = 'No ore in range';
      return;
    }

    const dist_m = Math.round(Math.sqrt(bestDist2));
    const bearing = Math.atan2(bestX - px, bestZ - pz); // angle from north (+Z)
    const screenAngle = bearing - this.player.yaw;       // relative to player facing
    arrow.style.transform = `rotate(${(screenAngle * 180 / Math.PI).toFixed(1)}deg)`;
    arrow.textContent = '↑';
    dist.textContent = `${dist_m} blocks`;
    dist.style.color = dist_m < 8 ? '#44ff44' : dist_m < 16 ? '#ffcc44' : '#aaddff';
  }

  _tickSignalRadio() {
    const hud = document.getElementById('signal-radio-hud');
    if (!hud) return;
    const active = this.player.activeItem?.id === 'signal_radio';
    hud.classList.toggle('active', active);
    if (!active) return;

    const caches = this.world.signalCaches;
    if (!caches?.size) {
      document.getElementById('sr-bars').innerHTML = '<span style="font-size:9px;color:#555">ALL FOUND</span>';
      document.getElementById('sr-dist').textContent = '';
      document.getElementById('sr-arrow').textContent = '✓';
      return;
    }

    const p  = this.player.pos;
    const px = Math.round(p.x), pz = Math.round(p.z);
    let bestDist2 = Infinity, bestX = null, bestZ = null;
    for (const key of caches) {
      const [cx, cz] = key.split(',').map(Number);
      const d2 = (cx - px) ** 2 + (cz - pz) ** 2;
      if (d2 < bestDist2) { bestDist2 = d2; bestX = cx; bestZ = cz; }
    }

    const dist = Math.sqrt(bestDist2);
    const MAX_RANGE = 72;
    const strength = Math.max(0, 1 - dist / MAX_RANGE);
    const litBars  = Math.round(strength * 5);

    const barsEl = document.getElementById('sr-bars');
    const distEl = document.getElementById('sr-dist');
    const arrowEl = document.getElementById('sr-arrow');
    if (!barsEl || !distEl || !arrowEl) return;

    barsEl.innerHTML = Array.from({ length: 5 }, (_, i) =>
      `<span class="sr-bar${i < litBars ? ' lit' : ''}"></span>`
    ).join('');

    if (dist > MAX_RANGE) {
      distEl.textContent = 'OUT OF RANGE';
      arrowEl.textContent = '?';
      arrowEl.style.color = '#555';
      return;
    }

    distEl.textContent = `${Math.round(dist)}m`;
    distEl.style.color = dist < 6 ? '#00ff88' : dist < 20 ? '#ffcc44' : '#aaddff';

    const bearing = Math.atan2(bestX - px, bestZ - pz) - this.player.yaw;
    arrowEl.style.transform = `rotate(${(bearing * 180 / Math.PI).toFixed(1)}deg)`;
    arrowEl.textContent = '↑';
    arrowEl.style.color = distEl.style.color;
  }

  _lootBuriedCache(x, z) {
    const key = `${x},${z}`;
    if (!this.world.signalCaches?.has(key)) return;
    this.world.signalCaches.delete(key);

    const LOOT = [
      { item: 'crystal_fragment', qty: 2 },
      { item: 'circuit_board',    qty: 3 },
      { item: 'ir_module',        qty: 2 },
      { item: 'battery_pack',     qty: 2 },
    ];
    for (const { item, qty } of LOOT) {
      this.player.addItem(item, qty);
      const def = getItem(item);
      this.ui.notify(`📡 Cache: +${qty}× ${def?.icon ?? ''} ${def?.name ?? item}`);
    }
    this.particles.burst(x, 1.5, z, 'confetti', 25);
    this.particles.burst(x, 1.5, z, 'circuit', 12);
    this.audio.mine(B.CRATE);
    this.xpSystem.gain(40);
    this.foreman.onEvent('buried_cache_found', {});
    this.achievements.track('buried_cache', {});
    this.saveSystem.markDirty();
  }

  // ── Radio tower endgame ────────────────────────────────────────────────

  /** Pull as many required components as the player carries into the tower slots. */
  _installTowerComponents() {
    if (this._towerActivated) return;
    let movedAny = false;
    for (const [id, need] of Object.entries(this._towerReqs)) {
      const have    = this._towerSlots[id] ?? 0;
      const missing = need - have;
      if (missing <= 0) continue;
      const take = Math.min(missing, this.player.countItem(id));
      if (take > 0) {
        this.player.removeItem(id, take);
        this._towerSlots[id] = have + take;
        movedAny = true;
        const def = getItem(id);
        this.ui.notify(`🔧 Installed ${take}× ${def?.icon ?? ''} ${def?.name ?? id}`);
      }
    }
    if (!movedAny) {
      this.ui.notify('No matching components in your inventory.');
      this.audio.error();
    } else {
      this.particles.burst(this.world.landmarks.radio_tower.x, 2, this.world.landmarks.radio_tower.z, 'circuit', 10);
      this.audio.pickup();
      this.ui.updateHotbar(this.player);
      this.saveSystem.markDirty();
      const allDone = Object.entries(this._towerReqs).every(([id, n]) => (this._towerSlots[id] ?? 0) >= n);
      if (allDone) this.foreman.onEvent('tower_ready', {});
    }
  }

  /** Fire the transmitter: the narrative climax. Lights the beacon, big celebration. */
  _activateTower() {
    if (this._towerActivated) return;
    const allDone = Object.entries(this._towerReqs).every(([id, n]) => (this._towerSlots[id] ?? 0) >= n);
    if (!allDone) { this.ui.notify('Tower needs all four components first.'); this.audio.error(); return; }

    this._towerActivated = true;
    const t = this.world.landmarks.radio_tower;

    // Sustained celebration at the tower apex
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        this.particles.burst(t.x, 9 + Math.random() * 2, t.z, 'confetti', 24);
        this.particles.burst(t.x, 6, t.z, 'circuit', 14);
        this.audio.lapComplete?.(true);
      }, i * 450);
    }
    this._shakeDuration = 1.2; this._shakeIntensity = 0.18; this._shakeTimer = 0;

    this.ui.notify('📡 THE TRANSMITTER ROARS TO LIFE. Signal broadcasting on 433 MHz!');
    this.xpSystem.gain(200);
    this.achievements.track('tower_activated', {});
    this.foreman.onEvent('tower_activated', {});
    this.saveSystem.markDirty();
  }

  _tickStormDamage(dt) {
    if (this.weather.state !== 'storm' || this.weather.intensityValue < 0.5) {
      this._stormDmgTimer = 0;
      this._stormWarnShown = false;
      return;
    }
    const p  = this.player.pos;
    const bx = Math.round(p.x), bz = Math.round(p.z);
    // Sheltered = any solid block in the 3 tiles directly overhead
    const sheltered = [2, 3, 4].some(dy => {
      const id = this.world.getBlock(bx, Math.round(p.y) + dy, bz);
      return id !== 0 && (BLOCK_DEF[id]?.solid ?? false);
    });
    if (sheltered) {
      this._stormDmgTimer = 0;
      this._stormWarnShown = false;
      return;
    }
    this._stormDmgTimer = (this._stormDmgTimer ?? 0) + dt;
    if (!this._stormWarnShown) {
      this._stormWarnShown = true;
      this.ui.notify('⛈ Lightning strikes! Seek shelter under a roof!');
      this.foreman.onEvent('storm_exposed', {});
    }
    if (this._stormDmgTimer > 2.5) {
      this._stormDmgTimer = 0;
      this.player.takeDamage(5);
    }
  }

  _tickHazards(dt) {
    const p  = this.player.pos;
    const bx = Math.round(p.x), bz = Math.round(p.z);
    const band = this.world.getBandIndex(Math.floor(bz));
    // Check the block at player feet (y=1) for hazards
    const id  = this.world.getBlock(bx, 1, bz);
    const def = id ? (BLOCK_DEF[id] ?? null) : null;
    if (def?.hazard === 'acid') {
      // Rubber boots in inventory = full acid immunity
      if (this.player.hasTool('rubber_boots')) {
        this._acidTimer = 0;
        this._acidWarnActive = false;
        return;
      }
      this._acidTimer = (this._acidTimer ?? 0) + dt;
      if (this._acidTimer > 0.5) {
        this._acidTimer = 0;
        // Band-dependent DPS — Band 1 is milder acid, Band 2 is full strength
        const bandDps = band === 1 ? 3 : (def.hazardDps ?? 4);
        const dmg = Math.round(bandDps * 0.5);
        this.player.takeDamage(dmg);
        if (!this._acidWarnActive) {
          this._acidWarnActive = true;
          this.ui.notify('☠ Acid! Move away — craft Rubber Boots for immunity.');
          this.foreman.onEvent('acid_hazard', {});
        }
      }
    } else if (def?.hazard === 'fire') {
      // Hot slag — no immunity item (but Blowtorch makes you resistant)
      const resistance = this.player.hasTool('blowtorch') ? 0.5 : 1;
      this._fireTimer = (this._fireTimer ?? 0) + dt;
      if (this._fireTimer > 0.5) {
        this._fireTimer = 0;
        let dmg = Math.round((def.hazardDps ?? 5) * 0.5 * resistance);
        dmg = Math.max(1, dmg);
        this.player.takeDamage(dmg);
        if (!this._fireWarnActive) {
          this._fireWarnActive = true;
          this.ui.notify('🔥 Hot slag! Move away! Blowtorch halves the damage.');
          this.particles.burst(p.x, p.y + 0.5, p.z, 'ember', 4);
        }
      }
    } else {
      this._acidTimer = 0;
      this._acidWarnActive = false;
      this._fireTimer = 0;
      this._fireWarnActive = false;
    }
  }

  _cameraShake(intensity, duration) {
    this._shakeIntensity = intensity;
    this._shakeDuration  = duration;
    this._shakeTimer     = 0;
  }

  _dropWaypoint(consumeItem = false) {
    const p = this.player.pos;
    this._waypoint = { x: p.x, z: p.z };
    this.particles.burst(p.x, p.y, p.z, 'pickup', 12);
    this.ui.notify('🚩 Waypoint set! Load the Waypoint Navigator brain to send your bot here.');
    for (const bot of [this.scrapBot, this.scrapBot2]) {
      if (bot?._adapter) bot._adapter.waypoint = this._waypoint;
    }
    if (consumeItem) {
      this.player.removeItem('waypoint_flag', 1);
      this.ui.updateHotbar(this.player);
      this.xpSystem.gain(3);
    }
    this._placeWaypointFlag(p.x, p.z);
    this.foreman?.onEvent('waypoint_drop', {});
    this.saveSystem.markDirty();
  }

  _placeWaypointFlag(x, z) {
    if (!this._waypointFlagMesh) {
      const group = new THREE.Group();
      // Pole
      const poleMat = new THREE.MeshLambertMaterial({ color: 0x999999 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), poleMat);
      pole.position.y = 1.5;
      group.add(pole);
      // Flag panel
      const flagMat = new THREE.MeshLambertMaterial({ color: 0xff44cc, emissive: 0x881066, emissiveIntensity: 0.5, side: THREE.DoubleSide });
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.04), flagMat);
      flag.position.set(0.35, 2.85, 0);
      group.add(flag);
      this.renderer.scene.add(group);
      this._waypointFlagMesh = group;
      this._waypointFlagBase = 0; // animated y offset base
    }
    // Find surface y: scan down from height 5 to find topmost solid block
    let surfY = 1;
    for (let sy = 5; sy >= 0; sy--) {
      if (this.world.getBlock(Math.round(x), sy, Math.round(z)) !== 0) { surfY = sy + 1; break; }
    }
    this._waypointFlagBaseY = surfY;
    this._waypointFlagMesh.position.set(x, surfY, z);
    this._waypointFlagMesh.visible = true;
  }

  _spawnAirdrop() {
    const p = this.player.pos;
    // Pick a random open position 10-30 blocks away
    const angle = Math.random() * Math.PI * 2;
    const dist  = 10 + Math.random() * 20;
    const tx = Math.max(1, Math.min(126, Math.round(p.x + Math.sin(angle) * dist)));
    const tz = Math.max(1, Math.min(126, Math.round(p.z + Math.cos(angle) * dist)));
    // Find ground level
    let ty = 1;
    for (let y = 2; y <= 4; y++) {
      if (!this.world.getBlock(tx, y, tz)) { ty = y - 1; break; }
    }
    const crate_y = ty + 1;
    if (this.world.getBlock(tx, crate_y, tz)) return; // already blocked

    // Compass direction for toast
    const dx = tx - p.x, dz = tz - p.z;
    const deg = ((Math.atan2(dx, dz) * 180 / Math.PI) + 360) % 360;
    const compass = ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg / 45) % 8];

    this.ui.notify(`📦 Supply drop incoming — ${compass} of you!`);
    this.foreman.onEvent('airdrop_incoming', {});

    // Smoke trail descending over 2 seconds, then place crate
    const trail = (y, delay) => setTimeout(() => {
      this.particles.burst(tx, y, tz, 'smoke', 6);
    }, delay);
    trail(7, 0); trail(5, 400); trail(3, 800); trail(2, 1200);

    setTimeout(() => {
      this.world.setBlock(tx, crate_y, tz, B.CRATE);
      this.particles.burst(tx, crate_y + 0.5, tz, 'ember', 14);
      this.audio.mine(B.CRATE);
      this._airdropCrates.add(`${tx},${crate_y},${tz}`);
      this.achievements.track('airdrop_find', {});
      this.ui.notify(`📦 Supply drop landed! Find it at approx. (${tx}, ${tz})`);
    }, 1500);
  }

  _sortInventory() {
    const inv = this.player.inventory;
    // Collect all stacks, merge same-id items within stack limit, then sort
    const totals = new Map();
    for (const slot of inv) {
      if (!slot) continue;
      totals.set(slot.id, (totals.get(slot.id) ?? 0) + slot.qty);
    }
    inv.fill(null);
    // Category order: brain/tools first, then devices, then materials
    const CATS = ['brain', 'tool', 'device', 'utility', 'material', 'block'];
    const sorted = [...totals.entries()].sort((a, b) => {
      const ca = CATS.indexOf(getItem(a[0])?.category ?? 'material');
      const cb = CATS.indexOf(getItem(b[0])?.category ?? 'material');
      if (ca !== cb) return ca - cb;
      return a[0].localeCompare(b[0]);
    });
    let i = 0;
    for (const [id, total] of sorted) {
      const maxStack = getItem(id)?.stackSize ?? 64;
      let rem = total;
      while (rem > 0 && i < inv.length) {
        const qty = Math.min(maxStack, rem);
        inv[i++] = { id, qty };
        rem -= qty;
      }
    }
    this.ui.updateHotbar(this.player);
    this.ui.openInventory(this.ui._currentStation ?? 'any');
    this.ui.notify('🗂 Inventory sorted  [I]');
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
    this.challenge.onCraft();
    this.xpSystem.gain(isNew ? 10 : 3);
    this.saveSystem.markDirty();
    this.audio.craft();
    this.particles.burst(
      this.player.pos.x, this.player.pos.y + 1, this.player.pos.z, 'craft', 18,
    );
    if (output === 'robot_helper' && !this.scrapBot.isActive) {
      setTimeout(() => this.scrapBot.activate(this.player.pos), 1000);
    }
    // First-time craft notifications
    if (output === 'wrench' && !this._notifiedWrench) {
      this._notifiedWrench = true;
      setTimeout(() => this.ui.notify('🔧 Crafted! Press E to see what else you can make.'), 1800);
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

    // Flying machine — override gravity, boost speed, allow vertical movement
    if (this._flyingMode) {
      this.player.vel.y = 0;
      this.player.fuelBoosted = true;
      // Vertical flight: Space for up, Shift for down
      if (this.player._keys && this.player._keys['Space']) {
        this.player.pos.y += 6.0 * dt;
      }
      if (this.player._keys && (this.player._keys['ShiftLeft'] || this.player._keys['ShiftRight'])) {
        this.player.pos.y -= 5.0 * dt;
      }
      // Keep player above the world floor and below the sky limit
      if (this.player.pos.y < 1) this.player.pos.y = 1;
      if (this.player.pos.y > 40) this.player.pos.y = 40;
      // Trail particles while flying
      this._flightTrailTimer = (this._flightTrailTimer ?? 0) + dt;
      if (this._flightTrailTimer > 0.15) {
        this._flightTrailTimer = 0;
        this.particles.burst(
          this.player.pos.x, this.player.pos.y + 0.3, this.player.pos.z, 'smoke', 1
        );
      }
    }

    // Hazard block damage (acid puddle, etc.)
    this._tickHazards(dt);

    // Storm lightning damage — sheltered if solid block overhead within 3 tiles
    this._tickStormDamage(dt);

    this.dayNight.tick(dt);

    // Weather
    const weatherChanged = this.weather.tick(dt, this.player.pos, this.renderer.ambientLight);
    if (weatherChanged) {
      const evtName = `weather_${this.weather.state}`;
      this.foreman.onEvent(evtName, {});
      this.ui.setWeather(this.weather.state, this.weather.intensityValue);
    }

    // Player death (hp = 0) or fall off world
    const fell = this.player.pos.y < -5;
    if ((this.player.hp <= 0 || fell) && !this._flyingMode) {
      this.player.pos.set(8, 2, 5);
      this.player.vel?.set(0, 0, 0);
      this.player.hp = 40;  // respawn at 40 HP — don't start full
      this.ui.setHealth(40, this.player.maxHp);
      this.ui.notify(fell ? '🏁 Respawned at the yard gate. (−60 HP)' : '💀 You blacked out. Respawned at the gate. (−60 HP)');
      // Force Earl's death quip — always visible even if he was just speaking
      this.foreman.say('die', { force: true });
      this.foreman.onEvent('player_die', {});
      // Disable flying mode on death
      if (this._flyingMode) {
        this._flyingMode = false;
        this.renderer.camera.fov = 70;
        this.renderer.camera.updateProjectionMatrix();
      }
    }

    // Night goggles: boost ambient light at night
    if (this.player.hasTool('night_goggles') && this.dayNight.isNight) {
      this.renderer.ambientLight.intensity = Math.min(0.6,
        this.renderer.ambientLight.intensity + 0.4);
    }
    // Headlamp: auto-off if item lost; pulse when on at night
    if (this._headlampOn && !this.player.hasTool('headlamp')) {
      this._headlampOn = false;
      this.renderer.setHeadlamp(false);
    }
    // Waypoint flag animation + sparkle pulse
    if (this._waypoint) {
      this._waypointMarkerTimer = (this._waypointMarkerTimer ?? 0) + dt;
      if (this._waypointMarkerTimer >= 3) {
        this._waypointMarkerTimer = 0;
        this.particles.burst(this._waypoint.x, 1.5, this._waypoint.z, 'pickup', 5);
      }
      if (this._waypointFlagMesh) {
        const t = performance.now() * 0.001;
        this._waypointFlagMesh.position.y = (this._waypointFlagBaseY ?? 0) + Math.sin(t * 1.8) * 0.1;
        this._waypointFlagMesh.rotation.y = t * 0.5;
      }
    }
    // Supply drop countdown (flare_pack halves interval)
    this._airdropTimer -= dt;
    if (this._airdropTimer <= 0) {
      const hasFlarePack = this.player.hasTool('flare_pack');
      this._airdropTimer = (hasFlarePack ? 45 : 90) + Math.random() * (hasFlarePack ? 45 : 90);
      this._spawnAirdrop();
    }

    // Grapple hook: extends mining / targeting reach
    this.renderer.raycaster.far = this.player.hasTool('grapple_hook') ? 10 : 6;
    this.particles.tick(dt);
    this.projectiles.tick(dt, this.world, (hit) => this._onProjectileHit(hit));
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

    this._tickLapTimer(dt);
    this._tickGhostPlayback(dt);
    this._tickBotTrackSparks(dt);

    // Speech bubble projection
    this._updateSpeechBubble(this.scrapBot,  this._speechEl1);
    this._updateSpeechBubble(this.scrapBot2, this._speechEl2);

    this.audio.tick(dt, this.player, this.world);
    this.saveSystem.tick(dt);
    this.challenge.tick(dt);

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

    // Ore Scanner HUD — active when ore_scanner is in the active hotbar slot
    this._tickOreScanner();
    // Signal Radio HUD — active when signal_radio is in the active hotbar slot
    this._tickSignalRadio();

    // Band entry detection → toast + sky/fog color shift
    const bandIdx = this.world.getBandIndex(Math.floor(this.player.pos.z));
    if (bandIdx !== this._lastBandIndex) {
      if (this._lastBandIndex >= 0) {
        this.ui.showZoneToast(this.world.getBandName(Math.floor(this.player.pos.z)));
        this.foreman.onEvent(`enter_band_${bandIdx}`, {});
        // Notify on first entry to special bands
        if (bandIdx === 2 && !this._notifiedBand2) {
          this._notifiedBand2 = true;
          this.ui.notify('🏭 Circuit City — electronics-grade scrap!');
        }
        if (bandIdx === 3 && !this._notifiedBand3) {
          this._notifiedBand3 = true;
          this.ui.notify('☠️ The Deep Yard — extreme hazard zone!');
        }
      }
      this._lastBandIndex = bandIdx;
      this._applyBandSky(bandIdx);
      this.audio._currentBand = bandIdx;
      this.audio.playBandAmbient(bandIdx);
    }

    // Nearby station hint
    const p = this.player.pos;
    const nearby = this.world.getNearbyInteractives(p.x, p.y, p.z, 2.5);
    const nearStation = nearby[0]?.station ?? null;
    if (nearStation !== this._lastNearStation) {
      this._lastNearStation = nearStation;
      if (nearStation) this.foreman.onEvent(`near_${nearStation}`, {});
    }

    // Radio tower proximity — hint once when player first gets within 10 blocks
    if (!this._towerNearNotified && !this._towerActivated) {
      const tower = this.world.landmarks?.radio_tower;
      if (tower && (p.x - tower.x) ** 2 + (p.z - tower.z) ** 2 < 100) {
        this._towerNearNotified = true;
        this.foreman.onEvent('near_tower', {});
      }
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

    // Auto-help: show help overlay after 15s of play without any key press
    if (locked && !this._helpWasShown && !this.ui.isOpen && !this.tileEditor.isOpen && !this._tutorialActive) {
      if (this._helpAutoTimer < 0) this._helpAutoTimer = 0;
      this._helpAutoTimer += dt;
      if (this._helpAutoTimer >= 15) {
        this._helpWasShown = true;
        this._toggleHelp(true);
      }
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

    // Bot sensor dashboard
    this._updateBotSensorHUD();

    // Camera shake (grenade impact)
    if (this._shakeDuration > 0) {
      this._shakeTimer  = (this._shakeTimer ?? 0) + dt;
      this._shakeDuration -= dt;
      const k = this._shakeIntensity * (this._shakeDuration > 0 ? 1 : 0);
      this.renderer.camera.position.x += (Math.random() - 0.5) * k;
      this.renderer.camera.position.y += (Math.random() - 0.5) * k;
    }

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

    // Mark tiles newly visible to the player
    const fpx = Math.round(this.player.pos.x), fpz = Math.round(this.player.pos.z);
    const VIS_R = 5;
    for (let fdz = -VIS_R; fdz <= VIS_R; fdz++) {
      for (let fdx = -VIS_R; fdx <= VIS_R; fdx++) {
        if (fdx * fdx + fdz * fdz > VIS_R * VIS_R) continue;
        const fwx = fpx + fdx, fwz = fpz + fdz;
        if (fwx >= 0 && fwx < 128 && fwz >= 0 && fwz < 128) this._fogMap[fwz * 128 + fwx] = 1;
      }
    }

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
        const explored = wx >= 0 && wx < 128 && wz >= 0 && wz < 128 ? this._fogMap[wz * 128 + wx] : 0;
        const m = explored ? 1 : 0.12;
        const i = (dz * SIZE + dx) * 4;
        img.data[i]   = r * m | 0; img.data[i+1] = g * m | 0;
        img.data[i+2] = b * m | 0; img.data[i+3] = 255;
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
    // Waypoint flag (magenta)
    if (this._waypoint) {
      const wx_ = Math.floor(this._waypoint.x) - px + RADIUS;
      const wz_ = Math.floor(this._waypoint.z) - pz + RADIUS;
      if (wx_ >= 0 && wx_ < SIZE && wz_ >= 0 && wz_ < SIZE) {
        ctx.fillStyle = '#ff44cc';
        ctx.fillRect(wx_ - 2, wz_ - 2, 5, 5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(wx_, wz_ - 2, 1, 4);
      }
    }
    // Crystal cave dot (purple)
    const crystalLm = this.world.landmarks?.['crystal_cave'];
    if (crystalLm) {
      const cx_ = crystalLm.x - px + RADIUS;
      const cz_ = crystalLm.z - pz + RADIUS;
      if (cx_ >= 0 && cx_ < SIZE && cz_ >= 0 && cz_ < SIZE) {
        ctx.fillStyle = '#9933ff';
        ctx.fillRect(cx_ - 1, cz_ - 1, 3, 3);
      }
    }
    // Airdrop crate dots (blinking yellow-green)
    const blinkOn = Math.floor(Date.now() / 500) % 2 === 0;
    if (blinkOn) {
      for (const key of this._airdropCrates) {
        const [acx, , acz] = key.split(',').map(Number);
        const ax = acx - px + RADIUS, az = acz - pz + RADIUS;
        if (ax >= 0 && ax < SIZE && az >= 0 && az < SIZE) {
          ctx.fillStyle = '#aaff44';
          ctx.fillRect(ax - 1, az - 1, 3, 3);
        }
      }
    }
  }

  _updateBotSensorHUD() {
    const hudEl = document.getElementById('bot-sensor-hud');
    if (!hudEl) return;

    const bot = (this.scrapBot?._brainMode ? this.scrapBot : null)
             ?? (this.scrapBot2?._brainMode ? this.scrapBot2 : null);

    if (!bot || !bot._robot || !bot._adapter) {
      hudEl.classList.remove('active');
      return;
    }
    hudEl.classList.add('active');

    const robot   = bot._robot;
    const adapter = bot._adapter;

    const SHOW = [
      { id: 'distance_ahead', label: 'DIST AHEAD', digital: false },
      { id: 'bumped',         label: 'BUMPED',      digital: true  },
      { id: 'ore_nearby',     label: 'ORE SIGNAL',  digital: false },
      { id: 'waypoint_dist',  label: 'WP DIST',     digital: false },
      { id: 'brightness',     label: 'LIGHT',        digital: false },
      { id: 'player_near',    label: 'PLAYER NEAR',  digital: true  },
    ];

    const rowsEl = document.getElementById('bsh-rows');
    if (rowsEl && !this._bshBuilt) {
      this._bshBuilt = true;
      rowsEl.innerHTML = SHOW.map(s => `
        <div class="bsh-row">
          <span class="bsh-key">${s.label}</span>
          <div class="bsh-bar-wrap"><div class="bsh-bar-fill" id="bsh-bar-${s.id}"></div></div>
          <span class="bsh-val" id="bsh-val-${s.id}">—</span>
        </div>`).join('');
    }

    for (const s of SHOW) {
      const def = getSensor(s.id);
      if (!def) continue;
      const raw = def.read(robot, adapter);
      const num = typeof raw === 'boolean' ? (raw ? 1 : 0) : (Number(raw) || 0);

      const valEl = document.getElementById(`bsh-val-${s.id}`);
      const barEl = document.getElementById(`bsh-bar-${s.id}`);
      if (valEl) valEl.textContent = s.digital ? (raw ? 'YES' : 'no') : num.toFixed(2);
      if (barEl) {
        barEl.style.width = Math.round(num * 100) + '%';
        const isAlert = (s.id === 'bumped' && raw) || (s.id === 'distance_ahead' && num < 0.18) || (s.id === 'ore_nearby' && num > 0.65);
        const isWarn  = !isAlert && (s.id === 'brightness' && num > 0.75 || s.id === 'ore_nearby' && num > 0.3);
        barEl.classList.toggle('alert', isAlert);
        barEl.classList.toggle('warn',  isWarn);
      }
    }

    // Ore detection tracking — fires once per 10s when ore_nearby > 0.6
    const oreDef = getSensor('ore_nearby');
    if (oreDef) {
      const oreVal = oreDef.read(robot, adapter);
      if (oreVal > 0.6) {
        if (this._oreDetectCooldown > 0) {
          this._oreDetectCooldown--;
        }
        if (this._oreDetectCooldown <= 0) {
          this._oreDetectCooldown = 600; // ~10s at 60fps
          this.achievements?.track('ore_detect');
          this.foreman?.onEvent('ore_detect', {});
        }
      } else {
        this._oreDetectCooldown = 0;
      }
    }

    // Motor bars (center-origin ±50%)
    const driveVal = document.getElementById('bsh-drive-val');
    const driveBar = document.getElementById('bsh-drive-bar');
    const turnVal  = document.getElementById('bsh-turn-val');
    const turnBar  = document.getElementById('bsh-turn-bar');

    if (driveBar && driveVal) {
      const dp = robot.drivePower;
      driveVal.textContent = dp.toFixed(1);
      driveBar.style.left       = (dp >= 0 ? 50 : 50 + dp * 50) + '%';
      driveBar.style.width      = Math.abs(dp) * 50 + '%';
      driveBar.style.background = dp >= 0 ? '#00cc66' : '#ff6644';
    }
    if (turnBar && turnVal) {
      const tp = robot.turnPower;
      turnVal.textContent = tp.toFixed(1);
      turnBar.style.left       = (tp >= 0 ? 50 : 50 + tp * 50) + '%';
      turnBar.style.width      = Math.abs(tp) * 50 + '%';
      turnBar.style.background = '#f0b429';
    }

    // Battery meter
    const battVal = document.getElementById('bsh-battery-val');
    const battBar = document.getElementById('bsh-battery-bar');
    if (battVal && battBar && bot) {
      const bPct = bot.battery ?? 100;
      battVal.textContent = Math.round(bPct) + '%';
      battBar.style.width = bPct + '%';
      battBar.style.background = bPct > 50 ? '#44cc44' : bPct > 20 ? '#f0b429' : '#cc2222';
    }
  }

  _useActiveItem() {
    const item = this.player.activeItem;
    if (!item) return;
    const p = this.player.pos;
    switch (item.id) {
      case 'repair_kit': {
        const healed = Math.min(35, this.player.maxHp - this.player.hp);
        this.player.removeItem('repair_kit', 1);
        this.player.heal(35);
        this.xpSystem.gain(5);
        this.ui.notify(`🩹 Repair kit used — +${healed > 0 ? healed : 35} HP restored!`);
        this.audio.pickup();
        this.particles.burst(p.x, p.y + 1, p.z, 'pickup', 10);
        break;
      }
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
      case 'headlamp':
        this._headlampOn = !this._headlampOn;
        this.renderer.setHeadlamp(this._headlampOn);
        this.ui.notify(this._headlampOn ? '🔦 Headlamp ON' : '🔦 Headlamp OFF');
        this.audio.pickup();
        if (this._headlampOn) this.achievements.track('headlamp_use', {});
        break;
      case 'battery_dead': {
        // Charge at a forge: battery_dead → battery_pack
        const nearForge = this.world.getNearbyInteractives(p.x, p.y, p.z, 4)
          .some(b => b.station === 'forge');
        if (nearForge) {
          this.player.removeItem('battery_dead', 1);
          this.player.addItem('battery_pack', 1);
          this.ui.notify('🔋 Dead battery recharged at the forge!');
          this.audio.brainLoad?.() ?? this.audio.pickup();
          this.particles.burst(p.x, p.y + 1, p.z, 'circuit', 8);
          this.xpSystem.gain(10);
        } else {
          this.ui.notify('⚡ Take a dead battery to a Forge to recharge it.');
        }
        break;
      }
      case 'battery_pack':
        this.player.removeItem('battery_pack', 1);
        this.xpSystem.gain(15);
        this.ui.notify('🔋 Battery pack charged — +15 XP!');
        this.audio.pickup();
        this.particles.burst(p.x, p.y + 1, p.z, 'circuit', 8);
        break;
      case 'charging_pad': {
        const targetBot = this.scrapBot?.isActive ? this.scrapBot : (this.scrapBot2?.isActive ? this.scrapBot2 : null);
        if (targetBot) {
          targetBot.chargeBattery(50);
          this.ui.notify(`🔌 Charging pad used — bot battery +50% (now ${Math.round(targetBot.battery)}%)`);
          this.audio.brainLoad();
          this.particles.burst(targetBot._pos.x, 1.5, targetBot._pos.z, 'circuit', 10);
        } else {
          this.ui.notify('No active bot to charge.');
        }
        break;
      }
      case 'waypoint_flag':
        this._dropWaypoint(true);
        return;
      case 'flying_machine':
        if (!this.player.hasTool('flying_machine') && !this._flyingMode) {
          this.ui.notify('You need a Flying Machine in your inventory to activate flight.');
          break;
        }
        this._flyingMode = !this._flyingMode;
        if (this._flyingMode) {
          this.player.vel.y = 0;
          this.ui.notify('✈️ Flying Machine engaged! Use WASD to fly. Press G to land.');
          this.particles.burst(p.x, p.y + 0.5, p.z, 'confetti', 20);
          this.foreman.onEvent('craft_flying_machine', {});
          this.renderer.camera.fov = 85; // higher FOV for flight
          this.renderer.camera.updateProjectionMatrix();
        } else {
          this.ui.notify('🛬 Flying Machine disengaged. Welcome back to earth.');
          this.particles.burst(p.x, p.y + 0.5, p.z, 'smoke', 10);
          this.renderer.camera.fov = 70; // restore normal FOV
          this.renderer.camera.updateProjectionMatrix();
        }
        break;
      case 'scrap_grenade':
        this._throwGrenade();
        return; // _throwGrenade handles removeItem + updateHotbar
      default: {
        const def = getItem(item.id);
        const id = item.id.replace(/_/g, ' ');
        if (def?.tool) {
          this.ui.notify(`🔧 ${def.name} — ${def.desc}`);
        } else if (def?.category === 'material' || def?.category === 'block') {
          this.ui.notify(`📦 ${def.name} is a crafting material. Open Workshop [E] to see recipes.`);
        } else if (def?.category === 'maker') {
          this.ui.notify(`🧠 ${def.name} — used in the Maker Bench [T] for robot programs.`);
        } else if (def) {
          this.ui.notify(`${def.icon} ${def.name} — ${def.desc}`);
        } else {
          this.ui.notify(`${id} has no use action (yet!)`);
        }
        break;
      }
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
  _tickLapTimer(dt) {
    const ls = this._lapState;
    if (!ls.lapsEl) return;

    // Use whichever bot is running a brain program
    const bot = (this.scrapBot?._brainMode ? this.scrapBot : null)
             ?? (this.scrapBot2?._brainMode ? this.scrapBot2 : null);
    if (!bot?.isActive) {
      if (ls.inGate) { ls.inGate = false; }
      return;
    }

    // Record ghost frames at 10 Hz during active lap
    if (ls.lapStart > 0) {
      this._ghostRecTimer += dt;
      if (this._ghostRecTimer >= 0.1) {
        this._ghostRecTimer = 0;
        this._ghostFrames.push([
          +bot._pos.x.toFixed(2),
          +bot._pos.z.toFixed(2),
          +(bot._mesh?.rotation.y ?? 0).toFixed(3),
          (performance.now() - ls.lapStart) | 0,
        ]);
      }
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
        if (improved) {
          this._bestGhostFrames = this._ghostFrames.slice();
          this.saveSystem.markDirty();
          setTimeout(() => this.foreman.onEvent('bot_lap_record', {}), 500);
        }
        setTimeout(() => ls.lapsEl?.classList.remove('show'), 5000);
      }
      // New lap starting — reset recording and ghost playback
      this._ghostFrames   = [];
      this._ghostRecTimer = 0;
      this._ghostPbTime   = 0;
      ls.lapStart = now;
      if (this._bestGhostFrames?.length) {
        setTimeout(() => this.foreman.onEvent('ghost_lap_start', {}), 400);
      }
    }
    ls.inGate = inGate;
  }

  _getGhostMesh() {
    if (!this._ghostBotMesh) {
      const geo = new THREE.BoxGeometry(0.55, 0.85, 0.7);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x00ffcc, emissive: 0x00aa88, emissiveIntensity: 0.5,
        transparent: true, opacity: 0.35, depthWrite: false,
      });
      this._ghostBotMesh = new THREE.Mesh(geo, mat);
      this._ghostBotMesh.visible = false;
      this.renderer.scene.add(this._ghostBotMesh);
    }
    return this._ghostBotMesh;
  }

  _tickGhostPlayback(dt) {
    const ghost = this._getGhostMesh();
    const frames = this._bestGhostFrames;
    const ls = this._lapState;
    const ghostEl = document.getElementById('ghost-indicator');

    if (!frames?.length || !ls.lapStart) {
      ghost.visible = false;
      ghostEl?.classList.remove('show');
      return;
    }

    this._ghostPbTime += dt * 1000;

    // Linear scan — max ~300 frames, negligible cost
    let frame = frames[0];
    for (let i = 1; i < frames.length; i++) {
      if (frames[i][3] > this._ghostPbTime) break;
      frame = frames[i];
    }

    ghost.position.set(frame[0], 1.42, frame[1]);
    ghost.rotation.y = frame[2];
    ghost.visible = true;
    ghostEl?.classList.add('show');
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
