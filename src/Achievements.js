/**
 * 20 achievements — a mix of obvious milestones and secrets.
 * Each has an emoji, punchy name, and Earl-flavored description.
 */

export const ACHIEVEMENT_LIST = [
  {
    id: 'first_blood',
    icon: '🔩',
    name: 'Hands In The Grease',
    desc: 'Mine your first piece of scrap. The yard has officially claimed you.',
    check: (s) => s.totalMined >= 1,
  },
  {
    id: 'rust_whisperer',
    icon: '🪛',
    name: 'Rust Whisperer',
    desc: 'Collect 50 iron scrap. You and rust are on a first-name basis now.',
    check: (s) => (s.itemsCollected.iron_scrap ?? 0) >= 50,
  },
  {
    id: 'wrench_wrangler',
    icon: '🔧',
    name: 'Wrench Wrangler',
    desc: 'Craft your first wrench. The single most important tool. Earl approves.',
    check: (s) => s.crafted.has('wrench'),
  },
  {
    id: 'sparky',
    icon: '⚡',
    name: 'Sparky',
    desc: "You built a generator. The yard has power. Don't blow it.",
    check: (s) => s.crafted.has('generator'),
  },
  {
    id: 'circuit_breaker',
    icon: '🟢',
    name: 'Circuit Breaker',
    desc: 'Collect 10 circuit boards. You have a problem. A fun problem.',
    check: (s) => (s.itemsCollected.circuit_board ?? 0) >= 10,
  },
  {
    id: 'scrap_hoarder',
    icon: '📦',
    name: 'Scrap Hoarder',
    desc: 'Fill your inventory to at least 80%. Some people call it hoarding. You call it planning.',
    check: (s) => s.inventoryFill >= 0.8,
  },
  {
    id: 'night_owl',
    icon: '🌙',
    name: 'Night Shift',
    desc: 'Mine 5 blocks after dark. The yard feels different at night. Spookier.',
    check: (s) => s.nightMines >= 5,
  },
  {
    id: 'five_recipes',
    icon: '📋',
    name: 'Junior Engineer',
    desc: 'Craft 5 different things. You are no longer completely useless.',
    check: (s) => s.crafted.size >= 5,
  },
  {
    id: 'robot_army',
    icon: '🤖',
    name: 'Not Alone Anymore',
    desc: 'Build your first ScrapBot. Your robot buddy has opinions. So does Earl.',
    check: (s) => s.crafted.has('robot_helper'),
  },
  {
    id: 'need_for_speed',
    icon: '🏎️',
    name: 'Zero To Oh-No',
    desc: "Craft the Go-Kart. Earl didn't set a speed limit. On purpose.",
    check: (s) => s.crafted.has('go_kart'),
  },
  {
    id: 'fire_starter',
    icon: '🔥',
    name: 'Fire Starter',
    desc: 'Craft a Blowtorch. With great power comes great responsibility. And singed eyebrows.',
    check: (s) => s.crafted.has('blowtorch'),
  },
  {
    id: 'radio_star',
    icon: '📡',
    name: 'Can You Hear Me Now',
    desc: "Build the Radio Beacon. Earl can hear you. He's pretending he can't.",
    check: (s) => s.crafted.has('radio_beacon'),
  },
  {
    id: 'spring_chicken',
    icon: '👟',
    name: 'Spring Chicken',
    desc: 'Craft Spring Boots. BOING. The only review they need.',
    check: (s) => s.crafted.has('spring_boots'),
  },
  {
    id: 'ten_recipes',
    icon: '🏆',
    name: 'Senior Engineer',
    desc: 'Craft 10 different things. Earl is reconsidering his retirement timeline.',
    check: (s) => s.crafted.size >= 10,
  },
  {
    id: 'cannons_out',
    icon: '💨',
    name: 'OSHA Nightmare',
    desc: 'Build the Pipe Cannon. OSHA would like a word. Several words, actually.',
    check: (s) => s.crafted.has('pipe_cannon'),
  },
  {
    id: 'arm_day',
    icon: '🦾',
    name: 'Arm Day',
    desc: 'Craft 4 Robot Arms. For what purpose? Only you know. Probably robots.',
    check: (s) => (s.itemsCrafted.robot_arm ?? 0) >= 4,
  },
  {
    id: 'king_of_the_yard',
    icon: '👑',
    name: 'King of the Yard',
    desc: 'Complete all 5 of Earl\'s quests. The yard bows to you. Earl does not. But still.',
    check: (s) => s.questsCompleted >= 5,
  },
  {
    id: 'night_miner',
    icon: '⛏️',
    name: '100 Blocks Down',
    desc: 'Mine 100 blocks total. The yard is starting to look different. That might be your fault.',
    check: (s) => s.totalMined >= 100,
  },
  {
    id: 'speed_crafter',
    icon: '⚡',
    name: 'Speed Round',
    desc: 'Craft 3 items within 60 seconds. Efficiency! Earl clocked you. Secretly impressed.',
    check: (s) => s.recentCrafts >= 3,
  },
  {
    id: 'to_infinity',
    icon: '✈️',
    name: 'Earl Was Wrong',
    desc: 'Build the Flying Machine. "I said it couldn\'t be done." — Earl, being wrong for once.',
    check: (s) => s.crafted.has('flying_machine'),
  },

  // ── Maker Lab milestones ────────────────────────────────────────────────
  {
    id: 'first_brain',
    icon: '🧠',
    name: 'Brains of the Operation',
    desc: 'Craft a Tin Brain. The scrapyard just got its first microcontroller.',
    check: (s) => s.crafted.has('tin_brain'),
  },
  {
    id: 'wireless',
    icon: '⚡',
    name: 'Going Wireless',
    desc: 'Craft a Spark Brain. WiFi, Bluetooth, and 240 MHz of ambition in your pocket.',
    check: (s) => s.crafted.has('spark_brain'),
  },
  {
    id: 'eagle_eye',
    icon: '👁️',
    name: 'The Eye Is Open',
    desc: 'Craft a Vision Brain. The Jetson Nano sees all. Earl is suspicious of cameras.',
    check: (s) => s.crafted.has('vision_brain'),
  },
  {
    id: 'all_three_brains',
    icon: '🏅',
    name: 'Full Neural Stack',
    desc: 'Craft all three brains. Tin, Spark, Vision. You are the lab. Earl is reconsidering retirement.',
    check: (s) => s.crafted.has('tin_brain') && s.crafted.has('spark_brain') && s.crafted.has('vision_brain'),
  },
  {
    id: 'night_sight',
    icon: '🥽',
    name: 'Owl Mode',
    desc: 'Craft Night Goggles. Military surplus or novelty — either way, darkness is cancelled.',
    check: (s) => s.crafted.has('night_goggles'),
  },
  {
    id: 'hook_shot',
    icon: '🪝',
    name: 'Got You Covered',
    desc: 'Craft the Grapple Hook. Doubles your reach. Also looks extremely cool.',
    check: (s) => s.crafted.has('grapple_hook'),
  },
  {
    id: 'tile_runner',
    icon: '🤖',
    name: 'It\'s Alive!',
    desc: 'Run your first tile program. The scrapyard has learned to think.',
    check: (s) => s.programsRun >= 1,
  },
  {
    id: 'master_builder',
    icon: '🏆',
    name: 'Master Builder',
    desc: 'Craft 15 different things. Earl has filed paperwork. You\'re competition.',
    check: (s) => s.crafted.size >= 15,
  },
  {
    id: 'placer',
    icon: '🧱',
    name: 'Mine and Refine',
    desc: 'Place your first block back in the world. Creation begins where destruction ends.',
    check: (s) => s.blocksPlaced >= 1,
  },
  {
    id: 'wokwi_exporter',
    icon: '🔌',
    name: 'Game → Reality',
    desc: 'Export your first Wokwi diagram. Your game robot just became a real-world circuit.',
    check: (s) => (s.wokwiExported ?? 0) >= 1,
  },
  {
    id: 'track_builder',
    icon: '🏁',
    name: 'Circuit Designer',
    desc: 'Place 16 TRACK strips in the world. Your scrapyard now has a race circuit.',
    check: (s) => (s.tracksPlaced ?? 0) >= 16,
  },
  {
    id: 'bot_racer',
    icon: '🏆',
    name: 'Lap Record',
    desc: 'Bot completes a full lap of the TRACK circuit. Earl timed it with a stopwatch. From his chair.',
    check: (s) => (s.lapsCompleted ?? 0) >= 1,
  },
  {
    id: 'illuminator',
    icon: '💡',
    name: 'Let There Be Light',
    desc: 'Place your first Floodlight. The scrapyard has never been this bright. Earl squints.',
    check: (s) => (s.floodlightsPlaced ?? 0) >= 1,
  },
  {
    id: 'shared_brain',
    icon: '🔗',
    name: 'Shareable Science',
    desc: 'Share a tile program via URL. Your robot brain is now on the internet. Be proud.',
    check: (s) => (s.brainsShared ?? 0) >= 1,
  },
  {
    id: 'spark_made',
    icon: '✨',
    name: 'AI Collaborator',
    desc: "Let Spark build a program for you. That's not cheating — it's engineering.",
    check: (s) => (s.sparkPrograms ?? 0) >= 1,
  },
  {
    id: 'sensor_explorer',
    icon: '📡',
    name: 'Sensor Sweep',
    desc: 'Use 4 different sensor types in tile programs. You are basically a scientist now.',
    check: (s) => (s.uniqueSensorsUsed ?? 0) >= 4,
  },
  {
    id: 'magnetic_personality',
    icon: '🧲',
    name: 'Magnetic Personality',
    desc: 'Craft a Scrap Magnet. Scrap comes to you now. You have earned this.',
    check: (s) => s.crafted.has('scrap_magnet'),
  },
  {
    id: 'oval_racer',
    icon: '🏎️',
    name: 'Oval Office',
    desc: 'Bot completes a lap on the Circuit City oval track. Earl watched. He won\'t admit it.',
    check: (s) => (s.lapsCompleted ?? 0) >= 3,
  },
  {
    id: 'crystal_hunter',
    icon: '🔮',
    name: 'Crystal Hunter',
    desc: 'Mine 5 Crystal Ore blocks deep in The Deep Yard. They glow, they drop shards, and Earl thinks they\'re suspicious.',
    check: (s) => (s.crystalMined ?? 0) >= 5,
  },
  {
    id: 'headlamp_on',
    icon: '🔦',
    name: 'Head in the Game',
    desc: 'Toggle your headlamp on for the first time. Now you can see what you\'re doing. Game changer.',
    check: (s) => (s.headlampUsed ?? 0) >= 1,
  },
  {
    id: 'scrap_gunner',
    icon: '💥',
    name: 'Industrial Action',
    desc: 'Fire the Scrap Cannon 10 times. OSHA filed three reports. You filed none.',
    check: (s) => (s.cannonsFired ?? 0) >= 10,
  },
  {
    id: 'waypoint_ace',
    icon: '🚩',
    name: 'Navigator',
    desc: 'Your bot reaches a waypoint flag for the first time. That\'s real GPS navigation. In a scrapyard game. Earl is quietly amazed.',
    check: (s) => (s.waypointReached ?? 0) >= 1,
  },
  {
    id: 'bot_scanner',
    icon: '🔍',
    name: 'Deep Yard Detective',
    desc: 'Your bot detected crystal ore using its magnetic sensor. The Deep Yard holds its secrets — but not from your bot.',
    check: (s) => (s.oreDetections ?? 0) >= 1,
  },
  {
    id: 'grenadier',
    icon: '💣',
    name: 'Collateral Damage',
    desc: 'Destroy 3+ blocks with a single Scrap Grenade. Earl was in the shed. He heard it. He chose not to look.',
    check: (s) => (s.grenadeMaxBlocks ?? 0) >= 3,
  },
  {
    id: 'supply_runner',
    icon: '📦',
    name: 'Package Secured',
    desc: "Loot 3 supply drops before Earl notices they exist. (Earl noticed. He's pretending he didn't.)",
    check: (s) => (s.airdropLoots ?? 0) >= 3,
  },
  {
    id: 'lucky_strike',
    icon: '🍀',
    name: 'Lucky Strike',
    desc: 'Find a hidden rare item buried in scrap. The yard hides things. Sometimes good things.',
    check: (s) => (s.luckyFinds ?? 0) >= 1,
  },
  {
    id: 'narrow_escape',
    icon: '🩹',
    name: 'Narrow Escape',
    desc: 'Take a hit that drops you below 15 HP and survive. Earl says the scrapyard builds character. This is what he means.',
    check: (s) => (s.narrowEscapes ?? 0) >= 1,
  },
  {
    id: 'salvage_pro',
    icon: '🏆',
    name: 'Salvage Pro',
    desc: 'Complete 3 Salvage Run challenges. You think in goals, work in steps, and finish what you start. Engineering mindset.',
    check: (s) => (s.challengesCompleted ?? 0) >= 3,
  },
];

