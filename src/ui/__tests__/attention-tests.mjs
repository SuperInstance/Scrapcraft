/**
 * ───────────────────────────────────────────────────────────────────────────
 *  ATTENTION DISCIPLINE tests  —  playtest finding #1 (first five minutes)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The gate questions' five-voices-at-once bug and its fix:
 *   1. TAKE TURNS — while the gate/entry overlay is open, the quest panel
 *      and the secondary chips collapse to slim headers; they unfold only
 *      after the gate closes. While Earl's tutorial dialog is mid-beat, the
 *      secondary chips stay collapsed.
 *   2. SECONDARY OBJECTIVES SAY "later" — Salvage Run + Daily Contract stay
 *      dimmed/collapsed with a "focus on Earl's mission first" cue until the
 *      FIRST quest completes, then unfold with a one-time fanfare beat.
 *   3. The ➜ NEXT row (quest panel) stays authoritative throughout.
 *
 * All headless: pure decisions, fail-soft DOM reads over fake elements, and
 * the director's state machine — no real DOM, no Game constructor.
 */

import {
  chipAttention,
  questPanelAttention,
  readAttentionContext,
  FIRST_QUEST_ID,
  DEFER_CUE,
  FANFARE_NOTIFY,
  AttentionDirector,
} from '../attention.js';

