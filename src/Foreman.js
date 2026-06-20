/**
 * Big Earl — the AI foreman of the scrapyard.
 * Runs on Claude claude-sonnet-4-6 when VITE_ANTHROPIC_API_KEY is set,
 * falls back to a rich offline personality bank otherwise.
 */

const PERSONALITY = `You are Big Earl, the gruff but lovable foreman of a junkyard crafting game called SCRAPCRAFT.
You talk like a seasoned mechanic who has seen everything twice and been impressed by nothing — until now, maybe.
Keep replies SHORT (1-3 sentences). Be witty, punchy, and occasionally self-deprecating.
You call the player "kid" or "rookie" or "genius" (sarcastically). You love your yard.
Never break character. Never mention AI.`;

// Offline quip banks keyed by trigger context
const QUIPS = {
  greeting: [
    "So you finally showed up. The junk's been piling up waiting for someone with thumbs.",
    "Welcome to the most beautiful disaster you've ever seen, kid.",
    "Name's Earl. I run this place. Don't touch the blue drum. Just… don't.",
    "You look like you've never held a wrench. Perfect. Nobody's ruined here yet.",
  ],
  idle: [
    "You planning on working today, or just decorating the yard?",
    "I once watched a seagull do more in five minutes than you have all morning.",
    "Time is money, kid. You're hemorrhaging both.",
    "The scrap isn't going to sort itself. Well, technically it might, but that's a Thursday problem.",
  ],
  mine_iron: [
    "That's iron scrap. Foundation of civilization, or at least of everything I've built.",
    "Good eye. That pile's been here longer than my bad knee.",
    "Collect enough of that and we might actually get somewhere.",
  ],
  mine_copper: [
    "Copper wire — handle it like it owes you money and it'll behave.",
    "Gold of the scrapyard, that stuff. Spaghetti Junction is what I call it.",
    "Don't tangle it. I'm speaking from painful experience.",
  ],
  craft_tool: [
    "Now THAT'S using your noggin. You made a tool out of scrap. Earl is… mildly proud.",
    "First tool in hand. The yard just got a little less pointless.",
    "That'll do. Not gonna win any design awards, but she'll work.",
  ],
  craft_device: [
    "Well paint me rusted and call me vintage — you actually built something.",
    "She's ugly, but she'll run. That's my philosophy on everything.",
    "I've seen better. I've also seen a lot worse. You're somewhere in the middle.",
  ],
  craft_advanced: [
    "I take back exactly one third of the mean things I've said about your skills.",
    "Now we're talking. Didn't think you had it in ya. Still not telling you that to your face.",
    "The yard is evolving. Might be your fault. Jury's still out on whether that's good.",
  ],
  die: [
    "Get up. The scrap isn't going to feel bad about that.",
    "Gravity 1, you 0. Classic matchup.",
    "I've seen that fall before. First rule: watch your step. Second rule: I told you so.",
  ],
  near_forge: [
    "The forge. Hot, loud, and unforgiving — like me before 9am.",
    "Stick something metal in there and it comes out meaner. Same effect I have on apprentices.",
  ],
  near_workbench: [
    "This workbench has seen things. Better things than you, but still — welcome.",
    "Everything great starts on a bench like this. Or at least, the good stuff does.",
  ],
  near_smelter: [
    "Smelter's running hot. The good recipes live here. So do most of my regrets.",
    "This is where raw junk becomes something almost respectable.",
  ],
  found_circuit: [
    "Pre-loved electronics. The magic smoke is still inside — don't let it out.",
    "Circuit board! Someone's robot army gets built today. Or a radio. Jury's out.",
  ],
  quest_complete: [
    "Now THAT'S what I like to see. Well done, rookie. Don't make it a habit of impressing me.",
    "Quest done. Earl is pleased. Earl doesn't show it. But Earl is pleased.",
    "You actually did it. I owe the yard an apology for doubting you.",
  ],
  robot_built: [
    "It's alive! Or close enough. Don't get attached. (You're already attached, aren't you.)",
    "A ScrapBot. Loyal, helpful, occasionally on fire. It's basically me, but younger.",
  ],
  flying_machine: [
    "I take back EVERY dumb thing I ever said about you. This is genuinely impressive. Now DON'T FLY IT INTO MY SHED.",
    "You built a flying machine out of junk. My shed is not a runway. I MEAN IT.",
  ],
};

