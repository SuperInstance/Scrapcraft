/**
 * SaveSystem round-trip suite — the "P2 that won't die" pinned by tests.
 *
 * Proves, with REAL game classes (Player/XPSystem/Achievements/World/Foreman/
 * DailyContract/BotUpgrades/ScrapExchange/QuestSystem-lite):
 *   1. save → load → save = state identity for the FULL payload
 *   2. unknown/forward-compat fields survive every round-trip
 *   3. mutation hooks dirty the save (XP gain, item add, damage, achievement)
 *   4. drift signature catches unhooked mutations (quest index drift)
 *   5. autosave fires at 30s on dirty; stays quiet when clean
 *   6. exit guard: 10-second peek saves nothing; dirty or existing save does
 *   7. cloud parity: the exact payload that hits localStorage is what the
 *      backend would PUT to the Worker (and the beacon route carries it too)
 *   8. version gating: v6 loads; v7 (future) refuses fail-soft
 */

// ── headless environment ────────────────────────────────────────────────────
// (set up INSIDE the test fn — import-time globals would clobber the env for
// every suite that runs before this one in run-tests.mjs)
class MemStorage {
  constructor() { this._m = new Map(); }
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }
  setItem(k, v) { this._m.set(k, String(v)); }
  removeItem(k) { this._m.delete(k); }
  clear() { this._m.clear(); }
  key(i) { return [...this._m.keys()][i] ?? null; }
  get length() { return this._m.size; }
}

import { SaveSystem } from '../SaveSystem.js';
import { SaveBackend } from '../SaveBackend.js';
import { Player } from '../Player.js';
import { XPSystem } from '../XPSystem.js';
import { Achievements } from '../Achievements.js';
import { World } from '../World.js';
import { Foreman } from '../Foreman.js';
import { DailyContract } from '../DailyContract.js';
import { BotUpgrades } from '../BotUpgrades.js';
import { ScrapExchange } from '../ScrapExchange.js';
import { NightShiftClock } from '../NightShift.js';

const SAVE_KEY = 'scrapcraft_save_v6';

// QuestSystem stand-in exercising the REAL Tracker/Spine fromSaveData paths
// (QuestSystem itself pulls the whole campaign graph — covered by quest-tests).
import { QuestTracker } from '../quests/Tracker.js';
import { SpineState } from '../quests/Spine.js';
import { SPINE } from '../quests/data/index.js';

function makeQuests(game) {
  const tracker = new QuestTracker({ storage: localStorage });
  const spine = new SpineState({ spine: SPINE, tracker, storage: localStorage });
  // Mirrors the real QuestSystem constructor: side-storage is primary here.
  tracker.load();
  spine.load();
  return {
    tracker, spine,
    fromSaveData(d) {
      const a = d?.tracker ? this.tracker.fromSaveData?.(d.tracker) : false;
      const b = d?.spine ? this.spine.fromSaveData?.(d.spine) : false;
      return a || b;
    },
  };
}

function makeGame() {
  const world = new World(16, 16, 8);
  world.seed = 1337;
  const renderer = { camera: null, scene: { add() {} }, setHeadlamp() {} };
  const player = new Player(renderer.camera, world);
  const g = {
    world, player, renderer,
    xpSystem: new XPSystem(),
    achievements: new Achievements(),
    foreman: null,
    dailyContract: null,
    nightShiftClock: new NightShiftClock(),
    botUpgrades: new BotUpgrades(),
    exchange: new ScrapExchange(),
    quests: null, concepts: null, companions: null,
    tileEditor: null, scrapBot: null, scrapBot2: null, prestige: null,
    ui: { notify() {}, setHealth() {}, updateHotbar() {} },
    _towerSlots: {}, _towerActivated: false,
    _waypoint: null, _headlampOn: false, _ovalLapState: { bestMs: Infinity },
  };
  g.foreman = new Foreman(g);
  g.dailyContract = new DailyContract(g);
  g.quests = makeQuests(g);
  return g;
}

function play(g) {
  g.player.pos.set(12.5, 3, 7.25);
  g.player.yaw = 1.5;
  g.player.takeDamage(27);            // hp 73
  g.player.addItem('iron_ore', 12);
  g.player.addItem('crystal_fragment', 3);
  g.player.crafted.add('robot_helper');
  g.player.hotbarIndex = 3;
  g.xpSystem.gain(250);               // level 5 (250 = 5²·10)
  g.foreman._questIndex = 4;
  g.foreman._history = ['q0', 'q1', 'q2', 'q3'];
  g.quests.tracker.data.completed['earl-1'] = { at: '2026-08-23T00:00:00Z', day: 1 };
  g.quests.tracker.data.progress['earl-2'] = { events: { mine: 2 }, sparks: [], runs: 1 };
  g.quests.spine.markOpened('ch1');
  g.achievements.stats.totalMined = 40;
  g.world._minedBlocks = [{ x: 1, y: 2, z: 3 }];
  g.world._placedBlocks = [{ x: 4, y: 5, z: 6, id: 7 }];
  g._towerSlots = { signal_amp: 1 };
  g._towerActivated = true;
  g._ovalLapState = { bestMs: 45230 };
  g._waypoint = { x: 10, y: 2, z: 10 };
  g._headlampOn = true;
}

