/**
 * BotUpgrades — persistent hardware modifications for the ScrapBot.
 *
 * Five upgrades arranged in two parallel prerequisite chains that merge at
 * the final Neural Optimizer tier. Each upgrade costs specific items and
 * requires a minimum XP level.
 *
 * Multiplier stats applied at runtime:
 *   speed        — BOT_SPEED coefficient in ScrapBot
 *   battery_life — drain divisor in ScrapBot
 *   sensor_range — SONAR_RANGE multiplier in GameWorldAdapter
 *   tick_speed   — dt multiplier fed into MakerRuntime.tick()
 *
 * Usage:
 *   const u = new BotUpgrades();
 *   u.fromSaveData(savedArray);
 *   u.getMultiplier('speed');          // 1.0 or 1.3
 *   u.purchase('turbo_drive', player, xpSystem);  // → bool
 *   u.toSaveData();                    // → string[]
 */

export const UPGRADE_DEFS = [
  {
    id: 'turbo_drive',
    name: 'Turbo Drive',
    icon: '⚡',
    desc: 'Bot moves 30% faster when running a brain program. Lap times will improve.',
    stat: 'speed',
    multiplier: 1.3,
    cost: { gear_small: 3, motor_driver: 2 },
    prereqs: [],
    levelReq: 3,
  },
  {
    id: 'extended_battery',
    name: 'Extended Battery',
    icon: '🔋',
    desc: 'Battery lasts twice as long. Double your autonomous runtime before recharging.',
    stat: 'battery_life',
    multiplier: 2.0,
    cost: { battery_pack: 3, copper_wire: 2 },
    prereqs: [],
    levelReq: 3,
  },
  {
    id: 'precision_encoder',
    name: 'Precision Encoder',
    icon: '🎯',
    desc: 'drive_distance tiles overshoot 25% less. Useful for tight programs.',
    stat: 'precision',
    multiplier: 1.25,
    cost: { circuit_board: 2, spring: 2, crystal_fragment: 1 },
    prereqs: ['turbo_drive'],
    levelReq: 5,
  },
  {
    id: 'wide_angle_sensors',
    name: 'Wide-Angle Sensors',
    icon: '📡',
    desc: 'Sonar and PIR range increases by 60%. Obstacles are detected further away.',
    stat: 'sensor_range',
    multiplier: 1.6,
    cost: { pir_module: 2, ultrasonic_module: 2, circuit_board: 1 },
    prereqs: ['extended_battery'],
    levelReq: 5,
  },
  {
    id: 'neural_optimizer',
    name: 'Neural Optimizer',
    icon: '🧠',
    desc: 'Program runs 40% faster. WAIT tiles are shorter; reactions are snappier.',
    stat: 'tick_speed',
    multiplier: 1.4,
    cost: { circuit_board: 3, crystal_fragment: 2, spark_brain: 1 },
    prereqs: ['precision_encoder', 'wide_angle_sensors'],
    levelReq: 8,
  },
];

export class BotUpgrades {
  constructor() {
    this.purchased = new Set();
  }

  /**
   * Combined multiplier for a given stat across all purchased upgrades.
   * Returns 1.0 if nothing relevant is purchased.
   */
  getMultiplier(stat) {
    let m = 1;
    for (const id of this.purchased) {
      const def = UPGRADE_DEFS.find(u => u.id === id);
      if (def?.stat === stat) m *= def.multiplier;
    }
    return m;
  }

  prereqsMet(id) {
    const def = UPGRADE_DEFS.find(u => u.id === id);
    return def ? def.prereqs.every(p => this.purchased.has(p)) : false;
  }

  levelOk(id, xpSystem) {
    const def = UPGRADE_DEFS.find(u => u.id === id);
    if (!def) return false;
    return (xpSystem?.level ?? 0) >= def.levelReq;
  }

  canAfford(id, inventory) {
    const def = UPGRADE_DEFS.find(u => u.id === id);
    if (!def) return false;
    for (const [item, qty] of Object.entries(def.cost)) {
      const slot = inventory?.find(s => s?.id === item);
      if (!slot || slot.qty < qty) return false;
    }
    return true;
  }

  /**
   * Attempt to purchase an upgrade. Deducts items from player inventory.
   * Returns true on success, false if any condition is not met.
   */
  purchase(id, player, xpSystem) {
    if (this.purchased.has(id)) return false;
    const def = UPGRADE_DEFS.find(u => u.id === id);
    if (!def) return false;
    if (!this.prereqsMet(id)) return false;
    if (!this.levelOk(id, xpSystem)) return false;
    if (!this.canAfford(id, player.inventory)) return false;

    for (const [item, qty] of Object.entries(def.cost)) {
      player.removeItem(item, qty);
    }
    this.purchased.add(id);
    return true;
  }

  toSaveData() { return [...this.purchased]; }
  fromSaveData(arr) { this.purchased = new Set(arr ?? []); }
}
