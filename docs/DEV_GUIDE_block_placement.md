# Dev Guide — Block Placement (Building Mode)

**Goal:** let the player place crafted blocks in the world, completing the
voxel game loop: mine → craft → place → build. This unlocks the building half
of the game and is the prerequisite for the Maker Bench station.

**Effort:** ~3 days.

**Read first:** `src/World.js` (block storage, `setBlock`, `isSolidAt`),
`src/Renderer.js` (instanced mesh rendering), `src/Player.js` (player state,
raycasting for target block).

---

## The core loop

```
Player right-clicks (or presses E near a surface)
        │
        ▼
Raycast from camera forward → find first solid block (+ face hit)
        │
        ▼
Target position = solid block + face normal (the adjacent air cell)
        │
        ▼
Is the player's selected hotbar slot a placeable block?
Is the target position air (not solid, not player position)?
        │
        ▼
world.setBlock(tx, ty, tz, selectedBlockId)
saveSystem.markDirty()
inventory.remove(selectedItemId, 1)
renderer.refreshChunk(tx, tz)     ← update the InstancedMesh
```

---

## File targets

| File | Action |
|---|---|
| `src/Player.js` | Add raycasting, hotbar selection, right-click handler |
| `src/World.js` | Expose `setBlock()` + diff tracking |
| `src/Renderer.js` | Add `refreshChunk()` for incremental InstancedMesh rebuild |
| `src/Game.js` | Wire placement event; ghost block overlay |
| `src/UI.js` | Hotbar UI with selected slot indicator |
| `index.html` | Ghost block preview (CSS outline on a translucent cube) |

---

## Step 1 — Raycasting

The game already uses pointer lock. Add a forward-raycast to find the targeted block:

```js
// src/Player.js — add raycastTarget()
raycastTarget(world, maxDist = 5) {
  const dir = new THREE.Vector3(0, 0, -1)
    .applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'))
    .normalize();

  const pos = this.pos.clone();

  for (let t = 0; t < maxDist; t += 0.05) {
    pos.addScaledVector(dir, 0.05);
    const bx = Math.floor(pos.x);
    const by = Math.floor(pos.y);
    const bz = Math.floor(pos.z);
    if (world.getBlock(bx, by, bz)) {
      // Find the face normal by stepping back one step
      const prev = pos.clone().addScaledVector(dir, -0.05);
      const nx = Math.floor(prev.x) - bx;
      const ny = Math.floor(prev.y) - by;
      const nz = Math.floor(prev.z) - bz;
      return { block: { x: bx, y: by, z: bz }, face: { nx, ny, nz }, distance: t };
    }
  }
  return null;
}
```

Call this each frame to keep a live `player.targetBlock` reference:

```js
// in Player.tick() or Game._update():
this.player.targetBlock = this.player.raycastTarget(this.world);
```

---

## Step 2 — Ghost block preview

While the player holds a placeable item, show a translucent cube at the placement
target. This is the key UX that distinguishes "building mode" from just clicking.

```js
// src/Game.js — add ghost block Three.js mesh
_initGhostBlock() {
  const geo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
  const mat = new THREE.MeshBasicMaterial({ color: 0x88CCFF, transparent: true, opacity: 0.35, depthWrite: false });
  this._ghostMesh = new THREE.Mesh(geo, mat);
  this._ghostMesh.visible = false;
  this.scene.add(this._ghostMesh);
}

// Call from _update():
_updateGhostBlock() {
  const sel = this.ui?.selectedItem;
  const target = this.player.targetBlock;

  if (!target || !sel || !this._isPlaceableBlock(sel)) {
    this._ghostMesh.visible = false;
    return;
  }

  const tx = target.block.x + target.face.nx;
  const ty = target.block.y + target.face.ny;
  const tz = target.block.z + target.face.nz;

  if (this._isOccupied(tx, ty, tz)) {
    this._ghostMesh.visible = false;
    return;
  }

  this._ghostMesh.position.set(tx + 0.5, ty + 0.5, tz + 0.5);
  this._ghostMesh.visible = true;
}
```

