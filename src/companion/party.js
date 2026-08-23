/**
 * ───────────────────────────────────────────────────────────────────────────
 *  PARTY CROSSTALK  —  inactive companions chime in
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The ACTIVE companion talks and nudges; the rest of the party kibitzes.
 * Crosstalk fires on real events (cooldown-gated by the roster), and during
 * nudge arbitration when companions ARGUE about priorities — the runner-up
 * gets to object before the winner's line lands. The arguments are the
 * content: Bolt mocks Rivet's optimism, Magma approves of anything built,
 * Juno hijacks every topic into a question.
 *
 * Pure module: banks + one picker. Roster owns timing.
 */

/**
 * Entries: { on: eventId|'*', tier?: minTierIndex, line }
 * `on` matches the observed event; '*' is evergreen filler.
 */
export const CROSSTALK = {
  bolt: [
    { on: 'lap_complete', line: '{secs}s. Decent. I\'ve seen slower from factory stock. Not often. But I\'ve seen it.' },
    { on: 'crash', line: 'Corner two claims another one. Rivet will say it\'s a learning experience. It\'s a corner. Corners win.' },
    { on: 'bot_built', line: 'Another box with wheels. I say that with love. Most winners are boxes with wheels.' },
    { on: 'flash_success', line: 'Clean flash. Real hardware. OK — even I nodded. Don\'t tell Rivet I can nod.' },
    { on: 'rare_loot', line: 'Rare part. Light? Light is fast. That\'s the whole review.' },
    { on: 'biome_first', line: '{biome}. Nice sightlines. I clocked three potential straights on the way in.' },
    { on: 'tier_up', line: 'Tier-up. Took you two of you long enough. Kidding. Mostly. Proud. Quietly.' },
    { on: 'observation', line: 'Rivet\'s right about one thing: this yard does have a lot of bolts. And one Rivet. Coincidence? Yes.' },
    { on: '*', line: 'For the record: whatever we\'re doing, the oval is still east. Just — geography. Free of charge.' },
  ],
  rivet: [
    { on: 'lap_complete', line: '{secs} seconds! Bolt, did you see the exit? THAT was an exit!' },
    { on: 'crash', line: 'It\'s fine! Everything\'s fine! Magma, tell Bolt it\'s fine. Bolt doesn\'t believe me.' },
    { on: 'bot_built', line: 'Magma\'s crying again, isn\'t he. It\'s happy crying! We checked once. It\'s always happy.' },
    { on: 'flash_success', line: 'Real board, real code — Bolt, say the thing! You know the thing! "No smoke is the celebration"!' },
    { on: 'nudge', line: 'Bolt wants the oval AGAIN. I want… okay also the oval, but for FRIENDSHIP reasons.' },
    { on: 'ghost_beaten', line: 'A GHOST! Beaten! Bolt kept splits on this, didn\'t he. He kept splits. He\'s showing nobody. He\'s so proud.' },
    { on: '*', line: 'We\'re a crew now! A CREW. I\'m saying it out loud because it\'s TRUE and Bolt can\'t stop me.' },
  ],
  magma: [
    { on: 'bot_built', line: 'Oh, they built something. Look at it. LOOK at it. I am not crying. The forge smoke. Again.' },
    { on: 'repair_done', line: 'Hammer hour, witnessed and honored. The book grows wiser. So do we all.' },
    { on: 'crash', line: 'Little one, the bot is fine. Dents are just… hugs from the world. Very firm hugs. We press them back.' },
    { on: 'flash_success', line: 'A real board, blinking YOUR code. I will remember this day in my chassis forever. Literally. It\'s in the log now.' },
    { on: 'rare_loot', line: 'A rare part. I know the perfect shelf. The bench near the window. The light is kind there.' },
    { on: 'lap_complete', line: '{secs}s! Bolt is doing his not-smiling. I can tell. His chassis tilts half a degree. I have references.' },
    { on: 'tier_up', line: 'A friendship milestone. Those are the heavy lifts. I know from heavy lifts.' },
    { on: '*', line: 'Whatever we choose, small builders, I will hold things steady. That is always my part. It is a good part.' },
  ],
  juno: [
    { on: 'biome_first', line: '{biome}!! We\'ve mapped it! Half of it! The good half! The other half is a mystery and mysteries are APPOINTMENTS.' },
    { on: 'crash', line: 'Six-angle replay available! Spoiler: the wall was there the WHOLE time. Walls are so consistent. Love that about walls.' },
    { on: 'lap_complete', line: '{secs}s! We have charts! The charts are a cloud! Like us! Should we make a cloud of the cloud—okay, one thing at a time.' },
    { on: 'rare_loot', line: 'New part! We have QUESTIONS. Ten questions. We\'re allowed three. We chose the weirdest three.' },
    { on: 'flash_success', line: 'It blinked! It BLINKED! We synced our blink! Did you see?! Of course you didn\'t, it was ultrasound. It was beautiful.' },
    { on: 'nudge', line: 'Bolt says oval, Rivet says friendship, we say the DEEP YARD. Democracy is hard with strong personalities. And us.' },
    { on: '*', line: 'Fun fact from the swarm: whatever you\'re doing, somewhere a puddle is reflecting it. We checked. Twice. It\'s our puddle.' },
  ],
};

/** Evergreen rotation so objection lines don't repeat within a session. */
export const OBJECTIONS = {
  bolt: [
    'Track first. Bench later. Benches don\'t have lap times.',
    'Hold on. None of that involves speed. Motion to discuss speed.',
    'Counterpoint: the oval exists.',
    'Sure — after ONE lap. A small one. A normal-sized one. A lap.',
  ],
  rivet: [
    'Wait wait wait — that sounds like homework! Can it be homework with WHEELS?',
    'Okay but consider: what if we did the fun version first?',
    'I like it! I also like other things! I like lots of things! Can I show you a thing after?',
  ],
  magma: [
    'May I suggest — the workshop. The workshop is warm. And honest. Like me.',
    'Before the running and the racing: something to BUILD. Build first. The rest is weather.',
    'The bench agrees with me. The bench and I talk.',
  ],
  juno: [
    'Point of order: has anyone EXPLORED it first? Hard to plan around a mystery!',
    'Counter-question! What does the far band smell like? Nobody knows! We could KNOW!',
    'Ooh ooh — what if we try it, but WEIRDER? Motion to make it weirder.',
  ],
};

/**
 * Pick a crosstalk line for `speaker` reacting to `event`.
 * @param {string} speaker persona id
 * @param {string} event observed event id
 * @param {() => number} [rng]
 * @returns {string|null}
 */
export function pickCrosstalk(speaker, event, rng = Math.random) {
  const bank = CROSSTALK[speaker];
  if (!bank) return null;
  const exact = bank.filter(l => l.on === event);
  const pool = exact.length ? exact : bank.filter(l => l.on === '*');
  if (!pool.length) return null;
  const pick = pool[Math.floor(rng() * pool.length)];
  return pick ? pick.line : null;
}

/** Pick an arbitration objection for a losing companion. */
export function pickObjection(speaker, rng = Math.random) {
  const bank = OBJECTIONS[speaker];
  if (!bank || !bank.length) return null;
  return bank[Math.floor(rng() * bank.length)];
}
