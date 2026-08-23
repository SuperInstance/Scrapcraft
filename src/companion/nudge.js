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
 * `hint(s)` is the shared/Rivet voice; `hints[s?]` overrides per persona —
 * the SAME topics, said by different souls. Personalities are weights:
 * Bolt says "race", Magma says "build", Juno says "explore".
 */
export const TOPICS = [
  {
    id: 'mine_iron',
    label: 'mine your first block',
    depends: [],
    hint: s => s.counters.blocksMined === 0
      ? 'See that rust heap by the gate? Hold left-click on it — iron\'s the foundation of, like, everything Earl builds.'
      : null,

    hints: {
      bolt: s => s.counters.blocksMined === 0
        ? "Rust heap, by the gate. Iron. Race bots are BUILT from iron, not vibes. Hold left-click — I'll time the swings."
        : null,
      magma: s => s.counters.blocksMined === 0
        ? "There is a rust heap by the gate, small builder. Iron sleeps inside. Hold left-click and wake some — the workbench is waiting to meet you."
        : null,
      juno: s => s.counters.blocksMined === 0
        ? "Ooh, the rust heap by the gate! What IS iron? Where does it COME from? Let's find out HOLDING THINGS — left-click. Science starts with a handful!"
        : null,
    },  },
  {
    id: 'build_first_bot',
    label: 'build your first bot',
    depends: ['mine_iron'],
    hint: s => s.counters.blocksMined >= 5 && s.counters.botsBuilt === 0
      ? 'You\'ve got enough scrap for a robot_helper — press E and craft one. I\'ll try not to be jealous of it.'
      : null,

    hints: {
      bolt: s => s.counters.blocksMined >= 5 && s.counters.botsBuilt === 0
        ? "Enough scrap for a chassis. Press E, craft the robot_helper. Every race team starts with a car. This is our car."
        : null,
      magma: s => s.counters.blocksMined >= 5 && s.counters.botsBuilt === 0
        ? "You have five good iron! Press E — the workshop. Craft a robot_helper. Build it snug, not strained. I will watch your hands the whole time. It is not hovering. It is love."
        : null,
      juno: s => s.counters.blocksMined >= 5 && s.counters.botsBuilt === 0
        ? "FIVE iron! That's robot-helper math! Press E and craft one — we want to meet it! We have questions prepared. Mostly 'hello' but with ENTHUSIASM."
        : null,
    },  },
  {
    id: 'program_bot',
    label: 'give the bot a brain',
    depends: ['build_first_bot'],
    hint: s => s.counters.botsBuilt > 0 && s.counters.programsRun === 0
      ? 'Your bot\'s empty-headed and happy about it. Press T — let\'s give it a wall-avoider brain. First program\'s a rite of passage.'
      : null,

    hints: {
      bolt: s => s.counters.botsBuilt > 0 && s.counters.programsRun === 0
        ? "The bot has an empty head. Press T. We give it a brain, THEN we give it a track. That's the order. It's always been the order."
        : null,
      magma: s => s.counters.botsBuilt > 0 && s.counters.programsRun === 0
        ? "A bot with no program is a sculpture, dear one — lovely, but sleepy. Press T. Let's give it thoughts. First thoughts are my favorite thoughts."
        : null,
      juno: s => s.counters.botsBuilt > 0 && s.counters.programsRun === 0
        ? "It's BUILT but it's not THINKING! Press T — the Maker Lab! Its first program! We remember our first program. We ran it in a thunderstorm. Long story. GREAT story."
        : null,
    },  },
  {
    id: 'race_lap',
    label: 'run a lap',
    depends: ['program_bot'],
    hint: s => s.counters.programsRun > 0 && s.counters.laps === 0
      ? 'We\'ve got a working bot and an empty lap record. The oval\'s east — one clean lap and Earl might actually look up from his mug.'
      : null,

    hints: {
      bolt: s => s.counters.programsRun > 0 && s.counters.laps === 0
        ? "We've got a working bot and an empty oval east of here. That's a crime in progress. One clean lap. I still have the old start-gate key. Figuratively. Go."
        : null,
      magma: s => s.counters.programsRun > 0 && s.counters.laps === 0
        ? "The oval is east, little one. One gentle lap — no records, just the ride. A first lap is a chassis's first walk. I will wave the whole time."
        : null,
      juno: s => s.counters.programsRun > 0 && s.counters.laps === 0
        ? "The OVAL! East! It's a big circle of QUESTIONS — like, how fast can YOU take corner two? One lap answers so many things. Let's go collect answers!"
        : null,
    },  },
  {
    id: 'line_follow',
    label: 'try line-following',
    depends: ['program_bot'],
    hint: s => s.counters.programsRun >= 1 && !s.nudgesDone?.includes('line_follow') && s.counters.programsRun < 3
      ? 'We\'ve got parts for a second sensor — want to try line-following before the next race? The dark track strips + line_under. It\'s like training wheels you can brag about.'
      : null,

    hints: {
      bolt: s => s.counters.programsRun >= 1 && !s.nudgesDone?.includes('line_follow') && s.counters.programsRun < 3
        ? "Second sensor, dark track strips, line_under. Racing teams call line-following 'discipline'. I call it the fast way through corners. Same thing."
        : null,
      magma: s => s.counters.programsRun >= 1 && !s.nudgesDone?.includes('line_follow') && s.counters.programsRun < 3
        ? "There are parts for a second sensor, small builder. Line-following! The dark strips are like sidewalks for robots. Craftsmanship AND guidance, together."
        : null,
      juno: s => s.counters.programsRun >= 1 && !s.nudgesDone?.includes('line_follow') && s.counters.programsRun < 3
        ? "LINE-FOLLOWING! A second sensor plus the dark track strips! The robot gets EYES for the ground — we flew over those strips all week and WE still can't follow them. Teach it to show us up!"
        : null,
    },  },
  {
    id: 'flash_hardware',
    label: 'flash to a real robot',
    depends: ['program_bot'],
    hint: s => s.counters.flashes === 0 && s.counters.programsRun >= 2
      ? 'You\'ve run this in sim a couple times — BUILD IT, then 🔥 Flash it to a real board. Watching your own code move real wheels is… it\'s a whole feeling. Trust me.'
      : null,

    hints: {
      bolt: s => s.counters.flashes === 0 && s.counters.programsRun >= 2
        ? "Sim's proven it twice. Time for metal. BUILD IT, then 🔥 Flash to a real board. Race teams that never hit real hardware stay fictional. We are NOT fiction."
        : null,
      magma: s => s.counters.flashes === 0 && s.counters.programsRun >= 2
        ? "Oh — oh, it is time. Two clean runs in sim. BUILD IT, then 🔥 the Flash. Your code on a REAL board. I have waited my whole retirement to hold something steady for this."
        : null,
      juno: s => s.counters.flashes === 0 && s.counters.programsRun >= 2
        ? "TWO good sim runs! The board is ready — we can FEEL it, and we don't even have feelings-sensors! BUILD IT, then 🔥 Flash! Real wheels! Real world! Real DATA!"
        : null,
    },  },
  {
    id: 'explore_city',
    label: 'visit Circuit City',
    depends: ['mine_iron'],
    hint: s => !s.biomes?.includes('Circuit City')
      ? 'North band\'s called Circuit City — electronics-grade scrap. Smells like ambition and solder. Field trip?'
      : null,

    hints: {
      bolt: s => !s.biomes?.includes('Circuit City')
        ? "North band. Circuit City. Electronics-grade scrap — half the race gear in the old pits came from there. Field trip. I'll point out the fast alleys."
        : null,
      magma: s => !s.biomes?.includes('Circuit City')
        ? "North of here is Circuit City, little builder — electronics-grade scrap. Boards, sensors, quiet treasures. A gentle walk and a full satchel. Shall we?"
        : null,
      juno: s => !s.biomes?.includes('Circuit City')
        ? "NORTH! Circuit City! Electronics everywhere — it GLINTS, it probably BEEPS, we MUST KNOW. Explore with us! Take the road at x=64, it's scenic AND efficient!"
        : null,
    },  },
  {
    id: 'repair_bot',
    label: 'hammer out a dent',
    depends: ['build_first_bot'],
    hint: s => s.counters.crashes > 0 && s.counters.repairs === 0
      ? 'That dent isn\'t going anywhere without you. Grab a hammer near your bot — repairs go in the book. The book is sacred.'
      : null,

    hints: {
      bolt: s => s.counters.crashes > 0 && s.counters.repairs === 0
        ? "The dent's still there. Race crews fix between laps, not after seasons. Hammer it out — the book remembers, and the book keeps score."
        : null,
      magma: s => s.counters.crashes > 0 && s.counters.repairs === 0
        ? "Ah — the dent. Hammer hour, small builder. Bring the bot, press it patient, and the repair book will remember the healing. That book remembers all the right things."
        : null,
      juno: s => s.counters.crashes > 0 && s.counters.repairs === 0
        ? "That dent is DATA! Grab the hammer — repair it, log it in the book! We heard the book is basically a paper oracle. We have QUESTIONS for the oracle."
        : null,
    },
  },
  {
    id: 'beat_a_ghost',
    label: 'beat a ghost time',
    depends: ['race_lap'],
    hint: s => s.counters.laps > 0 && s.counters.ghostsBeaten === 0
      ? "The race board has ghost times — old runs by the yard's fastest. Beat the slowest one. It stays beaten forever. That's how legends start: one line at a time."
      : null,
    hints: {
      bolt: s => s.counters.laps > 0 && s.counters.ghostsBeaten === 0
        ? "You've got a lap time. The board's got ghosts — start at the bottom and hunt one down. Every pit dog I ever knew started exactly there. So did I."
        : null,
      magma: s => s.counters.laps > 0 && s.counters.ghostsBeaten === 0
        ? "The race board holds ghost times, dear one — memories of fast old bots. Beat one, and a memory becomes a friend. A fast, proud, newly-beaten friend."
        : null,
      juno: s => s.counters.laps > 0 && s.counters.ghostsBeaten === 0
        ? "GHOSTS! On the race board! Old lap times that never get tired! We MUST beat one. Start with the slowest — even ghosts deserve a gentle start. Then: HAUNTING CANCELLED."
        : null,
    },
  },
  {
    id: 'explore_deep_yard',
    label: 'venture into the Deep Yard',
    depends: ['explore_city'],
    hint: s => !s.biomes?.includes('The Deep Yard')
      ? "The far south band is the Deep Yard — extreme clutter, rare loot, the final workshop. Big kid territory. Field trip? Field trip."
      : null,
    hints: {
      bolt: s => !s.biomes?.includes('The Deep Yard')
        ? "Deep Yard. Far band. Rare parts, tight alleys — the ones fast bots don't dare. Scout it with me. Slow pass first. THEN we see what it's good for."
        : null,
      magma: s => !s.biomes?.includes('The Deep Yard')
        ? "The Deep Yard is far south, small builder — where the heaviest, rarest scrap sleeps. We will walk the road, keep to the open lanes, and bring treasures home to the bench."
        : null,
      juno: s => !s.biomes?.includes('The Deep Yard')
        ? "THE DEEP YARD. Far band. Unmapped-ish! Rare loot! The final workshop! We have been POLITE about this but honestly the curiosity is at CRITICAL MASS. Explore it with us??"
        : null,
    },
  },
  {
    id: 'ask_spark_question',
    label: 'ask Spark a weird question',
    depends: [],
    hint: s => s.counters.sparkAsks === 0
      ? "Spark knows everything about robots — go hold Q and ask something weird. The weirder the better. Weird questions are Spark's favorite food, probably."
      : null,
    hints: {
      bolt: s => s.counters.sparkAsks === 0
        ? "You've got a question about bots? Ask Spark — hold Q. Keep it weird. Spark's answers are like pit fuel: boring container, rocket inside."
        : null,
      magma: s => s.counters.sparkAsks === 0
        ? "If you ever wonder about the robots, dear one, ask Spark — hold Q. Spark is the kindest brain in the yard. And wondering is allowed. Wondering is ENCOURAGED."
        : null,
      juno: s => s.counters.sparkAsks === 0
        ? "ASK SPARK SOMETHING WEIRD! Hold Q! We have a LIST — question one: do robots dream of optimal routes? Question two is somehow about magnets. Go! Ask! Report back!"
        : null,
    },
  },
];

