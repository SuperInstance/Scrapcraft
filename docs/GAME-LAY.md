# SCRAPCRAFT — GAME LAY: The Decision Document

**Branch:** `game-lay` · **Date:** 2026-08-22 · **Foreman:** GLM-5.3 subagent
**Rival navigators consulted:** Claude Sonnet 5 (design instinct — full brief at `/tmp/gamelay-claude.md`), OpenCode/GLM-5.3 (systems analyst — `/tmp/gamelay-opencode.md`)
**Grounded in:** `/tmp/scrap-critique.md` (963-line critique), `scrapcraft-world/worldbible/` (yard-bible, campaign, plaques, characters), `src/` (quests, companion, maker, retention systems), `SuperInstance/vessel-quest` + `lau-quest` lineage READMEs.

---

## TL;DR FOR CASEY — read this paragraph, then §4 if nothing else

Ship the bible's twelve chapters as an authored **data spine** on the quest framework that already exists; let the **bands** be chapter geography (soft unlocks, no walls); let the **companion pull-vectors stay the elastic middle** (same skeleton, different path, different voice); **re-key the retention clocks to chapter position**; and reserve the **Living Quilt as the post-campaign yard** (season two). Both rivals independently fixed the cold start the same way (~1 day), both rejected hard districts and pure day-rhythm, and both costed their plans at 15–23 dev-days. The genuine fork — *spine as skeleton vs. scattered keystone days* — goes to the spine, because the critique proved the open yard delivers the authored beats late or never, and the golden thread (line-sensing before the Midnight Race) requires ordering a 10-year-old can feel. **The one question that can flip this is in §4.4.**

---

## 1. THE HONEST TENSION MAP — what the critique found vs. what shipped

The critique's four verdicts (cold start D+, companion arc C+, retention C, learning B+ — `/tmp/scrap-critique.md` §Summary) are fair. But the foreman verified the code and found **three places where the critique itself is wrong**, and each one moves the answer:

