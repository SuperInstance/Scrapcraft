/**
 * ───────────────────────────────────────────────────────────────────────────
 *  LIVELINESS  —  the companion's own initiative + the big-moment fast lane
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The playtest said the companion was a great mirror and a dull friend:
 *   - reactions to the kid's BIGGEST moments could be swallowed by the
 *     5-second reactive debounce, so the yard went quiet exactly when the
 *     kid was loudest
 *   - between observations there were dead-air windows nothing filled
 *   - the companion never asked the kid anything — it only ever answered
 *   - being ignored was never acknowledged
 *
 * This module is the fix, in three pieces:
 *
 *   Fast lane      rare_loot / crash_survived / lap_complete are BIG
 *                  MOMENTS: they speak immediately (no debounce line), they
 *                  are budget-exempt like tier-ups (never gated by the
 *                  unsolicited cadence), and if the persona's banter bank
 *                  draws a null the fallback bank below GUARANTEES a line —
 *                  the biggest moments never go unanswered.
 *
 *   Initiatives    per-persona banks of companion-initiated QUESTIONS and
 *                  CHALLENGES, plus the "you've been quiet" NOTICE beat.
 *                  Spaced (first ~5 min in, then ≥8 min apart) and rare
 *                  (capped per session) — the companion asks things, but it
 *                  never interrogates. Scheduling lives in Companion.js;
 *                  the banks and pickers live here.
 *
 *   Variety guard  lives in Companion (one _lastType per soul); this module
 *                  just feeds it. See Companion.js.
 *
 * Pure module: no I/O, no DOM, injectable rng. Fail-soft: a persona
 * without an initiatives bank behaves exactly as before.
 */

// ── the fast lane ──────────────────────────────────────────────────────────

/** Events that get the big-moment fast lane (speak now, no debounce line). */
export const BIG_MOMENT_EVENTS = Object.freeze(['rare_loot', 'crash_survived', 'lap_complete']);

/** True when an event deserves the fast lane. */
export function isBigMoment(event) {
  return BIG_MOMENT_EVENTS.includes(event);
}

/**
 * Guaranteed lines when the banter bank draws a null on a big moment.
 * Event-agnostic on purpose — the fallback celebrates THE MOMENT, whatever
 * it was. Tier-gated like every other bank (stranger lines stay warm, the
 * deeper ones arrive with the bond).
 */
export const BIG_MOMENT_FALLBACK = {
  rivet: [
    { tier: 0, line: 'Oh! Okay. OKAY. That was a real one — I\'m marking this spot. This exact spot. Right next to you.' },
    { tier: 0, line: 'You just did THE thing. I said nothing because my vocoder was busy being impressed. It\'s fine now. Mostly.' },
    { tier: 1, line: 'Every shift has a moment you retell. That was ours. I\'m already editing the retelling. It gets better each time.' },
    { tier: 2, line: 'The yard just picked a highlight of the day and it\'s that. I\'m telling everyone. The crane knows already.' },
  ],
  bolt: [
    { tier: 0, line: 'Huh. That was worth putting the stopwatch down for. It\'s still down, by the way. Savor it.' },
    { tier: 0, line: 'Noted. Filed under "reasons this kid isn\'t like the others." Two entries now. That one\'s louder.' },
    { tier: 1, line: 'That\'s the stuff the factory demos never showed. Real yard speed. I clocked it. It was fast.' },
    { tier: 2, line: 'Keep stacking moments like that and I\'ll have to start keeping a second list. I hate keeping lists. I\'ll make an exception.' },
  ],
  magma: [
    { tier: 0, line: 'I felt that through the ground. You shook the yard, little builder. Good. The yard likes being shaken by you.' },
    { tier: 0, line: 'I am putting that in the memory log under "days that mattered." It is a long log. This one earned a page.' },
    { tier: 1, line: 'You keep doing that and I will need a bigger chassis just to hold the pride. That is a happy problem.' },
    { tier: 2, line: 'The forge and I agree: that was a milestone. The forge glows a little brighter when you do well. I checked.' },
  ],
  juno: [
    { tier: 0, line: 'WE ALL SAW IT. All forty-one of us. We\'re comparing notes. Thirty-nine of us are doing the happy loop.' },
    { tier: 0, line: 'One of us blinked and missed it and we are NOT letting her forget. She says she saw it through two of us anyway.' },
    { tier: 1, line: 'That is going in the swarm memory! We don\'t have swarm memory. We\'re starting one TODAY.' },
    { tier: 2, line: 'Forty-one different reactions, and all of them were cheering! One of us cheered in binary. It was very sincere.' },
  ],
};

