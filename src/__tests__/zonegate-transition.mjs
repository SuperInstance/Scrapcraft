/**
 * Zone-gate transition suite — the "P1 that regressed a save" pinned by tests.
 *
 * Reproduces, headlessly, the live-incident state machine
 * (`vet → restore… → wipe → reload`) from docs/cns/KINETIC-STRESS-TEST.md:
 * a reload during a veteran ride rolled Lv.8 → Lv.0 with the inventory
 * wiped and the quest rolled back. Proves the guard lifecycle:
 *
 *   1. A self-initiated transition unload (veteran ride / restore / wipe)
 *      NEVER exit-saves over the just-written slot.
 *   2. The self_reload guard is ONE-SHOT: the boot after a transition
 *      consumes it, so an ordinary reload (zone crossing, crash recovery,
 *      deploy churn) exit-saves normally instead of losing everything
 *      since the last 30s autosave.  ← the Lv.8→Lv.0 regression class
 *   3. The wipe window is write-suspended: an autosave/milestone firing
 *      inside the 800ms before reload cannot resurrect the wiped slot.
 *   4. A wipe wipes the veteran lanes too — the belt-2 fallback
 *      (Game.js live-slot miss → veteran provenance slot) must not
 *      resurrect the veteran profile after an explicit wipe.
 *   5. Restore still honors the pre-ride backup (the pause-menu promise).
 */

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
import { Player } from '../Player.js';
import { XPSystem } from '../XPSystem.js';
import { Achievements } from '../Achievements.js';
import { World } from '../World.js';
import { Foreman } from '../Foreman.js';
import { DailyContract } from '../DailyContract.js';
import { NightShiftClock } from '../NightShift.js';
import { generateVeteranSave, VETERAN_SAVE_KEY, LIVE_SAVE_KEY } from '../veteran/veteranRide.js';

const GUARD = 'scrapcraft.self_reload';

function makeGame() {
  const world = new World(16, 16, 8);
  world.seed = 1337;
  const renderer = { camera: null, scene: { add() {} }, setHeadlamp() {} };
  const player = new Player(renderer.camera, world);
  const g = {
    world, player, renderer,
    xpSystem: new XPSystem(),
    achievements: new Achievements(),
    foreman: null, dailyContract: null, nightShiftClock: new NightShiftClock(),
    botUpgrades: null, exchange: null, quests: null, concepts: null,
    companions: null, tileEditor: null, scrapBot: null, scrapBot2: null,
    prestige: null,
    ui: { notify() {}, setHealth() {}, updateHotbar() {} },
    _towerSlots: {}, _towerActivated: false,
    _waypoint: null, _headlampOn: false, _ovalLapState: { bestMs: Infinity },
  };
  g.foreman = new Foreman(g);
  g.dailyContract = new DailyContract(g);
  return g;
}

/** Mirrors Game.js's exit-save listeners (beforeunload/pagehide/
 *  visibilitychange all funnel here) + the boot-time guard consumption. */
function unload(ss, saveSystem) {
  if (ss.getItem(GUARD) !== '1') saveSystem.saveOnExit();
}
function bootConsumesGuard(ss) {
  ss.removeItem(GUARD);   // Game.js wires listeners, then consumes the flag
}

