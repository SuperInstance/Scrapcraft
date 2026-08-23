import * as THREE from 'three';
import { World } from './World.js';
import { Renderer } from './Renderer.js';
import { Player, EYE_HEIGHT } from './Player.js';
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
import { SpectatorCoach } from './radio/SpectatorCoach.js';
import { SaveSystem } from './SaveSystem.js';
import { PrestigeSystem } from './prestige/Prestige.js';
import { XPSystem } from './XPSystem.js';
import { WeatherSystem } from './WeatherSystem.js';
import { ProjectileSystem } from './ProjectileSystem.js';
import { Challenge } from './Challenge.js';
import { DailyContract } from './DailyContract.js';
import { WelcomeBack } from './WelcomeBack.js';
import { NightShiftClock } from './NightShift.js';
import { BotUpgrades, UPGRADE_DEFS } from './BotUpgrades.js';
import { ScrapExchange, EXCHANGE_POS, EXCHANGE_RADIUS } from './ScrapExchange.js';
import { OnboardingWizard } from './onboarding/OnboardingWizard.js';
import { SettingsPanel } from './onboarding/SettingsPanel.js';
import { ColdStartGate, sparkFirstGreeting } from './onboarding/coldstart.js';
import { DelightGate, delightLine, FIRST_DENT_RECOVERY, BATTERY_RECOVERY } from './onboarding/delights.js';
import { AmbientLife, ambientLine, AMBIENT_NOTABLE } from './world/AmbientLife.js';
import { OpeningCinematic } from './world/OpeningCinematic.js';
import { CutsceneDirector } from './cinema/CutsceneDirector.js';
import { TutorialEngine, renderMissionCard } from './onboarding/tutorial/index.js';
import { generateVeteranSave, applyVeteranProfile, veteranRideSummary, VETERAN_SAVE_KEY, LIVE_SAVE_KEY } from './veteran/veteranRide.js';
import { sparkGateway } from './spark/index.js';
import { RaceBoard, NPC_GHOSTS, BEAT_QUIPS } from './RaceBoard.js';
import { Codex } from './Codex.js';
import { ClassRoom } from './ClassRoom.js';
import { ChallengeSystem } from './ChallengeSystem.js';
import { resolveRenderMode } from './renderMode.js';
import { createPanicState, consumePanic, panicStatus, noteCrash, noteTaskComplete, smashTargets, rollLootCache, SMASHABLE_BLOCKS } from './PanicButton.js';
import { PLAQUES } from './data/plaques.js';
import { voiceOut, voiceIn, announceRaceStart, announceLap, announcePersonalBest, announceVictory, preloadAnnouncements } from './voice/index.js';
import { CompanionRoster, EARL_PAIRING_LINE } from './companion/registry.js';
import { RivetAvatar } from './companion/avatar.js';
import { CompanionGate, gateDeliveryLine } from './companion/entry.js';
import { QuestSystem, CAMPAIGN } from './quests/index.js';
import { openMosLedgerPanel } from './quests/MosLedger.js';
import { ConceptLedger } from './learning/ConceptLedger.js';
import { TeachBack } from './learning/TeachBack.js';
import { TouchControls, touchSupported } from './touch/TouchControls.js';

export class Game {
  /** @param {HTMLCanvasElement} canvas
   *  @param {object} [opts] { seed?: number } — world seed (?seed= in the
   *  URL, see main.js). Default 1337, the yard kids know. */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.seed = Number.isFinite(opts.seed) ? opts.seed : 1337;
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
    this._clock           = 0;   // session seconds — backs ambient chatter gaps

    // Tutorial state machine (shown on first load)
    this._tutorialActive  = false;
    this._tutorialStep    = -1; // legacy — step state now lives in TutorialEngine
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
    this._firstToolCrafted = false;

    // Naming ceremony — shown once per game
    this._namingCeremonyShown = false;

    // Ghost-racer intro — shown once per game
    this._ghostRacerIntroShown = false;

    // Opening cinematic — world-before-menu orbit (set up in start())
    this._openingCinematic = null;

    // Cinema director (cutscenes wired in start())
    this.cinema = null;

    // Tutorial engine (wired in _startTutorial)
    this._tutorialEngine = null;

    // Veteran ride — the once-per-session offer guard (the fork at the gate)
    this._veteranRideOffered = false;

    // Touch layer — null until init() proves the device wants it. Desktop
    // (touchSupported === false) never builds one, so its paths stay identical.
    this.touch       = null;
    this._touchMode  = false;

