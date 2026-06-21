/**
 * seed-data.js — Default data for Scrapcraft D1 + Vectorize.
 *
 * Run this on first deploy to populate:
 *   - Codex entries (engineering knowledge)
 *   - Seed brains (example bot programs)
 *   - Seed recipes (crafting recipes for the game)
 *
 * The `seedDatabase` function can be called from a Worker
 * startup cron or manually via an API endpoint.
 */

// ── Codex entries ─────────────────────────────────────────────────

export const SEED_CODEX = [
  {
    id: 'generator',
    title: 'How Does a Generator Work?',
    icon: '⚡',
    category: 'energy',
    difficulty: 1,
    tags: 'energy,electricity,generator,basics',
    text: `A generator converts mechanical energy into electrical energy using electromagnetic induction. When a coil of wire rotates in a magnetic field, it creates a flow of electrons — that's electricity! In Scrapcraft, generators need a fuel source (coal, uranium, or even wind) and produce power for your machines. The bigger the generator, the more power it produces, but also the more fuel it consumes. Always balance your power grid!`,
  },
  {
    id: 'motor',
    title: 'Electric Motors — Turning Power into Motion',
    icon: '🔄',
    category: 'energy',
    difficulty: 1,
    tags: 'energy,motor,motion,actuator',
    text: `An electric motor does the opposite of a generator: it uses electricity to create motion. When current flows through a coil in a magnetic field, the coil spins. Motors power your conveyor belts, drills, and robot wheels. Different motors have different torque and speed ratings — use the right one for the job. A high-torque motor is great for lifting, while a high-speed motor is better for conveyor belts.`,
  },
  {
    id: 'sensor',
    title: 'Sensors — How Bots See the World',
    icon: '👁️',
    category: 'computing',
    difficulty: 2,
    tags: 'sensor,bot,computing,input',
    text: `Sensors let your bots perceive the world. The eye sensor detects light levels, the touch sensor detects collisions, the distance sensor measures how far away objects are, and the compass sensor tells you which direction you're facing. Combine sensors with logic to create bots that react to their environment. A wall-avoider uses the distance sensor to detect walls and turns before crashing.`,
  },
  {
    id: 'logic_gates',
    title: 'Logic Gates — The Building Blocks of Brains',
    icon: '🧮',
    category: 'computing',
    difficulty: 3,
    tags: 'logic,gates,computing,brain,programming',
    text: `Logic gates are the foundation of all computing. AND gates output true only when both inputs are true. OR gates output true when either input is true. NOT gates invert the input. XOR gates output true when inputs differ. In Scrapcraft, you connect gates together to create your bot's brain program. With just AND, OR, and NOT, you can build anything from a simple light-follower to a robot that navigates a maze.`,
  },
  {
    id: 'conveyor',
    title: 'Conveyor Belts — Moving Materials',
    icon: '〰️',
    category: 'machines',
    difficulty: 1,
    tags: 'conveyor,materials,transport,machine',
    text: `Conveyor belts move items from one place to another. They're powered by electric motors and come in different speeds. Chain them together to create sorting lines, ore processing plants, and factory assembly lines. Each segment can only hold a few items, so make sure your production rate matches your belt capacity. Use splitters and mergers to route items where they need to go.`,
  },
  {
    id: 'bot_basics',
    title: 'Building Your First Bot',
    icon: '🤖',
    category: 'bots',
    difficulty: 1,
    tags: 'bot,basics,tutorial,beginner',
    text: `Bots are autonomous machines that follow a program — or "brain" — that you design. Each bot needs a chassis, wheels or treads, a battery, and a brain module. The brain is a visual programming interface where you connect logic gates, sensors, and actuators. Start simple: build a bot that drives forward and stops when it detects a wall. Then add more complexity: light-following, resource gathering, racing!`,
  },
  {
    id: 'alloy',
    title: 'Alloys — Stronger Materials',
    icon: '🔩',
    category: 'materials',
    difficulty: 2,
    tags: 'alloy,materials,smelting,crafting',
    text: `An alloy is a mixture of metals that has better properties than any single metal. Steel (iron + carbon) is stronger than pure iron. Bronze (copper + tin) resists corrosion better than copper. In Scrapcraft, you need a furnace and the right ore combinations to create alloys. Higher-tier alloys unlock better tools, stronger bot chassis, and more efficient machines. Experiment with combinations to discover them all!`,
  },
  {
    id: 'circuit',
    title: 'Circuits — Connecting Your Machines',
    icon: '🔌',
    category: 'computing',
    difficulty: 2,
    tags: 'circuit,wiring,power,connection',
    text: `Circuits carry power and signals between machines. Power circuits (thick wires) carry electricity from generators to machines. Signal circuits (thin wires) carry sensor data and control signals. You can separate your power grid into different networks to manage load, and use switches to turn sections on/off. Always use fuses — a short circuit can destroy your machines and start fires!`,
  },
  {
    id: 'efficiency',
    title: 'Efficiency — Doing More With Less',
    icon: '📈',
    category: 'advanced',
    difficulty: 4,
    tags: 'efficiency,optimization,power,throughput',
    text: `Efficiency is the ratio of useful output to total input. A 50% efficient generator wastes half its fuel as heat. Upgrade your machines to improve efficiency — higher tiers waste less energy and process materials faster. But efficiency upgrades are expensive! Calculate the payback period before investing. Sometimes it's better to build more machines rather than upgrade existing ones.`,
  },
  {
    id: 'automation',
    title: 'Factory Automation — Bots That Build Bots',
    icon: '🏭',
    category: 'advanced',
    difficulty: 5,
    tags: 'automation,factory,bots,self-replication,ultimate',
    text: `The ultimate goal: a factory that builds itself. Start with a simple automated mining operation, then expand to automated smelting, then automated crafting, then automated bot assembly. Each step removes you from the loop — you become a manager instead of a worker. True full automation means your bots mine ore, smelt it, craft parts, and assemble new bots, creating an ever-expanding industrial empire!`,
  },
  {
    id: 'radio',
    title: 'Radio — Talking Between Bots',
    icon: '📡',
    category: 'computing',
    difficulty: 3,
    tags: 'radio,communication,bots,wireless',
    text: `Radio modules let your bots communicate wirelessly. A bot can transmit signals on a frequency, and any bot tuned to that frequency receives them. Use this to coordinate fleets: a scout bot can discover ore deposits and radio the coordinates back to your mining bot. Multiple bots can share information about the world, building up a collective map. Just watch out for radio interference!`,
  },
  {
    id: 'turing',
    title: 'Turing Completeness — Your Bots Are Computers',
    icon: '💻',
    category: 'advanced',
    difficulty: 5,
    tags: 'turing,computability,brain,theory',
    text: `The Scrapcraft brain system is Turing complete — meaning it can compute anything that any other computer can compute. In theory, your bots could simulate a web server, run a game of Snake, or calculate prime numbers. In practice, you're limited by the number of nodes and execution speed. But the point stands: the logic gates in Scrapcraft are equivalent to the logic gates in your phone. You're building real computers out of scrap metal!`,
  },
];

