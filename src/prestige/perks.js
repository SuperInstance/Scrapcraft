/**
 * ───────────────────────────────────────────────────────────────────────────
 *  ACHIEVEMENT PERKS  —  small kind perks for milestone achievements
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Doctrine (the no-power-creed charter, enforced by tests):
 *
 *  1. Perks are COMFORT, never gates. No quest objective, contract, or race
 *     outcome ever requires a perk. The tracker's objectives count items,
 *     events, and laps — none of them measure reach, lantern brightness, or
 *     stickers. (quest-tests.mjs enforces the objective taxonomy; this file
 *     never adds a stat the tracker reads.)
 *  2. Perks are SMALL. +1 tile of mining reach, a warmer lamp, one extra
 *     Logbook sticker row. No speed, no XP multipliers, no economy boosts,
 *     no race advantages — racing achievements intentionally grant NOTHING.
 *  3. Perks are earned, never bought, never timed. No streak-shaming (a
 *     kid who logs in after a month has every perk they ever earned), no
 *     FOMO timers, nothing expires.
 *
 * Headless + pure: perk effects are computed from the set of unlocked
 * achievement ids — no game imports, no DOM. Game.js applies them at two
 * surgical points (raycaster reach, headlamp intensity) and the Logbook
 * panel adds its sticker row additively.
 */

/**
 * Milestone achievement → perk. Deliberately tiny table: only three perks
 * exist because only three KINDS of kindness exist here — reach, light,
 * and a place to put your stickers.
 */
export const ACHIEVEMENT_PERKS = {
  // 100 blocks mined — the yard trusts your hands: one extra tile of reach.
  night_miner: { perk: 'long_arms', label: 'Long Arms', icon: '🦾' },

  // Field Guide 20 entries — you've read enough to know what light should
  // feel like: the lantern glows warmer (comfort, not range).
  field_scholar: { perk: 'warm_glow', label: 'Warm Glow', icon: '🏮' },

  // Full Field Guide (40) — the Logbook gets one extra sticker row, because
  // a kid this thorough has earned a place to put things.
  full_codex: { perk: 'sticker_row', label: 'Sticker Row', icon: '🏷️' },
};

/** Perk effect sizes. Small on purpose. */
export const PERK_EFFECTS = {
  long_arms:  { mineReachTiles: 1,  lanternBrightness: 0,   stickerRows: 0 },
  warm_glow:  { mineReachTiles: 0,  lanternBrightness: 0.7, stickerRows: 0 },
  sticker_row:{ mineReachTiles: 0,  lanternBrightness: 0,   stickerRows: 1 },
};

/** Perks granted by a set of unlocked achievement ids. Pure. */
export function perksFor(unlockedIds) {
  const set = unlockedIds instanceof Set ? unlockedIds : new Set(unlockedIds ?? []);
  const perks = [];
  for (const [achId, def] of Object.entries(ACHIEVEMENT_PERKS)) {
    if (set.has(achId)) perks.push({ ...def, id: def.perk });
  }
  return perks;
}

/** Aggregate perk effects from a set of unlocked achievement ids. Pure. */
export function perkEffects(unlockedIds) {
  const out = { mineReachTiles: 0, lanternBrightness: 0, stickerRows: 0 };
  for (const p of perksFor(unlockedIds)) {
    const e = PERK_EFFECTS[p.id] ?? {};
    out.mineReachTiles   += e.mineReachTiles   ?? 0;
    out.lanternBrightness += e.lanternBrightness ?? 0;
    out.stickerRows      += e.stickerRows      ?? 0;
  }
  return out;
}

/**
 * Racing + economy achievements that intentionally grant NO perk — kept as
 * data so tests (and future contributors) can see the line we do not cross.
 * A perk that made laps faster or loot richer would make achievements
 * mandatory, and mandatory is the opposite of kind.
 */
export const INTENTIONALLY_NO_PERK = [
  'bot_racer',       // race outcomes stay skill-and-tuning, never perk-bought
  'oval_racer',      // same — no race advantage, ever
  'rust_whisperer',  // no economy perks: collecting stays about curiosity
  'night_owl',       // no night-mining boosts: no pressure to play at night
  'night_miner_x',   // (reserved) — no grind-forever perk ladder
];
