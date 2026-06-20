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

const SAVE_KEY     = 'scrapcraft_save_v4';
const AUTOSAVE_INT = 60;  // seconds between autosaves

export class SaveSystem {
  constructor(game) {
    this._game  = game;
    this._timer = 0;
    this._dirty = false;
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
      localStorage.setItem(SAVE_KEY, JSON.stringify(this._collect()));
      this._game.ui?.notify('💾 Saved.');
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
      if (data.version !== 4) {
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

  /** Show a confirm then wipe. */
  wipe() {
    if (!confirm('Delete all saved progress? This cannot be undone.')) return;
    localStorage.removeItem(SAVE_KEY);
    this._game.ui?.notify('🗑 Save deleted. Reloading...');
    setTimeout(() => location.reload(), 800);
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  _collect() {
    const g = this._game;
    const p = g.player;
    const s = g.achievements.stats;

    return {
      version:   4,
      lastSaved: new Date().toISOString(),

      player: {
        pos:        { x: p.pos.x, y: p.pos.y, z: p.pos.z },
        yaw:        p.yaw ?? 0,
        inventory:  p.inventory,           // array of {id,qty}|null (already plain JSON)
        crafted:    [...p.crafted],         // Set → array
        hotbarIndex: p.hotbarIndex ?? 0,
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
          tracksPlaced:       s.tracksPlaced        ?? 0,
          floodlightsPlaced:  s.floodlightsPlaced   ?? 0,
          lapsCompleted:      s.lapsCompleted        ?? 0,
          brainsShared:       s.brainsShared         ?? 0,
          sparkPrograms:      s.sparkPrograms        ?? 0,
          uniqueSensorsUsed:  s.uniqueSensorsUsed    ?? 0,
        },
      },

      xp: g.xpSystem?.toSaveData() ?? null,

      tileEditor: g.tileEditor?._program?.toJSON() ?? null,

      earl: {
        questIndex: g.foreman._questIndex ?? 0,
        history:    (g.foreman._history ?? []).slice(-20),
      },

      world: {
        seed:         g.world.seed ?? 1337,
        minedBlocks:  g.world._minedBlocks  ?? [],
        placedBlocks: g.world._placedBlocks ?? [],
      },
    };
  }

  _apply(data) {
    const g = this._game;

    // Player
    const pd = data.player;
    if (pd) {
      g.player.pos.set(pd.pos.x, pd.pos.y, pd.pos.z);
      g.player.yaw         = pd.yaw ?? 0;
      g.player.inventory   = pd.inventory ?? new Array(36).fill(null);
      g.player.crafted     = new Set(pd.crafted ?? []);
      g.player.hotbarIndex = pd.hotbarIndex ?? 0;
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
        tracksPlaced:      s.tracksPlaced      ?? 0,
        floodlightsPlaced: s.floodlightsPlaced ?? 0,
        lapsCompleted:     s.lapsCompleted     ?? 0,
        brainsShared:      s.brainsShared      ?? 0,
        sparkPrograms:     s.sparkPrograms     ?? 0,
        uniqueSensorsUsed: s.uniqueSensorsUsed ?? 0,
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

    // Refresh HUD
    g.ui?.updateHotbar(g.player);
  }
}
