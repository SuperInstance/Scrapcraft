/**
 * ───────────────────────────────────────────────────────────────────────────
 *  QUEST SCHEMA  —  declarative quests, validated like the fleet's
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Ported from the fleet's proven quest architectures (lau-quest / luau-quest /
 * vessel-quest): quests are DATA, not code. A quest says what the player does
 * (typed objectives), what it unlocks (prerequisites), what it pays (rewards),
 * and — the Scrapcraft addition — what it TEACHES (the teaching payload that
 * becomes a logbook memory).
 *
 * Doctrine (lau-quest): "The best learning happens when you don't know you're
 * learning." Players see game objectives; they're doing embedded engineering.
 *
 * Doctrine (vessel-quest): "The game was always being played." Scrapcraft
 * players were already mining, crafting, programming, lapping — the quest
 * system is the scoreboard that makes the real learning visible as progression.
 *
 * Headless: zero DOM, zero game imports. Pure data validation.
 */

// ── Objective taxonomy (luau-quest pattern: verbs the player performs) ──────

/** Every objective type the tracker understands. */
export const OBJECTIVE_TYPES = [
  'MINE',          // { item, count }        — mine/collect N of an item
  'CRAFT',         // { item }               — craft an item (ever)
  'RUN_PROGRAM',   // { count }              — run tile programs
  'FLASH_BOARD',   // { count }              — flash firmware to real hardware
  'RECEIPT',       // { count }              — view firmware build receipts
  'LAP',           // { count | underSecs }  — oval laps, optionally under a time
  'REPAIR',        // { count }              — in-field bot repairs
  'VISIT',         // { biome }              — reach a band ("band0".."band3")
  'SPARK_ASK',     // { topic }              — ask Spark about a topic
  'PLAQUE_READ',   // { count }              — read landmark plaques
  'EXPERIMENT',    // { hypothesis, runs }   — one-knob-at-a-time program tests
  'STAT',          // { stat, count }        — any achievements.stats counter
  'EVENT',         // { event, count }       — raw game event tally
];

/** Companion arcs a quest can belong to. */
export const ARCS = ['earl', 'bolt', 'magma', 'juno', 'rivet', 'finale'];

/** Quest ids per arc that must ALL exist for the campaign to be complete. */
export const ARC_SIZES = { earl: 20, bolt: 5, magma: 5, juno: 5, rivet: 5, finale: 1 };

/** The finale gate: how many companion arcs (bolt/magma/juno/rivet) must be
 *  complete before the Midnight Race unlocks. The worldbible's campaign payoff. */
export const FINALE_ARC_GATE = 2;

const ITEM_RE = /^[a-z0-9_]+$/;
const TOPIC_RE = /^[a-z0-9 -]+$/;

