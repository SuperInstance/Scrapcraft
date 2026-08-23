/**
 * ───────────────────────────────────────────────────────────────────────────
 *  BOT LEDGER  —  the bot as a character: dents, repairs, milestones, rest
 * ───────────────────────────────────────────────────────────────────────────
 *
 * A ScrapBot isn't a tool, it's a teammate with a history. This ledger is
 * that history:
 *
 *   dents      every wall-bonk, with where and how fast (crashes are content)
 *   repairs    every repair_kit spent on the bot (care is content too)
 *   milestones once-only memories: first program, first lap, crash-free
 *              streaks, bond levels — the bot REMEMBERS
 *   retirement a bot can be retired to the shelf with an epitaph; its stats
 *              are frozen and honored forever
 *
 * Self-persisting to localStorage (slot-keyed), zero deps, headless-testable.
 */

const LS_PREFIX = 'scrapcraft_bot_ledger_';
const SHELF_KEY = 'scrapcraft_bot_shelf';

/** Minimum seconds between dents from the same wall-press (no frame-spam). */
const DENT_COOLDOWN_S = 2.5;
/** Pressing this long into a wall at speed = one dent. */
const STALL_TIME_S = 0.8;

export class BotLedger {
  /**
   * @param {string} name  bot name (from BotPersonality)
   * @param {string} [slot] persistence slot ('bot1' | 'bot2')
   */
  constructor(name = 'Bot', slot = 'bot1') {
    this.name = name;
    this.slot = slot;
    this.dents = [];        // [{ at, x, z, speed }]
    this.repairs = [];      // [{ at, tool, dentsFixed }]
    this.milestones = [];   // [{ id, at, detail }]
    this.retiredAt = null;  // timestamp once retired
    this.epitaph = null;
    this.runtimeS = 0;      // total brain-runtime seconds
    this.laps = 0;
    // crash-stall detector state (transient, not persisted)
    this._stall = 0;
    this._lastDentAt = 0;
    this._crashFreeS = 0;
    this.load();
  }

  get isRetired() { return this.retiredAt !== null; }

  // ── dents ─────────────────────────────────────────────────────────────────

  /**
   * Feed motion state each tick. Detects "pressing into a wall while driving"
   * and accrues a dent per bonk (cooldown-guarded). Returns the dent or null.
   * @param {{x:number, z:number}} before  pose at frame start
   * @param {{x:number, z:number}} after   pose at frame end
   * @param {number} drivePower  current drive order (-1..1)
   * @param {number} dt          seconds
   */
  observeMotion(before, after, drivePower, dt) {
    if (this.isRetired) return null;
    this.runtimeS += dt;

    const ordered = Math.abs(drivePower) > 0.4;
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    const expected = Math.abs(drivePower) * 2.4 * dt;      // DRIVE_SPEED ≈ 2.4

    if (ordered && moved < expected * 0.25) {
      this._stall += dt;
      this._crashFreeS = 0;
    } else {
      this._stall = 0;
      this._crashFreeS += dt;
      // crash-free streak milestones: 30s, 120s, 300s
      for (const t of [30, 120, 300]) {
        if (this._crashFreeS >= t) this.milestone(`crash_free_${t}`, `${t}s without a single bonk`);
      }
    }

    if (this._stall >= STALL_TIME_S && Date.now() - this._lastDentAt > DENT_COOLDOWN_S * 1000) {
      this._stall = 0;
      this._lastDentAt = Date.now();
      return this.addDent(after.x, after.z, Math.abs(drivePower));
    }
    return null;
  }

  addDent(x, z, speed) {
    const dent = { at: Date.now(), x: +x.toFixed(1), z: +z.toFixed(1), speed: +speed.toFixed(2) };
    this.dents.push(dent);
    if (this.dents.length > 200) this.dents.shift();       // keep the good ones
    this.milestone('first_dent', 'first wall-bonk — every bot has one');
    this.save();
    return dent;
  }

  // ── repairs ───────────────────────────────────────────────────────────────