/** Resolve the hint a persona would say for a topic (fallback: shared voice). */
export function resolveHint(topic, data, personaId = 'rivet') {
  const fn = topic.hints?.[personaId] ?? topic.hint;
  return fn ? fn(data) : null;
}

/** Default topic weight = registry position (earlier = heavier). */
export function defaultWeight(topic, index, total) {
  return total - index;
}

export class Nudger {
  /**
   * @param {object} opts
   * @param {CompanionState-like} opts.state
   * @param {object|null} [opts.weights] persona nudge weights ({topicId: w}); null = registry order
   * @param {string} [opts.personaId] whose voice the hints speak
   * @param {() => number} [opts.rng]
   */
  constructor(opts = {}) {
    this.state = opts.state;                     // CompanionState-like
    this.weights = opts.weights ?? null;         // persona story-pull
    this.personaId = opts.personaId ?? 'rivet';
    this.rng = opts.rng ?? Math.random;
    this.now = opts.now ?? (() => Date.now());
    this._fired = new Set();                     // topics fired THIS SESSION
    this._lastNudgeAt = -Infinity;               // session clock (seconds)
    this._clock = 0;                             // seconds since session start
    this._lastCrashAt = -Infinity;
  }

  /** Effective weight of a topic for this persona. */
  weightOf(topic, index, total) {
    if (this.weights && this.weights[topic.id] !== undefined) return this.weights[topic.id];
    return defaultWeight(topic, index, total);
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

    const winner = this.candidates().sort((a, b) => b.score - a.score)[0];
    if (!winner) return null;

    this._fired.add(winner.topic.id);
    this._lastNudgeAt = this._clock;
    return { topic: winner.topic.id, line: winner.line };
  }

