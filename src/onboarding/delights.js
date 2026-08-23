/**
 * ───────────────────────────────────────────────────────────────────────────
 *  DELIGHTS  —  the first hour's one-time wow moments, as data + gates
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Companion coldstart.js's pattern: copy as data, once-ever gates with
 * injectable storage, headless-testable, no DOM. Three delight beats plus
 * two failure-kindness beats, each landing sound + visual + companion
 * reaction together (the game wires AudioSystem/ParticleSystem/voice in
 * Game._delightCeremony — this module never touches them):
 *
 *   first_lucky_find       the kid's first rare loot — guaranteed on the
 *                          first junk block they ever mine (minute ~2)
 *   first_program_run      the bot twitches to life under THEIR code
 *   first_autonomous_lap   the first lap the bot drove by itself
 *   first_wake_tease:<id>  a dormant thing stirs (the yard-noticed beat)
 *
 * Failure kindness (encouraging companion line + a concrete recovery step —
 * a kid whose bot bricked must never feel stuck):
 *   first_dent       the first wall-bonk is curriculum, not defeat
 *   battery_dead     the bot ran dry — recovery is one charging pad away
 *                    (not once-ever: every flat battery gets kindness, the
 *                    GAME side applies its own cooldown)
 */

// ── one-time delight copy, per companion voice ─────────────────────────────

export const DELIGHT_LINES = {
  first_lucky_find: {
    rivet: 'A RARE PART?! On your first pile?! Okay okay — act casual. We are so not casual.',
    bolt:  'Huh. Buried treasure on day one. I\'ve seen slower starts end in trophies. Don\'t lose it.',
    magma: 'Oh, little builder — the yard just shook your hand. Keep that part somewhere safe. I will remember where you stood.',
    juno:  'IT FOUND YOU! The rare part FOUND YOU! First pile! We are telling EVERYONE. Earl first. Earl most.',
  },
  first_program_run: {
    rivet: 'IT MOVED. Your code made it MOVE. I\'m a drone and even I think that\'s magic. It\'s not magic. It\'s better — it\'s yours.',
    bolt:  'Look at that. Your program, its wheels, zero help. Every racer I ever flagged started exactly there. Savor it.',
    magma: 'It is thinking, small builder. With the thoughts YOU gave it. I will be quiet now. This moment deserves quiet.',
    juno:  'IT\'S ALIVE-ish! Because of YOUR BRAIN! We ran circles around the room — okay IT ran circles, we supervised. TEN OUT OF TEN.',
  },
  first_autonomous_lap: {
    rivet: 'A whole lap! It drove THAT by itself! You taught it every corner and it LISTENED. You\'re basically a parent now.',
    bolt:  'First autonomous lap — logged. That\'s the one you\'ll measure everything against. Not because it was fast. Because it was yours.',
    magma: 'Around the whole oval, on its own, steady as sunrise. You built the runner AND the running. I am so still, but inside I am applauding.',
    juno:  'ONE FULL LAP, SELF-DRIVEN! We timed it! We timed it AGAIN! The bot has OPINIONS about corners now — this is CHARACTER DEVELOPMENT.',
  },
  // failure kindness — a wall-bonk is a lesson wearing a dent costume
  first_dent: {
    rivet: 'First dent! Welcome to the club — every bot in this yard is a member. Dents aren\'t failures, they\'re the yard signing your work.',
    bolt:  'First crash. Good. Means you\'re trying things. The wall\'s fine, the bot\'s fine, and now you\'ve got data. Rookies who never dent never learn.',
    magma: 'Ah — the first dent. Dear one, my whole body is dents and I am the strongest one here. This is how robots grow stories.',
    juno:  'A DENT! A tiny metal scar with a STORY! The repair book will log it forever. You two are officially interesting now!',
  },
  battery_dead: {
    rivet: 'Battery\'s flat — that\'s not a fail, that\'s a pit stop. Park it on a charging pad; nothing you built was lost.',
    bolt:  'Dead battery. Happens mid-race to the best crews — charge it and get back out. The program\'s still in there.',
    magma: 'Power out, little builder — the bot simply rests now. A charging pad will wake it. Its brain, your brain: both safe.',
    juno:  'ZERO PERCENT! Dramatic! But fixable — charging pad, right over there, bot wakes up grumpy but fine. We love a comeback arc!',
  },
};

/** The right line for a beat in a companion's voice (Rivet fallback). */
export function delightLine(key, personaId = 'rivet') {
  const bank = DELIGHT_LINES[key];
  if (!bank) return null;
  return bank[personaId] ?? bank.rivet ?? null;
}

// ── recovery steps (failure kindness always ends with a way forward) ───────

export const FIRST_DENT_RECOVERY =
  'Stand near your bot with a repair kit and press G — dents hammer out, and the repair book keeps the story.';
export const BATTERY_RECOVERY =
  'Roll it onto a charging pad (the glowing pad by the shed) — power refills on its own.';

// ── the once-ever gates ─────────────────────────────────────────────────────

const STORAGE_PREFIX = 'scrapcraft_delight_';

/**
 * One-shot ceremony gates for the first-hour beats. Storage injectable
 * (localStorage in the game, a Map in tests); in-memory fallback keeps
 * fires-once-per-instance semantics headless. Corrupt storage never throws.
 */
export class DelightGate {
  constructor(storage = null) {
    this._storage = storage;
    this._mem = new Set();
  }

  static browser() {
    return new DelightGate(
      typeof localStorage !== 'undefined' ? localStorage : null,
    );
  }

  _key(beat) { return STORAGE_PREFIX + String(beat); }

  fired(beat) {
    if (this._storage) {
      try { return this._storage.getItem(this._key(beat)) === '1'; } catch { /* fall through */ }
    }
    return this._mem.has(String(beat));
  }

  markFired(beat) {
    const b = String(beat);
    this._mem.add(b);
    try { this._storage?.setItem(this._key(b), '1'); } catch { /* corrupt-world tolerant */ }
  }

  /** Fire-and-report: returns true exactly once per beat. */
  once(beat) {
    if (this.fired(beat)) return false;
    this.markFired(beat);
    return true;
  }
}
