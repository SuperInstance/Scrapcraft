# Dev Guide — Save System (localStorage)

**Goal:** persist the player's inventory, position, crafted items, achievements,
world seed, and Big Earl conversation history across page refreshes. This
eliminates the #1 churn reason — losing all progress on reload.

**Effort:** ~1 day.

**Why localStorage (not a server):** The game runs fully client-side; there's no
backend. `localStorage` gives up to 5 MB (plenty for a voxel game state snapshot)
and zero setup. When a server is added later, migrate to an API call here.

---

## What to save

```
SaveData {
  version: 3                      // schema version; bump on breaking changes
  lastSaved: ISO timestamp
  player: {
    pos:   { x, y, z }
    health: number
    facing: number                 // y rotation in radians
  }
  inventory: { [itemId]: count }   // from Player.inventory or Inventory class
  crafted: string[]                // set of recipe ids the player has crafted
  achievements: {
    unlocked: string[]
    stats: { totalMined, nightMines, ... }
    recentCrafts: string[]
  }
  earl: {
    history: [{ role, content }]   // Big Earl's last 10 message pairs
    questState: { [questId]: status }
  }
  world: {
    seed: number                   // for world regen (blocks are procedural)
    placedBlocks: [{ x,y,z, id }]  // only PLAYER-PLACED blocks stored
    minedBlocks:  [{ x,y,z }]      // blocks player removed from world
  }
  makerBrain: null | TileProgram.toJSON()
}
```

The voxel world is procedurally generated from `seed`, so we only need to store
diffs (placed/mined blocks). This keeps the save tiny.

---

## File targets

| File | Action |
|---|---|
| `src/SaveSystem.js` | Create — save/load/autosave logic |
| `src/Game.js` | Wire: save on quit, load on init, autosave timer |
| `src/Player.js` | Expose `toSaveData()` / `fromSaveData()` |
| `src/World.js` | Track placed + mined block diffs |
| `src/Achievements.js` | Expose `toSaveData()` / `fromSaveData()` |
| `src/Foreman.js` | Expose `getHistory()` / `setHistory()` |

---

## `SaveSystem.js`

