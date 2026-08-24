/**
 * ───────────────────────────────────────────────────────────────────────────
 *  HUD LAYER CONTRACT TESTS  —  the entropy fixes' load-bearing surface
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Three fixes, one file (docs/cns/HUD-ARCHITECTURE.md + FOREMAN AMENDMENTS):
 *   1. split-scrim siblings — scrims z:50 (dim the world only), cards z:100,
 *      #hud explicitly z:90 between them, codex drawer bumped past the HUD
 *   2. top-right stacking column — one flex parent, CSS order, collapsible
 *      panels whose state survives renderQuestHud's innerHTML re-render
 *   3. HP/battery contrast floor — opaque backdrop + text-shadow + 10px
 *
 * House style (runA11yPanelTests pattern): read the sources as text, slice
 * the RULE BLOCK first, then assert — never a global html.includes() for a
 * property check (amendment #7: any stray z-index:90 anywhere would pass
 * that). JS-injected overlays are asserted on their source strings.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, '../../index.html'), 'utf8');

/** Slice one CSS rule block ("selector … }") out of a stylesheet — or out of
 *  a JS source that embeds CSS/inline cssText literally. Whitespace-tolerant
 *  (index.html pads some selectors with a double space). null if absent. */
function rule(src, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(esc + '\\s*\\{').exec(src);
  if (!m) return null;
  const end = src.indexOf('}', m.index);
  return end === -1 ? null : src.slice(m.index, end);
}

