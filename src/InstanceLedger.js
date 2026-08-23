/**
 * InstanceLedger — headless-testable incremental instancing bookkeeping.
 *
 * Tracks which instances (blocks) are live in each InstancedMesh, supporting
 * add/remove operations without rescanning the world. Pure JS, no three.js import.
 * All tracking via typed arrays; zero allocations in steady state (add/remove/has/slotOf).
 */

export class InstanceLedger {
  constructor() {
    // per-id: { cursor, capacity, entries: Int32Array } where entries[i] holds the x packed coordinate
    this._ledgers = new Map();
    // lazy-built per-id: Map from packed key to slot index
    this._maps = new Map();
  }

  /**
   * Pack (x, y, z) into a single 31-bit integer.
   * World is 128×128×~10; use x + z*128 + y*16384 (fits in 31 bits).
   */
  key(x, y, z) {
    return x + z * 128 + y * 16384;
  }

  /**
   * Unpack a key back to {x, y, z}.
   */
  unpack(key) {
    const y = Math.floor(key / 16384);
    const remainder = key % 16384;
    const z = Math.floor(remainder / 128);
    const x = remainder % 128;
    return { x, y, z };
  }

  /**
   * Seed from a full-count pass {id: count}.
   * Allocates storage for each block type with ~12.5% slack (ceil to 8-multiple).
   */
  plan(countsPerId) {
    this._ledgers.clear();
    this._maps.clear();
    for (const [idStr, count] of Object.entries(countsPerId)) {
      const id = Number(idStr);
      const slack = Math.max(8, count >> 3);
      const capacity = Math.ceil((count + slack) / 8) * 8;
      const entries = new Int32Array(capacity);
      this._ledgers.set(id, { cursor: 0, capacity, entries });
    }
  }

  /**
   * Add a block at (x,y,z) with the given id.
   * Returns the slot index (0-based), growing capacity geometrically if needed.
   * Zero allocations in steady state (only Map.set per id, which is a one-time per-id cost).
   */
  add(id, x, y, z) {
    let ledger = this._ledgers.get(id);
    if (!ledger) {
      // First block of this type: seed with initial capacity
      ledger = { cursor: 0, capacity: 16, entries: new Int32Array(16) };
      this._ledgers.set(id, ledger);
    }

    const key = this.key(x, y, z);

    // Lazy-build the Map for this id
    let idMap = this._maps.get(id);
    if (!idMap) {
      idMap = new Map();
      this._maps.set(id, idMap);
    }

    const slot = ledger.cursor;

    // Check if we need to grow
    if (slot >= ledger.capacity) {
      const newCapacity = Math.ceil(ledger.capacity * 1.5);
      const newEntries = new Int32Array(newCapacity);
      newEntries.set(ledger.entries);
      ledger.capacity = newCapacity;
      ledger.entries = newEntries;
    }

    ledger.entries[slot] = key;
    idMap.set(key, slot);
    ledger.cursor++;

    return slot;
  }

  /**
   * Check if a block exists at (x,y,z) with the given id.
   */
  has(id, x, y, z) {
    const idMap = this._maps.get(id);
    if (!idMap) return false;
    const key = this.key(x, y, z);
    return idMap.has(key);
  }

  /**
   * Get the slot index for a block, or -1 if not found.
   */
  slotOf(id, x, y, z) {
    const idMap = this._maps.get(id);
    if (!idMap) return -1;
    const key = this.key(x, y, z);
    return idMap.get(key) ?? -1;
  }

  /**
   * Remove a block at (x,y,z).
   * Uses swap-remove: moves the instance in the last slot into the removed slot,
   * updates its map entry, then decrements cursor.
   * Returns true if found and removed, false if not found.
   */
  remove(id, x, y, z) {
    const ledger = this._ledgers.get(id);
    if (!ledger) return false;

    const idMap = this._maps.get(id);
    if (!idMap) return false;

    const key = this.key(x, y, z);
    const slot = idMap.get(key);
    if (slot === undefined) return false;

    // Swap with the last live instance
    const lastSlot = ledger.cursor - 1;
    if (slot !== lastSlot) {
      const lastKey = ledger.entries[lastSlot];
      ledger.entries[slot] = lastKey;
      idMap.set(lastKey, slot);
    }

    // Remove the last entry
    ledger.cursor--;
    idMap.delete(key);

    return true;
  }
}
