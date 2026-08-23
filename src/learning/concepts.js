/**
 * ───────────────────────────────────────────────────────────────────────────
 *  THE CONCEPT TAXONOMY  —  what Scrapcraft teaches, made countable
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The game already teaches; this file makes the teaching AUDITABLE. The
 * concept taxonomy — SEVENTEEN concepts in four tiers (SENSE → THINK →
 * ACT → ENGINEER) — forms the "concept ladder" the rest of src/learning
 * climbs. (The brief's header says "16", but its own tier enumeration lists
 * 3+6+3+5 = 17; the ids are the fixed contract with the content coder, so
 * they ALL stay — house precedent: the spec's "64-quest" miscount.)
 *
 *   ConceptLedger   tracks each kid's rung per concept (seen → practiced →
 *                   taught — teaching IS the test, no quizzes).
 *   TeachBack       turns a practiced concept into a naive question from a
 *                   companion; the kid answers as the teacher.
 *   BrokenBot       debugs real TilePrograms; each clinic certifies the
 *                   debugging concept plus the concept the bug was about.
 *
 * Two derivations live here, both DATA so a teacher (or a test) can audit
 * exactly why any quest maps to any concept:
 *
 *   KEYWORD_TABLE    quest teaching.concept strings → concept ids by regex.
 *   QUEST_OVERRIDES  hand calls where keywords fail or misfire, each with
 *                   its reason. Overrides REPLACE the keyword result.
 *
 * Headless like src/quests' engine tier: no DOM, no game imports. The only
 * dependency is the CAMPAIGN data (quests are data files, not code).
 * ───────────────────────────────────────────────────────────────────────────
 */

import { CAMPAIGN } from '../quests/data/index.js';

// ── The ladder ──────────────────────────────────────────────────────────────

/** Tier order = the reading order concepts are offered in (and summarized in). */
export const TIER_ORDER = ['SENSE', 'THINK', 'ACT', 'ENGINEER'];

/**
 * The 17 concepts. `chapter` = spine chapter number where the concept first
 * lands for a kid walking the twelve chapters (tier ranges: SENSE ch4+,
 * THINK ch4-6, ACT ch3-5, ENGINEER ch7+). Declaration order is tier order —
 * summary() and nextTeachable() walk this array as-is.
 */
export const CONCEPTS = [
  // ── TIER SENSE (ch4+) — reading the world ────────────────────────────────
  { id: 'sensors-overview', tier: 'SENSE', name: 'Sensors', chapter: 4,
    kidPhrase: 'A sensor is how a robot asks the world a question.',
    description: 'What sensors are, what they measure, and how a robot reads the world through them.' },
  { id: 'thresholds', tier: 'SENSE', name: 'Thresholds', chapter: 5,
    kidPhrase: "A threshold is the line where 'enough' becomes 'too much.'",
    description: 'Turning a fuzzy reading into a yes-or-no by drawing a line: above it act, below it don\u2019t.' },
  { id: 'calibration', tier: 'SENSE', name: 'Calibration', chapter: 6,
    kidPhrase: "Calibration is teaching a sensor what 'normal' means today.",
    description: 'Tuning sensor baselines for today\u2019s conditions so readings mean the same thing in a different place or light.' },

  // ── TIER THINK (ch4-6) — the program's decision parts ────────────────────
  { id: 'conditionals', tier: 'THINK', name: 'Conditionals', chapter: 4,
    kidPhrase: "If this, then that — the robot's version of making a choice.",
    description: 'if / if-else tiles: branching behavior on a sensor test.' },
  { id: 'loops-forever', tier: 'THINK', name: 'Forever Loops', chapter: 4,
    kidPhrase: 'Forever means again. And again. And again.',
    description: 'The forever tile — the robot\u2019s heartbeat, one pass per tick, like a real loop().' },
  { id: 'loops-counted', tier: 'THINK', name: 'Counted Loops', chapter: 5,
    kidPhrase: 'Repeat N times when you know exactly how many.',
    description: 'The repeat tile — bounded loops for a known number of tries.' },
  { id: 'loops-until', tier: 'THINK', name: 'Loops Until', chapter: 5,
    kidPhrase: 'Keep going until the world tells you to stop.',
    description: 'repeat_until / wait_until / break — loops that end when a condition is met.' },
  { id: 'variables', tier: 'THINK', name: 'Variables', chapter: 6,
    kidPhrase: 'A variable is a labeled box the robot remembers a number in.',
    description: 'set / change / math / random / read-sensor tiles: named memory a program can read back.' },
  { id: 'subroutines', tier: 'THINK', name: 'Subroutines', chapter: 6,
    kidPhrase: 'Teach it once, call it by name — a saved trick.',
    description: 'define_sub / call_sub: one named chunk of behavior, reused anywhere.' },

  // ── TIER ACT (ch3-5) — acting on the world ───────────────────────────────
  { id: 'actuation', tier: 'ACT', name: 'Actuation', chapter: 3,
    kidPhrase: 'Actuation is metal that moves because code said so.',
    description: 'Motors, grippers, beepers, LEDs — the output half of robotics.' },
  { id: 'feedback-loop', tier: 'ACT', name: 'Feedback Loops', chapter: 4,
    kidPhrase: 'Sense, decide, act, repeat — the loop that runs the whole show.',
    description: 'Closed-loop control: sensors steer actions, actions change readings, around and around.' },
  { id: 'optimization', tier: 'ACT', name: 'Optimization', chapter: 5,
    kidPhrase: 'Optimization is the same job with less — less code, less power, less time.',
    description: 'Efficiency, budgets, and trade-offs: making a program fit and last.' },

  // ── TIER ENGINEER (ch7+) — the professional moves ────────────────────────
  { id: 'debugging', tier: 'ENGINEER', name: 'Debugging', chapter: 7,
    kidPhrase: 'Debugging is detective work: one clue, one change, one test.',
    description: 'Systematic fault-finding: hypothesis, single change, re-run, read the evidence.' },
  { id: 'firmware-export', tier: 'ENGINEER', name: 'Firmware Export', chapter: 7,
    kidPhrase: 'Your tiles can become real code for real chips.',
    description: 'Cross-compilation, hardware abstraction, bootloaders — game brain to silicon.' },
  { id: 'failure-analysis', tier: 'ENGINEER', name: 'Failure Analysis', chapter: 8,
    kidPhrase: 'Every wreck wrote a letter. Reading it is the cheapest education.',
    description: 'Post-mortems: reading crashed robots\u2019 plaques to skip their tuition.' },
  { id: 'power-systems', tier: 'ENGINEER', name: 'Power Systems', chapter: 7,
    kidPhrase: 'Everything that moves eats power — budget it like snack money.',
    description: 'Energy sources, batteries, voltage, and power budgets for robots that last.' },
  { id: 'integration', tier: 'ENGINEER', name: 'Integration', chapter: 11,
    kidPhrase: 'Integration is making every system work as one robot.',
    description: 'Multi-system builds under constraint: sensors + code + power + chassis as one machine.' },
];

