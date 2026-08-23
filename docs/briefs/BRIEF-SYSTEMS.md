# CODER A — SYSTEMS (opencode)

Repo: /tmp/scrap-teach-wt (worktree of Scrapcraft, branch teach-payload). ALL work in this dir. Read `STANDARDS.md` and `src/quests/Spine.js` header comments first — house style: headless modules, framework-free .mjs tests, ASCII-box header comments explaining WHY, zero DOM in logic modules.

## MISSION
Build `src/learning/` — a headless "concept ladder" engine that makes Scrapcraft's teaching measurable and assessable WITHOUT tests. It powers: (1) invisible comprehension checks (teach-back), (2) active debugging play (broken bots), (3) teacher concept-coverage dashboards.

## THE CONCEPT TAXONOMY (fixed ids — content coder is writing data against these same ids; do NOT rename)

Four tiers, 16 concepts. Each: `{ id, tier, name, chapter, kidPhrase, description }` (chapter = spine ch number where it first lands).

TIER "SENSE" (ch4+): `sensors-overview`, `thresholds`, `calibration`
TIER "THINK" (ch4-6): `conditionals`, `loops-forever`, `loops-counted`, `loops-until`, `variables`, `subroutines`
TIER "ACT" (ch3-5): `actuation`, `feedback-loop`, `optimization`
TIER "ENGINEER" (ch7+): `debugging`, `firmware-export`, `failure-analysis`, `power-systems`, `integration`