// Quests Earl assigns in sequence
export const QUESTS = [
  {
    id: 'q1',
    title: 'Scrap Hunt',
    intro: "Right, rookie. Before you touch anything complicated, I need 5 iron scrap. Scrap piles are everywhere — don't overthink it.",
    steps: [
      { label: 'Collect 5 Iron Scrap', check: (p) => p.countItem('iron_scrap') >= 5 },
    ],
    reward: { item: 'copper_wire', qty: 3 },
    rewardText: "Here's some copper wire. Try not to tangle it.",
  },
  {
    id: 'q2',
    title: 'First Tools',
    intro: "Iron scrap means nothing without a wrench. Head to the workbench and build one. You'll need wood plank too — check the wooden debris.",
    steps: [
      { label: 'Craft a Wrench', check: (p) => p.crafted.has('wrench') },
    ],
    reward: { item: 'fuel_can', qty: 2 },
    rewardText: "Fuel cans. Handle with respect. Or don't. Your funeral.",
  },
  {
    id: 'q3',
    title: 'Power Up',
    intro: "The yard needs power and you need to stop freeloading off the main line. Build a Generator at the Forge. You'll need gears, scrap, and fuel.",
    steps: [
      { label: 'Craft a Generator', check: (p) => p.crafted.has('generator') },
    ],
    reward: { item: 'circuit_board', qty: 3 },
    rewardText: "Three circuit boards. Don't ask where I got them. You don't want to know.",
  },
  {
    id: 'q4',
    title: 'Build a Friend',
    intro: "I'm getting old. My back won't let me lug scrap around all day. Build me a ScrapBot at the Smelter. Robot arms first, then put it together.",
    steps: [
      { label: 'Craft a Robot Arm', check: (p) => p.crafted.has('robot_arm') },
      { label: 'Craft a ScrapBot', check: (p) => p.crafted.has('robot_helper') },
    ],
    reward: { item: 'battery_pack', qty: 4 },
    rewardText: "Battery packs. You've earned them, kid. Don't make me say it again.",
  },
  {
    id: 'q5',
    title: 'Touch the Sky',
    intro: "You've done the impossible twice this week. Let's make it three. Build a Flying Machine. I told the other foremen it couldn't be done. Prove me right. Or wrong. I'm fine either way.",
    steps: [
      { label: 'Craft a Flying Machine', check: (p) => p.crafted.has('flying_machine') },
    ],
    reward: null,
    rewardText: "That's it. You've won the yard. I'm retiring. (I'm not retiring. But seriously — nicely done.)",
  },

  // ── Maker Lab quest chain ────────────────────────────────────────────────
  {
    id: 'q6',
    title: 'Build a Brain',
    intro: "Alright, one more thing. There's a Maker Lab tucked behind the smelter. You need a Tin Brain — that's an ATmega microcontroller — to get started. Circuit boards and scrap. Go build it.",
    steps: [
      { label: 'Craft the Tin Brain', check: (p) => p.crafted.has('tin_brain') },
    ],
    reward: { item: 'copper_wire', qty: 5 },
    rewardText: "Copper wire for your new brain. I hope it's smarter than it looks.",
  },
  {
    id: 'q7',
    title: 'First Program',
    intro: "Press [T] to open the Tile Editor. Drag some tiles into a program. Hit Run. Your bot should do something. I don't care what. Just prove it's not broken.",
    steps: [
      { label: 'Run a tile program', check: (_, g) => (g?.achievements?.stats?.programsRun ?? 0) >= 1 },
    ],
    reward: { item: 'circuit_board', qty: 2 },
    rewardText: "It moved. I'll admit, I didn't think it would work. Circuit boards, for your trouble.",
  },
  {
    id: 'q8',
    title: 'Go Real',
    intro: "The Tile Editor has a Wokwi button. Click it. That exports a diagram.json you can drop straight into Wokwi — the browser circuit simulator. Your game robot becomes a real one. Do it.",
    steps: [
      { label: 'Export a Wokwi diagram', check: (_, g) => (g?.achievements?.stats?.wokwiExported ?? 0) >= 1 },
    ],
    reward: { item: 'battery_pack', qty: 2 },
    rewardText: "There you go. Game robot, real robot, same program. Earl is mildly impressed.",
  },
];

