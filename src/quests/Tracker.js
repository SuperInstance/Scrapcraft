/**
 * ───────────────────────────────────────────────────────────────────────────
 *  QUEST TRACKER  —  the engine that watches the yard (lau-quest port)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Event-driven progress over declarative quest data. Two sources of truth,
 * merged (same hybrid the game's own quests use):
 *
 *   POLL   stat-backed objectives read game state on every evaluation
 *          (mined totals, crafted sets, laps, flashes — the game already
 *          counts these for achievements; we reuse, never re-instrument)
 *   TAP    event-backed objectives count events this tracker witnesses
 *          (spark asks with their question text, repairs, waypoint drops —
 *          the same event stream the foreman quips and companions bond on)
 *
 * One event vocabulary yard-wide. Headless: no DOM, no game imports — the
 * state adapter (injected) is the only window into the world.
 */

import { validateCampaign, FINALE_ARC_GATE } from './schema.js';

/** Arcs that auto-inject companionTier prerequisite (open arcs, not companion-gated). */
const OPEN_ARCS = ['earl', 'finale', 'chapter', 'yard'];

/** Spark topic aliases — a kid types it a dozen ways; all of them count. */
const TOPIC_ALIASES = {
  pwm: ['pwm', 'pulse width', 'pulse-width', 'motor speed', 'duty cycle', 'gas pedal'],
  pid: ['pid', 'p-i-d', 'proportional', 'three judges', 'correct itself'],
  ghost: ['ghost', 'midnight', 'the ghost', 'who races at night', 'mo '],
  circuit: ['circuit', 'trace', 'solder', 'pcb', 'board'],
  firmware: ['firmware', 'arduino code', 'real code', 'c++', 'micro python', 'micropython'],
  bootloader: ['bootloader', 'flash', 'burn', 'boot load'],
  sensor: ['sensor', 'ultrasonic', 'echo', 'hall', 'distance sensor'],
  sparky: ['sparky', 'plaque', 'sparky iv', 'the crash', '1998'],
  maintenance: ['maintenance', 'repair', 'fix my bot', 'preventive', 'checkup'],
  crystal: ['crystal', 'ore', 'magnet sensor'],
  gps: ['gps', 'waypoint', 'navigate', 'compass'],
  author: ['qa sticker', 'qa-sticker', 'sticker 7', '#7', 'who wrote', 'wrote the', 'author', 'header credit'],
};

function topicMatches(topic, text) {
  const t = String(text ?? '').toLowerCase();
  if (!t) return false;
  if (t.includes(topic)) return true;
  for (const a of TOPIC_ALIASES[topic] ?? []) if (t.includes(a)) return true;
  return false;
}

const TIER_ORDER = { stranger: 0, coworker: 1, friend: 2 };

/**
 * @param {object} [opts]
 * @param {object[]} [opts.quests]        quest definitions (declarative JSON)
 * @param {object} [opts.adapter]         state window: {
 *   stats()          → achievements.stats snapshot
 *   crafted()        → Set of item ids ever crafted
 *   countItem(id)    → inventory count
 *   plaquesRead()    → number of landmark plaques read
 *   lapBestSecs()    → best oval lap in seconds (or null)
 *   getTier(id)      → companion tier name or null if never met
 * }
 * @param {object|null} [opts.storage]    injectable persistence (localStorage in game, Map in tests)
 */
export class QuestTracker {
  constructor(opts = {}) {
    this._adapter = opts.adapter ?? {};
    this._defs = new Map();
    this._order = [];
    this._storage = opts.storage !== undefined ? opts.storage
      : (typeof localStorage !== 'undefined' ? localStorage : null);

    // persisted progress
    this.data = {
      v: 1,
      completed: {},   // questId → { at: iso, day: n }
      progress: {},    // questId → { events: {}, sparks: [], runs: n }
      flags: [],       // unlock flags earned via rewards
    };

    if (opts.quests) this.register(opts.quests);
  }

  // ── registration ──────────────────────────────────────────────────────────

  /** Register quest definitions. Companion-arc quests auto-require meeting
   *  the affinity companion — you can't walk Bolt's road before you meet Bolt. */
  register(quests) {
    const { ok, errors } = validateCampaign(quests);
    if (!ok) throw new Error(`campaign invalid: ${errors.join('; ')}`);
    for (const def of quests) {
      let q = def;
      if (!OPEN_ARCS.includes(q.arc) && !q.prerequisites?.companionTier) {
        q = {
          ...q,
          prerequisites: {
            ...(q.prerequisites ?? {}),
            companionTier: { [q.affinity]: 'stranger' },   // "met" — tier 0
          },
        };
      }
      this._defs.set(q.id, q);
      this._order.push(q.id);
    }
  }

