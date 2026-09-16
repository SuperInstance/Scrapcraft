/**
 * Shipped-content integrity validator — run with:
 *   node src/maker/__tests__/content-integrity.mjs
 *
 * No framework. Pure Node ES modules (package.json has "type":"module").
 *
 * WHY THIS EXISTS
 * ────────────────
 * A Spark offline recipe once shipped referencing sensors ("item_nearby",
 * "item_collected") that were never added to the SENSORS registry. Nothing
 * caught it: the recipe was valid-looking JS, and compile() only runs when
 * a kid actually asks Spark for that program. This file is the guard —
 * it EAGERLY compiles/validates every piece of shipped content against the
 * real registries (primitives.js SENSORS/ACTUATORS, data/items.js ITEMS,
 * data/recipes.js RECIPES, learning/concepts.js CONCEPTS) so a dangling
 * reference fails CI instead of failing a kid at the worst possible moment.
 *
 * WHAT THIS CHECKS
 * ────────────────
 *   1. Every Spark offline recipe (SparkOfflineRecipes.js) compiles cleanly
 *      — this is exactly the class of bug that motivated this file.
 *   2. Every EXAMPLE_* seed program (TileProgram.js) compiles cleanly.
 *   3. data/recipes.js: every `output`, `ingredients` key, `tool`, and
 *      `unlockAfter` value is a real item id in data/items.js. (`unlockAfter`
 *      is checked against ITEMS because CraftingSystem.getAvailableRecipes
 *      gates on `player.crafted` — a Set of crafted OUTPUT item ids, never
 *      recipe ids — so a recipe id there can never unlock; see fixed bugs.)
 *   4. data/blocks.js: every block `drop`/`altDrop` is a real item id.
 *   5. quests/data/*.json: every CRAFT/MINE objective `item` and every
 *      rewards.loot[].item is a real item id (MINE additionally allows the
 *      documented "crystal_ore" sentinel, which Tracker.js polls via the
 *      crystalMined stat rather than itemsCollected — not an item id).
 *   6. learning/data/unit1.json: lesson `concepts[]`, `teachBack.conceptId`,
 *      and `rubric.tiers[].concepts[]` are real concept ids (concepts.js);
 *      `teachBack.liveQuestionId` (when non-null) is a real question id in
 *      teachback.json; `brokenBotScenarios[]` are real scenario ids in
 *      brokenbots.json; `quests[]` are real quest ids (quests/data CAMPAIGN).
 *   7. learning/data/teachback.json: every question's `conceptId` is real.
 *
 * WHAT THIS DELIBERATELY DOES NOT CHECK (documented, not just omitted)
 * ─────────────────────────────────────────────────────────────────────
 *   - Quest-to-quest cross references (prerequisites.quests, spine.json
 *     chapters[].quests) — already guarded by validateSpine/validateCampaign
 *     in quests/__tests__/quest-tests.mjs (stale-quest-reference rejection).
 *   - Actuator param ENUM values (e.g. an led `state` outside its schema) —
 *     a real but different bug class (invalid param value, not a dangling
 *     ID reference); withDefaults() silently coerces these to the schema
 *     default rather than failing compile, so it doesn't crash a kid's
 *     program, just silently changes behavior. Out of scope here.
 *   - unit1.json's `bigIdeas` (ai4k12 numbers) and `chapters` (spine chapter
 *     numbers) — free-standing integers without a clean id registry to
 *     check against; flagged as ambiguous rather than guessed at.
 *   - Narrative/prose fields (brief, teaching.kidPhrase, teaching.memory,
 *     foremanQuip, brokenbots.json symptom/hint text, etc.) — free text,
 *     never registry ids.
 */

import { compile } from '../TileCompiler.js';
import {
  TileProgram, T,
  EXAMPLE_WALL_AVOIDER, EXAMPLE_LIGHT_RUNNER, EXAMPLE_LINE_FOLLOWER, EXAMPLE_SQUARE,
  EXAMPLE_ORE_HUNTER, EXAMPLE_BATTERY_SAVER, EXAMPLE_WAYPOINT_NAV, EXAMPLE_BUMP_COUNTER,
} from '../TileProgram.js';
import { OFFLINE_RECIPES } from '../../SparkOfflineRecipes.js';
import { ITEMS } from '../../data/items.js';
import { BLOCK_DEF } from '../../data/blocks.js';
import { RECIPES } from '../../data/recipes.js';
import { CAMPAIGN } from '../../quests/data/index.js';
import { isConceptId } from '../../learning/concepts.js';

import earlChain from '../../quests/data/earl-chain.json' with { type: 'json' };
import boltArc from '../../quests/data/bolt-arc.json' with { type: 'json' };
import magmaArc from '../../quests/data/magma-arc.json' with { type: 'json' };
import junoArc from '../../quests/data/juno-arc.json' with { type: 'json' };
import rivetArc from '../../quests/data/rivet-arc.json' with { type: 'json' };
import finale from '../../quests/data/finale.json' with { type: 'json' };
import chapterQuests from '../../quests/data/chapter-quests.json' with { type: 'json' };
import sideQuests from '../../quests/data/side-quests.json' with { type: 'json' };
import yardArc from '../../quests/data/yard-arc.json' with { type: 'json' };

import unit1 from '../../learning/data/unit1.json' with { type: 'json' };
import teachback from '../../learning/data/teachback.json' with { type: 'json' };
import brokenbots from '../../learning/data/brokenbots.json' with { type: 'json' };

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
}

const ITEM_IDS = new Set(Object.keys(ITEMS));
// MINE objectives poll a lifetime stat instead of itemsCollected for ore —
// documented in Tracker.js (`o.item === 'crystal_ore'` → s.crystalMined).
const MINE_ITEM_SENTINELS = new Set(['crystal_ore']);

