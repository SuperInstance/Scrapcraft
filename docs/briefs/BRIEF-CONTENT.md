# CODER B — CONTENT DESIGN (claude)

Repo: /tmp/scrap-teach-wt (worktree of Scrapcraft, branch teach-payload). ALL work in this dir.

## WHO YOU ARE WRITING FOR
Middle schoolers (11-14) building robots in a scrapyard. The game: Earl (gruff yard owner, hides pride), Rivet (young cat-companion, curious, full-body slow-blinks), Bolt (racer, fast-talker), Magma (slow, deep, workshop philosopher), Juno (drone swarm, hyper curious), Spark (floating drone AI companion, the teacher-heart, speaks in caps for excitement), June (rival racer, kind). Read for voice: `../scrapcraft-world/worldbible/characters/` (if missing: `/home/eileen/projects/scrapcraft-world/worldbible/`) and `src/companion/personas.js`, `src/quests/data/earl-chain.json` (see `teaching.kidPhrase` fields for register), `src/quests/data/spine.json`.

House voice: concrete, warm, funny, NEVER lecturing. Kid-phrases explain real engineering in one breath ("A generator turns motion into electricity... like a teenager with a credit card"). Failure is celebrated as data.

## DELIVERABLE 1: `docs/CURRICULUM.md` — THE HONEST MAP
An honest concept-ladder audit. Structure:
1. **The mission** (quote README's line about middle schoolers/embedded engineering).
2. **The ladder as lived** — a visual ASCII ladder/table of the 4 tiers × 16 concepts (ids below), each with: concept, where the game teaches it (chapter + quest ids), how it's practiced, whether it's ASSESSED (spoiler: mostly no — say so honestly).
3. **The gaps** (honest): assessment-without-testing didn't exist (nothing checked understanding); debugging was preached (Ch4/Ch8 plaques) but never PLAYED; optimization/loops-economy had no challenge; teacher tools showed grades not concepts.
4. **What this release adds** — teach-back (kid becomes the teacher), broken-bot clinics, write-it-shorter, concept coverage for teachers.
5. **For teachers**: how each tier maps to real CS/embedded standards informally (sense→inputs/sensors, think→control flow, act→outputs/feedback, engineer→process skills). One page, printable-friendly.
Write from evidence — actually read spine.json skills, quest teaching payloads, `src/maker/primitives.js`, `src/TileEditor.js` NODE_META tray groups. Cite quest ids.

CONCEPT IDS (fixed, systems coder builds engine against same): sensors-overview, thresholds, calibration, conditionals, loops-forever, loops-counted, loops-until, variables, subroutines, actuation, feedback-loop, optimization, debugging, firmware-export, failure-analysis, power-systems, integration. Tiers: SENSE / THINK / ACT / ENGINEER.

## DELIVERABLE 2: `src/learning/data/teachback.json`
Invisible assessment content. Schema EXACTLY:
```json
{ "questions": [ { "id": "tb-conditionals-1", "conceptId": "conditionals", "asker": "rivet",
  "naiveQuestion": "...", "options": [ {"text":"...","correct":true,"misconception":null},
  {"text":"...","correct":false,"misconception":"short-tag"}, {"text":"...","correct":false,"misconception":"short-tag"} ],
  "taughtLine": "...", "retryLine": "..." } ] }
```
RULES: naiveQuestion is asked by the COMPANION (a younger bot/cat who genuinely doesn't know) — kid answers = teaching = the test. Write 2 questions per concept for: conditionals, loops-forever, loops-counted, loops-until, variables, subroutines, sensors-overview, thresholds, calibration, actuation, feedback-loop, debugging, optimization, firmware-export (28 total; skip power/integration/failure-analysis — those are assessed via quests/plaques). Distractors = REAL misconceptions middle schoolers hold (e.g. "the sensor knows which direction the wall is", "forever loops use up all the power", "if means maybe"). retryLine: companion re-asks gently after wrong answer, kid gets another shot — fail-soft, no shame. taughtLine: companion's delighted "OH!" moment when taught correctly. asker rotates: rivet, bolt, juno, magma (spark only for firmware-export). Misconception tags: short kebab-case.

## DELIVERABLE 3: Broken-bot clinic CONTENT — `src/learning/data/brokenbots.json`
Schema:
```json
{ "scenarios": [ { "id": "left-forever", "name": "...", "symptom": "...", "earlLine": "...",
  "hypotheses": [ {"text":"...","correct":true}, {"text":"...","correct":false}, {"text":"...","correct":false} ],
  "hintLadder": ["...","..."], "earlNod": "...", "earlNudge": "..." } ] }
```
3 scenarios (ids FIXED — systems coder hardcodes programs): `left-forever` (inverted sonar comparison — bot turns left in open space), `never-stops` (missing break — drive-to-wall bot never parks), `wrong-sensor` (light-runner checks bump instead of light — ignores flashlight). Write like a puzzle-box: symptom is observable behavior, hypotheses are real diagnostic reads (one right, two plausible-wrong), hintLadder = 2 escalating Earl hints ("Ask the bot what it SEES, not what it does" style). Earl's voice: gruff, respects effort, never says "wrong" — says "Not it. Try again, you're warmer."

## DELIVERABLE 4: Two new SIDE QUESTS — edit `src/quests/data/side-quests.json` (ADD to the array, keep all existing)
Quest JSON must pass `validateQuest` in `src/quests/schema.js` — READ IT. Requirements: arc 'side', affinity ∈ [bolt,magma,juno,rivet] AND prerequisites.companionTier[affinity]==='friend', objective types only from OBJECTIVE_TYPES (MINE/CRAFT/RUN_PROGRAM/LAP/REPAIR/VISIT/SPARK_ASK/PLAQUE_READ/EXPERIMENT/STAT/EVENT...check schema), each objective needs unique label.
1. `side-debug-clinic` (affinity rivet, friend-gated): "The Bot That Turns Left Forever" — Rivet drags the kid to Earl's shed; a trade-in bot spins forever; kid diagnoses (objectives: RUN_PROGRAM count 2 with labels about the clinic, plus EVENT or EXPERIMENT objective; teaching.concept "Debugging — symptoms to causes: read behavior, form a hypothesis, change ONE thing"). Write teaching.kidPhrase + teaching.memory in house style (memory written as a logbook scene, "— with Rivet").
2. `side-write-shorter` (affinity bolt, friend-gated): "Same Lap, Fewer Tiles" — Bolt challenges: your line-follower works, now make it SMALLER; optimization as style. Objectives: RUN_PROGRAM 3 + EXPERIMENT (hypothesis "same lap time with fewer tiles"). teaching.concept "Optimization — same behavior, less code: loops and subroutines as compression". Rewards modest (xp 30, loot scrap), flags [].
NOTE: schema ARC_SIZES and a test assert side count — systems coder will update; you just add quests. VERIFY after: `node src/maker/__tests__/run-tests.mjs` — if campaign-count tests fail ONLY because of +2 side quests, that's expected and fine; anything else, fix your JSON.

## DELIVERABLE 5: teacher.html mission cards — content only, `docs/mission-cards.md`
12 printable mission cards (one per spine chapter, ch01-ch12): chapter number+title, the skill in kid language, 3 "field notes" discussion prompts for teacher/parent, 1 "try at home" unplugged activity (no computer needed — e.g. "be the robot": kid gives parent step-by-step instructions to cross the room, parent follows LITERALLY — teaches precision of commands). Pull chapter titles/skills from spine.json. Keep each card ~80 words.

## ORDER
CURRICULUM.md last (it documents everything else). Commit each deliverable separately: `git add <files> && git commit -m "content(...): ..."`. Do NOT touch src/learning/*.js engine files, teacher.html JS, or quest schema.