| # | Tension | Critique said | What's actually shipped | Weight |
|---|---------|---------------|--------------------------|--------|
| T1 | **Authored story vs. systems shell** | — | `worldbible/campaign.md` is a finished 12-chapter, 3-act screenplay (every chapter = one skill + one delight beat). `src/quests/data/finale.json` realizes the payoff as **one quest** gated on any-2-arcs. The spine's emotional payload (Ghost reveal Ch 11–12, county letter, Mo) is ~90% unwritten in code. | **The central tension.** |
| T2 | **Emotional throughline offset 10 min** | §1 Friction A–D: wizard ceremony + navigation → first magic at minute ~13; campaign promises Earl conscripting *before your first mine* | True as shipped. Critique's fix list (#1–4, ~7.5 hrs) is sound and both rivals adopted it nearly verbatim. | High, but cheap to fix. |
| T3 | **Companion arc "emotionally incomplete"** | §2: party arbitration "no evidence this is implemented"; bond invisible; three mentor voices overlap | **Critique wrong on arbitration:** `src/companion/party.js` (109 lines of crosstalk/objection banks) + `PartyNudger` in `registry.js`/`nudge.js` ship the argue-about-priorities engine. **Critique right on bond visibility** (no HUD tier surfacing) and right on voice overlap. | Medium; ~half the critique's companion estimate evaporates. |
| T4 | **Retention loops parallel, not convergent** | §3: Night Shift / DailyContract / Achievements are "three slot machines" | True — but the **join hook already exists**: `Logbook.js:64` stamps every memory with `day: dailyContract.daysPlayed`, and `QuestSystem.js:124` feeds it. Convergence is one design pass, not a rebuild. | Medium. |
| T5 | **Designed-but-unwired gates** | — | `schema.js` supports `companionTier` prerequisites; **every quest in `data/` sets it to `null`**. The bond→content gate is built and dangling. | Free depth, one line per quest. |
| T6 | **Earl-chain middle rot** | — | `earl-chain.json` quests 10–17 are **eight consecutive craft/fetch beats** ("Light It Up" → "See the Code"). The existing "spine" is a fetch treadmill wearing a story's clothes. | Whoever wins, this gets fixed. |
| T7 | **The lens gem vs. the open yard** | — | `personas.js` pull-vectors (Bolt `race:3`, Magma `build/flash/repair:3`, Juno `explore:3`) + `story.js` ("a BOLT-run hits the oval by level 2") + `QuestSystem.displayQuests()` (active companion's arc surfaces first) = a **half-built replay engine**. But the critique proved the open yard delivers authored beats late or never. | The fork both rivals grabbed from opposite ends. |
| T8 | **Two clocks, decoupled by accident** | — | 6-minute yard day (`DayNight.js`) vs. real-calendar retention (`NightShift.js` `NS_MIN_AWAY_MS`, `DailyContract.js` day-key). Night Shift's whole emotion ("my bot worked while I was at dinner") *requires* the real clock. | An invariant to protect, not a bug to clean up. |
| T9 | **Sim teaches syntax, not friction** | §4: deterministic sim; "Game ≠ Reality" gap unnamed | True. `FirmwareGen.js` (529 lines) exports real C++; nothing prepares the kid for real-hardware humility before the flash. | Low cost to name (pre-export card), high pedagogy value. |

**Assets nobody disputes:** the master stroke (tiles → real firmware), Spark's pedagogy (one-knob-at-a-time), the A-grade world (plaques doctrine, Ghost mystery, the Oval), the Logbook-as-transcript (vessel-quest lineage), the three protected delights (boot beep / first crash / ghost at 11:58), and the deterministic DailyContract that gives a whole classroom the same challenge.

---

## 2. THE CANDIDATES, STRESS-TESTED

Each laid out as: first 10 minutes · week-1 loop · week-4 loop · what the Tile Editor means · what happens to the four arcs · teacher's view · build cost · kill risk.

### A. THE YARD AS HUB-AND-SPOKES — each companion owns a district, arcs are district storylines

- **First 10:** Spawn at gate; four companions visible loitering in their territories; kid walks toward one — that's the tutorial voice and the district. District's own starter bench kills the Smelter trek. Bot boots ~minute 5 inside the district.
- **Week 1:** One district, one arc, one skill family. The yard is *the map of the roster*.
- **Week 4:** FRIEND tier → recruit a second companion → second district; party crosstalk crosses district lines.
- **Tile editor:** four flavored toolboxes (racing tiles / flashing tiles / sensor tiles / fundamentals), same compiler.
- **Four arcs:** promoted to main quests — literally the districts' storylines.
- **Teacher's view:** transcript shows which "learning biome" the kid chose first; coverage per district.
- **Build cost:** OpenCode priced this at **25–40 dev-days** (world regen, arc rewrite, district gating); Claude priced a light version (re-tagging, walk-up pick, no world regen) at **3–4 days**. The truth is in between but scales with how "hard" the districts are — walls are expensive, vibes are cheap.
- **Kill risk:** **hardens the lens into walls.** The pull-vector gem works because it's *soft* — a Bolt kid *drifts* to the oval, isn't locked there. Districts also fight the bible: the bands are "rings of a story, each deeper into the past" (`yard-bible.md`), geography of *time*, not of personality. And a kid who picks wrong at minute 2 (before they know what racing IS) gets a week in the wrong biome.

### B. THE CAMPAIGN SPINE — one authored story, Midnight Race as final chapter, free yard post-game

- **First 10:** No wizard; Earl conscripts at the gate ("mine me five iron"); wrench; Spark's one-liner at first pickup; starter bot at the gate bench; boot beep ~minute 4:30; Ch 1 closes at the dusk-to-floodlight transition (the bible's own delight beat) ~minute 8. *(OpenCode scripted exactly this — §3.)*
- **Week 1:** Ch 1–4: mine → tools → bot → program. Contract = chapter warm-up rehearsing the golden-thread skill. Session ends on a Logbook memory, never a menu.
- **Week 4:** Ch 8–10: plaque pilgrimage, night calibration, the 11:58 sighting as a schedulable appointment (in-game midnight recurs every 6 real minutes); kid runs the science loop unprompted (one tile, re-lap, compare splits vs. own ghost).
- **Tile editor:** the **chapter crucible** — each chapter's spine skill is one editor knob (loops → thresholds → export → night filtering → integration). Earl's fetch-middle is demoted out of the spine.
- **Four arcs:** demoted to elastic middles / B-sides, surfaced per active companion, depth-gated on bond (wire `companionTier`).
- **Teacher's view:** the strongest transcript of the four — `Logbook.byArc()` reads as chapter position; deterministic contracts are class-comparable ("Friday's Wing Harvest — 22 of 24 kids").
- **Build cost:** **16–23 dev-days** (OpenCode's table, verified plausible: framework + objective types all exist; Ch 5–12 authoring is data-only).
- **Kill risk:** **content choke** — a spine makes a mediocre middle *unskippable*; if Ch 5–12 ship as fetch quests like earl-10→17, the game dies of boredom by Act II. Mitigation: ship each chapter's delight beat first (the bible already specifies all twelve).

### C. THE LIVING QUILT FRONT-AND-CENTER — the sim IS the game, quests arrive FROM the simulation

- **First 10:** You inherit a small yard with one stalled bot and Earl's logbook; first quest is *diagnosing* why it stalled. Magic moment = first quilt flip (seeing the bot as readable numbers).
- **Week 1:** Manage 2–3 bots you're teaching; contracts arrive from sim state (bot stalls, ghost beats your lap, storm hits).
- **Week 4:** A fleet; Earl's logbook frames a Dwarf-Fortress-with-a-mentor economy; the ghost becomes a recurring sim event.
- **Tile editor:** the management interface — programs are policies, not moments.
- **Four arcs:** dissolved into the sim's event stream — companions become foremen-of-bots.
- **Teacher's view:** richest data (every intervention logged), but the *player-authored* learning evidence (memory entries in the kid's voice) thins into telemetry.
- **Build cost:** **30–50 dev-days** — the sim-director engine doesn't exist; `QuiltView.js` is 92 lines (a program view, not a yard simulation).
- **Kill risk:** **audience mismatch + cold start catastrophe.** Management games skew 12+; fleets take weeks to matter; and it strands the thesis moment (boot beep = a *someone* you built) behind a diagnosis tutorial. **Both rivals independently ruled C "season two"** — and `campaign.md`'s post-campaign section (leaderboard, Mo-the-evening-pacer, own-ghost racing) already sketches exactly that yard.