  get questDefs() { return this._order.map(id => this._defs.get(id)); }
  def(id) { return this._defs.get(id) ?? null; }

  // ── persistence ───────────────────────────────────────────────────────────

  save() {
    try { this._storage?.setItem('scrapcraft_quests', JSON.stringify(this.data)); } catch { /* corrupt-world tolerant */ }
  }
  load() {
    try {
      const raw = this._storage?.getItem('scrapcraft_quests');
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && d.v === 1) {
        this.data = { completed: d.completed ?? {}, progress: d.progress ?? {}, flags: d.flags ?? [], v: 1 };
      }
    } catch { /* fresh start on corrupt saves */ }
  }

  /** Migrate an old save: Earl's linear chain index → completed earl quests. */
  migrateEarlIndex(index) {
    const n = Math.max(0, Math.min(20, Number(index) || 0));
    for (let i = 1; i <= n; i++) {
      const id = `earl-${i}`;
      if (!this.data.completed[id]) {
        this.data.completed[id] = { at: new Date().toISOString(), day: null, migrated: true };
      }
    }
    if (n > 0) this.save();
    return n;
  }

  // ── availability & status ─────────────────────────────────────────────────

  isCompleted(id) { return Boolean(this.data.completed[id]); }

  _prereqsMet(q) {
    const p = q.prerequisites ?? {};
    for (const r of p.quests ?? []) if (!this.isCompleted(r)) return false;
    for (const f of p.flags ?? []) if (!this.data.flags.includes(f)) return false;
    for (const [cid, tier] of Object.entries(p.companionTier ?? {})) {
      const t = this._adapter.getTier?.(cid) ?? null;
      if (t === null) return false;
      if ((TIER_ORDER[t] ?? 0) < (TIER_ORDER[tier] ?? 0)) return false;
    }
    return true;
  }

  /** Quests ready to walk (prereqs met, not done). They activate on sight —
   *  this is a scoreboard, not paperwork. The finale additionally gates on
   *  FINALE_ARC_GATE completed companion arcs (engine-enforced, worldbible). */
  available() {
    return this.questDefs.filter(q =>
      !this.isCompleted(q.id)
      && this._prereqsMet(q)
      && (q.arc !== 'finale' || this.completedArcs().length >= FINALE_ARC_GATE));
  }

  /** Everything currently in progress (auto-activated available quests). */
  active() { return this.available(); }

  completedQuests() {
    return this._order.map(id => this._defs.get(id)).filter(q => this.isCompleted(q.id));
  }

  /** Completed companion arcs (bolt/magma/juno/rivet) — the finale gate. */
  completedArcs() {
    const arcs = ['bolt', 'magma', 'juno', 'rivet'];
    return arcs.filter(arc =>
      this.questDefs.filter(q => q.arc === arc).every(q => this.isCompleted(q.id)));
  }

  finaleUnlocked(requiredArcs) {
    return this.completedArcs().length >= requiredArcs;
  }

  // ── the event tap ─────────────────────────────────────────────────────────

  /** Witness a game event. Event-backed objectives count; then everything
   *  re-evaluates (poll objectives may have moved too).
   *  @returns {object[]} quests completed by this event (for reward granting) */
  onEvent(name, evData = {}) {
    const done = [];
    for (const q of this.available()) {
      let prog = this.data.progress[q.id];
      if (!prog) { prog = this.data.progress[q.id] = { events: {}, sparks: [], runs: 0 }; }

      // event tallies (only events this quest's objectives ask for)
      for (const o of q.objectives) {
        if (o.type === 'EVENT' && o.event === name) {
          prog.events[name] = (prog.events[name] ?? 0) + 1;
        }
        if (o.type === 'REPAIR' && name === 'repair_done') {
          prog.events['repair_done'] = (prog.events['repair_done'] ?? 0) + 1;
        }
        if (o.type === 'RUN_PROGRAM' && name === 'program_run') {
          prog.events['program_run'] = (prog.events['program_run'] ?? 0) + 1;
        }
        if (o.type === 'EXPERIMENT' && name === 'program_run') {
          prog.runs++;
        }
        if (o.type === 'LAP' && name === 'lap_complete') {
          prog.events['lap_complete'] = (prog.events['lap_complete'] ?? 0) + 1;
          if (evData?.secs != null) {
            prog.bestLapSecs = Math.min(prog.bestLapSecs ?? Infinity, Number(evData.secs));
          }
        }
        if (o.type === 'VISIT' && name === `enter_band_${o.biome.slice(-1)}`) {
          prog.events[`visited_${o.biome}`] = (prog.events[`visited_${o.biome}`] ?? 0) + 1;
        }
        if (o.type === 'SPARK_ASK' && name === 'spark_ask' && topicMatches(o.topic, evData?.text)) {
          if (!prog.sparks.includes(o.topic)) prog.sparks.push(o.topic);
        }
      }

      if (this._questComplete(q, prog)) done.push(q);
    }
    if (done.length) this.save();
    return done;
  }

  // ── evaluation ────────────────────────────────────────────────────────────

  /** Objective status: { label, done, progress: 'n/m' | null } */
  objectiveStatus(q, o) {
    const prog = this.data.progress[q.id] ?? { events: {}, sparks: [], runs: 0 };
    const a = this._adapter;
    let done = false, cur = null, total = null;

    switch (o.type) {
      case 'MINE': {
        // mined totals: achievements counters are lifetime truth
        const s = a.stats?.() ?? {};
        const stat = o.item === 'crystal_ore' ? s.crystalMined : (s.itemsCollected?.[o.item] ?? 0);
        cur = Math.min(stat, o.count); total = o.count; done = stat >= o.count;
        break;
      }
      case 'CRAFT':
        done = a.crafted?.().has?.(o.item) ?? false;
        break;
      case 'RUN_PROGRAM': {
        const s = a.stats?.() ?? {}; const n = Math.max(s.programsRun ?? 0, prog.events['program_run'] ?? 0);
        cur = Math.min(n, o.count); total = o.count; done = n >= o.count;
        break;
      }
      case 'FLASH_BOARD': {
        const s = a.stats?.() ?? {}; cur = Math.min(s.hardwareFlashes ?? 0, o.count); total = o.count;
        done = (s.hardwareFlashes ?? 0) >= o.count;
        break;
      }
      case 'RECEIPT': {
        const s = a.stats?.() ?? {}; cur = Math.min(s.receiptViews ?? 0, o.count); total = o.count;
        done = (s.receiptViews ?? 0) >= o.count;
        break;
      }
      case 'LAP': {
        const s = a.stats?.() ?? {};
        if (o.count !== undefined) {
          const n = Math.max(s.lapsCompleted ?? 0, prog.events['lap_complete'] ?? 0);
          cur = Math.min(n, o.count); total = o.count; done = n >= o.count;
        } else {
          const best = Math.min(prog.bestLapSecs ?? Infinity, a.lapBestSecs?.() ?? Infinity);
          done = best <= o.underSecs;
          cur = done ? 1 : 0; total = 1;
        }
        break;
      }
      case 'REPAIR':
        cur = Math.min(prog.events['repair_done'] ?? 0, o.count); total = o.count;
        done = (prog.events['repair_done'] ?? 0) >= o.count;
        break;
      case 'VISIT':
        done = (prog.events[`visited_${o.biome}`] ?? 0) > 0;
        break;
      case 'SPARK_ASK':
        done = prog.sparks.includes(o.topic);
        break;
      case 'PLAQUE_READ': {
        const n = a.plaquesRead?.() ?? 0;
        cur = Math.min(n, o.count); total = o.count; done = n >= o.count;
        break;
      }
      case 'EXPERIMENT':
        cur = Math.min(prog.runs ?? 0, o.runs); total = o.runs; done = (prog.runs ?? 0) >= o.runs;
        break;
      case 'STAT': {
        const s = a.stats?.() ?? {}; const n = s[o.stat] ?? 0;
        cur = Math.min(n, o.count); total = o.count; done = n >= o.count;
        break;
      }
      case 'EVENT':
        cur = Math.min(prog.events[o.event] ?? 0, o.count); total = o.count;
        done = (prog.events[o.event] ?? 0) >= o.count;
        break;
    }
    return { label: o.label, done, progress: total ? `${cur}/${total}` : null };
  }

  _questComplete(q, prog) {
    if (!q.objectives.every(o => this.objectiveStatus(q, o).done)) return false;
    this.data.completed[q.id] = { at: new Date().toISOString(), day: prog.day ?? null };
    delete this.data.progress[q.id];
    return true;
  }

  /** Full re-evaluation (poll path — call on any world change). */
  /** @returns {object[]} quests completed */
  refresh() { return this.onEvent('__refresh', {}); }
}
