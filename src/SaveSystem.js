/**
 * SaveSystem — localStorage persistence for SCRAPCRAFT.
 *
 * Saves: player position + inventory + crafted set, XP/level/skills,
 * achievements, Earl's quest chain + the QuestSystem tracker/spine,
 * companion roster + tiers, bot state, and the set of mined blocks
 * (world is procedural; only diffs are stored).
 *
 * WHEN it saves (the layer cake — a session must never end unsaved):
 *   1. Mutation hooks — XPSystem.gain, Player add/remove/takeDamage/heal,
 *      Achievements.track/unlock all mark the save dirty the instant they
 *      fire (wrapped once in _hookMutations; no scattered call-site gods).
 *   2. Drift signature — every tick SaveSystem fingerprints the load-bearing
 *      state (xp, questIndex, inventory total, bond, …). Any change, from any
 *      code path including future ones, re-dirties the save. Catch-all.
 *   3. Milestones — level-ups and quest completions save immediately
 *      (saveMilestone) — the moments a kid would cry about losing.
 *   4. Autosave — every 30s while dirty.
 *   5. Exit — beforeunload + pagehide + visibilitychange→hidden all call
 *      saveOnExit (registered EARLY in Game's constructor, before anything
 *      can crash between here and the old late registration point).
 *
 * SCHEMA: version 6 (additive). Forward-compat: unknown fields from a loaded
 * save survive every round-trip (_preserveUnknown re-merges keys the current
 * collector doesn't know about). Older/missing versions load fail-soft;
 * only a NEWER major version (7+) is refused.
 */

import { TileProgram } from './maker/TileProgram.js';
import { SaveBackend } from './SaveBackend.js';
import { BotLedger } from './BotLedger.js';

const SAVE_KEY       = 'scrapcraft_save_v6';
const SCHEMA_VERSION = 6;
const AUTOSAVE_INT   = 30;  // seconds between autosaves

export class SaveSystem {
  constructor(game) {
    this._game    = game;
    this._timer   = 0;
    this._dirty   = false;
    this._backend = new SaveBackend();
    this._loadedRaw = null;   // last save applied — unknown fields re-merge on collect
    this._sig       = null;   // last-seen drift signature
    this._hooked    = false;
  }

  /** Called after onboarding updates the worker URL. */
  setWorkerUrl(url) {
    this._backend = new SaveBackend(url);
  }

  /**
   * Wrap the core mutation entry points so ANY progress change marks the
   * save dirty without hoping every call site remembers to. Idempotent.
   * Called by Game once the subsystems exist.
   */
  _hookMutations() {
    if (this._hooked) return;
    this._hooked = true;
    const g = this._game;

    // XP — every gain dirties; level-ups save NOW (milestone).
    if (g.xpSystem) {
      const xp = g.xpSystem;
      const origGain = xp.gain.bind(xp);
      xp.gain = n => { const r = origGain(n); if (n > 0) this.markDirty(); return r; };
      xp.on?.('levelup', () => this.saveMilestone('levelup'));
    }

    // Inventory — adds/removes/HP all change saveable state.
    if (g.player) {
      const p = g.player;
      for (const m of ['addItem', 'removeItem', 'takeDamage', 'heal']) {
        if (typeof p[m] !== 'function') continue;
        const orig = p[m].bind(p);
        p[m] = (...a) => { const r = orig(...a); this.markDirty(); return r; };
      }
    }

    // Achievements — tracked stats + unlocks.
    if (g.achievements) {
      const a = g.achievements;
      for (const m of ['track', 'unlock']) {
        if (typeof a[m] !== 'function') continue;
        const orig = a[m].bind(a);
        a[m] = (...args) => { const r = orig(...args); this.markDirty(); return r; };
      }
    }
  }

