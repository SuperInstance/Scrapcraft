/**
 * companion — Rivet, the companion who grows with you.
 *
 *   Rivet.js     orchestrator (events → state → banter/nudge/converse)
 *   state.js     relationship tiers + trait axes, versioned persistence
 *   banter.js    tier-filtered reactive + observational lines
 *   nudge.js     the never-nagging progress engine
 *   converse.js  hold-V conversation: scrap-spark → gateway → canned
 *   avatar.js    the voxel face (three.js)
 */

export { Rivet } from './Rivet.js';
export { RivetState, TIERS, TIER_THRESHOLDS, BOND_EVENTS, RIVET_SCHEMA_VERSION, resetRivetState } from './state.js';
export { pickBanter, pickObservation, filterLines, renderLine, tierUpLine, BANTER, OBSERVATIONS, TIER_NAMES } from './banter.js';
export { Nudger, TOPICS, NUDGE_COOLDOWN_S, NUDGE_GRACE_S } from './nudge.js';
export { RivetConverse, buildSystemPrompt, cannedAnswer, sanitize, CANNED } from './converse.js';
