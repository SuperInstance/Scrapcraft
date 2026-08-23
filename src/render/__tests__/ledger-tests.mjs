/**
 * InstanceLedger tests — add/has/slotOf roundtrip, remove swap-remove semantics,
 * regrowth beyond capacity, key packing/unpacking, and steady-state cycles.
 *
 * Pure Node tests; exported as runInstanceLedgerTests(ok, fail) for the harness.
 */

import { InstanceLedger } from '../../InstanceLedger.js';

export function runInstanceLedgerTests(ok) {
  console.log('\nInstanceLedger');

  // ══ 1. Key packing/unpacking roundtrip ═══════════════════════════════════
  {
    const ledger = new InstanceLedger();
    const tests = [
      { x: 0, y: 0, z: 0 },
      { x: 127, y: 0, z: 127 },
      { x: 64, y: 5, z: 64 },
      { x: 1, y: 9, z: 1 },
    ];
    for (const pos of tests) {
      const key = ledger.key(pos.x, pos.y, pos.z);
      const unpacked = ledger.unpack(key);
      ok(
        `key packing roundtrip ${pos.x},${pos.y},${pos.z}`,
        unpacked.x === pos.x && unpacked.y === pos.y && unpacked.z === pos.z,
        `got ${JSON.stringify(unpacked)}`
      );
    }
  }

  // ══ 2. Add/has/slotOf roundtrip ══════════════════════════════════════════
  {
    const ledger = new InstanceLedger();
    ledger.plan({ '1': 5 });
    const slot1 = ledger.add(1, 10, 2, 20);
    ok('first add returns slot 0', slot1 === 0);
    ok('has() finds added block', ledger.has(1, 10, 2, 20) === true);
    ok('slotOf() returns correct slot', ledger.slotOf(1, 10, 2, 20) === 0);

    const slot2 = ledger.add(1, 11, 2, 21);
    ok('second add returns slot 1', slot2 === 1);
    ok('has() finds both blocks', ledger.has(1, 11, 2, 21) === true);
    ok('slotOf() slot2 returns 1', ledger.slotOf(1, 11, 2, 21) === 1);
  }

  // ══ 3. Remove with swap-remove semantics ══════════════════════════════════
  {
    const ledger = new InstanceLedger();
    ledger.plan({ '2': 10 });
    const s1 = ledger.add(2, 0, 0, 0);  // slot 0
    const s2 = ledger.add(2, 1, 0, 1);  // slot 1
    const s3 = ledger.add(2, 2, 0, 2);  // slot 2
    ok('added 3 blocks', s1 === 0 && s2 === 1 && s3 === 2);

    const removed = ledger.remove(2, 1, 0, 1);  // remove middle
    ok('remove returns true', removed === true);
    ok('removed block no longer found', ledger.has(2, 1, 0, 1) === false);
    ok('other blocks still exist', ledger.has(2, 0, 0, 0) && ledger.has(2, 2, 0, 2));
    // After swap-remove, block at (2,0,2) should be in slot 1 (swapped down)
    ok('swapped block moved to removed slot', ledger.slotOf(2, 2, 0, 2) === 1);
    ok('first block still in slot 0', ledger.slotOf(2, 0, 0, 0) === 0);
  }

  // ══ 4. Regrowth beyond initial capacity ═══════════════════════════════════
  {
    const ledger = new InstanceLedger();
    ledger.plan({ '3': 10 });
    const slots = [];
    for (let i = 0; i < 20; i++) {
      const slot = ledger.add(3, i, 0, 0);
      slots.push(slot);
      ok(`add ${i} succeeds`, slot >= 0);
    }
    ok('all 20 blocks accessible', slots.length === 20);
    for (let i = 0; i < 20; i++) {
      ok(`block ${i} still findable`, ledger.has(3, i, 0, 0) === true);
    }
  }

  // ══ 5. Steady-state add/remove cycle ═════════════════════════════════════
  {
    const ledger = new InstanceLedger();
    ledger.plan({ '4': 8 });
    const slots = [];

    // Add 4 blocks
    for (let i = 0; i < 4; i++) {
      slots.push(ledger.add(4, i, 0, 0));
    }
    ok('added 4 blocks to capacity 8', slots.length === 4);

    // Remove #1, add a new one
    ledger.remove(4, 1, 0, 0);
    const newSlot = ledger.add(4, 100, 0, 0);
    ok('after remove/add, new slot reused', newSlot < 4);
    ok('cursor stable after cycle', ledger._ledgers.get(4).cursor === 4);
  }

  // ══ 6. Multiple block types ══════════════════════════════════════════════
  {
    const ledger = new InstanceLedger();
    ledger.plan({ '5': 3, '6': 2 });

    const s5_0 = ledger.add(5, 0, 0, 0);
    const s5_1 = ledger.add(5, 1, 0, 0);
    const s6_0 = ledger.add(6, 10, 0, 0);

    ok('block 5 slot 0', s5_0 === 0);
    ok('block 5 slot 1', s5_1 === 1);
    ok('block 6 slot 0 (separate ledger)', s6_0 === 0);
    ok('block 5 still findable', ledger.has(5, 0, 0, 0));
    ok('block 6 still findable', ledger.has(6, 10, 0, 0));

    ledger.remove(5, 0, 0, 0);
    ok('block 5 removed', !ledger.has(5, 0, 0, 0));
    ok('block 6 unaffected', ledger.has(6, 10, 0, 0));
  }

  // ══ 7. Non-existent block remove returns false ════════════════════════════
  {
    const ledger = new InstanceLedger();
    ledger.plan({ '7': 5 });
    const removed = ledger.remove(7, 99, 99, 99);
    ok('remove non-existent block returns false', removed === false);
  }

  // ══ 8. slotOf returns -1 for missing block ═══════════════════════════════
  {
    const ledger = new InstanceLedger();
    ledger.plan({ '8': 5 });
    const slot = ledger.slotOf(8, 0, 0, 0);
    ok('slotOf missing block returns -1', slot === -1);
  }
}
