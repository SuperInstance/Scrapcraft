/**
 * ───────────────────────────────────────────────────────────────────────────
 *  VETERAN RIDE  —  mature-start save-seed generator (module-only, pass 1)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Generates a COMPLETE, DETERMINISTIC "veteran" save PROFILE: a player who
 * has already walked six of the twelve spine chapters, owns their tools,
 * and rides into the yard mid-spine at chapter 7. Same opts → byte-identical
 * JSON (no Date.now()/Math.random(); every stamp derives from the injectable
 * `now` opt, which defaults to a FIXED ISO — prefer no jitter, and there is
 * none).
 *
 * The profile is four pieces:
 *
 *   save              a v6-shaped save blob, matching SaveSystem._collect()
 *                     field-for-field (plus the new top-level `veteran`
 *                     honesty flag — verified: _apply() reads only known
 *                     sections, each guarded, so unknown keys are tolerated;
 *                     SaveSystem.js was NOT modified)
 *   spineStorage      written under 'scrapcraft_spine_v1' (Spine.js's key)
 *   wakesStorage      written under 'scrap.wakes.v1' (Wakes.js's key)
 *   companionStorage  written under 'scrapcraft_rivet' (Rivet's legacyKey —
 *                     see companion/personas.js; existing friendships keep
 *                     their save)
 *   trackerStorage    written under 'scrapcraft_quests' (Tracker.js's key) —
 *                     the spine's position TRUTH: chapterComplete() derives
 *                     from tracker completions, so without this the veteran
 *                     would land at ch01 despite the spine map. Seeds every
 *                     carrier of ch01–ch06 done + two of ch07's (started,
 *                     not finished). Entries carry `migrated: true` so the
 *                     logbook reads them as backfilled history, not live runs.
 *
 * ── DECISION: achievements are LIVE-ONLY on veteran profiles ──────────────
 * The honest gate. Seeded gear fabricates NO stats: achievements.unlocked is
 * empty and the stats bag is a fresh all-zeros/empty replica of _collect()'s
 * shape. The veteran arrives with a wrench and a past, but every achievement
 * must still be earned by doing it — the yard doesn't hand out trophies for
 * a backstory. (The companion friendship IS part of the story seed, per
 * spec: Rivet's bond/counters are narrative state, not achievement stats.)
 *
 * ── SLOT POLICY ─────────────────────────────────────────────────────────────
 * This module NEVER writes the live save key 'scrapcraft_save_v6'. The host
 * decides when/where: copy profile.save to VETERAN_SAVE_KEY
 * ('scrapcraft_save_v6_veteran') or apply it on fresh boot — the separate
 * slot is the integrator's job. applyVeteranProfile() only writes the three
 * side-storage entries (spine/wakes/companion), each guarded try/catch.
 *
 * ── WHY earl.questIndex = 16 ───────────────────────────────────────────────
 * A sane mid index, past the early chain: 16 of 20 covers every earl-carried
 * quest of ch01–ch06 (deepest: earl-16) and starts ch07 (earl-8/earl-15 done,
 * magma-3/earl-18 not). Note the foreman's linear index alone does NOT
 * complete ch02–ch06 — those chapters also carry companion-arc quests
 * (magma-1, rivet-1, juno-*, bolt-*) the index never touches. The tracker
 * (key 'scrapcraft_quests') is the spine's position truth and is NOT one of
 * the three entries this module writes: the host seeds it for the full
 * ch01–ch06 walk, or lets Game.js's migrateLegacySave(16) run and calls
 * Spine's markAllStartedAsOpened() — the mechanism Spine ships so returning
 * players never see a wall of catch-up ceremony cards.
 *
 * ── BOTS live outside the save ─────────────────────────────────────────────
 * BotLedgers self-persist under 'scrapcraft_bot_ledger_bot1/bot2' and
 * _apply() never consumes ledgers from the save blob (only the personality
 * snapshots). So the profile carries a `veteran.bots` HINT array — ledger-
 * shaped payloads + their storage keys — for the host to apply if it wants
 * the bots' history; applyVeteranProfile() does not write them.
 *
 * ── ITEM-ID MAPPING (spec name → real src/data/items.js id) ───────────────
 *   copper   → copper_wire   (the game's copper item)
 *   battery  → battery_pack  (the crafted, carryable cell)
 *   flashlight → headlamp    (the game's hand-held light)
 * iron_scrap / circuit_board / wrench / generator are exact already.
 *
 * Headless: zero DOM, zero Game.js imports. Imports only pure modules
 * (XPSystem.js, companion/state.js — both verified DOM-free).
 */