  /**
   * Apply a repair. Fixes all current dents into the log.
   * @returns {{dentsFixed:number}|null} null when there was nothing to fix
   */
  repair(tool = 'repair_kit') {
    if (this.dents.length === 0) return null;
    const fixed = this.dents.length;
    this.repairs.push({ at: Date.now(), tool, dentsFixed: fixed });
    if (this.repairs.length > 100) this.repairs.shift();
    this.dents = [];
    this.milestone('first_repair', 'first time you patched your bot up');
    this.save();
    return { dentsFixed: fixed };
  }

  // ── milestones ────────────────────────────────────────────────────────────

  /** Record a once-only milestone. Returns true if it fired now. */
  milestone(id, detail = '') {
    if (this.isRetired) return false;
    if (this.milestones.some(m => m.id === id)) return false;
    this.milestones.push({ id, at: Date.now(), detail });
    this.save();
    return true;
  }

  countMilestones(id) { return this.milestones.filter(m => m.id === id).length; }
  has(id) { return this.milestones.some(m => m.id === id); }

  lapCompleted() {
    if (this.isRetired) return false;
    this.laps++;
    const first = this.milestone('lap_complete', 'first lap around the oval');
    if (this.laps === 10) this.milestone('ten_laps', 'ten laps — a real racer now');
    if (this.laps === 50) this.milestone('fifty_laps', 'fifty laps. The track knows this bot by heart.');
    this.save();
    return first;
  }

  // ── retirement ────────────────────────────────────────────────────────────

  /**
   * Retire this bot to the shelf. Frozen stats + epitaph. The bot is done —
   * honored, not deleted.
   * @returns {object|null} the shelf entry, or null if already retired / too young
   */
  retire(epitaph = 'A good bot.') {
    if (this.isRetired) return null;
    if (this.runtimeS < 60) return null;    // must have lived at least a minute
    this.retiredAt = Date.now();
    this.epitaph = epitaph.slice(0, 140);
    this.save();
    const entry = {
      name: this.name,
      epitaph: this.epitaph,
      retiredAt: this.retiredAt,
      runtimeS: +this.runtimeS.toFixed(0),
      laps: this.laps,
      totalDents: this.dents.length + this.repairs.reduce((a, r) => a + r.dentsFixed, 0),
      repairs: this.repairs.length,
      milestones: this.milestones.length,
    };
    BotShelf.add(entry);
    this.save();
    return entry;
  }

  /** Rename — kids name their bots, and renaming is allowed until retirement. */
  rename(name) {
    if (this.isRetired || !name) return false;
    this.name = String(name).slice(0, 24);
    this.save();
    return true;
  }

  // ── persistence (localStorage, best-effort) ───────────────────────────────

  save() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(LS_PREFIX + this.slot, JSON.stringify({
        name: this.name,
        dents: this.dents,
        repairs: this.repairs,
        milestones: this.milestones,
        retiredAt: this.retiredAt,
        epitaph: this.epitaph,
        runtimeS: this.runtimeS,
        laps: this.laps,
      }));
    } catch { /* full or blocked — the game goes on */ }
  }

  load() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(LS_PREFIX + this.slot);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.name) this.name = d.name;
      if (Array.isArray(d.dents)) this.dents = d.dents;
      if (Array.isArray(d.repairs)) this.repairs = d.repairs;
      if (Array.isArray(d.milestones)) this.milestones = d.milestones;
      if (d.retiredAt) this.retiredAt = d.retiredAt;
      if (d.epitaph) this.epitaph = d.epitaph;
      if (typeof d.runtimeS === 'number') this.runtimeS = d.runtimeS;
      if (typeof d.laps === 'number') this.laps = d.laps;
    } catch { /* corrupt save — start fresh */ }
  }
}

/** The retirement shelf — honored bots, forever. */
export const BotShelf = {
  list() {
    if (typeof localStorage === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem(SHELL_KEY_SAFE()) ?? '[]');
    } catch { return []; }
  },
  add(entry) {
    if (typeof localStorage === 'undefined') return;
    try {
      const all = this.list();
      all.unshift(entry);
      localStorage.setItem(SHELL_KEY_SAFE(), JSON.stringify(all.slice(0, 50)));
    } catch { /* best-effort */ }
  },
  clear() {
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(SHELL_KEY_SAFE()); } catch {}
    }
  },
};

function SHELL_KEY_SAFE() { return SHELF_KEY; }