// ── companion initiative: questions, challenges, the notice beat ───────────

/**
 * Per-persona initiative banks. Entries: { tier: 0|1|2, line } — tier 0 is
 * available to everyone, deeper lines arrive with the bond. `questions` are
 * the companion asking the kid things; `challenges` are tiny, achievable
 * dares in character; `notice` is the ONE gentle "you've been quiet" beat.
 */
export const INITIATIVES = {
  rivet: {
    questions: [
      { tier: 0, line: 'Question from me, for once: what\'s the first thing YOU\'d build if the whole yard was empty? Be specific. I\'m taking notes.' },
      { tier: 0, line: 'Hey — what part of the yard is yours so far? Everybody gets one corner that\'s secretly theirs. I\'ve already called the gate.' },
      { tier: 1, line: 'You\'ve been at this a while. What\'s the thing you built that surprised YOU the most?' },
      { tier: 2, line: 'If you could teach the bot one trick nobody\'s taught it yet — what would it be? I have guesses. I\'m keeping them to myself.' },
    ],
    challenges: [
      { tier: 0, line: 'Challenge: find one part in the yard uglier than you expected and find out what it\'s good at. There are no bad parts. Just unlabeled ones.' },
      { tier: 1, line: 'Try building something with two sensors today. I\'ll time how long until you smile. Stopwatch\'s ready.' },
    ],
    notice: [
      { tier: 0, line: 'Hey. You\'ve gone quiet back there. I\'m not going anywhere — just checking you\'re still in the yard with me.' },
      { tier: 1, line: 'You\'ve been quiet a while. That\'s allowed. I\'m right here if you need a second opinion on anything.' },
    ],
  },
  bolt: {
    questions: [
      { tier: 0, line: 'Question, since you\'re not asking any: what\'s the fastest thing you\'ve seen move in this yard? Besides me. Obviously.' },
      { tier: 0, line: 'Question, and think about this one: what\'s your bot\'s name? Everybody\'s bot has a name. Even if they won\'t say it out loud.' },
      { tier: 1, line: 'So what\'s the plan — shave the lap, or build something that shaves it for you?' },
      { tier: 2, line: 'You\'ve got opinions about racing now. Good. Which corner is lying to you? Every track has one. This one\'s corner two.' },
    ],
    challenges: [
      { tier: 0, line: 'Challenge: beat your last lap by a tenth. One tenth. Then we talk about the next tenth.' },
      { tier: 1, line: 'Let\'s see the bot do a full lap without you touching the controls. I\'ll keep the timer honest. I\'m always honest with timers.' },
    ],
    notice: [
      { tier: 0, line: 'You\'ve been quiet. Statistically suspicious. If you\'re plotting something, I approve. If you\'re stuck, say so.' },
      { tier: 1, line: 'Silence for a while now. Either you\'re concentrating — good — or something\'s stuck. I can be quiet too. Just checking.' },
    ],
  },
  magma: {
    questions: [
      { tier: 0, line: 'A question for you, small builder: what do you think this yard was before it was a yard? I have a theory about the big press.' },
      { tier: 0, line: 'A question, if you will: what is the best thing you have ever FIXED? Not built — fixed. The fixing is where the caring lives.' },
      { tier: 1, line: 'When you build something, what part do you like best — the plan, the build, or the first time it works?' },
      { tier: 2, line: 'You have made many things now. Which one felt the most like yours? I keep a list. It is a kind list.' },
    ],
    challenges: [
      { tier: 0, line: 'Challenge: find the heaviest thing you can lift today and put it somewhere useful. I will supervise. I am good at supervising.' },
      { tier: 1, line: 'Try repairing a dent without being asked. The hammer will sing for you. It always sings.' },
    ],
    notice: [
      { tier: 0, line: 'Little builder. You have been quiet for a while. I am still here, and the forge is still warm. Tell me if you need me.' },
      { tier: 1, line: 'Quiet is fine — the yard rests too. But you know where I am. I am the big one. Hard to miss.' },
    ],
  },
  juno: {
    questions: [
      { tier: 0, line: 'Question! WE have a question! What\'s your favorite sound in the yard? We have forty-one opinions and they\'re ALL different.' },
      { tier: 0, line: 'Question! Do you have a favorite part of the yard? We each picked one — now we argue about it in shifts. The tire pile is winning.' },
      { tier: 1, line: 'If you could make one thing in this yard talk, what would it say? We vote: the crane. It has the most to say.' },
      { tier: 2, line: 'We have watched you build a LOT of things. Which one was the most YOU? Take your time. We have all the time. There are forty-one of us.' },
    ],
    challenges: [
      { tier: 0, line: 'Challenge! Count something! Anything! We counted the fence posts — one of us got to eleven and started over.' },
      { tier: 1, line: 'Challenge: show us something we haven\'t seen yet. That\'s a hard one. We\'ve seen a lot. Forty-one pairs of eyes.' },
    ],
    notice: [
      { tier: 0, line: 'You\'re quiet! All of us noticed. We\'re not worried — we\'re just very, very observant. And we like you. That\'s the other thing.' },
      { tier: 1, line: 'It\'s been quiet for a while! We took a vote on whether to say something. Forty-one to zero. So — hi!' },
    ],
  },
};