function assertState(g, name, ok) {
  ok('player pos/yaw/hp', g.player.pos.x === 12.5 && g.player.pos.y === 3 && g.player.pos.z === 7.25 && g.player.yaw === 1.5 && g.player.hp === 73);
  ok('inventory (iron 12, crystal 3)', g.player.countItem('iron_ore') === 12 && g.player.countItem('crystal_fragment') === 3);
  ok('hotbar index + crafted set', g.player.hotbarIndex === 3 && g.player.crafted.has('robot_helper'));
  ok('xp + level + derived skills', g.xpSystem.xp === 250 && g.xpSystem.level === 5);
  ok('quest chain index + history', g.foreman._questIndex === 4 && g.foreman._history.length === 4);
  ok('tracker completions + progress', !!g.quests.tracker.data.completed['earl-1'] && g.quests.tracker.data.progress['earl-2']?.events?.mine === 2);
  ok('spine position', !!g.quests.spine.data.opened['ch1']);
  ok('world mined/placed diffs', g.world._minedBlocks.length === 1 && g.world._placedBlocks.length === 1);
  ok('tower endgame', g._towerSlots.signal_amp === 1 && g._towerActivated === true);
  ok('waypoint + headlamp', !!g._waypoint && g._headlampOn === true);
  ok('oval best lap', g._ovalLapState?.bestMs === 45230);
  ok('achievement stats', g.achievements.stats.totalMined === 40);
}