// ── Seed brains (example bot programs) ────────────────────────────

/**
 * Helper to create a brain program node.
 */
function node(id, label, type, config = {}) {
  return { id, label, type, ...config };
}

function connection(from, fromPort, to, toPort) {
  return { from, fromPort, to, toPort };
}

export const SEED_BRAINS = [
  {
    id: 'wall_avoider',
    name: 'Wall Avoider',
    description: 'Bot drives forward, turns when near a wall. Uses a distance sensor and simple logic to navigate around obstacles.',
    program_json: JSON.stringify({
      nodes: [
        node('start', 'Start', 'start'),
        node('s1', 'Distance Sensor', 'sensor', { type: 'distance', range: 3 }),
        node('cmp', 'Compare', 'compare', { threshold: 1.5, operation: 'less_than' }),
        node('mot_left', 'Left Motor', 'motor', { speed: 50 }),
        node('mot_right', 'Right Motor', 'motor', { speed: 50 }),
        node('turn', 'Turn', 'motor', { speed: 30, direction: 'right' }),
      ],
      connections: [
        connection('start', 'out', 's1', 'in'),
        connection('s1', 'out', 'cmp', 'in'),
        connection('cmp', 'false', 'mot_left', 'in'),
        connection('cmp', 'false', 'mot_right', 'in'),
        connection('cmp', 'true', 'turn', 'in'),
      ],
    }),
    author: 'Earl',
    rating: 4.5,
    tag: 'navigation',
  },
  {
    id: 'line_follower',
    name: 'Line Follower',
    description: 'Bot follows a dark line on a light surface. Uses two ground sensors to stay centered on the track.',
    program_json: JSON.stringify({
      nodes: [
        node('start', 'Start', 'start'),
        node('s_left', 'Left Ground Sensor', 'sensor', { type: 'ground', side: 'left' }),
        node('s_right', 'Right Ground Sensor', 'sensor', { type: 'ground', side: 'right' }),
        node('cmp_left', 'Compare Left', 'compare', { threshold: 0.5, operation: 'less_than' }),
        node('cmp_right', 'Compare Right', 'compare', { threshold: 0.5, operation: 'less_than' }),
        node('mot_left', 'Left Motor', 'motor', { speed: 60 }),
        node('mot_right', 'Right Motor', 'motor', { speed: 60 }),
        node('turn_left', 'Turn Left', 'motor', { speed: 40, multiplier: 0.5 }),
        node('turn_right', 'Turn Right', 'motor', { speed: 40, multiplier: 1.5 }),
      ],
      connections: [
        connection('start', 'out', 's_left', 'in'),
        connection('start', 'out', 's_right', 'in'),
        connection('s_left', 'out', 'cmp_left', 'in'),
        connection('s_right', 'out', 'cmp_right', 'in'),
        connection('cmp_left', 'false', 'mot_right', 'in'),
        connection('cmp_right', 'false', 'mot_left', 'in'),
        connection('cmp_left', 'true', 'turn_right', 'in'),
        connection('cmp_right', 'true', 'turn_left', 'in'),
      ],
    }),
    author: 'Earl',
    rating: 4.8,
    tag: 'navigation',
  },
  {
    id: 'light_seeker',
    name: 'Light Runner',
    description: 'Bot drives toward the brightest direction. Uses light sensors to find and move toward light sources.',
    program_json: JSON.stringify({
      nodes: [
        node('start', 'Start', 'start'),
        node('s_left', 'Left Light Sensor', 'sensor', { type: 'light', side: 'left' }),
        node('s_right', 'Right Light Sensor', 'sensor', { type: 'light', side: 'right' }),
        node('sub', 'Subtract', 'math', { operation: 'subtract' }),
        node('mot_left', 'Left Motor', 'motor', { speed: 50 }),
        node('mot_right', 'Right Motor', 'motor', { speed: 50 }),
      ],
      connections: [
        connection('start', 'out', 's_left', 'in'),
        connection('start', 'out', 's_right', 'in'),
        connection('s_left', 'out', 'sub', 'a'),
        connection('s_right', 'out', 'sub', 'b'),
        connection('sub', 'out', 'mot_left', 'in'),
        connection('sub', 'out', 'mot_right', 'in'),
      ],
    }),
    author: 'Earl',
    rating: 4.2,
    tag: 'navigation',
  },
  {
    id: 'ore_miner',
    name: 'Ore Miner',
    description: 'Bot patrols an area and mines ores it detects. Uses visual sensor to find ore deposits.',
    program_json: JSON.stringify({
      nodes: [
        node('start', 'Start', 'start'),
        node('s_ore', 'Ore Detector', 'sensor', { type: 'ore_detector', range: 5 }),
        node('cmp', 'Has Ore?', 'compare', { threshold: 0.5, operation: 'greater_than' }),
        node('fwd', 'Drive Forward', 'motor', { speed: 50 }),
        node('mine', 'Mine', 'actuator', { action: 'mine' }),
        node('turn', 'Random Turn', 'motor', { speed: 30, direction: 'random' }),
      ],
      connections: [
        connection('start', 'out', 's_ore', 'in'),
        connection('s_ore', 'out', 'cmp', 'in'),
        connection('cmp', 'false', 'fwd', 'in'),
        connection('cmp', 'true', 'mine', 'in'),
        connection('mine', 'done', 'fwd', 'in'),
      ],
    }),
    author: 'Earl',
    rating: 3.9,
    tag: 'mining',
  },
  {
    id: 'maze_runner',
    name: 'Maze Runner',
    description: 'Bot solves mazes using a right-hand-rule algorithm. Touches walls and follows them.',
    program_json: JSON.stringify({
      nodes: [
        node('start', 'Start', 'start'),
        node('s_front', 'Front Sensor', 'sensor', { type: 'distance', direction: 'front' }),
        node('s_right', 'Right Sensor', 'sensor', { type: 'distance', direction: 'right' }),
        node('cmp_front', 'Wall Ahead?', 'compare', { threshold: 1, operation: 'less_than' }),
        node('cmp_right', 'Wall Right?', 'compare', { threshold: 1, operation: 'greater_than' }),
        node('fwd', 'Move Forward', 'motor', { speed: 40 }),
        node('turn_left', 'Turn Left', 'motor', { speed: 30, direction: 'left' }),
        node('turn_right', 'Turn Right', 'motor', { speed: 30, direction: 'right' }),
      ],
      connections: [
        connection('start', 'out', 's_front', 'in'),
        connection('start', 'out', 's_right', 'in'),
        connection('s_front', 'out', 'cmp_front', 'in'),
        connection('s_right', 'out', 'cmp_right', 'in'),
        connection('cmp_front', 'false', 'cmp_right', 'next'),
        connection('cmp_right', 'true', 'fwd', 'in'),
        connection('cmp_right', 'false', 'turn_right', 'in'),
        connection('cmp_front', 'true', 'turn_left', 'in'),
      ],
    }),
    author: 'Earl',
    rating: 4.7,
    tag: 'navigation',
  },
];

