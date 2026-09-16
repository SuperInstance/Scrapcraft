/**
 * ───────────────────────────────────────────────────────────────────────────
 *  CRAFTING SYSTEM TESTS  —  run via run-tests.mjs (`npm test`)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * CraftingSystem itself has no DOM/three dependency — it only calls methods
 * on whatever `player`/`foreman` collaborators it's given, so real recipe
 * data (data/recipes.js, data/items.js) is exercised against lightweight
 * fake collaborators instead of the full Player/Foreman classes.
 *
 * Covers: successful crafting consumes exactly the right ingredients and
 * yields the right output+qty, a craft attempt with insufficient materials
 * is rejected WITHOUT partially consuming inventory, tool-gated recipes are
 * rejected without the tool and accepted with it, unknown recipe ids are
 * rejected, and getAvailableRecipes' station + unlockAfter gating.
 */

import { CraftingSystem } from '../CraftingSystem.js';
import { RECIPES, getRecipe } from '../../data/recipes.js';
import { getItem } from '../../data/items.js';

/** Minimal stand-in for Player — just enough surface for CraftingSystem. */
class FakePlayer {
  constructor(inventory = {}, tools = []) {
    this.inv = { ...inventory };
    this.tools = new Set(tools);
    this.crafted = new Set();
    this.addCalls = [];
    this.removeCalls = [];
  }
  countItem(id) { return this.inv[id] ?? 0; }
  hasTool(id) { return this.tools.has(id); }
  removeItem(id, qty = 1) {
    this.removeCalls.push([id, qty]);
    this.inv[id] = (this.inv[id] ?? 0) - qty;
    return true;
  }
  addItem(id, qty = 1) {
    this.addCalls.push([id, qty]);
    this.inv[id] = (this.inv[id] ?? 0) + qty;
    return 0; // no overflow dropped
  }
}

class FakeForeman {
  constructor() { this.lines = []; this.events = []; }
  sayLine(line) { this.lines.push(line); }
  onEvent(kind, data) { this.events.push({ kind, data }); }
}