const CONCEPT_IDS = new Set(CONCEPTS.map(c => c.id));

// ── Derivation 1: the keyword table ─────────────────────────────────────────
//
// Regexes run against the LOWERCASED quest teaching.concept string and
// ACCUMULATE (a quest can teach more than one concept). Order within the
// result is canonical (CONCEPTS declaration order), not table order.

const KEYWORD_TABLE = [
  { match: /feedback|closed[- ]loop|\bloop\b/, concepts: ['feedback-loop'],
    why: "campaign prose says 'loop' when it means the sense-think-act loop" },
  { match: /threshold|hysteresis|baseline/, concepts: ['thresholds'],
    why: 'thresholds, hysteresis bands, and day-baselines are all line-drawing' },
  { match: /calibrat/, concepts: ['calibration'],
    why: 'explicit calibration language' },
  { match: /sensor|sensing|ultrasonic|magnetic|hall-effect|radar|line-follow|navigation|dead reckoning|\bgps\b/,
    concepts: ['sensors-overview'],
    why: 'every named sensing technology, plus navigation (dead reckoning / GPS is sensor-driven)' },
  { match: /power|energy|battery|voltage|solar|renewable|pneumatic|fuel|redundan/,
    concepts: ['power-systems'],
    why: 'energy sources, storage, and redundancy (the reliability kind of spare)' },
  { match: /efficien|optimi|\bbudget/, concepts: ['optimization'],
    why: 'efficiency, explicit optimization, and budgets (power/code/size)' },
  { match: /firmware|bootloader|flash|compil|abstraction/, concepts: ['firmware-export'],
    why: 'the tiles-to-silicon pipeline vocabulary' },
  { match: /failure|post-mortem|crash|wreck|plaque/, concepts: ['failure-analysis'],
    why: 'post-mortems and the plaque wall' },
  { match: /debug|diagnos|repair|maintenance/, concepts: ['debugging'],
    why: 'fault-finding and the repair discipline around it' },
  { match: /integrat|systems thinking/, concepts: ['integration'],
    why: 'component/system integration and systems thinking' },
  { match: /\bpwm\b|motor|torque|actuat|automation/, concepts: ['actuation'],
    why: 'motors, PWM, torque, and machines-doing-work' },
  { match: /\bvariable\b/, concepts: ['variables'],
    why: 'program variables (KNOWN false positive: science-method "variables" — overridden for juno-4)' },
];

/**
 * The keyword matcher, exported so tests can pin it. Returns concept ids in
 * canonical ladder order. Unknown strings → [].
 * @param {string} conceptString  a quest's teaching.concept
 * @returns {string[]}
 */
export function deriveConceptsFromTeaching(conceptString) {
  if (typeof conceptString !== 'string' || !conceptString) return [];
  const s = conceptString.toLowerCase();
  const hits = new Set();
  for (const rule of KEYWORD_TABLE) {
    if (rule.match.test(s)) for (const id of rule.concepts) hits.add(id);
  }
  return CONCEPTS.filter(c => hits.has(c.id)).map(c => c.id);
}

