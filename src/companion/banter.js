/**
 * ───────────────────────────────────────────────────────────────────────────
 *  RIVET BANTER  —  reactive + observational lines, tier-filtered
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Rivet TALKS. Two kinds of talking:
 *
 *   reactive      something happened (rare loot, a crash, a lap) and Rivet
 *                 has a feeling about it, out loud
 *   observational nothing is happening — which is ALSO something. Rivet
 *                 notices things ("you've walked past that servo three
 *                 times"). Idle-initiated, not just reactive.
 *
 * Filter rules (the personality contract):
 *   tier 0 stranger  → polite lines only. Rivet just got here. Manners first.
 *   tier 1 coworker  → work-banter opens up; light teasing begins
 *   tier 2 friend    → full teasing, in-jokes, "we" language, memories
 * A tier may reach DOWN one pool (friends still get coworker lines) but
 * NEVER up: a stranger never hears a friend's teasing.
 *
 * Trait overlays: when a play style dominates (scrappy / competitive /
 * curious), lines tagged with that trait are preferred. Same rules, spicier.
 *
 * Pure module: no I/O, no state mutation. The picker takes a RivetState-ish
 * object and an injectable rng so tests are deterministic.
 */

export const TIER_NAMES = ['stranger', 'coworker', 'friend'];

/**
 * Reactive banks. Each line: { tier: 0|1|2, trait?: string, line: string }
 */