Source of truth for ladder mapping: quest `teaching.concept` strings in `src/quests/data/*.json` + spine `skill` fields in `src/quests/data/spine.json`. Map quests→concepts via keyword rules (e.g. quest teaching concept mentioning "loop"/"repeat" → loops-*; use your judgment, document the mapping table in `concepts.js` as data so it's auditable).

## FILES TO BUILD

### 1. `src/learning/concepts.js`
- Export `CONCEPTS` (the 16, with tier/name/chapter/kidPhrase/description) and `TIER_ORDER` = ['SENSE','THINK','ACT','ENGINEER'].
- Export `QUEST_CONCEPTS`: map questId → conceptId[] derived from the real CAMPAIGN data (import `CAMPAIGN` from `../quests/data/index.js`; build the derivation with an explicit keyword table + hand overrides where keywords fail; comment each override with why).
- Export `deriveConceptsFromTeaching(conceptString)` — the keyword matcher, exported for tests.

### 2. `src/learning/ConceptLedger.js`
The mastery state machine. States per concept: `unseen` → `seen` (quest teaching surfaced in logbook) → `practiced` (objective evidence: quest completed whose QUEST_CONCEPTS includes it, OR a tile-program event shows usage) → `taught` (a teach-back moment completed — teaching IS the test; highest rung). Monotonic — never regress.
- `constructor({ storage, now })` injectable like Spine (localStorage default, `scrapcraft_concepts_v1`).
- `observe(event)` where event ∈: `{type:'quest_seen', questId}`, `{type:'quest_done', questId}`, `{type:'program_ran', used:[conceptIds]}` (caller analyzes tiles — provide `static conceptsInProgram(program)` using TileProgram node types: 'if'/'if_else'→conditionals, 'forever'→loops-forever, 'repeat'→loops-counted, 'repeat_until'/'wait_until'/'break'→loops-until, 'set_var'/'change_var'/'math_var'/'random_var'/'read_sensor'→variables, 'define_sub'/'call_sub'→subroutines, 'read_sensor' ALSO→sensors-overview), `{type:'taught', conceptId, correct:boolean}` (taught state only on correct; wrong = stay practiced, increment `attempts`).
- `mastery(conceptId)` → {state, attempts, firstSeenAt, taughtAt}. `summary()` → {unseen,seen,practiced,taught} counts + per-concept states array in tier order. `nextTeachable()` → best concept to teach-back next: practiced (or seen ≥2 with attempts 0) concepts in tier order, null if none. Serializable `save()/load()`, corrupt-tolerant (try/catch, fresh start) like Spine.js does it.

### 3. `src/learning/TeachBack.js`
The invisible assessment engine. Content lives in `src/learning/data/teachback.json` (content coder is writing it NOW — same shape, do not block: code against this schema and WRITE a placeholder file only if it doesn't exist when you get there; if it exists, don't touch it).
Schema: `{ questions: [{ id, conceptId, asker: 'rivet'|'bolt'|'juno'|'magma'|'spark', naiveQuestion, options: [{ text, correct, misconception }], taughtLine, retryLine }] }` — 2 wrong options each tagged with the misconception it reveals (e.g. "confuses-sensor-direction").
Engine:
- `constructor({ ledger, content, rng })` (rng injectable, default Math.random).
- `nextMoment()` → picks a question whose conceptId === ledger.nextTeachable(), rotates asker (a companion/persona asking a NAIVE question — the kid answers as the teacher). Returns `{question, options}` shuffled. Null if nothing teachable.
- `answer(questionId, optionIdx)` → `{ correct, taughtLine|retryLine, ledgerUpdated }`. Fail-soft: wrong answer → retryLine that gently corrects the MISCONCEPTION (pick the option's misconception → content has retryLine generic; fine), no penalty, can re-ask later after another practice cycle (attempts-based cooldown: not re-offered until 2 more `program_ran` events for that concept).
- `available()` count — for UI badges.

### 4. `src/learning/BrokenBot.js`
Debugging as PLAY. Each scenario: a REAL TileProgram (build with `T.*` constructors from `src/maker/TileProgram.js`) with ONE seeded bug, a symptom the kid reads ("spins left forever"), hypothesis options, and fix verification by RUNNING the fixed program in the real VM (`compile`, `TileVM`, `VirtualRobot` from `src/maker/index.js` — read `src/maker/__tests__/run-tests.mjs` for usage patterns, and `src/maker/README.md`).
- `SCENARIOS` built in code (3): (a) `left-forever` — wall-avoider with inverted comparison (if sonar < 30 → turn left, else drive; bug: comparison flipped so it turns when CLEAR), symptom "turns left forever in the open"; (b) `never-stops` — drive-to-wall-and-stop missing `break` (forever loop never exits), symptom "keeps bumping the wall, never parks"; (c) `wrong-sensor` — light-runner reading `bump` instead of `light` in condition, symptom "ignores the flashlight completely".
- Per scenario: `{ id, name, symptom, earlLine, brokenProgram, hypotheses: [{text, correct}], hintLadder: [line1, line2], fix: {expectedNodePatch} , verify(fixedProgram, robot, steps) }`. Implement `verify` per scenario as pure functions driving VirtualRobot in a corridor world (VirtualRobot collision — read its API; simplest: assert robot's event stream/pose after N steps matches expectation, e.g. left-forever fixed: robot ends up further from start than turning-in-place; never-stops: robot stops (speed 0) within N steps after first bump; wrong-sensor: robot changes heading/brightness response to light). Be pragmatic — assertions on pose/event stream, deterministic.
- `diagnose(scenarioId, hypothesisIdx)` → {correct, earlNod | earlNudge}. `attemptFix(scenarioId, program)` → {fixed:boolean, verifyDetail}.
- Export `conceptsInScenario` → all map to `debugging` + the concept the bug is about (left-forever→conditionals, never-stops→loops-until, wrong-sensor→sensors-overview). BrokenBot completion → ledger.observe({type:'program_ran', used:[...]}) + a `{type:'quest_done'}`-equivalent: expose `ledgerEvent()` per scenario.

### 5. Tests: `src/learning/__tests__/learning-tests.mjs`
Framework-free, export `runLearningTests(ok)` — copy the harness registration pattern. Cover:
- concepts.js: all 16 unique ids, tier valid, QUEST_CONCEPTS covers ≥80% of CAMPAIGN quests that have teaching payloads (assert the count, print unmapped ids as comment), deriveConceptsFromTeaching keyword cases.
- ConceptLedger: full ladder walk unseen→seen→practiced→taught; monotonicity (taught can't regress); save/load round-trip; corrupt storage tolerated; conceptsInProgram tile-type mapping (use T.* to build a program with if_else+repeat+set_var, assert exact concept set).
- TeachBack: nextMoment picks practiced concept; correct answer → taught; wrong → retryLine + stays practiced + cooldown respected; shuffled options keep correct index tracked.
- BrokenBot: each scenario — broken program FAILS verify (proves the bug is real), correct hypothesis identified, a hand-fixed program PASSES verify, diagnose wrong-then-right flow.
Register in `src/maker/__tests__/run-tests.mjs` (read it; add import + call alongside other suites).
Run: `node src/maker/__tests__/run-tests.mjs` — must be ALL GREEN (it's 1377 passing now; don't break any). Also run `node src/quests/__tests__/quest-tests.mjs` style checks if they're folded into the harness — they are.

## RULES
- No DOM, no Three.js, no game imports in src/learning (maker + quests/data imports OK — they're headless).
- No new deps.
- Commit at the end: `git add -A && git commit -m "feat(learning): concept ladder engine — ledger, teach-back, broken-bot clinics"` (git identity already configured).
- If content JSON (teachback.json) is missing, write MINIMAL placeholder (3 questions: conditionals, loops-until, sensors-overview) so tests pass; content coder's file replaces it — keep schema EXACT.
