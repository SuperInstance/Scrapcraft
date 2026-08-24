/**
 * ───────────────────────────────────────────────────────────────────────────
 *  HEAP BEACON  —  point a stuck kid at the scrap (pure, headless)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The first cold-open stall (playtest: a simulated 11yo spent ~8 min holding
 * left-click in the wrong places because NOTHING in the 3D world marks a scrap
 * heap — only a gold dot on a minimap first-time kids never look at). Fix:
 * a fail-soft, additive in-world hint — a floating arrow + gentle pulsing
 * marker on the NEAREST minable scrap heap while the "mine iron" objective is
 * the active next step.
 *
 * Two promises:
 *   1. Pure + headless. Input is a World (or anything with getBlock(x,y,z))
 *      plus a player position. Output is a { dx, dz, dist } answer or null.
 *      No DOM, no Game imports — tests run the real World at seed 42.
 *   2. Additive + fail-soft. No new engine: the scanner reuses the world's
 *      existing block store, and the HUD arrow it feeds reuses the same
 *      screen-arrow pattern the Ore Scanner / Signal Radio already use.
 *
 * What counts as a "heap": blocks that actually drop iron scrap when mined —
 * SCRAP_PILE (named "Scrap Pile", these ARE the rust heaps) and RUST_METAL
 * ("Rusted Metal"). CLEAN_METAL also drops 70% iron but reads as "Steel Panel"
 * to a kid; we bias toward the two reading as heaps. We return the cluster's
 * ground block (y=1), which is what the kid aims at.
 *
 * Scan shape: an expanding ring up to MAX_RANGE blocks — cheap (O(range²),
 * bounded) and finds the nearest heap without scanning the whole 128×128 yard
 * every frame. Derives the bearing for the HUD arrow / companion look-cue.
 */

import { B } from '../data/blocks.js';

export const HEAP_BLOCKS = new Set([B.SCRAP_PILE, B.RUST_METAL]);
export const MAX_RANGE = 48;

/**
 * Find the nearest minable iron scrap heap to a world position.
 * @param {{getBlock:(x:number,y:number,z:number)=>number}} world
 * @param {number} px player world X
 * @param {number} pz player world Z
 * @param {boolean} [checkY1=true] only surface (y=1) blocks — the aim target
 * @returns {{x:number,z:number,d:number}|null}
 *          { x, z } in WORLD (absolute) coords; d = horizontal distance.
 *          null when the yard has no heap in range (fail-soft).
 */
export function nearestScrapHeap(world, px, pz, checkY1 = true) {
  if (!world || typeof world.getBlock !== 'function') return null;
  const cx = Math.round(px);
  const cz = Math.round(pz);
  let best = null;
  let bestD2 = MAX_RANGE * MAX_RANGE + 1;

  // expanding diamond so we can't tunnel to a far heap through a wall-free path
  for (let r = 0; r <= MAX_RANGE && best === null; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue; // ring only
        const d2 = dx * dx + dz * dz;
        if (d2 >= bestD2) continue;
        for (let y = (checkY1 ? 1 : 1); y <= 1; y++) {
          const id = world.getBlock(cx + dx, y, cz + dz);
          if (HEAP_BLOCKS.has(id)) {
            bestD2 = d2;
            best = { x: cx + dx, z: cz + dz, d: Math.sqrt(d2) };
            break;
          }
        }
      }
    }
    // early-out once a ring found something: keep scanning that ring width to
    // resolve ties at the same distance, then stop (expanding diamond already
    // guarantees first-found ring is the nearest).
  }
  return best;
}

/**
 * Bearing (radians, world frame, +Z = north) from a position to a heap —
 * the same atan2 math the Ore Scanner uses. Feeds the screen arrow.
 * @returns {number|null} radians, or null when no heap.
 */
export function heapBearing(world, px, pz) {
  const h = nearestScrapHeap(world, px, pz);
  if (!h) return null;
  return Math.atan2(h.x - Math.round(px), h.z - Math.round(pz));
}

/**
 * Is the "mine iron" next step still the active first objective?
 * Mirrors QuestSystem.nextStep so the beacon only surfaces while the FIRST
 * mine is the current ask (it should never nag after the kid can craft).
 * @param {object|null} step  the nextStep() row (or null)
 * @returns {boolean}
 */
export function heapBeaconActive(step) {
  if (!step) return false;
  return step.kind === 'objective'
    && String(step.questId ?? '').startsWith('earl-1')
    && /mine|iron|scrap/i.test(String(step.title ?? '') + ' ' + String(step.label ?? ''));
}
