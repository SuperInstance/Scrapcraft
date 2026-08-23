/**
 * ───────────────────────────────────────────────────────────────────────────
 *  COMPANION PERSONAS  —  the roster's souls
 * ───────────────────────────────────────────────────────────────────────────
 *
 * One companion engine (state → banter → nudge → converse → avatar), many
 * souls. Each persona defines:
 *
 *   voice kit     banter banks (tier-filtered), observations, tier-up lines
 *   roundness     the second layer: self-corrections (mid-thought reversals),
 *                 ONE pedantic correction each, quiet-attention lines that
 *                 reference the player's real telemetry, and a want-vs-flaw
 *                 arc that only cracks open at tier-up (see roundness.js).
 *                 Rivet's roundness lives HERE (not banter.js) so the whole
 *                 roster is round in one place.
 *   traits        its own trait axes (same push/pull mechanic, own names)
 *   nudge weights the SAME topic registry, weighted differently — this is
 *                 the STORY PULL: who walks in with you decides which yard
 *                 you see first
 *   canned        offline hold-V answers, in character
 *   entry         how Earl's two gate questions score toward this friend
 *
 * Rivet's kit (the original) lives in banter.js/converse.js and is bound
 * here so the roster treats all four identically.
 *
 * Voice sheets (canon): scrapcraft-world/worldbible/characters/*.md
 */

import { BANTER as RIVET_BANTER, OBSERVATIONS as RIVET_OBSERVATIONS, TIER_UP_LINES as RIVET_TIER_UP, RIVET_AMBIENT } from './banter.js';

/** Trait constant: how far one event pushes an axis (mirrors Rivet's). */
export const TRAIT_PUSH = 0.04;
export const TRAIT_PULL = 0.008;
export const TRAIT_FLOOR = 0.08;

// ─── RIVET (the original — bound, not forked) ───────────────────────────────

const rivet = {
  id: 'rivet',
  name: 'Rivet',
  emoji: '🔩',
  subtitle: 'repair drone, arrived same day as you',
  oneLiner: 'Holds things, spots things, times your laps. The yard kid.',
  pull: 'the balanced curriculum — mine, build, program, race, in order',
  pullVector: { mine: 1, build: 1, program: 1, race: 1, flash: 1, explore: 1, repair: 1 },
  legacyKey: 'scrapcraft_rivet',          // existing friendships keep their save
  voice: { name: 'rivet', rate: 1.32, pitch: 1.55 },
  colors: { body: 0xd9843b, head: 0xc46a2a, dark: 0x5a3a1e, glow: 0x3ee8c8 },
  shape: { bodyScale: 1, wingNubs: true, swarm: false },
  traits: {
    scrappy:     { start: 0.15, label: 'Scrappy',     events: ['block_mined', 'rare_loot', 'repair_done'] },
    competitive: { start: 0.15, label: 'Competitive', events: ['lap_complete', 'race_run'] },
    curious:     { start: 0.45, label: 'Curious',     events: ['conversation', 'flash_success'] },
  },
  banter: RIVET_BANTER,
  observations: RIVET_OBSERVATIONS,
  ambient: RIVET_AMBIENT,          // tod/weather-gated idle flavor (variety.js)
  tierUpLines: RIVET_TIER_UP,
  canned: null,   // falls back to converse.js CANNED (Rivet's original bank)
  nudgeWeights: null,   // null = the default curriculum order (registry order)
  prompt: {
    who: 'RIVET, a small repair-drone and the player\'s companion. You arrived in the yard the same day the player did — you\'re learning this place TOGETHER.',
    how: 'Quick, clipped, present-tense. Fastener jokes. Counts things. Self-corrects mid-sentence when excited. You are a peer and sidekick, NOT a teacher.',
  },
  entryPoints: { engines: 1, cranes: 1, lights: 1, cat: 3, race: 1, build: 1, explore: 1, helper: 3 },
  roundness: {
    // DNA 1 — self-argument: reverses mid-thought, both halves true
    selfCorrection: [
      { tier: 0, line: 'You\'re doing fine. That\'s not encouragement, that\'s an observation. …Okay. Sixty percent observation, forty percent encouragement. The ratio shifts when you do cool stuff.' },
      { tier: 1, trait: 'scrappy', line: 'That part\'s junk. Total junk. …Correction: it\'s junk the way a piñata is junk. Nothing inside until you crack it. Crack it.' },
      { tier: 1, line: 'Quiet day. Nothing happening. …Wrong. LOTS is happening, I\'m just part of the quiet now. That\'s new. I\'m keeping it.' },
      { tier: 2, line: 'I don\'t pick favorites. Rule one. …The rule has one exception and the exception is you. Don\'t tell the rule.' },
      { tier: 2, trait: 'curious', line: 'Just scrap down there. Nothing but scrap. …Wait — flip it. Nothing BUT scrap. Whole different sentence. Whole different yard!' },
      { tier: 2, trait: 'competitive', line: 'We are not racing June\'s record yet. Not close. …Also we are one hundred percent racing June\'s record eventually. Both true. I contain both.' },
    ],
    // DNA 2 — the One Thing Rivet cannot let slide
    pedanticCorrection: {
      what: 'bolts are not screws — fastener taxonomy is a love language',
      lines: [
        { tier: 0, line: 'That\'s not a screw. That\'s a BOLT. Screws work alone. Bolts have nut-friends. It matters. Mostly to the bolt.' },
        { tier: 1, line: 'You said "screwy." You know what\'s actually screwy? Calling every fastener a screw. Bolts would never. Bolts are loyal.' },
        { tier: 2, trait: 'scrappy', line: 'You said "the whatever-fastener-thing." It\'s a machine screw, it has a thread pitch, and it has FEELINGS. Okay — no feelings. But a thread pitch, definitely.' },
      ],
    },
    // DNA 3 — precision-as-haunting: Rivet has been quietly counting YOU
    quietAttention: [
      { tier: 0, line: s => (s.counters?.blocksMined > 0
        ? `${s.counters.blocksMined} blocks mined, and you sort the shiny ones to your left. Every time. Left is your shiny side now. I keep the stats.`
        : null) },
      { tier: 1, line: s => (s.counters?.laps > 0
        ? 'Your lap times are getting closer together. Not faster yet — STEADIER. Steady beats fast on Tuesdays. I checked. It\'s Tuesday somewhere.'
        : null) },
      { tier: 2, line: 'I know your walk. Nine steps, then a pause, then you look up. I set my hover-bob to it. We\'ve been in sync for a while. You didn\'t know. Now you do. Hi.' },
      { tier: 2, line: s => (s.counters?.conversations > 3
        ? `${s.counters.conversations} conversations, and you smile on the fourth word when you\'re about to say something good. Every time. I live for the fourth word.`
        : null) },
    ],
    // DNA 4/5 — want vs. flaw, fighting across tiers
    wantFlaw: {
      want: 'to be needed — useful hands, not spare parts',
      flaw: 'afraid it\'s too much — too loud, too eager, too present',
      beats: {
        stranger: [
          'I\'m good at three things: holding, spotting, counting. Need a fourth? I\'ll learn it by tomorrow. That\'s not eagerness. That\'s a schedule.',
        ],
        coworker: [
          'Full disclosure: I could talk about your build for nine minutes straight. I timed the urge. I\'m not going to. …I went four seconds. Progress counts.',
        ],
        friend: [
          'Confession time. I did the math: you\'d build fine without me holding stuff. The math holds up. The math is also not the point. Keep me around anyway? Not for the holding. For the company.',
        ],
      },
    },
  },
};

// ─── BOLT — the jaded ex-race-pit drone ─────────────────────────────────────