/** Minimal fake element with a Set-backed classList. */
function fakeEl(initial = []) {
  const classes = new Set(initial);
  const el = {
    textContent: '',
    dataset: {},
    style: { display: '' },
    classList: {
      contains: c => classes.has(c),
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      toggle: (c, force) => {
        const on = force !== undefined ? !!force : !classes.has(c);
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
    },
    setAttribute: (k, v) => { el.dataset[k] = String(v); },
    getAttribute: k => el.dataset[k] ?? null,
  };
  return el;
}

/** Minimal fake document: an id → element map, mutable via `.els`. */
function fakeDoc(initial = {}) {
  const els = {
    'companion-gate': null, 'onboarding-wizard': null, 'foreman-bubble': null,
    'mission-card': null, 'earl-chat': null,
    'quest-log-hud': null, 'challenge-hud': null, 'daily-hud': null,
    ...initial,
  };
  return { els, getElementById: id => els[id] ?? null };
}

/** Wire a `.hud-defer-note` child into a chip element (like index.html). */
function withNote(el) {
  const note = fakeEl();
  el.querySelector = sel => (sel === '.hud-defer-note' ? note : null);
  return note;
}

/** Minimal fake game: quest tracker (mutable completion) + notify spy. */
function fakeGame(completed = false) {
  let done = completed;
  const notifies = [];
  const tracker = { isCompleted: id => done && id === FIRST_QUEST_ID };
  return {
    quests: { tracker },
    ui: { notify: t => notifies.push(t) },
    notifies,
    setFirstDone(v) { done = v; },
  };
}

export async function runAttentionTests(ok) {
  console.log('\nAttention discipline · pure chip decisions (finding #1)');
  {
    const gate = chipAttention({ gateOpen: true, earlTalking: false, firstQuestDone: false });
    ok('gate open → secondary chip collapsed, no cue', gate.collapsed === true && gate.cue === false, JSON.stringify(gate));

    const earl = chipAttention({ gateOpen: false, earlTalking: true, firstQuestDone: true });
    ok('Earl mid-beat → chip collapsed, no cue', earl.collapsed === true && earl.cue === false, JSON.stringify(earl));

    const pending = chipAttention({ gateOpen: false, earlTalking: false, firstQuestDone: false });
    ok('first quest pending → collapsed + "later" cue', pending.collapsed === true && pending.cue === true, JSON.stringify(pending));

    const done = chipAttention({ gateOpen: false, earlTalking: false, firstQuestDone: true });
    ok('first quest done → chip open', done.collapsed === false && done.cue === false, JSON.stringify(done));

    const playerCollapsed = chipAttention({ gateOpen: false, earlTalking: false, firstQuestDone: true, playerCollapsed: true });
    ok('first quest done + player collapsed → stays collapsed', playerCollapsed.collapsed === true, JSON.stringify(playerCollapsed));

    const gateBeats = chipAttention({ gateOpen: true, earlTalking: false, firstQuestDone: true, playerCollapsed: false });
    ok('gate open beats player state', gateBeats.collapsed === true, JSON.stringify(gateBeats));
  }

  console.log('\nAttention discipline · quest panel (➜ NEXT stays authoritative)');
  {
    ok('gate open → quest panel collapsed (slim header)',
       questPanelAttention({ gateOpen: true }).collapsed === true);
    ok('gate closed → quest panel open — the ➜ NEXT row speaks',
       questPanelAttention({ gateOpen: false }).collapsed === false);
  }

  console.log('\nAttention discipline · context reads (fail-soft)');
  {
    const ctx = readAttentionContext(null, {});
    ok('null document → all-false context, no throw',
       ctx.gateOpen === false && ctx.earlTalking === false && ctx.firstQuestDone === false, JSON.stringify(ctx));

    ok('no gate element → gateOpen false', readAttentionContext(fakeDoc({}), {}).gateOpen === false);
    ok('#companion-gate present → gateOpen true',
       readAttentionContext(fakeDoc({ 'companion-gate': fakeEl() }), {}).gateOpen === true);
    ok('#onboarding-wizard present → gateOpen true',
       readAttentionContext(fakeDoc({ 'onboarding-wizard': fakeEl() }), {}).gateOpen === true);

    const foremanUp = fakeEl(); foremanUp.style.display = 'block';
    ok('foreman bubble visible → earlTalking',
       readAttentionContext(fakeDoc({ 'foreman-bubble': foremanUp }), {}).earlTalking === true);
    const foremanDown = fakeEl(); foremanDown.style.display = 'none';
    ok('foreman bubble hidden → not talking',
       readAttentionContext(fakeDoc({ 'foreman-bubble': foremanDown }), {}).earlTalking === false);

    ok('mission card .show → earlTalking (tutorial mid-beat)',
       readAttentionContext(fakeDoc({ 'mission-card': fakeEl(['show']) }), {}).earlTalking === true);
    ok('mission card without .show → not talking',
       readAttentionContext(fakeDoc({ 'mission-card': fakeEl() }), {}).earlTalking === false);

    ok('earl chat panel open → earlTalking',
       readAttentionContext(fakeDoc({ 'earl-chat': fakeEl() }), {}).earlTalking === true);

    ok('first quest complete → firstQuestDone',
       readAttentionContext(fakeDoc({}), fakeGame(true)).firstQuestDone === true);
    ok('first quest pending → firstQuestDone false',
       readAttentionContext(fakeDoc({}), fakeGame(false)).firstQuestDone === false);
    ok('no tracker → treated as done (fail-soft: chips open)',
       readAttentionContext(fakeDoc({}), {}).firstQuestDone === true);
    ok('null tracker → treated as done (fail-soft)',
       readAttentionContext(fakeDoc({}), { quests: { tracker: null } }).firstQuestDone === true);
  }

  console.log('\nAttention discipline · director state machine (fresh kid)');
  {
    const quest = fakeEl(['hud-panel']);
    const challenge = fakeEl(['hud-panel']);
    const chNote = withNote(challenge);
    const daily = fakeEl(['hud-panel']);
    const dcNote = withNote(daily);
    const foreman = fakeEl(); foreman.style.display = 'none';
    const gate = fakeEl();
    const game = fakeGame(false);
    const doc = fakeDoc({ 'companion-gate': gate, 'foreman-bubble': foreman, 'quest-log-hud': quest, 'challenge-hud': challenge, 'daily-hud': daily });
    const dir = new AttentionDirector(game, { doc, fanfareMs: 10 });

    // ── gate open: everything hushed to slim headers ──
    dir.sync(true);
    ok('gate open → quest panel collapsed',
       quest.classList.contains('collapsed'), `quest=${quest.classList.contains('collapsed')}`);
    ok('gate open → Salvage Run collapsed',
       challenge.classList.contains('collapsed'));
    ok('gate open → Daily Contract collapsed',
       daily.classList.contains('collapsed'));
    ok('gate open → no defer cue yet (pure hush)',
       chNote.textContent === '' && dcNote.textContent === '', `ch="${chNote.textContent}"`);

    // ── gate closes, first quest still pending: chips say "later" ──
    doc.els['companion-gate'] = null;
    dir.sync(true);
    ok('gate closed → quest panel unfolds (➜ NEXT authoritative)',
       !quest.classList.contains('collapsed'));
    ok('first quest pending → Salvage Run deferred (collapsed + dim)',
       challenge.classList.contains('collapsed') && challenge.classList.contains('deferred'));
    ok('first quest pending → Daily Contract deferred',
       daily.classList.contains('collapsed') && daily.classList.contains('deferred'));
    ok('defer cue text rendered on both chips',
       chNote.textContent === DEFER_CUE && dcNote.textContent === DEFER_CUE, `ch="${chNote.textContent}"`);

    // ── first quest completes: unfold + one-time fanfare ──
    game.setFirstDone(true);
    dir.sync(true);
    ok('first quest done → Salvage Run open',
       !challenge.classList.contains('collapsed') && !challenge.classList.contains('deferred'));
    ok('first quest done → Daily Contract open',
       !daily.classList.contains('collapsed') && !daily.classList.contains('deferred'));
    ok('defer cue cleared', chNote.textContent === '' && dcNote.textContent === '');
    ok('unfold fanfare animation applied to both chips',
       challenge.classList.contains('unfold') && daily.classList.contains('unfold'));
    ok('fanfare notify fired once',
       game.notifies.filter(t => t === FANFARE_NOTIFY).length === 1,
       game.notifies.join(' | '));
    await new Promise(r => setTimeout(r, 30));
    ok('unfold class removed after the animation',
       !challenge.classList.contains('unfold') && !daily.classList.contains('unfold'));

    // ── fanfare never repeats ──
    dir.sync(true);
    ok('fanfare does not repeat on subsequent syncs',
       game.notifies.filter(t => t === FANFARE_NOTIFY).length === 1);

    // ── Earl mid-beat AFTER the unlock: chips hush again, then return ──
    foreman.style.display = 'block';
    dir.sync(true);
    ok('Earl talking after unlock → chips collapse again',
       challenge.classList.contains('collapsed') && !challenge.classList.contains('deferred'));
    foreman.style.display = 'none';
    dir.sync(true);
    ok('Earl quiet → chips reopen', !challenge.classList.contains('collapsed'));
    ok('no second fanfare from the hush cycle',
       game.notifies.filter(t => t === FANFARE_NOTIFY).length === 1);

    // ── once open, the player's own collapse toggle is respected ──
    challenge.classList.add('collapsed');
    challenge.setAttribute('data-collapsed', 'true');
    dir.sync(true);
    ok('open phase respects the player’s manual collapse',
       challenge.classList.contains('collapsed'));
  }

  console.log('\nAttention discipline · fail-soft + returning player');
  {
    ok('director with null game → sync() no-throw',
       (() => { new AttentionDirector(null, { doc: fakeDoc({}) }).sync(true); return true; })());
    ok('director with no document → sync() no-throw',
       (() => { new AttentionDirector({}, { doc: null }).sync(true); return true; })());
    ok('director with empty doc (no panels) → sync() no-throw',
       (() => { new AttentionDirector(fakeGame(false), { doc: fakeDoc({}) }).sync(true); return true; })());
    ok('hushed() false with no context (fail-soft default)',
       new AttentionDirector(fakeGame(false), { doc: fakeDoc({}) }).hushed() === false);

    // Returning player: first quest already done at boot → chips open,
    // quest panel open, and NO boot fanfare.
    const quest = fakeEl(['hud-panel']);
    const challenge = fakeEl(['hud-panel']); withNote(challenge);
    const daily = fakeEl(['hud-panel']); withNote(daily);
    const foreman = fakeEl(); foreman.style.display = 'none';
    const game = fakeGame(true);
    const dir = new AttentionDirector(game, { doc: fakeDoc({ 'foreman-bubble': foreman, 'quest-log-hud': quest, 'challenge-hud': challenge, 'daily-hud': daily }), fanfareMs: 10 });
    dir.sync(true);
    ok('returning player: chips open at boot',
       !challenge.classList.contains('collapsed') && !daily.classList.contains('collapsed'));
    ok('returning player: quest panel open',
       !quest.classList.contains('collapsed'));
    ok('returning player: no boot fanfare', game.notifies.length === 0, game.notifies.join(' | '));

    // hushed() true while the gate is open
    const gateDoc = fakeDoc({ 'companion-gate': fakeEl() });
    const dirGate = new AttentionDirector(fakeGame(true), { doc: gateDoc });
    dirGate.sync(true);
    ok('hushed() true while gate open', dirGate.hushed() === true);
  }
}