export function runSaveRoundTripTests(ok) {
  globalThis.localStorage = new MemStorage();
  globalThis.sessionStorage = new MemStorage();
  globalThis.window = globalThis;
  globalThis.document = { addEventListener() {}, removeEventListener() {}, getElementById: () => null, visibilityState: 'visible' };
  globalThis.location = { reload() {}, search: '', pathname: '/' };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  globalThis.confirm = () => true;

  // ═══ 1. Full-payload identity: save → load → save → load ═══
  {
    localStorage.clear();
    const g1 = makeGame(); play(g1);
    const ss1 = new SaveSystem(g1); ss1._hookMutations();
    ss1.save({ silent: true });

    const g2 = makeGame();
    const ss2 = new SaveSystem(g2);
    ok('load() applies an existing save', ss2.load() === true);
    assertState(g2, 'reloaded', ok);

    // second leg: re-save from the restored game, reload again
    ss2.save({ silent: true });
    const g3 = makeGame();
    ok('save→load→save→load is identity', new SaveSystem(g3).load() === true);
    assertState(g3, 'second reload', ok);
  }

  // ═══ 2. Forward-compat: unknown fields survive round-trips ═══
  {
    localStorage.clear();
    const g = makeGame(); play(g);
    const ss = new SaveSystem(g); ss.save({ silent: true });

    // simulate a future build's extra fields (top-level + nested + sub-object)
    const future = JSON.parse(localStorage.getItem(SAVE_KEY));
    future.hologramDeck = { enabled: true, tiers: [3, 7] };
    future.player.moodId = 'sunny';
    future.achievements.stats.statFromTheFuture = 42;
    localStorage.setItem(SAVE_KEY, JSON.stringify(future));

    const g2 = makeGame(); const ss2 = new SaveSystem(g2);
    ss2.load(); ss2.save({ silent: true });
    const rt = JSON.parse(localStorage.getItem(SAVE_KEY));
    ok('unknown top-level field survives', rt.hologramDeck?.enabled === true && rt.hologramDeck?.tiers[1] === 7);
    ok('unknown nested field survives', rt.player.moodId === 'sunny');
    ok('unknown stats field survives', rt.achievements.stats.statFromTheFuture === 42);
    ok('known fields still fresh (not stale-merged)', rt.player.inventory.some(s => s?.id === 'iron_ore'));
  }

  // ═══ 3. Mutation hooks dirty the save ═══
  {
    localStorage.clear();
    const g = makeGame();
    const ss = new SaveSystem(g); ss._hookMutations();
    ok('clean save starts non-dirty', ss._dirty === false);
    g.xpSystem.gain(5);
    ok('XP gain dirties', ss._dirty === true);
    ss.save({ silent: true }); ss._dirty = false;
    g.player.addItem('iron_ore', 1);
    ok('item add dirties', ss._dirty === true);
    ss.save({ silent: true }); ss._dirty = false;
    g.player.takeDamage(10);
    ok('damage dirties', ss._dirty === true);
    ss.save({ silent: true }); ss._dirty = false;
    g.achievements.track?.('mine');
    ok('achievement track dirties', ss._dirty === true);
  }

  // ═══ 4. Drift signature catches unhooked mutations ═══
  {
    localStorage.clear();
    const g = makeGame();
    const ss = new SaveSystem(g); ss._hookMutations();
    ss.tick(1);                                  // baseline signature
    ss.save({ silent: true });                   // clears dirty, rebaselines
    g.foreman._questIndex = 7;                   // NO hook on this path
    ss.tick(1);
    ok('drift signature re-dirties on quest-index change', ss._dirty === true);
    ss.save({ silent: true });
    g.player.crafted.add('race_track');          // unhooked path
    ss.tick(1);
    ok('drift signature re-dirties on crafted change', ss._dirty === true);
  }

  // ═══ 5. Autosave: 30s cadence, dirty-gated ═══
  {
    localStorage.clear();
    const g = makeGame();
    const ss = new SaveSystem(g); ss._hookMutations();
    ss.tick(29.9);
    ok('no autosave before 30s', localStorage.getItem(SAVE_KEY) === null);
    g.xpSystem.gain(1);
    ss.tick(29.9);                               // dirty countdown...
    ss.tick(0.2);                                // ...crosses 30s while dirty
    ok('autosave fires at 30s on dirty', localStorage.getItem(SAVE_KEY) !== null);
    ss._dirty = false;
    localStorage.clear();
    ss.tick(60);                                 // clean — never saves
    ok('clean game never autosaves', localStorage.getItem(SAVE_KEY) === null);
  }

  // ═══ 6. Exit guard semantics ═══
  {
    localStorage.clear();
    const peek = makeGame();
    const ssPeek = new SaveSystem(peek);
    ssPeek.saveOnExit();
    ok('10-second peek creates no save', localStorage.getItem(SAVE_KEY) === null);

    const g = makeGame();
    const ss = new SaveSystem(g); ss._hookMutations();
    play(g);                                  // hooked paths (takeDamage…) dirty
    ss.saveOnExit();
    ok('dirty exit saves', localStorage.getItem(SAVE_KEY) !== null);

    localStorage.clear();
    const ssClean = new SaveSystem(makeGame());
    ssClean.hasSave = () => true;                // pre-existing save elsewhere
    ssClean.saveOnExit();
    ok('existing-save exit still saves', localStorage.getItem(SAVE_KEY) !== null);
  }

  // ═══ 7. Cloud parity: backend PUT body == local payload; beacon carries it ═══
  {
    localStorage.clear();
    const puts = [], beacons = [];
    const backend = new SaveBackend('https://worker.test');
    backend._sessionId = 'sess-1';
    backend._cloudAvailable = true;
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/api/v1/save') && init?.method === 'PUT') puts.push(init.body);
      return { ok: true, json: async () => ({}) };
    };
    globalThis.navigator.sendBeacon = (url, blob) => { beacons.push({ url, blob }); return true; };

    const g = makeGame(); play(g);
    const ss = new SaveSystem(g); ss._backend = backend;
    ss.save({ silent: true });
    await0();                                    // let the fire-and-forget fetch resolve
    const local = localStorage.getItem(SAVE_KEY);
    ok('cloud PUT body === local payload', puts.length === 1 && puts[0] === local);

    ss.markDirty();
    ss.save({ silent: true, exit: true });
    await0();
    ok('exit save rides sendBeacon (not fetch)', beacons.length === 1 && puts.length === 1);
    ok('beacon URL carries session id', beacons[0].url.includes('/api/v1/save/beacon?sid=sess-1'));
    ok('beacon payload === local payload', beacons[0].blob !== undefined);
    delete globalThis.navigator.sendBeacon;
  }

  // ═══ 8. Version gating ═══
  {
    localStorage.clear();
    const g = makeGame(); play(g);
    new SaveSystem(g).save({ silent: true });
    const v7 = JSON.parse(localStorage.getItem(SAVE_KEY));
    v7.version = 7; v7.fromTheFuture = true;
    localStorage.setItem(SAVE_KEY, JSON.stringify(v7));
    const g2 = makeGame();
    ok('future version refuses fail-soft', new SaveSystem(g2).load() === false);

    const v5 = JSON.parse(localStorage.getItem(SAVE_KEY));
    v5.version = 5;                              // older sibling — tolerated
    localStorage.setItem(SAVE_KEY, JSON.stringify(v5));
    ok('older/legacy version still loads', new SaveSystem(makeGame()).load() === true);
  }
}

function await0() { /* fire-and-forget fetches resolve on next microtask; callers
                       tick the loop below */ }