```js
const SAVE_KEY     = 'scrapcraft_save_v3';
const AUTOSAVE_INT = 60;   // seconds between autosaves

export class SaveSystem {
  constructor(game) {
    this._game = game;
    this._timer = 0;
    this._dirty = false;
  }

  /** Call each game tick. Autosaves every AUTOSAVE_INT seconds. */
  tick(dt) {
    if (!this._dirty) return;
    this._timer += dt;
    if (this._timer >= AUTOSAVE_INT) {
      this.save();
    }
  }

  /** Mark the game state as changed — triggers autosave countdown. */
  markDirty() {
    this._dirty = true;
    this._timer = 0;
  }

  /** Serialize and write to localStorage. */
  save() {
    const data = this._collect();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this._game.ui?.notify('💾 Saved.');
    } catch (e) {
      console.warn('Save failed (storage full?):', e);
      this._game.ui?.notify('⚠️ Save failed — storage full?');
    }
    this._dirty = false;
    this._timer = 0;
  }

  /** Deserialize and apply to game. Returns true if a save existed. */
  load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if (data.version !== 3) {
        console.warn('Save version mismatch — starting fresh.');
        return false;
      }
      this._apply(data);
      this._game.ui?.notify('💾 Game loaded.');
      return true;
    } catch (e) {
      console.warn('Load failed:', e);
      return false;
    }
  }

  /** Wipe all saves. Shows confirmation first. */
  wipe() {
    if (!confirm('Delete all saved progress?')) return;
    localStorage.removeItem(SAVE_KEY);
    this._game.ui?.notify('🗑 Save deleted. Refreshing...');
    setTimeout(() => location.reload(), 800);
  }

  hasSave() {
    return !!localStorage.getItem(SAVE_KEY);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _collect() {
    const g = this._game;
    return {
      version:   3,
      lastSaved: new Date().toISOString(),
      player: {
        pos:     { x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z },
        health:  g.player.health,
        facing:  g.player.yaw ?? 0,
      },
      inventory:    g.player.inventory?.toJSON?.() ?? {},
      crafted:      g.ui?.craftedSet ? [...g.ui.craftedSet] : [],
      achievements: g.achievements?.toSaveData?.() ?? {},
      earl: {
        history:    g.foreman?.getHistory?.() ?? [],
        questState: g.foreman?._quests ?? {},
      },
      world: {
        seed:        g.world?.seed ?? 1337,
        placedBlocks: g.world?.getPlacedBlocks?.() ?? [],
        minedBlocks:  g.world?.getMinedBlocks?.()  ?? [],
      },
      makerBrain: g.scrapBot?._runtime
        ? g.scrapBot._runtime._program?.toJSON?.() ?? null
        : null,
    };
  }

  _apply(data) {
    const g = this._game;

    // Player
    if (data.player) {
      g.player.pos.set(data.player.pos.x, data.player.pos.y, data.player.pos.z);
      g.player.health = data.player.health ?? g.player.health;
      if (data.player.facing != null) g.player.yaw = data.player.facing;
    }

    // Inventory
    if (data.inventory && g.player.inventory?.fromJSON) {
      g.player.inventory.fromJSON(data.inventory);
    }

    // Achievements
    if (data.achievements && g.achievements?.fromSaveData) {
      g.achievements.fromSaveData(data.achievements);
    }

    // Earl conversation history
    if (data.earl?.history && g.foreman?.setHistory) {
      g.foreman.setHistory(data.earl.history);
    }

    // World diffs (placed + mined)
    if (data.world && g.world) {
      g.world.seed = data.world.seed ?? g.world.seed;
      data.world.placedBlocks?.forEach(({ x, y, z, id }) => g.world.setBlock(x, y, z, id));
      data.world.minedBlocks?.forEach(({ x, y, z })     => g.world.setBlock(x, y, z, 0));
    }

    // Robot brain
    if (data.makerBrain) {
      try {
        const { TileProgram } = await import('./maker/index.js');
        const program = TileProgram.fromJSON(data.makerBrain);
        if (g.scrapBot?.isActive) {
          g.scrapBot.setBrain(program, g.world, g.player, g.dayNight);
        }
      } catch (e) {
        console.warn('Could not restore robot brain:', e);
      }
    }
  }
}
```

---

## Wiring into `Game.js`

### In `Game.init()`, after everything is set up:

```js
this.saveSystem = new SaveSystem(this);

// Load save (returns false on first play)
const loaded = this.saveSystem.load();
if (!loaded) {
  // First-time greeting from Earl
  this.foreman.trigger('greeting');
}
```

### In `Game._update(dt)`:

```js
this.saveSystem.tick(dt);
```

### Mark dirty whenever something meaningful changes:

Add `this.saveSystem?.markDirty()` in:
- `Player.collectItem()` — inventory changed
- `Player.takeDamage()` — health changed
- `UI.onCraft()` — recipe crafted
- `World.mineBlock()` — world diff
- `World.placeBlock()` — world diff (once block placement is built)
- `Achievements.unlock()` — achievement unlocked

### Keyboard shortcuts:

```js
// in Game._bindInput():
if (e.code === 'F5') { e.preventDefault(); this.saveSystem.save(); }
if (e.code === 'F9') { e.preventDefault(); this.saveSystem.load(); }
```

---

## Changes to existing classes

### `Player.js` — inventory JSON

Add to the `Inventory` class (or wherever inventory lives):

```js
toJSON() {
  const out = {};
  for (const [id, count] of this._items) out[id] = count;
  return out;
}

fromJSON(obj) {
  this._items.clear();
  for (const [id, count] of Object.entries(obj ?? {})) {
    this._items.set(id, count);
  }
}
```

