/**
 * ───────────────────────────────────────────────────────────────────────────
 *  NEXT STEP  —  the kid's answer to "what do I do next?" (pure, headless)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The quest HUD shows up to four quests — a scoreboard, not a to-do. The
 * campaign bible's promise is that a kid can ALWAYS answer "what's next?"
 * without opening a menu. This module derives the single clearest next
 * action from state the QuestSystem already holds:
 *
 *   1. the finale is available          → the Midnight Race is the step
 *   2. any displayed quest has an open
 *      objective                        → that quest's FIRST open objective,
 *                                          plus a "how" hint keyed by the
 *                                          objective type (E? T? mine? lap?)
 *   3. nothing active                   → null (the HUD falls back to its
 *                                          explore line; no fabricated goals)
 *
 * Pure data-in/data-out: tracker + displayed quests in, one row out. The
 * presentation lives in LogbookPanel.renderQuestHud as a glowy "➜ NEXT" row.
 */

/** How-to hints keyed by objective type — the verb plus the key/verb the
 *  kid physically needs. One short clause, always actionable. */
const HOW = {
  MINE:         'hold left-click on the scrap heaps',
  CRAFT:        'press E at the workbench',
  RUN_PROGRAM:  'press T — the Maker Lab',
  FLASH_BOARD:  'press T, then ⚡ BUILD IT',
  LAP:          'run laps with your bot — the circuit gate is by the oval',
  SPARK_ASK:    'hold Q and ask Spark about it',
  REPAIR:       'stand near your bot with a repair kit, press G',
  VISIT:        'walk there and look around',
  EXPERIMENT:   'change one tile, run again, watch what differs',
  PLAQUE_READ:  'walk up to a plaque and read it',
  EVENT:        'keep playing — the yard is watching for it',
  STAT:         'keep at it — the counters are counting',
};

/** The "how" clause for an objective (pure, testable). */
export function howForObjective(o) {
  if (!o) return null;
  const how = HOW[o.type];
  if (!how) return null;
  return how;
}

/**
 * Derive the single next step.
 *
 * @param {object}   tracker   QuestTracker (status reads only)
 * @param {object[]} displayed quests the HUD is showing (already
 *                             story-pulled by QuestSystem.displayQuests)
 * @param {object}  [opts]     { finale: boolean }
 * @returns {{kind:'finale'|'objective', questId:string|null, title:string,
 *            label:string, how:string}|null}
 */
export function nextStep(tracker, displayed, opts = {}) {
  if (!Array.isArray(displayed)) return null;

  // 1. The finale outranks everything — it IS the next step.
  if (opts.finale) {
    return {
      kind: 'finale', questId: 'finale-midnight-race',
      title: 'The Midnight Race', label: 'line up for the Midnight Race',
      how: 'two arcs walked — press L for the logbook',
    };
  }

  // 2. First displayed quest (companion-pulled priority) with an open
  //    objective → that objective + its how-hint.
  for (const q of displayed) {
    const open = (q.objectives ?? []).find(o => {
      const st = tracker.objectiveStatus(q, o);
      return st && !st.done;
    });
    if (open) {
      const st = tracker.objectiveStatus(q, open);
      return {
        kind: 'objective', questId: q.id, title: q.title,
        label: open.label ?? 'make progress',
        how: howForObjective(open) ?? 'follow the quest brief (press L)',
        progress: st.progress ?? null,
      };
    }
  }
  return null;
}