/**
 * Validate ONE quest definition object.
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateQuest(q) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  need(typeof q === 'object' && q !== null, 'quest must be an object');
  if (typeof q !== 'object' || q === null) return { ok: false, errors };

  need(typeof q.id === 'string' && /^[a-z0-9-]+$/.test(q.id), `bad id: ${q.id}`);
  need(ARCS.includes(q.arc), `${q.id}: unknown arc "${q.arc}"`);
  need(typeof q.title === 'string' && q.title.length > 0, `${q.id}: missing title`);
  need(typeof q.brief === 'string' && q.brief.length > 0, `${q.id}: missing brief`);
  need(typeof q.affinity === 'string' && q.affinity.length > 0, `${q.id}: missing affinity`);

  need(Array.isArray(q.objectives) && q.objectives.length > 0, `${q.id}: no objectives`);
  const seenLabels = new Set();
  for (const o of q.objectives ?? []) {
    const where = `${q.id}/${o?.type ?? '?'}`;
    need(OBJECTIVE_TYPES.includes(o?.type), `${where}: unknown objective type`);
    need(typeof o?.label === 'string' && o.label.length > 0, `${where}: missing label`);
    need(!seenLabels.has(o.label), `${where}: duplicate label`);
    seenLabels.add(o.label);
    switch (o?.type) {
      case 'MINE':
        need(typeof o.item === 'string' && ITEM_RE.test(o.item), `${where}: bad item`);
        need(Number.isInteger(o.count) && o.count > 0, `${where}: bad count`);
        break;
      case 'CRAFT':
        need(typeof o.item === 'string' && ITEM_RE.test(o.item), `${where}: bad item`);
        break;
      case 'RUN_PROGRAM': case 'FLASH_BOARD': case 'RECEIPT':
      case 'REPAIR': case 'PLAQUE_READ':
        need(Number.isInteger(o.count) && o.count > 0, `${where}: bad count`);
        break;
      case 'LAP':
        need(o.count !== undefined || o.underSecs !== undefined, `${where}: LAP needs count or underSecs`);
        if (o.count !== undefined) need(Number.isInteger(o.count) && o.count > 0, `${where}: bad count`);
        if (o.underSecs !== undefined) need(typeof o.underSecs === 'number' && o.underSecs > 0, `${where}: bad underSecs`);
        break;
      case 'VISIT':
        need(/^band[0-3]$/.test(o.biome ?? ''), `${where}: biome must be band0..band3`);
        break;
      case 'SPARK_ASK':
        need(typeof o.topic === 'string' && TOPIC_RE.test(o.topic) && o.topic.length > 0, `${where}: bad topic`);
        break;
      case 'EXPERIMENT':
        need(typeof o.hypothesis === 'string' && o.hypothesis.length > 0, `${where}: missing hypothesis`);
        need(Number.isInteger(o.runs) && o.runs > 0, `${where}: bad runs`);
        break;
      case 'STAT':
        need(typeof o.stat === 'string' && ITEM_RE.test(o.stat), `${where}: bad stat`);
        need(Number.isInteger(o.count) && o.count > 0, `${where}: bad count`);
        break;
      case 'EVENT':
        need(typeof o.event === 'string' && /^[a-z0-9_]+$/.test(o.event), `${where}: bad event`);
        need(Number.isInteger(o.count) && o.count > 0, `${where}: bad count`);
        break;
    }
  }

  const p = q.prerequisites ?? {};
  need(p.quests === undefined || Array.isArray(p.quests), `${q.id}: prereq.quests must be array`);
  for (const r of p.quests ?? []) need(typeof r === 'string' && r.length > 0, `${q.id}: bad prereq id`);
  need(p.flags === undefined || Array.isArray(p.flags), `${q.id}: prereq.flags must be array`);
  if (p.companionTier !== undefined && p.companionTier !== null) {
    need(typeof p.companionTier === 'object', `${q.id}: bad companionTier`);
    for (const [k, v] of Object.entries(p.companionTier ?? {})) {
      need(['stranger', 'coworker', 'friend'].includes(v), `${q.id}: tier must be stranger|coworker|friend`);
      need(typeof k === 'string' && k.length > 0, `${q.id}: bad companionTier key`);
    }
  }

  const r = q.rewards ?? {};
  need(r.loot === undefined || Array.isArray(r.loot), `${q.id}: rewards.loot must be array`);
  for (const l of r.loot ?? []) {
    need(typeof l?.item === 'string' && ITEM_RE.test(l.item), `${q.id}: bad loot item`);
    need(Number.isInteger(l?.qty) && l.qty > 0, `${q.id}: bad loot qty`);
  }
  if (r.xp !== undefined) need(Number.isInteger(r.xp) && r.xp >= 0, `${q.id}: bad xp`);
  need(r.bond === undefined || typeof r.bond === 'object', `${q.id}: rewards.bond must be object`);
  need(r.flags === undefined || Array.isArray(r.flags), `${q.id}: rewards.flags must be array`);

  const t = q.teaching ?? {};
  need(typeof t.concept === 'string' && t.concept.length > 0, `${q.id}: missing teaching.concept`);
  need(typeof t.kidPhrase === 'string' && t.kidPhrase.length > 0, `${q.id}: missing teaching.kidPhrase`);
  need(typeof t.memory === 'string' && t.memory.length > 0, `${q.id}: missing teaching.memory`);

  return { ok: errors.length === 0, errors };
}

/**
 * Validate a whole campaign: every quest well-formed, ids unique, prerequisites
 * resolvable AND acyclic, arcs complete, exactly one finale.
 * @param {object[]} quests  flat list of quest definitions
 */
export function validateCampaign(quests) {
  const errors = [];
  const byId = new Map(quests.map(q => [q.id, q]));

  for (const q of quests) {
    const v = validateQuest(q);
    if (!v.ok) errors.push(...v.errors);
  }

  // uniqueness
  const ids = quests.map(q => q.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) errors.push(`duplicate quest ids: ${[...new Set(dupes)].join(', ')}`);

  // prerequisites resolve + acyclic (DFS with coloring)
  for (const q of quests) {
    for (const r of q.prerequisites?.quests ?? []) {
      if (!byId.has(r)) errors.push(`${q.id}: prerequisite "${r}" does not exist`);
    }
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const visit = (id, stack) => {
    color.set(id, GRAY);
    for (const r of byId.get(id)?.prerequisites?.quests ?? []) {
      if (!byId.has(r)) continue;
      const c = color.get(r) ?? WHITE;
      if (c === GRAY) errors.push(`prerequisite cycle: ${stack.join(' → ')} → ${r}`);
      else if (c === WHITE) visit(r, [...stack, r]);
    }
    color.set(id, BLACK);
  };
  for (const q of quests) if ((color.get(q.id) ?? WHITE) === WHITE) visit(q.id, [q.id]);

  // arcs complete
  for (const [arc, size] of Object.entries(ARC_SIZES)) {
    const n = quests.filter(q => q.arc === arc).length;
    if (n !== size) errors.push(`arc "${arc}" has ${n} quests, expected ${size}`);
  }
  // every arc quest's affinity matches its arc (earl arc → earl affinity)
  for (const q of quests) {
    if (q.arc !== 'finale' && q.affinity !== q.arc) {
      errors.push(`${q.id}: affinity "${q.affinity}" ≠ arc "${q.arc}"`);
    }
  }
  // exactly one finale, and it must NOT chain-prereq on individual arc quests
  // (the engine gates the finale on FINALE_ARC_GATE completed arcs instead)
  const finales = quests.filter(q => q.arc === 'finale');
  if (finales.length === 1 && (finales[0].prerequisites?.quests ?? []).length > 0) {
    errors.push('finale must gate on completed arcs (engine), not quest prereqs');
  }

  return { ok: errors.length === 0, errors };
}
