# PASS 2 — SYSTEMS (opencode)

Repo: /tmp/scrap-teach-wt, branch teach-payload (already has the learning engine, tests 1446 green — keep them green). ALL work in this dir. House style: STANDARDS.md.

## CONTEXT
`src/learning/` now has concepts.js (16 concepts, 4 tiers, QUEST_CONCEPTS map), ConceptLedger.js (localStorage key `scrapcraft_concepts_v1`, states unseen→seen→practiced→taught), TeachBack.js, BrokenBot.js. Content in src/learning/data/. Nothing in the game or teacher.html consumes it yet.

## JOB A — save integration (small, surgical)
1. Read `src/SaveSystem.js` and where it serializes (SAVE_KEY 'scrapcraft_save_v6'). Add the ConceptLedger data into the save payload under `concepts` so cloud saves (game_saves.state_json) carry concept mastery. Pattern: find where the game collects state (grep for spine — Spine data; follow the same pattern). If Spine is saved separately too, mirror whatever it does. ConceptLedger has save()/load() with its own storage; adapt: give it a way to export/import its state object (add `toJSON()`/`fromJSON(obj)` methods if missing) so SaveSystem can embed it without localStorage coupling.
2. In the game boot/quest-completion/program-run paths, wire minimal observation events if trivial hooks exist (e.g. wherever quest_done is already recorded — grep QuestSystem/Tracker completion; wherever a tile program run is already recorded — grep TileEditor 'run'). Keep it LOW RISK: if a hook point is ambiguous, prefer fewer touch points (quest completion + save-time) over invasive changes. Logbook/NextStep UI untouched unless trivial.
3. TeachBack surfacing: add a lightweight prompt in an existing modal/toast surface if one exists (grep LogbookPanel or companion toast). Minimal: when TeachBack.available()>0 and ledger.nextTeachable() non-null, show one small "Rivet asks: ..." prompt with the 3 options in whatever dialog surface exists. If no clean surface, expose it as a Logbook panel section (LogbookPanel.js) — read it first. Fail-soft: any error → silent no-op.

## JOB B — teacher.html concept coverage
1. Read teacher.html fully + cloudflare/src/game-api.js `handleClassRoster` + `handleStudentBrain`. The roster endpoint exists; the brain endpoint returns the student's save state_json.
2. Add a "CONCEPT COVERAGE" panel to the dashboard (below the roster table): a 4-tier × 16-concept grid. Data: for each student with has_save, fetch the brain (same fetch the 👁 Brain button uses) and extract `concepts` from the state JSON (the payload from Job A). Aggregate: per concept, count students in each state (unseen/seen/practiced/taught), render as a compact grid — each cell shows the concept kidPhrase with a tiny stacked bar or n/N taught count; tooltip lists per-student states. Fail-soft: students without concept data count as "no data" (dimmed), panel still renders. Cache fetched brains in a Map, refresh with the existing refresh cycle. Add a "Concepts" toggle/tab button so the default view is unchanged.
3. Printable mission cards: add a "PRINT MISSION CARDS" button that opens a print-friendly overlay (window.print with @media print CSS) rendering 12 cards, one per spine chapter — source the card CONTENT from `docs/mission-cards.md` (read it; embed its card text as a JS const, cards in order ch01–ch12, each ~80 words: number+title, kid-language skill, 3 field-note prompts, 1 try-at-home activity). Style to match existing CSS vars; 4 cards per printed page.

## JOB C — tests
- New/updated tests in house style for anything new that is headless-testable (toJSON/fromJSON round-trip, save payload includes concepts — if SaveSystem has tests, extend them). teacher.html is UI — no DOM tests needed, but keep it syntactically valid (node --check won't parse HTML; at least run its <script> through `node -e` extraction check or careful review).
- `node src/maker/__tests__/run-tests.mjs` ALL GREEN (1446 baseline).
- Commit: `git add -A ':!node_modules' && git commit -m "feat(teacher): concept-coverage panel + printable mission cards; wire concept ledger into saves"`

## RULES
- No new deps. No schema.sql changes (state_json carries concepts — schema untouched).
- Don't regress the 1446 tests. Don't restructure Game.js — additive wiring only.