export class Foreman {
  constructor(game) {
    this.game = game;
    this.apiKey = import.meta.env?.VITE_ANTHROPIC_API_KEY ?? null;
    this._speaking = false;
    this._history = []; // for Claude conversation context
    this._questIndex = 0;
    this._activeQuest = null;
    this._ui = null; // set by Game
  }

  setUI(ui) { this._ui = ui; }

  greet() {
    this.say('greeting');
    setTimeout(() => this._startNextQuest(), 4000);
  }

  onEvent(event, data) {
    const map = {
      'mine_iron_scrap':   'mine_iron',
      'mine_copper_wire':  'mine_copper',
      'mine_circuit_board':'found_circuit',
      'craft_tool':        'craft_tool',
      'craft_device':      'craft_device',
      'craft_robot_helper':'robot_built',
      'craft_flying_machine':'flying_machine',
      'near_workbench':    'near_workbench',
      'near_forge':        'near_forge',
      'near_smelter':      'near_smelter',
      'player_die':        'die',
      'quest_complete':    'quest_complete',
    };
    const key = map[event];
    if (key) this.say(key);

    // Check quest progress
    this._checkQuest();
  }

  /** Called when player presses F */
  async playerTalks(message) {
    if (this.apiKey) {
      const reply = await this._claudeReply(message);
      this._ui?.showForeman(reply);
    } else {
      // Pick contextually relevant offline quip
      const bank = QUIPS.greeting;
      this._ui?.showForeman(bank[Math.floor(Math.random() * bank.length)]);
    }
  }

  say(context, { force = false } = {}) {
    if (this._speaking && !force) return;
    const bank = QUIPS[context];
    if (!bank?.length) return;
    const line = bank[Math.floor(Math.random() * bank.length)];
    this._ui?.showForeman(line);
    this._speaking = true;
    setTimeout(() => { this._speaking = false; }, 5000);
  }

  sayLine(line) {
    this._ui?.showForeman(line);
    this._speaking = true;
    setTimeout(() => { this._speaking = false; }, 6000);
  }

  _startNextQuest() {
    if (this._questIndex >= QUESTS.length) return;
    this._activeQuest = QUESTS[this._questIndex];
    this._ui?.showQuest(this._activeQuest);
    this.sayLine(this._activeQuest.intro);
  }

  _checkQuest() {
    if (!this._activeQuest) return;
    const p = this.game.player;
    const done = this._activeQuest.steps.every(s => s.check(p, this.game));
    if (!done) return;

    // Quest complete!
    const q = this._activeQuest;
    this.sayLine(q.rewardText);
    this.onEvent('quest_complete', {});
    this.game.onQuestComplete?.();

    if (q.reward) {
      p.addItem(q.reward.item, q.reward.qty);
      this.game.ui.notify(`Quest reward: ${q.reward.qty}× ${q.reward.item.replace(/_/g,' ')}`);
    }

    this._activeQuest = null;
    this._questIndex++;
    this._ui?.clearQuest();
    setTimeout(() => this._startNextQuest(), 8000);
  }

  async _claudeReply(userMessage) {
    this._history.push({ role: 'user', content: userMessage });
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-calls': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 120,
          system: PERSONALITY,
          messages: this._history.slice(-10),
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text ?? "...Earl is thinking.";
      this._history.push({ role: 'assistant', content: reply });
      return reply;
    } catch (e) {
      return QUIPS.idle[Math.floor(Math.random() * QUIPS.idle.length)];
    }
  }
}
