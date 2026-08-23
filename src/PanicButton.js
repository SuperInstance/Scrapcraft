/**
 * PanicButton — the Dumpster-Fire Panic Button (fun-review #5, game-designer).
 *
 * Broken bots are the pit of despair. The PANIC button turns despair into a
 * toy: one press → "Rocket Overdrive" (smoke burst, speed frenzy, smashes 5
 * nearby junk blocks) → a salvageable loot cache pops out. Not a fix — a
 * recovery toy. Kids will trigger it on purpose. That's fine. That's the point.
 *
 * Pure, DOM-free logic — the Game wires it to the Bot Card UI:
 *   • shows after PANIC_THRESHOLD crashes without completing a task
 *   • one press per PANIC_COOLDOWN_MS (5 min) — chaos, but rationed chaos
 *   • completing any task (lap, waypoint, challenge) resets the crash count:
 *     the button is for despair, not sport
 */

export const PANIC_THRESHOLD   = 3;
export const PANIC_COOLDOWN_MS = 5 * 60 * 1000;

export function createPanicState() {
  // lastPanicAt: -Infinity = never fired (epoch-0 would read as "just fired")
  return { crashCount: 0, lastPanicAt: -Infinity };
}

export function noteCrash(state) {
  state.crashCount += 1;
  return state;
}

export function noteTaskComplete(state) {
  state.crashCount = 0;
  return state;
}

/**
 * @returns {{show:boolean, enabled:boolean, cooldownRemainingMs:number, crashCount:number}}
 */
export function panicStatus(state, now = Date.now()) {
  const show = state.crashCount >= PANIC_THRESHOLD;
  const elapsed = now - state.lastPanicAt;
  const cooling = state.lastPanicAt > 0 && elapsed < PANIC_COOLDOWN_MS;
  return {
    show,
    enabled: show && !cooling,
    cooldownRemainingMs: cooling ? PANIC_COOLDOWN_MS - elapsed : 0,
    crashCount: state.crashCount,
  };
}

/** Attempt to fire. Returns status on success, null when gated. */
export function consumePanic(state, now = Date.now()) {
  const s = panicStatus(state, now);
  if (!s.enabled) return null;
  state.lastPanicAt = now;
  state.crashCount = 0;
  return s;
}

// Blocks Rocket Overdrive is allowed to smash — junk only. Stations, track,
// ore veins, and the yard's structure are NOT toys. Kid-safe chaos.
export const SMASHABLE_BLOCKS = ['SCRAP_PILE', 'RUST_METAL', 'OIL_DRUM', 'JUNK_CAR', 'CONCRETE'];

/**
 * Pick up to `max` smashable blocks nearest the bot, nearest-first.
 * Pure: takes the ids (numbers) it may smash; returns coordinates.
 *
 * @param {{x:number, z:number, y?:number}} pos bot position
 * @param {function(x:number,y:number,z:number):number} getBlock
 * @param {{id:number}[]} smashableIds resolved block-id whitelist
 */
export function smashTargets(pos, getBlock, smashableIds, { max = 5, radius = 4, yMin = 1, yMax = 3 } = {}) {
  const allow = new Set(smashableIds.map(s => s.id));
  const found = [];
  const cx = Math.floor(pos.x), cz = Math.floor(pos.z);
  const r = Math.ceil(radius);
  for (let dy = 0; dy <= (yMax - yMin); dy++) {
    const y = yMin + dy;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const id = getBlock(cx + dx, y, cz + dz);
        if (id && allow.has(id)) {
          found.push({ x: cx + dx, y, z: cz + dz, id, d2: dx * dx + dz * dz });
        }
      }
    }
  }
  found.sort((a, b) => a.d2 - b.d2);
  return found.slice(0, max).map(({ x, y, z, id }) => ({ x, y, z, id }));
}

/** The loot cache Rocket Overdrive coughs up — salvage, not a jackpot. */
export function rollLootCache(rand = Math.random) {
  const cache = [{ id: 'iron_scrap', qty: 3 + Math.floor(rand() * 3) }];
  if (rand() < 0.6) cache.push({ id: 'copper_wire', qty: 1 + Math.floor(rand() * 2) });
  if (rand() < 0.35) cache.push({ id: 'small_gear', qty: 1 });
  return cache;
}
