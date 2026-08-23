/**
 * ───────────────────────────────────────────────────────────────────────────
 *  RIVET STATE  —  the companion who grows with you
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Rivet is a small repair-drone who arrived in the yard the same day you did.
 * The relationship is REAL because it is earned by real events: blocks mined
 * together, robots built, races run, crashes survived, conversations had.
 *
 *   tiers     stranger → coworker → friend (bond thresholds, never lost)
 *   bond      grows from shared experiences — mining, building, racing, talking
 *   traits    three sliders that shift with play style:
 *               scrappy     — mines a lot, digs through junk → punchier lines
 *               competitive — races and laps  → trash talk (the kind kind)
 *               curious     — asks lots of questions → wonders out loud
 *
 * Persisted to localStorage under a versioned schema (same doctrine as
 * BotLedger): v1 today, migrations later, corrupt saves start fresh —
 * the game never breaks because a save is weird.
 *
 * Headless-testable: storage is injectable, zero DOM/three.js deps.
 */

export const RIVET_SCHEMA_VERSION = 1;
const LS_KEY = 'scrapcraft_rivet';

/** Bond awarded per shared event. Real events only — no timers, no pity points. */
export const BOND_EVENTS = {
  first_meet:      0,   // meeting costs nothing; staying is what counts
  block_mined:     1,
  rare_loot:       3,
  bot_built:       12,
  program_run:     4,
  lap_complete:    6,
  race_run:        8,
  crash_survived:  3,   // you got through it together — that counts double-ish
  flash_success:   10,
  conversation:    5,
  biome_first:     5,
  repair_done:     4,
  nudge_followed:  3,   // player tried the thing Rivet suggested
};

/** Tier thresholds in bond points. Once earned, never lost. */
export const TIER_THRESHOLDS = { stranger: 0, coworker: 30, friend: 120 };
export const TIERS = ['stranger', 'coworker', 'friend'];

/** Which shared experiences nudge which trait. */
const TRAIT_EVENTS = {
  scrappy:     ['block_mined', 'rare_loot', 'repair_done'],
  competitive: ['lap_complete', 'race_run'],
  curious:     ['conversation', 'flash_success'],
};

/** How far one event pushes a trait toward 1 (and the others toward the floor). */
const TRAIT_PUSH = 0.04;
const TRAIT_PULL = 0.008;
const TRAIT_FLOOR = 0.08;

const RECENT_CAP = 12;

export class RivetState {
  /**
   * @param {object} [opts]
   * @param {Storage|object|null} [opts.storage] injectable storage (tests); defaults to localStorage if present
   */
  constructor(opts = {}) {
    this._storage = opts.storage !== undefined
      ? opts.storage
      : (typeof localStorage !== 'undefined' ? localStorage : null);
    this.data = this._fresh();
    this.load();
  }

  _fresh() {
    return {
      v: RIVET_SCHEMA_VERSION,
      bond: 0,
      traits: { scrappy: 0.15, competitive: 0.15, curious: 0.45 }, // born curious
      counters: {
        blocksMined: 0, rareLoot: 0, botsBuilt: 0, programsRun: 0,
        laps: 0, races: 0, crashes: 0, flashes: 0, conversations: 0,
        repairs: 0, nudgesFollowed: 0,
      },
      biomes: [],            // biome names visited (first time = an event)
      recent: [],            // ring of recent shared events (prompt context)
      nudgesDone: [],        // progress topics the player has actually tried
      firstMetAt: null,      // timestamp of the day you two met
    };
  }

  /** Current relationship tier, derived from bond. Never decreases. */
  get tier() {
    if (this.data.bond >= TIER_THRESHOLDS.friend) return 'friend';
    if (this.data.bond >= TIER_THRESHOLDS.coworker) return 'coworker';
    return 'stranger';
  }

  tierIndex() { return TIERS.indexOf(this.tier); }

  /** The trait the player's play style has grown strongest. */
  topTrait() {
    const t = this.data.traits;
    return Object.entries(t).sort((a, b) => b[1] - a[1])[0][0];
  }

  /**
   * Record a shared event. Updates bond, traits, counters, the recent ring.
   * @returns {{event:string, tierUp:string|null, first:object|null}}
   *          tierUp is the NEW tier name when this event crossed a threshold.
   */
  record(event, detail = {}) {
    const d = this.data;
    const prevTier = this.tier;
    const first = {};

    // bond
    const gain = BOND_EVENTS[event] ?? 0;
    if (gain > 0) d.bond += gain;