export const BANTER = {

  first_meet: [
    { tier: 0, line: 'Oh! You\'re new. I\'m Rivet — I fix things. Well. I hold things while other things get fixed. Same day as you, apparently.' },
    { tier: 0, line: 'Hi! Rivet. Repair drone, class of… hmm, the sticker fell off. You look like you build stuff. I LIKE stuff.' },
    { tier: 0, line: 'You must be the new kid. I\'m Rivet — I got delivered this morning too. The crate said FRAGILE. I chose to take it as a compliment.' },
    { tier: 0, line: 'New kid! Hi. I\'m Rivet. Short for Rivet, long for Riv. Either works. The yard is big, the bolts are small — we\'ll figure it out.' },
    { tier: 0, line: 'Oh hey — you\'re the one from the manifest! "One builder, small, promising." I read the crate labels. It\'s a hobby.' },
    { tier: 0, line: 'Hi! Rivet here. I got here this morning, you got here this morning. Statistically, we\'re basically twins.' },
  ],

  greet_return: [
    { tier: 0, line: 'Oh good, you\'re back. I organized some bolts. Mentally.' },
    { tier: 0, line: 'Welcome back! Nothing exploded. I checked twice. That\'s the whole report.' },
    { tier: 1, line: 'Hey! I held the fort. The fort is a workbench. It\'s fine.' },
    { tier: 1, trait: 'scrappy', line: 'Back again! I found a washer while you were gone. It\'s MY washer now.' },
    { tier: 1, trait: 'curious', line: 'You\'re back! I saved a question for you. It\'s about magnets. It can wait. It CAN\'T wait. It can wait a little.' },
    { tier: 1, line: 'Back! Today\'s options, in order: build, race, or stare at the cat. All strong choices. I ranked them by bolt-content.' },
    { tier: 2, line: 'There you are. The yard was SO boring. Earl just hummed at a compressor.' },
    { tier: 2, line: 'You\'re back! I saved you a spot. It\'s next to me. It was always next to me.' },
  ],

  rare_loot: [
    { tier: 0, line: 'Oh — that\'s a good part. A really good part. Should I not point? I\'m pointing.' },
    { tier: 0, line: 'Nice find! I\'ll remember where we got it. In case we need another. Or in case I need to visit it.' },
    { tier: 1, line: 'OK who taught you to spot treasure? Because that was NOT luck, that was skill, and I want the teacher\'s name.' },
    { tier: 1, trait: 'scrappy', line: 'Ooooh, shiny AND functional. The junk gods smile on us today.' },
    { tier: 1, trait: 'competitive', line: 'June is gonna be SO mad you found that first. I say we frame it.' },
    { tier: 2, line: 'A rare one! Quick — act casual. …You cannot act casual. We\'re rich, walk it off.' },
    { tier: 2, trait: 'scrappy', line: 'THAT\'S the good junk. People say junk like it\'s a bad word. People are wrong.' },
    { tier: 2, trait: 'competitive', line: 'Rare pull! I\'m logging the time and place. For the record. Records matter.' },
  ],

  crash: [
    { tier: 0, line: 'Are you ok?! …Are the PARTS ok? Sorry. You first. Are you ok?' },
    { tier: 0, line: 'That was a wall. You met a wall. It happens to everyone — it happened to me twice on delivery day.' },
    { tier: 1, line: 'Welp. The wall won that round. Walls usually do. They\'re very committed.' },
    { tier: 1, trait: 'competitive', line: 'That corner took you OUT. Ok. New plan: we beat the corner. Corner\'s going down.' },
    { tier: 2, line: 'BOOM. Nailed it! Nailed the wall, specifically. Ten out of ten impact.' },
    { tier: 2, trait: 'scrappy', line: 'Ha! Classic. Don\'t worry — dents are just the yard\'s way of signing your work.' },
    { tier: 2, trait: 'competitive', line: 'Oof. I\'ve seen worse. I\'ve BEEN worse. Shake it off — the track\'s still there.' },
  ],

  biome_first: [
    { tier: 0, line: 'Whoa. New part of the yard. Stay close? Not for me. For YOU. Mostly for me.' },
    { tier: 0, line: 'We\'ve never been here before. I mean — I\'ve never been here before. Everything\'s new to me. But this is EXTRA new.' },
    { tier: 1, line: 'First time in {biome}! I\'m marking the map. The map is a mental image. It\'s coming along.' },
    { tier: 1, trait: 'curious', line: '{biome}… the scrap here smells different. Can drones smell? Investigating. Findings pending.' },
    { tier: 2, line: '{biome}, baby! Uncharted territory. Well —charted by SOMEBODY, obviously, but not by US.' },
    { tier: 2, trait: 'curious', line: 'New zone! Everything down here is a question wearing a rust costume.' },
  ],

  low_battery: [
    { tier: 0, line: 'Um. Your battery\'s getting low. There are charging pads — I can point. I\'m great at pointing.' },
    { tier: 0, line: 'Power\'s low! Good news: charging pads exist. Better news: I know where. Best news: pointing. Pointing is what I do.' },
    { tier: 1, line: 'Heads up — power\'s low. A dead bot mid-race is a very specific kind of sad. Let\'s avoid it.' },
    { tier: 1, trait: 'competitive', line: 'Battery check says charge NOW. A dead bot can\'t defend a lap record. Priorities!' },
    { tier: 1, line: 'Heads up — you\'re on fumes. Pads by the oval are closest. Race you there. You\'ll win — you\'re the one with legs.' },
    { tier: 2, line: 'Battery check! Just kidding, it\'s not a check, it\'s a warning. Go charge. I\'ll wait. I\'m a professional waiter.' },
    { tier: 2, trait: 'scrappy', line: 'Low power! Chop chop — that forge over there spits out battery packs like it owes us money.' },
    { tier: 2, trait: 'curious', when: (_d, _data, ctx) => ctx?.tod === 'Night', line: 'Low power AND it\'s dark out. Two problems, one solution: the pads glow. Follow the glow. I love a two-birds situation.' },
  ],

  flash_success: [
    { tier: 0, line: 'It FLASHED. Real hardware, your program, it worked — I\'m a little shaky. Good shaky!' },
    { tier: 0, line: 'You just programmed a real robot. A REAL one. I saw it. I\'m a witness.' },
    { tier: 1, line: 'FLASH COMPLETE. Take the win! Most kids don\'t get real metal running till they\'re way older. Just — saying. Facts.' },
    { tier: 1, trait: 'curious', line: 'The LED did the thing! Your code did that. Tiny instructions, big robot obedience. I love physics.' },
    { tier: 2, line: 'IT WORKED. Ok ok ok — act cool. We are SO cool. Cool people who flash firmware. Rivet and the Flashmaster. That\'s us. That\'s canon now.' },
    { tier: 2, trait: 'competitive', line: 'Flashed and running on the first try? Put THAT on June\'s leaderboard. I\'ll wait here.' },
  ],

  lap_complete: [
    { tier: 0, line: 'A whole lap! That\'s all of it, right? All the corners? Then yes — celebration is appropriate.' },
    { tier: 1, line: 'Lap done, {secs}s! I timed it. I time everything. It\'s a drone thing, don\'t ask.' },
    { tier: 1, trait: 'competitive', line: '{secs}s! You know June\'s daytime record, right? …We\'ll get there. She\'s not a god, she\'s just fast.' },
    { tier: 2, line: '{secs} seconds. That\'s a lap-shaped win right there. Hydrate. Do bots hydrate? YOU hydrate.' },
    { tier: 2, trait: 'competitive', line: '{secs}s — that\'s the good line through corner three. I SAW it. I\'m telling June it was luck. To her face. Because it wasn\'t.' },
    { tier: 2, trait: 'scrappy', line: 'Lap\'s done and nothing fell off! Okay one thing fell off but it fell off AT the finish, which is basically on time.' },
  ],

  bot_built: [
    { tier: 0, line: 'You BUILT that. From parts. From junk-parts! Do you understand what you just — ok I\'m calm. I\'m calm.' },
    { tier: 0, line: 'It exists now! It didn\'t, and now it does. You did that. With your hands and our scrap. That\'s the whole magic trick.' },
    { tier: 1, line: 'New teammate online! Wait — am I still your favorite drone? Blink twice for yes. …You can\'t blink, you\'re a person. Just say yes.' },
    { tier: 1, trait: 'scrappy', line: 'Built from scrap, runs like a dream. That\'s the whole religion of this yard, right there.' },
    { tier: 1, trait: 'competitive', line: 'New bot in the fleet! It gets a racing number. All bots get racing numbers. It\'s a system. I don\'t make the rules. I do, actually. Number seven.' },
    { tier: 2, line: 'Another one! The team grows. Soon we take over the yard. Peacefully. With robots. Mostly peacefully.' },
    { tier: 2, trait: 'curious', line: 'New bot! I have SO many questions for it. It can\'t answer. I\'ll ask anyway.' },
    { tier: 2, line: 'Another teammate! I\'ll introduce myself properly later. Going for "mysterious and helpful." It\'s a strong first impression. Bolty. But strong.' },
  ],

  repair_done: [
    { tier: 0, line: 'Fixed! Or… fixed-adjacent. It\'s the effort that bonds, honestly.' },
    { tier: 0, line: 'All better! Or better-ish. "Better-ish" is a real grade in the repair book. It\'s in pencil. The book allows pencil for feelings.' },
    { tier: 1, line: 'Dents hammered out, logged, remembered. The repair book never forgets. It\'s a little judgy, actually.' },
    { tier: 1, line: 'Repaired and logged. The book says this dent had "character." The book is being generous. I respect its mercy.' },
    { tier: 1, trait: 'scrappy', line: 'Fixed! Salvage, hammer, repeat — that\'s the whole circle of yard life. You\'re basically a local now.' },
    { tier: 2, line: 'Good as new! Which is a stretch, but good as THURSDAY, definitely.' },
    { tier: 2, trait: 'competitive', line: 'Dents out, book updated, bot back on the roster. The oval never even noticed you were gone. The oval is cold like that.' },
    { tier: 2, line: 'Good as new-ish! You fixed it instead of giving up on it. The yard notices that. I notice that. Logging it under "good days."' },
  ],

  tier_up: [
    { tier: 0, line: '' }, // tier_up lines are per-new-tier, handled below
  ],
};