// ── Seed recipes ──────────────────────────────────────────────────

export const SEED_RECIPES = [
  {
    id: 'basic_generator',
    title: 'Basic Generator',
    icon: '⚡',
    description: 'Burns coal to produce electricity. Low efficiency but cheap to build.',
    ingredients: JSON.stringify({ iron_ingot: 4, copper_wire: 2, gear: 1 }),
    output: 'generator',
    outputCount: 1,
    craftingTime: 5,
    tier: 1,
  },
  {
    id: 'electric_motor',
    title: 'Electric Motor',
    icon: '🔄',
    description: 'Converts electricity into rotational motion. Powers conveyor belts and bot wheels.',
    ingredients: JSON.stringify({ iron_ingot: 2, copper_wire: 3, magnet: 1 }),
    output: 'motor',
    outputCount: 1,
    craftingTime: 4,
    tier: 1,
  },
  {
    id: 'distance_sensor',
    title: 'Distance Sensor',
    icon: '📏',
    description: 'Measures distance to the nearest object. Essential for wall-avoiding bots.',
    ingredients: JSON.stringify({ iron_ingot: 1, copper_wire: 2, silicon: 1 }),
    output: 'distance_sensor',
    outputCount: 1,
    craftingTime: 3,
    tier: 2,
  },
  {
    id: 'bot_chassis',
    title: 'Bot Chassis',
    icon: '🔩',
    description: 'The frame of your bot. Holds all components together.',
    ingredients: JSON.stringify({ iron_ingot: 3, steel_plate: 2 }),
    output: 'chassis',
    outputCount: 1,
    craftingTime: 6,
    tier: 1,
  },
  {
    id: 'logic_and',
    title: 'AND Gate',
    icon: '&',
    description: 'Outputs true only when both inputs are true.',
    ingredients: JSON.stringify({ silicon: 1, copper_wire: 1 }),
    output: 'and_gate',
    outputCount: 1,
    craftingTime: 2,
    tier: 1,
  },
  {
    id: 'logic_or',
    title: 'OR Gate',
    icon: '|',
    description: 'Outputs true when either input is true.',
    ingredients: JSON.stringify({ silicon: 1, copper_wire: 1 }),
    output: 'or_gate',
    outputCount: 1,
    craftingTime: 2,
    tier: 1,
  },
  {
    id: 'conveyor_belt',
    title: 'Conveyor Belt',
    icon: '〰️',
    description: 'Moves items from one place to another. Powered by electric motor.',
    ingredients: JSON.stringify({ iron_ingot: 2, rubber: 1, motor: 1 }),
    output: 'conveyor',
    outputCount: 8,
    craftingTime: 4,
    tier: 2,
  },
  {
    id: 'steel_alloy',
    title: 'Steel Alloy',
    icon: '🔩',
    description: 'Stronger than iron. Used for advanced machines and tools.',
    ingredients: JSON.stringify({ iron_ingot: 1, coal: 2 }),
    output: 'steel_ingot',
    outputCount: 1,
    craftingTime: 8,
    tier: 2,
  },
  {
    id: 'radio_module',
    title: 'Radio Module',
    icon: '📡',
    description: 'Enables wireless communication between bots.',
    ingredients: JSON.stringify({ copper_wire: 3, silicon: 2, antenna: 1 }),
    output: 'radio',
    outputCount: 1,
    craftingTime: 6,
    tier: 3,
  },
  {
    id: 'advanced_processor',
    title: 'Advanced Processor',
    icon: '💠',
    description: 'Faster bot brain processing. Enables more complex programs.',
    ingredients: JSON.stringify({ silicon: 4, gold_wire: 2, diamond: 1 }),
    output: 'cpu_advanced',
    outputCount: 1,
    craftingTime: 15,
    tier: 4,
  },
  {
    id: 'solar_panel',
    title: 'Solar Panel',
    icon: '☀️',
    description: 'Generates electricity from sunlight. Free energy during daytime.',
    ingredients: JSON.stringify({ silicon: 4, copper_wire: 2, glass: 2 }),
    output: 'solar_panel',
    outputCount: 1,
    craftingTime: 8,
    tier: 3,
  },
];