export function runCraftingSystemTests(ok) {
  // ── 1. A well-stocked craft consumes exact ingredient quantities ──────────
  console.log('\nCraftingSystem · successful craft');
  {
    const recipe = getRecipe('r_wrench'); // iron_scrap:3, wood_plank:1 → wrench x1, no tool
    const player = new FakePlayer({ iron_scrap: 5, wood_plank: 2 });
    const foreman = new FakeForeman();
    const cs = new CraftingSystem(player, foreman);

    const result = cs.craft('r_wrench');
    ok('craft() reports ok:true', result.ok === true, JSON.stringify(result));
    ok('craft() reports the correct output/qty', result.output === recipe.output && result.qty === recipe.qty);
    ok('exactly 3 iron_scrap consumed (not all 5)', player.inv.iron_scrap === 2, `iron_scrap=${player.inv.iron_scrap}`);
    ok('exactly 1 wood_plank consumed (not both)', player.inv.wood_plank === 1, `wood_plank=${player.inv.wood_plank}`);
    ok('addItem called with the recipe output+qty', player.addCalls.some(([id, qty]) => id === 'wrench' && qty === 1));
    ok('crafted output is recorded on the player', player.crafted.has('wrench'));
    ok('a craft_<output> foreman event fires', foreman.events.some(e => e.kind === 'craft_wrench'));
  }

  // ── 2. Insufficient materials: rejected, and NOTHING is consumed ──────────
  console.log('\nCraftingSystem · insufficient materials');
  {
    const player = new FakePlayer({ iron_scrap: 1, wood_plank: 1 }); // needs 3 iron_scrap
    const foreman = new FakeForeman();
    const cs = new CraftingSystem(player, foreman);

    const result = cs.craft('r_wrench');
    ok('craft() reports ok:false when short on materials', result.ok === false);
    ok('failure reason mentions missing materials/tool', result.reason === 'Missing materials or tool');
    ok('no ingredients were removed on a rejected craft', player.removeCalls.length === 0,
       JSON.stringify(player.removeCalls));
    ok('inventory counts are untouched after a rejected craft',
       player.inv.iron_scrap === 1 && player.inv.wood_plank === 1);
    ok('nothing was added to the player on a rejected craft', player.addCalls.length === 0);
    ok('output was not marked crafted', !player.crafted.has('wrench'));
  }

  // ── 3. Tool-gated recipe: rejected without the tool, accepted with it ─────
  console.log('\nCraftingSystem · tool gating');
  {
    const recipe = getRecipe('r_pipe_cannon'); // needs a wrench
    ok('sanity: r_pipe_cannon requires a tool', !!recipe.tool);

    const noTool = new FakePlayer({ iron_scrap: 10, rubber_chunk: 5, spring: 5 });
    const csNoTool = new CraftingSystem(noTool, new FakeForeman());
    const failed = csNoTool.craft('r_pipe_cannon');
    ok('materials alone are not enough — the tool is required', failed.ok === false);

    const withTool = new FakePlayer({ iron_scrap: 10, rubber_chunk: 5, spring: 5 }, ['wrench']);
    const csWithTool = new CraftingSystem(withTool, new FakeForeman());
    const succeeded = csWithTool.craft('r_pipe_cannon');
    ok('same materials + the required tool succeeds', succeeded.ok === true, JSON.stringify(succeeded));
  }

  // ── 4. Unknown recipe id ───────────────────────────────────────────────────
  console.log('\nCraftingSystem · unknown recipe');
  {
    const cs = new CraftingSystem(new FakePlayer(), new FakeForeman());
    const result = cs.craft('r_does_not_exist');
    ok('unknown recipe id is rejected', result.ok === false && result.reason === 'Unknown recipe');
  }

  // ── 5. Multi-output qty and leftover pass-through ──────────────────────────
  console.log('\nCraftingSystem · output quantity + overflow pass-through');
  {
    const recipe = getRecipe('r_signal_flare'); // fuel_can:1, copper_wire:2 → x3
    ok('sanity: r_signal_flare yields 3', recipe.qty === 3);
    const player = new FakePlayer({ fuel_can: 1, copper_wire: 2 });
    // Simulate a full inventory: addItem reports 1 unit dropped on the floor.
    player.addItem = (id, qty) => { player.addCalls.push([id, qty]); return 1; };
    const cs = new CraftingSystem(player, new FakeForeman());
    const result = cs.craft('r_signal_flare');
    ok('craft() requests the full recipe qty from addItem',
       player.addCalls.some(([id, qty]) => id === 'signal_flare' && qty === 3));
    ok('craft() passes addItem\'s overflow through as "dropped"', result.dropped === 1, JSON.stringify(result));
  }

  // ── 6. getAvailableRecipes: station filter + canCraft flag ─────────────────
  console.log('\nCraftingSystem · getAvailableRecipes station filter');
  {
    const player = new FakePlayer({ iron_scrap: 20, wood_plank: 20, copper_wire: 20 });
    const cs = new CraftingSystem(player, new FakeForeman());

    const forgeList = cs.getAvailableRecipes('forge', new Set());
    ok('forge station list excludes workbench-only recipes',
       !forgeList.some(r => r.id === 'r_night_goggles')); // workbench, tool pliers
    ok('forge station list includes forge recipes',
       forgeList.some(r => r.id === 'r_steel_cable'));
    ok('forge station list includes "any"-station recipes too',
       forgeList.some(r => r.station === 'any'));

    const wrenchEntry = forgeList.find(r => r.id === 'r_wrench');
    ok('"any" station recipe carries a canCraft flag', wrenchEntry && typeof wrenchEntry.canCraft === 'boolean');
    ok('canCraft is true when materials are on hand', wrenchEntry.canCraft === true);

    const poor = new FakePlayer({});
    const poorList = new CraftingSystem(poor, new FakeForeman()).getAvailableRecipes('any', new Set());
    const poorWrench = poorList.find(r => r.id === 'r_wrench');
    ok('canCraft is false with an empty inventory', poorWrench.canCraft === false);
  }

  // ── 7. getAvailableRecipes: unlockAfter gating ─────────────────────────────
  console.log('\nCraftingSystem · unlockAfter gating');
  {
    const player = new FakePlayer({});
    const cs = new CraftingSystem(player, new FakeForeman());

    const locked = cs.getAvailableRecipes('any', new Set()); // nothing crafted yet
    ok('a gated recipe is hidden before its prerequisite is crafted',
       !locked.some(r => r.id === 'r_go_kart')); // unlockAfter: 'generator'

    const unlocked = cs.getAvailableRecipes('forge', new Set(['generator']));
    ok('the same recipe appears once its unlockAfter item has been crafted',
       unlocked.some(r => r.id === 'r_go_kart'));
  }

  // ── 8. Data integrity that CraftingSystem's gating logic depends on ───────
  // (getAvailableRecipes checks unlockedItems.has(r.unlockAfter) against
  // player.crafted, which only ever holds CRAFTED ITEM ids — never recipe
  // ids. A recipe gated on a recipe id instead of an item id can never
  // unlock. See src/data/recipes.js history: 18 Maker-Lab recipes had this
  // exact bug (unlockAfter: 'r_tin_brain' instead of 'tin_brain', etc.).)
  console.log('\nCraftingSystem · unlockAfter values must be reachable item ids');
  {
    const gated = RECIPES.filter(r => r.unlockAfter);
    ok('at least one recipe uses unlockAfter (sanity)', gated.length > 0);

    const badGates = gated.filter(r => !getItem(r.unlockAfter));
    ok('every unlockAfter value is a real item id (never a recipe id)',
       badGates.length === 0, badGates.map(r => `${r.id}->${r.unlockAfter}`).join(', '));

    // Simulate actually reaching every gate: with the prerequisite item in
    // player.crafted, the gated recipe must show up at its own station.
    const csAny = new CraftingSystem(new FakePlayer({}), new FakeForeman());
    for (const r of gated) {
      const unlockedItems = new Set([r.unlockAfter]);
      const visible = csAny.getAvailableRecipes(r.station, unlockedItems).some(v => v.id === r.id);
      ok(`"${r.id}" becomes reachable once "${r.unlockAfter}" is in player.crafted`, visible);
    }
  }
}