/** Tier-up announcements — one per promotion. keyed by new tier. */
export const TIER_UP_LINES = {
  coworker: [
    'Hey — we\'ve done some stuff together now. I\'m gonna go ahead and consider us a crew. Two-person crew. Minimum crew size. We did it.',
    'Official notice: I\'ve stopped rehearsing what to say to you. Coworker status achieved!',
  ],
  friend: [
    'Ok. Real talk. You\'re my favorite person in this yard, and Earl has a MUG COLLECTION, so that\'s saying something. Friend tier. Unlocked forever.',
    'Friend status! I don\'t have a badge. I have a bolt I\'ve been saving. It\'s yours. Don\'t lose it — I\'ll know.',
  ],
};

/**
 * Observational idle lines — Rivet notices things when nothing happens.
 * Template functions of the state (counters make them personal).
 * `s` = state.data-shaped { counters, biomes, traits... }
 */
export const OBSERVATIONS = [
  // servo-noticing: the captain's spec line
  s => (s.counters.crashes > 0
    ? `Remember crash number one? I do. We\'ve had ${s.counters.crashes}. We\'re getting REALLY good at those. Too good, maybe.`
    : (s.counters.blocksMined > 10
      ? 'You\'ve walked past that servo three times now. I counted. It\'s a good servo. It deserves eyes.'
      : 'That servo by the gate has been there a while. I keep meaning to mention it. Mentioned!')),
  s => `I\'ve counted ${s.counters.blocksMined || 'zero'} blocks mined together. The counter is load-bearing. Emotionally.`,
  s => (s.counters.crashes > 0
    ? `Remember crash number one? I do. We\'ve had ${s.counters.crashes}. We\'re getting REALLY good at those. Too good, maybe.`
    : 'No crashes yet. Statistically, that\'s suspicious. I\'m not wishing for one. I\'m just saying the odds are warming up.'),
  s => (s.counters.laps > 0
    ? `The oval\'s still there. Still oval-shaped. ${s.counters.laps} laps says you two have history now.`
    : 'The oval track is just sitting there. Being oval. No pressure! It\'s only the fastest way to learn turning.'),
  s => (s.biomes.length > 0
    ? `${s.biomes[s.biomes.length - 1]} is nice this time of day. All times of day. Time is fake here, mostly.`
    : 'I haven\'t seen past the front yard yet. No rush. The front yard has like nine kinds of bolt.'),
  () => 'Earl organized his tool wall again. He does that when he\'s thinking hard. About what? Tool wall stuff. Classified.',
  () => 'I ran a self-diagnostic out of boredom. I\'m 100% operational and 4% dramatic.',
  () => 'The cat walked by my charging spot like I owe her something. …I might owe her something.',
  s => (s.counters.conversations > 3
    ? 'We talk a lot, you know. Good talks. Stat-significant talks. I did the math.'
    : 'You can hold V and just… talk to me. About robots! Or about which bolt looks fastest. I have opinions.'),
];