    // Loop de-churn caches — floodlight throttle + last-skill badge cache
    this._floodTimer     = 0;
    this._lastSkillId    = null;
    this._lastSkillCount = -1;
  }

  init() {
    this.world    = new World(128, 128, 10);
    this.world.generate(this.seed);

    // Workshop OOM hardening — ?lite=1 flag / deviceMemory<4 heuristic decides
    // the render budget before anything heavy is built.
    this.renderMode = resolveRenderMode({
      search: typeof location !== 'undefined' ? location.search : '',
      deviceMemory: typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined,
      devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    });
    this.renderer = new Renderer(this.canvas, { lite: this.renderMode.lite });
    this.renderer.rebuildMeshes(this.world);

    // Translucent ghost block shown when hovering a placement target
    this._ghostMat  = new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.4, depthWrite: false });
    this._ghostMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this._ghostMat);
    this._ghostMesh.visible = false;
    this.renderer.scene.add(this._ghostMesh);

    this.player = new Player(this.renderer.camera, this.world);
    this.player.pos.set(8, 2, 5);

    // Wrap addItem to feed the Codex — discover items as the player acquires them.
    // (this.codex is initialized below after the import is done)
    // Cold-start gate: Spark's first hello fires on the FIRST item pickup —
    // minute ~2, offline-safe, never gated on the Tile Editor again.
    this._coldstart = new ColdStartGate(
      typeof localStorage !== 'undefined' ? localStorage : null,
    );
    // First-hour delights — once-ever wow beats (fail-soft: headless → mem-only)
    this._delights = new DelightGate(
      typeof localStorage !== 'undefined' ? localStorage : null,
    );
    const _origAdd = this.player.addItem.bind(this.player);
    this.player.addItem = (id, qty) => {
      this.codex?.discover(id) && this.achievements?.track('codex_discover', { count: this.codex.count });
      // (Tutorial's mine step fires at the block-break site — _completeMine.)
      // Spark's first appearance — campaign Ch 1's heart, pulled to minute 2
      if (!this._coldstart.sparkGreeted) {
        this._coldstart.markSparkGreeted();
        const firstItem = id;
        setTimeout(() => this._sparkFirstHello(firstItem), 600);
      }
      return _origAdd(id, qty);
    };

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
    this.scrapBot._slotKey = 'bot1';
    this.scrapBot.setUI(this.ui);
    this.scrapBot.setGame(this);

    // ── Dumpster-Fire Panic Button (fun-review #5) — crash counter per bot ──
    this._panicStates = { bot1: createPanicState(), bot2: createPanicState() };
    // Landmark plaques read (persisted — reading all ten is a tradition)
    try {
      this._plaquesRead = new Set(JSON.parse(localStorage.getItem('scrapcraft_plaques_read') ?? '[]'));
    } catch { this._plaquesRead = new Set(); }

    // Second bot — spawned at Level 5 (Engineer) via Shift+B
    this.scrapBot2 = null;

    this.weather = new WeatherSystem(this.renderer.scene, this.audio);
    // Expose weather to bot world adapters — updated by setGame() in ScrapBot
    this._weatherForBots = this.weather;

    // Ambient yard life — the small weather between the spine's beats.
    // Fail-soft by construction: missing systems no-op inside AmbientLife.
    this.ambientLife = new AmbientLife({
      scene: this.renderer?.scene ?? null,
      audio: this.audio,
      particles: this.particles,
      dayNight: this.dayNight,
      weather: this.weather,
    });
    this._lastAmbientReaction = -Infinity; // chatter budget for companion reactions

    this.projectiles = new ProjectileSystem(this.renderer.scene);

    this.tileEditor = new TileEditor(this);
    // ── Spectator/coach mode (radio) ──
    this.radio = new SpectatorCoach(this);
    this._spectator = false;
    this._demoBots = [];   // demo crew — SpectatorCoach manages the contents
    this.saveSystem   = new SaveSystem(this);
    // Never lose a session to a closed tab — save on exit / tab hide.
    // Registered HERE, immediately: anything that throws later in this
    // (very long) constructor must not leave the game unsaveable (P0 lesson).
    // (Autosave is 30s + drift-signature dirtying; a kid yanking the power
    // cord shouldn't lose a lap.)
    window.addEventListener?.('beforeunload', () => this.saveSystem.saveOnExit());
    window.addEventListener?.('pagehide',     () => this.saveSystem.saveOnExit());
    document.addEventListener?.('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveSystem.saveOnExit();
    });


    // ── LEARNING ENGINE — the concept ladder ─────────────────────────────
    // Constructed BEFORE saveSystem.load(): the v6 payload carries `concepts`
    // (cloud state_json), and _apply() hands them back here. The ledger also
    // keeps its own localStorage copy (scrapcraft_concepts_v1, spine-style).
    this.concepts = new ConceptLedger();
    this.concepts.load();
    this.teachBack = new TeachBack({ ledger: this.concepts });

    this.challenge    = new Challenge(this);
    this.dailyContract = new DailyContract(this);   // before load() — state restores below
    this.nightShiftClock = new NightShiftClock();    // away-clock (own localStorage key)
    this.botUpgrades  = new BotUpgrades();
    this.exchange     = new ScrapExchange();
    this.raceBoard    = new RaceBoard();
    this.codex        = new Codex();

    // ── THE COMPANION ROSTER — same yard, different friend, different journey ──
    // The roster proxies the active companion; `this.rivet` is the facade so a
    // decade of call sites (observe/say/talk/state/mood) route through the crew.
    // Per-companion speech: each in its own voice + emoji subtitle + avatar pulse.
    this.companions = new CompanionRoster({
      // Hold-V STT: start on demand, resolve when the key comes up
      listen: async () => {
        await voiceIn.start();
        return await new Promise(resolve => {
          const onUp = ev => {
            if (ev.code !== 'KeyV') return;
            document.removeEventListener('keyup', onUp);
            voiceIn.stop().then(resolve).catch(() => resolve(''));
          };
          document.addEventListener('keyup', onUp);
        });
      },
      speak: (companion, text, meta) => {
        voiceOut.speak(text, { voice: companion.persona.voice.name, emotion: meta?.event });
        this.ui?.notify(`${companion.persona.emoji} <b>${companion.name}:</b> ${text}`);
        if (companion.id === this.companions.activeId) {
          this.companionAvatar?.setTalking(Math.min(9000, 1500 + text.length * 55));
          this.companionAvatar?.react(meta?.mood);
        }
      },
      onRecruit: newcomer => {
        // Earl's pairing moment — the yard's cranky blessing
        this.ui?.notify(`☕ <b>Earl:</b> ${EARL_PAIRING_LINE}`);
        this.ui?.notify(`${newcomer.persona.emoji} <b>${newcomer.name}</b> joined the crew — press C to swap companions.`);
        this.saveSystem?.markDirty();
      },
    });
    this.rivet = this.companions; // legacy facade (observe/say/talk/state/mood)
    this.companionAvatar = new RivetAvatar(this.renderer.scene, this.companions.active.persona);
    this._avatarPersonaId = this.companions.activeId;

    // Session opener. NEW GAME → the yard gate: Earl's two questions deliver
    // the starter companion (the tutorial voice, the story pull). Returning
    // runs greet the active companion directly.
    setTimeout(() => {
      if (this.companions.needsEntryChoice) {
        this._companionGate = new CompanionGate({
          onChosen: (personaId, delivery) => {
            const starter = this.companions.beginRun(personaId);
            this._swapAvatar(starter.persona);
            this.ui?.notify(`🚪 ${delivery}`);
            starter.greet();
            this.saveSystem?.markDirty();
            // The last opening overlay just closed — the yard hands over the
            // controls (camera parks at the kid's eye, pointer lock engages).
            this._endOpening();
          },
        });
      } else {
        this.companions.greet();
      }
      // The starter companion narrates the early mission steps conversationally
      // (the mission card stays as the visual anchor; the walk-along is theirs)
      const c = this.companions.active;
      if (c.state.tier === 'stranger' && c.state.data.counters.blocksMined === 0) {
        c.say('Earl said mine five iron off that rust heap — hold left-click and I\'ll keep count. First one\'s free. They\'re all free. It\'s a junkyard.', { mood: 'happy' });
      }
    }, 2500);

    this.classRoom        = new ClassRoom(this.saveSystem, this.ui);
    this.challengeSystem  = new ChallengeSystem(this);
    this._exchangeNearNotified = false;
    this._raceBoardNearNotified = false;

    // Radio tower endgame — track installed components + activated state
    const TOWER_REQS = { signal_amp: 1, crystal_fragment: 5, circuit_board: 4, battery_pack: 3 };
    this._towerReqs      = TOWER_REQS;
    this._towerSlots     = Object.fromEntries(Object.keys(TOWER_REQS).map(k => [k, 0]));
    this._towerActivated = false;
    this._towerNearNotified = false;

    this.world.on('change', (d) => {
      this.renderer.applyBlockChange(d.x, d.y, d.z, d.prev ?? d.oldId ?? B.AIR, d.id);
      if (this.renderer.needsFullRebuild()) {
        this.renderer.rebuildMeshes(this.world);
      }
    });

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

    // Oval lap timer — Circuit City oval (x≈49, z≈84)
    this._ovalLapState = {
      inGate:   false,
      lapStart: 0,
      bestMs:   Infinity,
    };

    // Ghost lap replay — records best lap as [x,z,yaw,ms] frames, plays back translucent bot
    this._ghostFrames     = [];
    this._bestGhostFrames = [];
    this._ghostPbTime     = 0;
    this._ghostRecTimer   = 0;
    this._ghostBotMesh    = null;

    // Oval ghost replay
    this._ovalGhostFrames     = [];
    this._bestOvalGhostFrames = [];
    this._ovalGhostPbTime     = 0;
    this._ovalGhostRecTimer   = 0;

    // Uninitialized variable guards
    this._oreDetectCooldown = 0;
    this._nearTrackSeen    = false;
    this._nearOvalSeen     = false;
    this._nightBonusShown  = false;

    // ── Onboarding wizard (first-run only — 2 steps, no ceremony) ──
    this.onboarding = new OnboardingWizard(this);
    if (!this.onboarding.isComplete()) {
      setTimeout(() => this.onboarding.show(), 500);
    }
    this.onboarding.loadConfig();

    // ── Settings → Advanced (post-spawn, optional): the old wizard's AI +
    // Cloudflare steps live here now. Spark starts OFFLINE by default.
    this.settings = new SettingsPanel(this);
    {
      const helpInner = document.getElementById('help-inner');
      if (helpInner && !document.getElementById('help-settings-btn')) {
        const btn = document.createElement('button');
        btn.id = 'help-settings-btn';
        btn.textContent = '⚙ Advanced Settings';
        btn.style.cssText = 'margin-top:14px;width:100%;padding:9px 0;background:#0a0a0a;'
          + 'border:1px solid #2a2a2a;border-radius:8px;color:#999;cursor:pointer;'
          + "font-family:'Courier New',monospace;font-size:12px;letter-spacing:1px;";
        btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#f0b429'; btn.style.color = '#f0b429'; });
        btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#2a2a2a'; btn.style.color = '#999'; });
        btn.addEventListener('click', () => { this._toggleHelp(false); this.settings.open(); });
        helpInner.appendChild(btn);
      }
    }

    this._bindInput();

    // Wire health callback: any damage/heal updates HUD + flashes vignette on damage
    this.player.onDamage = (hp) => {
      this.ui.setHealth(hp, this.player.maxHp);
      if (hp < this.player.maxHp) this.ui.flashDamage();
      if (hp > 0 && hp < 15) this.achievements?.track('narrow_escape');
    };
    this.ui.setHealth(100, 100);

    // Load saved state — if none, show first-time greeting + tutorial.
    // Returning players get the Welcome Back flow after CLOCK IN (see start()).
    const loaded = this.saveSystem.load();

    // ── QUEST FRAMEWORK (lau-style declarative quests) ─────────────────────
    // Tracker + Logbook over the same event stream the foreman quips and the
    // companions bond on. Old saves migrate: Earl's chain index → completed quests.
    this.quests = new QuestSystem(this, CAMPAIGN);
    // Prestige — Earl's Back Room (marks from arc / Midnight-Race completion).
    // Perk effects are read live from achievements, never stored twice.
    this.prestige = new PrestigeSystem(this);
    this.prestige.load();
    this.quests.migrateLegacySave(this.foreman._questIndex ?? 0);

    // Autosave insurance: every mutation path (XP gain, item add/remove,
    // damage/heal, achievement track) now dirties the save by construction.
    this.saveSystem._hookMutations();

    // ── Cold start: Earl conscripts at spawn (campaign Ch 1's heart) ──────
    // Fresh save + wizard already done → greet now. Fresh save + wizard
    // pending → the wizard's finish() hands off via _onOnboardingComplete().
    // Returning players: never re-greeted (the gate persists in localStorage).
    this._freshGame = !loaded;
    if (loaded) {
      this._returningSession = true;
    } else if (this.onboarding.isComplete()) {
      setTimeout(() => this.foreman.greetPlayer(), 1200);
      this._startTutorial();
    }

    // Night Shift (comp-kimi port) — what the bot dragged in while away.
    // Runs at init, not on Start: the clock self-persists, so a tab refresh
    // can't re-trigger a payout. Owning/braining a bot is the ticket in —
    // the Gate Edition starter counts (it's a real bot, just a rough one).
    const botHasBrain = !!this.scrapBot?._brainMode
      || !!(this.player?.crafted?.has?.('robot_helper'))
      || !!(this.player?.crafted?.has?.('robot_helper_starter'));
    this._nightShiftResult = this.nightShiftClock.sessionStart(botHasBrain);
    if (this._nightShiftResult) {
      for (const [id, qty] of Object.entries(this._nightShiftResult.loot)) {
        this.player.addItem(id, qty);
      }
      this.xpSystem.gain(Math.min(60, 10 + Math.floor(this._nightShiftResult.minutes / 30) * 5));
      this.saveSystem.markDirty();
    }

    // (exit handlers live at the top of the constructor — see SaveSystem)

    // Paint today's contract chip right away (progress may be mid-contract)
    this.ui?.updateDaily(this.dailyContract, this.dailyContract.progress, this.dailyContract.claimed);

    // One comeback cluster, one voice: the night-shift payout is the chip's
    // notification row (transient), the card carries the full loot table.
    if (this._nightShiftResult) {
      this.ui?.notifyNightShift(this._nightShiftResult, this.scrapBot?.personality?.name);
    }

    // Classroom join prompt — shown if a Worker URL is configured and no session exists
    setTimeout(() => this.classRoom.showJoinPromptIfNeeded(), 2000);

    this.ui.updateHotbar(this.player);

    // Auto-suggest lite mode when the device heuristic tripped it (no ?lite flag given)
    if (this.renderMode.auto && this.renderMode.lite) {
      this.ui.notify('🪫 Weak hardware detected — <b>LITE MODE</b> on: low-res render, shadows off. Reload with <b>?lite=0</b> for full detail.');
    }

    this._initTouch();
  }

  // ── Touch layer (fail-soft, strictly feature-detected) ────────────────

  /** Pointer lock doesn't exist on touch — phones get a virtual joystick +
   *  look-drag instead. Every gesture rides the SAME mine/place paths the
   *  mouse uses; nothing here runs (or changes) on a desktop env. */
  _initTouch() {
    let supported = false;
    try {
      supported = touchSupported({
        maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
        ontouchstart: typeof window !== 'undefined' && 'ontouchstart' in window,
        matchMedia: typeof window !== 'undefined' && window.matchMedia
          ? window.matchMedia.bind(window) : undefined,
      });
    } catch { supported = false; }
    if (!supported) return;

    try {
      this._touchMode = true;
      this.touch = new TouchControls({
        onLook:  (dx, dy) => this.player?.addLook(dx, dy),
        onMove:  (nx, ny) => this.player?.setTouchMove(nx, ny),
        // Same hold-to-mine flag the LMB handlers drive
        onMineStart: () => { this._mineDown = true; },
        onMineStop:  () => { this._mineDown = false; this._cancelMine(); },
        onPlace: () => this._tryPlace(),          // the contextmenu place path
        onJump:  () => this.player?.jump(),
        onInteract: () => this._touchInteract(),
        onHotbar: (i) => { if (this.player) this.player.hotbarIndex = i; },
      });
      this.touch.attach(document.body) || (() => {   // attach validated: no DOM, no touch mode
        this._touchMode = false;
        this.touch = null;
      })();
      if (!this.touch) return;
      // Wake the touch physics path (gravity + camera follow) and tell the
      // kid what the left thumb does — once.
      this.player.setTouchMove(0, 0);
      this.ui?.notify('📱 Touch controls on — left stick moves, drag right to look.');
    } catch (e) {
      this._touchMode = false;
      this.touch = null;
      console.warn('[Game] Touch layer failed to attach — mouse/keyboard only.', e);
    }
  }

  /** The touch ⚒ button rides the E-key's core path: close if open, else
   *  open the nearest station's workshop tab. */
  _touchInteract() {
    try {
      if (!this.ui || !this.player) return;
      if (this.ui.isOpen) { this.ui.closeInventory(); return; }
      const p = this.player.pos;
      const nearby = this.world.getNearbyInteractives?.(p.x, p.y, p.z, 3) ?? [];
      this.ui.openInventory(nearby[0]?.station ?? 'any');
    } catch { /* a button must never crash the yard */ }
  }

  /** "Hands on controls" — desktop pointer lock OR touch mode. Replaces the
   *  raw document.pointerLockElement reads in the per-frame hot paths. */
  _inputLocked() {
    return !!document.pointerLockElement || !!this._touchMode;
  }

  // ── Mission Card tutorial (Phase A cold-open) ───────────────────────

  /** The 2-step wizard finished (or was skipped): the yard takes over —
   *  Earl conscripts at spawn, then the mission card walks the basics. */
  _onOnboardingComplete() {
    if (!this.foreman?.hasGreetedPlayer) {
      setTimeout(() => this.foreman?.greetPlayer(), 600);
    }
    let rideOffered = false;
    if (this._freshGame) {
      // Fresh boot: the intro cutscene plays once-ever (cinema.seen guard —
      // replay may come from a future menu, never on every boot), THEN the
      // tutorial starts in onDone. Skippable with any key.
      const startFresh = () => {
        if (!this.cinema?.seen('intro-dawn-arrival')) {
          this.playCutscene('intro-dawn-arrival', {
            onDone: () => this._startTutorial(),
          });
        } else {
          this._startTutorial();
        }
      };
      // The veteran ride fork — one honest offer, only on a truly fresh boot
      // (no save on disk). "Keep fresh" (or Escape) continues into the intro.
      // While the offer card is up the opening holds (no pointer lock to
      // fight the buttons); the card's own handlers end the opening.
      if (!this.saveSystem?.hasSave?.() && !this._veteranRideOffered) {
        rideOffered = this.offerVeteranRide('fresh-boot', () => {
          this._endOpening();
          startFresh();
        });
      }
      if (!rideOffered) startFresh();
    }
    // Wizard closed and no yard-gate pending → the opening is over; the
    // cinematic ends and the controls hand over. (Gate pending → the gate's
    // own onChosen ends it, so the orbit carries the questions too. Ride
    // offer pending → the card's buttons end it, so the cursor stays free.)
    if (!this.companions?.needsEntryChoice && !rideOffered) this._endOpening();
  }

  /** Spark's first hello — fires on the first item pickup (usually iron),
   *  works fully offline, never repeats. Campaign Ch 1's heart at minute ~2. */
  _sparkFirstHello(itemId) {
    this.ui?.notify(`⚡ <b>Spark:</b> ${sparkFirstGreeting(itemId)}`);
    this.audio?.spark?.();
    this.achievements?.track?.('spark_met', {});
  }

  // ── First-hour delights — sound + visual + companion reaction, together ──

  /** Ambient yard life said something notable (the cat crossed, the crane
   *  sang). Occasionally the active companion has a feeling about it —
   *  ≤1 reaction per 2 min, ~40% of notables, never mid-menu. */
  _onAmbientEvent(id) {
    if (!AMBIENT_NOTABLE.has(id)) return;
    const now = this._clock ?? 0;
    if (now - this._lastAmbientReaction < 120) return;
    if (Math.random() >= 0.4) return;
    try {
      const c = this.companions?.active;
      const line = ambientLine(id, this.companions?.activeId);
      if (c && line) {
        this._lastAmbientReaction = now;
        c.say(line, { mood: 'happy', event: 'ambient', topic: id });
      }
    } catch { /* a cat comment must never crash the yard */ }
  }

  /** A one-time wow beat: marks the gate, then lands audio + particles +
   *  the active companion's reaction. Fail-soft: any missing system no-ops. */
  _delightCeremony(key, x, y, z) {
    if (!this._delights?.once(key)) return false;
    try {
      this.audio?.achievement?.();
      this.particles?.burst(x ?? this.player?.pos.x, (y ?? this.player?.pos.y) + 1, z ?? this.player?.pos.z, 'confetti', 26);
      const c = this.companions?.active;
      const line = delightLine(key, this.companions?.activeId);
      if (c && line) c.say(line, { mood: 'happy', event: 'delight', topic: key });
    } catch { /* a wow moment must never crash the yard */ }
    return true;
  }

  /** The bot just ran under the kid's OWN program for the first time —
   *  circuit-burst at the bot + ceremony. Wired from every setBrain path. */
  _noteProgramRunDelight(bot) {
    try {
      const bp = bot?._mesh?.position;
      if (bp) this.particles?.burst(bp.x, bp.y + 0.8, bp.z, 'circuit', 18);
    } catch { /* particles optional */ }
    this._delightCeremony('first_program_run');
    // Tutorial: the RUN step rides the same delight path (every setBrain site)
    this._tutorialEvent('program_run');
  }

  /** A teach-back moment is waiting (a companion has a question only the
   *  kid-who-is-the-teacher can answer). One gentle toast, at most every few
   *  minutes — the Logbook [L] holds the actual question. Fail-soft garnish. */
  _maybeTeachBackNudge() {
    try {
      if ((this.teachBack?.available?.() ?? 0) === 0) return;
      const now = Date.now();
      if (now - (this._teachBackNudgeAt ?? -Infinity) < 5 * 60_000) return;
      this._teachBackNudgeAt = now;
      const who = this.companions?.active?.name ?? 'Rivet';
      this.ui?.notify(`🔩 <b>${who} has a question</b> only the teacher can answer — open the Logbook [L].`);
    } catch { /* the ladder never interrupts the yard */ }
  }

  /** First lap the bot drove by itself — bigger confetti + the announcer's
   *  voice joins the companion. Shared by the TRACK and Oval circuits. */
  _noteFirstLapDelight(bot, secs, gx, gz) {
    if (!this._delights || this._delights.fired('first_autonomous_lap')) return;
    try {
      this.particles?.burst(gx ?? 38, 1.5, gz ?? 14, 'confetti', 34);
    } catch { /* particles optional */ }
    this._delightCeremony('first_autonomous_lap');
    if (this._delights.fired('first_autonomous_lap')) {
      announceLap(1).catch?.(() => {});   // "Lap one complete!" — the big voice
    }
  }

  // ── Failure kindness — a bricked bot is a lesson, never a dead end ──────

  /** First dent ever: normalize it, name the recovery, keep moving. */
  _noteFirstDent(bot) {
    if (!this._delights?.once('first_dent')) return;
    try {
      const c = this.companions?.active;
      const line = delightLine('first_dent', this.companions?.activeId);
      if (c && line) c.say(`${line} ${FIRST_DENT_RECOVERY}`, { mood: 'happy', event: 'kindness' });
    } catch { /* kindness never crashes */ }
  }

  /** Battery dead: kindness every time, but at most once a minute so a
   *  flailing session doesn't turn the comfort into a nag. */
  _noteBatteryDead(bot) {
    const now = Date.now();
    if (this._lastBatteryKindness && now - this._lastBatteryKindness < 60_000) return;
    this._lastBatteryKindness = now;
    try {
      const c = this.companions?.active;
      const line = delightLine('battery_dead', this.companions?.activeId);
      if (c && line) c.say(`${line} ${BATTERY_RECOVERY}`, { mood: 'happy', event: 'kindness' });
    } catch { /* kindness never crashes */ }
  }

  /** Settings → Advanced changed the config: hot-upgrade the yard's voices.
   *  A key entered post-spawn upgrades Spark LIVE — no restart needed. */
  onAdvancedConfigChanged() {
    this.tileEditor?._spark?.refreshProvider?.();
    sparkGateway.refresh();
  }

  _startTutorial() {
    try {
      this._tutorialEngine = new TutorialEngine({
        storage: typeof localStorage !== 'undefined' ? localStorage : null,
      });
      this._tutorialEngine.begin();
      this._tutorialActive = true;
      // Cache the mission-card DOM elements for rendering
      this._mcEl = document.getElementById('mission-card');
      this._mcTitle = document.getElementById('mc-title');
      this._mcDesc = document.getElementById('mc-desc');
      this._mcDots = document.getElementById('mc-dots');
      const dismissBtn = document.getElementById('mc-dismiss');
      if (dismissBtn) dismissBtn.addEventListener('click', () => this._dismissMission());
      this._tutorialShow();
    } catch (err) {
      console.warn('Tutorial init failed:', err);
      this._tutorialActive = false;
    }
  }

  _tutorialShow() {
    if (!this._tutorialEngine || !this._mcEl) return;
    const els = {
      title: this._mcTitle,
      desc: this._mcDesc,
      dots: this._mcDots,
    };
    renderMissionCard(this._tutorialEngine, els);
    this._mcEl.classList.add('show');
    // after render — drives the style medal's hint-timing logic
    this._tutorialEngine.onHintShown?.();
  }

  _tutorialEvent(name, payload) {
    // Active-only: after dismissal the engine stays quiet (a stray later
    // event must not resurrect the card or re-announce the daily contract).
    if (!this._tutorialEngine || !this._tutorialActive) return;
    const r = this._tutorialEngine.notify?.(name, payload);
    if (!r) return;
    // Render the mission card with new state
    this._tutorialShow();
    // Speak the rivet line if present
    if (r.rivetLine) {
      this.rivet?.say(r.rivetLine, { mood: 'happy', event: 'tutorial' });
    }
    // Celebrate mission complete: confetti + achievement sting + the ✅
    // notify line (medals land in the same line), then the card comes down.
    if (r.missionComplete) {
      try {
        this.particles?.burst(
          this.player?.pos.x ?? 0,
          (this.player?.pos.y ?? 0) + 1,
          this.player?.pos.z ?? 0,
          'confetti', 26
        );
        this.audio?.achievement?.();
        this.ui?.notify?.(r.medal
          ? `✅ Mission complete! 🏅 ${r.medal} — press H for controls. Keep exploring!`
          : '✅ Mission complete! Press H for controls. Keep exploring!');
      } catch { /* celebration optional */ }
      this._dismissMission();
    }
    // All done (a later event after completion): dismiss and clean up
    if (r.allDone) {
      this._dismissMission();
    }
  }

  _dismissMission() {
    this._tutorialActive = false;
    this._tutorialEngine?.skipAll?.();
    if (this._mcEl) this._mcEl.classList.remove('show');
    if (this._tutorialHintEl) this._tutorialHintEl.classList.remove('show');
    this._maybeAnnounceDaily();
  }

  // Deprecated shim (kept for any straggler caller): step advancement now
  // flows through _tutorialEvent → TutorialEngine.notify.
  _advanceTutorial() { /* no-op — see _tutorialEvent */ }

  // Deprecated shim (kept for any straggler caller): the mission card is
  // rendered by renderMissionCard via _tutorialShow.
  _showTutorialHint() { this._tutorialShow(); }

  /** Fresh players hear about the daily contract only once the tutorial
   *  stops competing for their attention — never during the first 5 minutes. */
  _maybeAnnounceDaily() {
    if (this._returningSession) return;   // announced with the Welcome Back card
    this.dailyContract?.announce();
  }

  _bindInput() {
    document.addEventListener('keydown', e => {
      // ── Spectator/coach mode (radio) ── coach keys come FIRST — the
      // play-mode handlers below (KeyB/KeyR/…) assume the kid is driving.
      if (this._spectator) { this.radio?.onKeyDown(e); return; }

      // Any keypress resets the auto-help timer
      this._helpAutoTimer = -1;

      // Cutscene: any key skips; no menu opens mid-cutscene
      if (this.cutsceneActive) {
        this.cinema?.skip?.();
        return;
      }

      // ── Tutorial: any WASD key completes the walk step ──
      if (this._tutorialActive && /^(Key[WASD])$/.test(e.code)) {
        this._tutorialEvent('move');
      }

      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && document.pointerLockElement) {
        this.audio.sprint();
      }
      if (e.code === 'KeyG' && document.pointerLockElement && !this.ui.isOpen) {
        this._useActiveItem();
      }
      // The Logbook — the player's learning made visible (press L)
      if (e.code === 'KeyL' && !this.ui.isOpen && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName ?? '')) {
        this.quests?.openLogbook();
      }
      // Mo's Ledger — the yard's memory of the kid (press J). If the panel
      // is already up, its own keydown closes it — don't fight the toggle.
      if (e.code === 'KeyJ' && !this.ui.isOpen && !this.tileEditor?.isOpen
          && !document.getElementById('mos-ledger-panel')
          && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName ?? '')) {
        this._openMosLedger();
      }
      // ── Tutorial: E completes the workshop step ──
      if (e.code === 'KeyE') {
        if (this._tutorialActive) this._tutorialEvent('open_bench');
        if (this.ui.isOpen) { this.ui.closeInventory(); return; }
        // Toggle tower panel closed if it's already open
        if (this.ui._towerPanelOpen) {
          document.getElementById('tower-panel')?.remove();
          this.ui._towerPanelOpen = false;
          document.getElementById('game-canvas')?.requestPointerLock();
          return;
        }
        // Scrap Exchange interaction
        {
          const ep = EXCHANGE_POS;
          const pp = this.player.pos;
          if ((pp.x - ep.x) ** 2 + (pp.z - ep.z) ** 2 < EXCHANGE_RADIUS ** 2) {
            const excPanel = document.getElementById('exchange-panel');
            if (excPanel) { excPanel.remove(); document.getElementById('game-canvas')?.requestPointerLock(); return; }
            this._openExchangePanel();
            return;
          }
        }

        // Race Board interaction (oval grandstand, x=28, z=78)
        {
          const rb = this.world.landmarks?.race_board;
          if (rb) {
            const pp = this.player.pos;
            if ((pp.x - rb.x) ** 2 + (pp.z - rb.z) ** 2 < 20) {
              const existing = document.getElementById('race-board-panel');
              if (existing) { existing.remove(); document.getElementById('game-canvas')?.requestPointerLock(); return; }
              this.ui.showRaceBoardPanel(this.raceBoard);
              return;
            }
          }
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
        // Landmark plaques — readable signage (worldbible: "Fail loudly. Learn publicly.")
        {
          const existing = document.getElementById('plaque-panel');
          if (existing) { existing.remove(); document.getElementById('game-canvas')?.requestPointerLock(); return; }
          const plq = this._nearbyPlaque(p.x, p.z, 2.5);
          if (plq) { this.ui.showPlaquePanel(plq, () => this._onPlaqueRead(plq)); return; }
        }

        const nearby = this.world.getNearbyInteractives(p.x, p.y, p.z, 3);
        this.ui.openInventory(nearby[0]?.station ?? 'any');
      }
      // ── Tutorial: T completes the Maker Lab step (starter program autoloads) ──
      if (e.code === 'KeyT') {
        if (this._tutorialActive) {
          this._tutorialEvent('open_maker');
          // Auto-load the wall-avoider starter program if the canvas is empty
          if (!this.tileEditor.isOpen) {
            this.tileEditor.open(this._getBrainTier());
          }
          if (this.tileEditor._program?.nodes?.length === 0) {
            this.tileEditor.loadProgram(EXAMPLE_WALL_AVOIDER);
          }
          // (the RUN step now rides _noteProgramRunDelight's event tap)
          return;
        }
        if (this.tileEditor.isOpen) { this.tileEditor.close(); }
        else { this.tileEditor.open(this._getBrainTier()); }
        return;
      }
      if (e.code === 'F5') { e.preventDefault(); this.saveSystem.save();
        // end-of-session story identity: the yard remembers who you ran with
        if (this.companions) this.ui?.notify(`📖 ${this.companions.storyText()}`);
      }
      if (e.code === 'F9') { e.preventDefault(); this.saveSystem.load(); }
      if (e.code === 'KeyF' && !e.repeat && !this._earlBusy) {
        // prompt() is modal and hard-blocks; the guard stops queued key-mash
        // F presses from stacking prompts and wedging the tab (beta P1).
        this._earlBusy = true;
        const msg = prompt('Talk to Big Earl:') ?? '';
        this._earlBusy = false;
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
      if (e.code === 'KeyC' && !this.ui.isOpen && !this.tileEditor.isOpen) {
        this.ui.toggleCodex(this.codex);
      }
      if (e.code === 'KeyN' && !this.tileEditor.isOpen) {
        this.ui.toggleFieldNotes();
      }
      if (e.code === 'KeyU' && !this.ui.isOpen && !this.tileEditor.isOpen) {
        this._toggleBotUpgradePanel();
      }
      if (e.code === 'KeyH' && !this.ui.isOpen && !this.tileEditor.isOpen) this._toggleHelp();
      // Hold V to talk to Rivet — STT in, character answer out, in Rivet's voice
      if (e.code === 'KeyV' && !e.repeat && !this.ui.isOpen && !this.tileEditor.isOpen) {
        this._startRivetTalk();
      }
      // C — swap active companion (party members take the shoulder)
      if (e.code === 'KeyC' && document.pointerLockElement && !this.ui.isOpen && !this.tileEditor.isOpen) {
        this._cycleCompanion();
      }
      if (e.code === 'KeyR' && document.pointerLockElement) {
        this.player.pos.set(8, 2, 5);
        this.player.vel?.set(0, 0, 0);
        this.player.yaw = 0;
        this.ui.notify('🏁 Respawned at the yard gate.');
      }
      if (e.code === 'KeyM') {
        if (e.shiftKey) {
          // Shift+M → Earl's Back Room (the boxes marked M — ch11 lore)
          this.prestige?.openBoard();
        } else {
          this.audio.toggle();
          voiceOut.setMuted(!this.audio._enabled);
        }
      }
      if (e.code === 'KeyY' && document.pointerLockElement) {
        this._dropWaypoint();
      }
      if (e.code === 'KeyB') {
        if (e.shiftKey) {
          // Shift+B → second bot (Level 5 Engineer skill, OR the Back Room's
          // second_bot_slot favor — comfort, not power: a bot is a bot)
          if (!this.xpSystem.hasSkill('engineer') && !this.prestige?.owns('second_bot_slot')) {
            this.ui.notify('⚙️ Engineer skill (Level 5) required for a second bot.');
          } else if (!this.player.hasTool('robot_helper') || this.player.countItem('robot_helper') < 2) {
            this.ui.notify('Craft a second robot_helper to run two bots.');
          } else {
            this._toggleBot2();
          }
        } else if (this.scrapBot.isActive) {
          if (e.ctrlKey) {
            // Ctrl+B → rename bot
            this._renameBotPrompt();
          } else if (this.scrapBot._brainMode) {
            this.scrapBot.clearBrain();
          } else {
            this.scrapBot.setBrain(EXAMPLE_WALL_AVOIDER, this.world, this.player, this.dayNight);
            this.achievements.track('program_run', {});
            this.xpSystem.gain(15);
            this._noteProgramRunDelight(this.scrapBot);
          }
        }
      }
    });

    // ── Spectator/coach mode (radio) ── PTT key-up ends the transmission
    document.addEventListener('keyup', e => {
      if (this._spectator) this.radio?.onKeyUp(e);
    });

    // Hold-to-mine: track button state, do work in update loop
    this.canvas.addEventListener('mousedown', e => {
      // Free cursor + click on the yard → take the controls (covers the
      // never-locked path, e.g. a refused boot-time lock request).
      if (!document.pointerLockElement && !this.openingPending && !this.cutsceneActive && !this.ui?.isOpen) {
        this.canvas?.requestPointerLock?.();
      }
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

    // Pointer lock: show/hide pause overlay — but never while the opening
    // cinematic or a cutscene runs (lock is deliberately absent; PAUSED flash
    // would break the narrative flow). The cinema is pause-gated in _update
    // (fed dt only while unpaused) — NOT here: a lock lost mid-cutscene must
    // not freeze the film with no way back but the skip key.
    document.addEventListener('pointerlockchange', () => {
      const locked = !!document.pointerLockElement;
      if (this._running && !this.openingPending && !this.cutsceneActive) {
        this.ui.setPaused(!locked);
      }
    });

    // Click-to-resume on pause overlay
    document.getElementById('pause-overlay')?.addEventListener('click', () => {
      if (!document.pointerLockElement) this.canvas.requestPointerLock();
    });

    // ── Veteran Ride — pause-menu surface (explicit entry; stopPropagation
    //    so the overlay's click-to-resume doesn't fight the buttons) ──
    document.getElementById('veteran-ride-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      this.offerVeteranRide('pause-menu');
    });
    const restoreBtn = document.getElementById('veteran-restore-btn');
    try {
      if (restoreBtn && typeof localStorage !== 'undefined'
          && localStorage.getItem('scrapcraft.veteran.backup')) {
        restoreBtn.style.display = '';   // hidden by default; flag-gated
      }
    } catch { /* storage optional */ }
    restoreBtn?.addEventListener('click', e => {
      e.stopPropagation();
      this._restoreVeteranBackup();
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
        // Rivet was there — every block mined together counts
        this.rivet?.observe('block_mined');
        this.dailyContract?.onCollect(drop);
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

    // Lucky Find — 3% base chance (8% at night) of bonus rare item from junk blocks.
    // First-hour delight: the FIRST junk block a kid ever mines always hides
    // one (once ever, persisted) — the rare-loot wow lands at minute ~2.
    const LUCKY_BLOCKS = new Set([B.SCRAP_PILE, B.OIL_DRUM, B.JUNK_CAR]);
    const LUCKY_LOOT   = ['battery_pack', 'ir_module', 'circuit_board', 'ldr_module', 'spring', 'gear_small', 'crystal_fragment'];
    const luckyChance  = isNight ? 0.08 : 0.03;
    const firstFindDue = this._delights && !this._delights.fired('first_lucky_find');
    if (LUCKY_BLOCKS.has(id) && (Math.random() < luckyChance || firstFindDue)) {
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
      this.rivet?.observe('rare_loot', { note: lDef?.name ?? lucky });
      if (firstFindDue) this._delightCeremony('first_lucky_find', x, y + 1, z);
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

    // Tutorial: the first block broken completes the mine step
    if (this._tutorialActive) this._tutorialEvent('mine', { block: id });

    this.achievements.track('mine', { isNight });
    this.challenge.onMine(id);
    this.dailyContract?.onMine(id);
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
      if (blockId === B.BEACON) this.foreman.onEvent('place_beacon', {});
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

  _openExchangePanel() {
    document.getElementById('exchange-panel')?.remove();
    const onTrade = (idx) => {
      const ok = this.exchange.trade(idx, this.player);
      if (ok) {
        const deal = this.exchange.getDeals()[idx];
        this.ui.notify(`📦 Traded! Got ${deal.get.qty}× ${deal.get.item.replace(/_/g,' ')}.`);
        this.xpSystem.gain(20);
        this.achievements.track('exchange_trade', {});
        this.foreman.onEvent('exchange_trade', {});
        this.saveSystem.markDirty();
        this.ui.updateHotbar(this.player);
        // Rebuild panel to reflect updated inventory
        this._openExchangePanel();
      } else {
        this.ui.notify('⚠ Not enough items for that trade.');
      }
    };
    this.ui.showExchangePanel(this.exchange.getDeals(), this.exchange, this.player, this.xpSystem, onTrade);
  }

  _toggleBotUpgradePanel() {
    let panel = document.getElementById('bot-upgrade-panel');
    if (panel) { panel.remove(); return; }

    if (document.pointerLockElement) document.exitPointerLock();

    panel = this.ui.showBotUpgradePanel(
      UPGRADE_DEFS,
      this.botUpgrades,
      this.xpSystem,
      this.player,
      (id) => {
        const ok = this.botUpgrades.purchase(id, this.player, this.xpSystem);
        if (ok) {
          const def = UPGRADE_DEFS.find(u => u.id === id);
          this.ui.notify(`${def?.icon ?? '⚡'} ${def?.name ?? id} installed!`);
          this.xpSystem.gain(50);
          this.achievements.track('bot_upgrade', { id });
          this.foreman.say('bot_upgrade');
          this.ui.updateHotbar(this.player);
          // Re-render the panel with updated state
          panel.remove();
          this._toggleBotUpgradePanel();
        } else {
          const def = UPGRADE_DEFS.find(u => u.id === id);
          if (!this.botUpgrades.prereqsMet(id)) this.ui.notify('⚠ Unlock prerequisites first!');
          else if (!this.botUpgrades.levelOk(id, this.xpSystem)) this.ui.notify(`⚠ Need level ${def?.levelReq} to install.`);
          else this.ui.notify('⚠ Not enough materials.');
        }
      }
    );
  }

  _renameBotPrompt() {
    const bot = this.scrapBot?.isActive ? this.scrapBot : null;
    if (!bot) return;
    const current = bot.personality.name;

    // Show ceremony only once per game session, on first bot naming
    if (!this._namingCeremonyShown && this.achievements.stats.botNamed === 0) {
      this._showNamingCeremony(bot, current);
    } else {
      const entered = prompt(`Rename your bot (currently "${current}"):`, current);
      if (!entered) return;
      const name = entered.trim().slice(0, 16);
      if (!name) return;
      this._applyBotName(bot, name);
    }
  }

  _showNamingCeremony(bot, current) {
    this._namingCeremonyShown = true;
    const overlay = document.createElement('div');
    overlay.id = 'naming-ceremony-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: linear-gradient(135deg, #2a2a3e, #1a1a2e);
      border: 3px solid #ff6b35;
      border-radius: 12px;
      padding: 40px;
      max-width: 500px;
      text-align: center;
      font-family: 'Courier New', monospace;
      color: #fff;
      box-shadow: 0 0 40px rgba(255, 107, 53, 0.3);
    `;

    panel.innerHTML = `
      <div style="font-size: 28px; margin-bottom: 20px;">⚙️ NAMING CEREMONY ⚙️</div>
      <p style="font-size: 16px; line-height: 1.6; margin-bottom: 30px; color: #ccc;">
        You've built something that's never existed before.<br>
        Now it needs a name. What will you call it?
      </p>
      <input id="naming-input" type="text" value="${current}" maxlength="16"
        style="
          width: 100%;
          padding: 12px;
          font-size: 16px;
          border: 2px solid #ff6b35;
          background: #1a1a2e;
          color: #fff;
          border-radius: 6px;
          box-sizing: border-box;
          margin-bottom: 20px;
          font-family: 'Courier New', monospace;
        ">
      <div style="display: flex; gap: 10px;">
        <button id="name-confirm" style="
          flex: 1;
          padding: 12px;
          background: #ff6b35;
          color: #1a1a2e;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          font-family: 'Courier New', monospace;
        ">CONFIRM</button>
        <button id="name-cancel" style="
          flex: 1;
          padding: 12px;
          background: #333;
          color: #fff;
          border: 2px solid #ff6b35;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          font-family: 'Courier New', monospace;
        ">CANCEL</button>
      </div>
    `;

    document.body.appendChild(overlay);
    const input = document.getElementById('naming-input');
    input.focus();
    input.select();

    const confirm = () => {
      const name = input.value.trim().slice(0, 16);
      if (!name) return;
      overlay.remove();
      this._applyBotName(bot, name);
      this._celebrateNaming(bot);
    };

    const cancel = () => {
      overlay.remove();
    };

    document.getElementById('name-confirm').addEventListener('click', confirm);
    document.getElementById('name-cancel').addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') cancel();
    });
  }

  _applyBotName(bot, name) {
    bot.personality.name = name;
    this.ui.updateBotBond(name, bot.personality.bond);
    bot.speak(`[NAME UPDATE] New designation: ${name}. Acknowledged.`);
    this.saveSystem.markDirty();
    this.achievements.track('bot_named', {});
    setTimeout(() => this.foreman?.onEvent('bot_named', {}), 500);
  }

  _celebrateNaming(bot) {
    const botPos = bot.mesh?.position || { x: 0, y: 1, z: 0 };
    this.particles.burst(botPos.x, botPos.y + 1, botPos.z, 'confetti', 30);
    this.audio.playSound('craft'); // celebration chime
  }

  _showGhostRacerIntro() {
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #2a2a3e, #1a1a2e);
      border: 2px solid #00d9ff;
      border-radius: 8px;
      padding: 20px;
      max-width: 400px;
      text-align: center;
      font-family: 'Courier New', monospace;
      color: #00d9ff;
      z-index: 1000;
      box-shadow: 0 0 20px rgba(0, 217, 255, 0.3);
      animation: slideUp 0.5s ease-out;
      white-space: pre-wrap;
    `;

    tooltip.textContent = '👻 GHOST RACING ENABLED\n\nYour best lap is recorded.\nRace yourself. Beat yourself.\nThat\'s engineering.';

    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideUp {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(tooltip);

    setTimeout(() => {
      tooltip.style.opacity = '0';
      tooltip.style.transition = 'opacity 0.5s ease-in';
      setTimeout(() => tooltip.remove(), 500);
    }, 4000);
  }

  _toggleBot2() {
    if (!this.scrapBot2) {
      this.scrapBot2 = new ScrapBot(this.renderer.scene, this.player);
      this.scrapBot2._slotKey = 'bot2';
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
      this._noteProgramRunDelight(this.scrapBot2);
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
    this.dailyContract?.onCraft();
    this.xpSystem.gain(isNew ? 10 : 3);
    this.saveSystem.markDirty();
    this.audio.craft();

    const isTool = ['wrench', 'pickaxe', 'axe', 'shovel'].includes(output);
    const particleCount = (!this._firstToolCrafted && isTool) ? 40 : 18;
    const particleType = (!this._firstToolCrafted && isTool) ? 'confetti' : 'craft';

    this.particles.burst(
      this.player.pos.x, this.player.pos.y + 1, this.player.pos.z, particleType, particleCount,
    );

    // Enhanced feedback for first tool
    if (isTool && !this._firstToolCrafted) {
      this._firstToolCrafted = true;
      this.audio.craft();
      this.audio.questComplete();
      setTimeout(() => {
        this.ui.notify('🎉 First tool forged! You\'re a builder now.');
      }, 200);
    }

    if (output === 'robot_helper' && !this.scrapBot.isActive) {
      setTimeout(() => this.scrapBot.activate(this.player.pos), 1000);
      this.rivet?.observe('bot_built');
    }
    // Gate Edition starter bot — same parts, yard-gate workbench, slightly
    // weaker machine. The point: press T and program it RIGHT NOW. The gap
    // between "I have a robot" and "I can program it" is zero.
    if (output === 'robot_helper_starter' && !this.scrapBot.isActive) {
      this.scrapBot.setEdition('gate');
      setTimeout(() => this.scrapBot.activate(this.player.pos), 1000);
      this.rivet?.observe('bot_built');
      setTimeout(() => {
        this.ui?.notify('🧠 Press <b>T</b> anywhere — the Maker Lab can give your bot a brain right now.');
      }, 2600);
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
    this._maybeAnnounceDaily();
  }

  start() {
    if (this._running) return;   // CLOCK IN twice must not spawn duplicate render loops (OOM path)
    this._running = true;

    // ── WORLD-BEFORE-MENU ────────────────────────────────────────────────
    // First run: the yard slow-orbits behind the wizard + the yard gate —
    // the menus stop hiding the world they describe (beta feel pass). The
    // orbit ends when the last opening overlay closes (_endOpening), which
    // is also the only moment pointer lock is taken.
    const firstRun = !this.onboarding?.isComplete?.() || !!this.companions?.needsEntryChoice;
    if (firstRun && this.renderer?.camera) {
      try {
        this._openingCinematic = new OpeningCinematic({
          camera: this.renderer.camera,
          // Lite pulls the fog to 60m — orbit closer so the yard still reads
          ...(this.renderMode?.lite ? { radius: 34, height: 18 } : {}),
        }).begin();
        // Some browsers grant the boot-time lock before the first overlay
        // paints — the overlays need the cursor, so give it back.
        if (typeof document !== 'undefined' && document.pointerLockElement) {
          document.exitPointerLock?.();
        }
      } catch { /* the cinematic is a garnish — a failed orbit must not fail a boot */ }
    }

    // Cinema director for cutscenes. The camera object itself (stable for the
    // session) — the director's API reads .position/.lookAt, not a factory.
    // Fail-soft: no renderer → null camera, subtitles/letterbox still work.
    try {
      this.cinema = new CutsceneDirector({
        camera: this.renderer?.camera ?? null,
        world: this.world,
        game: this,
      });
    } catch { /* cinema is optional */ }

    this._lastTime = performance.now();
    this._loop();
    if (this._returningSession) this._showWelcomeBack();
  }

  /** True while the opening cinematic owns the camera (menus up, no lock). */
  get openingPending() { return this._openingCinematic?.active === true; }

  /** True while a cutscene is active (player can't control). */
  get cutsceneActive() { return this.cinema?.active === true; }

  /** The last opening overlay closed: park the camera at the kid's eye and
   *  take the controls. Idempotent; fail-soft on every step. */
  _endOpening() {
    const cin = this._openingCinematic;
    if (!cin?.active) return;
    cin.end();
    try {
      const cam = this.renderer?.camera, p = this.player;
      if (cam && p) {
        // Exactly where Player.tick would have it — the first locked frame
        // is seamless, no snap back from the orbit.
        cam.position.set(p.pos.x, p.pos.y + EYE_HEIGHT, p.pos.z);
        cam.quaternion.setFromEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'));
      }
    } catch { /* camera parked best-effort; pointer lock drives the rest */ }
    if (!document.pointerLockElement) this.canvas?.requestPointerLock?.();
    this.ui?.setPaused?.(false);
  }

  /** Play a cutscene by id. Fail-soft: no cinema → onDone fires immediately
   *  (a cutscene must never strand its callback or gate a quest). Player
   *  input is paused by the cutsceneActive gate on player.tick in _update;
   *  when the film ends the camera re-parks at the kid's eye exactly like
   *  _endOpening does (EYE_HEIGHT + Euler YXZ), then onDone runs. */
  playCutscene(id, { onDone } = {}) {
    if (!this.cinema) {
      // No cinema available: fire callback immediately
      onDone?.();
      return;
    }
    this.ui?.setPaused?.(false);   // the film owns the screen — mirror _endOpening
    // Chain onDone: re-park the camera first, then the caller's callback.
    const wrappedOnDone = () => {
      try {
        const cam = this.renderer?.camera, p = this.player;
        if (cam && p) {
          cam.position.set(p.pos.x, p.pos.y + EYE_HEIGHT, p.pos.z);
          cam.quaternion.setFromEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'));
        }
      } catch { /* camera re-park best-effort */ }
      onDone?.();
    };
    this.cinema.play(id, { onDone: wrappedOnDone });
  }

  // ── Veteran Ride — the honest fork for kids who already know the yard ────

  /** Show the one-time veteran-ride offer card (ceremony-card pattern):
   *  the summary line + two buttons — "jump in at Chapter 7" or keep the
   *  fresh walk. Only EVER shown at the fresh-boot onboarding moment or by
   *  an explicit pause-menu click. `onKeepFresh` (fresh-boot flow) ends the
   *  opening and rolls the intro cutscene. Returns true when the card is up.
   *  Fail-soft: no DOM/storage → false, the fresh path just continues. */
  offerVeteranRide(reason = 'manual', onKeepFresh = null) {
    if (this._veteranRideOffered && reason !== 'pause-menu') return false;
    try {
      if (typeof document === 'undefined') return false;
      this._veteranRideOffered = true;
      document.getElementById('veteran-ride-card')?.remove();
      document.exitPointerLock?.();

      const profile = generateVeteranSave();
      const summary = veteranRideSummary(profile);
      const card = document.createElement('div');
      card.id = 'veteran-ride-card';
      card.style.cssText = `
        position: fixed; inset: 0; z-index: 180; display: flex;
        align-items: center; justify-content: center;
        background: rgba(8, 6, 3, 0.55); font-family: 'Courier New', monospace;`;
      card.innerHTML = `
        <div style="
            width: min(520px, 90vw); text-align: center;
            background: #17120a; border: 2px solid #6b5a33; border-radius: 10px;
            color: #e8dcc0; padding: 26px 30px; font-size: 14px; line-height: 1.6;">
          <div style="letter-spacing:4px;font-size:11px;color:#9fd0ff;opacity:.85">🚚 THE VETERAN RIDE</div>
          <div style="margin:14px auto 0;max-width:44ch;font-style:italic;color:#e8dcc0">${summary.note}</div>
          <div style="margin:10px auto 0;font-size:11px;opacity:.65">
            Starts mid-spine with your tools, your bots, and Rivet at your shoulder.
            Achievements stay live-only — every medal is still yours to earn.
          </div>
          <div style="display:flex;gap:10px;margin-top:20px;justify-content:center;flex-wrap:wrap">
            <button id="vr-go" style="
              padding:11px 16px;background:#3a2a0a;border:2px solid #f0b429;border-radius:6px;
              color:#ffd97a;font-family:inherit;font-size:12px;font-weight:bold;cursor:pointer;letter-spacing:1px;">
              🚚 VETERAN RIDE — jump in at Chapter 7</button>
            <button id="vr-stay" style="
              padding:11px 16px;background:#2a2a2a;border:2px solid #555;border-radius:6px;
              color:#ccc;font-family:inherit;font-size:12px;cursor:pointer;letter-spacing:1px;">
              Keep fresh</button>
          </div>
          <div style="margin-top:14px;font-size:10px;opacity:.45">${
            reason === 'fresh-boot' ? 'one offer, one yard — your call' : 'your live save is backed up first'
          }</div>
        </div>`;

      const dismiss = () => {
        card.remove();
        document.removeEventListener('keydown', onKey, true);
      };
      const keepFresh = () => {
        dismiss();
        onKeepFresh?.();
      };
      // Escape is "keep fresh" — a keyboard kid is never trapped at the fork
      const onKey = e => { if (e.key === 'Escape') keepFresh(); };
      document.addEventListener('keydown', onKey, true);

      card.querySelector('#vr-go')?.addEventListener('click', e => {
        e.stopPropagation();
        dismiss();
        this.activateVeteranRide();
      });
      card.querySelector('#vr-stay')?.addEventListener('click', e => {
        e.stopPropagation();
        keepFresh();
      });
      document.body.appendChild(card);
      return true;
    } catch { /* the fork is a garnish — the fresh walk always works */ }
    return false;
  }

  /** Switch the live slot to the veteran profile: back up any live save
   *  first (nothing is ever lost), seed the side-storage (spine/wakes/
   *  companion/tracker — done by applyVeteranProfile), write the profile's
   *  save to BOTH the veteran slot (provenance) and the LIVE key (this IS
   *  the profile switch), stamp scrapcraft.profile, reload. On a truly
   *  fresh boot there is no live save — nothing to lose by construction. */
  activateVeteranRide() {
    try {
      if (typeof localStorage === 'undefined') return false;
      // Back up a live save first — restore lives in the pause menu.
      try {
        if (this.saveSystem?.hasSave?.()) {
          const liveRaw = localStorage.getItem(LIVE_SAVE_KEY);
          if (liveRaw) {
            const backupKey = `scrapcraft_save_v6_backup_${Date.now()}`;
            localStorage.setItem(backupKey, liveRaw);
            localStorage.setItem('scrapcraft.veteran.backup', backupKey);
          }
        }
      } catch { /* backup best-effort; fresh boots lose nothing anyway */ }
      const profile = generateVeteranSave();
      applyVeteranProfile(profile, localStorage);
      const raw = JSON.stringify(profile.save);
      localStorage.setItem(VETERAN_SAVE_KEY, raw);   // provenance slot
      localStorage.setItem(LIVE_SAVE_KEY, raw);      // THE profile switch
      localStorage.setItem('scrapcraft.profile', 'veteran');
      location.reload();
      return true;
    } catch { /* a failed ride must never brick the boot */ }
    return false;
  }

  /** Pause-menu "Restore my save": copy the newest pre-ride backup over the
   *  live key, clear the flag, reload. Shown only while the flag exists. */
  _restoreVeteranBackup() {
    try {
      if (typeof localStorage === 'undefined') return false;
      const backupKey = localStorage.getItem('scrapcraft.veteran.backup');
      const raw = backupKey ? localStorage.getItem(backupKey) : null;
      if (!raw) { localStorage.removeItem('scrapcraft.veteran.backup'); return false; }
      localStorage.setItem(LIVE_SAVE_KEY, raw);
      localStorage.removeItem('scrapcraft.veteran.backup');
      location.reload();
      return true;
    } catch { /* restore is a garnish — never a crash */ }
    return false;
  }

  // ── Welcome Back — the minute-0-of-day-2 moment ────────────────────────

  _showWelcomeBack() {
    const snap = {
      ...(this._comeback ?? {}),
      // live truth beats the snapshot where available
      botName:    this.scrapBot?.personality?.name ?? this._comeback?.botName,
      botBond:    this.scrapBot?.personality?.bond ?? this._comeback?.botBond ?? 0,
      ovalBestMs: this._ovalLapState?.bestMs === Infinity ? this._comeback?.ovalBestMs : this._ovalLapState.bestMs,
      daysPlayed: this.dailyContract?.daysPlayed ?? this._comeback?.daysPlayed ?? 1,
      dayStreak:  this.dailyContract?.streak?.count ?? this._comeback?.dayStreak ?? 1,
      nightShift: this._nightShiftResult ?? undefined,
    };

    // Open quest + its next actionable step, live from the foreman
    const q = this.foreman.currentQuestDef?.();
    if (q) {
      snap.questTitle = q.title;
      const step = q.steps.find(s => {
        try { return !s.check(this.player, this); } catch { return false; }
      });
      snap.questStep = step?.label;
    }

    const report = WelcomeBack.build(snap);
    if (report.rows.length === 0) return;
    this.ui?.showWelcomeBack(report);
    this.foreman.say('welcome_back', { force: true });

    // Then: the open quest comes back (4s), Night Shift gets its line (7.5s),
    // and today's contract gets its moment (11s) — one voice at a time.
    setTimeout(() => this.foreman.resumeQuest(), 4000);
    if (this._nightShiftResult) setTimeout(() => this.foreman.onEvent('night_shift', {}), 7500);
    setTimeout(() => this.dailyContract?.announce(), 11000);
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

  // ── Dumpster-Fire Panic Button (fun-review #5) ───────────────────────────

  _panicStateFor(bot) {
    const key = bot === this.scrapBot2 ? 'bot2' : 'bot1';
    return this._panicStates?.[key] ?? createPanicState();
  }

  /** A bot bonked a wall — feeds the PANIC counter (3+ crashes → button shows). */
  noteBotCrash(slotKey) {
    const s = this._panicStates?.[slotKey];
    if (s) noteCrash(s);
  }

  /** Bot finished a job (lap / waypoint / challenge) — despair reset. */
  noteBotTaskComplete(botOrSlot) {
    const key = typeof botOrSlot === 'string' ? botOrSlot : (botOrSlot === this.scrapBot2 ? 'bot2' : 'bot1');
    const s = this._panicStates?.[key];
    if (s) noteTaskComplete(s);
  }

  /** Bot Card asks: should the big red button show / be live? */
  panicStatusFor(bot) {
    return panicStatus(this._panicStateFor(bot));
  }

  /** ROCKET OVERDRIVE — smoke burst, speed frenzy, smash 5 junk blocks, loot cache. */
  triggerPanic(bot) {
    const state = this._panicStateFor(bot);
    const fired = consumePanic(state);
    if (!fired) return false;

    const pos = bot?._pos ?? this.player.pos;
    const name = bot?.ledger?.name ?? bot?.personality?.name ?? 'The bot';

    // 1) smoke burst — comic, not catastrophic
    this.particles.burst(pos.x, (pos.y ?? 1) + 0.6, pos.z, 'smoke', 26);
    this.particles.burst(pos.x, (pos.y ?? 1) + 0.9, pos.z, 'ember', 10);

    // 2) speed frenzy — 4s of triple-speed chaos (ScrapBot.tick reads this)
    if (bot) bot._panicBoostUntil = performance.now() + 4000;

    // 3) smash the 5 nearest junk blocks (kid-safe: junk whitelist only)
    const smashableIds = SMASHABLE_BLOCKS.map(n => B[n]).filter(id => id != null);
    const targets = smashTargets(pos, (x, y, z) => this.world.getBlock(x, y, z), smashableIds);
    for (const t of targets) {
      this.world.mine(t.x, t.y, t.z);
      this.particles.burst(t.x + 0.5, t.y + 0.5, t.z + 0.5, 'mine', 8);
    }

    // 4) the salvageable loot cache — despair becomes a toy
    const loot = rollLootCache();
    for (const l of loot) this.player.addItem(l.id, l.qty);
    const lootStr = loot.map(l => `${getItem(l.id)?.icon ?? ''} ${getItem(l.id)?.name ?? l.id} ×${l.qty}`).join(', ');

    this.ui.notify(`🔥 <b>ROCKET OVERDRIVE!</b> ${name} went full dumpster-fire — smashed ${targets.length} junk block${targets.length === 1 ? '' : 's'} and coughed up: ${lootStr}. (Cooldown: 5 min.)`);
    this.foreman?.say?.('panic_button');
    this.xpSystem?.gain(5);
    return true;
  }

  // ── Landmark plaques ────────────────────────────────────────────────────

  _nearbyPlaque(px, pz, radius = 2.5) {
    const list = this.world?.landmarks?.plaques;
    if (!list) return null;
    for (const plq of list) {
      if ((px - plq.x) ** 2 + (pz - plq.z) ** 2 <= radius * radius) return plq;
    }
    return null;
  }

  _onPlaqueRead(plq) {
    if (!plq || this._plaquesRead.has(plq.id)) return;
    this._plaquesRead.add(plq.id);
    try {
      localStorage.setItem('scrapcraft_plaques_read', JSON.stringify([...this._plaquesRead]));
    } catch { /* private mode — session-only is fine */ }
    if (this._plaquesRead.size >= PLAQUES.length) {
      this.ui.notify('🪧 <b>ALL PLAQUES READ.</b> Fail loudly, learn publicly — you now have shoulders to stand on. (+50 XP)');
      this.foreman?.say?.('all_plaques');
      this.xpSystem?.gain(50);
    }
  }

  // ── Companion roster per-frame: presence, idle watch, battery, party nudges ─
  _startRivetTalk() {
    if (!this.rivet || this.rivet.talking) return;
    const c = this.companions.active;
    this.ui?.notify(`${c.persona.emoji} <b>${c.name}:</b> <i>listening… (talk, then let go of V)</i>`);
    this.rivet.talk().catch(() => {});
  }

  /** Swap the active companion (C key) — crew members take the shoulder. */
  _cycleCompanion() {
    if (!this.companions) return;
    const party = this.companions.partyIds;
    if (party.length < 2) {
      const c = this.companions.active;
      this.ui?.notify(`${c.persona.emoji} ${c.name}: it's just us so far — reach FRIEND tier and Earl will pair you with another.`);
      return;
    }
    const idx = party.indexOf(this.companions.activeId);
    const nextId = party[(idx + 1) % party.length];
    if (this.companions.setActive(nextId)) {
      this._swapAvatar(this.companions.active.persona);
      this.saveSystem?.markDirty();
    }
  }

  /** Rebuild the voxel face when the active companion changes. */
  _swapAvatar(persona) {
    if (this._avatarPersonaId === persona.id && this.companionAvatar) return;
    this.companionAvatar?.dispose(this.renderer.scene);
    this.companionAvatar = new RivetAvatar(this.renderer.scene, persona);
    this._avatarPersonaId = persona.id;
  }

  /** Mo's Ledger — the career record the yard keeps on the kid (J key,
   *  cross-linked from the Logbook). A garnish: never a crash. */
  _openMosLedger() {
    try { openMosLedgerPanel(this); } catch { /* the ledger is a garnish, never a crash */ }
  }

  _tickRivet(dt) {
    if (!this.rivet) return;
    const locked = this._inputLocked();
    const vel = this.player.vel;
    const moving = Boolean(vel && Math.hypot(vel.x, vel.z) > 0.35);
    const bot = this.scrapBot?.isActive ? this.scrapBot : null;
    this.rivet.update(dt, {
      locked,
      moving,
      midFlow: this.ui.isOpen || this.tileEditor.isOpen || this.rivet.talking
        || (this._lapState?.lapStart ?? 0) > 0 || Boolean(this._companionGate),
      battery: bot ? (bot.battery ?? 100) : null,
      // ambient context — gates tod/weather-keyed companion lines (fail-soft)
      tod: this.dayNight?.label,
      weather: this.weather?.state,
    });
    // the voxel face: follows the player, looks where they look, mirrors mood
    this.companionAvatar?.update(dt, this.player.pos, this.player.yaw, this.rivet.mood);
  }

  _update(dt) {
    this._clock += dt;

    // ── Spectator/coach mode (radio) ──
    if (this._spectator) {
      this.radio?.tick(dt);
      // world/life keeps running; skip player physics + hazards + mining
      this.dayNight?.tick(dt);
      this.weather?.tick(dt, this.renderer.camera.position, this.renderer.ambientLight);
      this._tickRivet?.(dt);
      for (const b of this._demoBots ?? []) b.tick(dt, this.world);
      this.scrapBot?.tick(dt, this.world);  // existing bots keep playing
      this.scrapBot2?.tick(dt, this.world);
      return; // skip the rest of player-centric update
    }

    // Fuel boost timer
    if (this._fuelBoostTimer > 0) {
      this._fuelBoostTimer -= dt;
      this.player.fuelBoosted = this._fuelBoostTimer > 0;
    } else {
      this.player.fuelBoosted = false;
    }

    // Don't tick player input during cutscenes (camera is owned)
    if (!this.cutsceneActive) this.player.tick(dt, this.world);

    // Opening cinematic — the yard drifts behind the first menus. Player.tick
    // no-ops without pointer lock, so while menus are up the orbit owns the
    // camera; when it ends, _endOpening parks the camera at the kid's eye.
    if (this._openingCinematic?.active) this._openingCinematic.update(dt);

    // Cutscene playback — the SAME pause gate the rest of the screen honors:
    // dt is fed only while the pause overlay is DOWN (the overlay never shows
    // mid-cutscene, so this is the outer pause belt; the director also no-ops
    // internally when setPaused). Pause-safe by construction.
    if (this.cinema?.active && !this.ui?.paused) this.cinema.update(dt);

    this._tickRivet(dt);

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

    // Ambient yard life — one small event per 60–180s, fail-soft. The cat
    // (and sometimes the crane) is worth a companion word; the rest stays
    // wordless. Chatter budget: at most one ambient reaction per 2 min, and
    // only ~40% of notables even get that.
    try {
      const fired = this.ambientLife?.tick(dt, this.player.pos);
      if (fired) this._onAmbientEvent(fired.id);
    } catch { /* the yard's small life never crashes the loop */ }

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
    } else if (this._headlampOn) {
      // Warm Glow perk (Field Guide 20) — a warmer lamp, same range
      this.renderer.setHeadlamp(true, 2.8 + (this.prestige?.perkEffectsNow?.().lanternBrightness ?? 0));
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

    // Grapple hook: extends mining / targeting reach; the Long Arms perk
    // (100-blocks milestone) adds +1 tile — comfort, never a quest gate
    this.renderer.raycaster.far = (this.player.hasTool('grapple_hook') ? 10 : 6)
      + (this.prestige?.perkEffectsNow?.().mineReachTiles ?? 0);
    this.particles.tick(dt);
    this.projectiles.tick(dt, this.world, (hit) => this._onProjectileHit(hit));
    this.achievements.tick(dt);

    // Drain newly unlocked skills → level-up toast + Earl quip. The last-skill
    // badge lookup is cached: recomputed only when new skills drain in or the
    // set size changes (a save load), never by copying the Set per frame.
    for (const skill of this.xpSystem.drainNewSkills()) {
      this._lastSkillId = skill.id;
      this.ui?.showLevelUp(this.xpSystem.level, skill);
      setTimeout(() => this.foreman.sayLine(skill.earlQuip), 2200);
    }
    if (this._lastSkillCount !== this.xpSystem.skills.size) {
      this._lastSkillCount = this.xpSystem.skills.size;
      let last = null;
      for (const id of this.xpSystem.skills) last = id;   // insertion order = unlock order
      this._lastSkillId = last;
    }
    this.ui?.setXP(this.xpSystem.level, this.xpSystem.progress,
      this._lastSkillId ? this._lastSkillId.toUpperCase() : '');

    this.scrapBot.tick(dt, this.world);
    if (this.scrapBot2) this.scrapBot2.tick(dt, this.world);

    this._tickBotBadge();
    this._tickLapTimer(dt);
    this._tickOvalLapTimer(dt);
    this._tickGhostPlayback(dt);
    this._tickOvalGhostPlayback(dt);
    this._tickBotTrackSparks(dt);

    // Speech bubble projection
    this._updateSpeechBubble(this.scrapBot,  this._speechEl1);
    this._updateSpeechBubble(this.scrapBot2, this._speechEl2);

    this.audio.tick(dt, this.player, this.world);
    this.saveSystem.tick(dt);
    this.challenge.tick(dt);
    this.dailyContract?.tick(dt);
    this.challengeSystem.tick(dt);

    const locked = this._inputLocked();

    // Hold-to-mine
    if (this._mineDown && !this.ui.isOpen && locked) {
      this._updateMine(dt);
    } else if (this._mineTarget) {
      this._cancelMine();
    }

    // Block label + crosshair state — ONE target raycast per frame feeds this,
    // the selection box, and the ghost preview below. (Renderer.getTargetBlock
    // returns a REUSED scratch object: read it this frame, never store it.)
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

    // Ghost block placement preview (reuses the frame's `target`)
    {
      const activeItem = this.player.activeItem;
      const blockId    = activeItem ? ITEM_TO_BLOCK[activeItem.id] : null;
      const tgt        = (!this.ui.isOpen && locked) ? target : null;
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
        const bandName = this.world.getBandName(Math.floor(this.player.pos.z));
        this.ui.showZoneToast(bandName);
        this.foreman.onEvent(`enter_band_${bandIdx}`, {});
        // Rivet marks first-visit biomes — new places grow the friendship
        this.rivet?.observe('biome_first', { name: bandName });
        // THE SPINE's soft band: deeper than the story has opened → one
        // gentle Earl nudge, once ever per band — never a wall (game-lay).
        const spine = this.quests?.spine;
        if (spine && bandIdx > spine.unlockedBand() && !spine.bandNudged(bandIdx)) {
          spine.markBandNudged(bandIdx);
          this.ui.notify('☕ Earl: "Easy, kid — the yard opens in its own time. This stretch can keep a while yet."');
        }
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

    // Junk-lantern trail — once the kid has bot parts on hand and walks the
    // lit east road, Earl tips his hat to his own handiwork (once per session).
    if (!this._breadcrumbQuipShown && this.world.landmarks?.smelter_trail) {
      const hasParts = this.player?.crafted?.has?.('robot_arm')
        || this.player?.crafted?.has?.('robot_helper_starter');
      if (hasParts) {
        const nearLantern = this.world.landmarks.smelter_trail.some(
          t => (p.x - t.x) ** 2 + (p.z - t.z) ** 2 < 9,
        );
        if (nearLantern) {
          this._breadcrumbQuipShown = true;
          this.foreman.onEvent('breadcrumb_trail', {});
        }
      }
    }

    // Scrap Exchange proximity — hint once per session when within range
    if (!this._exchangeNearNotified) {
      const exDist2 = (p.x - EXCHANGE_POS.x) ** 2 + (p.z - EXCHANGE_POS.z) ** 2;
      if (exDist2 < (EXCHANGE_RADIUS + 2) ** 2) {
        this._exchangeNearNotified = true;
        this.ui.notify('📦 Scrap Exchange nearby — press [E] to see today\'s deals.');
        this.foreman.say('near_exchange');
      }
    }

    // Race board proximity — hint once when player first approaches grandstand
    if (!this._raceBoardNearNotified) {
      const rb = this.world.landmarks?.race_board;
      if (rb && (p.x - rb.x) ** 2 + (p.z - rb.z) ** 2 < 64) {
        this._raceBoardNearNotified = true;
        this.ui.notify('🏟 Race Board nearby — press [E] to see the leaderboard!');
      }
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

    // Near oval circuit hint — fire once when player enters Circuit City oval area
    if (!this._nearOvalSeen) {
      const px2 = p.x, pz2 = p.z;
      if (px2 >= 20 && px2 <= 50 && pz2 >= 76 && pz2 <= 92) {
        this._nearOvalSeen = true;
        this.foreman.onEvent('near_oval', {});
        // Ghost-racer intro — only show on first oval visit
        if (!this._ghostRacerIntroShown) {
          this._ghostRacerIntroShown = true;
          setTimeout(() => this._showGhostRacerIntro(), 1000);
        }
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

    // Update floodlight positions — throttled to 4Hz: the lights only matter
    // when the kid (or a placed block) moves, and the search still walks the
    // placed-block list each time.
    this._floodTimer += dt;
    if (this._floodTimer >= 0.25) {
      this._floodTimer = 0;
      this.renderer.updateFloodlights(this.world._placedBlocks, this.player.pos, B.FLOODLIGHT);
    }

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
        // The heart: hammer out a nearby bot's dents too
        for (const b of [this.scrapBot, this.scrapBot2]) {
          if (!b?.ledger || b.ledger.isRetired) continue;
          const bp = b._mesh?.position;
          if (bp && bp.distanceTo(p) < 3.5) {
            const res = b.ledger.repair('repair_kit');
            if (res) {
              this.ui.notify(`🔧 ${b.ledger.name}: ${res.dentsFixed} dent${res.dentsFixed > 1 ? 's' : ''} hammered out. Logged in the repair book.`);
              b.speak(`[REPAIR LOG] ${res.dentsFixed} dents gone. I still remember every one.`);
              this.rivet?.observe('repair_done', { note: b.ledger.name });
            }
          }
        }
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
          this.challenge.onBotCharge();
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
        this.challenge.onLapComplete();
        this.noteBotTaskComplete(bot);   // panic reset: a lap is a completed task
        this.dailyContract?.onLapComplete();
        this.xpSystem.gain(20);
        this.rivet?.observe('lap_complete', { secs, note: `${secs}s${improved ? ' PB' : ''}` });
        this._noteFirstLapDelight(bot, secs, 38, 14);   // first autonomous lap, once ever
        // The heart: this lap is remembered
        if (bot?.ledger?.lapCompleted()) {
          this.ui.notify(`💛 ${bot.ledger.name}'s first lap — remembered forever.`);
        }
        // Bot says something about the lap
        const activeBot = bot;
        if (improved) {
          this._bestGhostFrames = this._ghostFrames.slice();
          this.saveSystem.markDirty();
          setTimeout(() => {
            activeBot.speak(activeBot.personality.quip('lap_record'));
            this.foreman.onEvent('bot_lap_record', {});
          }, 500);
        } else {
          setTimeout(() => activeBot.speak(activeBot.personality.quip('lap_complete')), 500);
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

  // ── Oval Circuit lap timer — Circuit City (center x=35, z=84; gate at x=49, z=82-86) ──

  _tickOvalLapTimer(dt) {
    const ls = this._ovalLapState;
    const bot = (this.scrapBot?._brainMode ? this.scrapBot : null)
             ?? (this.scrapBot2?._brainMode ? this.scrapBot2 : null);
    if (!bot?.isActive) { if (ls.inGate) ls.inGate = false; return; }

    // Record ghost at 10 Hz
    if (ls.lapStart > 0) {
      this._ovalGhostRecTimer += dt;
      if (this._ovalGhostRecTimer >= 0.1) {
        this._ovalGhostRecTimer = 0;
        this._ovalGhostFrames.push([
          +bot._pos.x.toFixed(2), +bot._pos.z.toFixed(2),
          +(bot._mesh?.rotation.y ?? 0).toFixed(3),
          (performance.now() - ls.lapStart) | 0,
        ]);
      }
    }

    // Gate: rightmost point of oval, x=48..50, z=81..87
    const bx = bot._pos.x, bz = bot._pos.z;
    const inGate = bx >= 47.5 && bx <= 50.5 && bz >= 81 && bz <= 87;

    if (inGate && !ls.inGate) {
      const now = performance.now();
      if (ls.lapStart > 0 && (now - ls.lapStart) > 3000) {
        const ms       = now - ls.lapStart;
        const improved = ms < ls.bestMs;
        ls.bestMs      = Math.min(ls.bestMs, ms);
        const secs     = (ms / 1000).toFixed(2);
        const best     = (ls.bestMs / 1000).toFixed(2);
        const lapsEl   = this._lapState.lapsEl;
        if (lapsEl) {
          lapsEl.innerHTML = `🏟 Oval Lap: <b>${secs}s</b>${improved ? ' 🏆 NEW BEST!' : ''}<br><span style="font-size:10px">Best: ${best}s</span>`;
          lapsEl.classList.add('show');
          setTimeout(() => lapsEl.classList.remove('show'), 5000);
        }
        this.ui.notify(improved ? `🏆 Oval circuit record: ${secs}s!` : `🏟 Oval lap: ${secs}s`);
        this.audio.lapComplete?.(improved);
        this.particles.burst(49, 1.5, 84, 'confetti', improved ? 30 : 14);
        this.achievements.track('lap_complete', {});
        this.challenge.onLapComplete();
        this.noteBotTaskComplete(bot);   // panic reset: a lap is a completed task
        this.dailyContract?.onLapComplete();
        this.xpSystem.gain(improved ? 30 : 20);
        this._noteFirstLapDelight(bot, secs, 49, 84);   // first autonomous lap, once ever
        bot.speak(bot.personality.quip(improved ? 'lap_record' : 'lap_complete'));
        // Voice announcements for race
        this._lapCount = (this._lapCount ?? 0) + 1;
        announceLap(this._lapCount);
        if (improved) announcePersonalBest();
        if (improved) {
          this._bestOvalGhostFrames = this._ovalGhostFrames.slice();
          this.saveSystem.markDirty();
          // Update race board + announce beaten ghosts
          const beaten = this.raceBoard.setPlayerTime(ms, bot.personality.name, bot.personality.name);
          if (beaten.length) {
            // Beating the top of the board is the announcer's big moment
            if (beaten.includes(NPC_GHOSTS.length - 1)) announceVictory();
            for (const idx of beaten) {
              const ghost = NPC_GHOSTS[idx];
              setTimeout(() => {
                this.ui.notify(`🏆 Beaten ${ghost.name} (${ghost.bot})!`);
                this.foreman.sayLine(BEAT_QUIPS[idx]);
                this.companions?.observe('ghost_beaten', { name: ghost.name, note: ghost.bot });
              }, 1200 + idx * 800);
            }
          }
          setTimeout(() => this.foreman.onEvent('bot_lap_record', {}), 500);
        }
      } else if (ls.lapStart === 0) {
        // Race starting (first gate crossing)
        this._lapCount = 0;
        announceRaceStart();
        preloadAnnouncements();
      }
      // New lap starting
      this._ovalGhostFrames     = [];
      this._ovalGhostRecTimer   = 0;
      this._ovalGhostPbTime     = 0;
      ls.lapStart = now ?? performance.now();
    }
    ls.inGate = inGate;
  }

  _tickOvalGhostPlayback(dt) {
    const frames = this._bestOvalGhostFrames;
    const ls     = this._ovalLapState;
    if (!frames?.length || !ls.lapStart) return;
    this._ovalGhostPbTime += dt * 1000;
    let frame = frames[0];
    for (let i = 1; i < frames.length; i++) {
      if (frames[i][3] > this._ovalGhostPbTime) break;
      frame = frames[i];
    }
    const ghost = this._getGhostMesh();
    ghost.position.set(frame[0], 1.42, frame[1]);
    ghost.rotation.y = frame[2];
    ghost.visible = true;
  }

  _tickBotBadge() {
    const bot = this.scrapBot?.isActive ? this.scrapBot
              : this.scrapBot2?.isActive ? this.scrapBot2
              : null;
    if (!bot) {
      this.ui.showBotBadge(false);
      return;
    }
    this.ui.showBotBadge(true);
    this.ui.updateBotBond(bot.personality.name, bot.personality.bond);
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