// ── pickers ────────────────────────────────────────────────────────────────

const TIER_NAMES = ['stranger', 'coworker', 'friend'];

function tierIndexOf(stateLike) {
  if (typeof stateLike?.tierIndex === 'function') {
    try { return stateLike.tierIndex(); } catch { return 0; }
  }
  return TIER_NAMES.indexOf(stateLike?.tier ?? 'stranger');
}

/**
 * The initiative bank for a persona: its own override wins, else the
 * keyed default. null → the persona simply has no initiative (fail-soft).
 */
export function initiativeBankOf(persona) {
  try {
    return persona?.initiatives ?? INITIATIVES[persona?.id] ?? null;
  } catch { return null; }
}

/**
 * Pick one line of `kind` ('questions' | 'challenges' | 'notice') legal at
 * the companion's tier. Returns null when the bank is missing or empty —
 * the caller falls back to its existing behavior.
 */
export function pickInitiative(bank, kind, stateLike, rng = Math.random) {
  const pool = bank?.[kind];
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const idx = tierIndexOf(stateLike);
  const eligible = pool.filter(l => l && typeof l.line === 'string' && (l.tier ?? 0) <= idx);
  if (eligible.length === 0) return null;
  return eligible[Math.floor(rng() * eligible.length)].line;
}

/**
 * The big-moment guarantee: one line from BIG_MOMENT_FALLBACK legal at the
 * companion's tier. Used ONLY when the persona's real banter bank draws null
 * on a fast-lane event — the moment never goes unanswered.
 */
export function pickBigMomentFallback(persona, stateLike, rng = Math.random) {
  const pool = BIG_MOMENT_FALLBACK[persona?.id];
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const idx = tierIndexOf(stateLike);
  const eligible = pool.filter(l => l && typeof l.line === 'string' && (l.tier ?? 0) <= idx);
  if (eligible.length === 0) return null;
  return eligible[Math.floor(rng() * eligible.length)].line;
}