### `World.js` — track diffs

Add two arrays to track player-altered blocks:

```js
constructor(...) {
  // ... existing ...
  this._placedBlocks = [];  // [{ x, y, z, id }] — player placed
  this._minedBlocks  = [];  // [{ x, y, z }]     — player mined
}

// Call from existing mineBlock / placeBlock:
recordMined(x, y, z) {
  this._minedBlocks.push({ x, y, z });
}

recordPlaced(x, y, z, id) {
  // Remove from mined list if the player re-places at a mined spot
  const idx = this._minedBlocks.findIndex(b => b.x===x && b.y===y && b.z===z);
  if (idx !== -1) this._minedBlocks.splice(idx, 1);
  this._placedBlocks.push({ x, y, z, id });
}

getMinedBlocks()  { return this._minedBlocks; }
getPlacedBlocks() { return this._placedBlocks; }
```

### `Foreman.js` — expose history

```js
getHistory()      { return this._history.slice(-20); }   // last 20 messages
setHistory(hist)  { this._history = hist ?? []; }
```

### `Achievements.js` — expose save data

```js
toSaveData() {
  return {
    unlocked:     [...this._unlocked],
    stats:        { ...this._stats },
    recentCrafts: [...this._stats.recentCrafts ?? []],
  };
}

fromSaveData(data) {
  if (!data) return;
  this._unlocked = new Set(data.unlocked ?? []);
  Object.assign(this._stats, data.stats ?? {});
}
```

---

## Start screen: "Continue" vs "New Game"

When `saveSystem.hasSave()` is true at startup, show a simple choice:

```html
<div id="start-menu">
  <h1>SCRAPCRAFT</h1>
  <button id="btn-continue">Continue</button>
  <button id="btn-new-game">New Game</button>
</div>
```

```js
document.getElementById('btn-continue').addEventListener('click', () => {
  startMenu.classList.add('hidden');
  game.init().then(() => game.saveSystem.load());
});

document.getElementById('btn-new-game').addEventListener('click', () => {
  if (game.saveSystem.hasSave() && !confirm('Start over? Your save will be deleted.')) return;
  game.saveSystem.wipe();
});
```

---

## Schema versioning

The `version: 3` field means you can change the data shape freely during
development. When releasing a breaking change:

1. Bump the version constant in `SaveSystem.js`.
2. Add a migration path if you want to preserve existing saves:

```js
_migrate(data) {
  if (data.version === 2) {
    // e.g., rename field
    data.player.facing = data.player.rotation ?? 0;
    delete data.player.rotation;
    data.version = 3;
  }
  return data;
}
```

3. Call `this._migrate(data)` before `_apply(data)` in `load()`.

---

## Acceptance criteria

- Reloading the page restores player position, health, and inventory.
- Crafted recipes are remembered (crafting UI shows them as previously crafted).
- Earl's conversation history survives a reload (no "who are you?" after refresh).
- Placed blocks and mined blocks survive a reload (world looks the same).
- Achievements persist and don't re-fire.
- Autosave fires every 60 seconds while the game is running (visible via UI toast).
- F5 triggers an immediate save; toast confirms it.
- "New Game" with an existing save prompts confirmation before wiping.
- The robot brain (if loaded) is restored after reload.

## Gotchas

- **World size:** The full voxel grid is ~128×128×10 = 163 840 blocks. Never save
  the full grid — only the diffs. The procedural generator recreates everything
  else from `seed`.
- **5 MB limit:** localStorage hard limit. With diffs only, each diff entry is
  ~20 bytes, so the player would need to alter ~250 000 blocks to overflow. Safe.
- **Async import in `_apply`:** The `TileProgram` import is dynamic to avoid
  pulling the maker engine into the save system's initial load. If the game
  bundles it eagerly, change to a static import at the top.
- **Safari private mode:** localStorage throws in Safari private mode. The
  try/catch in `save()` handles it gracefully.