import { XP_SKILLS } from '../XPSystem.js';
import { TIER_THRESHOLDS } from '../companion/state.js';

// ── constants (mirrors of the owning modules' keys; see header) ────────────

/** Live v6 save key — NEVER written by this module (slot policy, header). */
export const LIVE_SAVE_KEY = 'scrapcraft_save_v6';
/** Separate veteran profile slot convention — the host copies/applies here. */
export const VETERAN_SAVE_KEY = 'scrapcraft_save_v6_veteran';
/** Spine.js's storage key (src/quests/Spine.js). */
export const VETERAN_SPINE_KEY = 'scrapcraft_spine_v1';
/** Wakes.js's storage key (src/story/Wakes.js). */
export const VETERAN_WAKES_KEY = 'scrap.wakes.v1';
/** Rivet's legacy companion key (companion/personas.js → legacyKey). */
export const VETERAN_RIVET_KEY = 'scrapcraft_rivet';
/** Tracker.js's storage key (src/quests/Tracker.js). */
export const VETERAN_TRACKER_KEY = 'scrapcraft_quests';

/** Fixed boot-stamp default — determinism anchor for every derived time. */
const FIXED_NOW = '2026-08-23T12:00:00.000Z';
const DAY_MS = 86400000;

const DEFAULT_SEED = 1337;
/** Level-8 veteran: floor(sqrt(640/10)) = 8 (XPSystem's formula). */
const VETERAN_XP = 640;

// Chapter pacing (days before `now`) — fixed arithmetic, no jitter.
const CH_OPEN_D  = { ch01: 42, ch02: 38, ch03: 33, ch04: 27, ch05: 21, ch06: 14, ch07: 3 };
const CH_DONE_D  = { ch01: 40, ch02: 35, ch03: 29, ch04: 23, ch05: 16, ch06: 8 };
const BAND_D     = { 0: 42, 1: 33, 2: 21, 3: 14 };

// The spine's carrier quests per chapter (mirror of spine.json — kept here so
// the generator stays data-local; the integration tests cross-check it against
// the REAL spine via SPINE from quests/data, so drift fails loudly).
const CH_CARRIERS = {
  ch01: ['earl-1', 'earl-3', 'earl-10'],
  ch02: ['earl-2', 'magma-1'],
  ch03: ['earl-4', 'earl-5', 'rivet-1'],
  ch04: ['earl-6', 'earl-7', 'juno-4'],
  ch05: ['earl-9', 'juno-1', 'bolt-1'],
  ch06: ['earl-11', 'earl-16', 'juno-3'],
};
// ch07 is STARTED-not-finished: two carriers done (the elastic middle beats),
// two left walking.
const CH07_STARTED = ['earl-8', 'earl-15'];

// ── helpers (all pure, all deterministic) ──────────────────────────────────

function resolveNow(input) {
  const t = typeof input === 'string' ? Date.parse(input) : NaN;
  return Number.isFinite(t) ? t : Date.parse(FIXED_NOW);
}
function resolveSeed(input) {
  const n = Number(input);
  return Number.isFinite(n) ? n : DEFAULT_SEED;
}
const iso = ms => new Date(ms).toISOString();
function tierOf(bond) {
  if (bond >= TIER_THRESHOLDS.friend) return 'friend';
  if (bond >= TIER_THRESHOLDS.coworker) return 'coworker';
  return 'stranger';
}

