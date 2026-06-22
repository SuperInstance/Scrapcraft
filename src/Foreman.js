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
import { getEarlResponse } from './spark/EarlGateway.js';

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
  mine_track_strip: [
    "Track strips. Rubber and paint. Your robot can follow a line like it's got a job interview to get to.",
    "The robot test loop's right over there. Place those strips and watch your bot work. Try not to cheer. (Cheer a little.)",
    "Finally someone found the track. I put that loop in years ago. Mostly for myself.",
  ],
  craft_track: [
    "Eight track strips from two rubber chunks. That's called efficiency. I taught you that. Indirectly.",
    "Now you can build your own race course. First rule: don't let the bot win unsupervised.",
  ],
  near_tower: [
    "That tower? Tallest thing in the yard. Dead for years. You bring it the right parts, maybe it talks again.",
    "Old comms tower. Needs a signal amp, some crystal, circuit boards, and battery packs. Then we'll see who's out there listening.",
    "I built that tower a long time ago. Never finished it. Press E at the base if you think you've got what it takes.",
  ],
  tower_ready: [
    "All four components seated. That's it. That's the whole list. Hit the activate switch, kid. Let's wake it up.",
    "You did it. Every part's in. Now fire the transmitter and let's find out if anyone's still on the other end.",
  ],
  tower_activated: [
    "...It's broadcasting. After all these years. You know, I wasn't always a junkyard foreman. I used to listen for signals like this one. Welcome to the other side of the static, kid. You earned it.",
    "There it goes. 433 megahertz, screaming into the dark. Somewhere out there, somebody just heard the scrapyard wake up. That somebody might be me, twenty years ago. Good work. Genuinely.",
  ],
  near_exchange: [
    "Exchange board's right there. My contact drops new deals every morning. Don't ask who. Don't ask how. Just use it.",
    "Scrap Exchange. I've been using that contact for twelve years. Best logistics operation in a 200-mile radius. Allegedly.",
    "That board gets restocked daily. If the deal's good, take it. It won't be there tomorrow.",
  ],
  exchange_trade: [
    "Traded. My contact will be pleased. They like volume.",
    "Deal complete. Check your inventory. And don't wonder where the scrap went.",
    "That's how you work the exchange. Come back tomorrow for the next rotation.",
  ],
  bot_upgrade: [
    "Hardware mod installed. You're customizing your bot now. That's the difference between a user and an engineer.",
    "Upgraded. The factory settings are for people who don't know what they're doing. You clearly do now.",
    "Bot modification recorded. Earl approves. (Earl rarely approves. Enjoy the moment.)",
  ],
  hardware_flash: [
    "You just pushed code from a game to a real processor. That's not a metaphor anymore, kid. That's engineering.",
    "Real iron. USB cable, live firmware. You know what the difference is between playing and building? That button you just clicked.",
    "You flashed actual hardware. I've been waiting ten years for someone to do that in my yard. Take the day off. Actually don't. I still need scrap.",
  ],
  bot_named: [
    "You named it. Good. Things with names work harder. That's not science, that's just true.",
    "A named bot is a bot with stakes. You'll feel worse about letting the battery die now. Good.",
    "Name it, claim it. That's your machine. It's going to do things you taught it.",
  ],
  bot_bond_milestone: [
    "That bot's logged a lot of hours with you. Something about machines and time — they remember.",
    "Bond's going up. I've seen people give up on bots after one compile error. You didn't. That matters.",
    "You and that bot — good team. And I don't say that about many teams. Ask anyone.",
  ],
  buried_cache_found: [
    "You found one. I buried those before the yard got this crowded. It was a different time.",
    "Emergency supply cache. Built these during the grid outage of '09. You're welcome, by the way.",
    "Signal cache unlocked. That's military surplus RF tech. Don't ask where I got it. Just loot it.",
  ],
  ghost_lap_start: [
    "Ghost lap active. That translucent thing is your previous best. Beat it or cry about it.",
    "You're racing a ghost of yourself. Philosophy aside — optimize your turning radius.",
    "Watch where the ghost slows down. That's your bottleneck. Engineering 101: find the constraint.",
  ],
  bot_lap_record: [
    "New lap record. I would clap but my hands are full of grease and dignity.",
    "It lapped the circuit. In my day we used stopwatches and yelled. This is better.",
    "Personal best on the track. I've seen racers with worse times. Professional ones.",
  ],
  near_track: [
    "That's the robot test track. Load the Line Follower preset in the Maker Bench and run your bot on it.",
    "Race circuit's right there. Bot needs a Line Follower brain. I'll time it. (With my watch. Don't tell anyone.)",
    "I built that track myself. Took a weekend. Nobody's thanked me yet. You're welcome anyway.",
  ],
  near_oval: [
    "That's the Circuit City oval. Professional-grade loop. Load a line-following program and send your bot out. This one has a proper grandstand. I may have gone overboard.",
    "The oval circuit. I measured it twice. Ran the perimeter calculations myself. Your bot can set a lap record here. Better than the test track.",
    "Welcome to the oval. Twenty-eight by fourteen meters. The only thing in this scrapyard I'm actually proud of. Try not to crash your bot into the bleachers.",
  ],
  craft_scrap_magnet: [
    "A scrap magnet. The lazy genius way to collect iron. I say that with full respect.",
    "Electromagnetic induction in your back pocket. Faraday would be proud and confused.",
  ],
  craft_ir_module: [
    "IR sensors. Invisible light, real results. That's physics working for you.",
    "You can build a line follower now. The oval track in Circuit City is waiting.",
  ],
  weather_rain: [
    "Rain. Perfect conditions for getting no sympathy from me. Get back to work.",
    "It's raining. In the scrapyard, rain means slippery scrap and bad moods. Same as usual, basically.",
    "That's rain, kid. Your bot doesn't care. You probably shouldn't either.",
  ],
  weather_storm: [
    "Storm rolling in. Get your bot under cover if you care about it. I don't. (I do.)",
    "Thunder. Lightning. Perfect weather for building things indoors. Which we don't have. Well, sheds.",
    "Thunderstorm. You want a tip? Don't hold copper wire over your head right now.",
  ],
  weather_clear: [
    "Sun's out. No excuses now, rookie. The scrap doesn't sort itself.",
    "Cleared up. Earl appreciates a fine day. Earl won't say so again.",
    "Weather's good. Which means my back hurts less. Which means I expect more from you today.",
  ],
  enter_band_1: [
    "Industrial Corridor. Bigger scrap, taller towers, worse smells. Welcome to the real yard.",
    "You crossed into my territory now. The Industrial Corridor doesn't care about your feelings.",
    "Band 1 — dense, heavy, loud. Like me on a Monday. Watch your step.",
  ],
  enter_band_2: [
    "Circuit City. Electronics everywhere. Touch nothing you don't understand. Touch nothing you DO understand either.",
    "You're in the Circuit district now. The glowing oval track is up ahead. I built it. Don't crash it.",
    "Circuit City. Everything here runs on volts and optimism. Both can kill you.",
  ],
  enter_band_3: [
    "The Deep Yard. This is the back of the back. The junk of the junk. Tread carefully.",
    "Nobody goes to the Deep Yard on purpose. Yet here you are. I respect that. Barely.",
    "Crystal Ore grows back here. I don't know why. I stopped asking questions about this yard years ago.",
  ],
  headlamp_on: [
    "There's a light on your head now. Look at you. Very professional. Don't walk into walls anyway.",
    "Headlamp! Now you can see what you're bumping into. Progress.",
  ],
  cannon_fire: [
    "That's the Scrap Cannon going off. Point it AWAY from the shed. I cannot stress this enough.",
    "BOOM. Scrap Cannon fired. I told you not to aim it at the oil drums. I assume you didn't.",
  ],
  waypoint_reached: [
    "Bot reached the flag. That's GPS. Real GPS. In a scrapyard game. I'm genuinely moved.",
    "Waypoint reached! Your bot navigated there using math I won't pretend to fully understand. Good job.",
  ],
  ore_detect: [
    "Bot's magnetic sensor just picked up crystal ore. Hall-effect chip, same as the real ones. That's not a game gimmick — that's actual I2C sensor protocol.",
    "Signal spike! Your bot found ore. The LED went green, which is the universal language for 'dig here, genius.'",
    "Ore detected. I put those crystals back there myself. Don't tell anyone they light up.",
  ],
  grenade_fire: [
    "Scrap Grenade. I see you found the fun one. Keep it away from my workbench.",
    "That's a grenade going off in my yard. I'm trying to be calm about this.",
    "Select G, throw it, run. That's the full manual. You're welcome.",
  ],
  grenade_big_hit: [
    "Three blocks gone. Simultaneously. Earl is impressed and furious in equal measure.",
    "That's what I call efficiency. Terrible, dangerous efficiency. Well done.",
    "I heard that from the other side of the yard. Also, I'm missing a wall. Just noticed.",
  ],
  airdrop_incoming: [
    "Supply drop inbound. From… somewhere. I didn't order anything. Not saying I didn't want to.",
    "Something's falling from the sky. In the scrapyard. This is completely normal and I am fine.",
    "Listen for the thud. Then find it. That's your whole job right now.",
  ],
  airdrop_looted: [
    "You found it. Good. Whatever's in there, you earned it by walking all that way.",
    "Supply drop contents secured. Earl approves of this level of initiative.",
    "Mystery crate. Real gear inside. That's the scrapyard lottery and you just won.",
  ],
  challenge_complete: [
    "Salvage run complete. Materials secured, skill confirmed. That's what working to a spec feels like — engineers do it every single day.",
    "Done. On time, on target. Every real engineering project has a goal and a deadline. You just practiced both.",
    "Task complete. In a real fab shop, that's called meeting your production quota. You're ahead of schedule. Don't let it go to your head.",
  ],
  storm_exposed: [
    "GET INSIDE. Lightning is 30,000 Kelvin. That's five times hotter than the sun's surface. Metal scrapyard. You are the tallest thing. MOVE.",
    "Lightning looks for the path of least resistance to ground. Standing in an open scrapyard makes you that path. Find a roof.",
    "I've worked this yard 22 years. I do not stand outside in a lightning storm. Neither should you. Metal roof. Now.",
  ],
  bot_battery_dead: [
    "Your bot ran out of power. This is how electric vehicles work — lithium-ion pack, charge it or park it. Use a charging pad.",
    "Battery dead. Real robots have battery management systems (BMS) that shut down cleanly at 0% to protect the cells. Your bot does the same.",
    "Bot's done. Zero percent battery. Charge it with a charging pad. Real autonomous vehicles have the same problem — ask any delivery drone operator.",
  ],
  acid_hazard: [
    "Get out of the acid. Now. That's sulfuric acid leaking from old batteries. Eats through rubber, metal, and boot soles.",
    "MOVE. That green stuff is H₂SO₄ — battery acid. It corrodes metal in seconds. You are not made of metal. Mostly.",
    "Acid puddle. Industrial grade. The real ones glow less but smell worse. Get to dry ground.",
  ],
  waypoint_drop: [
    "Flag's down. Bot knows where to go. Real autonomous vehicles use the same trick — GPS coordinate, compass bearing, distance sensor. You just built basic autopilot.",
    "Waypoint set. Load the Waypoint Navigator brain and watch it steer. Bearing plus distance. That's how delivery drones navigate.",
    "There's your flag. Your bot will drive straight to it. Same math NASA uses for rover navigation. Just... fewer craters here.",
  ],
  lucky_find: [
    "Lucky find. I put that there on purpose. (I did not put that there on purpose.)",
    "Something useful buried in the junk. The yard rewards patience. Also stubbornness.",
    "Ha. Found something. The scrapyard provides. Occasionally.",
  ],
  craft_magnet_gloves: [
    "Magnet gloves. Electromagnets in your pockets. You can pick up dropped items from across the room. Earl is jealous and will never admit it.",
    "Those gloves have a coil in each finger. Low-voltage, high-amperage field. Don't wear them near my filing cabinet.",
  ],
  craft_comm_relay: [
    "You built a comm relay. To me. That's... touching. In a slightly invasive way. I'm here. Use it.",
    "A radio relay. Right to Earl's frequency. I'm simultaneously flattered and suspicious. Good engineering either way.",
  ],
  place_solar_panel: [
    "Solar panel, placed. Clean energy. I'm contractually obligated to be grumpy about it, but secretly, I approve.",
    "Solar power in a scrapyard. The irony is not lost on me. Neither is the free electricity.",
  ],
  steam_boiler_fire: [
    "That's the steam boiler going. I can hear it from here. It sounds angry. That means it's working.",
    "Steam pressure building. Hope you used the right gauge. I didn't teach you gauge theory for nothing.",
  ],
  radar_active: [
    "Radar dish is scanning. Your minimap just got a whole lot more useful. I can see you watching it from here.",
    "Radar ping! Ore veins lit up on the map. Good. I hate when people wander around aimlessly.",
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
    rewards: [{ item: 'copper_wire', qty: 3 }, { item: 'iron_scrap', qty: 2 }],
    rewardText: "Here's some copper wire and iron scrap. Try not to tangle either.",
  },
  {
    id: 'q2',
    title: 'First Tools',
    intro: "Iron scrap means nothing without a wrench. Head to the workbench and build one. You'll need wood plank too — check the wooden debris.",
    steps: [
      { label: 'Craft a Wrench', check: (p) => p.crafted.has('wrench') },
    ],
    rewards: [{ item: 'battery_pack', qty: 1 }, { item: 'rubber_chunk', qty: 3 }],
    rewardText: "A battery pack and some rubber chunks. Handle with respect. Or don't. Your funeral.",
  },
  {
    id: 'q3',
    title: 'Power Up',
    intro: "The yard needs power and you need to stop freeloading off the main line. Build a Generator at the Forge. You'll need gears, scrap, and fuel.",
    steps: [
      { label: 'Craft a Generator', check: (p) => p.crafted.has('generator') },
    ],
    rewards: [{ item: 'circuit_board', qty: 2 }],
    rewardText: "Two circuit boards. Don't ask where I got them. You don't want to know.",
  },
  {
    id: 'q4',
    title: 'Build a Friend',
    intro: "I'm getting old. My back won't let me lug scrap around all day. Build me a ScrapBot at the Smelter. Robot arms first, then put it together.",
    steps: [
      { label: 'Craft a Robot Arm', check: (p) => p.crafted.has('robot_arm') },
      { label: 'Craft a ScrapBot', check: (p) => p.crafted.has('robot_helper') },
    ],
    rewards: [{ item: 'robot_arm', qty: 1 }],
    rewardText: "A robot arm. You've earned it, kid. Don't make me say it again.",
  },
  {
    id: 'q5',
    title: 'Touch the Sky',
    intro: "You've done the impossible twice this week. Let's make it three. Build a Flying Machine. I told the other foremen it couldn't be done. Prove me right. Or wrong. I'm fine either way.",
    steps: [
      { label: 'Craft a Flying Machine', check: (p) => p.crafted.has('flying_machine') },
    ],
    rewards: [{ item: 'fuel_can', qty: 1 }, { item: 'gear_small', qty: 2 }],
    rewardText: "Fuel can and a couple of gears. That's it. You've won the yard. I'm retiring. (I'm not retiring. But seriously — nicely done.)",
  },

  // ── Maker Lab quest chain ────────────────────────────────────────────────
  {
    id: 'q6',
    title: 'Build a Brain',
    intro: "Alright, one more thing. There's a Maker Lab tucked behind the smelter. You need a Tin Brain — that's an ATmega microcontroller — to get started. Circuit boards and scrap. Go build it.",
    steps: [
      { label: 'Craft the Tin Brain', check: (p) => p.crafted.has('tin_brain') },
    ],
    rewards: [{ item: 'copper_wire', qty: 5 }, { item: 'circuit_board', qty: 2 }, { item: 'generator', qty: 1 }],
    rewardText: "Copper wire, circuit boards, and a generator for your new brain. I hope it's smarter than it looks.",
  },
  {
    id: 'q7',
    title: 'First Program',
    intro: "Press [T] to open the Tile Editor. Drag some tiles into a program. Hit Run. Your bot should do something. I don't care what. Just prove it's not broken.",
    steps: [
      { label: 'Run a tile program', check: (_, g) => (g?.achievements?.stats?.programsRun ?? 0) >= 1 },
    ],
    rewards: [{ item: 'circuit_board', qty: 2 }],
    rewardText: "It moved. I'll admit, I didn't think it would work. Circuit boards, for your trouble.",
  },
  {
    id: 'q8',
    title: 'Go Real',
    intro: "The Tile Editor has a Wokwi button. Click it. That exports a diagram.json you can drop straight into Wokwi — the browser circuit simulator. Your game robot becomes a real one. Do it.",
    steps: [
      { label: 'Export a Wokwi diagram', check: (_, g) => (g?.achievements?.stats?.wokwiExported ?? 0) >= 1 },
    ],
    rewards: [{ item: 'battery_pack', qty: 2 }],
    rewardText: "There you go. Game robot, real robot, same program. Earl is mildly impressed.",
  },
  {
    id: 'q9',
    title: 'Race Circuit',
    intro: "There's a track loop out by the wall at x=30-46, z=14-22. Load the Line Follower preset from the Maker Bench, run it on your bot, and watch it drive a lap. That's a real IR sensor algorithm. Go do it.",
    steps: [
      { label: 'Complete a bot lap on the track', check: (_, g) => (g?.achievements?.stats?.lapsCompleted ?? 0) >= 1 },
    ],
    rewards: [{ item: 'ir_module', qty: 4 }],
    rewardText: "IR sensor modules. Four of them. Your bot earned those. Put 'em in a real robot someday.",
  },
  {
    id: 'q10',
    title: 'Light It Up',
    intro: "The back of the yard is pitch dark at night. Craft a Floodlight — glass, copper wire, iron scrap at the workbench — and stick it somewhere useful. I'm done squinting.",
    steps: [
      { label: 'Craft a Floodlight', check: (p) => p.crafted.has('floodlight') },
      { label: 'Place it in the world', check: (_, g) => (g?.achievements?.stats?.floodlightsPlaced ?? 0) >= 1 },
    ],
    rewards: [{ item: 'scrap_magnet', qty: 1 }],
    rewardText: "A Scrap Magnet. Now scrap comes to you. That's peak scrapyard engineering. You're done growing.",
  },
  {
    id: 'q11',
    title: 'Into the Deep',
    intro: "You've been sticking to the front yard. The Deep Yard — that's Band 3, all the way north — that's where the weird stuff is. Crystal ore. Old robot carcasses. Something I don't like talking about. Go find it.",
    steps: [
      { label: 'Reach the Deep Yard (z ≥ 96)', check: (_, g) => (g?.player?.pos?.z ?? 0) >= 96 },
      { label: 'Mine 3 Crystal Ore', check: (_, g) => (g?.achievements?.stats?.crystalMined ?? 0) >= 3 },
    ],
    rewards: [{ item: 'night_goggles', qty: 1 }],
    rewardText: "Night goggles. The Deep Yard at night is... something else. These'll help.",
  },
  {
    id: 'q12',
    title: 'Headlamp Required',
    intro: "Craft a Headlamp — battery pack, glass shard, copper wire at the workbench. Then press G to toggle it. I don't care what you use it for. Stop bumping into things in the dark. That's my final answer.",
    steps: [
      { label: 'Craft a Headlamp', check: (p) => p.crafted.has('headlamp') },
      { label: 'Toggle it on (G key)', check: (_, g) => (g?.achievements?.stats?.headlampUsed ?? 0) >= 1 },
    ],
    rewards: [{ item: 'crystal_fragment', qty: 5 }],
    rewardText: "Crystal fragments. They're pretty. Don't ask me why the yard has them. I stopped asking years ago.",
  },
  {
    id: 'q13',
    title: 'Waypoint Navigator',
    intro: "Here's your final test. Drop a Waypoint Flag with [Y]. Load the Waypoint Navigator preset in the Tile Editor. Run the bot. Watch it drive to the flag. That right there — that's GPS. That's real robotics. Do it.",
    steps: [
      { label: 'Drop a Waypoint Flag (Y key)', check: (_, g) => g?._waypoint != null },
      { label: 'Run the Waypoint Navigator program', check: (_, g) => (g?.achievements?.stats?.waypointReached ?? 0) >= 1 },
    ],
    rewards: [{ item: 'vision_brain', qty: 1 }],
    rewardText: "Vision Brain. The big one. A Jetson Nano in the game, computer vision in your hands. You've officially graduated from my scrapyard. I'm not crying. My eye itches.",
  },
  {
    id: 'q14',
    title: 'Crystal Sweep',
    intro: "One last trick. Load the Ore Hunter preset in the Maker Bench — you need a Spark Brain for this one. Run your bot in the Deep Yard. The magnetic sensor sniffs out crystal ore from 10 blocks away. Same chip a real mining robot uses. Hall-effect IC on I2C. Go find something.",
    steps: [
      { label: 'Bot detects crystal ore (ore signal > 65%)', check: (_, g) => (g?.achievements?.stats?.oreDetections ?? 0) >= 1 },
    ],
    rewards: [{ item: 'crystal_fragment', qty: 8 }],
    rewardText: "Eight crystal fragments. Your bot earned those by sniffing out ore like a bloodhound made of scrap metal. I couldn't be prouder. I'm also never saying that again.",
  },

  // ── Content expansion quests ──
  {
    id: 'q15',
    title: 'Power the Sun',
    intro: "We're burning too much fuel, kid. Build a Solar Panel — glass shards, copper wire, circuit boards at the workbench. Place it somewhere the sun hits. Clean energy, no fumes. I hate it. But I love it.",
    steps: [
      { label: 'Craft a Solar Panel', check: (p) => p.crafted.has('solar_panel') },
      { label: 'Place a Solar Panel in the world', check: (_, g) => (g?.achievements?.stats?.solarPlaced ?? 0) >= 1 },
    ],
    reward: { item: 'crystal_fragment', qty: 3 },
    rewardText: "Crystal fragments. They glow like progress. Also they're pretty. Don't tell anyone I said that.",
  },
  {
    id: 'q16',
    title: 'Deep Bore',
    intro: "The Deep Yard's metal walls are thick, and your arm's getting tired. I can see it from here. Build a Pneumatic Drill at the forge — iron scrap, gears, rubber, springs. Compressed air at 90 PSI. It'll go through metal like wet cardboard.",
    steps: [
      { label: 'Craft a Pneumatic Drill', check: (p) => p.crafted.has('pneumatic_drill') },
    ],
    reward: { item: 'iron_scrap', qty: 10 },
    rewardText: "Ten iron scrap. Go deeper. Faster. Stop complaining about your arm.",
  },
  {
    id: 'q17',
    title: 'Full Coverage',
    intro: "I need to know what's buried in my yard without walking there. Build a Radar Dish — circuit boards, copper wire, the antenna you already made. Your minimap will show every ore vein nearby. That's synthetic aperture radar, kid. In a scrapyard. Build it.",
    steps: [
      { label: 'Craft a Radar Dish', check: (p) => p.crafted.has('radar_dish') },
    ],
    reward: { item: 'signal_amp', qty: 1 },
    rewardText: "Signal amplifier. Makes your bot's scanner even better. I had that lying around. Don't ask why.",
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
      'mine_iron_scrap':    'mine_iron',
      'mine_copper_wire':   'mine_copper',
      'mine_circuit_board': 'found_circuit',
      'mine_track_strip':   'mine_track_strip',
      'craft_tool':         'craft_tool',
      'craft_device':       'craft_device',
      'craft_robot_helper': 'robot_built',
      'craft_flying_machine':'flying_machine',
      'craft_track_strip':   'craft_track',
      'craft_scrap_magnet':  'craft_scrap_magnet',
      'craft_ir_module':     'craft_ir_module',
      'near_tower':          'near_tower',
      'tower_ready':         'tower_ready',
      'tower_activated':     'tower_activated',
      'near_exchange':         'near_exchange',
      'exchange_trade':        'exchange_trade',
      'bot_upgrade':           'bot_upgrade',
      'hardware_flash':       'hardware_flash',
      'bot_named':            'bot_named',
      'bot_bond_milestone':   'bot_bond_milestone',
      'buried_cache_found':  'buried_cache_found',
      'ghost_lap_start':     'ghost_lap_start',
      'bot_lap_record':      'bot_lap_record',
      'near_track':          'near_track',
      'near_oval':           'near_oval',
      'near_workbench':     'near_workbench',
      'near_forge':         'near_forge',
      'near_smelter':       'near_smelter',
      'player_die':         'die',
      'quest_complete':     'quest_complete',
      'weather_rain':       'weather_rain',
      'weather_storm':      'weather_storm',
      'weather_clear':      'weather_clear',
      'enter_band_1':       'enter_band_1',
      'enter_band_2':       'enter_band_2',
      'enter_band_3':       'enter_band_3',
      'headlamp_toggle':    'headlamp_on',
      'cannon_fire':        'cannon_fire',
      'waypoint_reach':     'waypoint_reached',
      'ore_detect':         'ore_detect',
      'grenade_fire':       'grenade_fire',
      'grenade_big_hit':    'grenade_big_hit',
      'airdrop_incoming':   'airdrop_incoming',
      'airdrop_looted':     'airdrop_looted',
      'lucky_find':         'lucky_find',
      'craft_magnet_gloves':'craft_magnet_gloves',
      'craft_comm_relay':   'craft_comm_relay',
      'place_solar_panel':  'place_solar_panel',
      'steam_boiler_fire':  'steam_boiler_fire',
      'radar_active':       'radar_active',
      'waypoint_drop':      'waypoint_drop',
      'acid_hazard':        'acid_hazard',
      'bot_battery_dead':   'bot_battery_dead',
      'storm_exposed':      'storm_exposed',
      'challenge_complete': 'challenge_complete',
    };
    const key = map[event];
    if (key) this.say(key);

    // Check quest progress
    this._checkQuest();
  }

  /** Called when player presses F */
  async playerTalks(message) {
    // Try AI gateway first (reads onboarding config + env var)
    const earlReply = await getEarlResponse('The player wants to chat: ' + message, message, QUIPS.greeting);
    if (earlReply) {
      this._ui?.showForeman(earlReply);
      if (this.apiKey) {
        this._history.push({ role: 'user', content: message });
        this._history.push({ role: 'assistant', content: earlReply });
      }
      return;
    }

    // Fallback with legacy Anthropic key
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

    if (q.rewards) {
      for (const r of q.rewards) {
        p.addItem(r.item, r.qty);
        this.game.ui.notify(`Quest reward: ${r.qty}× ${r.item.replace(/_/g,' ')}`);
      }
    } else if (q.reward) {
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