// ── Derivation 2: hand overrides where keywords fail or misfire ────────────
//
// An override REPLACES the keyword result wholesale (write the full list,
// including anything the keywords would have kept). Each carries its reason.

const QUEST_OVERRIDES = {
  // "Microcontrollers — programmable logic": the Tin Brain chapter is where
  // choosing between paths first lands — conditionals is THINK's on-ramp.
  'earl-6': ['conditionals'],

  // "Field deployment — building for real use": putting a finished build to
  // work in the live yard is the integration rung (no keyword hits).
  'earl-10': ['integration'],

  // "Spatial mapping and exploration": mapping the yard's bands is
  // sensing-the-world curriculum (no keyword hits).
  'juno-1': ['sensors-overview'],

  // "Scientific method and controlled variable testing" trips the /variable/
  // keyword, but these are science-method variables, not program variables.
  // The one-knob-at-a-time discipline is calibration (spine ch4 pairs them).
  'juno-4': ['calibration'],

  // "Spatial reasoning and yards as memory palaces": lands in spine ch8
  // "Fail Loudly"; reading the yard's wrecks IS the memory palace.
  'rivet-4': ['failure-analysis'],

  // "Closed-loop mastery — the whole stack": keywords give feedback-loop; the
  // finale's whole-stack payoff adds integration.
  'finale-midnight-race': ['feedback-loop', 'integration'],

  // "Attribution and provenance": authorship lives in the export header —
  // the signed Flash Receipt.
  'ch7-1': ['firmware-export'],

  // "Sharing work — the open-source spirit": sharing means publishing your
  // exported firmware (the Brain Gallery trades exports).
  'ch7-3': ['firmware-export'],

  // "Evidence discipline — observe before concluding": the candlelight watch
  // is low-signal threshold tuning (spine ch9 names thresholds + calibration).
  'ch9-1': ['thresholds', 'calibration'],

  // "Data logging, timestamping, and correlation": logging is read_sensor
  // into named values, then reading them back.
  'ch9-2': ['variables', 'sensors-overview'],

  // "Consistency as the delivery system for speed": steady-beats-spikey is
  // the optimizer's argument.
  'bolt-side-2': ['optimization'],

  // "Pit stops and present crews": pit-wall repair under the clock is the
  // debugging clinic's soft side.
  'bolt-side-3': ['debugging'],

  // "Build records and craftsmanship trails": the build receipt is the
  // export's paper trail.
  'magma-side-1': ['firmware-export'],

  // "Method under stakes — discipline when it's real": one-knob-at-a-time on
  // real hardware is the debugging method, not a training wheel.
  'magma-side-2': ['debugging'],

  // "Letting go as re-homing": prototypes become plaques — the failure
  // archive is where re-homing happens.
  'magma-side-3': ['failure-analysis'],

  // "Turning sensors down to turn data up": gain/threshold control (keyword
  // already gives sensors-overview; restated so the override is complete).
  'juno-side-2': ['thresholds', 'sensors-overview'],

  // "Opening a channel for the quiet node": the quiet node is a sensor whose
  // reading gets filtered out.
  'juno-side-3': ['sensors-overview'],

  // "Tool wear as recorded habit": reading habits recorded in steel is
  // reading the past — the plaque discipline.
  'rivet-side-1': ['failure-analysis'],

  // "Scope control — one lane done completely": one job per named unit IS
  // the subroutine idea.
  'rivet-side-2': ['subroutines'],

  // "Optimization — same behavior, less code": keywords give optimization;
  // the compression tools named are counted loops and subs.
  'bolt-write-shorter': ['optimization', 'loops-counted', 'subroutines'],

  // "Post-game as open door": a finished story integrates everything
  // learned — the yard keeps teaching.
  'yard-1': ['integration'],
};

// ── The quest → concept map ─────────────────────────────────────────────────

/**
 * questId → conceptId[] for every CAMPAIGN quest, derived at import time
 * from the live data (keywords first, hand overrides where they fail).
 * Deliberately unmapped (no ladder concept claims them yet — early-chapter
 * salvage/crafting/exploration content):
 *   earl-1  "Materials — salvage and abundance"
 *   earl-2  "Tool-making — from scrap to purpose"
 *   earl-11 "Exploration — discovering constraints and resources"
 * Plus three synthetic BrokenBot clinic carriers (see BrokenBot.js) so a
 * finished clinic counts as quest completion in the ledger.
 */
export const QUEST_CONCEPTS = (() => {
  const map = {};
  for (const q of CAMPAIGN) {
    if (!q?.id) continue;
    map[q.id] = QUEST_OVERRIDES[q.id] ?? deriveConceptsFromTeaching(q.teaching?.concept ?? '');
  }
  // BrokenBot clinics ride the same carrier mechanism as quests.
  map['brokenbot-left-forever'] = ['debugging', 'conditionals'];
  map['brokenbot-never-stops'] = ['debugging', 'loops-until'];
  map['brokenbot-wrong-sensor'] = ['debugging', 'sensors-overview'];
  return map;
})();

/** All concept ids referenced anywhere in QUEST_CONCEPTS are real (audited in tests). */
export function isConceptId(id) { return CONCEPT_IDS.has(id); }