---

## Step 3 — Right-click handler

Right-click places a block at the ghost position:

```js
// in Game._bindInput():
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!document.pointerLockElement) return;
  this._placeBlock();
});
```

```js
_placeBlock() {
  const sel    = this.ui?.selectedItem;
  const target = this.player.targetBlock;
  if (!target || !sel) return;

  const blockId = ITEM_TO_BLOCK[sel];
  if (!blockId) return;   // item is not a placeable block

  const tx = target.block.x + target.face.nx;
  const ty = target.block.y + target.face.ny;
  const tz = target.block.z + target.face.nz;

  // Don't place inside the player
  if (this._collidesWithPlayer(tx, ty, tz)) return;

  // Don't place on top of another solid block (already solid = can't place)
  if (this.world.getBlock(tx, ty, tz)) return;

  this.world.setBlock(tx, ty, tz, blockId);
  this.world.recordPlaced(tx, ty, tz, blockId);
  this.player.inventory.remove(sel, 1);
  this.renderer.refreshChunk(tx, tz);
  this.saveSystem?.markDirty();

  // Feedback
  this.audio?.place?.();
  this.particles?.burst(tx + 0.5, ty + 0.5, tz + 0.5, 'place', 3);
}

_collidesWithPlayer(x, y, z) {
  const p = this.player.pos;
  return Math.abs(p.x - x - 0.5) < 0.5 && Math.abs(p.z - z - 0.5) < 0.5 && Math.abs(p.y - y) < 1.8;
}
```

---

## Item-to-block mapping

Which inventory items produce which block IDs when placed:

```js
// src/data/placeableBlocks.js
import { B } from './blocks.js';

// Maps item id → block id
export const ITEM_TO_BLOCK = {
  iron_scrap:    B.IRON_SCRAP,
  copper_wire:   B.COPPER_VEIN,
  rubber_chunk:  B.RUBBER_PILE,
  gear_small:    B.GEAR_PILE,
  circuit_board: B.CIRCUIT_NODE,
  wood_plank:    B.WOODEN_CRATE,
  glass_shard:   B.GLASS_WALL,
  // crafted blocks:
  workbench:     B.WORKBENCH,
  smelter:       B.SMELTER,
  forge:         B.FORGE,
  maker_bench:   B.MAKER_BENCH,
};

export function isPlaceableItem(itemId) {
  return itemId in ITEM_TO_BLOCK;
}
```

---

## Step 4 — `World.setBlock()` and `refreshChunk()`

### `World.js`

If `setBlock` doesn't already exist, add:

```js
setBlock(x, y, z, blockId) {
  if (x < 0 || x >= this.width || z < 0 || z >= this.depth) return;
  if (y < 0 || y >= this.height) return;
  this._blocks[y][z][x] = blockId;
}

getBlock(x, y, z) {
  if (x < 0 || x >= this.width || z < 0 || z >= this.depth) return 0;
  if (y < 0 || y >= this.height) return 0;
  return this._blocks[y][z][x] ?? 0;
}
```

### `Renderer.js` — `refreshChunk(x, z)`

The renderer uses `InstancedMesh` — one mesh per block type. After a placement
or mine, rebuild the instance matrices for the affected chunk column:

```js
refreshChunk(worldX, worldZ) {
  // Determine which chunk (16×16 column) the affected block falls in
  const CHUNK = 16;
  const cx = Math.floor(worldX / CHUNK) * CHUNK;
  const cz = Math.floor(worldZ / CHUNK) * CHUNK;

  // Rebuild ALL instances for block types that may appear in this chunk.
  // Simplest approach: rebuild the entire instanced mesh for each type.
  // (For a 128×128 world this takes < 1ms; optimization deferred.)
  this._rebuildInstances();
}

_rebuildInstances() {
  // Iterate all block types, rebuild their InstancedMesh counts + matrices.
  // This is the same logic as the initial build in init(), just called again.
  for (const [blockId, mesh] of this._instanceMeshes) {
    const positions = this._collectPositions(blockId);
    mesh.count = positions.length;
    positions.forEach((pos, i) => {
      const m = new THREE.Matrix4().setPosition(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
}
```