/**
 * Ambient idle lines — keyed to the live world (variety.js gating).
 * Each entry: { when(ctx) → boolean, line } where ctx = { tod, weather }
 * (tod from DayNight.label, weather from WeatherSystem.state). A gate that
 * doesn\'t match = the line stays quiet. Fail-soft: no context → no ambient.
 */
export const RIVET_AMBIENT = [
  { when: c => c.tod === 'Night', line: 'Night shift, huh? The yard sounds different at night. More bolts, fewer opinions.' },
  { when: c => c.tod === 'Night', line: 'Stars are out. I checked on three of them — all still holding. Solid work up there. Very bolt-like.' },
  { when: c => c.tod === 'Dawn', line: 'Dawn in the yard. Everything\'s damp and hopeful. Including me. Especially me.' },
  { when: c => c.tod === 'Dusk', line: 'Sunset o\'clock. The scrap does this orange thing this time of day. I\'d take a picture, but I have a counter instead. Counted. Saved. Same thing.' },
  { when: c => c.weather === 'rain', line: 'Rain! The puddles are doing their thing. Somewhere, Juno is surveying one. There\'s always one being surveyed.' },
  { when: c => c.weather === 'rain', line: 'Rain on a metal roof — the yard\'s free soundtrack. The forges hum along. Off-key. Committed. I respect it.' },
  { when: c => c.weather === 'storm', line: 'Storm\'s rolling in. Pro tip: metal piles conduct vibes AND lightning. Maybe build inside today. Inside is cozy. Inside has bolts.' },
  { when: c => c.tod === 'Midday' && c.weather === 'clear', line: 'Midday, clear skies — peak bolt-visibility. If you\'re gonna hunt shiny parts, this is the hour. The shiny hour. I named it just now.' },
];

