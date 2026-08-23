/**
 * ───────────────────────────────────────────────────────────────────────────
 *  NIGHT SHIFT  —  your ScrapBot scavenges while you're away
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Come back after 20+ minutes and the bot dragged in loot: 1 iron per 3
 * minutes away, a guaranteed seeded bonus find every 75 minutes, hard cap
 * at 8 hours so it stays a treat, not an economy break. Sub-20-minute
 * absences pay nothing — refreshing the page isn't a slot machine.
 *
 * You must own a bot (robot_helper crafted / brained) to earn Night Shift —
 * the retention hook itself lures new kids toward the crafting bench.
 *
 * Ported from comp-kimi's ComebackEngine (judge's ruling: Night Shift ships;
 * that branch's Today's Shift daily was dropped in favor of OpenCode's
 * DailyContract). Conventions match BotLedger: zero deps, pure math,
 * injectable clock + storage, self-persists to its own localStorage key.
 */

const LS_KEY = 'scrapcraft_nightshift_v1';

// ── Night Shift tuning ──────────────────────────────────────────────────────
const NS_MIN_AWAY_MS = 20 * 60 * 1000;      // below this, no shift (refresh ≠ away)
const NS_RATE_MIN    = 3;                   // minutes of absence per iron_scrap
const NS_CAP_MS      = 8 * 60 * 60 * 1000;  // earn no more than a work-shift's worth
const NS_BONUS_EVERY = 75;                  // minutes per guaranteed bonus find
const NS_BONUS_POOL  = ['circuit_board', 'spring', 'gear_small', 'copper_wire'];

/** Local-calendar day key (tests + seed sharing). */
export function dateKey(nowMs) {
  const d = new Date(nowMs);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * What the bot dragged in while the kid was away. Pure.
 * @param {number} elapsedMs  time away in ms
 * @param {boolean} botHasBrain  only a brained bot works nights
 * @param {string} [seedKey]  seed for deterministic bonus loot (tests + share)
 * @returns {null | { minutes:number, loot:{id:qty}, capped:boolean }}
 */
export function computeNightShift(elapsedMs, botHasBrain, seedKey = 'x') {
  if (!botHasBrain || elapsedMs < NS_MIN_AWAY_MS) return null;
  const cappedMs = Math.min(elapsedMs, NS_CAP_MS);
  const minutes  = Math.floor(cappedMs / 60000);
  const loot = {};
  const iron = Math.floor(minutes / NS_RATE_MIN);
  if (iron > 0) loot.iron_scrap = iron;
  const bonuses = Math.min(6, Math.floor(minutes / NS_BONUS_EVERY));
  if (bonuses > 0) {
    const rng = mulberry32(hashStr(seedKey));
    for (let i = 0; i < bonuses; i++) {
      const pick = NS_BONUS_POOL[Math.floor(rng() * NS_BONUS_POOL.length)];
      loot[pick] = (loot[pick] ?? 0) + 1;
    }
  }
  if (Object.keys(loot).length === 0) return null;
  return { minutes, loot, capped: elapsedMs > NS_CAP_MS };
}

/**
 * The away-clock. Remembers when the kid was last seen (touched on every
 * save) and turns one session-start into one Night Shift payout.
 */
export class NightShiftClock {
  /**
   * @param {object} [opts]
   * @param {number} [opts.now]   injectable clock (ms epoch) for tests
   * @param {object} [opts.store] injectable storage for tests
   */
  constructor({ now, store } = {}) {
    this._nowFn  = now  ? (() => now) : null;
    this._store  = store ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    this.lastSeen = null;   // ms epoch of last session touch
    this.load();
  }

  _now() { return this._nowFn ? this._nowFn() : Date.now(); }

  toSaveData()  { return { lastSeen: this.lastSeen }; }
  fromSaveData(d) {
    if (!d) return;
    this.lastSeen = d.lastSeen ?? null;
    this.save();
  }

  save() {
    if (!this._store) return;
    try { this._store.setItem(LS_KEY, JSON.stringify(this.toSaveData())); } catch { /* full disk: fine */ }
  }

  load() {
    if (!this._store) return;
    try {
      const raw = this._store.getItem(LS_KEY);
      if (raw) this.fromSaveData(JSON.parse(raw));
    } catch { /* corrupt: start fresh */ }
  }

  /** Keep lastSeen fresh during play (called by SaveSystem on each save). */
  touch() { this.lastSeen = this._now(); this.save(); }

  /**
   * Run once per session, after the save load. Returns the Night Shift
   * payout for a bot-owning returning player, or null.
   * @param {boolean} botHasBrain
   */
  sessionStart(botHasBrain) {
    const now = this._now();
    const returning = this.lastSeen != null;
    const awayMs = returning ? Math.max(0, now - this.lastSeen) : 0;
    const result = returning ? computeNightShift(awayMs, botHasBrain, 'ns:' + dateKey(now)) : null;
    this.lastSeen = now;
    this.save();
    return result;
  }
}