// ── Database seeding function ─────────────────────────────────────

/**
 * Seed the D1 database with default codex entries, brains, and recipes.
 * Safe to call multiple times — uses INSERT OR IGNORE.
 *
 * @param {import('./game-api').default} db - D1 database binding
 */
export async function seedDatabase(db) {
  // Create seed tables if they don't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS codex (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '📖',
      text TEXT NOT NULL,
      category TEXT,
      difficulty INTEGER DEFAULT 1,
      tags TEXT
    );
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      icon TEXT DEFAULT '📦',
      description TEXT,
      ingredients TEXT,
      output TEXT,
      outputCount INTEGER DEFAULT 1,
      craftingTime INTEGER DEFAULT 5,
      tier INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS brains (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      program_json TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'Anonymous',
      rating REAL DEFAULT 0,
      tag TEXT,
      downloads INTEGER DEFAULT 0,
      created TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed codex
  for (const entry of SEED_CODEX) {
    const tags = Array.isArray(entry.tags) ? entry.tags.join(',') : (entry.tags || '');
    await db
      .prepare(
        'INSERT OR IGNORE INTO codex (id, title, icon, text, category, difficulty, tags) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(entry.id, entry.title, entry.icon, entry.text, entry.category, entry.difficulty, tags)
      .run();
  }

  // Seed brains
  for (const brain of SEED_BRAINS) {
    await db
      .prepare(
        'INSERT OR IGNORE INTO brains (id, name, description, program_json, author, rating, tag) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(brain.id, brain.name, brain.description, brain.program_json, brain.author, brain.rating, brain.tag)
      .run();
  }

  // Seed recipes
  for (const recipe of SEED_RECIPES) {
    await db
      .prepare(
        'INSERT OR IGNORE INTO recipes (id, title, icon, description, ingredients, output, outputCount, craftingTime, tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        recipe.id,
        recipe.title,
        recipe.icon,
        recipe.description,
        recipe.ingredients,
        recipe.output,
        recipe.outputCount,
        recipe.craftingTime,
        recipe.tier
      )
      .run();
  }

  return {
    codexSeeded: SEED_CODEX.length,
    brainsSeeded: SEED_BRAINS.length,
    recipesSeeded: SEED_RECIPES.length,
  };
}

/**
 * API handler: POST /api/v1/seed
 * Call to manually seed the database via HTTP.
 */
export async function handleSeed(request, env) {
  try {
    const db = env.SCRAPCRAFT_DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'D1 binding not available' }), {
        status: 501,
        headers: { 'content-type': 'application/json' },
      });
    }
    const result = await seedDatabase(db);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