/** Fresh stats bag — _collect()'s shape, all zeros/empty (the honest gate). */
function freshStats() {
  return {
    totalMined: 0,
    nightMines: 0,
    inventoryFill: 0,
    crafted: [],
    itemsCollected: {},
    itemsCrafted: {},
    questsCompleted: 0,
    recentCrafts: 0,
    programsRun: 0,
    blocksPlaced: 0,
    wokwiExported: 0,
    hardwareFlashes: 0,
    receiptViews: 0,
    botUpgradesInstalled: 0,
    exchangeTrades: 0,
    tracksPlaced: 0,
    floodlightsPlaced: 0,
    lapsCompleted: 0,
    brainsShared: 0,
    sparkPrograms: 0,
    uniqueSensorsUsed: 0,
    crystalMined: 0,
    headlampUsed: 0,
    cannonsFired: 0,
    waypointReached: 0,
    oreDetections: 0,
    grenadeMaxBlocks: 0,
    airdropLoots: 0,
    luckyFinds: 0,
    narrowEscapes: 0,
    challengesCompleted: 0,
    buriedCachesFound: 0,
    towerActivated: false,
    botNamed: 0,
    botBondMax: 0,
  };
}

/** Stocked 36-slot inventory: tools on the hotbar, materials behind them. */
function veteranInventory() {
  const inv = new Array(36).fill(null);
  const put = (slot, id, qty) => { inv[slot] = { id, qty }; };
  put(0, 'wrench', 1);            // hotbarIndex 0 — a veteran keeps it handy
  put(1, 'headlamp', 1);
  put(2, 'generator', 1);
  put(3, 'iron_scrap', 40);
  put(4, 'copper_wire', 12);
  put(5, 'circuit_board', 6);
  put(6, 'battery_pack', 3);
  return inv;
}

// ── the generator ───────────────────────────────────────────────────────────

/**
 * Build the complete deterministic veteran save profile.
 * @param {object} [opts]
 * @param {number|string} [opts.seed]   world/ride seed (default 1337)
 * @param {string} [opts.now]           ISO stamp every derived time anchors to
 *                                      (default: fixed '2026-08-23T12:00:00.000Z')
 * @returns {{save:object, spineStorage:object, wakesStorage:object,
 *            companionStorage:object, trackerStorage:object}}
 */
