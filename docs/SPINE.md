# THE SPINE — twelve chapters, one Saturday at a time

**Branch:** `spine-data` · **Source of truth:** `src/quests/data/spine.json` · **Bible:** `scrapcraft-world/worldbible/campaign.md`
**Decision doc:** `docs/GAME-LAY.md` (branch `game-lay`) — §4.1 "The Saturday Spine". This file is the build view of step 2.

The spine is the bible's twelve chapters as **declarative data riding the quest framework that already exists** — no engine changes. A chapter is a *map entry*, not a script: it names where the chapter lives (band), which existing quests carry it (references, never duplicates), how each companion's lens colors it (pull-vectors), and the one sentence Earl opens it with.

## How a chapter opens (data flow)

```
worldbible/campaign.md          src/quests/data/spine.json        src/quests/data/*.json
  (the screenplay)      ──▶  THE CHAPTER MAP (12 entries)  ◀── references ── (63 quests — 41 original + the depth cut)
                                     │
                     data/index.js exports SPINE alongside CAMPAIGN
                                     │
              schema.js#validateSpine — 12 chapters · acts per the bible headers (4/6/2) · ch01..ch12 ordered ·
              bible anchors · band/bandName consistency · unlockBand MONOTONIC (bands never
              re-lock) · 2–4 carriers each · every quest id resolves · one chapter per quest ·
              finale only closes ch12 · all four pull-vector lines · opening line ≤ 1 sentence
                                     │
              __tests__/quest-tests.mjs §9–10 — wired into `npm test`
                                     │
              Tracker.js evaluates every referenced quest as it always has (nothing new executes)
```

- **A chapter "opens"** when the player reaches it along the carrier quests — today that's Earl's chain plus the surfaced arcs; the chapter map is the reading order over content that already runs. Runtime presentation (chapter HUD, opening-line card, next-band glow) is convergence-cut work (below).
- **Bands are chapter geography, not walls.** `band` = where the chapter's heart lives; `unlockBand` = the deepest band soft-unlocked by then (0 Gate → 1 Corridor → 2 Circuit City → 3 Deep Yard). Monotonic by validation — chapters may *play* anywhere already unlocked, which is why Ch 7 (the bench) and Ch 11 (the shed) sit at band 0 with `unlockBand: 3`.
- **The elastic middle.** Every chapter lists one pull-vector line per companion (Bolt/Magma/Juno/Rivet). Same skeleton, different path, different voice — `displayQuests()` already surfaces the active companion's arc first; arc quests not named as carriers (e.g. `bolt-2`, `bolt-4`, `magma-2`, `magma-4`) ride their arcs as B-sides, always available, never blocking.

## How the cold-start package plugs into Chapter 1

The cold-start lane (step 1, landing on main) ships: **Earl at the gate** (`Foreman.greetPlayer()`), **auto-Quest-1 on first load**, Spark's one-liner at first pickup, the gate-bench starter bot, a top-center quest progress bar. The plug-in points, in data terms:

1. **Auto-Quest-1 = `earl-1` ("Scrap Hunt")** — which spine.json already lists as Chapter 1's opener. Zero wiring needed: the cold-start lane points at the same quest id the spine references.
2. **Earl's greeting can quote the chapter's openingLine** — `ch01.openingLine` is written in Earl's voice precisely so `greetPlayer()` can deliver it verbatim: *"You showed up with a wagon and no plan. Good — the yard's got plans enough for both of us."*
3. **The first dusk→floodlight delight** is `ch01`'s delight beat, carried today by `earl-10` (craft + place a floodlight). The cold-start lane's dusk-timing polish and this quest are the same moment.
4. **The progress bar** reads tracker state; when the chapter HUD lands (convergence cut), it relabels the same progress as "Chapter 1 of 12."

## The earl-10→17 rot — what it actually was (and the fixes)

Verified against `src/data/items.js`, `recipes.js`, `blocks.js`, `Achievements.js` on this branch:

| Quest | Verdict | Detail |
|---|---|---|
| `earl-10` Light It Up | **fine** | recipe/station/ingredients match; `floodlightsPlaced` stat exists |
| `earl-11` Into the Deep | **ROT — item/zone mismatch** | asked to `MINE crystal_fragment` "from crystal ore", but `CRYSTAL_ORE` blocks drop **glass_shard ×3** (bible lore: crystal = 30 years of coolant+glass chemistry) — fragments only come from lucky loot/supply drops, so the quest routed players to a source that never yields the objective. **Fix:** objective → `MINE crystal_ore` (the Tracker's built-in `crystalMined` special-case), brief rewritten lore-true |
| `earl-12` Headlamp Required | **rot — understated BOM** | brief omitted `iron_scrap ×2` from the recipe, and "press G" only works *while holding* the headlamp. **Fix:** full bill of materials + "hold it and press G" |
| `earl-13` Waypoint Navigator | **fine** | `[Y]` drops a free waypoint (`consumeItem=false` on the key path); `waypoint_drop` event + preset exist |
| `earl-14` Crystal Sweep | **fine** | Ore Hunter preset + `oreDetections` stat exist |
| `earl-15` Power the Sun | **ROT — stale station + BOM** | solar panel is a **forge** recipe, brief said workbench; also omitted `iron_scrap ×2`. **Fix:** "at the forge" + full ingredients |
| `earl-16` Deep Bore | **fine** | ingredients + forge station match the brief |
| `earl-17` Full Coverage | **ROT — phantom prerequisite** | brief said "the antenna **you already made**" — no quest anywhere crafts an antenna, and `r_radar_dish` is `unlockAfter: 'r_antenna'` (recipe hidden until one is wound): a following-the-chain player soft-locks. **Fix:** added a `CRAFT antenna` objective ahead of the dish |

Known same-pattern issue **not** touched here (other lane's data): `rivet-4` also mines `crystal_fragment` under a "mine 3 crystal ore" label. The structural rot (eight consecutive craft/fetch beats, GAME-LAY T6) is addressed by the spine *regrouping* these quests into chapters with authored delight beats; converting three of them to editor-beat quests stays on the convergence checklist.

## The convergence cut (step 3) — checklist

- [ ] `pickContract(dayKey, chapter)` — DailyContract warm-up rehearses the chapter's golden-thread skill (still deterministic per real day)
- [ ] Night Shift activation pinned to the Ch 4 brain-build quest; night-haul Logbook entry kind ("your bot brought back 12 iron while you were at dinner")
- [ ] Wire `companionTier` on all 21 arc quests (schema supports it; every quest currently ships `null` — the bond→content gate is built and dangling)
- [ ] Chapter HUD: opening-line card on chapter open, progress bar relabeled "Chapter N of 12," next-band glow (soft, never a wall)
- [ ] `PLAQUE` objective surfacing in Tracker for the Ch 8 pilgrimage (`data/plaques.js` is already data)
- [ ] Achievement→bot-skin perks v1 (8 skins) keyed to chapter milestones; bond-tier HUD card
- [ ] Pre-export **Game ≠ Reality card** (T9) before first FLASH
- [ ] Point the finale gate at spine-complete (in addition to FINALE_ARC_GATE)
- [ ] Ch 5+ authoring follows the pattern: each chapter ships its **delight beat first**
- [ ] Fix `rivet-4`'s crystal-objective mismatch (same fix as earl-11)


## The depth cut — chapters 7–9 lived, wakes for every chapter, the second-arc hook (branch `scrap-depth`)

Ch7–9 were always on the map; the depth cut makes them **lived**:

- **Wakes for ch7/ch8** (`src/story/Wakes.js`): ch7 completes → **The Steady Green** (one Circuit City crate stops blinking and stays on — the yard recognizing a real brain when it sees one); ch8 → **The Honor Guard** (the plaque wrecks' floodlights hold their sequence-light at night). Seven wakes now: ch2, 4, 6, 7, 8, 9, 12.
- **Chapter completion ceremonies** (`Spine.js` + `LogbookPanel.renderChapterCompleteCeremony`): once ever per chapter, cold-start-gate persisted, no catch-up wall for returning players (`markAllCompletedAsCeremonied`, mirroring the open-ceremony `__ever` guard). Every chapter ships a data `closingLine` (one Earl sentence, ≤200 chars, validated) — ch12's is the second-arc title drop.
- **Lived chapter B-sides** (`data/chapter-quests.json`, arc `chapter`): the worldbible beats no carrier owned — the QA-Sticker #7 header read (new Spark topic `author`), June's friendly-research export, the full plaque pilgrimage + Sparky IV, the 11:58 watch, June's ledger rules, the precise-and-quiet '98 lap. They chain off each chapter's opener carrier (earl-8 / juno-2 / earl-12) and never block the spine — B-side doctrine.
- **The second-arc hook** (`data/yard-arc.json`, arc `yard`): `yard-1` surfaces exactly when ch9 is walked and grants `yard_knows_you`. It teases the post-campaign yard (Mo the pacer, the second page, "The Drum") and leaves the door open. **Earl's Back Room is untouched**: marks stay 6-max, the depth arcs pay nothing (tested), and Earl gained exactly one garnish board line.
- **Companion side-quests** (`data/side-quests.json`, arc `side`): 3 beats × 4 personas from the roundness want-vs-flaw banks, friend-gated (tier 3 of 3, schema-enforced). Guarded reveal → the fight visible → cracked open; beat 3 grants `<persona>_opened`.

Engine deltas (all fail-soft): `schema.ARC_SIZES` grows three arcs; `Tracker` gets `OPEN_ARCS` (earl/finale/chapter/yard skip the auto companion-met gate) and the `author` Spark topic; `QuestSystem._checkSpine` fires completion ceremonies after open ones.