  /**
   * Cheap fingerprint of load-bearing state. Compared every tick: any drift
   * (from hooked paths, unhooked paths, or tomorrow's code) re-dirties.
   */
  _signature() {
    const g = this._game;
    let inv = 0;
    try { for (const s of g.player?.inventory ?? []) if (s) inv += s.qty; } catch { /* mid-load */ }
    return [
      g.xpSystem?.xp ?? 0,
      g.xpSystem?.level ?? 0,
      g.foreman?._questIndex ?? 0,
      (g.foreman?._history ?? []).length,
      inv,
      g.player?.hp ?? 0,
      g.player?.crafted?.size ?? 0,
      g.achievements?.unlocked?.size ?? 0,
      g.companions?.activeId ?? '',
      g.companions?.active?.state?.data?.bond ?? 0,
      g.quests?.spine?.currentChapterIndex?.() ?? 0,
      g._towerActivated ? 1 : 0,
    ].join('|');
  }

  /** Called each game tick. Drift-checks and autosaves when dirty. */
  tick(dt) {
    const sig = this._signature();
    if (this._sig !== null && sig !== this._sig) this.markDirty();
    this._sig = sig;

    if (!this._dirty) return;
    this._timer += dt;
    if (this._timer >= AUTOSAVE_INT) this.save({ silent: true });
  }

  /** Flag that saveable state has changed. Resets the autosave countdown. */
  markDirty() { this._dirty = true; this._timer = 0; }

  /**
   * Milestone save (level-up, quest complete, …): immediate + silent —
   * these are the moments losing to a refresh would hurt most.
   */
  saveMilestone(_reason) { this.save({ silent: true }); }

