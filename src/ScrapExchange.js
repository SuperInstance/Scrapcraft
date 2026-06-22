/**
 * ScrapExchange — daily barter board.
 *
 * Each real-world day (keyed by floor(Date.now() / 86_400_000)) the Exchange
 * posts three deals. A deal is: give N of item A → receive M of item B.
 *
 * The deal set is generated from a deterministic seeded RNG so every player
 * sees the same deals on the same day — but the lineup rotates every 24 h.
 *
 * Location: world position x=14, z=14 (near the spawn gate).
 * Earl has a contact. He won't say who.
 */

const DEAL_POOL = [
  // { give: { item, qty },  get: { item, qty } }
  { give: { item: 'iron_scrap',   qty: 12 }, get: { item: 'circuit_board',    qty: 1 } },
  { give: { item: 'copper_wire',  qty: 8  }, get: { item: 'battery_pack',     qty: 1 } },
  { give: { item: 'rubber_chunk', qty: 6  }, get: { item: 'pir_module',       qty: 1 } },
  { give: { item: 'gear_small',   qty: 4  }, get: { item: 'motor_driver',     qty: 1 } },
  { give: { item: 'fuel_can',     qty: 3  }, get: { item: 'charging_pad',     qty: 1 } },
  { give: { item: 'glass_shard',  qty: 10 }, get: { item: 'ldr_module',       qty: 1 } },
  { give: { item: 'spring',       qty: 5  }, get: { item: 'buzzer_module',    qty: 1 } },
  { give: { item: 'battery_dead', qty: 4  }, get: { item: 'battery_pack',     qty: 2 } },
  { give: { item: 'wood_plank',   qty: 8  }, get: { item: 'ir_module',        qty: 1 } },
  { give: { item: 'iron_scrap',   qty: 20 }, get: { item: 'signal_amp',       qty: 1 } },
  { give: { item: 'copper_wire',  qty: 15 }, get: { item: 'crystal_fragment', qty: 2 } },
  { give: { item: 'glass_shard',  qty: 6  }, get: { item: 'ultrasonic_module',qty: 1 } },
  { give: { item: 'rubber_chunk', qty: 8  }, get: { item: 'servo_module',     qty: 1 } },
  { give: { item: 'gear_small',   qty: 6  }, get: { item: 'ir_module',        qty: 2 } },
  { give: { item: 'fuel_can',     qty: 5  }, get: { item: 'motor_driver',     qty: 2 } },
  { give: { item: 'spring',       qty: 8  }, get: { item: 'crystal_fragment', qty: 1 } },
  { give: { item: 'wood_plank',   qty: 12 }, get: { item: 'pir_module',       qty: 2 } },
  { give: { item: 'battery_dead', qty: 6  }, get: { item: 'charging_pad',     qty: 2 } },
  { give: { item: 'crystal_fragment', qty: 3 }, get: { item: 'vision_brain',  qty: 1 } },
  { give: { item: 'iron_scrap',   qty: 30 }, get: { item: 'spark_brain',      qty: 1 } },
  { give: { item: 'copper_wire',  qty: 20 }, get: { item: 'camera_module',    qty: 1 } },
  { give: { item: 'glass_shard',  qty: 15 }, get: { item: 'signal_amp',       qty: 2 } },
];

/** World position of the Exchange board. */
export const EXCHANGE_POS = { x: 14, z: 14 };

export const EXCHANGE_RADIUS = 6; // blocks

export class ScrapExchange {
  constructor() {
    this._dayKey = null;
    this._deals  = [];
    this.tradesCompleted = 0;
  }

  /** Get today's three deals (regenerates when the date changes). */
  getDeals() {
    const today = Math.floor(Date.now() / 86_400_000);
    if (today !== this._dayKey) {
      this._dayKey = today;
      this._deals  = _pickDeals(today, 3);
    }
    return this._deals;
  }

  /** Time until the next deal refresh (ms). */
  get msUntilRefresh() {
    const msInDay = 86_400_000;
    return msInDay - (Date.now() % msInDay);
  }

  /** Attempt a trade. Returns true on success, false if player can't afford it. */
  trade(dealIndex, player) {
    const deal = this.getDeals()[dealIndex];
    if (!deal) return false;

    // Check player has enough of the give item.
    const haveSlot = player.inventory?.find(s => s?.id === deal.give.item);
    if (!haveSlot || haveSlot.qty < deal.give.qty) return false;

    // Deduct and award.
    player.removeItem(deal.give.item, deal.give.qty);
    player.addItem(deal.get.item, deal.get.qty);
    this.tradesCompleted++;
    return true;
  }

  toSaveData() { return { trades: this.tradesCompleted }; }
  fromSaveData(d) { this.tradesCompleted = d?.trades ?? 0; }
}

// ── Internal ─────────────────────────────────────────────────────────────────

function _pickDeals(seed, n) {
  const rng = _seededRng(seed);
  const pool = [...DEAL_POOL];
  const picks = [];
  while (picks.length < n && pool.length > 0) {
    const idx = Math.floor(rng() * pool.length);
    picks.push({ ...pool[idx] });
    pool.splice(idx, 1);
  }
  return picks;
}

/** Mulberry32 — fast, good-enough seeded PRNG. */
function _seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
