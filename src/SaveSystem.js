/**
 * SaveSystem — localStorage persistence for SCRAPCRAFT.
 *
 * Saves: player position + inventory + crafted set, achievements, Earl's quest
 * state, and the set of mined blocks (world is procedural; only diffs are stored).
 *
 * Autosaves every 60 seconds when dirty. F5 = manual save, F9 = reload.
 * Schema version is bumped (bump SAVE_KEY) on breaking changes.
 */

import { TileProgram } from './maker/TileProgram.js';
import { SaveBackend } from './SaveBackend.js';

const SAVE_KEY     = 'scrapcraft_save_v6';
const AUTOSAVE_INT = 60;  // seconds between autosaves

export class SaveSystem {
  constructor(game) {
    this._game    = game;
    this._timer   = 0;
    this._dirty   = false;
    this._backend = new SaveBackend();
  }

  /** Called after onboarding updates the worker URL. */
  setWorkerUrl(url) {
    this._backend = new SaveBackend(url);
  }

  /** Call each game tick. Triggers autosave when dirty. */
  tick(dt) {
    if (!this._dirty) return;
    this._timer += dt;
    if (this._timer >= AUTOSAVE_INT) this.save();
  }

  /** Flag that saveable state has changed. Resets the autosave countdown. */
  markDirty() { this._dirty = true; this._timer = 0; }

  hasSave() { return !!localStorage.getItem(SAVE_KEY); }

  /** Serialize and persist the full game state. */
  save() {
    try {
      const data = this._collect();
      this._backend.write(data); // async cloud write-behind; sync local inside
      this._game.ui?.notify('💾 Saved.' + (this._backend.hasCloud ? ' ☁' : ''));
    } catch (e) {
      console.warn('[SaveSystem] Write failed:', e);
      this._game.ui?.notify('⚠ Save failed — storage full?');
    }
    this._dirty = false;
    this._timer = 0;
  }

  /** Deserialize and apply a save. Returns true if a valid save was found. */
  load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if (data.version !== 6) {
        console.warn('[SaveSystem] Version mismatch — starting fresh.');
        return false;
      }
      this._apply(data);
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
      if (!data || data.version !== 6) return this.load();
      this._apply(data);
      return true;
    } catch {
      return this.load();
    }
  }

  /** Show a confirm then wipe. */
  wipe() {
    if (!confirm('Delete all saved progress? This cannot be undone.')) return;
    this._backend.wipe().catch(() => {});
    this._game.ui?.notify('🗑 Save deleted. Reloading...');
    setTimeout(() => location.reload(), 800);
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  _collect() {
    const g = this._game;
    const p = g.player;
    const s = g.achievements.stats;

    return {
      version:   6,
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
          lapsCompleted:      s.lapsCompleted        ?? 0,
          brainsShared:       s.brainsShared         ?? 0,
          sparkPrograms:      s.sparkPrograms        ?? 0,
          uniqueSensorsUsed:  s.uniqueSensorsUsed    ?? 0,
          crystalMined:       s.crystalMined         ?? 0,
          headlampUsed:       s.headlampUsed         ?? 0,
          cannonsFired:       s.cannonsFired         ?? 0,
          waypointReached:    s.waypointReached      ?? 0,
          oreDetections:      s.oreDetections        ?? 0,
          grenadeMaxBlocks:   s.grenadeMaxBlocks     ?? 0,
          airdropLoots:       s.airdropLoots         ?? 0,
          luckyFinds:         s.luckyFinds           ?? 0,
          narrowEscapes:      s.narrowEscapes        ?? 0,
          challengesCompleted: s.challengesCompleted ?? 0,
          buriedCachesFound:   s.buriedCachesFound   ?? 0,
          towerActivated:      s.towerActivated      ?? false,
          botNamed:            s.botNamed             ?? 0,
          botBondMax:          s.botBondMax           ?? 0,
        },
      },

      xp: g.xpSystem?.toSaveData() ?? null,

      // the run's story identity — who walked you in, how the friendship grew
      // (multi-run history reads differently because different friends pulled)
      story: g.companions ? g.companions.quilt() : null,

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
        uniqueSensorsUsed: s.uniqueSensorsUsed ?? 0,
        crystalMined:      s.crystalMined      ?? 0,
        headlampUsed:      s.headlampUsed      ?? 0,
        cannonsFired:      s.cannonsFired      ?? 0,
        waypointReached:   s.waypointReached   ?? 0,
        oreDetections:     s.oreDetections     ?? 0,
        grenadeMaxBlocks:  s.grenadeMaxBlocks  ?? 0,
        airdropLoots:      s.airdropLoots      ?? 0,
        luckyFinds:        s.luckyFinds        ?? 0,
        narrowEscapes:     s.narrowEscapes     ?? 0,
        challengesCompleted: s.challengesCompleted ?? 0,
        buriedCachesFound:   s.buriedCachesFound   ?? 0,
        towerActivated:      s.towerActivated      ?? false,
        botNamed:            s.botNamed            ?? 0,
        botBondMax:          s.botBondMax          ?? 0,
      });
    }

    // Foreman quest state
    const ed = data.earl;
    if (ed) {
      g.foreman._questIndex = ed.questIndex ?? 0;
      g.foreman._history    = ed.history ?? [];
      // Resume the active quest if there is one
      if (g.foreman._questIndex > 0) {
        g.foreman._activeQuest = null;   // will be started by _startNextQuest
      }
    }

    // XP system
    if (data.xp) g.xpSystem?.fromSaveData(data.xp);

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
