/**
 * ───────────────────────────────────────────────────────────────────────────
 *  RECIPES / ITEMS DATA INTEGRITY TESTS  —  run via run-tests.mjs (`npm test`)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * data/recipes.js and data/items.js are hand-authored content tables with no
 * type checker behind them. A typo'd ingredient id, a duplicate object key
 * (silently shadowed by JS — no error, no warning), or a tool that's never
 * marked `tool:true` all fail silently at runtime: the recipe just never
 * looks right in the UI, or a duplicate key quietly discards half its data.
 * These tests read the RAW SOURCE TEXT (not just the parsed export) so a
 * reintroduced duplicate key is actually caught, since a duplicate key is
 * invisible once JS has already collapsed it into a single property.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { RECIPES, getRecipe, getRecipesForStation } from '../recipes.js';
import { ITEMS, getItem } from '../items.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Top-level `key: {` object keys in a data file, in source order (dupes included). */
function topLevelKeys(sourcePath) {
  const src = readFileSync(sourcePath, 'utf8');
  return [...src.matchAll(/^\s{2}(\w+):\s*\{/gm)].map(m => m[1]);
}

function duplicates(list) {
  const seen = new Map();
  for (const k of list) seen.set(k, (seen.get(k) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

export function runDataIntegrityTests(ok) {
  // ── 1. No duplicate top-level keys (a silent shadowing bug) ────────────────
  console.log('\nData integrity · no duplicate keys');
  {
    const itemDupes = duplicates(topLevelKeys(path.join(__dirname, '../items.js')));
    ok('items.js has no duplicate item ids', itemDupes.length === 0, itemDupes.join(', '));

    const recipeIdDupes = duplicates(RECIPES.map(r => r.id));
    ok('recipes.js has no duplicate recipe ids', recipeIdDupes.length === 0, recipeIdDupes.join(', '));
  }

  // ── 2. Every recipe references only real items ──────────────────────────
  console.log('\nData integrity · recipes reference real items');
  {
    const badOutputs = RECIPES.filter(r => !getItem(r.output));
    ok('every recipe output id exists in ITEMS', badOutputs.length === 0,
       badOutputs.map(r => `${r.id}->${r.output}`).join(', '));

    const badIngredients = [];
    for (const r of RECIPES) {
      for (const id of Object.keys(r.ingredients ?? {})) {
        if (!getItem(id)) badIngredients.push(`${r.id}:${id}`);
      }
    }
    ok('every recipe ingredient id exists in ITEMS', badIngredients.length === 0, badIngredients.join(', '));

    const toolRecipes = RECIPES.filter(r => r.tool);
    const badTools = toolRecipes.filter(r => !getItem(r.tool));
    ok('every recipe.tool id exists in ITEMS', badTools.length === 0,
       badTools.map(r => `${r.id}->${r.tool}`).join(', '));
    const untaggedTools = toolRecipes.filter(r => getItem(r.tool) && !getItem(r.tool).tool);
    ok('every recipe.tool id is actually marked tool:true in ITEMS', untaggedTools.length === 0,
       untaggedTools.map(r => `${r.id}->${r.tool}`).join(', '));

    // unlockAfter must reference a real ITEM id — getAvailableRecipes checks
    // it against player.crafted, which only ever stores crafted item ids,
    // never recipe ids (see CraftingSystem tests for the "reachability"
    // behavioral proof; this is the static-data half of that guarantee).
    const badGates = RECIPES.filter(r => r.unlockAfter && !getItem(r.unlockAfter));
    ok('every recipe.unlockAfter value is a real item id', badGates.length === 0,
       badGates.map(r => `${r.id}->${r.unlockAfter}`).join(', '));
  }

  // ── 3. Sane quantities ──────────────────────────────────────────────────
  console.log('\nData integrity · sane quantities');
  {
    const badQty = RECIPES.filter(r => !Number.isInteger(r.qty) || r.qty < 1);
    ok('every recipe.qty is a positive integer', badQty.length === 0, badQty.map(r => r.id).join(', '));

    const badIngredientQty = [];
    for (const r of RECIPES) {
      for (const [id, qty] of Object.entries(r.ingredients ?? {})) {
        if (!Number.isInteger(qty) || qty < 1) badIngredientQty.push(`${r.id}:${id}=${qty}`);
      }
    }
    ok('every ingredient quantity is a positive integer', badIngredientQty.length === 0, badIngredientQty.join(', '));

    ok('every recipe declares at least one ingredient',
       RECIPES.every(r => Object.keys(r.ingredients ?? {}).length > 0));
  }

  // ── 4. getRecipe / getRecipesForStation ─────────────────────────────────
  console.log('\nData integrity · lookup helpers');
  {
    ok('getRecipe finds a known id', getRecipe('r_wrench')?.output === 'wrench');
    ok('getRecipe returns null for an unknown id', getRecipe('r_nope_not_real') === null);

    const anyStation = getRecipesForStation('any');
    ok('getRecipesForStation("any") returns every recipe', anyStation.length === RECIPES.length);

    const forge = getRecipesForStation('forge');
    ok('getRecipesForStation("forge") only returns forge + any-station recipes',
       forge.every(r => r.station === 'forge' || r.station === 'any'));
    ok('getRecipesForStation("forge") excludes workbench-only recipes',
       !forge.some(r => r.id === 'r_night_goggles'));
    ok('getRecipesForStation("forge") includes at least one forge-specific recipe',
       forge.some(r => r.station === 'forge'));
  }

  // ── 5. Every declared tool item is actually used by at least one recipe ──
  console.log('\nData integrity · no orphaned tools');
  {
    const toolIds = Object.entries(ITEMS).filter(([, def]) => def.tool).map(([id]) => id);
    const usedTools = new Set(RECIPES.filter(r => r.tool).map(r => r.tool));
    // Not every tool item must gate a recipe (some are passive/wearable
    // effects), so this is informational rather than a hard failure list —
    // but the four foundational hand tools absolutely must gate something.
    for (const foundational of ['wrench', 'hammer', 'blowtorch', 'pliers']) {
      ok(`foundational tool "${foundational}" gates at least one recipe`, usedTools.has(foundational));
    }
    ok('sanity: at least one declared tool exists', toolIds.length > 0);
  }
}