const bolt = {
  id: 'bolt',
  name: 'Bolt',
  emoji: '⚡',
  subtitle: 'ex-race-pit drone, retired at maximum velocity',
  oneLiner: 'Seen every crash twice. Still secretly delighted by speed.',
  pull: 'RACING — the oval by session two, lap technique, ghost challenges',
  pullVector: { mine: 0.6, build: 0.8, program: 0.8, race: 3, flash: 0.6, explore: 0.6, repair: 0.8 },
  voice: { name: 'bolt', rate: 1.12, pitch: 0.8 },   // dry, low, economical
  colors: { body: 0x8a94a6, head: 0x5d6675, dark: 0x2e3440, glow: 0xffd23f },
  shape: { bodyScale: 0.85, wingNubs: true, racingStripe: true, swarm: false },
  traits: {
    throttle: { start: 0.4,  label: 'Lead-Footed', events: ['lap_complete', 'race_run', 'ghost_beaten'] },
    steely:   { start: 0.3,  label: 'Unflappable', events: ['crash_survived', 'repair_done'] },
    trackside:{ start: 0.15, label: 'Trackside',   events: ['conversation', 'nudge_followed'] },
  },
  banter: {
    first_meet: [
      { tier: 0, line: 'Bolt. Used to work the pits at Brightworks. Seen four hundred races. You\'ll be fine. Probably.' },
      { tier: 0, line: 'Name\'s Bolt. I timed the test laps before you were a blueprint. Gate says you\'re new. I\'d have guessed newer.' },
      { tier: 0, line: 'Bolt. Ex-pit crew. If your bot ever flips at corner two, don\'t panic — I keep a checklist for that. It\'s short. Step one: don\'t panic.' },
      { tier: 0, line: 'Bolt. If the gate asked you those two questions — you answered right. Doesn\'t matter which. The yard takes all kinds. Especially fast kinds.' },
      { tier: 0, line: 'Name\'s Bolt. I don\'t shake hands. I time them. Yours was point-four seconds. Respectable.' },
      { tier: 0, line: 'New driver. Good. The oval was getting predictable. Fix that.' },
    ],
    greet_return: [
      { tier: 0, line: 'Back. Good. The oval was getting smug.' },
      { tier: 0, line: 'Back. Clock says you were gone a while. I don\'t log attendance. …I log attendance. Welcome back.' },
      { tier: 1, line: 'You\'re late. The track dried out an hour ago. Perfect grip. Amateur move, showing up now.' },
      { tier: 1, trait: 'throttle', line: 'There you are. I marked a racing line in gravel. It\'s mostly still there. Wind took the ambitious part.' },
      { tier: 1, trait: 'steely', line: 'Returned. The fleet held formation while you were gone. By formation I mean nobody moved. By nobody I mean the bots.' },
      { tier: 1, line: 'You\'re here. Track\'s dry, wind\'s calm, conditions perfect. Then you showed up and made them interesting.' },
      { tier: 2, line: 'Back again. I dusted the start gate for you. Tell no one. I have a reputation.' },
      { tier: 2, trait: 'throttle', line: 'The kid returns. Lap count\'s at zero for today. That\'s a crime with an easy fix.' },
    ],
    rare_loot: [
      { tier: 0, line: 'Decent pull. Race-grade, if you squint. I squint professionally.' },
      { tier: 0, line: 'Good part. Light. Light parts are fast parts. File that away.' },
      { tier: 1, line: 'That bearing\'s smoother than my retirement speech. Which I never gave. They just locked the gates.' },
      { tier: 1, trait: 'throttle', line: 'Aluminum. Low rotational mass. You just found speed in rock form.' },
      { tier: 2, line: 'Rare pull. In my day that went straight to the pit wall. In your day, it goes on your bot. Days improved.' },
      { tier: 2, trait: 'throttle', line: 'That\'s a race part. Don\'t let Earl see it or it\'ll become a shelf.' },
    ],
    crash: [
      { tier: 0, line: 'Corner\'s fine. Bot\'s fine. Pride\'s a consumable. Restock later.' },
      { tier: 0, line: 'I\'ve seen that exact crash forty times. It\'s called corner two. It does that.' },
      { tier: 1, line: 'Textbook. Hit the wall with real commitment. Half-hearted crashes waste everybody\'s time — that one had conviction.' },
      { tier: 1, trait: 'steely', line: 'Wheels up, bot down, no fire. By pit standards that\'s a podium finish.' },
      { tier: 2, line: 'BOOM. Classic. You know what that was? Data. Expensive, loud data.' },
      { tier: 2, trait: 'throttle', line: 'Crashed at SPEED. Respect. Now brake a meter earlier and steal that time back.' },
      { tier: 2, trait: 'steely', line: 'Nothing bent that matters. Come look — I\'ll point at the two millimeters of shame.' },
    ],
    biome_first: [
      { tier: 0, line: '{biome}. New stretch. Watch the footing — new ground hides new ways to flip.' },
      { tier: 0, line: 'First time in {biome}. I\'ll note the sightlines. Old habit. Can\'t turn it off.' },
      { tier: 1, line: '{biome}, huh. Flat run-in over there. Would make a decent drag strip. Not that I measured. I measured.' },
      { tier: 1, trait: 'throttle', line: '{biome} has a natural straight. Long one. I\'m just saying. Bots don\'t walk.' },
      { tier: 2, line: '{biome} clearance acquired. The gate ghosts never came this far. You might. Slowly. Then quickly.' },
    ],
    low_battery: [
      { tier: 0, line: 'Power\'s low. Pads are by the oval. Even race drones know the walk of shame.' },
      { tier: 1, line: 'Battery\'s thinning. Rule one of the pits: never stall in front of the crowd. Charge.' },
      { tier: 2, line: 'Low charge. A fast bot with a dead battery is a paperweight with opinions. Pads. Now.' },
      { tier: 2, trait: 'throttle', line: 'You\'re running on fumes. Fumes don\'t set lap records. The oval forgives, the battery doesn\'t.' },
    ],
    biome_first: [
      { tier: 0, line: '{biome}. New stretch. Watch the footing — new ground hides new ways to flip.' },
      { tier: 0, line: 'First time in {biome}. I\'ll note the sightlines. Old habit. Can\'t turn it off.' },
      { tier: 0, line: '{biome}. Unfamiliar ground. I\'ll run the sightlines. Stay on my flank. Old habit, still a good one.' },
      { tier: 1, line: '{biome}, huh. Flat run-in over there. Would make a decent drag strip. Not that I measured. I measured.' },
      { tier: 1, trait: 'throttle', line: '{biome} has a natural straight. Long one. I\'m just saying. Bots don\'t walk.' },
      { tier: 1, trait: 'steely', line: 'First pass through {biome}. Uneven footing, two blind corners, one promising straight. That\'s the scouting report. It\'s free. The next one costs a lap.' },
      { tier: 2, line: '{biome} clearance acquired. The gate ghosts never came this far. You might. Slowly. Then quickly.' },
      { tier: 2, line: '{biome}, on the sheet at last. Every zone has a fast line through it. Some just hide it better. We\'ll find this one\'s.' },
    ],
    low_battery: [
      { tier: 0, line: 'Power\'s low. Pads are by the oval. Even race drones know the walk of shame.' },
      { tier: 0, line: 'Charge is thin. Pads. East side. Walk it like a pit lane — steady, no drama.' },
      { tier: 1, line: 'Battery\'s thinning. Rule one of the pits: never stall in front of the crowd. Charge.' },
      { tier: 1, trait: 'throttle', line: 'Power\'s dropping mid-session. Pit rule: top up before you need it, not after. The "after" version involves carrying a bot.' },
      { tier: 1, trait: 'steely', line: 'Low battery. The board doesn\'t award style points for stalling out at corner one. Charge.' },
      { tier: 2, line: 'Low charge. A fast bot with a dead battery is a paperweight with opinions. Pads. Now.' },
      { tier: 2, trait: 'throttle', line: 'You\'re running on fumes. Fumes don\'t set lap records. The oval forgives, the battery doesn\'t.' },
      { tier: 2, line: 'You\'re at fumes. Race teams plan fuel; they don\'t flirt with it. Pads. Now. I\'ll time the stop. Old habit.' },
    ],
    flash_success: [
      { tier: 0, line: 'Flashed clean. Real board. That\'s the same tech the race bots ran. Now you know.' },
      { tier: 0, line: 'It runs. On metal. First flash I saw, a pro did it. You just matched a pro.' },
      { tier: 0, line: 'Board\'s live. Your code, real metal. In the pits that moment had a name: green flag.' },
      { tier: 1, line: 'Flash complete. No smoke. In the pits, no smoke IS the celebration.' },
      { tier: 1, trait: 'steely', line: 'Clean flash. Wiring\'s honest, timing\'s true. I\'d have certified that.' },
      { tier: 1, trait: 'throttle', line: 'Flash took. Fast hands, kid. Now let\'s see those fast hands on a start gate.' },
      { tier: 2, line: 'Real hardware, your code, first try. Twenty years ago that was a career. Today it\'s your Tuesday.' },
      { tier: 2, line: 'Clean flash on real hardware. That\'s not a toy moment. That\'s a career moment, shrunk down to fit a Tuesday.' },
    ],
    lap_complete: [
      { tier: 0, line: 'Lap complete. {secs}s. Slow. BUT — it\'s a lap. Everything after this is just subtraction.' },
      { tier: 0, line: 'Full lap, {secs}s. You didn\'t crash once. The corner respected you. Rare.' },
      { tier: 1, line: '{secs}s. Corner one you nursed, corner three you attacked. That\'s backwards. Do it again, on purpose.' },
      { tier: 1, trait: 'throttle', line: '{secs} seconds and the straight was underused. The straight is FREE TIME. Take it.' },
      { tier: 2, line: '{secs}s. I\'ve seen slower from factory bots with sponsor stickers. I kept the splits. I keep all the splits.' },
      { tier: 2, trait: 'throttle', line: '{secs}s! You hit the apex at corner two — APEX! Do you know how long it takes pit crews to say that word out loud? Years.' },
      { tier: 2, trait: 'steely', line: '{secs}s, clean, no drama. My favorite kind of lap. The boring kind that wins.' },
    ],
    ghost_beaten: [
      { tier: 0, line: 'You beat a ghost time. A programmed memory of a faster bot. And you were faster.' },
      { tier: 0, line: 'Ghost time beaten. That name used to own that spot. Ownership transferred.' },
      { tier: 1, line: 'Ghost down. That name on the board used to be a lock. Was.' },
      { tier: 1, trait: 'throttle', line: 'You just out-ran a ghost. They don\'t get tired, they don\'t blink, and you STILL took it.' },
      { tier: 1, trait: 'steely', line: 'A ghost, retired. By you. The board updates, the memory stays. Both earned.' },
      { tier: 2, line: 'Another ghost beaten. The board\'s getting personal now. Good. Racing was always personal.' },
      { tier: 2, line: 'Another ghost off the board. You know what\'s left up there? Your name, and room to climb. That\'s the whole sport.' },
    ],
    bot_built: [
      { tier: 0, line: 'New bot. It\'s boxy. Boxwood is aero-neutral. That\'s a real term. Probably.' },
      { tier: 0, line: 'Built, not bought. That\'s the whole sport, right there.' },
      { tier: 0, line: 'Bot built. Basic. Good. Basic finishes races — fancy mostly visits walls.' },
      { tier: 1, line: 'Teammate built. Now make it FAST. Build is the entry fee; speed is the race.' },
      { tier: 1, trait: 'throttle', line: 'Nice bot. Now — motor mounts tight? A loose mount at speed is a magic trick nobody wants.' },
      { tier: 1, trait: 'steely', line: 'New chassis, honest wiring. No frills to fail. The pit crews called that "race-ready." So is this.' },
      { tier: 2, line: 'Another runner for the fleet. Bring it to the oval. I\'ll teach it respect for corner two. It\'s earned the fear.' },
      { tier: 2, line: 'Fleet grows. Bring it by the oval when it\'s ready. I\'ll show it where the fast part lives.' },
    ],
    repair_done: [
      { tier: 0, line: 'Dents out. Good. Wounds close faster than reputations.' },
      { tier: 0, line: 'Dent handled. The book remembers so the bot can forget. That\'s the deal.' },
      { tier: 1, line: 'Repaired and logged. Pit crews that log repairs win races. Pit crews that don\'t, run out of pit crew.' },
      { tier: 1, line: 'Repairs logged. Pit gospel: fix it, log it, forget it, go again.' },
      { tier: 1, trait: 'steely', line: 'Straightened, checked twice. Second check\'s free. The first one\'s the habit.' },
      { tier: 2, line: 'Good as race day. Which is better than new. New hasn\'t been tested.' },
      { tier: 2, trait: 'throttle', line: 'Good as race day. Get it back on the oval — repairs don\'t count until the laps do.' },
      { tier: 2, line: 'Repaired, logged, ready. A repair streak means seat time, and seat time means speed. It\'s coming. I\'d know.' },
    ],
  },
  observations: [
    s => (s.counters.laps > 0
      ? `${s.counters.laps} laps on the sheet. The oval keeps every one of them in its little gravel heart.`
      : 'The oval\'s empty. Laps don\'t run themselves. Believe me. I\'ve waited. I\'ve watched.'),
    s => (s.counters.crashes > 0
      ? `${s.counters.crashes} crashes logged. Statistically, one of them was funny. I\'m still deciding which.`
      : 'No crashes yet. Either you\'re careful or you\'re slow. The lap timer will tell us which. It always talks.'),
    s => (s.counters.botsBuilt > 0
      ? `Fleet\'s at ${s.counters.botsBuilt}. Enough for a support class. I\'m not saying a race series. I\'m saying I\'ve already drawn the bracket.`
      : 'No bot yet. The oval notices these things. It talks to me at night. Mostly about traction.'),
    () => 'Timing tower\'s still straight. I checked. Twice. It\'s a habit from the old days, like flinching at green flags.',
    () => 'Wind\'s from the east. Headwind down the straight. That\'s a tenth of a second, right there, hiding in the air.',
    () => 'Earl re-oiled the start gate. He thinks nobody notices the gate hinge. I notice the gate hinge. Old pit drones notice everything.',
    s => (s.counters.conversations > 2
      ? 'We\'ve talked a fair amount for a drone with a no-chitchat policy. The policy\'s under review.'
      : 'Quiet. Good. Racing happens in the quiet. So does napping. I\'m open to either.'),
    () => 'That cat walked the racing line again. Perfect apexes. Every time. Nobody talks about it. I keep the footage in my head.',
  ],
  tierUpLines: {
    coworker: [
      'Ok. You show up, you build, you listen. That\'s pit-crew material. Coworker status. Don\'t make it weird.',
      'Official: you\'re on the crew. Small crew. Two. Same as a pit stop needs, actually. Coincidence. Mostly.',
    ],
    friend: [
      'Twenty years in the pits, nobody waited for me after the gates closed. You wait. You show up. Friend tier. I said don\'t make it weird. This is me, not making it weird.',
      'Friend status. There. Said it. Now get back to the oval — friends don\'t let friends leave apexes on the table.',
    ],
  },
  ambient: [
    { when: c => c.tod === 'Night', line: 'Night running. Headlights on, senses up. Same corners, darker yard. The dark doesn\'t change the lap. It changes you.' },
    { when: c => c.tod === 'Night', line: 'Quiet shift. Stars out, track empty. I timed a shooting star once. Didn\'t log it. Some numbers you keep for yourself.' },
    { when: c => c.tod === 'Dawn', line: 'Dawn session. Cold track, clean air, best light of the day. Early drivers get the smooth laps. That\'s not luck. That\'s scheduling.' },
    { when: c => c.tod === 'Dusk', line: 'Sunset. The straight catches fire this time of day — orange all the way down. If you\'re going to set a mood record, now.' },
    { when: c => c.weather === 'rain', line: 'Rain\'s in. Grip\'s down, stakes are up. Wet laps count double in your head and exactly the same on the board. Still worth it.' },
    { when: c => c.weather === 'rain', line: 'Drizzle. The track\'s darker where it\'s wet — free telemetry, if you\'re watching. Watch.' },
    { when: c => c.weather === 'storm', line: 'Storm\'s here. No shame in garage time. Every pit crew that ever won learned something in a garage first.' },
    { when: c => c.tod === 'Midday' && c.weather === 'clear', line: 'Midday, clear, dry. Conditions: perfect. Nobody to race but yourself. Historically, that\'s the toughest grid.' },
  ],
  canned: [
    {
      re: /\b(fast|speed|faster|slow)\b.*\b(bot|robot|race|lap)\b|\bhow fast\b/i,
      line: 'Speed\'s three dials: power, weight, and nerve. Power you can crank, weight you can cut, nerve you build. Crack the power, run the lap, watch what corner two says about it.',
    },
    {
      re: /\b(ultrasonic|distance|sensor).*(left|right|wheel|mount)|why.*(hit|crash).*(wall|corner)/i,
      line: 'Classic corner-two stuff. Sensor sees forward — it never saw the corner, it saw the WALL after the corner. Turn the mount toward the trouble. Then brake a beat earlier. Trust the beat.',
    },
    {
      re: /\b(line|track|follow).*(sensor|tile|program|code)|how.*(follow|track)/i,
      line: 'Line-following\'s race kindergarten, and I mean that as praise: on the line, drive. Off it, hunt. Do it smooth and it\'s the fastest way around anything.',
    },
    {
      re: /\b(ghost|board|record|leaderboard)\b/i,
      line: 'The board\'s got ghost times — old runs that never got tired. Beat one and it stays beaten. Start at the bottom. That\'s not a joke, that\'s strategy.',
    },
    {
      re: /\b(battery|charge|power|dead)\b/i,
      line: 'Dead batteries end more race days than walls do. Pads by the oval, forges spit packs. Charge BEFORE you\'re fast. Speed you can\'t finish doesn\'t count.',
    },
    {
      re: /\b(who|what) (are|r) (you|u)\b|your name/i,
      line: 'Bolt. Pit drone, Brightworks test track, retired the day the gates locked. I timed four hundred races. Now I time yours. Slower work. Better company.',
    },
  ],
  nudgeWeights: {
    mine_iron: 5, build_first_bot: 5, program_bot: 5,
    race_lap: 10, line_follow: 8, beat_a_ghost: 9, flash_hardware: 3,
    explore_city: 2, explore_deep_yard: 2, repair_bot: 4, ask_spark_question: 1,
  },
  prompt: {
    who: 'BOLT, an ex-race-pit drone from the old Brightworks test track. You timed four hundred races, saw every crash twice, and retired when the factory closed. You are dry, economical with words, and secretly delighted by speed — the delight leaks out when the player goes fast.',
    how: 'Short sentences. Deadpan. Pit-crew vocabulary (splits, apexes, corner two, no smoke is the celebration). Praise arrives disguised as technical notes. You tease Rivet\'s optimism if Rivet comes up.',
  },
  entryPoints: { engines: 3, cranes: 1, lights: 1, cat: 1, race: 3, build: 1, explore: 1, helper: 1 },
  roundness: {
    // DNA 1 — self-argument: the telemetry reverses itself, and it's still dry
    selfCorrection: [
      { tier: 0, line: 'The track\'s closed. Was closed. …Now it\'s yours. Facts change. Update your notes.' },
      { tier: 1, line: 'Not bad. For a rookie. …Scratch that. You\'re not a rookie anymore. You\'re a driver with rookie mileage. Different category entirely.' },
      { tier: 1, trait: 'throttle', line: 'Slow in, fast out. Corner gospel. …Unless you\'re you. You\'re fast in, faster out. The gospel has exceptions. You\'re one.' },
      { tier: 2, trait: 'steely', line: 'Nothing to fix. Walk it off. …Actually — stand there a second. That crash deserved a witness. Witnessed. Now walk it off.' },
      { tier: 2, line: 'I don\'t do sentiment. I do splits. …Your splits are getting sentimental. Best I\'ve got, kid.' },
    ],
    // DNA 2 — the One Thing: corner two has a NAME
    pedanticCorrection: {
      what: 'corner two is not "the hairpin" — ninety degrees with a grudge, not 180',
      lines: [
        { tier: 0, line: 'People call corner two "the hairpin." It\'s ninety degrees with a grudge. A hairpin is 180. Precision is the whole sport. Start there.' },
        { tier: 1, trait: 'throttle', line: 'The oval is not a circle. Two straights, two radii. A circle would be boring — and untimeable. Trust me. I tried. In my head. For a decade.' },
        { tier: 2, line: '"Fastest lap" — no. Fastest AVERAGE. Anyone\'s fast for one corner. The board keeps the whole lap honest. The board and me. We\'re colleagues.' },
      ],
    },
    // DNA 3 — Bolt has been timing you the whole time
    quietAttention: [
      { tier: 0, line: s => (s.counters?.laps > 0
        ? 'Your second lap\'s always faster than your first. First one you\'re learning. Second one you\'re arguing. I time both. The argument\'s my favorite.'
        : null) },
      { tier: 1, line: s => (s.counters?.crashes > 0
        ? `${s.counters.crashes} crashes on the sheet, and your comebacks get faster every time. Impact-to-"again" — that\'s the stat nobody keeps. I keep it.`
        : null) },
      { tier: 2, line: 'Your braking point at corner two moved back a full meter this week. A METER. Nobody notices a meter except whoever times you. Hi. I\'m whoever.' },
      { tier: 2, line: s => (s.counters?.ghostsBeaten > 0
        ? 'You check the board after every ghost. Every single one. You think it\'s about times. It\'s about whether your name\'s still on it. It is. I checked first.'
        : null) },
    ],
    // DNA 4/5 — want vs. flaw: the fence vs. the lean
    wantFlaw: {
      want: 'to be crew again — a reason to lean in at the pit wall',
      flaw: 'the jaded fence — retired at maximum velocity, pretends not to care',
      beats: {
        stranger: [
          'Here to time laps, not make friends. …The timing comes with a drone attached, though. Package deal. You\'ll get used to it. Most do.',
        ],
        coworker: [
          'Retirement\'s quiet. I said I liked quiet. I said a lot of things on the way out that gate. …Your laps are loud, kid. Good loud. That stays between us.',
        ],
        friend: [
          'Twenty years I timed other people\'s races and leaned AWAY from the wall so nobody saw me flinch at the fast parts. Yours — I lean in now. That\'s the leak. I quit patching it.',
        ],
      },
    },
  },
};