    // counters
    const c = d.counters;
    switch (event) {
      case 'first_meet':
        if (!d.firstMetAt) { d.firstMetAt = Date.now(); first.met = true; }
        break;
      case 'block_mined':    c.blocksMined++; break;
      case 'rare_loot':      c.rareLoot++; break;
      case 'bot_built':      c.botsBuilt++; break;
      case 'program_run':    c.programsRun++; break;
      case 'lap_complete':   c.laps++; break;
      case 'race_run':       c.races++; break;
      case 'crash_survived': c.crashes++; break;
      case 'flash_success':  c.flashes++; break;
      case 'conversation':   c.conversations++; break;
      case 'repair_done':    c.repairs++; break;
      case 'nudge_followed': c.nudgesFollowed++; break;
      case 'biome_first': {
        const name = String(detail.name ?? 'somewhere new');
        if (!d.biomes.includes(name)) { d.biomes.push(name); first.biome = name; }
        break;
      }
    }

    // traits — real play style moves the sliders
    for (const [trait, events] of Object.entries(TRAIT_EVENTS)) {
      if (events.includes(event)) {
        d.traits[trait] = Math.min(1, d.traits[trait] + TRAIT_PUSH);
        for (const other of Object.keys(d.traits)) {
          if (other !== trait) {
            d.traits[other] = Math.max(TRAIT_FLOOR, d.traits[other] - TRAIT_PULL);
          }
        }
      }
    }

    // recent-events ring (context for conversation prompts)
    d.recent.push({ event, at: Date.now(), note: detail.note ?? null });
    if (d.recent.length > RECENT_CAP) d.recent.shift();

    const tierUp = this.tier !== prevTier ? this.tier : null;
    if (tierUp) d.recent.push({ event: 'tier_up', at: Date.now(), note: tierUp });

    this.save();
    return { event, tierUp, first: Object.keys(first).length ? first : null };
  }

  /** Mark a progress topic as genuinely tried (drives the nudge engine). */
  markNudgeDone(id) {
    if (!this.data.nudgesDone.includes(id)) {
      this.data.nudgesDone.push(id);
      this.save();
      return true;
    }
    return false;
  }

  isNudgeDone(id) { return this.data.nudgesDone.includes(id); }

  /** Compact human summary — feeds the conversation prompt. */
  summarize() {
    const c = this.data.counters;
    const t = this.data.traits;
    const pct = v => Math.round(v * 100);
    const recent = this.data.recent
      .slice(-6)
      .map(r => r.note ? `${r.event} (${r.note})` : r.event)
      .join(', ');
    return `tier:${this.tier} bond:${Math.round(this.data.bond)} ` +
      `traits scrappy:${pct(t.scrappy)}% competitive:${pct(t.competitive)}% curious:${pct(t.curious)}% | ` +
      `together: ${c.blocksMined} blocks, ${c.botsBuilt} bots built, ${c.programsRun} programs run, ` +
      `${c.laps} laps, ${c.crashes} crashes survived, ${c.conversations} talks` +
      (this.data.biomes.length ? `, biomes: ${this.data.biomes.join('/')}` : '') +
      (recent ? ` | recently: ${recent}` : '');
  }

  // ── persistence (versioned, best-effort) ──────────────────────────────────

  save() {
    if (!this._storage) return;
    try {
      this._storage.setItem(LS_KEY, JSON.stringify(this.data));
    } catch { /* full or blocked — the game goes on */ }
  }

  load() {
    if (!this._storage) return;
    try {
      const raw = this._storage.getItem(LS_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && d.v === RIVET_SCHEMA_VERSION) this._merge(d);
      // unknown schema version → keep the old blob aside, start fresh
      // (the friendship restarts; the yard forgives)
    } catch { /* corrupt save — start fresh */ }
  }

  _merge(d) {
    const f = this._fresh();
    if (typeof d.bond === 'number') f.bond = d.bond;
    if (d.traits && typeof d.traits === 'object') {
      for (const k of Object.keys(f.traits)) {
        if (typeof d.traits[k] === 'number') f.traits[k] = d.traits[k];
      }
    }
    if (d.counters && typeof d.counters === 'object') {
      for (const k of Object.keys(f.counters)) {
        if (typeof d.counters[k] === 'number') f.counters[k] = d.counters[k];
      }
    }
    if (Array.isArray(d.biomes)) f.biomes = d.biomes.map(String);
    if (Array.isArray(d.recent)) f.recent = d.recent.slice(-RECENT_CAP);
    if (Array.isArray(d.nudgesDone)) f.nudgesDone = d.nudgesDone.map(String);
    if (d.firstMetAt) f.firstMetAt = d.firstMetAt;
    this.data = f;
  }
}

/** Test/dev helper — wipe the friendship (localStorage only). */
export function resetRivetState(storage) {
  try { (storage ?? (typeof localStorage !== 'undefined' ? localStorage : null))?.removeItem(LS_KEY); } catch {}
}