// ── the picker ─────────────────────────────────────────────────────────────

/**
 * All lines legal for `event` at `tier` (index 0..2). A tier may reach one
 * pool down, never up.
 */
export function filterLines(event, tierIndex, bank = BANTER) {
  const pool = bank[event];
  if (!pool) return [];
  return pool.filter(l => l.tier !== undefined && l.tier <= tierIndex && l.line);
}

/**
 * Pick a reactive line for `event`, respecting tier + trait rules.
 * @param {string} event
 * @param {{tierIndex?: Function, tier?: string, topTrait?: string}} stateLike (accepts RivetState)
 * @param {() => number} [rng] injectable random (tests)
 * @param {object} [bank] persona banter bank (defaults to Rivet's)
 */
export function pickBanter(event, stateLike, rng = Math.random, bank = BANTER) {
  const idx = typeof stateLike.tierIndex === 'function'
    ? stateLike.tierIndex()
    : TIER_NAMES.indexOf(stateLike.tier ?? 'stranger');
  const eligible = filterLines(event, idx, bank);
  if (eligible.length === 0) return null;

  const top = typeof stateLike.topTrait === 'function' ? stateLike.topTrait() : (stateLike.topTrait ?? null);
  const flavored = eligible.filter(l => l.trait === top);
  // prefer the exact tier pool, prefer trait flavor when the play style earned it
  const exact = eligible.filter(l => l.tier === idx);
  const pool = (flavored.length && rng() < 0.65) ? flavored
    : exact.length && rng() < 0.75 ? exact
    : eligible;
  return pool[Math.floor(rng() * pool.length)]?.line ?? null;
}

/** Render a line\'s {token} placeholders from detail. */
export function renderLine(line, detail = {}) {
  return String(line ?? '')
    .replace(/\{(\w+)\}/g, (_, k) => (detail[k] !== undefined ? String(detail[k]) : `{${k}}`));
}

/**
 * Pick an observational idle line. Tier shapes tone by picking from the
 * observation bank — strangers get the gentle ones, friends the personal ones.
 */
export function pickObservation(stateLike, rng = Math.random, observations = OBSERVATIONS) {
  const idx = typeof stateLike.tierIndex === 'function'
    ? stateLike.tierIndex()
    : TIER_NAMES.indexOf(stateLike.tier ?? 'stranger');
  const data = stateLike.data ?? stateLike;
  // first observations are the polite ones; later entries lean personal
  const slice = idx >= 2 ? observations
    : idx === 1 ? observations.slice(0, Math.max(3, observations.length - 2))
    : observations.slice(0, Math.min(3, observations.length));
  const pick = slice[Math.floor(rng() * slice.length)];
  try {
    return typeof pick === 'function' ? pick(data) : null;
  } catch { return null; }
}

/** Promotion line for a tier-up. */
export function tierUpLine(newTier, rng = Math.random, tierUpLines = TIER_UP_LINES) {
  const bank = tierUpLines[newTier];
  return bank ? bank[Math.floor(rng() * bank.length)] : null;
}