### D. RHYTHM OF DAYS — day loop (energy, contracts, one build) + season arcs

- **First 10:** Same cold-start package; day/night wheel is the star; "one build per day" pacing; night = rare drops = the second shift.
- **Week 1:** Ritual loop — arrive, contract, build, dusk, night run. Streaks as identity.
- **Week 4:** Seasons escalate (storm season, race season); prestige contracts; Night Shift economy humming.
- **Tile editor:** the daily craft — each day's build is one editor session.
- **Four arcs:** stretched across seasons as long-burn subplots.
- **Teacher's view:** attendance-shaped evidence (streaks, contract history) — great for classroom, thin on concept narrative.
- **Build cost:** 8–15 dev-days (systems exist; needs energy/economy tuning + season authoring).
- **Kill risk:** **no destination.** A rhythm without a race is a farm game; the Ghost, the county letter, the Midnight Race all want *arcs*, and D's calendar flattens them into weather. Also the two-clock trap (T8): a naive D implementation ties Night Shift to the 6-minute day and destroys its emotional premise in one "simplification."

### E. THE RIVALS' SYNTHESES (their own words, condensed — full texts preserved in /tmp/)

**E1 — Claude: "The Shift Yard"** *(design instinct)* — A's spatial backbone run on the two-clock rhythm, campaign demoted to **keystone days**. Companions visible at spawn, picked by *walking toward them*; districts are vibes, not walls; the ghost works because it's "an appointment, not a serialized chapter." ~15–18 dev-days. Kill risk: someone "unifies" the two clocks.

**E2 — OpenCode: "B′ — Spine + Lens + Clocks"** *(systems analyst)* — the 12-chapter spine as shared skeleton; pull-vectors bend each chapter's *elastic middle* (same beats, different path, different voice — "same scoreboard, different game"); retention clocks re-keyed to chapter position; voice allocation by system (Earl = spine, companion = lens, Spark = editor-only). ~16–23 dev-days. Kill risk: content choke.