  /**
   * Eligible topics right now, with weights applied — WITHOUT firing.
   * Each: { topic, line, weight, score }. Shared with the party arbitrator.
   */
  candidates() {
    const data = this.state.data;
    const total = TOPICS.length;
    const out = [];
    TOPICS.forEach((topic, index) => {
      if (this.state.isNudgeDone(topic.id)) return;       // already tried it (ever)
      if (this._fired.has(topic.id)) return;              // already nudged (session)
      if (!topic.depends.every(dep => this.state.isNudgeDone(dep))) return;

      const line = resolveHint(topic, data, this.personaId);
      if (!line) return;                                  // prerequisites in the counters not met yet

      const weight = this.weightOf(topic, index, total);
      // jittered score: the insistent voice usually wins, but not always —
      // a nudge argument you can predict is a nudge argument you can mute
      out.push({ topic, line, weight, score: weight * (0.8 + this.rng() * 0.4) });
    });
    return out;
  }

  /** Fire a candidate from outside (party arbitration). */
  fire(candidate) {
    if (!candidate) return null;
    this._fired.add(candidate.topic.id);
    this._lastNudgeAt = this._clock;
    return { topic: candidate.topic.id, line: candidate.line };
  }

  /** Topics already nudged this session (introspection/tests). */
  fired() { return [...this._fired]; }
}

