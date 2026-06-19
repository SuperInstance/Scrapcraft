// Each recipe: { id, output, qty, ingredients:{itemId:count}, station, tool, unlockAfter }
// station: 'any' | 'workbench' | 'forge' | 'smelter'
// tool: optional required tool in inventory
export const RECIPES = [
  // ── Tier 1: Hand tools ──
  {
    id: 'r_wrench',
    output: 'wrench',
    qty: 1,
    ingredients: { iron_scrap: 3, wood_plank: 1 },
    station: 'any',
    tier: 1,
  },
  {
    id: 'r_hammer',
    output: 'hammer',
    qty: 1,
    ingredients: { iron_scrap: 2, wood_plank: 2 },
    station: 'any',
    tier: 1,
  },
  {
    id: 'r_pliers',
    output: 'pliers',
    qty: 1,
    ingredients: { iron_scrap: 2, copper_wire: 1 },
    station: 'any',
    tier: 1,
  },
  {
    id: 'r_blowtorch',
    output: 'blowtorch',
    qty: 1,
    ingredients: { iron_scrap: 3, copper_wire: 2, fuel_can: 1 },
    station: 'workbench',
    tier: 1,
  },

  // ── Tier 2: Devices ──
  {
    id: 'r_pipe_cannon',
    output: 'pipe_cannon',
    qty: 1,
    ingredients: { iron_scrap: 5, rubber_chunk: 1, spring: 2 },
    station: 'workbench',
    tool: 'wrench',
    tier: 2,
    foremanQuip: "That's not a toy, kid. Well... it is, but a dangerous one.",
  },
  {
    id: 'r_battery_pack',
    output: 'battery_pack',
    qty: 2,
    ingredients: { battery_dead: 2, copper_wire: 3, rubber_chunk: 1 },
    station: 'workbench',
    tool: 'pliers',
    tier: 2,
  },
  {
    id: 'r_spring_boots',
    output: 'spring_boots',
    qty: 1,
    ingredients: { spring: 4, rubber_chunk: 2, iron_scrap: 2 },
    station: 'workbench',
    tool: 'hammer',
    tier: 2,
    foremanQuip: "I wore something like those once. Bounced straight into a dumpster. Worth it.",
  },
  {
    id: 'r_robot_arm',
    output: 'robot_arm',
    qty: 1,
    ingredients: { iron_scrap: 4, gear_small: 3, copper_wire: 2 },
    station: 'forge',
    tool: 'blowtorch',
    tier: 2,
    foremanQuip: "Articulated and everything. You've outdone yourself. Don't tell anyone I said that.",
  },
  {
    id: 'r_generator',
    output: 'generator',
    qty: 1,
    ingredients: { iron_scrap: 6, gear_small: 4, fuel_can: 2, copper_wire: 3 },
    station: 'forge',
    tool: 'wrench',
    tier: 2,
    foremanQuip: "She's ugly, she's loud, she'll run forever. Just like my ex.",
  },
  {
    id: 'r_radio_beacon',
    output: 'radio_beacon',
    qty: 1,
    ingredients: { circuit_board: 2, copper_wire: 4, glass_shard: 1, iron_scrap: 2 },
    station: 'workbench',
    tool: 'pliers',
    tier: 2,
    foremanQuip: "You can call me now. I'm choosing to be flattered, not annoyed. Today.",
  },

  // ── Tier 3: Advanced ──
  {
    id: 'r_go_kart',
    output: 'go_kart',
    qty: 1,
    ingredients: { iron_scrap: 8, rubber_chunk: 4, gear_small: 6, wood_plank: 4 },
    station: 'forge',
    tool: 'wrench',
    tier: 3,
    unlockAfter: 'generator',
    foremanQuip: "I'm not putting a speed limit on that. You'll figure out why limits exist on your own.",
  },
  {
    id: 'r_robot_helper',
    output: 'robot_helper',
    qty: 1,
    ingredients: { robot_arm: 2, circuit_board: 4, gear_small: 6, battery_pack: 2, copper_wire: 5 },
    station: 'smelter',
    tool: 'blowtorch',
    tier: 3,
    unlockAfter: 'robot_arm',
    foremanQuip: "It's alive! Or close enough. Don't get attached. (You're going to get attached.)",
  },
  {
    id: 'r_flying_machine',
    output: 'flying_machine',
    qty: 1,
    ingredients: {
      iron_scrap: 12, generator: 1, robot_arm: 2,
      circuit_board: 6, rubber_chunk: 4, fuel_can: 4, glass_shard: 3
    },
    station: 'smelter',
    tool: 'blowtorch',
    tier: 3,
    unlockAfter: 'go_kart',
    foremanQuip: "I take back every dumb thing I ever said about you. This is genuinely impressive. Now DON'T FLY IT INTO THE SHED.",
  },
];

export function getRecipe(id) {
  return RECIPES.find(r => r.id === id) ?? null;
}

export function getRecipesForStation(station) {
  if (station === 'any') return RECIPES;
  return RECIPES.filter(r => r.station === 'any' || r.station === station);
}
