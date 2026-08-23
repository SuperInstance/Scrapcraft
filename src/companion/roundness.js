/**
 * ───────────────────────────────────────────────────────────────────────────
 *  ROUNDNESS BANKS  —  the second layer of every voice
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Four techniques that make a companion three-dimensional instead of loud:
 *
 *   selfCorrection     banter that reverses mid-thought — the character
 *                      disagrees with its own first take, and BOTH halves
 *                      are true ("The map says X. …Actually no, the map
 *                      says Y about me.")
 *   pedanticCorrection each persona's ONE THING it cannot let slide — a
 *                      specific wrong detail, corrected dry, then the whole
 *                      scene reframed by it. Missing the detail is missing
 *                      the character.
 *   quietAttention     template lines that prove the companion has been
 *                      quietly paying attention to the player the whole
 *                      time — callback-able to real telemetry (lap counts,
 *                      repair streaks, mine rhythms). Precision-as-haunting.
 *   wantFlaw           the want and the flaw FIGHT, in 2–3 beats that
 *                      progress across tiers: guarded at stranger, the
 *                      fight visible at coworker, cracked open at friend.
 *                      Deeper beats are ONLY spoken at tier-up moments —
 *                      vulnerability is earned, never first-meet.
 *
 * Fail-soft by construction: every picker returns null on a missing/partial
 * bank, so a persona without a roundness layer behaves exactly as before.
 * Pure module: no I/O, no state mutation, injectable rng.
 *
 * Line shapes mirror banter.js: { tier: 0|1|2, trait?: string, line } with
 * quietAttention allowing `line` to be a template function of the state data.
 */

const TIER_NAMES = ['stranger', 'coworker', 'friend'];

function tierIndexOf(stateLike) {
  if (typeof stateLike?.tierIndex === 'function') return stateLike.tierIndex();
  return TIER_NAMES.indexOf(stateLike?.tier ?? 'stranger');
}

function topTraitOf(stateLike) {
  if (typeof stateLike?.topTrait === 'function') return stateLike.topTrait();
  return stateLike?.topTrait ?? null;
}

/** All lines legal at `tierIndex` — reach one pool down, never up. */
export function filterRoundLines(pool, tierIndex) {
  if (!Array.isArray(pool)) return [];
  return pool.filter(l => l && l.tier !== undefined && l.tier <= tierIndex && l.line);
}

/** Shared picker: tier filter + trait flavor + exact-tier preference (banter.js rules). */
function pickFrom(pool, stateLike, rng) {
  const idx = tierIndexOf(stateLike);
  const eligible = filterRoundLines(pool, idx);
  if (eligible.length === 0) return null;
  const top = topTraitOf(stateLike);
  const flavored = eligible.filter(l => l.trait === top);
  const exact = eligible.filter(l => l.tier === idx);
  const bank = (flavored.length && rng() < 0.65) ? flavored
    : exact.length && rng() < 0.75 ? exact
    : eligible;
  return bank[Math.floor(rng() * bank.length)]?.line ?? null;
}

/** A persona's roundness layer, or null. Never throws. */
export function roundnessOf(persona) {
  try { return persona?.roundness ?? null; } catch { return null; }
}

/** DNA 1 — self-argument: the line that reverses mid-thought. */
export function pickSelfCorrection(persona, stateLike, rng = Math.random) {
  const ro = roundnessOf(persona);
  if (!ro) return null;
  return pickFrom(ro.selfCorrection, stateLike, rng);
}

/** DNA 2 — the One Thing: dry correction of a specific wrong detail. */
export function pickPedanticCorrection(persona, stateLike, rng = Math.random) {
  const ro = roundnessOf(persona);
  const lines = ro?.pedanticCorrection?.lines;
  if (!Array.isArray(lines)) return null;
  return pickFrom(lines, stateLike, rng);
}

/** DNA 3 — precision-as-haunting: "we've been watching, quietly." */
export function pickQuietAttention(persona, stateLike, rng = Math.random) {
  const ro = roundnessOf(persona);
  if (!ro || !Array.isArray(ro.quietAttention)) return null;
  const idx = tierIndexOf(stateLike);
  const data = stateLike?.data ?? stateLike ?? {};
  const eligible = filterRoundLines(ro.quietAttention, idx);
  if (eligible.length === 0) return null;
  const l = eligible[Math.floor(rng() * eligible.length)].line;
  if (typeof l === 'function') {
    try { return l(data) ?? null; } catch { return null; }   // template blows up → silence, not crash
  }
  return typeof l === 'string' ? l : null;
}

/** DNA 4/5 — the want-vs-flaw beat for one exact tier. Tier-up moments only. */
export function wantFlawBeat(persona, tierName, rng = Math.random) {
  const beats = roundnessOf(persona)?.wantFlaw?.beats?.[tierName];
  if (!Array.isArray(beats) || beats.length === 0) return null;
  const b = beats[Math.floor(rng() * beats.length)];
  return typeof b === 'string' ? b : (b?.line ?? null);
}

/**
 * Idle rotation: sometimes the idle line comes from a roundness bank instead
 * of classic observations. Returns null → caller falls back to observations.
 * NOTE: wantFlaw beats are deliberately NOT in this rotation — deeper layers
 * are earned at tier-up, never idle-randomized.
 */
export function pickRoundnessIdle(persona, stateLike, rng = Math.random) {
  if (!roundnessOf(persona)) return null;
  const roll = rng();
  if (roll < 0.25) return pickQuietAttention(persona, stateLike, rng);
  if (roll < 0.45) return pickSelfCorrection(persona, stateLike, rng);
  if (roll < 0.55) return pickPedanticCorrection(persona, stateLike, rng);
  return null;
}