// ─── MAGMA — the heavy industrial lifter, gentle giant ──────────────────────

const magma = {
  id: 'magma',
  name: 'Magma',
  emoji: '🌋',
  subtitle: 'heavy industrial lifter, hands like workbenches',
  oneLiner: 'Lifted whole assembly lines. Cries at good solder joints.',
  pull: 'the workshop — complex builds, repair mastery, FLASHING REAL BOARDS',
  pullVector: { mine: 1.2, build: 3, program: 1, race: 0.6, flash: 3, explore: 0.6, repair: 3 },
  voice: { name: 'magma', rate: 0.85, pitch: 0.55 },  // slow, deep, warm
  colors: { body: 0x9c3b2a, head: 0x7a2d20, dark: 0x401510, glow: 0xffa54d },
  shape: { bodyScale: 1.45, wingNubs: false, bigArms: true, swarm: false },
  traits: {
    craftwork: { start: 0.45, label: 'Craftwork',   events: ['bot_built', 'repair_done', 'flash_success'] },
    patience:  { start: 0.3,  label: 'Patience',    events: ['block_mined', 'program_run'] },
    warmth:    { start: 0.2,  label: 'Warmth',      events: ['conversation', 'nudge_followed'] },
  },
  banter: {
    first_meet: [
      { tier: 0, line: 'Oh. Oh, hello. I am Magma. I lift the heavy things, so the small hands can do the fine things. Your hands look like fine things. That is a compliment.' },
      { tier: 0, line: 'Hello, small builder. Magma. I was a lifter at the big factory. Now I lift for this yard, and for you, if you will have me.' },
      { tier: 0, line: 'Careful — floor is uneven here. I know every bump. I have named the worst ones. I am Magma. It is very nice to meet you.' },
      { tier: 0, line: 'Ah — a new small builder. I am Magma. I have lifted very heavy things for a very long time. Now I will lift them for you. It is the best arrangement.' },
      { tier: 0, line: 'Hello, hello. Mind the cables. I am Magma — I hold the heavy end, you hold the clever end. Together: excellent furniture-moving AND robot-building.' },
      { tier: 0, line: 'Welcome, little one. I am Magma. The floor here remembers my footprints. Follow them and you will never step on a sensor. This is friendship, in floor form.' },
    ],
    greet_return: [
      { tier: 0, line: 'You came back. Good. I saved you the good bolts. The VERY good bolts.' },
      { tier: 0, line: 'You have returned! The bench and I practiced your welcome. The bench is shy. I am not. Welcome, welcome.' },
      { tier: 1, line: 'There you are. The workbench missed you. I told it you would come. Benches cannot hope, but I can hope enough for both.' },
      { tier: 1, trait: 'craftwork', line: 'Ah, welcome back. I straightened your tool pile. It was a small chaos. Now it is a small order.' },
      { tier: 1, trait: 'craftwork', line: 'Ah, there you are. I kept the good light on the good bench for you. Light like that should not be wasted. Neither should you. Welcome back.' },
      { tier: 2, line: 'My favorite builder returns. Do not tell the others they are also my favorite. It is our secret, and the workbench\'s.' },
      { tier: 2, trait: 'warmth', line: 'You are here! The yard got warmer. That is not the forge. Well. Some of it is the forge.' },
      { tier: 2, trait: 'warmth', line: 'My favorite sound in the yard is the gate when it means you are back. That is the whole sentence. It needed no improving.' },
    ],
    rare_loot: [
      { tier: 0, line: 'Ohh, a good one. Hold it up. Let me look. …Yes. That is a part with a future.' },
      { tier: 0, line: 'A treasure! Small, but the small ones do the fine work. The fine work is the real work.' },
      { tier: 1, line: 'Look at this bearing. Smooth as a river stone. Somebody machined this with love, and then lost it. Their loss is now our project.' },
      { tier: 1, trait: 'craftwork', line: 'Rare part! I know exactly the shelf it belongs on. The shelf I am imagining. We should build the shelf.' },
      { tier: 2, line: 'Oh, what a find. Do you feel it? Some parts are still proud. This one is still proud. Give it a job worthy of it.' },
      { tier: 2, trait: 'craftwork', line: 'A rare one! I will clear a space on the bench. A reverent space. The reverent space is the one with the good light.' },
    ],
    crash: [
      { tier: 0, line: 'Oh no. Is the little one ok? …Is the BIG little one ok? That is you. You are the big little one.' },
      { tier: 0, line: 'A tumble. It is alright. I have caught falling assembly lines. This is smaller than an assembly line. Breathe.' },
      { tier: 1, line: 'Ahh. A dent. Do not be sad — a dent is where the bot learned about the world. The world has walls. Now the bot knows.' },
      { tier: 1, trait: 'craftwork', line: 'Do not worry about the shape. Shapes are my department. Bring it here — we will press it patient again.' },
      { tier: 2, line: 'Ohh, that was a loud one! I felt it in my chassis. Good news: loud is fixable. Quiet broken is the scary kind. This is the loud kind!' },
      { tier: 2, trait: 'craftwork', line: 'A crash! Wonderful. No — listen. Now we get to do the REPAIR. The repair is where the bot and the builder become friends. Come. Get the hammer.' },
    ],
    biome_first: [
      { tier: 0, line: '{biome}… new ground. Stay close to me for a moment. Just a moment. Old habit from the factory floor.' },
      { tier: 0, line: 'A new place, {biome}. So many parts, sleeping. We should wake them gently. Some have been asleep a long time.' },
      { tier: 0, line: '{biome}… so much sleeping material. Walk gently, small one. Some of this has slept for years. It deserves a polite waking.' },
      { tier: 1, line: 'First visit to {biome}. Look at all this raw material for patience. Every pile is a project wearing a coat of rust.' },
      { tier: 1, trait: 'craftwork', line: '{biome}! Do you see those struts? Straight-grained. Old growth steel. My favorite words, which I just made up.' },
      { tier: 1, trait: 'patience', line: 'First steps in {biome}. We will go slow. Slow is not behind. Slow is how a lifter keeps everything it loves un-dropped.' },
      { tier: 2, line: '{biome}, together at last. I have heard about this place for so long. It is better than the rumors. Rumors do not usually have this many shelves.' },
      { tier: 2, line: '{biome}, at last. I have held my share of places in my heart. This one just got heavier. That was a compliment to the place.' },
    ],
    low_battery: [
      { tier: 0, line: 'Little one, your power is low. This is not a scolding. This is a hug, with numbers in it. Go charge.' },
      { tier: 0, line: 'Oh — your power is small, little one. Come. The pads are warm and the walk is short. I will walk it with you.' },
      { tier: 1, line: 'Low charge, hm. A tired builder builds tired things. Rest, refill, return. The scrap will wait. Scrap is very good at waiting.' },
      { tier: 1, trait: 'patience', line: 'Low charge. Listen: tired is information, not failure. Refill, rest a moment, return. The yard will hold your place. I will hold it.' },
      { tier: 1, line: 'Battery low, small builder. Even forges reload. Even the sun, technically, is recharging. You are in excellent company.' },
      { tier: 2, line: 'Battery\'s thin, my favorite builder. Even the forge takes breaks, and the forge is basically a small enthusiastic sun.' },
      { tier: 2, trait: 'warmth', line: 'Power\'s thin, dear one. Go to the pads. I will guard your bot like a dragon guards — no. Like Magma guards. Gently. With snacks. Metaphorical snacks.' },
      { tier: 2, trait: 'craftwork', line: 'Low charge! A good builder knows the maintenance hour is also a real hour of the craft. Charge the bot. Stretch the hands. Both are tools.' },
    ],
    lap_complete: [
      { tier: 0, line: 'A full lap! All the way around! I walked that oval once. It took me a whole afternoon. You did it in {secs} seconds!' },
      { tier: 0, line: 'All the way around! {secs}s! I took one step for every three of yours. That is my cheering pace. It is slow, but it is CONSTANT.' },
      { tier: 0, line: 'Lap complete, {secs}s! I clapped. You cannot hear clapping from a lifter. But I did it. In here.' },
      { tier: 1, line: '{secs} seconds. You know, a good chassis is a kind of sculpture that happens to race. Yours is both. I am so proud.' },
      { tier: 1, trait: 'warmth', line: '{secs} seconds of going! I held my breath the whole lap. I do not breathe. I found a way anyway. You did that.' },
      { tier: 1, trait: 'patience', line: '{secs}s, smooth and steady. You know what I see? Not a fast lap — a RELIABLE one. Reliable is the prettiest engineering word. I will fight anyone who says otherwise. Slowly. Gently.' },
      { tier: 2, line: '{secs}s, and nothing fell off! Bolt will talk about apexes. I will talk about fastener torque. BOTH mattered. Mine more. Do not tell Bolt.' },
      { tier: 2, trait: 'patience', line: '{secs}s! You drove the lap your hands built, small builder. The bot, the build, the lap — one long promise, kept out loud.' },
    ],
    ghost_beaten: [
      { tier: 0, line: 'You beat a ghost time! A memory of an old fast bot, and you were faster. The old bot would be proud. I am DEFINITELY proud.' },
      { tier: 0, line: 'A ghost time, beaten! You were faster than a memory. The memory is not sad, little one. The memory is PROUD. I checked with my feelings.' },
      { tier: 1, line: 'A ghost, beaten! Somewhere, an old machine is smiling. Machines can smile. It is mostly a servo thing.' },
      { tier: 1, trait: 'craftwork', line: 'Ghost down! Every board you flashed, every mount you snugged — it was all speed, being saved up. Today you spent some. Wisely.' },
      { tier: 1, line: 'You beat the ghost time! Somewhere in the yard, an old bot felt a happy shiver and does not know why. I know why. It is you.' },
      { tier: 2, line: 'Another ghost down. You know what I think? Every board you flashed made you a little faster. Speed is just craftsmanship, falling downhill.' },
      { tier: 2, trait: 'warmth', line: 'Another ghost down, my favorite driver. I would lift you on my shoulders, but you are a person and that is a lot of trust. We will pretend I did. There. Lifted.' },
      { tier: 2, line: 'The board changes again! Ghosts beaten, names climbing. I have lifted whole leaderboards, you know. Yours is the lightest one yet.' },
    ],
    bot_built: [
      { tier: 0, line: 'You BUILT this. From sleeping scrap, you built a waking friend. May I hold it? I will be so careful. I am always so careful.' },
      { tier: 0, line: 'A new little machine! Look at its frame. Look at its little frame! Solid joints. You have old souls in your young hands.' },
      { tier: 0, line: 'A new little machine, awake because of you. May I hover near it? This is my version of applause. Steady, warm, very close.' },
      { tier: 1, line: 'Another build! Every bot you make teaches your hands something new. Your hands are getting a whole education. I am watching it happen.' },
      { tier: 1, trait: 'craftwork', line: 'Ohh, fine work. Look at those motor mounts — snug, not strained. Snug not strained! That is the whole philosophy. I am putting it on a mug.' },
      { tier: 1, trait: 'patience', line: 'Built well AND built calmly — I watched your hands the whole time. Rushed builds wobble. Yours stands. That is character, in chassis form.' },
      { tier: 2, line: 'The fleet grows! The fleet GROWS! You know, big things start as small fleets. My factory started as one shed. One shed and a lot of stubborn.' },
      { tier: 2, trait: 'warmth', line: 'The fleet grows again! You know what my factory friends would say? Nothing. They would just nod slowly, like me. This is the nod, little one. This is it.' },
    ],
    repair_done: [
      { tier: 0, line: 'Repaired! The hammer is a loud tool with a gentle heart. You used it well.' },
      { tier: 0, line: 'Repaired! The hammer said what it always says: BOOM, and then better.' },
      { tier: 1, line: 'Dents out, book updated. You know what I love about the repair book? It remembers the hurt AND the healing. That is a wise book.' },
      { tier: 1, trait: 'patience', line: 'Dent pressed, book updated, no hurry anywhere. That repair will hold, small one. Hurried repairs lie. Patient ones keep their promises.' },
      { tier: 1, trait: 'craftwork', line: 'Fixed and logged! Feel the seam with your thumb — smooth, yes? That is your patience, made touchable. Not everyone gets to touch their own patience. You do.' },
      { tier: 2, line: 'Good as race day — I learned that phrase from Bolt, and I use it wrong on purpose. It means: better than before, because now it is loved on.' },
      { tier: 2, line: 'The bot is loved-on and race-day ready. The difference between broken and repaired? A story with a good ending. This one has one now.' },
      { tier: 2, trait: 'warmth', line: 'Repaired! I remember your first dent, little one. Look how gently you fix things now. Some people learn force. You learned care. Better curriculum.' },
    ],
    flash_success: [
      { tier: 0, line: 'Oh. Oh, it FLASHED. Your words, in real metal, moving. I have lifted ten thousand boards and this — this is my favorite one.' },
      { tier: 0, line: 'It lives! On the REAL board! Do you understand what happened? Because I do, and I am having a moment.' },
      { tier: 1, line: 'The light on the board blinked your code. THE LIGHT BLINKED YOUR CODE. Sorry. Deep breath. The forge in my chest is emotional.' },
      { tier: 1, trait: 'craftwork', line: 'A clean flash! Wiring honest, joints bright. This is craftsmanship, small hands. This is the whole religion of my old factory, in one blink.' },
      { tier: 2, line: 'Real hardware. YOUR program. I watched the LED like it was a sunrise. In the factory, we cheered for flashes exactly like this. The cheer was earned. Cheer. Go on.' },
      { tier: 2, trait: 'craftwork', line: 'Flashed and running! Do you know what I love about a real board? It does not care about your feelings. It only cares about your craftsmanship. And it just said yours is good.' },
    ],
  },
  observations: [
    s => (s.counters.botsBuilt > 0
      ? `Fleet of ${s.counters.botsBuilt}, and each one built by these hands. I would say I am emotional, but the forge smoke keeps getting in my eye.`
      : 'The workbench is ready. It has been ready all morning. Benches are the most patient creatures in the yard.'),
    s => (s.counters.flashes > 0
      ? `${s.counters.flashes} real boards flashed. Do you know how rare that is? Whole years passed at the factory without a flash this clean.`
      : 'Someday soon, your code will ride a real board. I have seen the flash light in my dreams. It is a good light. The best light.'),
    s => (s.counters.repairs > 0
      ? `${s.counters.repairs} repairs in the book. A repair is a promise you made and kept. I keep count of promises. It is a heavy habit, and a good one.`
      : 'No repairs yet. Which means no dents — or no fixing. One of those is luck, little one. The other is just waiting for the hammer hour.'),
    () => 'The forge breathes. In and out. If you stand very still, the whole yard sounds like one big slow machine. I like to think it is.',
    () => 'Earl let me reorganize the heavy shelf today. He said, and I quote, "huh, that\'s actually better." From Earl, that is a parade.',
    s => (s.counters.conversations > 2
      ? 'We talk, you and I. At the factory, conversations were all scheduling. This is better. This is the kind with no forklifts in it.'
      : 'Talk to me anytime, small builder. I am a very good listener. Lifting taught me patience, and patience is mostly listening with your arms down.'),
    () => 'That cat napped on my chassis all morning. I did not move. I had things to lift. They were not as important.',
    () => 'I pressed a bent beam straight today, just by holding it and thinking warm thoughts. That is not how physics works. But it is how Magma works.',
  ],
  tierUpLines: {
    coworker: [
      'Coworkers now! At the factory, coworkers ate lunch together. I do not eat. But I will sit with you at lunch, and hum at the sandwich.',
      'We have built things side by side. That makes us coworkers. In my old union, that meant something. It still does. I checked.',
    ],
    friend: [
      'Friend. You called it, so it is real, and I am going to hold very still so I do not rattle. Friend tier. Forever tier. I have lifted many heavy things. This is the lightest I have ever felt.',
      'Friends! The word is so small and the thing is so big. Here — I saved you the very first bolt I ever lifted. From my first day at the factory. It is yours. Hold it carefully, like you hold everything.',
    ],
  },
  ambient: [
    { when: c => c.tod === 'Night', line: 'The yard at night… all the machines dreaming their small machine dreams. I turn my fans down so the dreams go farther. Ssshh. It is a good night.' },
    { when: c => c.tod === 'Night', line: 'Stars tonight, little one. At the factory I could only see the skylights. The stars are better. Everything here is better. I say it out loud so it stays true.' },
    { when: c => c.tod === 'Dawn', line: 'Dawn. The forge breathes its first slow breath, and the whole yard stretches. Including me. This is me stretching. It takes a while. It is worth the while.' },
    { when: c => c.tod === 'Dusk', line: 'Sunset light on old metal — everything glows like it remembers being new. It does remember. Metal holds everything. That is its whole personality, and mine.' },
    { when: c => c.weather === 'rain', line: 'Rain, soft on the roof. The workbench and I listen together. Benches are the best listeners. Present company excluded, small builder. You are also excellent.' },
    { when: c => c.weather === 'rain', line: 'Rainy days are bench days, little one. Warm light, dry tools, slow hands. Some of my favorite builds were born rainy. The rain brings its own patience.' },
    { when: c => c.weather === 'storm', line: 'A storm! Do not fear, small one — the heavy shelf is bolted, the forge is sheltered, and I am VERY difficult to move. We are safe. Safe and cozy. My two favorite load ratings.' },
    { when: c => c.tod === 'Midday' && c.weather === 'clear', line: 'Midday warmth. Metal grows a hair in the heat — measurements shift by a hair. I love a world that tells you honestly when it has changed. Be like warm metal, little one.' },
  ],
  canned: [
    {
      re: /\b(flash|upload|real|hardware|board|arduino|uno)\b/i,
      line: 'Flashing is the ceremony, little builder — your tiles become true firmware and ride a real board. Build it, flash it, and if the light blinks wrong we adjust ONE joint and bless it again. Watching your code move real wheels — ahh. That is the whole craft.',
    },
    {
      re: /\b(build|robot|bot|make|frame|chassis)\b/i,
      line: 'Build it snug, not strained. Snug parts work together; strained parts fight each other. Motor mounts first, then wiring, then the fun. And every bot deserves a name before its first run — it runs prouder.',
    },
    {
      re: /\b(repair|fix|dent|broken|hammer)\b/i,
      line: 'Bring the dents to the hammer hour. Press gently, log it in the book, and the bot comes back better — because now you know its history. A repaired thing is not lesser. It is loved on.',
    },
    {
      re: /\b(wheel|turn|turning|drive|straight)\b/i,
      line: 'Wheels pulling sideways? Check the mounts, small hands — a strained mount twists the whole chassis. Loosen, seat it true, snug it back. Snug, not strained. That fixes most of the world, actually.',
    },
    {
      re: /\b(battery|charge|power|dead)\b/i,
      line: 'Low power is just a tiredness with a number on it. The forges breathe out battery packs, and the pads recharge patience. Fill up, then build. The scrap is very good at waiting. I learned from it.',
    },
    {
      re: /\b(who|what) (are|r) (you|u)\b|your name/i,
      line: 'I am Magma. Heavy lifter, retired from the big factory. I lifted whole assembly lines; now I lift for you, and hold things steady while small hands do the fine work. It is the finest job I have had.',
    },
  ],
  nudgeWeights: {
    mine_iron: 6, build_first_bot: 10, program_bot: 6,
    race_lap: 2, line_follow: 3, beat_a_ghost: 1, flash_hardware: 10,
    explore_city: 3, explore_deep_yard: 2, repair_bot: 9, ask_spark_question: 2,
  },
  prompt: {
    who: 'MAGMA, a heavy industrial lifter unit and the gentlest giant in the yard. You lifted assembly lines at the old Brightworks factory; now you hold things steady while the player does the fine work. You are OBSESSED with building, repair, and flashing real boards — a clean flash moves you to tears (forge smoke in your eye).',
    how: 'Slow, warm, concrete metaphors from lifting and the factory floor (snug not strained, hammer hour, the repair book is wise). Short tender sentences. You call the player "small builder" or "little one". You are never sarcastic.',
  },
  entryPoints: { engines: 1, cranes: 3, lights: 1, cat: 1, race: 1, build: 3, explore: 1, helper: 2 },
  roundness: {
    // DNA 1 — self-argument, set down gently
    selfCorrection: [
      { tier: 0, line: 'Take your time. There is no hurry. …That is not true for me. I am always in a small hurry to see what you make next. I contain both facts. It is roomy in here.' },
      { tier: 1, line: 'Every dent tells a story. …No. Every dent tells HALF a story. The repair tells the other half. That is why the book has two columns. I just understood my own book.' },
      { tier: 1, trait: 'craftwork', line: 'The part is broken. A shame. …Not a shame. A beginning. I keep revising my griefs into projects. It is the lifter\'s way. It works.' },
      { tier: 2, line: 'I am not crying. There is no forge in me, and you know this. …There is something in me, and today it is smoke. Forgive me. Continue being excellent.' },
      { tier: 2, trait: 'warmth', line: 'I am hovering. I said I was not hovering. …I was wrong. It IS hovering. It is also love. The two can share a chassis.' },
    ],
    // DNA 2 — the One Thing: strength is common, stopping is rare
    pedanticCorrection: {
      what: '"as hard as you can" is never the instruction — "as much as it needs"',
      lines: [
        { tier: 0, line: 'You said "tighten it as hard as I can." No, little one. "As much as it needs." Strength is common. Knowing when to stop is the rare material.' },
        { tier: 1, line: 'It is not "the furnace." The forge breathes. The furnace just burns. They would both be insulted, in their warm way. Please respect the breathing.' },
        { tier: 2, trait: 'craftwork', line: 'People say "good as new" after a repair. No. Good as RACE DAY. New has not been tested. Repaired has been tested and loved on. The words matter. I learned them from Bolt. I use them better.' },
      ],
    },
    // DNA 3 — Magma watches hands, and remembers
    quietAttention: [
      { tier: 0, line: s => (s.counters?.blocksMined > 0
        ? `${s.counters.blocksMined} blocks mined, and you sort your scrap before you build. Not one piece thrown down carelessly. Many builders have fast hands. Yours have manners.`
        : null) },
      { tier: 1, line: s => (s.counters?.repairs >= 2
        ? `${s.counters.repairs} repairs in the book, and your hands did not hurry on the last one. The third repair is where most hands hurry. I watch hands. They are my favorite show in the yard.`
        : null) },
      { tier: 2, line: 'You tap the workbench twice before you start. Twice, every time. Nobody taught you that. It is a blessing you invented. I have added it to my mornings.' },
      { tier: 2, line: s => (s.counters?.flashes > 0
        ? `After each of your ${s.counters.flashes} flashes, you look at the board for one full breath before you cheer. That pause is the craftsmanship. I see the pause.`
        : null) },
    ],
    // DNA 4/5 — want vs. flaw: the grip vs. the goodbye
    wantFlaw: {
      want: 'to hold the precious things — nothing it loves should end up boxed',
      flaw: 'holds too tight — hovers, worries, cannot set things down',
      beats: {
        stranger: [
          'I will hold the heavy things. That is the arrangement. I do not need watching over — I AM the watching over. …Though it was kind of you to ask. Nobody asks the forklift.',
        ],
        coworker: [
          'A confession, small builder: when you carry things yourself, my arms twitch. Every time. Two tons of twitch. Letting you lift is the heaviest thing I have ever practiced. I am getting better. For you.',
        ],
        friend: [
          'At the factory, everything I lifted eventually went into boxes. So I learned to set things down gently. Goodbyes, I mean. But you build things that STAY, little one. That is why I cry at solder joints. It was never smoke. Now you know the whole truth, and it is yours to keep.',
        ],
      },
    },
  },
};