export class Achievements {
  constructor() {
    this.unlocked = new Set();
    this._listeners = [];
    // Stats bag
    this.stats = {
      totalMined: 0,
      nightMines: 0,
      inventoryFill: 0,
      crafted: new Set(),
      itemsCollected: {},
      itemsCrafted: {},
      questsCompleted: 0,
      recentCrafts: 0,
      _recentTimer: 0,
      programsRun: 0,
      blocksPlaced: 0,
      wokwiExported: 0,
      tracksPlaced: 0,
      floodlightsPlaced: 0,
      lapsCompleted: 0,
      brainsShared: 0,
      sparkPrograms: 0,
      uniqueSensorsUsed: 0,
      crystalMined: 0,
      headlampUsed: 0,
      cannonsFired: 0,
      waypointReached: 0,
      oreDetections: 0,
      grenadeMaxBlocks: 0,
      airdropLoots: 0,
      luckyFinds: 0,
      narrowEscapes: 0,
      challengesCompleted: 0,
    };
  }

  on(event, fn) { this._listeners.push({ event, fn }); }
  _emit(id) { this._listeners.forEach(l => l.event === 'unlock' && l.fn(id)); }

  track(event, data = {}) {
    const s = this.stats;
    switch (event) {
      case 'mine':
        s.totalMined++;
        if (data.isNight) s.nightMines++;
        if (data.item) s.itemsCollected[data.item] = (s.itemsCollected[data.item] ?? 0) + 1;
        break;
      case 'craft':
        s.crafted.add(data.id);
        s.itemsCrafted[data.id] = (s.itemsCrafted[data.id] ?? 0) + 1;
        s.recentCrafts++;
        break;
      case 'inventory':
        s.inventoryFill = data.fill;
        break;
      case 'quest':
        s.questsCompleted++;
        break;
      case 'program_run':
        s.programsRun++;
        break;
      case 'place':
        s.blocksPlaced++;
        if (data.blockId === 'track_strip')  s.tracksPlaced     = (s.tracksPlaced ?? 0) + 1;
        if (data.blockId === 'floodlight')   s.floodlightsPlaced = (s.floodlightsPlaced ?? 0) + 1;
        break;
      case 'wokwi_export':
        s.wokwiExported = (s.wokwiExported ?? 0) + 1;
        break;
      case 'lap_complete':
        s.lapsCompleted = (s.lapsCompleted ?? 0) + 1;
        break;
      case 'brain_share':
        s.brainsShared = (s.brainsShared ?? 0) + 1;
        break;
      case 'spark_program':
        s.sparkPrograms = (s.sparkPrograms ?? 0) + 1;
        break;
      case 'sensor_used':
        s.uniqueSensorsUsed = (s.uniqueSensorsUsed ?? 0) + 1;
        break;
      case 'crystal_mine':
        s.crystalMined = (s.crystalMined ?? 0) + 1;
        break;
      case 'headlamp_use':
        s.headlampUsed = (s.headlampUsed ?? 0) + 1;
        break;
      case 'cannon_fire':
        s.cannonsFired = (s.cannonsFired ?? 0) + 1;
        break;
      case 'waypoint_reach':
        s.waypointReached = (s.waypointReached ?? 0) + 1;
        break;
      case 'ore_detect':
        s.oreDetections = (s.oreDetections ?? 0) + 1;
        break;
      case 'grenade_splash':
        s.grenadeMaxBlocks = Math.max(s.grenadeMaxBlocks ?? 0, data.count ?? 0);
        break;
      case 'airdrop_loot':
        s.airdropLoots = (s.airdropLoots ?? 0) + 1;
        break;
      case 'lucky_find':
        s.luckyFinds = (s.luckyFinds ?? 0) + 1;
        break;
      case 'narrow_escape':
        s.narrowEscapes = (s.narrowEscapes ?? 0) + 1;
        break;
      case 'challenge_complete':
        s.challengesCompleted = (s.challengesCompleted ?? 0) + 1;
        break;
    }
    this._check();
  }

  tick(dt) {
    const s = this.stats;
    s._recentTimer += dt;
    if (s._recentTimer > 60) { s._recentTimer = 0; s.recentCrafts = 0; }
  }

  _check() {
    for (const ach of ACHIEVEMENT_LIST) {
      if (!this.unlocked.has(ach.id) && ach.check(this.stats)) {
        this.unlocked.add(ach.id);
        this._emit(ach.id);
      }
    }
  }

  getAll() {
    return ACHIEVEMENT_LIST.map(a => ({ ...a, done: this.unlocked.has(a.id) }));
  }
}