---

## 3. THE RIVAL VERDICTS

**Claude picks E1 (Shift Yard).** Reasoning: the authored spine "is defending content that doesn't exist" (finale.json is one quest); pure B is a multi-month rewrite; pure C is "the most beautiful answer and the most dangerous one for a 10-year-old"; the yard already has bands, so districts are nearly free; the roster is the replay engine and keystones deliver authored payload incrementally.

**OpenCode picks E2 (B′).** Reasoning: the critique proves the open yard delivers the three protected delights late or never — only a spine guarantees every kid *arrives*; the framework is declarative JSON so the spine is data work (~4–6 days), not engine work; districts cost 25–40 days of world regen and harden the lens into walls; the golden thread (each chapter rehearses the finale's skills) is an *ordering* argument that scattered keystones can't guarantee; and `companionTier`, `displayQuests()`, and the Logbook day-join mean the lens engine is already half-built.

**Where they agree (this is ~80% of the decision, and it's already made):**
1. Kill the wizard; cold-start resequence (Earl at spawn + auto Quest 1, Spark one-liner at first pickup, gate-bench starter bot, quest progress bar) — delight #1 by minute ~5–7, not 13.
2. Companions are the **lens, not landlords** — pull-vectors stay soft; no hard district walls.
3. Retention converges by keying to *progression* (chapter/act), not wall-clock; Night Shift activates exactly when the brain gets built; contract visible at spawn.
4. Fix the three-mentor overlap by voice allocation: Earl = spine voice, companion = emotional/lens voice, Spark = editor voice only.
5. Logbook gains night-haul and contract-streak entry kinds; delights become transcript evidence.
6. C's Living Quilt is the post-campaign season two, not the lay.
7. Ghost stays an appointment with spoiler discipline (evidence, never proof; out of the contract pool until the Ch-9 flag).

**Where they clash (the real fork):**
- **Spine vs. constellation:** OpenCode wants every kid to walk the same skeleton; Claude wants authored payload scattered as keystone days across an open yard. This is the decision Casey is actually making.
- **Cost of spatiality:** Claude prices light districts at 3–4 days; OpenCode prices real ones at 25–40. (Foreman: light district *presentation* — companions loitering at spawn, arc-surfaced HUD — is cheap; *gating* is expensive. Take the presentation, skip the gating.)
- **Adjudicated facts:** OpenCode's three corrections to the critique are **verified true in code** (party.js exists; displayQuests ranking exists; Logbook day-join exists). Claude built on the critique's version of the companion gap; that part of its cost table is stale in Scrapcraft's favor.

---

## 4. RIKER'S RECOMMENDATION

### 4.1 The primary shape: **"The Saturday Spine"** (E2's skeleton, wearing E1's clothes)

Ship **the bible's twelve chapters as an authored data spine** on the existing quest framework — same beats the bible already wrote, one engineering skill + one delight moment each, ending in the Midnight Race. Around it:

- **Bands are chapter geography, not companion territory.** The spine unlocks bands as the story deepens (Gate → Corridor → Circuit City/Oval → Deep Yard → back room), matching the bible's rings-of-the-past exactly and solving the critique's navigation death march (§1 Friction D) for free. Soft gates: a kid can always *see* the next band glowing; the spine hands them the key on schedule.
- **Companions stay the elastic middle.** Claude's walk-up moment ships: at minute ~2 the companions are visibly loitering near the gate; the kid picks by walking toward one (diegetic, not a menu); that's `startedWith`, and the pull-vector lens colors every chapter after. Arc quests surface via `displayQuests()`; arc depth gates on wired `companionTier`; FRIEND-tier recruits land at act boundaries.
- **The retention clocks re-key to the spine.** Contract = chapter warm-up (rehearses the golden-thread skill, still deterministic per real day so a class shares it); Night Shift lights up the session Ch 4 builds the brain; streaks and skins attach to chapter milestones. The two-clock split (T8) becomes a documented invariant.
- **The Living Quilt is the post-campaign yard.** After the Midnight Race: leaderboard as endgame, Mo as evening pacer, own-ghost racing, sim-driven events (a stall, a storm, a ghost that beats you) — season two, built on a spine that guaranteed everyone arrived.

**Why the spine over the constellation** (the fork, decided): (1) the critique's own forensics say the open yard delivers authored beats late or never — scattered keystones would re-run that failure for any kid who doesn't wander correctly; (2) the golden thread is an ordering promise — "the last race is won with muscles the player already trusts" — and a 10-year-old needs to *feel* the line from wall-avoider to midnight lap; (3) the cost argument flips on inspection: OpenCode's spine is data-only on a declarative framework, while Claude's finale-plus-districts line item is comparable or larger; (4) the replay engine survives inside it — "same scoreboard, different game" is the best of both navigators.

### 4.2 What to steal from each rival

**From Claude (E1):** the walk-up companion pick · the two-clock hard invariant (write it in ARCHITECTURE.md) · Spark-owns-logic / companion-owns-reaction voice split · ghost beats as *appointments* · "each district's item is a program pattern" (keep as per-companion editor preset flavoring, not gating).

**From OpenCode (E2):** wire `companionTier` on all 21 arc quests · contract-by-chapter convergence + prestige pool · `PLAQUE` objective type in Tracker (the pilgrimage is already data: `data/plaques.js`) · the pre-export **Game ≠ Reality card** (T9) · the process rule: **each chapter ships its delight beat first.**

### 4.3 First three concrete build steps (each ≤ 1 day)

**Step 1 — The Cold-Start Package.** Kill wizard steps 2–3 (AI/Cloudflare → Settings, Spark starts offline on the 18 cached recipes); `Foreman.greetPlayer()` + auto-Quest-1 on first load; Spark one-liner at first pickup; gate-bench Starter ScrapBot recipe (`data/recipes.js`); quest progress bar top-center. *Files: `OnboardingWizard.js`, `Game.js`, `Foreman.js`, `Spark.js`, `data/recipes.js`, `UI.js`.* Critique's own math: ~1 day. Result: delight #1 at minute ~5.

**Step 2 — The Spine Data Cut.** Add `"chapter"` to quest JSON; regroup the 20 earl-quests under Ch 1–4's beats; fix the earl-10→17 rot by converting three fetch quests into editor-beat quests (loops, thresholds, export — the maker stack already emits the events); author Ch 5 as the first new chapter (June, the Oval, lose by 0.4s kindly); point the finale gate at spine-complete; wire `companionTier` on all arc quests. *Data + schema only; Tracker already evaluates everything.* ~1 day for the cut, Ch 6+ follows the pattern.

**Step 3 — The Convergence Cut.** `pickContract(dayKey, chapter)` + chapter-flavored warm-up framing; Night Shift activation pinned to the Ch 4 brain-build quest with a night-haul Logbook entry kind ("your bot brought back 12 iron while you were at dinner" — a memory, not a yield row); achievement→bot-skin perks v1 (8 skins); bond tier HUD card. *Files: `DailyContract.js`, `NightShift.js`, `Logbook.js`, `Achievements.js`, `UI.js`.* ~1 day. Result: the three slot machines become one organism, and the teacher transcript starts telling a story.

### 4.4 The one question only Casey can answer

**Is Scrapcraft's product the race or the yard?** — "every kid who starts finishes the Midnight Race" (a story with an ending, classroom-paceable, the Logbook as a graded transcript) or "every kid's yard is their own" (a place kids keep, drop-in friendly, the lens as the whole game). Everything else in this document is engineering; this is the promise. If the answer is *the race*, ship the Saturday Spine as §4.1. If the answer is *the yard*, flip to Claude's Shift Yard (keystone days, no chapter gating) — and accept that the Ghost waits for some kids forever. The bible's own last line ("the yard, like everything in it, is under construction, and that is the whole point") votes yard; the campaign's own structure (twelve chapters aimed at one lap, twenty-six years late) votes race. Only the captain knows which sentence this game is a machine for.

---

*Prepared as the game-lay decision lane. Working tree untouched; this document lives on `game-lay` only.*