export function generateVeteranSave(opts = {}) {
  const o = opts ?? {};                       // null/garbage tolerance
  const nowMs = resolveNow(o.now);
  const seed = resolveSeed(o.seed);
  const at = iso(nowMs);
  const level = Math.floor(Math.sqrt(VETERAN_XP / 10));   // XPSystem formula
  const skills = XP_SKILLS.filter(s => level >= s.level).map(s => s.id);

  const save = {
    version: 6,
    lastSaved: at,

    // the honesty flag — NEW top-level key (tolerated by _apply, verified)
    veteran: {
      ride: true,
      at,
      seed,
      // bots live outside the save (own localStorage keys) → hint array:
      // ledger-shaped payloads the host may apply under storageKey.
      bots: [
        {
          slot: 'bot1',
          storageKey: 'scrapcraft_bot_ledger_bot1',
          ledger: {
            name: 'Sparky',
            dents: [],                                   // recently patched
            repairs: [{ at: nowMs - 1 * DAY_MS, tool: 'repair_kit', dentsFixed: 3 }],
            milestones: [
              { id: 'first_dent',   at: nowMs - 30 * DAY_MS, detail: 'first wall-bonk — every bot has one' },
              { id: 'lap_complete', at: nowMs - 20 * DAY_MS, detail: 'first lap around the oval' },
              { id: 'first_repair', at: nowMs - 12 * DAY_MS, detail: 'first time you patched your bot up' },
              { id: 'ten_laps',     at: nowMs - 9 * DAY_MS,  detail: 'ten laps — a real racer now' },
            ],
            retiredAt: null,
            epitaph: null,
            runtimeS: 18600,                            // matches personality
            laps: 34,                                   // matches Rivet's counters
          },
        },
        {
          slot: 'bot2',
          storageKey: 'scrapcraft_bot_ledger_bot2',
          ledger: {
            name: 'Nano',
            dents: [{ at: nowMs - 2 * DAY_MS, x: 41.5, z: -12.0, speed: 0.82 }],
            repairs: [],
            milestones: [
              { id: 'first_dent', at: nowMs - 2 * DAY_MS, detail: 'first wall-bonk — every bot has one' },
            ],
            retiredAt: null,
            epitaph: null,
            runtimeS: 3600,
            laps: 3,
          },
        },
      ],
    },

    player: {
      pos: { x: 8, y: 2, z: 5 },          // Game.js yard-gate spawn
      yaw: 0,
      hp: 100,
      inventory: veteranInventory(),
      crafted: ['wrench', 'headlamp', 'generator'],
      hotbarIndex: 0,
      waypoint: null,
      headlampOn: false,
    },

    achievements: {
      unlocked: [],                        // LIVE-ONLY (see header DECISION)
      stats: freshStats(),
    },

    xp: {
      xp: VETERAN_XP,
      level,
      skills,
      seenSensors: [],
    },

    story: null,                           // roster quilts its own storage

    tileEditor: null,                      // the player's own program is theirs

    earl: {
      questIndex: 16,                      // 16/20 — see header CONVERGENCE NOTE
      history: [],
    },

    world: {
      seed,
      minedBlocks: [],
      placedBlocks: [],
      signalCaches: [],
    },

    tower: { slots: {}, activated: false },

    botUpgrades: [],
    exchange: {},

    botPersonality: {                      // warmed-up, mid-range — NOT maxed
      name: 'Sparky',
      bond: 62,
      lifetimeSecs: 18600,                 // bond 62 = 18600s × (1/300)×100
      firedMilestones: [25, 50],
    },
    bot2Personality: {                     // the level-5 second bot, younger
      name: 'Nano',
      bond: 12,
      lifetimeSecs: 3600,
      firedMilestones: [],
    },

    daily: null,

    prestige: null,

    comeback: null,                        // no daily contract → no snapshot
    ghostLap: null,
    ovalGhostLap: null,
    ovalBestMs: null,
    fogMap: null,
  };

  // ── spine: ch01–ch06 walked, ch07 started-not-finished ───────────────────
  const opened = {};
  const completedCh = {};
  for (const ch of ['ch01', 'ch02', 'ch03', 'ch04', 'ch05', 'ch06']) {
    opened[ch] = iso(nowMs - CH_OPEN_D[ch] * DAY_MS);
    completedCh[ch] = iso(nowMs - CH_DONE_D[ch] * DAY_MS);
  }
  opened.ch07 = iso(nowMs - CH_OPEN_D.ch07 * DAY_MS);   // mid-spine
  const bandNudged = {};
  for (const [band, d] of Object.entries(BAND_D)) bandNudged[band] = iso(nowMs - d * DAY_MS);

  const spineStorage = {
    v: 1,
    opened,
    bandNudged,
    completedCh,
    completedEver: false,                  // finale not reached
  };

  // ── tracker: the spine's position truth (ch01–ch06 done, ch07 started) ──
  const completed = {};
  const stamp = (d) => iso(nowMs - d * DAY_MS);
  for (const [ch, carriers] of Object.entries(CH_CARRIERS)) {
    for (const qid of carriers) {
      completed[qid] = { at: stamp(CH_DONE_D[ch]), day: null, migrated: true };
    }
  }
  for (const qid of CH07_STARTED) {
    completed[qid] = { at: stamp(CH_OPEN_D.ch07), day: null, migrated: true };
  }
  const trackerStorage = { v: 1, completed, progress: {}, flags: [] };

  // ── wakes: fired for the completed chapters (2, 4, 6) ────────────────────
  const wakesStorage = { '2': true, '4': true, '6': true };

  // ── Rivet: friend tier (bond 130 ≥ 120), believable shared history ───────
  const companionStorage = {
    v: 1,
    bond: 130,
    traits: { scrappy: 0.72, competitive: 0.55, curious: 0.68 },
    counters: {
      blocksMined: 612,
      rareLoot: 23,
      botsBuilt: 2,
      programsRun: 85,
      laps: 34,
      races: 6,
      crashes: 12,
      flashes: 4,
      conversations: 41,
      repairs: 18,
      nudgesFollowed: 15,
      ghostsBeaten: 3,
      sparkAsks: 22,
    },
    biomes: ['The Yard Gate', 'Circuit City', 'The Deep Yard'],
    recent: [                               // short ring — prompt context
      { event: 'lap_complete', at: nowMs - 2 * DAY_MS, note: 'oval, clean lap' },
      { event: 'repair_done', at: nowMs - 1 * DAY_MS, note: 'straightened a bent strut' },
      { event: 'conversation', at: nowMs - DAY_MS / 48, note: null },
    ],
    nudgesDone: ['mine_iron', 'build_first_bot', 'program_bot', 'race_lap'],
    firstMetAt: iso(nowMs - 42 * DAY_MS),   // met at the gate, chapter 1
    banterRecent: {},
  };

  return { save, spineStorage, wakesStorage, companionStorage, trackerStorage };
}