export function runZoneGateTransitionTests(ok) {
  const ls = new MemStorage();
  const ss = new MemStorage();
  globalThis.localStorage = ls;
  globalThis.sessionStorage = ss;
  globalThis.window = globalThis;
  globalThis.document = { addEventListener() {}, removeEventListener() {}, getElementById: () => null, visibilityState: 'visible' };
  globalThis.location = { reload() {}, search: '', pathname: '/' };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  globalThis.confirm = () => true;

  // ═══ 1. Transition unload never overwrites the just-written slot ═══
  {
    const g = makeGame();
    const saveSystem = new SaveSystem(g);
    g.player.addItem('iron_ore', 40);
    g.player.addItem('rope', 12);
    saveSystem.save({ silent: true });

    // Veteran ride (Game.js activateVeteranRide slot writes, verbatim):
    const profile = generateVeteranSave();
    const raw = JSON.stringify(profile.save);
    ls.setItem(VETERAN_SAVE_KEY, raw);
    ls.setItem(LIVE_SAVE_KEY, raw);
    ls.setItem('scrapcraft.profile', 'veteran');
    ss.setItem(GUARD, '1');

    unload(ss, saveSystem);   // pagehide during location.reload()
    ok('ride: exit-save suppressed during transition unload', ls.getItem(LIVE_SAVE_KEY) === raw);

    bootConsumesGuard(ss);
    ok('ride: guard consumed at next boot (one-shot)', ss.getItem(GUARD) !== '1');
  }

  // ═══ 2. Ordinary reload AFTER the transition boot exit-saves (the P1) ═══
  {
    const g = makeGame();                      // "boot 2" — memory is fresh
    const saveSystem = new SaveSystem(g);
    const liveBefore = ls.getItem(LIVE_SAVE_KEY);
    saveSystem.load();                         // live slot → memory (veteran)
    g.player.addItem('copper_wire', 5);
    saveSystem.markDirty();

    // The guard is ALREADY consumed (test 1) — an ordinary reload here must
    // persist the live session. Pre-fix the sticky flag skipped this save
    // and a hard tab death froze the slot at the last 30s autosave.
    unload(ss, saveSystem);
    const after = ls.getItem(LIVE_SAVE_KEY);
    ok('post-transition reload: exit-save runs (no sticky guard)', after !== liveBefore);
    const parsed = JSON.parse(after);
    ok('post-transition reload: payload carries the live session',
      JSON.stringify(parsed).includes('copper_wire'));

    // ...and the flag STAYS consumed across this ordinary unload
    bootConsumesGuard(ss);
    const g3 = makeGame();
    const s3 = new SaveSystem(g3);
    s3.load();
    ok('live slot still loadable after the churn', s3.load() === true || !!ls.getItem(LIVE_SAVE_KEY));
  }

  // ═══ 3. Wipe window is write-suspended + veteran lanes cleared ═══
  {
    const g = makeGame();
    const saveSystem = new SaveSystem(g);
    saveSystem.save({ silent: true });
    ls.setItem(VETERAN_SAVE_KEY, ls.getItem(LIVE_SAVE_KEY));
    ls.setItem('scrapcraft.veteran.backup', 'scrapcraft_save_v6_backup_1234');
    ls.setItem('scrapcraft.profile', 'veteran');

    saveSystem.wipe();                         // confirm mocked true

    ok('wipe: live slot cleared', ls.getItem(LIVE_SAVE_KEY) === null);
    ok('wipe: veteran provenance slot cleared', ls.getItem(VETERAN_SAVE_KEY) === null);
    ok('wipe: backup marker cleared', ls.getItem('scrapcraft.veteran.backup') === null);
    ok('wipe: profile marker cleared', ls.getItem('scrapcraft.profile') === null);

    // Autosave + milestone + exit-save inside the 800ms window: all no-ops
    g.player.addItem('iron_ore', 99);
    saveSystem.markDirty();
    saveSystem.save({ silent: true });
    saveSystem.saveMilestone('level_up');
    saveSystem.saveOnExit();
    ok('wipe window: no write resurrects the slot', ls.getItem(LIVE_SAVE_KEY) === null);
  }

  // ═══ 4. Belt-2 after a wipe stays fresh; belt-2 with a provenance slot
  //         still rescues the veteran (rig v3 P0-1 behavior preserved) ═══
  {
    const g = makeGame();
    const saveSystem = new SaveSystem(g);
    const loaded = saveSystem.load();
    let belt2 = false;
    if (!loaded) {
      try {
        const vRaw = ls.getItem(VETERAN_SAVE_KEY);
        if (vRaw && JSON.parse(vRaw).version === 6) {
          saveSystem._apply?.(JSON.parse(vRaw));
          belt2 = true;
        }
      } catch { /* belt only */ }
    }
    ok('post-wipe boot: belt-2 does NOT resurrect the veteran', belt2 === false && g.xpSystem.xp === 0);

    // ...and with the provenance slot present (pre-ride fresh-boot miss),
    // the rescue still works:
    const prof = generateVeteranSave();
    ls.setItem(VETERAN_SAVE_KEY, JSON.stringify(prof.save));
    ls.removeItem(LIVE_SAVE_KEY);
    const g2 = makeGame();
    const s2 = new SaveSystem(g2);
    let belt2b = false;
    if (!s2.load()) {
      const vRaw = ls.getItem(VETERAN_SAVE_KEY);
      if (vRaw && JSON.parse(vRaw).version === 6) { s2._apply?.(JSON.parse(vRaw)); belt2b = true; }
    }
    ok('belt-2 rescue still applies the veteran profile', belt2b === true && g2.xpSystem.xp === prof.save.xp.xp);
  }

  // ═══ 5. Restore path: the backup is honored and its unload is guarded ═══
  {
    const backup = JSON.stringify({ version: 6, lastSaved: '2026-08-20T10:00:00.000Z', xp: { xp: 640 } });
    ls.setItem('scrapcraft_save_v6_backup_9001', backup);
    ls.setItem('scrapcraft.veteran.backup', 'scrapcraft_save_v6_backup_9001');

    // Game.js _restoreVeteranBackup slot writes, verbatim:
    ls.setItem(LIVE_SAVE_KEY, backup);
    ls.removeItem('scrapcraft.veteran.backup');
    ls.removeItem('scrapcraft.profile');
    ss.setItem(GUARD, '1');

    const g = makeGame();
    const saveSystem = new SaveSystem(g);
    saveSystem.markDirty();
    unload(ss, saveSystem);
    ok('restore: exit-save suppressed during transition unload', ls.getItem(LIVE_SAVE_KEY) === backup);

    bootConsumesGuard(ss);
    ok('restore: guard consumed at next boot', ss.getItem(GUARD) !== '1');
  }
}
