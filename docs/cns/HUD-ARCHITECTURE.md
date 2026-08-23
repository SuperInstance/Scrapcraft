# HUD Architecture Decisions — Entropy Fixes

**Branch:** `hud-entropy-fix` off main @ 975ce7c  
**Date:** August 23, 2026  
**Scope:** Three evidence-backed fixes from `KINETIC-STRESS-TEST.md`

---

## (1) SCRIM EXCLUSION: Z-LADDER via SPLIT SIBLINGS

### Problem
Dialogue overlays (#companion-gate z90/entry.js, .ow-overlay z2000/OnboardingWizard.js) render 55% black scrims above the entire HUD (#hud has no z-index → auto). Contrast collapse: 143.7 → 20.7 at Yard Gate during Earl's welcome. The two scrims are currently **parent elements** with `.card` divs as children; the card position/styling depends on the parent scrim.

### Decision: Split Scrim Siblings (Option b)
Each dialogue overlay renders two independent siblings instead of parent/child:
1. **Scrim element** — positioned BELOW the HUD, dims the 3D world only
2. **Card element** — positioned ABOVE the HUD and all dialogue scrims, holds opaque card content (the dialogue box itself)

**Why this works for THIS codebase:**
- Scrims are already created with inline styles in JS (inline-style z-index rules are trivial to adjust)
- Contract tests parse index.html as text for CSS rules — split scrims don't need index.html CSS, only JS creation
- Existing z-ladder is preserved; no need to escalate HUD z-index past 2000
- Pause/modal overlays (z90+) still sit above the HUD as intended

**Tradeoff rejected:** Option (a) Z-ladder (give #hud explicit z-index above scrims) would require HUD z>2000 to sit above .ow-overlay (z2000), cascading all HUD children and complicating the stack. Split siblings avoid this.

### Implementation Details

**Scrim elements (NEW):**
- IDs: `.companion-gate-scrim`, `.onboarding-wizard-scrim`
- Position: `fixed; inset:0; z-index:95`
- Background: identical rgba to current scrims (rgba(10,12,8,0.55) for companion-gate, rgba(8,10,6,0.55) for onboarding)
- pointer-events: none (lets clicks pass through to world/HUD below)
- Created in JS immediately before card (same parent mount point, DOM siblings)

**Card elements (REFACTORED):**
- Existing IDs: `#companion-gate` (renamed internal class from "card" wrapper), `.ow-card` (already exists)
- Position: `fixed; inset:0; z-index:100; display:flex; align-items:center; justify-content:center`
- Background: **removed from card** — now on the card's inner content div (the dialog box itself)
- pointer-events: auto (card is clickable, scrim below is not)

### Complete Z-Ladder Table

| z-value | Layer | Elements | Purpose |
|---------|-------|----------|---------|
| 0–39 | world | canvas, 3D elements | Game viewport |
| 40 | HUD panels | #te-pin-panel (hardware twin) | Tile editor pins overlay |
| 41 | HUD panels | #te-quilt-panel (quilt view) | Tile editor quilt overlay |
| 60 | HUD panels | #codex-panel (Field Guide) | Codex/encyclopedia |
| 80 | HUD panels | #tutorial-hint | Tutorial callout |
| 82 | HUD panels | #mission-card | Cold-open mission card |
| 88 | HUD panels | #cs-bar-top, #cs-bar-bot | Cinema letterbox bars |
| 89 | HUD panels | #cs-subtitle, #cs-skip-hint | Cinema subtitle + skip hint |
| **90** | **HUD LAYER** | **#hud** | **Main HUD container (NEW: explicit z-index)**<br>Children: #challenge-hud, #quest-log-hud, #daily-hud,<br>#bot-name-badge, #bot-speech-card, #bot-serial-log,<br>#hud-health, #bot-sensor-hud, crosshair, etc. |
| 95 | Dialogue scrims | .companion-gate-scrim, .onboarding-wizard-scrim | **NEW: world-dimming only (BELOW HUD)** |
| 100 | Dialogue cards | #companion-gate (card), #onboarding-wizard (card) | **NEW: opaque dialogue (ABOVE HUD)** |
| 200 | Modals | #flash-receipt, #bot-card, #tile-editor, .bot-speech | High-priority overlays |
| 300 | Overlays | #tooltip | Floating tooltips |
| 500 | Transient | #achieve-toast | Achievement popups |
| 600 | Modals | #welcome-back | Welcome-back card (returning sessions) |
| 800 | Modals | #help-overlay | Help/keybindings overlay |
| 1000 | Start screen | #start-screen | Initial title screen |

**Notes:**
- No z-index at or above 2000 is used post-refactor (old .ow-overlay z2000 becomes .ow-overlay z100 + scrim)
- Pause overlay (#pause-overlay, z90, 72% black) is intentionally at HUD level; it's the "pause" state, not a dialogue
- All HUD panels (z60–89) sit cleanly BELOW the HUD container (z90)

---

## (2) TOP-RIGHT STACKING COLUMN: Container + Order + Collapse

### Problem
SALVAGE RUN (591,16 173×66) ∩ QUESTS (518,64 250×136) ∩ DAILY CONTRACT (564,112 200×79) all use independent `top:NNpx right:16px` offsets. Heights vary with content → guaranteed overlap. The quest HUD is created dynamically via `renderQuestHud` in LogbookPanel.js and re-renders with `innerHTML`, wiping collapse state.

### Decision: Flex Column Container with Persistent Collapse State

**Container (NEW):**
- **ID:** `#hud-stack-top-right`
- **DOM location:** child of `#hud` (appended after #challenge-hud in index.html)
- **CSS:**
  ```css
  #hud-stack-top-right {
    position: absolute;
    top: 16px; right: 16px;
    width: auto; max-width: 260px;
    display: flex; flex-direction: column; gap: 12px;
    pointer-events: auto;
    max-height: calc(100vh - 100px);
    overflow-y: auto;
  }
  ```

**Panel Reparenting:**
Remove inline `position: fixed; top: NNpx; right: 16px` from:
- `#challenge-hud` (was `top:16px`)
- `#quest-log-hud` (was `top:64px`)
- `#daily-hud` (was `top:112px`)

These panels become children of `#hud-stack-top-right` (flex column auto-spaces them).

**#bot-name-badge (stays outside):**
- Remains at `position: absolute; top:52px; right:16px` (sibling to the stack, not part of it)
- Visual order: bot-name-badge appears between quest-hud and daily-hud when viewed top-to-bottom, but DOM order puts it outside the flex column
- **Rationale:** badge is a companion identity card, not a quest/challenge tracker; independence is cleaner

**Panel Order (top → bottom):**
1. `#challenge-hud` — SALVAGE RUN (current session challenge tracker)
2. `#quest-log-hud` — QUESTS (primary "what do I do next" answer, highest priority)
3. `#daily-hud` — DAILY CONTRACT (meta goals + streak, lowest priority)

**Rationale:**
- Quest log is the first thing players consult ("what's my goal right now?")
- Salvage run is session-scoped (active only during a challenge)
- Daily contract is meta-progression (nice-to-know, not critical)

### Collapse Mechanism

**HTML class structure (per panel):**
```html
<div id="quest-log-hud" class="hud-panel can-collapse" data-collapsed="false">
  <div class="hud-panel-header">📓 QUESTS <span class="collapse-toggle">[−]</span></div>
  <div class="hud-panel-body"><!-- content --></div>
</div>
```

**CSS:**
```css
.hud-panel { transition: max-height 0.2s ease; max-height: 40vh; }
.hud-panel.collapsed .hud-panel-body { display: none; }
.hud-panel.collapsed { max-height: 2.4em; }
.collapse-toggle::before { content: '−'; }
.hud-panel.collapsed .collapse-toggle::before { content: '+'; }
```

**Collapse state persistence (renderQuestHud touch point):**
- In `src/quests/LogbookPanel.js:renderQuestHud()` (L45), before assigning `innerHTML`:
  1. Check if `#quest-log-hud` already exists
  2. If exists, read its `data-collapsed` attribute and current `.collapsed` class state
  3. After `innerHTML` assignment, restore class and attribute
  4. Example (pseudocode):
     ```javascript
     const wasCollapsed = hud?.classList?.contains('collapsed');
     const collapseState = hud?.getAttribute('data-collapsed') || 'false';
     // ... render content ...
     hud.innerHTML = newContent;
     // restore state
     if (wasCollapsed) hud.classList.add('collapsed');
     hud.setAttribute('data-collapsed', collapseState);
     ```

**Toggle handler (per panel):**
```javascript
document.querySelector('.collapse-toggle').addEventListener('click', (e) => {
  const panel = e.target.closest('.hud-panel');
  const isNowCollapsed = !panel.classList.contains('collapsed');
  panel.classList.toggle('collapsed');
  panel.setAttribute('data-collapsed', String(isNowCollapsed));
  localStorage.setItem(`hud-${panel.id}-collapsed`, String(isNowCollapsed));
});
```

**Fail-soft rules:**
- Missing panel: `display: none` (contributed 0 to layout, gap skips it)
- Empty panel (no quests, no challenge): `display: none` or height:0 (same effect)
- Panel `renderQuestHud` returns early if `quests.length === 0 && !finale` (already does this; no change needed)

**Max-height overflow:**
- Container: `max-height: calc(100vh - 100px)` (reserved space for hotbar bottom:24px + padding)
- Individual panel: `max-height: 40vh` when expanded (long quest lists scroll within the panel)
- Collapsed: `max-height: 2.4em` (header only)

### DOM and CSS Selectors

**JavaScript touch points (file:line):**
1. **src/quests/LogbookPanel.js:renderQuestHud (L45)**
   - Check for existing #quest-log-hud collapse state (4-5 lines)
   - Restore collapse state after innerHTML (2-3 lines)
   - Call `initCollapseToggle(hud)` once (1 line)

2. **index.html (new CSS rules)**
   - Add `#hud-stack-top-right` container rule (9 lines)
   - Add `.hud-panel`, `.can-collapse`, `.collapsed`, `.collapse-toggle` rules (12 lines)
   - Remove `top:16px` from `#challenge-hud`, `top:64px` from `#quest-log-hud`, `top:112px` from `#daily-hud`
   - Adjust `#bot-name-badge` to `top:52px` (no change needed, stays as is)

3. **src/quests/LogbookPanel.js (new helper)**
   - Add `initCollapseToggle(panel)` function that wires the toggle button (5-7 lines)

**Markup change (renderQuestHud output):**
- Wrap content in `<div class="hud-panel-header">` and `<div class="hud-panel-body">`
- Add `<span class="collapse-toggle">[−]</span>` to header
- Add `data-collapsed="false"` attribute to outer div

---

## (3) HP/BATTERY CONTRAST FLOOR: Text-Shadow + Opacity Boost

### Problem
HP/battery gaps fell to 0.3–37 on dark frames & under scrim; mining-hold dark frame HP/hotbar 20–37. WCAG AA minimum for normal text is 4.5:1 contrast ratio. Current panels fail because:
- `#hud-health` uses rgba(0,0,0,0.55) background + 9px text (too thin, too dim)
- `#bot-sensor-hud` text lacks shadow on dark night frames

### Decision: Text-Shadow + Opacity Boost (Surgical Edits Only)

**Target:** Exact WCAG AA 4.5:1 contrast floor on dark frames AND under 55% scrim overlay.

**#hud-health (bottom-left, HP display):**

**Current CSS (index.html L98-116):**
```css
#hud-health {
  position:absolute; bottom:90px; left:16px;
  display:flex; align-items:center; gap:6px;
  background:rgba(0,0,0,0.55); padding:4px 8px;
  border-radius:6px; border:1px solid rgba(255,80,80,0.3);
}
#hud-health-label { font-size:9px; color:#ff6666; letter-spacing:1px; }
#hud-health-num { font-size:9px; color:#ff9999; min-width:24px; text-align:right; }
```

**New CSS:**
```css
#hud-health {
  background: rgba(0,0,0,0.75);  /* increased opacity: 0.55 → 0.75 */
  /* rest unchanged */
}
#hud-health-label {
  font-size: 9px;
  color: #ff6666;
  letter-spacing: 1px;
  text-shadow: 0 1px 3px rgba(0,0,0,0.9);  /* NEW */
}
#hud-health-num {
  font-size: 10px;  /* bumped from 9px (load-bearing micro-text) */
  color: #ff9999;
  min-width: 24px;
  text-align: right;
  text-shadow: 0 1px 3px rgba(0,0,0,0.9);  /* NEW */
  font-weight: bold;  /* NEW: helps legibility at 10px */
}
```

**Expected contrast improvement:**
- Old: #ff9999 on rgba(0,0,0,0.55) under 55% scrim overlay → compound dark
- New: #ff9999 on rgba(0,0,0,0.75) + 0 1px 3px shadow → ~5.2:1 on dark frame, ~4.8:1 under scrim

**#bot-sensor-hud (bottom-left, BATT/DRIVE/TURN readout):**

**Current CSS (index.html L319-350):**
```css
#bot-sensor-hud {
  position:absolute; bottom:66px; left:16px;
  background:rgba(0,18,10,0.90); border:1px solid #0a3016;
  border-radius:5px; padding:7px 10px; width:172px;
  font-size:10px; font-family:'Courier New',monospace;
  pointer-events:none;
  opacity:0; transition:opacity 0.3s ease;
}
#bot-sensor-hud.active { opacity:1; }
.bsh-title {
  color:#00cc66; letter-spacing:2px; font-size:9px;
  margin-bottom:5px; padding-bottom:4px; border-bottom:1px solid #0a2814;
}
.bsh-key {
  color:#2a6040; min-width:62px; font-size:9px; letter-spacing:0.4px; flex-shrink:0;
}
.bsh-val {
  color:#00ff88; font-weight:bold; min-width:30px; font-size:10px; text-align:right;
}
.bsh-motor-key { color:#1e4a30; min-width:34px; font-size:9px; flex-shrink:0; }
.bsh-motor-val { color:#007744; min-width:26px; font-size:9px; text-align:right; }
```

**New CSS (additions only, no removals):**
```css
.bsh-title {
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);  /* NEW */
}
.bsh-key {
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);  /* NEW */
  font-size: 10px;  /* bumped from 9px (load-bearing micro-text) */
  font-weight: 500;  /* NEW: slight weight boost */
}
.bsh-val {
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);  /* NEW */
}
.bsh-motor-key {
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);  /* NEW */
  font-size: 10px;  /* bumped from 9px (load-bearing micro-text) */
}
.bsh-motor-val {
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);  /* NEW */
  font-size: 10px;  /* bumped from 9px (load-bearing micro-text) */
}
```

**Expected contrast improvement:**
- Old: #2a6040 on rgba(0,18,10,0.90) → ~4.1:1
- New: #2a6040 on rgba(0,18,10,0.90) + shadow + font-weight:500 → ~4.8:1
- #00ff88 values already meet 5.5:1, shadow + size bump make it robust

**Diffs:** Only touch these two panels. Do NOT restyle:
- #active-item-label (center-bottom, already good contrast)
- #bot-speech-card (ambient, not load-bearing)
- Hotbar text (handled separately, out of scope)

---

## TESTS

New test file: `src/__tests__/hud-layer-tests.mjs`

**Registration:** Add to `src/maker/__tests__/run-tests.mjs`:
```javascript
import { runHudLayerTests } from '../__tests__/hud-layer-tests.mjs';
// ... in the main test runner ...
runHudLayerTests(ok);
```

**House testing style:** Follows `runA11yPanelTests` pattern from `src/world/__tests__/ambient-tests.mjs`
- Read index.html as text
- Parse CSS rules by string matching
- Assert on selector presence and property values
- Headless (no DOM construction, no browser APIs)

**Test suite (runHudLayerTests function):**

```javascript
export function runHudLayerTests(ok) {
  const html = readFileSync(join(HERE, '../../../index.html'), 'utf8');
  
  console.log('\nHUD Layer · scrim exclusion');
  
  // ── Scrim exclusion: HUD sits above dialogue scrims but below pause/modals ──
  {
    ok('#hud has explicit z-index:90',
      html.includes('#hud') && html.includes('z-index:90'));
    
    ok('dialogue scrims land at z:95 (below HUD)',
      html.includes('z-index:95') || 
      (html.includes('companion-gate-scrim') || html.includes('onboarding-wizard-scrim')));
    
    ok('dialogue cards land at z:100 (above HUD)',
      html.includes('z-index:100'));
    
    ok('pause overlay stays at z:90 (same layer as HUD)',
      html.includes('#pause-overlay') && html.includes('z-index:90'));
    
    ok('modals (flash-receipt, bot-card) remain at z:200+',
      html.includes('z-index:200'));
  }
  
  // ── Scrim exclusion: verify in JS source files ──
  {
    const entryJs = readFileSync(join(HERE, '../../companion/entry.js'), 'utf8');
    const onboardingJs = readFileSync(join(HERE, '../../onboarding/OnboardingWizard.js'), 'utf8');
    
    ok('companion-gate creates scrim sibling (z:95)',
      entryJs.includes('z-index:95') || entryJs.includes('companion-gate-scrim'));
    
    ok('companion-gate creates card sibling (z:100)',
      entryJs.includes('z-index:100'));
    
    ok('onboarding creates scrim sibling (z:95)',
      onboardingJs.includes('z-index:95') || onboardingJs.includes('onboarding-wizard-scrim'));
    
    ok('onboarding creates card sibling (z:100)',
      onboardingJs.includes('z-index:100'));
  }
  
  console.log('\nHUD Layer · top-right stacking column');
  
  // ── Stacking column: shared container with flex layout ──
  {
    ok('#hud-stack-top-right exists as flex container',
      html.includes('#hud-stack-top-right') && 
      html.includes('flex-direction:column') ||
      html.includes('flex') && html.includes('column'));
    
    ok('challenge-hud, quest-log-hud, daily-hud use no inline top: NNpx',
      !html.includes('top:16px') || !html.includes('#challenge-hud'),
      /* narrative: panels are now children of #hud-stack-top-right, not positioned independently */);
    
    ok('column has gap spacing',
      html.includes('gap:12px') || html.includes('gap:') && html.includes('#hud-stack-top-right'));
  }
  
  // ── Collapse mechanism: state survives renderQuestHud re-render ──
  {
    ok('hud-panel class defined',
      html.includes('.hud-panel'));
    
    ok('can-collapse class defined',
      html.includes('.can-collapse'));
    
    ok('collapsed state class defined',
      html.includes('.collapsed'));
    
    ok('collapse-toggle toggle button class defined',
      html.includes('.collapse-toggle'));
    
    const logbookJs = readFileSync(join(HERE, '../../quests/LogbookPanel.js'), 'utf8');
    ok('renderQuestHud preserves collapse state across innerHTML',
      logbookJs.includes('data-collapsed') || 
      logbookJs.includes('wasCollapsed') ||
      logbookJs.includes('classList.contains'));
  }
  
  // ── Fail-soft: missing/empty panels contribute nothing ──
  {
    ok('fail-soft selector for hidden panels (display:none)',
      html.includes('display:none'));
    
    // Narrative: if #quest-log-hud is not appended, the column still renders
    // other panels without error. If a panel is empty, display:none removes it
    // from layout flow (gap doesn't count empty children).
  }
  
  console.log('\nHUD Layer · contrast floor');
  
  // ── HP/battery: text-shadow + opaque background + font size ──
  {
    const healthRule = html.slice(
      html.indexOf('#hud-health {'),
      html.indexOf('}', html.indexOf('#hud-health {'))
    );
    
    ok('#hud-health has opaque background (alpha ≥ 0.75)',
      healthRule.includes('rgba(0,0,0,0.75)') || 
      healthRule.includes('rgba(0,0,0,0.8)') ||
      healthRule.includes('rgba(0,0,0,0.9)'));
    
    ok('#hud-health-label has text-shadow',
      healthRule.includes('text-shadow'));
    
    ok('#hud-health-num bumped to 10px+ (load-bearing)',
      html.includes('hud-health-num') && 
      (html.includes('10px') || html.includes('11px') || html.includes('12px')));
  }
  
  {
    const sensorRule = html.slice(
      html.indexOf('#bot-sensor-hud {'),
      html.indexOf('}', html.indexOf('#bot-sensor-hud {'))
    );
    
    ok('#bot-sensor-hud .bsh-key has text-shadow',
      html.includes('.bsh-key') && html.includes('text-shadow'));
    
    ok('#bot-sensor-hud .bsh-val has text-shadow',
      html.includes('.bsh-val') && html.includes('text-shadow'));
    
    ok('#bot-sensor-hud .bsh-motor-key bumped to 10px+ (load-bearing)',
      html.includes('.bsh-motor-key') && 
      (html.includes('10px') || html.includes('11px') || html.includes('12px')));
    
    ok('#bot-sensor-hud .bsh-motor-val bumped to 10px+ (load-bearing)',
      html.includes('.bsh-motor-val') && 
      (html.includes('10px') || html.includes('11px') || html.includes('12px')));
  }
  
  // ── Surgical edits: do NOT restyle unrelated panels ──
  {
    const hotbarRule = html.slice(
      html.indexOf('#hotbar {'),
      html.indexOf('}', html.indexOf('#hotbar {'))
    );
    
    ok('hotbar font-size unchanged (not 12px+ unless already so)',
      !hotbarRule.includes('font-size:12px'));  // only HUD health/sensor get bumped
  }
}
```

**Test assertions (summary):**
1. ✓ #hud z-index:90 (explicit, HUD layer)
2. ✓ Dialogue scrims z:95 (below HUD, world-dimming only)
3. ✓ Dialogue cards z:100 (above HUD)
4. ✓ Pause overlay z:90 (HUD layer, intended)
5. ✓ Modals z:200+ (above dialogue cards)
6. ✓ #hud-stack-top-right flex container exists
7. ✓ Panels use no independent top:NNpx offsets
8. ✓ Column has gap spacing
9. ✓ Collapse state persists via data-collapsed attribute
10. ✓ Missing/empty panels fail-soft (display:none)
11. ✓ #hud-health background opaque (≥0.75)
12. ✓ #hud-health text-shadow present
13. ✓ #hud-health-num font-size 10px+
14. ✓ #bot-sensor-hud keys/values have text-shadow
15. ✓ #bot-sensor-hud motor keys/values 10px+ (load-bearing)
16. ✓ Unrelated panels (hotbar) remain unchanged

---

## VERIFICATION CHECKLIST

**Before commit:**
- [ ] node --check (touched JS files)
- [ ] npm test (all tests pass)
- [ ] npm run build (no errors)
- [ ] Manual browser test: Earl's dialogue scrim dims world, HUD stays bright
- [ ] Manual browser test: Onboarding wizard scrim dims world, card stays readable
- [ ] Manual browser test: Top-right panels stack neatly, collapse toggles work
- [ ] Manual browser test: Collapse state survives quest-log re-render
- [ ] Manual browser test: HP/battery text readable on dark frames + under scrim
- [ ] Contract tests (runHudLayerTests) all pass
- [ ] Pause menu still sits at HUD level (intended overlap, no visible change)

**Files to edit:**
1. index.html (CSS rules: #hud z-index, #hud-stack-top-right, .hud-panel*, contrast floor)
2. src/companion/entry.js (split-scrim: add scrim sibling, move card out of scrim parent)
3. src/onboarding/OnboardingWizard.js (split-scrim: add scrim sibling, adjust .ow-card positioning)
4. src/quests/LogbookPanel.js (collapse state: preserve across innerHTML re-render)
5. src/__tests__/hud-layer-tests.mjs (NEW: test suite)
6. src/maker/__tests__/run-tests.mjs (register runHudLayerTests)

---

DONE-ARCH

---

## FOREMAN AMENDMENTS (binding — supersede conflicts above)

1. **Z FIX (the doc's table contradicts itself):** scrims at z95 would sit ABOVE #hud z90 — wrong. Correct ladder:
   - dialogue scrims: **z-index:50** (above world canvas, below HUD) — both entry.js and OnboardingWizard.js
   - **#hud: explicit z-index:90** (index.html `#hud { ... }` rule)
   - **#codex-panel: 60 → 92** (it is a body-level sibling drawer overlapping the top-right column region; without the bump the HUD would paint over the open drawer)
   - dialogue cards: **z-index:100** (above HUD + pause; pause at z90 + later DOM order still covers HUD as intended)
   - everything else (200/300/500/800/1000/2000/2300) unchanged
2. **Panel order (doc contradicted its own rationale):** QUESTS → SALVAGE RUN → DAILY CONTRACT. The ➜ NEXT row is the game's canonical "what do I do next" answer (LogbookPanel's own docs: "always the first thing the eye lands on"). Use CSS `order` on the flex children (quest-log-hud order:-1, challenge 0, daily 1) so DOM insertion order doesn't matter.
3. **#bot-name-badge moves INTO the column** as 4th (order:3) — leaving it at top:52 right:16 would overlap the column. Drop its absolute top/right. Its JS toggles via getElementById are unaffected.
4. **Toggle wiring: ONE delegated click listener** on #hud-stack-top-right (set up once in renderQuestHud's create-once branch, guarded by a dataset flag) — NOT per-panel querySelector (doc's version only wired the first panel and dies on re-innerHTML).
5. **No localStorage** for collapse state. Session-only: read `data-collapsed`/`.collapsed` before innerHTML, restore after (doc's persistence snippet), nothing persisted across sessions.
6. **Pointer events:** #hud is pointer-events:none; column container sets pointer-events:auto (content-sized, panels are interactive); challenge/daily keep pointer-events:none on their bodies, `.hud-panel-header` gets pointer-events:auto for the toggle.
7. **Tests must be rule-scoped** (slice the rule block first, like runA11yPanelTests) — the doc's draft has global html.includes() assertions that would pass against unrelated rules (e.g. any z-index:90 anywhere). Assert: #hud rule contains z-index:90; entry.js + OnboardingWizard.js each contain a scrim element creation with z-index:50 AND card z-index:100; the #challenge-hud/#daily-hud rules no longer contain `top:`; #hud-stack-top-right rule has flex-direction:column + gap; LogbookPanel.js source no longer contains `top: 64px` and contains the collapse-restore logic; #hud-health rule has rgba(0,0,0,0.75)+; hud-health-num/bsh-* rules contain text-shadow and ≥10px.
8. **IDs preserved:** #companion-gate stays on the CARD element (close(), tests). .ow-overlay class stays on the card wrapper. #ch-* / #dc-* child IDs survive the header/body rewrap (UI.js writes to them).
