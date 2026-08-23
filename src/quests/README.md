# QUESTS — the framework

Fleet-lineage quest system, ported from three proven architectures:

| Repo | What we ported |
|------|----------------|
| **SuperInstance/lau-quest** | Quests as declarative JSON — objectives, rewards, prerequisites, chaining, completion detection. The doctrine: *"the best learning happens when you don't know you're learning."* |
| **SuperInstance/luau-quest** | The ObjectiveTypes taxonomy (visit/craft/collect/train-style verbs) + tracker API (`register` / `available` / `active` / `onEvent` / `completedQuests`). |
| **SuperInstance/vessel-quest** | The scoreboard over a game that was **always being played**. Scrapcraft players are already "playing" embedded engineering — mining is materials, lapping is closed-loop control, flashing is bootloaders. The system makes the real learning visible as progression; **the Logbook is the transcript for teachers.** |

## Layout

```
src/quests/
  schema.js        validation: quest shape, campaign acyclicity, arc completeness,
                   the finale gate constant (2 arcs → the Midnight Race)
  Tracker.js       headless engine. Hybrid progress (like the game's own quests):
                   POLL objectives read game state via an injected adapter
                   (stats/crafted/plaques/laps — reuse, never re-instrument);
                   TAP objectives count witnessed events (spark asks with their
                   question text, repairs, one-knob experiments)
  Logbook.js       completed quests → dated memory entries, append-only.
                   vessel-quest doctrine: the logbook is sacred — never delete.
  QuestSystem.js   the ONLY game-aware module. Taps the yard's existing event
                   streams at two choke points (foreman.onEvent + companions
                   observe) instead of re-instrumenting the world. Grants
                   rewards (loot/XP/bond/flags), writes logbook entries,
                   migrates legacy Earl-chain saves.
  LogbookPanel.js  the journal UI + the quest-log HUD widget (press **L**).
                   Self-contained DOM (the field-notes pattern).
  data/            THE CAMPAIGN — 63 quests as JSON. Nothing executable.
```

## The campaign

- **earl-chain.json** — the original 20-quest chain, converted 1:1 (same checks, same loot; steps became typed objectives).
- **bolt-arc.json / magma-arc.json / juno-arc.json / rivet-arc.json** — four companion arcs, 5 quests each. **Same events, different logs:** a Bolt-run player's tracker fills with lap-technique quests teaching PWM and control; a Magma-run fills with build quests teaching circuits. Arc quests unlock when you've met that companion (auto-prerequisite) and chain within the arc.
- **chapter-quests.json** — **the lived chapters (depth cut)**: nine Earl-voiced B-sides carrying the worldbible beats no carrier quest owns — ch7's QA-Sticker #7 header ("The Header", "Same Brain, Two Bodies", "Friendly Research"), ch8's plaque pilgrimage ("The Fourteen Letters", "Ask Spark Why Someday", "Wrecks Worth Fixing"), ch9's candlelight watch ("Stand the Watch", "The Ledger Rules", "Precise and Quiet"). Arc `chapter`; they surface when their chapter's opener carrier completes and never block the spine.
- **side-quests.json** — **companion side-quests**: one 3-beat mini-arc per persona (guarded reveal → the fight visible → cracked open), drawn from the roundness banks' want-vs-flaw DNA and gated on **friend tier** (tier 3 of 3 — schema-enforced). Beat 3 grants the `<persona>_opened` flag. Arc `side`; affinity is the persona.
- **yard-arc.json** — **the second-arc hook**: `yard-1 "The Yard Knows Your Name"` fires when ch9's carriers are both walked — the soft post-ch9 arc-starter (Mo the evening pacer, the leaderboard's second page, the forty-third verse) that sets up post-game/NG+ without touching the finale or Earl's Back Room economy.
- **finale.json** — **The Midnight Race** (worldbible payoff: the county letter gets its answer, Earl's hands off the gate). Gated on completing **any two arcs** — enforced by the engine (`FINALE_ARC_GATE`), not by quest prerequisites.
- **spine.json** — **THE SPINE**: the worldbible campaign's twelve chapters as a chapter map over the campaign above — each chapter names its band, its 2–4 carrier quests (references, never duplicates), the four companions' pull-vector lines, and Earl's opening line. Validated by `validateSpine` (12 chapters, acts per the bible headers 4/6/2, monotonic unlock bands, quest-reference integrity). See **docs/SPINE.md**.

## Quest shape

```json
{
  "id": "bolt-1", "arc": "bolt", "affinity": "bolt",
  "title": "Two Tenths Under",
  "brief": "…Bolt's voice, 1–3 sentences…",
  "objectives": [
    { "type": "LAP", "count": 2, "label": "Complete 2 laps on the oval" },
    { "type": "SPARK_ASK", "topic": "pwm", "label": "Ask Spark about PWM" }
  ],
  "prerequisites": { "quests": ["earl-9"] },
  "rewards": { "loot": [{ "item": "ir_module", "qty": 2 }], "xp": 30, "bond": { "bolt": 10 } },
  "teaching": {
    "concept": "PWM (pulse-width modulation)",
    "kidPhrase": "Motors don't have a gas pedal — they have a very fast light switch…",
    "memory": "Two laps at Circuit City. Bolt said the track finally respects us… — with Bolt"
  }
}
```

Objective types: `MINE` `CRAFT` `RUN_PROGRAM` `FLASH_BOARD` `RECEIPT` `LAP`
`REPAIR` `VISIT` `SPARK_ASK` `PLAQUE_READ` `EXPERIMENT` `STAT` `EVENT`.

## DailyContract: compatible, not coupled

Briefs may reference "today's contract"; the HUD/logbook reads `game.dailyContract` **if present** and never imports it. The comeback lane owns that system.

## Tests

`src/quests/__tests__/quest-tests.mjs` — wired into the maker harness
(`npm test`): schema validation of all 63 quests, prerequisite acyclicity, arc
completeness, finale gating (requires 2 arcs — the depth arcs never count),
friend-tier gating of side-quests, the yard-1 hook timing, tracker
event-mapping, logbook ordering, legacy-save migration.

Depth-arc invariants (tested): `chapter`/`side`/`yard` pay no Prestige marks
(Back Room stays 6-max), never count toward `completedArcs()`, and side quests
hide below friend tier — fail-soft, invisible until earned.