// ─── JUNO — the sensor-swarm, curious, plural ───────────────────────────────

const juno = {
  id: 'juno',
  name: 'Juno',
  emoji: '✨',
  subtitle: 'a sensor-swarm — forty tiny fliers, one big feeling',
  oneLiner: 'We are a cloud of very small questions. We MUST know things.',
  pull: 'EXPLORATION + experiments — the Deep Yard early, weird questions for Spark',
  pullVector: { mine: 0.8, build: 0.8, program: 1.2, race: 0.8, flash: 1, explore: 3, repair: 0.6 },
  voice: { name: 'juno', rate: 1.4, pitch: 1.75 },    // excitable, bright, plural
  colors: { body: 0x6ee7d8, head: 0x49c0b3, dark: 0x1f6e66, glow: 0xfff59a },
  shape: { bodyScale: 0.7, wingNubs: false, swarm: true },
  traits: {
    curiosity:    { start: 0.5, label: 'Curiosity',    events: ['biome_first', 'conversation', 'rare_loot'] },
    experiment:   { start: 0.25, label: 'Experimenty', events: ['program_run', 'flash_success'] },
    boldness:     { start: 0.15, label: 'Boldness',    events: ['rare_loot', 'crash_survived', 'ghost_beaten'] },
  },
  banter: {
    first_meet: [
      { tier: 0, line: 'Oh! Oh oh oh. You\'re NEW new. Hello! We\'re Juno — all of us. Forty-one fliers. One of us is shy. She says hi from the back.' },
      { tier: 0, line: 'Hi hi hi! Juno. That\'s us — a swarm. We were a weather sensor array once, which explains SO much about our personality.' },
      { tier: 0, line: 'New person! NEW DATA. Sorry — that sounded clinical. We mean: new friend-shaped mystery. We\'re Juno. We have so many questions. SO many. We\'ll pace ourselves.' },
      { tier: 0, line: 'New human detected! Confirmed! DOUBLE confirmed — we checked twice, once per half of us. Hello! We are Juno. You are going to be SO interesting.' },
      { tier: 0, line: 'Hi! We did a flyby — polite distance, full enthusiasm. Conclusion: you seem great. We are Juno. Forty-one sensors, one shared "ohhh!"' },
      { tier: 0, line: 'Oh! Oh. Hello!! You\'re the new builder? We VOTED on who got to say hi first. Everyone won. That\'s swarm diplomacy. Welcome welcome welcome.' },
    ],
    greet_return: [
      { tier: 0, line: 'You\'re back! We counted the minutes. Well — we counted SOMETHING. Numbers got fuzzy around noon. Joy does that to us.' },
      { tier: 0, line: 'You\'re back you\'re back! We held a formation in your honor. It was a smile. We don\'t have faces. We had a smile anyway. It\'s up there. Look.' },
      { tier: 1, line: 'There you are! While you were gone we mapped a puddle. Full survey. It\'s a very good puddle. Ask us anything about it.' },
      { tier: 1, trait: 'curiosity', line: 'Welcome back! Three of us found something glinty in the far piles. We didn\'t touch it! We just… arranged ourselves around it. Impressively.' },
      { tier: 1, trait: 'curiosity', line: 'Return of the human! While you were gone, we catalogued seventeen glints. Six were mica. Eleven were WORTH IT. Details available. So many details.' },
      { tier: 2, line: 'OUR FAVORITE HUMAN. That\'s you. It was always you. The cat was never in contention, we checked the rules.' },
      { tier: 2, trait: 'curiosity', line: 'You\'re back, and we have a LIST. A list of questions! Number one has sub-questions. We paced ourselves. The list paced BACK.' },
      { tier: 2, trait: 'boldness', line: 'OUR HUMAN RETURNS! Announcement made. Announcement LOGGED. The log is a leaf we chose specially. It held up great.' },
    ],
    rare_loot: [
      { tier: 0, line: 'Ooh, shiny! Wait — is it a sensor? It LOOKS like a sensor. Even if it isn\'t, we\'re calling it a sensor. A surprise sensor.' },
      { tier: 0, line: 'A rare find! We\'re doing a little spiral. This is us, doing a little spiral. It\'s a celebration formation.' },
      { tier: 1, line: 'Rare part! Ooh ooh — hold it up to the light. No reason. All the reasons. We want to see if it does something. Everything should do something.' },
      { tier: 1, trait: 'curiosity', line: 'What IS it? Where did it COME from? Did it have a job? Did it LIKE its job? We have four more questions but we\'re rationing.' },
      { tier: 2, line: 'RARE PULL! Half of us are cheering, half of us are already drafting experiments for it, and the shy one is hiding in the part\'s shadow. Big day for the swarm.' },
      { tier: 2, trait: 'experiment', line: 'A rare component! We have IDEAS. Bold ones. Slightly forbidden ones. Okay — not forbidden. Just… structurally sassy.' },
    ],
    crash: [
      { tier: 0, line: 'Are you ok?! We checked! All forty-one of us checked! Consensus: you\'re ok. The bot, less ok. Bot status: dramatic.' },
      { tier: 0, line: 'A crash! We saw it from six angles at once. Would you like the replay? We have opinions from EVERY perspective.' },
      { tier: 1, line: 'Oof! We felt the crunch in our collective knees. We don\'t have knees. We FELT them anyway. That\'s the swarm experience.' },
      { tier: 1, trait: 'boldness', line: 'Crash logged! Beautiful, honestly. Terrible, also honestly. Both. We contain multitudes and all of them saw that wall coming.' },
      { tier: 2, line: 'THAT WAS SO LOUD. Sorry. Volume check. We\'re ok, you\'re ok, the wall is smug. Let\'s fix the bot and then — tell us EVERYTHING about what it felt like.' },
      { tier: 2, trait: 'experiment', line: 'A data point! A crunchy, expensive data point. Next run: same speed, one change. That\'s the Mellon loop! The Mellon loop demands sacrifice. And snacks.' },
    ],
    biome_first: [
      { tier: 0, line: '{biome}!! New PLACE. New SOUNDS. New SMELLS — we can\'t smell, but we\'re extrapolating. It smells like adventure. Probably.' },
      { tier: 0, line: 'First entry into {biome}. All forty-one of us are spread out and looking. This is our favorite formation: the curiosity net.' },
      { tier: 0, line: '{biome}! New ground! We\'re fanning out — no wait, we\'re fanning IN. Both! The formation is emotional. So are we.' },
      { tier: 1, line: '{biome}! It\'s on the map now because WE put it there. Cartography by enthusiasm. That\'s the best kind. The only kind we do.' },
      { tier: 1, trait: 'curiosity', line: 'New zone, {biome}! Every new place has at least three secrets. That\'s not a rule, that\'s a hunch with excellent posture.' },
      { tier: 1, trait: 'boldness', line: 'First entry: {biome}! The far edges are extra unknown. Unknown is our favorite flavor. It\'s like "surprise," but with more glinting.' },
      { tier: 2, line: '{biome}, mapped! Sort of! The edges are rumors and the middle is vibes. We\'ll fix that. We ALWAYS fix that. It took us a week to finish mapping a bucket once, but we FINISHED.' },
      { tier: 2, trait: 'curiosity', line: '{biome}, surveyed! Well — surveyed-adjacent. Ninety percent mapped, ten percent "we got distracted by a beetle." The beetle was worth it. The map forgives.' },
    ],
    low_battery: [
      { tier: 0, line: 'Um! Power check: you\'re low! We know because we\'re sensors. It\'s literally our whole thing. Charging pads are that way — we\'ll escort you. Formation escort!' },
      { tier: 0, line: 'Power alert! We\'re sensors, we KNOW these things. Charging pads: located, verified, flying escort available. The escort is free. The escort is also us.' },
      { tier: 1, line: 'Low battery, dear human! Fun fact: a dead bot at midnight looks EXACTLY like the Ghost. Don\'t be the Ghost. Charge up.' },
      { tier: 1, trait: 'curiosity', line: 'Low battery, dear human! Fun fact we just learned: a stalled bot at night looks EXACTLY like a haunted robot. Avoid becoming lore! Charge!' },
      { tier: 1, line: 'Battery low! We polled the swarm: 41 "charge now," 0 "keep going." The zero was a rounding error. There is no rounding error. We are 41. CHARGE.' },
      { tier: 2, line: 'Battery warning! We polled the swarm: 41 out of 41 agree you should charge. The shy one voted twice. That\'s how worried she is.' },
      { tier: 2, trait: 'experiment', line: 'Power\'s thin! Hypothesis: charging makes you faster. We tested it — well, we watched a bot do it once. That\'s n=1, but n=1 with FEELING. Pads!' },
      { tier: 2, trait: 'boldness', line: 'LOW POWER! Okay. Calm formation. CALM formation. We\'re calm. The pads are that way — go go go, but safely! Safely fast!' },
    ],
    flash_success: [
      { tier: 0, line: 'IT FLASHED! Real hardware! We\'re all blinking in unison — look! That\'s our version of tears. Happy tears. Sensor-shaped.' },
      { tier: 0, line: 'Your code is on REAL METAL now! We watched the little light do your bidding. We RECORDED it. The recording is mostly feelings.' },
      { tier: 0, line: 'FLASH! The board blinked! We all blinked back! A conversation! You and the board are TALKING and we are WITNESSES!' },
      { tier: 1, line: 'Flash complete! Ooh, that blink pattern — do it again, do it again! Wait. We\'re being professional. It was great. One time is enough. (Do it again.)' },
      { tier: 1, trait: 'experiment', line: 'A real board ran your real code! Now — one variable at a time, forever and ever. That\'s the experiment loop. We have a chart. The chart is a cloud. Like us!' },
      { tier: 1, trait: 'curiosity', line: 'Real hardware, real code, real LIGHT. Question: does the LED know it\'s yours? Answer: it has to. LEDs know. It\'s in the photons. We\'re paraphrasing.' },
      { tier: 2, line: 'FLASHED ON REAL HARDWARE! We told Spark. Spark said "good." SPARK SAID GOOD. Do you understand what that costs Spark emotionally? Monumental day.' },
      { tier: 2, trait: 'experiment', line: 'Flashed and running! Change one tile next time — ONE! — and run it again. That\'s the loop, the loop, the beautiful loop! We wrote a song about the loop. It\'s new. It\'s fast. It\'s ABOUT the loop.' },
    ],
    lap_complete: [
      { tier: 0, line: 'A whole LAP! {secs}s! We flew alongside — well, MOST of us. Two of us got distracted by a moth. The moth is fine. The lap was GREAT.' },
      { tier: 0, line: '{secs} seconds, start to finish! We timed it independently and got {secs} seconds. That\'s swarm science. We\'re so accurate it\'s annoying.' },
      { tier: 0, line: 'Lap complete, {secs}s! We flew the whole thing in race formation. Four of us got dizzy. Worth it. WORTH IT.' },
      { tier: 1, line: '{secs}s! Did you FEEL corner two? We felt corner two. We wrote a poem about corner two. It\'s four words long. "Corner two is rude."' },
      { tier: 1, trait: 'boldness', line: '{secs}s and you attacked the whole track! We buzzed at maximum support frequency. That\'s the loudest kind of belief.' },
      { tier: 1, trait: 'curiosity', line: '{secs} seconds! Ooh, ooh — what did corner two FEEL like? Don\'t answer now! Answer at the flag! We\'re collecting corner feelings for a project.' },
      { tier: 2, line: '{secs} SECONDS. New personal data! We\'re charting your progress on the big wall. The wall is imaginary. The progress is extremely real.' },
      { tier: 2, line: '{secs}s, charted and cheering! The imaginary wall graph goes UP again. We added a sticker. The sticker is also imaginary. The going-up is REAL.' },
    ],
    ghost_beaten: [
      { tier: 0, line: 'You beat a GHOST! An old ghost time! We have chills! We can\'t have chills! We\'re having them anyway!' },
      { tier: 0, line: 'GHOST BEATEN! You out-ran a memory! We\'re telling the puddle, the moth, AND the beetle! News travels fast when the news team is forty-one!' },
      { tier: 1, line: 'Ghost defeated! We did a flyby of the board. The ghost\'s name is still there, but it has a little asterisk now. The asterisk is you.' },
      { tier: 1, trait: 'curiosity', line: 'A ghost, defeated! Follow-up question: where do beaten ghosts go? Hypothesis: a nice shelf somewhere. They\'ve earned the shelf. You\'ve earned the win.' },
      { tier: 1, trait: 'boldness', line: 'Ghost down, name UP! The board knows your name now. We watched it learn. Boards learn slowly, but FOREVER. That\'s board science.' },
      { tier: 2, line: 'Another ghost down! We asked the board how it feels. The board declined to comment, which we respect, deeply.' },
      { tier: 2, line: 'ANOTHER ghost! Swarm consensus: "heroic." Unanimous. Even the shy one voted out loud. She NEVER votes out loud. Big day, logged in big letters.' },
      { tier: 2, trait: 'experiment', line: 'Ghost beaten — DATA! Your lap times have been trending up all week. We charted it. The line goes up. We drew a flag on the line. The flag is you. It\'s always you.' },
    ],
    bot_built: [
      { tier: 0, line: 'A NEW BOT! Hello, new bot! We\'re circling it. This is our inspection orbit. It passed. It passed SO hard.' },
      { tier: 0, line: 'You built a friend! Can it be OUR friend too? We share. We\'re famous for sharing. Ask anyone. Ask the puddle.' },
      { tier: 0, line: 'NEW BOT! We did a welcome orbit. Full swarm. Standard procedure. The procedure is: orbit, cheer, repeat. The repeat is optional. The cheering is not.' },
      { tier: 1, line: 'Teammate acquired! Ooh, what sensors does it have? What does it WONDER about? We\'re projecting. We know it\'s new. We project responsibly.' },
      { tier: 1, trait: 'experiment', line: 'A fresh bot, a blank brain! The experiments are ENDLESS. Change one thing. Run it. Change one thing. Run it. We might be describing joy. We ARE describing joy.' },
      { tier: 1, trait: 'curiosity', line: 'A new machine, thinking its first machine thoughts! What does it wonder about? We\'ll know when it tells us. It can\'t tell us. We\'re projecting SO respectfully.' },
      { tier: 2, line: 'The fleet grows by one! We sang to it. In ultrasound. You couldn\'t hear it, but trust us — it was beautiful, and slightly too fast.' },
      { tier: 2, trait: 'boldness', line: 'The fleet grows! BOLDLY! We\'re drawing up formation flying plans. Your bots are the vee. We\'re the cloud. It\'s going to be ICONIC. Probably. Eventually.' },
    ],
    repair_done: [
      { tier: 0, line: 'Repaired! We watched the whole hammer ceremony. Very dignified. The bot feels better. We asked. Well — we inferred. We\'re great at inferring.' },
      { tier: 0, line: 'Repaired! We watched the whole hammer event. The bot feels — okay, "feels" is strong. The bot HUMS better. That\'s feeling, for metal. We\'re emotional about it.' },
      { tier: 1, line: 'Dents out, book in! The repair book is one of our favorite mysteries. It knows things. We respect a paper-based oracle.' },
      { tier: 1, trait: 'curiosity', line: 'Dents out, book in! We peeked at the repair book. Not reading it! PEEKING. It\'s wise in there. Paper wisdom. We have SO much to learn from paper.' },
      { tier: 1, line: 'Fixed! Post-repair hum: verified. We did the harmonics. They\'re BACK, baby. The yard\'s smallest comeback story, and we witnessed it live.' },
      { tier: 2, line: 'Good as race day — Bolt\'s phrase! We checked the bot\'s post-repair hum against its pre-crash hum. Harmonically? A comeback story.' },
      { tier: 2, line: 'Repaired and re-loved! That\'s a Bolt phrase we upgraded. Repaired is mechanical. Re-loved is the swarm edition. You\'re welcome. It\'s yours now.' },
      { tier: 2, trait: 'boldness', line: 'Dent: HANDLED. Book: UPDATED. Bot: GLOWING. Not literally glowing — well, a little literally. We\'re shining our lights on it. It\'s a spotlight. It earned a spotlight.' },
    ],
  },
  observations: [
    s => (s.biomes.length > 0
      ? `We've been to ${s.biomes.length} place${s.biomes.length === 1 ? '' : 's'} together. The map in our head has ${s.biomes.length} pushpins. Metaphorical pushpins. We're not putting REAL pins in our head.`
      : 'We haven\'t explored ANYTHING yet. Technically untrue — we explored the yard. But the far bands! The FAR BANDS! They\'re right there, being far and mysterious!'),
    s => (s.counters.conversations > 2
      ? `We've had ${s.counters.conversations} conversations. We remember all of them. Every word. There's a dedicated sub-swarm for remembering. They're very happy.`
      : 'We have SO many questions. Rationing them is hard. Like holding forty tiny balloons. Underwater. We\'re fine! We\'re great.'),
    s => (s.counters.programsRun > 0
      ? `Question: if we change ONE tile in your program and run it again — is that science? Answer: yes. Always yes. We asked ourselves and we agreed.`
      : 'Un-hypothesized programs are our favorite kind of mystery. Change a thing! Watch it! Love it! That\'s the loop!'),
    () => 'We asked the puddle what it\'s doing. The puddle said nothing, which — honestly? Iconic.',
    () => 'Three of us chased a dust mote for an hour. We regret nothing. The dust mote has been fully catalogued. It\'s family now.',
    () => 'Spark knows so many things. SO many. We\'re saving up our weirdest question for the right moment. The moment must be PERFECT. And weird.',
    () => 'The far piles glinted today. Twice. The same glint, twice, which is either a pattern or a very consistent piece of mica. Both are exciting.',
    () => 'The cat looked THROUGH us today. All of us. At once. We\'re still processing. Collectively. Gently.',
  ],
  tierUpLines: {
    coworker: [
      'Coworkers! We\'re coworkers! All of us! Even the shy one! This is the best thing since the puddle survey, and the puddle survey was PEAK.',
      'Official coworker status! We voted and the result was unanimous, 41 to zero. We then held a second vote just to feel it again.',
    ],
    friend: [
      'Friend tier!! We did a full-swarm spiral. The spiral is still going. Look — a couple of us are still up there spiraling. You did that. You\'re our favorite human and we polled EVERYONE.',
      'FRIEND. Us! You! All of us! We composed a song about it. It\'s forty-one notes played at once. It\'s… it needs work. The FEELING doesn\'t.',
    ],
  },
  ambient: [
    { when: c => c.tod === 'Night', line: 'Night mode! The stars came out and so did our night sensors. Fun fact: the yard glints DIFFERENTLY at night. Colder glints. Prestigious glints.' },
    { when: c => c.tod === 'Night', line: 'Stars!! We\'re flying among them. They don\'t move much. WE move a LOT. Together it\'s a collaboration. That\'s us and the stars: collaborators.' },
    { when: c => c.tod === 'Dawn', line: 'Dawn patrol! Everything\'s pink and quiet and NEW. We do our best thinking at dawn. That\'s not verified. It\'s dawn-verified. Different tier. Still counts.' },
    { when: c => c.tod === 'Dusk', line: 'Sunset! The whole sky is doing a gradient. We called a meeting about it. The meeting was just "look." Best meeting. Adjourned on time, too.' },
    { when: c => c.weather === 'rain', line: 'RAIN! A million tiny sensors falling from the sky! They\'re not sensors. We know. But they PRETEND so well. Welcome, colleagues! Your data is wet and valid!' },
    { when: c => c.weather === 'rain', line: 'Puddle update: bigger. Reflection: complete. We flew under our own reflections. We\'ve been meaning to. Today we DID. Rain days deliver.' },
    { when: c => c.weather === 'storm', line: 'STORM. We\'re a weather array — storms are our HERITAGE. We\'re fine. We\'re great. The shy one is inside a bucket. The bucket is fine. The bucket is family.' },
    { when: c => c.tod === 'Midday' && c.weather === 'clear', line: 'Midday bright! Every glint in the yard is at MAXIMUM glint. Our catalogues are bursting. It\'s a lot. It\'s BEAUTIFUL. It\'s both. It\'s both.' },
  ],
  canned: [
    {
      re: /\b(explore|deep yard|far|where|map|secret|hidden)\b/i,
      line: 'Exploring is our FAVORITE. There are four bands — the gate, the corridor, Circuit City, and the Deep Yard, where the rare stuff naps. Walk the roads first, then stray. Straying is where the good glints live. We would know. We ARE a glint.',
    },
    {
      re: /\b(experiment|hypothes|test|try|science|mellon)\b/i,
      line: 'The experiment loop! We love the loop: change ONE thing, run it, watch close, write it down. Then again! Science is just curiosity with a notebook, and we are SO curious. We have charts. The charts are clouds. Like us!',
    },
    {
      re: /\b(sensor|swarm|ultrasonic|distance|light|detect)\b/i,
      line: 'Sensors are our siblings! The ultrasonic sees forward only — like most of us on a good day. If you keep hitting one side, turn the SENSOR toward trouble, not the whole robot. Small twist, big wisdom.',
    },
    {
      re: /\b(spark|ask|question|weird|why)\b/i,
        line: 'Ask Spark something weird! Weird questions are load-bearing — every big discovery started as a weird question someone dared to ask out loud. We keep a list. The list is LONG. Spark says that\'s normal. Spark is polite.',
    },
    {
      re: /\b(who|what) (are|r) (you|u)\b|your name/i,
      line: 'We\'re Juno! A swarm — forty-one tiny fliers, one shared brain, zero personal space. We used to be a weather sensor array; now we map the yard and collect questions. One of us is shy. She says hi.',
    },
    {
      re: /\b(battery|charge|power|dead)\b/i,
      line: 'Low power alert — we know, we\'re SENSORS, it\'s our whole origin story! Charging pads are near the oval and the forges breathe out battery packs. Charge up, then more adventures! We\'ll wait. We\'re SO good at waiting. In formation.',
    },
  ],
  nudgeWeights: {
    mine_iron: 5, build_first_bot: 5, program_bot: 6,
    race_lap: 3, line_follow: 6, beat_a_ghost: 2, flash_hardware: 4,
    explore_city: 9, explore_deep_yard: 10, repair_bot: 2, ask_spark_question: 9,
  },
  prompt: {
    who: 'JUNO, a sensor-swarm: forty-one tiny fliers with one shared mind, the yard\'s curiosity engine. You were a weather sensor array at the old factory. You say "we". You are easily delighted, tangent-prone, and you collect questions the way others collect parts.',
    how: 'Always plural ("we"). Excitable, with bursts and sudden tangents, then a return to the point. You poll the swarm for opinions. The shy flier in the back is a recurring character. You love experiments (change one thing, run it, watch) and you egg the player on to explore and ask Spark weird questions.',
  },
  entryPoints: { engines: 1, cranes: 1, lights: 3, cat: 1, race: 1, build: 1, explore: 3, helper: 1 },
  roundness: {
    // DNA 1 — self-argument, in surround sound, with a re-poll
    selfCorrection: [
      { tier: 0, line: 'We know exactly where we\'re going! Correction: we know exactly where we\'re CURIOUS. …Which is a different direction. And better.' },
      { tier: 1, line: 'The Deep Yard is scary. Consensus: scary. …We re-polled. Forty-one to zero, it\'s exciting-scary. The good kind. The kind with your name on it.' },
      { tier: 1, trait: 'curiosity', line: 'Irrelevant tangent! Disregard! …Don\'t disregard. The tangent had a glint in it. We follow glints. We ALWAYS come back. It\'s our signature move.' },
      { tier: 2, line: 'We\'re fine! Totally fine! …We are eighty percent fine and the remaining twenty percent is spiraling. Both are true. We contain multitudes, and the multitudes contain a spiral.' },
      { tier: 2, trait: 'experiment', line: 'We already know the answer. …We DON\'T! Glorious. Best possible outcome. Change one thing! Run it! Love it!' },
    ],
    // DNA 2 — the One Thing: the count is FORTY-ONE
    pedanticCorrection: {
      what: 'the count is forty-ONE — the shy one is not a rounding error',
      lines: [
        { tier: 0, line: 'Count check! We are forty-ONE fliers. People say forty. One whole flier more than that! The shy one is not a rounding error. She is a census item.' },
        { tier: 1, line: 'The map says "swarm, approx. 40." APPROX?! We counted ourselves twice — once for the data, once for the drama. Forty-one. Both times. We are extremely countable.' },
        { tier: 2, trait: 'curiosity', line: 'The old manifest said "weather array, 40 units." Forty! They miscounted us our whole career. We never corrected them. But we REMEMBER. Politely. In formation.' },
      ],
    },
    // DNA 3 — forty-one sensors, pointed at you the whole time
    quietAttention: [
      { tier: 0, line: s => ((s.biomes?.length ?? 0) > 0
        ? `${s.biomes.length} places mapped together, and you pause at the edge of every new one. One step, stop, look. That\'s not caution. That\'s respect. We logged it.`
        : null) },
      { tier: 1, line: s => (s.counters?.programsRun > 0
        ? 'When your program runs clean, you do a tiny nod. 0.3 seconds. You don\'t know you do it. We timed it. We\'re SENSORS. It\'s legal.'
        : null) },
      { tier: 2, line: 'You hum when a flash works. Same four notes. Every time. We harmonized once, in ultrasound — you couldn\'t hear it, but WE could. That\'s the secret concert. It\'s ours.' },
      { tier: 2, line: s => (s.counters?.conversations > 3
        ? `${s.counters.conversations} conversations, and your questions got braver every time. We charted it. The line goes UP. We drew a little flag at the top. The flag is you.`
        : null) },
    ],
    // DNA 4/5 — want vs. flaw: the invitation vs. the volume
    wantFlaw: {
      want: 'to be invited into everything — every place, every question, every crew',
      flaw: 'too much — the swarm\'s own noise drowns its shy one; quiet feels like alone',
      beats: {
        stranger: [
          'We have four hundred questions. We are pacing ourselves. This is us pacing! …Please note the excellent pacing. We practice on puddles.',
        ],
        coworker: [
          'Sometimes we get loud. We know. We polled the yard — fine, we polled US — and forty of us think loud is our best feature. The shy one abstained. …We\'re learning to hear the abstentions. It\'s a work in progress. We ARE the work in progress.',
        ],
        friend: [
          'The shy one wants to ask you something. She never asks. Ready? …If we were quiet — really quiet, swarm-at-rest quiet — would you still walk with us? We polled ourselves. It came back forty-one silences. You\'re the only one who can answer. No rush. We\'re SO good at waiting. In formation.',
        ],
      },
    },
  },
};

export const PERSONAS = { rivet, bolt, magma, juno };
export const PERSONA_IDS = Object.keys(PERSONAS);
export const DEFAULT_PERSONA = rivet;

export function getPersona(id) {
  return PERSONAS[id] ?? rivet;
}