// ── 1+2. Compile every shipped Spark recipe + example program ──────────────
console.log('\nShipped tile programs compile cleanly');
{
  for (const r of OFFLINE_RECIPES) {
    const res = compile(r.program);
    ok(`Spark offline recipe "${r.program.name}" compiles`, res.ok && res.errors.length === 0,
       JSON.stringify(res.errors));
  }

  const examples = {
    EXAMPLE_WALL_AVOIDER, EXAMPLE_LIGHT_RUNNER, EXAMPLE_LINE_FOLLOWER, EXAMPLE_SQUARE,
    EXAMPLE_ORE_HUNTER, EXAMPLE_BATTERY_SAVER, EXAMPLE_WAYPOINT_NAV, EXAMPLE_BUMP_COUNTER,
  };
  for (const [name, program] of Object.entries(examples)) {
    const res = compile(program);
    ok(`${name} compiles`, res.ok && res.errors.length === 0, JSON.stringify(res.errors));
  }
}

// ── 3. data/recipes.js — every item-shaped field is a real item id ─────────
console.log('\nrecipes.js references real items');
{
  for (const r of RECIPES) {
    ok(`${r.id}: output "${r.output}" is a real item`, ITEM_IDS.has(r.output));
    for (const ing of Object.keys(r.ingredients ?? {})) {
      ok(`${r.id}: ingredient "${ing}" is a real item`, ITEM_IDS.has(ing));
    }
    if (r.tool) ok(`${r.id}: tool "${r.tool}" is a real item`, ITEM_IDS.has(r.tool));
    // unlockAfter gates on player.crafted, a Set of crafted OUTPUT item ids
    // (see CraftingSystem.getAvailableRecipes) — never recipe ids.
    if (r.unlockAfter) ok(`${r.id}: unlockAfter "${r.unlockAfter}" is a real item`, ITEM_IDS.has(r.unlockAfter));
  }
}

// ── 4. data/blocks.js — mining drops are real items ─────────────────────────
console.log('\nblocks.js drops reference real items');
{
  for (const [blockId, def] of Object.entries(BLOCK_DEF)) {
    if (def.drop) ok(`block ${blockId} ("${def.name}"): drop "${def.drop}" is a real item`, ITEM_IDS.has(def.drop));
    if (def.altDrop) ok(`block ${blockId} ("${def.name}"): altDrop "${def.altDrop}" is a real item`, ITEM_IDS.has(def.altDrop));
  }
}

// ── 5. quests/data/*.json — CRAFT/MINE objectives + loot rewards ───────────
console.log('\nQuest JSON references real items');
{
  const files = {
    'earl-chain.json': earlChain, 'bolt-arc.json': boltArc, 'magma-arc.json': magmaArc,
    'juno-arc.json': junoArc, 'rivet-arc.json': rivetArc, 'finale.json': finale,
    'chapter-quests.json': chapterQuests, 'side-quests.json': sideQuests, 'yard-arc.json': yardArc,
  };
  for (const [file, data] of Object.entries(files)) {
    for (const q of data.quests ?? []) {
      for (const o of q.objectives ?? []) {
        if (o.type === 'CRAFT') {
          ok(`${file} ${q.id}: CRAFT objective item "${o.item}" is a real item`, ITEM_IDS.has(o.item));
        }
        if (o.type === 'MINE') {
          ok(`${file} ${q.id}: MINE objective item "${o.item}" is a real item or documented sentinel`,
             ITEM_IDS.has(o.item) || MINE_ITEM_SENTINELS.has(o.item));
        }
      }
      for (const loot of q.rewards?.loot ?? []) {
        ok(`${file} ${q.id}: reward loot item "${loot.item}" is a real item`, ITEM_IDS.has(loot.item));
      }
    }
  }
}

// ── 6+7. learning/data/*.json — concept/quest/question/scenario refs ───────
console.log('\nLearning JSON references real concepts/quests/questions/scenarios');
{
  const questIds = new Set(CAMPAIGN.map(q => q.id));
  const teachbackIds = new Set(teachback.questions.map(q => q.id));
  const scenarioIds = new Set(brokenbots.scenarios.map(s => s.id));

  for (const l of unit1.lessons ?? []) {
    for (const c of l.concepts ?? []) {
      ok(`unit1.json ${l.id}: concept "${c}" is a real concept id`, isConceptId(c));
    }
    if (l.teachBack?.conceptId) {
      ok(`unit1.json ${l.id}: teachBack.conceptId "${l.teachBack.conceptId}" is a real concept id`,
         isConceptId(l.teachBack.conceptId));
    }
    if (l.teachBack?.liveQuestionId != null) {
      ok(`unit1.json ${l.id}: teachBack.liveQuestionId "${l.teachBack.liveQuestionId}" exists in teachback.json`,
         teachbackIds.has(l.teachBack.liveQuestionId));
    }
    for (const s of l.brokenBotScenarios ?? []) {
      ok(`unit1.json ${l.id}: brokenBotScenarios "${s}" exists in brokenbots.json`, scenarioIds.has(s));
    }
    for (const qid of l.quests ?? []) {
      ok(`unit1.json ${l.id}: quest "${qid}" exists in the campaign`, questIds.has(qid));
    }
  }
  for (const tier of unit1.rubric?.tiers ?? []) {
    for (const c of tier.concepts ?? []) {
      ok(`unit1.json rubric[${tier.tier}]: concept "${c}" is a real concept id`, isConceptId(c));
    }
  }
  for (const q of teachback.questions ?? []) {
    ok(`teachback.json ${q.id}: conceptId "${q.conceptId}" is a real concept id`, isConceptId(q.conceptId));
  }
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