// ── applying the side-storage (never the live save key) ────────────────────

/**
 * Write the profile's four side-storage entries (spine / wakes / Rivet /
 * tracker).
 * Each entry is individually try/catch-guarded (corrupt or quota-full
 * storage must never crash a boot). Injectable storage; localStorage is the
 * guarded default. NEVER touches 'scrapcraft_save_v6' — the live save slot
 * is the host's decision (see VETERAN_SAVE_KEY).
 * @returns {string[]} the keys actually written (fail-soft: skips on throw)
 */
export function applyVeteranProfile(profile, storage) {
  const store = storage !== undefined
    ? storage
    : (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store || typeof store.setItem !== 'function') return [];
  if (!profile || typeof profile !== 'object') return [];

  const entries = [
    [VETERAN_SPINE_KEY, profile.spineStorage],
    [VETERAN_WAKES_KEY, profile.wakesStorage],
    [VETERAN_RIVET_KEY, profile.companionStorage],
    [VETERAN_TRACKER_KEY, profile.trackerStorage],
  ];

  const written = [];
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue;
    try {
      store.setItem(key, JSON.stringify(value));
      written.push(key);
    } catch { /* full, blocked, or corrupt — the yard goes on */ }
  }
  return written;
}

// ── the one-liner for UI display ────────────────────────────────────────────

/**
 * Human-readable summary of a veteran profile (fail-soft on garbage input).
 * @returns {{level:number, chaptersComplete:number, wakesFired:number,
 *            companionTier:string, bots:number, note:string}}
 */
export function veteranRideSummary(profile) {
  const save = profile?.save;
  const spine = profile?.spineStorage;
  const wakes = profile?.wakesStorage;
  const comp = profile?.companionStorage;

  const level = Number.isFinite(save?.xp?.level) ? save.xp.level : 0;
  const chaptersComplete = spine?.completedCh
    ? Object.keys(spine.completedCh).length : 0;
  const wakesFired = wakes
    ? Object.values(wakes).filter(Boolean).length : 0;
  const bond = Number.isFinite(comp?.bond) ? comp.bond : 0;
  const companionTier = tierOf(bond);
  const bots = Array.isArray(save?.veteran?.bots) ? save.veteran.bots.length : 0;

  const note = `Veteran ride: level ${level}, ${chaptersComplete}/12 chapters walked, ` +
    `mid-spine at ch07. Rivet is a ${companionTier}. ` +
    'Achievements are live-only — earn them.';
  return { level, chaptersComplete, wakesFired, companionTier, bots, note };
}
