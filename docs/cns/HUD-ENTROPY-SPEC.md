# HUD Entropy Fixes — Foreman Spec (kinetic report follow-ups)

Branch `hud-entropy-fix` off main @ 975ce7c. Three evidence-backed fixes from
`docs/cns/KINETIC-STRESS-TEST.md`. Verified builds before every commit:
`node --check` (touched JS), `npm test`, `npm run build`.

## Fix 1 — Scrim dims the WORLD, not the HUD (report §3-3, §worst-1)

**Evidence:** dialogue overlays z90/z2000 with 55% black scrims render above the
entire HUD (`#hud` has no z-index → auto). Contrast collapse 143.7 → 20.7 at
the Yard Gate during Earl's welcome dialogue.

**Current scrims (both are "Earl's welcome dialogue" flow):**
- `#companion-gate` — `src/companion/entry.js` ~L110: `position:fixed;inset:0;
  z-index:90; background:rgba(10,12,8,0.55)`. Card is a child div of the scrim.
- `.ow-overlay` — `src/onboarding/OnboardingWizard.js` ~L250: same pattern,
  z-index:2000, background rgba(8,10,6,0.55). Card `.ow-card` is a child.
- `#pause-overlay` (index.html, z90, 0.72 black) — game is PAUSED there; dimming
  everything is intended behavior. Out of scope.

**Required outcome:** during those two dialogues the HUD (HP, hotbar, quest
stack, sensors) stays at full contrast; the 3D world behind it dims. The
dialogue card stays centered and above everything.

**Open architecture choice (CLAUDE PASS DECIDES + JUSTIFY):**
- (a) Z-ladder: give `#hud` an explicit z-index above the dialogue scrims but
  below true modals. Watch: ow-overlay is z2000 (above inventory z800!) — a
  naive "HUD above scrim" needs z > 2000 which escalates everything, OR the
  scrims move down instead. Consider: what else lives at 90–2000 and what
  SHOULD cover the HUD (pause, full-screen menus, tile editor, pregame toast)?
- (b) Split scrim: each dialogue renders two siblings — a scrim div that sits
  BELOW the HUD (dims world only) and a card div above the HUD. Scrim and card
  stop being parent/child.
- Pick the cleaner one for THIS codebase (inline-styles scrims in JS, one big
  index.html stylesheet, contract tests parse index.html text). Document the
  full resulting z-ladder in the commit + a comment block.

## Fix 2 — Top-right stacking column (report §verdicts "Top-right stack geometry")

**Evidence rects:** SALVAGE RUN (591,16 173×66) ∩ QUESTS (518,64 250×136) ∩
DAILY CONTRACT (564,112 200×79). All sibling panels independently positioned
with magic top/right offsets; heights vary with content → guaranteed overlap.

**Claimants of the corner (in #hud):**
- `#challenge-hud` — index.html L373: absolute top:16 right:16 (SALVAGE RUN)
- `#bot-name-badge` — L192: absolute top:52 right:16 width:130
- `#quest-log-hud` — JS-created in `src/quests/LogbookPanel.js` renderQuestHud
  (L45): fixed top:64 right:12 width:250 z-index:40 (QUESTS + ➜ NEXT row)
- `#daily-hud` — L388: absolute top:112 right:16 (DAILY CONTRACT)

**Required outcome:**
- One shared top-right column container (flex column + gap); NO magic top
  offsets on the panels themselves; order is sensible and documented
  (recommendation to evaluate: QUESTS log first — it's the "what do I do next"
  answer — then SALVAGE RUN session chip, then DAILY CONTRACT meta/streak,
  bot badge last; architecture pass may justify different order).
- Per-panel collapse: each panel collapses to a slim one-line chip (title row
  stays, body hides) via a small toggle; collapsed state must not throw if a
  panel is missing/empty (fail-soft: display:none panels simply contribute 0).
- Column must not overflow off-screen: max-height with graceful handling.
- Note: `renderQuestHud` re-runs and re-`innerHTML`s the panel — collapse state
  must survive re-render.

## Fix 3 — HP/battery contrast floor (report §verdicts HP + Battery rows, worst-3)

**Evidence:** HP/battery gaps fell to 0.3–37 on dark frames & under scrim;
mining-hold dark frame HP/hotbar 20–37. Report rec #2: scrim or text-shadow,
10px→12px minimum.

**Targets:** `#hud-health` (bg rgba(0,0,0,0.55), 9px labels) and
`#bot-sensor-hud` (BATT/DRIVE/TURN, 10px). Required: a *contrast floor* —
slightly more opaque backdrop chip + subtle text-shadow that survives both
bright morning sky and dark night frames. Raise sub-10px HUD micro-text where
it's load-bearing (HP number, battery keys) toward the 12px report floor —
but do NOT restyle every panel; keep diffs surgical.

## Tests — house style

New `src/__tests__/hud-layer-tests.mjs` exporting `runHudLayerTests(ok)`,
registered in `src/maker/__tests__/run-tests.mjs` (see runSaveRoundTripTests).
Pattern precedent: `runA11yPanelTests` in `src/world/__tests__/ambient-tests.mjs`
— readFileSync index.html, parse rules by string, assert CSS contracts.
Headless-testable contracts:
- scrim exclusion: whatever mechanism lands (z-ladder tokens or split siblings),
  assert HUD sits above dialogue scrims but below pause/modal overlays
  (or scrim element documented-below-HUD), for BOTH scrims (index.html +
  the two JS-injected ones — for JS files, assert on their source strings).
- stacking column: the three panels share the column container (no independent
  top:NNpx offsets on panel rules), column is flex with gap.
- collapse: body class toggles defined; fail-soft selector present.
- contrast floor: #hud-health + #bot-sensor-hud rules contain text-shadow and
  background alpha ≥ previous values.