  /**
   * Exit-time save: only persists when there's something worth persisting —
   * pending changes or an existing save (a 10-second peek shouldn't create one).
   */
  saveOnExit() {
    if (this._dirty || this.hasSave()) this.save({ silent: true, exit: true });
  }

  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); }
    catch { return false; }
  }

  /** Serialize and persist the full game state. */
  save({ silent = false, exit = false } = {}) {
    if (this._suspended) return;   // mid-wipe window: nothing may resurrect the slot
    try {
      this._game.nightShiftClock?.touch();   // keep the away-clock honest
      const data = this._collect();
      this._backend.write(data, { exit });   // sync local inside; async cloud behind
      if (!silent) this._game.ui?.notify('💾 Saved.' + (this._backend.hasCloud ? ' ☁' : ''));
    } catch (e) {
      console.warn('[SaveSystem] Write failed:', e);
      this._game.ui?.notify('⚠ Save failed — storage full?');
    }
    this._dirty = false;
    this._timer = 0;
    this._sig = this._signature();   // post-save baseline — don't immediately re-dirty
  }

  /** Deserialize and apply a save. Returns true if a valid save was found. */
  load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch { return false; }
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if (typeof data.version === 'number' && data.version > SCHEMA_VERSION) {
        console.warn(`[SaveSystem] Save v${data.version} is newer than this build (v${SCHEMA_VERSION}) — starting fresh.`);
        return false;
      }
      this._apply(data);
      this._loadedRaw = data;
      this._sig = this._signature();
      return true;
    } catch (e) {
      console.warn('[SaveSystem] Load failed:', e);
      return false;
    }
  }

  /** Load, preferring cloud if a session is active. Async variant for class join flows. */
  async loadWithCloud() {
    try {
      const data = await this._backend.read();
      if (!data || (typeof data.version === 'number' && data.version > SCHEMA_VERSION)) return this.load();
      this._apply(data);
      this._loadedRaw = data;
      this._sig = this._signature();
      return true;
    } catch {
      return this.load();
    }
  }

  /** Show a confirm then wipe. */
  wipe() {
    if (typeof confirm === 'function' && !confirm('Delete all saved progress? This cannot be undone.')) return;
    try { sessionStorage.setItem('scrapcraft.self_reload', '1'); } catch { /* optional */ }
    // ZONE-GATE P1: suspend ALL writes for the wipe's 800ms exit window —
    // only exit-saves were guarded, so an autosave/milestone firing inside
    // the window resurrected the just-wiped save (an intermittent
    // "wipe doesn't wipe" that read as a state regression after reload).
    this._suspended = true;
    this._dirty = false;
    this._timer = 0;
    this._backend.wipe().catch(() => {});
    // A wipe must wipe the veteran lanes too, or the belt-2 fallback
    // (Game.js live-slot miss → veteran provenance slot) resurrects the
    // veteran profile on the very next boot of a kid who asked for fresh.
    try {
      localStorage.removeItem('scrapcraft_save_v6_veteran');
      localStorage.removeItem('scrapcraft.veteran.backup');
      localStorage.removeItem('scrapcraft.profile');
    } catch { /* storage optional */ }
    this._loadedRaw = null;
    this._game.ui?.notify('🗑 Save deleted. Reloading...');
    this._game?.observer?.reset?.('save-wipe');   // OBSERVER: session reset (once)
    setTimeout(() => location.reload(), 800);
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  _collect() {
    const g = this._game;
    const p = g.player;
    const s = g.achievements.stats;

    const fresh = {
      version:   SCHEMA_VERSION,
      lastSaved: new Date().toISOString(),

      player: {
        pos:        { x: p.pos.x, y: p.pos.y, z: p.pos.z },
        yaw:        p.yaw ?? 0,
        hp:         p.hp ?? 100,
        inventory:  p.inventory,           // array of {id,qty}|null (already plain JSON)
        crafted:    [...p.crafted],         // Set → array
        hotbarIndex: p.hotbarIndex ?? 0,
        waypoint:   g._waypoint ?? null,
        headlampOn: g._headlampOn ?? false,
      },

      achievements: {
        unlocked: [...g.achievements.unlocked],
        stats: {
          totalMined:      s.totalMined,
          nightMines:      s.nightMines,
          inventoryFill:   s.inventoryFill,
          crafted:         [...s.crafted],
          itemsCollected:  { ...s.itemsCollected },
          itemsCrafted:    { ...s.itemsCrafted },
          questsCompleted:    s.questsCompleted,
          recentCrafts:       s.recentCrafts,
          programsRun:        s.programsRun,
          blocksPlaced:       s.blocksPlaced,
          wokwiExported:      s.wokwiExported      ?? 0,
          hardwareFlashes:    s.hardwareFlashes     ?? 0,
          receiptViews:       s.receiptViews        ?? 0,
          botUpgradesInstalled: s.botUpgradesInstalled ?? 0,
          exchangeTrades:       s.exchangeTrades       ?? 0,
          tracksPlaced:       s.tracksPlaced        ?? 0,
          floodlightsPlaced:  s.floodlightsPlaced   ?? 0,
          lapsCompleted:      s.lapsCompleted       ?? 0,
          brainsShared:       s.brainsShared        ?? 0,
          sparkPrograms:      s.sparkPrograms       ?? 0,
          uniqueSensorsUsed:  s.uniqueSensorsUsed    ?? 0,
          crystalMined:       s.crystalMined        ?? 0,
          headlampUsed:       s.headlampUsed        ?? 0,
          cannonsFired:       s.cannonsFired        ?? 0,
          waypointReached:    s.waypointReached     ?? 0,
          oreDetections:      s.oreDetections       ?? 0,
          grenadeMaxBlocks:   s.grenadeMaxBlocks    ?? 0,
          airdropLoots:       s.airdropLoots        ?? 0,
          luckyFinds:         s.luckyFinds          ?? 0,
          narrowEscapes:      s.narrowEscapes       ?? 0,
          challengesCompleted: s.challengesCompleted ?? 0,
          buriedCachesFound:   s.buriedCachesFound   ?? 0,
          towerActivated:      s.towerActivated      ?? false,
          botNamed:            s.botNamed            ?? 0,
          botBondMax:          s.botBondMax          ?? 0,
        },
      },

      xp: g.xpSystem?.toSaveData() ?? null,

      // Concept ladder — mastery rides the save (cloud state_json carries it;
      // the ledger also keeps its own localStorage copy, spine-style).
      concepts: g.concepts?.toJSON() ?? null,

      // the run's story identity — who walked you in, how the friendship grew
      // (multi-run history reads differently because different friends pulled)
      story: g.companions ? g.companions.quilt() : null,

      // Quest framework — tracker + spine ride the payload for cloud parity.
      // (Their own localStorage stays primary on this machine; the payload
      // version restores on a fresh browser/classroom machine.)
      quests: g.quests ? {
        tracker: g.quests.tracker?.data ?? null,
        spine:   g.quests.spine?.data   ?? null,
      } : null,

      // Companion roster + per-companion state (tiers, bond, counters) —
      // same deal: side-storage primary locally, payload restores elsewhere.
      companions: g.companions ? {
        roster: g.companions.data ?? null,
        states: Object.fromEntries(
          [...(g.companions._companions ?? new Map()).values()]
            .filter(c => c?.state?.data)
            .map(c => [c.persona.id, c.state.data])
        ),
      } : null,

      tileEditor: g.tileEditor?._program?.toJSON() ?? null,

      earl: {
        questIndex: g.foreman._questIndex ?? 0,
        history:    (g.foreman._history ?? []).slice(-20),
      },

      world: {
        seed:         g.world.seed ?? 1337,
        minedBlocks:  g.world._minedBlocks  ?? [],
        placedBlocks: g.world._placedBlocks ?? [],
        signalCaches: [...(g.world.signalCaches ?? [])],
      },

      tower: {
        slots:     g._towerSlots     ?? {},
        activated: g._towerActivated  ?? false,
      },

      botUpgrades:  g.botUpgrades?.toSaveData()  ?? [],
      exchange:     g.exchange?.toSaveData()     ?? {},

      botPersonality:  g.scrapBot?.personality?.toSaveData()  ?? null,
      bot2Personality: g.scrapBot2?.personality?.toSaveData() ?? null,

      // Daily Salvage Contract — progress, streak, lifetime count
      daily: g.dailyContract?.toSaveData() ?? null,

      // Prestige — Earl's Back Room marks + owned rewards
      prestige: g.prestige?.toSaveData() ?? null,

      // Welcome Back snapshot — what day-2-you needs to remember at a glance.
      // Live ledger first (session truth); a throwaway ledger re-reads
      // localStorage when no brain ran yet this session.
      comeback: (() => {
        const ledger = g.scrapBot?.ledger
          ?? (g.scrapBot ? new BotLedger('?', g.scrapBot._slotKey ?? 'bot1') : null);
        return {
          botName:    g.scrapBot?.personality?.name ?? ledger?.name ?? null,
          botBond:    g.scrapBot?.personality?.bond ?? 0,
          botLaps:    ledger?.laps ?? 0,
          botDents:   ledger?.dents?.length ?? 0,
          ovalBestMs: (g._ovalLapState?.bestMs ?? Infinity) === Infinity ? null : g._ovalLapState.bestMs,
          questIndex: g.foreman?._questIndex ?? 0,
          daysPlayed: g.dailyContract?.daysPlayed ?? 1,
          dayStreak:  g.dailyContract?.streak?.count ?? 1,
          nightShiftLastSeen: g.nightShiftClock?.lastSeen ?? null,
        };
      })(),

      ghostLap:     g._bestGhostFrames?.length     ? g._bestGhostFrames     : null,
      ovalGhostLap: g._bestOvalGhostFrames?.length ? g._bestOvalGhostFrames : null,
      ovalBestMs:   g._ovalLapState?.bestMs < Infinity ? g._ovalLapState.bestMs : null,

      fogMap: (() => {
        const fm = g._fogMap;
        if (!fm) return null;
        let str = '';
        for (let i = 0; i < fm.length; i++) str += String.fromCharCode(fm[i]);
        return btoa(str);
      })(),
    };

    // Forward-compat: fields a future build wrote that this one doesn't know
    // survive the round-trip instead of being silently dropped.
    return this._preserveUnknown(this._loadedRaw, fresh);
  }

  /**
   * Merge unknown fields from the last loaded save into a fresh collect.
   * Known (fresh) values always win; keys only the old save had are kept;
   * plain-object sections merge recursively (arrays and scalars: fresh wins).
   */
  _preserveUnknown(saved, fresh) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return fresh;
    const out = { ...fresh };
    for (const [k, v] of Object.entries(saved)) {
      if (!(k in out)) { out[k] = v; continue; }              // unknown key — keep it
      if (_isPlain(v) && _isPlain(out[k])) out[k] = this._preserveUnknown(v, out[k]);
    }
    return out;
  }

  _apply(data) {
    const g = this._game;

    // Player
    const pd = data.player;
    if (pd) {
      g.player.pos.set(pd.pos.x, pd.pos.y, pd.pos.z);
      g.player.yaw         = pd.yaw ?? 0;
      g.player.hp          = pd.hp ?? 100;
      g.player.inventory   = pd.inventory ?? new Array(36).fill(null);
      g.player.crafted     = new Set(pd.crafted ?? []);
      g.player.hotbarIndex = pd.hotbarIndex ?? 0;

      // Restore health HUD after load
      g.ui?.setHealth(g.player.hp, g.player.maxHp);

      // Restore headlamp + waypoint state
      if (pd.waypoint) {
        g._waypoint = pd.waypoint;
        // Sync to any bot adapters (bots aren't active yet at load time; Game.js
        // reads g._waypoint when bots start, so this is enough)
      }
      if (pd.headlampOn) {
        g._headlampOn = true;
        g.renderer?.setHeadlamp(true);
      }
    }

    // Achievements
    const ad = data.achievements;
    if (ad) {
      g.achievements.unlocked = new Set(ad.unlocked ?? []);
      const s = ad.stats ?? {};
      Object.assign(g.achievements.stats, {
        totalMined:      s.totalMined      ?? 0,
        nightMines:      s.nightMines      ?? 0,
        inventoryFill:   s.inventoryFill   ?? 0,
        crafted:         new Set(s.crafted ?? []),
        itemsCollected:  s.itemsCollected  ?? {},
        itemsCrafted:    s.itemsCrafted    ?? {},
        questsCompleted: s.questsCompleted ?? 0,
        recentCrafts:    s.recentCrafts    ?? 0,
        programsRun:       s.programsRun       ?? 0,
        blocksPlaced:      s.blocksPlaced      ?? 0,
        wokwiExported:     s.wokwiExported     ?? 0,
        hardwareFlashes:       s.hardwareFlashes       ?? 0,
        botUpgradesInstalled:  s.botUpgradesInstalled  ?? 0,
        exchangeTrades:        s.exchangeTrades        ?? 0,
        tracksPlaced:      s.tracksPlaced      ?? 0,
        floodlightsPlaced: s.floodlightsPlaced ?? 0,
        lapsCompleted:     s.lapsCompleted     ?? 0,
        brainsShared:      s.brainsShared      ?? 0,
        sparkPrograms:     s.sparkPrograms     ?? 0,
        uniqueSensorsUsed: s.uniqueSensorsUsed  ?? 0,
        crystalMined:      s.crystalMined      ?? 0,
        headlampUsed:      s.headlampUsed      ?? 0,
        cannonsFired:      s.cannonsFired      ?? 0,
        waypointReached:   s.waypointReached    ?? 0,
        oreDetections:     s.oreDetections      ?? 0,
        grenadeMaxBlocks:  s.grenadeMaxBlocks   ?? 0,
        airdropLoots:      s.airdropLoots       ?? 0,
        luckyFinds:        s.luckyFinds         ?? 0,
        narrowEscapes:     s.narrowEscapes      ?? 0,
        challengesCompleted: s.challengesCompleted ?? 0,
        buriedCachesFound:   s.buriedCachesFound   ?? 0,
        towerActivated:      s.towerActivated      ?? false,
        botNamed:            s.botNamed            ?? 0,
        botBondMax:          s.botBondMax          ?? 0,
      });
    }

    // Foreman quest state — index restored; Game resumes the tracker after load
    // (a returning player's quest must come BACK, not silently vanish).
    const ed = data.earl;
    if (ed) {
      g.foreman._questIndex = ed.questIndex ?? 0;
      g.foreman._history    = ed.history ?? [];
      g.foreman._activeQuest = null;
    }

    // Quest framework side-state (tracker + spine). Adopted ONLY when this
    // machine has no local copy — local side-storage is always fresher here;
    // the payload copy exists for fresh browsers / classroom machines.
    if (data.quests) g.quests?.fromSaveData?.(data.quests);

    // Companion roster + tiers — same policy as quests (local copy wins).
    if (data.companions) g.companions?.fromSaveData?.(data.companions);

    // Daily Salvage Contract — progress survives the reload (finish tomorrow)
    if (data.daily) g.dailyContract?.fromSaveData(data.daily);

    // Prestige — marks and board purchases survive the reload
    if (data.prestige) g.prestige?.fromSaveData(data.prestige);

    // Night Shift away-clock: local truth wins if fresher; a cloud save only
    // restores when this browser has no clock of its own yet.
    if (data.comeback?.nightShiftLastSeen != null && g.nightShiftClock?.lastSeen == null) {
      g.nightShiftClock.fromSaveData({ lastSeen: data.comeback.nightShiftLastSeen });
    }

    // Welcome Back snapshot (day-2 briefing) — Game shows it after CLOCK IN
    g._comeback = data.comeback ?? null;

    // XP system
    if (data.xp) g.xpSystem?.fromSaveData(data.xp);

    // Concept ladder — cloud/local saves restore mastery (fail-soft: older
    // saves without `concepts` leave the ledger's own localStorage copy alone)
    if (data.concepts) g.concepts?.fromJSON(data.concepts);

    // Tile editor brain
    if (data.tileEditor) {
      try {
        const prog = TileProgram.fromJSON(data.tileEditor);
        g.tileEditor?.loadProgram(prog);
      } catch (e) {
        console.warn('[SaveSystem] Failed to restore tile editor program:', e);
      }
    }

    // World mined-block diffs
    const wd = data.world;
    if (wd?.minedBlocks?.length) {
      wd.minedBlocks.forEach(({ x, y, z }) => g.world.setBlock(x, y, z, 0));
      g.world._minedBlocks = [...wd.minedBlocks];
    }
    if (wd?.placedBlocks?.length) {
      wd.placedBlocks.forEach(({ x, y, z, id }) => g.world.setBlock(x, y, z, id));
      g.world._placedBlocks = [...wd.placedBlocks];
    }
    if (wd?.signalCaches) {
      g.world.signalCaches = new Set(wd.signalCaches);
    }

    // Radio tower endgame
    if (data.tower) {
      if (data.tower.slots) Object.assign(g._towerSlots, data.tower.slots);
      g._towerActivated = !!data.tower.activated;
      if (g._towerActivated) g._towerNearNotified = true;
    }

    // Bot hardware upgrades
    if (data.botUpgrades) g.botUpgrades?.fromSaveData(data.botUpgrades);

    // Scrap Exchange trade count
    if (data.exchange) g.exchange?.fromSaveData(data.exchange);

    // Bot personalities
    if (data.botPersonality)  g.scrapBot?.personality?.fromSaveData(data.botPersonality);
    if (data.bot2Personality && g.scrapBot2) g.scrapBot2.personality?.fromSaveData(data.bot2Personality);

    // Ghost lap replay (test track + oval)
    if (data.ghostLap?.length)     g._bestGhostFrames     = data.ghostLap;
    if (data.ovalGhostLap?.length) g._bestOvalGhostFrames = data.ovalGhostLap;
    if (data.ovalBestMs != null && g._ovalLapState) g._ovalLapState.bestMs = data.ovalBestMs;

    // Fog of war map
    if (data.fogMap) {
      try {
        const decoded = atob(data.fogMap);
        const arr = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) arr[i] = decoded.charCodeAt(i);
        g._fogMap = arr;
      } catch (e) { console.warn('[SaveSystem] fogMap restore failed:', e); }
    }

    // Refresh HUD
    g.ui?.updateHotbar(g.player);
  }
}

function _isPlain(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