For large worlds, optimize later with a dirty-chunk set: only rebuild chunks
that contain changed blocks. The simple full rebuild is fast enough for a
128×128 world in a 60fps loop.

---

## Step 5 — Hotbar UI

The player needs a way to select which block/item to place. Add a horizontal
hotbar at the bottom of the screen:

```html
<!-- index.html -->
<div id="hotbar">
  <div class="hb-slot" data-slot="0"></div>
  <div class="hb-slot" data-slot="1"></div>
  <!-- ... 8 total ... -->
</div>
```

```js
// src/UI.js — hotbar management
initHotbar(inventory) {
  this._hotbarItems = [null, null, null, null, null, null, null, null];
  this._selectedSlot = 0;
  this._renderHotbar();
}

selectSlot(n) {
  this._selectedSlot = n % 8;
  document.querySelectorAll('.hb-slot').forEach((el, i) => {
    el.classList.toggle('hb-selected', i === this._selectedSlot);
  });
}

get selectedItem() {
  return this._hotbarItems[this._selectedSlot] ?? null;
}
```

In `Game._bindInput()`:

```js
// Number keys 1-8 select hotbar slots
if (e.key >= '1' && e.key <= '8') {
  this.ui.selectSlot(parseInt(e.key) - 1);
}
// Scroll wheel cycles slots
```

Dragging items from the inventory panel into hotbar slots is Phase 2 polish.
For now, auto-fill the hotbar with the top 8 items from the inventory on open.

---

## Building rules

To keep building fun and prevent exploits:

| Rule | Implementation |
|---|---|
| Can't place inside player body | `_collidesWithPlayer()` check |
| Can't place at y < 0 or y > 9 | `World.setBlock()` bounds check |
| Must have item in inventory | `inventory.count(sel) > 0` check before `_placeBlock()` |
| Can't stack in mid-air (optional) | Check that the block below is solid before placing |
| Maker Bench opens editor on interact | `near_maker` station trigger instead of place-and-done |

The "no mid-air" rule is design-optional — Minecraft allows floating; Scrapcraft
might too. Decide before shipping.

---

## Acceptance criteria

- Right-clicking while holding a placeable item places a block adjacent to the
  targeted face.
- Ghost block preview shows exactly where the block will land.
- Block is consumed from inventory on placement.
- Placed block is solid (player and ScrapBot can't walk through it).
- Placed block persists after reload (save system stores the diff).
- Mined placed-blocks return the item to inventory (existing mine system applies
  to all blocks, including player-placed).
- Placing a Maker Bench → interacting with it → tile editor opens.
- No performance regression — world refresh < 2ms per placement.

## Gotchas

- **InstancedMesh count must match the instance count.** Setting `mesh.count`
  to a higher value than the instances written shows garbage transforms. Always
  set `count` AFTER writing all matrices, not before.
- **Matrix reuse:** `THREE.Matrix4` is GC-expensive in a tight loop. Allocate
  one matrix outside the loop and call `.setPosition()` on it each iteration.
- **Face normal rounding:** The raycast step size (0.05) means the face normal
  calculation (`Math.floor(prev) - bx`) can be off by 1 for nearly-axis-aligned
  hits. Add a `clamp(-1, 1)` to each normal component.
- **Pointer lock and context menu:** In some browsers, `contextmenu` fires even
  in pointer lock mode. The `e.preventDefault()` suppresses the browser menu;
  check `document.pointerLockElement` to confirm lock is active before placing.
