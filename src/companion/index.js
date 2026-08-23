/**
 * companion — the roster who grows with you.
 *
 *   registry.js   the roster: entry points, recruitment, parties, arbitration
 *   personas.js   the souls: Rivet, Bolt, Magma, Juno (voice kits + pulls)
 *   Companion.js  the orchestrator (events → state → banter/nudge/converse)
 *   Rivet.js      compat shim (Rivet === Companion, rivet persona)
 *   state.js      relationship tiers + per-persona traits, versioned, isolated
 *   banter.js     tier-filtered reactive + observational lines + pickers
 *   nudge.js      the never-nagging progress engine (+ party arbitration)
 *   converse.js   hold-V conversation: scrap-spark → gateway → canned
 *   party.js      crosstalk — inactive companions chime in
 *   entry.js      the yard gate: Earl's two questions → starter companion
 *   story.js      story identity per run (summary + quilt cells)
 *   avatar.js     the voxel faces (per persona; Juno is a swarm)
 */

export { CompanionRoster, RECRUIT_RULE, EARL_PAIRING_LINE } from './registry.js';
export { Companion } from './Companion.js';
export { Rivet } from './Rivet.js';
export {
  CompanionState, RivetState, TIERS, TIER_THRESHOLDS, BOND_EVENTS,
  RIVET_SCHEMA_VERSION, resetRivetState, resetCompanionState,
} from './state.js';
export {
  pickBanter, pickObservation, filterLines, renderLine, tierUpLine,
  BANTER, OBSERVATIONS, TIER_NAMES,
} from './banter.js';
export {
  Nudger, PartyNudger, TOPICS, NUDGE_COOLDOWN_S, NUDGE_GRACE_S, resolveHint,
} from './nudge.js';
export {
  CompanionConverse, RivetConverse, buildSystemPrompt, cannedAnswer, sanitize, CANNED,
} from './converse.js';
export { PERSONAS, PERSONA_IDS, getPersona } from './personas.js';
export { pickCrosstalk, pickObjection, CROSSTALK, OBJECTIONS } from './party.js';
export {
  LineMemory, ChatterGuard, pickBanterFresh, pickObservationFresh, DEFAULT_RING_CAP,
} from './variety.js';
export {
  ENTRY_QUESTIONS, recommendCompanion, gateDeliveryLine, CompanionGate,
} from './entry.js';
export { storySummary, storySummaryText, quiltCells } from './story.js';
export { RivetAvatar } from './avatar.js';
