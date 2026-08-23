/**
 * ───────────────────────────────────────────────────────────────────────────
 *  RIVET NUDGE  —  the progress engine that never nags
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Rivet wants you to try things you haven't tried yet — contextually, once,
 * and only when you're not busy. The anti-nag contract:
 *
 *   1. ONE nudge per topic per session. Said it? Done. Forever (this session).
 *   2. Global cooldown (120s) — Rivet is a companion, not a quest popup.
 *   3. Suppressed mid-flow: racing, editor open, mid-conversation, or less
 *      than 20s after a crash (you don't coach someone mid-fire).
 *   4. Topics fire only when their prerequisites are DONE and the topic
 *      itself is NOT done — nudges point forward, never back.
 *
 * Done-marking is real: the game tells Rivet when the player actually did the
 * thing (observe() → markNudgeDone), and following a nudge grows the bond
 * (nudge_followed) — Rivet remembers being listened to.
 */

export const NUDGE_COOLDOWN_S = 120;   // between any two nudges
export const NUDGE_GRACE_S = 45;       // no nudging in the first 45s of a session
export const CRASH_SUPPRESS_S = 20;    // no coaching right after a bonk

/**
 * Topic registry, in rough curriculum order (priority = order).
 * `hint` receives the state data (counters) so lines can be concrete.
 */
export const TOPICS = [
  {
    id: 'mine_iron',
    label: 'mine your first block',
    depends: [],
    hint: s => s.counters.blocksMined === 0
      ? 'See that rust heap by the gate? Hold left-click on it — iron\'s the foundation of, like, everything Earl builds.'
      : null,
  },
  {
    id: 'build_first_bot',
    label: 'build your first bot',
    depends: ['mine_iron'],
    hint: s => s.counters.blocksMined >= 5 && s.counters.botsBuilt === 0
      ? 'You\'ve got enough scrap for a robot_helper — press E and craft one. I\'ll try not to be jealous of it.'
      : null,
  },
  {
    id: 'program_bot',
    label: 'give the bot a brain',
    depends: ['build_first_bot'],
    hint: s => s.counters.botsBuilt > 0 && s.counters.programsRun === 0
      ? 'Your bot\'s empty-headed and happy about it. Press T — let\'s give it a wall-avoider brain. First program\'s a rite of passage.'
      : null,
  },
  {
    id: 'race_lap',
    label: 'run a lap',
    depends: ['program_bot'],
    hint: s => s.counters.programsRun > 0 && s.counters.laps === 0
      ? 'We\'ve got a working bot and an empty lap record. The oval\'s east — one clean lap and Earl might actually look up from his mug.'
      : null,
  },
  {
    id: 'line_follow',
    label: 'try line-following',
    depends: ['program_bot'],
    hint: s => s.counters.programsRun >= 1 && !s.nudgesDone?.includes('line_follow') && s.counters.programsRun < 3
      ? 'We\'ve got parts for a second sensor — want to try line-following before the next race? The dark track strips + line_under. It\'s like training wheels you can brag about.'
      : null,
  },
  {
    id: 'flash_hardware',
    label: 'flash to a real robot',
    depends: ['program_bot'],
    hint: s => s.counters.flashes === 0 && s.counters.programsRun >= 2
      ? 'You\'ve run this in sim a couple times — BUILD IT, then 🔥 Flash it to a real board. Watching your own code move real wheels is… it\'s a whole feeling. Trust me.'
      : null,
  },
  {
    id: 'explore_city',
    label: 'visit Circuit City',
    depends: ['mine_iron'],
    hint: s => !s.biomes?.includes('Circuit City')
      ? 'North band\'s called Circuit City — electronics-grade scrap. Smells like ambition and solder. Field trip?'
      : null,
  },
  {
    id: 'repair_bot',
    label: 'hammer out a dent',
    depends: ['build_first_bot'],
    hint: s => s.counters.crashes > 0 && s.counters.repairs === 0
      ? 'That dent isn\'t going anywhere without you. Grab a hammer near your bot — repairs go in the book. The book is sacred.'
      : null,
  },
];

export class Nudger {
  constructor(opts = {}) {
    this.state = opts.state;                     // RivetState-like
    this.now = opts.now ?? (() => Date.now());
    this._fired = new Set();                     // topics fired THIS SESSION
    this._lastNudgeAt = -Infinity;               // session clock (seconds)
    this._clock = 0;                             // seconds since session start
    this._lastCrashAt = -Infinity;
  }

  /** Called by the orchestrator on crash events (suppression window). */
  noteCrash() { this._lastCrashAt = this._clock; }

  /**
   * Tick the nudge engine. Returns { topic, line } when a contextual nudge
   * should be spoken, or null. Call once per frame with real dt.
   * @param {number} dt seconds since last tick
   * @param {object} ctx { midFlow: boolean } — racing/editor-open/talking
   */
  tick(dt, ctx = {}) {
    this._clock += dt;
    if (ctx.midFlow) return null;
    if (this._clock < NUDGE_GRACE_S) return null;
    if (this._clock - this._lastNudgeAt < NUDGE_COOLDOWN_S) return null;
    if (this._clock - this._lastCrashAt < CRASH_SUPPRESS_S) return null;

    const data = this.state.data;
    for (const topic of TOPICS) {
      if (this.state.isNudgeDone(topic.id)) continue;     // already tried it (ever)
      if (this._fired.has(topic.id)) continue;            // already nudged (session)
      if (!topic.depends.every(dep => this.state.isNudgeDone(dep))) continue;

      const line = topic.hint(data);
      if (!line) continue;                                // prerequisites in the counters not met yet

      this._fired.add(topic.id);
      this._lastNudgeAt = this._clock;
      return { topic: topic.id, line };
    }
    return null;
  }

  /** Topics already nudged this session (introspection/tests). */
  fired() { return [...this._fired]; }
}