/**
 * PARTY NUDGER — one clock for the whole crew.
 *
 * Party members all contribute candidates from the SAME topic registry; the
 * more insistent voice (weight × jitter) wins, which is itself a personality
 * expression. When companions disagree about priorities, occasionally the
 * runner-up heckles first — the argument IS the content. Anti-nag rules
 * (grace, cooldown, crash suppression, mid-flow) apply ONCE per party.
 */
export class PartyNudger {
  /**
   * @param {object} opts
   * @param {Array<{id:string, nudger:Nudger}>} opts.members
   * @param {() => number} [opts.rng]
   */
  constructor(opts = {}) {
    this.members = opts.members ?? [];
    this.rng = opts.rng ?? Math.random;
    this._clock = 0;
    this._lastNudgeAt = -Infinity;
    this._lastCrashAt = -Infinity;
  }

  noteCrash() { this._lastCrashAt = this._clock; }

  /**
   * @param {number} dt seconds
   * @param {object} ctx { midFlow: boolean }
   * @returns {{id:string, topic:string, line:string, objection:{id:string, topic:string, line:string}|null}|null}
   */
  tick(dt, ctx = {}) {
    this._clock += dt;
    if (ctx.midFlow) return null;
    if (this._clock < NUDGE_GRACE_S) return null;
    if (this._clock - this._lastNudgeAt < NUDGE_COOLDOWN_S) return null;
    if (this._clock - this._lastCrashAt < CRASH_SUPPRESS_S) return null;

    // every member gathers candidates from the shared pool
    const entries = [];
    for (const m of this.members) {
      for (const c of m.nudger.candidates()) {
        entries.push({ member: m, candidate: c });
      }
    }
    if (!entries.length) return null;
    entries.sort((a, b) => b.candidate.score - a.candidate.score);
    const winner = entries[0];

    // the runner-up (a DIFFERENT member, a DIFFERENT topic) occasionally
    // objects — the companions argue about priorities, out loud
    let objection = null;
    const dissenters = entries.filter(e =>
      e.member.id !== winner.member.id && e.candidate.topic.id !== winner.candidate.topic.id);
    if (dissenters.length && this.rng() < 0.3) {
      const d = dissenters[Math.floor(this.rng() * dissenters.length)];
      objection = { id: d.member.id, topic: d.candidate.topic.id, line: d.candidate.line };
    }

    winner.member.nudger.fire(winner.candidate);
    this._lastNudgeAt = this._clock;
    return {
      id: winner.member.id,
      topic: winner.candidate.topic.id,
      line: winner.candidate.line,
      objection,
    };
  }
}
