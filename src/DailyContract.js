/**
 * ───────────────────────────────────────────────────────────────────────────
 *  DAILY SALVAGE CONTRACT — the come-back-tomorrow engine
 * ───────────────────────────────────────────────────────────────────────────
 *
 * One contract per calendar day, deterministic for everyone (seeded by the
 * day key, same doctrine as the Scrap Exchange deal rotation — a whole class
 * wakes up to the same contract). Progress persists across sessions, so a
 * contract started tonight finishes tomorrow on the school bus.
 *
 * Show up on a new day → day-streak grows. Finish the contract → streak
 * bonus XP + a once-per-day memory milestone in the bot's ledger (the bot
 * REMEMBERS that you two keep showing up).
 *
 * Headless-testable: game hooks are all optional (`_game?.…?.`), day key and
 * seeded pick are pure functions exported for tests.
 */

/** Local-calendar day key — days are when a kid plays, not UTC rollovers. */
export function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Days between two local day keys (negative → earlier). */
export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  // Date.UTC on local Y/M/D parts keeps the delta calendar-accurate (DST-safe)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Mulberry32 — same seeded PRNG the Scrap Exchange uses. */
function _seededRng(str) {
  let s = 0;
  for (let i = 0; i < str.length; i++) s = (Math.imul(s, 31) + str.charCodeAt(i)) >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic pick from the pool for a given day key. Pure. */
export function pickContract(dayKey) {
  const rng = _seededRng('scrapcraft-daily-' + dayKey);
  return CONTRACT_POOL[Math.floor(rng() * CONTRACT_POOL.length)];
}

/**
 * The pool. Targets are a notch above the session Salvage Runs — a daily
 * should take ~10–15 minutes, ideally split across two sittings.
 * Types mirror Challenge.js so Game.js wiring stays symmetric.
 */
export const CONTRACT_POOL = [
  {
    id: 'iron_rush', type: 'collect', target: 'iron_scrap', need: 20,
    label: 'Salvage 20 Iron Scrap', icon: '🔩',
    reward: { xp: 120, item: 'battery_pack', qty: 2 },
  },
  {
    id: 'wire_harvest', type: 'collect', target: 'copper_wire', need: 12,
    label: 'Harvest 12 Copper Wire', icon: '🪢',
    reward: { xp: 120, item: 'circuit_board', qty: 2 },
  },
  {
    id: 'pile_driver', type: 'mine_block', need: 15,
    label: 'Mine 15 Scrap Piles', icon: '📦',
    reward: { xp: 130, item: 'gear_small', qty: 3 },
  },
  {
    id: 'rust_remover', type: 'mine_block', need: 12,
    label: 'Clear 12 Rust Heaps', icon: '🪤',
    reward: { xp: 130, item: 'iron_scrap', qty: 5 },
  },
  {
    id: 'makers_hands', type: 'craft', need: 4,
    label: 'Craft 4 Items at any station', icon: '🔧',
    reward: { xp: 140, item: 'copper_wire', qty: 4 },
  },
  {
    id: 'road_crew', type: 'mine_block', need: 20,
    label: 'Break 20 Concrete Blocks', icon: '🧱',
    reward: { xp: 150, item: 'fuel_can', qty: 2 },
  },
  {
    id: 'barrel_day', type: 'mine_block', need: 8,
    label: 'Crack 8 Barrels', icon: '🛢️',
    reward: { xp: 120, item: 'rubber_chunk', qty: 4 },
  },
  {
    id: 'endurance', type: 'bot_run', need: 120,
    label: 'Run a bot program for 2 minutes total', icon: '🤖',
    reward: { xp: 160, item: 'battery_pack', qty: 2 },
  },
  {
    id: 'racer', type: 'bot_lap', need: 3,
    label: 'Complete 3 laps on any circuit', icon: '🏁',
    reward: { xp: 180, item: 'crystal_fragment', qty: 1 },
  },
  {
    id: 'grease_the_wheels', type: 'collect', target: 'gear_small', need: 8,
    label: 'Collect 8 Small Gears', icon: '⚙️',
    reward: { xp: 130, item: 'circuit_board', qty: 2 },
  },
  {
    id: 'spark_day', type: 'spark', need: 2,
    label: 'Have Spark build you 2 programs', icon: '✨',
    reward: { xp: 150, item: 'ir_module', qty: 2 },
  },
  {
    id: 'deep_dig', type: 'collect', target: 'crystal_fragment', need: 4,
    label: 'Bring up 4 Crystal Fragments', icon: '💎',
    reward: { xp: 170, item: 'night_goggles', qty: 1 },
  },
];

// Block-id fills for the mine_block contracts (kept out of the pool literal so
// the pool stays data-only and comparable at a glance).
const BLOCK_FILL = {
  pile_driver:   9,   // B.SCRAP_PILE
  rust_remover:  6,   // B.RUST_METAL
  road_crew:     1,   // B.CONCRETE
  barrel_day:    7,   // B.BARREL
};
for (const c of CONTRACT_POOL) {
  if (c.type === 'mine_block') c.target = BLOCK_FILL[c.id] ?? 9;
}

/** Streak math, pure. Returns the new streak state for a session on `today`. */
export function rollStreak(streak, today) {
  const s = { lastDay: streak?.lastDay ?? null, count: streak?.count ?? 0, best: streak?.best ?? 0 };
  if (s.lastDay === today) return s;            // same day, second session — no change
  if (s.lastDay === null) s.count = 1;          // very first day ever
  else if (daysBetween(s.lastDay, today) === 1) s.count += 1;  // came back — the whole game
  else s.count = 1;                             // chain broken, start fresh
  s.lastDay = today;
  s.best = Math.max(s.best, s.count);
  return s;
}

export class DailyContract {
  /** @param {import('./Game.js').Game} [game] optional — headless in tests */
  constructor(game = null, now = new Date()) {
    this._game = game;
    this._state = {
      day: null,           // day key the current contract belongs to
      contractId: null,
      progress: 0,
      claimed: false,
      totalDone: 0,        // lifetime contracts completed
      daysPlayed: 0,       // distinct days in the yard (for the Welcome Back card)
      streak: { lastDay: null, count: 0, best: 0 },
      announced:   false,    // greeted about today's contract yet?
    };
    this._isNewDay = false;
    this._rollIfNeeded(now);
  }

  get contract() {
    if (!this._state.contractId) return null;
    return CONTRACT_POOL.find(c => c.id === this._state.contractId) ?? null;
  }
  get progress()  { return this._state.progress; }
  get claimed()   { return this._state.claimed; }
  get streak()    { return this._state.streak; }
  get totalDone() { return this._state.totalDone; }
  get daysPlayed() { return this._state.daysPlayed; }
  get isNewDayFirstSession() { return this._isNewDay; }

  /** Day rollover check — cheap; called from tick() every couple of seconds. */
  _rollIfNeeded(now = new Date()) {
    const today = todayKey(now);
    if (this._state.day === today && this._state.streak.lastDay === today) return;

    this._isNewDay = this._state.day !== null && this._state.day !== today;
    const firstEver = this._state.streak.lastDay === null;

    if (firstEver || this._isNewDay) this._state.daysPlayed += 1;
    this._state.streak = rollStreak(this._state.streak, today);
    this._state.day = today;
    this._state.contractId = pickContract(today).id;
    this._state.progress = 0;
    this._state.claimed = false;
    this._state.announced = false;   // new day → a fresh announcement is due

    if (!firstEver && this._isNewDay) {
      this._game?.ui?.notify(`🔥 New day in the yard — streak: ${this._state.streak.count}!`);
    }
  }

  /**
   * Surface today's contract (notification + Earl quip). Game decides WHEN —
   * returning players hear it with the Welcome Back card; fresh players after
   * the tutorial, so it never competes with the first five minutes.
   */
  announce() {
    if (this._state.announced) return false;
    const c = this.contract;
    if (!c) return false;
    this._state.announced = true;
    this._game?.ui?.notify(`📜 Daily Contract: ${c.icon} ${c.label}`);
    // One Earl line per moment — on real streaks, the streak line wins.
    const n = this._state.streak.count;
    this._game?.foreman?.onEvent(n >= 3 ? 'streak_milestone' : 'daily_contract_new', { streak: n });
    return true;
  }

  // ── Event hooks (mirrors Challenge.js — Game wires both side by side) ────

  onMine(blockId) {
    if (this._advanceIf('mine_block', c => c.target === blockId, 1)) return;
  }
  onCollect(itemId) {
    this._advanceIf('collect', c => c.target === itemId, 1);
  }
  onCraft()  { this._advanceIf('craft', () => true, 1); }
  onSpark()  { this._advanceIf('spark', () => true, 1); }
  onLapComplete() { this._advanceIf('bot_lap', () => true, 1); }

  tick(dt, now = new Date()) {
    this._rollIfNeeded(now);
    // Midnight rollover mid-session: announce the fresh contract right away
    if (this._isNewDay) { this.announce(); this._isNewDay = false; }
    const bots = [this._game?.scrapBot, this._game?.scrapBot2].filter(Boolean);
    const running = bots.some(b => b._brainMode && (b.battery ?? 100) > 0);
    if (running) this._advanceIf('bot_run', () => true, dt);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  _advanceIf(type, matches, amount) {
    if (this._state.claimed) return false;
    const c = this.contract;
    if (!c || c.type !== type || !matches(c)) return false;
    this._state.progress = Math.min(c.need, this._state.progress + amount);
    this._game?.ui?.updateDaily(this, this._state.progress, false);
    if (this._state.progress >= c.need) this._claim();
    return true;
  }

  _claim() {
    const c = this.contract;
    if (!c || this._state.claimed) return;
    this._state.claimed = true;
    this._state.totalDone += 1;

    const streak = this._state.streak.count;
    const bonusXp = Math.min(streak, 7) * 15;   // streak pays, but caps out
    const g = this._game;

    g?.ui?.notify(`📜 Daily Contract complete! +${c.reward.xp} XP${bonusXp ? ` (+${bonusXp} streak 🔥${streak})` : ''}`);
    g?.ui?.updateDaily(this, c.need, true);
    g?.xpSystem?.gain(c.reward.xp + bonusXp);
    g?.player?.addItem(c.reward.item, c.reward.qty);
    g?.foreman?.onEvent('daily_contract_done', { streak });

    // The bot remembers that you two keep showing up.
    const ledger = g?.scrapBot?.ledger;
    ledger?.milestone(
      `daily_${this._state.day}`,
      `daily contract finished — day streak ${streak}`,
    );
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  toSaveData() {
    return JSON.parse(JSON.stringify(this._state));
  }

  fromSaveData(d, now = new Date()) {
    if (!d) return;
    this._state = {
      day:         d.day         ?? null,
      contractId:  d.contractId  ?? null,
      progress:    Math.max(0, d.progress ?? 0),
      claimed:     !!d.claimed,
      totalDone:   d.totalDone   ?? 0,
      daysPlayed:  d.daysPlayed  ?? 1,
      streak:      { lastDay: d.streak?.lastDay ?? null, count: d.streak?.count ?? 0, best: d.streak?.best ?? 0 },
      announced:   !!d.announced,
    };
    this._rollIfNeeded(now);   // handles midnight rollovers between sessions
  }
}
