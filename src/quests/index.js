/**
 * ───────────────────────────────────────────────────────────────────────────
 *  QUESTS  —  the framework barrel
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Fleet-lineage quest system for Scrapcraft, ported from three proven
 * architectures (study repos: SuperInstance/lau-quest, luau-quest, vessel-quest):
 *
 *   lau-quest    quests as declarative JSON — objectives, rewards,
 *                prerequisites, chaining, completion detection. The doctrine:
 *                "the best learning happens when you don't know you're learning."
 *   luau-quest   the ObjectiveTypes taxonomy (visit/craft/collect/train-style
 *                verbs) + the tracker API (register/available/active/onEvent).
 *   vessel-quest the scoreboard over a game that was ALWAYS being played.
 *                Applied: Scrapcraft players are already "playing" embedded
 *                engineering — this framework makes the real learning visible
 *                as progression, and the Logbook is the transcript.
 *
 * See README.md in this folder for the full architecture.
 */

export { QuestTracker } from './Tracker.js';
export { Logbook } from './Logbook.js';
export { QuestSystem } from './QuestSystem.js';
export {
  OBJECTIVE_TYPES, ARCS, ARC_SIZES, FINALE_ARC_GATE,
  validateQuest, validateCampaign,
} from './schema.js';
export { CAMPAIGN } from './data/index.js';