export function runHudLayerTests(ok) {
  console.log('\nHUD layer · scrim exclusion (split siblings)');

  // ── (a) the z-ladder, rule-scoped in index.html ──
  {
    const hud = rule(html, '#hud');
    ok('#hud rule carries explicit z-index:90 (HUD layer, above the scrims)',
       hud !== null && /z-index:\s*90\b/.test(hud));

    const codex = rule(html, '#codex-panel');
    ok('#codex-panel rule bumped to z-index:92 (drawer paints over the HUD column it overlaps)',
       codex !== null && /z-index:\s*92\b/.test(codex));
  }

  // ── (b) both dialogue overlays split into scrim + card siblings ──
  {
    const entry = readFileSync(join(HERE, '../companion/entry.js'), 'utf8');
    const build = entry.slice(entry.indexOf('_build(mount)'), entry.indexOf('_render()'));
    ok('entry.js: scrim sibling (companion-gate-scrim) at z-index:50, click-through',
       build.includes('companion-gate-scrim') && build.includes('z-index:50')
       && build.includes('pointer-events:none'));
    const cardPart = build.slice(build.indexOf("id = 'companion-gate'"));
    ok('entry.js: #companion-gate card wrapper at z-index:100 with no wrapper background',
       cardPart.includes('z-index:100') && !/background/.test(cardPart));
    ok('entry.js: close() removes BOTH siblings',
       /close\(\)\s*\{[^}]*_scrim\?\.remove\(\)/.test(entry));

    const wiz = readFileSync(join(HERE, '../onboarding/OnboardingWizard.js'), 'utf8');
    const scrimRule = rule(wiz, '.ow-scrim');
    ok('OnboardingWizard: .ow-scrim rule at z-index:50, click-through, world-dimming rgba',
       scrimRule !== null && /z-index:\s*50\b/.test(scrimRule)
       && /pointer-events:\s*none/.test(scrimRule)
       && /rgba\(8,\s*10,\s*6,\s*0\.55\)/.test(scrimRule));
    const overlayRule = rule(wiz, '.ow-overlay');
    ok('OnboardingWizard: .ow-overlay card wrapper at z-index:100 with NO background',
       overlayRule !== null && /z-index:\s*100\b/.test(overlayRule)
       && !/background/.test(overlayRule));
    ok('OnboardingWizard: show() mounts the scrim, finish() removes both siblings',
       wiz.includes("className = 'ow-scrim'") && /this\.scrim\?\.remove\(\)/.test(wiz));
  }

  console.log('\nHUD layer · top-right stacking column');

  // ── (c) one flex column, no magic top offsets on the panels ──
  {
    const stack = rule(html, '#hud-stack-top-right');
    ok('#hud-stack-top-right rule: flex column with gap, clamped height, pointer-live',
       stack !== null && /flex-direction:\s*column/.test(stack)
       && /gap:\s*10px/.test(stack) && /max-height:\s*calc\(100vh/.test(stack)
       && /pointer-events:\s*auto/.test(stack));

    const ch = rule(html, '#challenge-hud');
    ok('#challenge-hud rule carries no top: pinning (flex child of the column)',
       ch !== null && !/top\s*:/.test(ch));
    const dc = rule(html, '#daily-hud');
    ok('#daily-hud rule carries no top: pinning (flex child of the column)',
       dc !== null && !/top\s*:/.test(dc));
    const badge = rule(html, '#bot-name-badge');
    ok('#bot-name-badge rule drops absolute top/right (4th column member)',
       badge !== null && !/top\s*:/.test(badge) && !/right\s*:/.test(badge));

    ok('markup: challenge, daily and badge reparented into #hud-stack-top-right',
       /<div id="hud-stack-top-right">[\s\S]*?id="challenge-hud"[\s\S]*?id="daily-hud"[\s\S]*?id="bot-name-badge"/.test(html));

    ok('reading order QUESTS → SALVAGE RUN → DAILY → badge via CSS order',
       /#quest-log-hud\s*\{\s*order:\s*-1/.test(html)
       && /#challenge-hud\s*\{\s*order:\s*0/.test(html)
       && /#daily-hud\s*\{\s*order:\s*1/.test(html)
       && /#bot-name-badge\s*\{\s*order:\s*3/.test(html));
  }

  // ── (d) collapse mechanism survives the innerHTML re-render ──
  {
    const hdr = rule(html, '.hud-panel-header');
    ok('.hud-panel-header: pointer-events:auto + cursor:pointer (the toggle surface)',
       hdr !== null && /pointer-events:\s*auto/.test(hdr) && /cursor:\s*pointer/.test(hdr));

    const hiddenBody = rule(html, '.hud-panel.collapsed .hud-panel-body');
    ok('.hud-panel.collapsed hides its body (collapses to a slim chip)',
       hiddenBody !== null && /display:\s*none/.test(hiddenBody));

    ok('collapse toggle glyph switches − / + via ::before',
       /\.collapse-toggle::before\s*\{\s*content:\s*'−'/.test(html)
       && /\.hud-panel\.collapsed \.collapse-toggle::before\s*\{\s*content:\s*'\+'/.test(html));

    const logbook = readFileSync(join(HERE, '../quests/LogbookPanel.js'), 'utf8');
    ok('renderQuestHud: no more fixed top: 64px pinning (static flex child now)',
       !logbook.includes('top: 64px') && !logbook.includes('position: fixed; top'));
    ok('renderQuestHud: collapse state captured + restored across innerHTML',
       logbook.includes('wasCollapsed') && logbook.includes('data-collapsed')
       && logbook.includes("classList.toggle('collapsed', wasCollapsed)"));
    ok('ONE delegated collapse listener on the column (dataset-flag guarded)',
       logbook.includes('hudCollapseWired')
       && logbook.includes(".closest('.hud-panel-header')")
       && logbook.includes(".closest('.hud-panel')"));
    ok('renderQuestHud appends into the column (with #hud/body fail-soft fallback)',
       logbook.includes("getElementById('hud-stack-top-right')"));
  }

  console.log('\nHUD layer · attention discipline chrome (finding #1)');

  // ── (e) the "Earl's mission first" cue chrome — additive, empty-safe ──
  {
    ok('markup: Salvage Run + Daily headers carry the defer-note slot',
       /id="challenge-hud"[\s\S]*?class="hud-defer-note"/.test(html)
       && /id="daily-hud"[\s\S]*?class="hud-defer-note"/.test(html));
    const note = rule(html, '.hud-defer-note');
    ok('.hud-defer-note rule: full-width italic cue line',
       note !== null && /flex-basis:\s*100%/.test(note) && /font-style:\s*italic/.test(note));
    ok('empty cue note collapses away (no phantom second row)',
       /hud-defer-note:empty\s*\{\s*display:\s*none/.test(html));
    const deferred = rule(html, '.hud-panel.deferred');
    ok('.hud-panel.deferred dims the chip (subtle "later" look)',
       deferred !== null && /opacity:\s*0\.8/.test(deferred));
    ok('deferred chips drop the manual collapse glyph',
       /hud-panel\.deferred \.collapse-toggle\s*\{\s*display:\s*none/.test(html));
    ok('.hud-panel.unfold carries the fanfare animation',
       /hud-panel\.unfold\s*\{\s*animation:\s*hud-unfold/.test(html)
       && html.includes('@keyframes hud-unfold'));
  }

  console.log('\nHUD layer · HP/battery contrast floor');

  // ── (e) surgical contrast edits: #hud-health + .bsh-* only ──
  {
    const health = rule(html, '#hud-health');
    ok('#hud-health backdrop raised to rgba(0,0,0,0.75)',
       health !== null && health.includes('rgba(0,0,0,0.75)'));

    const hlabel = rule(html, '#hud-health-label');
    ok('#hud-health-label carries the text-shadow floor',
       hlabel !== null && /text-shadow:\s*0 1px 3px rgba\(0,0,0,0\.9\)/.test(hlabel));

    const hnum = rule(html, '#hud-health-num');
    ok('#hud-health-num: 10px bold + text-shadow (load-bearing micro-text)',
       hnum !== null && /font-size:\s*10px/.test(hnum) && /font-weight:\s*bold/.test(hnum)
       && /text-shadow:\s*0 1px 3px rgba\(0,0,0,0\.9\)/.test(hnum));

    const bshShadow = ['.bsh-title', '.bsh-key', '.bsh-val', '.bsh-motor-key', '.bsh-motor-val'];
    for (const sel of bshShadow) {
      const r = rule(html, sel);
      ok(`${sel} carries the text-shadow floor`,
         r !== null && /text-shadow:\s*0 1px 2px rgba\(0,0,0,0\.8\)/.test(r));
    }
    const bshBumped = ['.bsh-key', '.bsh-motor-key', '.bsh-motor-val'];
    for (const sel of bshBumped) {
      const r = rule(html, sel);
      ok(`${sel} bumped to 10px (load-bearing micro-text)`,
         r !== null && /font-size:\s*10px/.test(r));
    }
    const key = rule(html, '.bsh-key');
    ok('.bsh-key font-weight:500 (slight weight boost)',
       key !== null && /font-weight:\s*500/.test(key));
  }
}
