/**
 * ───────────────────────────────────────────────────────────────────────────
 *  LOGBOOK PANEL  —  the journal UI (the player's learning as a story)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * vessel-quest's soul, rendered: completed quests as dated memory entries —
 * "First flash — Uno blinked back. Bootloaders are how dead chips wake up.
 *  — with Magma, day 3". The logbook IS the transcript for teachers: one
 *  click exports the plain-text learning record.
 *
 * Convergence cut: the panel also owns the SPINE rail (the twelve chapters
 * as a vertical rail — completed filled, current glowing, future chapters
 * as Earl's silhouettes: title hidden, one teaser word) and the chapter
 * OPEN ceremony card (yard palette, once ever per chapter).
 *
 * Self-contained DOM (the field-notes pattern): appends to #hud, releases
 * pointer lock, zero UI.js churn. Also owns the compact quest-log HUD widget
 * (the scoreboard: what's active now, story-pulled by companion arc).
 */

import { WAKE_EVENTS } from '../story/Wakes.js';
import { openMosLedgerPanel } from './MosLedger.js';

const ARC_BADGE = {
  earl:  { icon: '☕', label: 'Earl’s chain' },
  bolt:  { icon: '⚡', label: 'Bolt — racing' },
  magma: { icon: '🌋', label: 'Magma — workshop' },
  juno:  { icon: '✨', label: 'Juno — exploration' },
  rivet: { icon: '🔩', label: 'Rivet — the yard' },
  finale:{ icon: '🏁', label: 'The Midnight Race' },
  chapter:{ icon: '📗', label: "The yard’s chapters" },
  side:  { icon: '🤝', label: 'Side-quests' },
  yard:  { icon: '🌾', label: 'The second page' },
};

const ACT_NAMES = { 1: 'ACT ONE', 2: 'ACT TWO', 3: 'ACT THREE' };

/** Teach-back askers — persona ids (TeachBack.ASKERS) → yard faces. */
const ASKER_FACE = {
  rivet: '🔩 Rivet', bolt: '⚡ Bolt', magma: '🌋 Magma', juno: '✨ Juno', spark: '🤖 Spark',
};

// ── Quest-log HUD widget (always-on scoreboard) ─────────────────────────────

export function renderQuestHud(system, quests, { finale, arcsDone, nextStep } = {}) {
  let hud = document.getElementById('quest-log-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'quest-log-hud';
    hud.className = 'hud-panel';
    // Static flex child of the top-right stacking column — no fixed offsets;
    // the column owns position/gap/order (CSS order:-1 puts QUESTS on top).
    hud.style.cssText = `
      width: 250px;
      font-family: 'Courier New', monospace; color: #e8dcc0;
      background: rgba(20, 16, 10, 0.82); border: 1px solid #6b5a33;
      border-radius: 8px; padding: 8px 10px; font-size: 11px; line-height: 1.45;
      pointer-events: auto;`;
    // Column first, fail-soft down the ladder (#hud, then body).
    (document.getElementById('hud-stack-top-right')
      ?? document.getElementById('hud')
      ?? document.body
    ).appendChild(hud);
    // ONE delegated collapse toggle on the column container — the dataset
    // flag guards against double-wiring, and delegation survives every
    // innerHTML re-render below. Covers all three .hud-panel members.
    const column = hud.parentElement;
    if (column && !column.dataset.hudCollapseWired) {
      column.dataset.hudCollapseWired = '1';
      column.addEventListener('click', e => {
        if (e.target.closest('[data-no-collapse]')) return;   // [L] logbook link
        const panel = e.target.closest('.hud-panel-header')?.closest('.hud-panel');
        if (!panel) return;
        const collapsed = !panel.classList.contains('collapsed');
        panel.classList.toggle('collapsed', collapsed);
        panel.setAttribute('data-collapsed', String(collapsed));
      });
    }
  }
  // Session-only collapse state: capture before the innerHTML wipe, restore
  // after (amendment #5 — nothing persisted across sessions).
  const wasCollapsed = hud.classList.contains('collapsed');
  const collapseState = hud.getAttribute('data-collapsed') || 'false';
  const header = `
    <div class="hud-panel-header">
      <b style="letter-spacing:1px">📓 QUESTS</b>
      <span id="ql-open" data-no-collapse style="cursor:pointer;color:#9fd0ff">[L] logbook</span>
      <span class="collapse-toggle"></span>
    </div>`;
  if (!quests.length && !finale) {
    hud.innerHTML = `${header}
      <div class="hud-panel-body"><div style="opacity:.7">Quests: none on the books — explore the yard.</div></div>`;
    hud.classList.toggle('collapsed', wasCollapsed);
    hud.setAttribute('data-collapsed', collapseState);
    return;
  }
  const rows = quests.map(q => {
    const b = ARC_BADGE[q.arc] ?? ARC_BADGE.earl;
    const steps = q.objectives.map(o =>
      `<div class="qstep" style="${o.done ? 'text-decoration:line-through;opacity:.55' : ''}">
         ${o.done ? '☑' : '☐'} ${o.label}${o.progress && !o.done ? ` <span style="opacity:.6">(${o.progress})</span>` : ''}
       </div>`).join('');
    return `<div style="margin:6px 0 2px">
      <div style="color:#ffd97a">${b.icon} ${q.title}</div>${steps}</div>`;
  }).join('');
  const finaleLine = finale
    ? `<div style="margin-top:6px;color:#8ef7c1;cursor:pointer" id="ql-finale">🏁 Two arcs done — <b>THE MIDNIGHT RACE</b> is on. Press L.</div>`
    : '';
  // ➜ NEXT — the one-step answer, always the first thing the eye lands on:
  // the quest's open objective plus the physical verb (press E / T / mine).
  const nextLine = nextStep
    ? `<div style="margin:4px 0 6px;padding:5px 8px;border:1px solid #8a6d2f;border-radius:6px;background:rgba(255,217,122,.08)">
         <span style="color:#ffd97a">➜ NEXT:</span>
         <b>${nextStep.kind === 'finale' ? nextStep.title : nextStep.label}</b>
         ${nextStep.progress ? `<span style="opacity:.6">(${nextStep.progress})</span>` : ''}
         <div style="opacity:.7;font-size:10px;margin-top:1px">↳ ${nextStep.how}</div>
       </div>`
    : '';
  hud.innerHTML = `${header}
    <div class="hud-panel-body">${nextLine}${rows}${finaleLine}</div>`;
  // restore the collapse state the innerHTML re-render just wiped
  hud.classList.toggle('collapsed', wasCollapsed);
  hud.setAttribute('data-collapsed', collapseState);
  hud.querySelector('#ql-open')?.addEventListener('click', () => system.openLogbook());
  hud.querySelector('#ql-finale')?.addEventListener('click', () => system.openLogbook());
}

// ── The chapter OPEN ceremony card (once ever per chapter) ──────────────────

/** Which companion's pull-vector line floats at the chapter's opening: the
 *  highest-bond companion the kid has actually MET (the room's own gravity),
 *  Rivet as the faithful default. Pure — testable headless. */
export function pickPullLine(chapter, companions = null) {
  const pv = chapter?.pullVector ?? {};
  const met = companions?.data?.met ?? [];
  let best = null, bestBond = -1;
  for (const id of met) {
    const c = companions?.get?.(id);
    const bond = c?.state?.data?.bond ?? 0;
    if (pv[id] && bond > bestBond) { best = id; bestBond = bond; }
  }
  const who = best ?? 'rivet';
  const icon = ARC_BADGE[who]?.icon ?? '🔩';
  return { who, line: pv[who] ?? null, icon };
}

/** The chapter-open ceremony: title card in the yard palette, Earl's opening
 *  line, one companion pull-vector float. No-ops safely headless (no DOM). */
export function renderChapterCeremony(game, chapter) {
  if (typeof document === 'undefined' || !chapter) return false;
  const { line, icon } = pickPullLine(chapter, game?.companions);
  document.getElementById('spine-ceremony')?.remove();
  document.exitPointerLock?.();

  const card = document.createElement('div');
  card.id = 'spine-ceremony';
  card.style.cssText = `
    position: fixed; inset: 0; z-index: 180; display: flex;
    align-items: center; justify-content: center;
    background: rgba(8, 6, 3, 0.55); font-family: 'Courier New', monospace;
    cursor: pointer;`;
  card.innerHTML = `
    <div style="
        width: min(560px, 90vw); text-align: center;
        background: #17120a; border: 2px solid #6b5a33; border-radius: 10px;
        color: #e8dcc0; padding: 26px 30px; font-size: 14px; line-height: 1.6;">
      <div style="letter-spacing:4px;font-size:11px;color:#9fd0ff;opacity:.85">${ACT_NAMES[chapter.act] ?? ''}</div>
      <div style="letter-spacing:3px;font-size:11px;opacity:.6;margin-top:4px">· chapter ${chapter.n ?? '?'} ·</div>
      <h2 style="margin:8px 0 2px;font-size:22px;letter-spacing:2px;color:#ffd97a">${chapter.title}</h2>
      <div style="margin:14px auto 0;max-width:44ch;font-style:italic;color:#e8dcc0">
        ☕ “${chapter.openingLine}”
      </div>
      ${line ? `<div style="margin:12px auto 0;max-width:40ch;font-size:12px;opacity:.8;color:#c9e8b0">
        ${icon} ${line}
      </div>` : ''}
      <div style="margin-top:18px;font-size:10px;opacity:.45">click to return to the yard</div>
    </div>`;
  const dismiss = () => card.remove();
  card.addEventListener('click', dismiss);
  document.body.appendChild(card);
  game?.audio?.questComplete?.();
  setTimeout(dismiss, 9000);   // the yard never holds a kid hostage
  return true;
}

/** The chapter-completion ceremony: title card when a chapter is fully walked.
 *  Shows the chapter's closingLine (or an Earl default), and any associated
 *  wake event. Mirrors renderChapterCeremony styling. No-ops safely headless. */
export function renderChapterCompleteCeremony(game, chapter) {
  if (typeof document === 'undefined' || !chapter) return false;
  document.getElementById('spine-ceremony-done')?.remove();
  document.exitPointerLock?.();

  const closingLine = chapter.closingLine || 'Another chapter walked. The yard keeps it — kid like you, it keeps extra.';
  let bodyHTML = `<p style="margin:0">☕ “${closingLine}”</p>`;

  const wake = WAKE_EVENTS.find(w => w.chapter === chapter.n);
  if (wake) {
    bodyHTML += `<p style="margin:8px 0 0">👁 Something woke — <b>${wake.name}</b>.</p>`;
  }

  const card = document.createElement('div');
  card.id = 'spine-ceremony-done';
  card.style.cssText = `
    position: fixed; inset: 0; z-index: 180; display: flex;
    align-items: center; justify-content: center;
    background: rgba(8, 6, 3, 0.55); font-family: 'Courier New', monospace;
    cursor: pointer;`;
  card.innerHTML = `
    <div style="
        width: min(560px, 90vw); text-align: center;
        background: #17120a; border: 2px solid #6b5a33; border-radius: 10px;
        color: #e8dcc0; padding: 26px 30px; font-size: 14px; line-height: 1.6;">
      <div style="letter-spacing:3px;font-size:11px;opacity:.6;margin-top:4px">· chapter ${chapter.n ?? '?'} · closed ·</div>
      <h2 style="margin:8px 0 2px;font-size:22px;letter-spacing:2px;color:#ffd97a">${chapter.title}</h2>
      <div style="margin:14px auto 0;max-width:44ch;font-style:italic;color:#e8dcc0">
        ${bodyHTML}
      </div>
      <div style="margin-top:18px;font-size:10px;opacity:.45">click to return to the yard</div>
    </div>`;
  const dismiss = () => card.remove();
  card.addEventListener('click', dismiss);
  document.body.appendChild(card);
  game?.audio?.questComplete?.();
  setTimeout(dismiss, 9000);   // the yard never holds a kid hostage
  return true;
}

// ── The Logbook panel (the journal) ─────────────────────────────────────────

/** The SPINE rail (HTML string): the twelve chapters, one line each. */
function spineRailHtml(system) {
  const spine = system?.spine;
  if (!spine?.chapters?.length) return '';
  const rows = spine.chapters.map((c, i) => {
    const n = i + 1;
    const complete = spine.chapterComplete(c);
    const cur = n === spine.currentChapterIndex();
    const started = spine.chapterStarted(c);
    const style = complete
      ? 'color:#8ef7c1'
      : cur ? 'color:#ffd97a;text-shadow:0 0 8px rgba(255,217,122,.45)'
      : started ? 'color:#e8dcc0;opacity:.85'
      : 'color:#8a7c5c;opacity:.65';
    const body = complete || cur || started
      ? c.title
      : `<span style="letter-spacing:6px">— — —</span> <i style="font-size:11px">“${c.teaser}”</i>`;
    return `<div style="display:flex;gap:10px;align-items:baseline;padding:2px 0;${style}">
      <span style="opacity:.5;width:2.2em;text-align:right">${complete ? '☑' : `${n}.`}</span>
      <span>${body}</span>
    </div>`;
  }).join('');
  return `
    <div style="border:1px solid #4a3d22;border-radius:6px;padding:10px 14px;margin:4px 0 14px;background:#100c06">
      <div style="letter-spacing:2px;font-size:12px;color:#9fd0ff;margin-bottom:6px">🪢 THE SPINE — how the yard opens</div>
      ${rows}
    </div>`;
}

export function openLogbookPanel(system) {
  document.getElementById('logbook-panel')?.remove();
  document.getElementById('mos-ledger-panel')?.remove();   // cross-linked opens, never stacked
  document.exitPointerLock?.();

  const panel = document.createElement('div');
  panel.id = 'logbook-panel';
  panel.style.cssText = `
    position: fixed; inset: 0; z-index: 200; display: flex;
    align-items: center; justify-content: center;
    background: rgba(8, 6, 3, 0.75); font-family: 'Courier New', monospace;`;
  panel.innerHTML = `
    <div style="
        width: min(680px, 92vw); max-height: 84vh; overflow-y: auto;
        background: #17120a; border: 2px solid #6b5a33; border-radius: 10px;
        color: #e8dcc0; padding: 20px 24px; font-size: 13px; line-height: 1.55;">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <h2 style="margin:0;font-size:18px;letter-spacing:2px;color:#ffd97a">📓 THE LOGBOOK</h2>
        <span>
          <button id="lb-ledger" style="font:inherit;font-size:11px;background:#2a2214;color:#ffd97a;border:1px solid #6b5a33;border-radius:4px;padding:3px 10px;cursor:pointer">📒 Mo's Ledger [J]</button>
          <button id="lb-copy" style="font:inherit;font-size:11px;background:#2a2214;color:#ffd97a;border:1px solid #6b5a33;border-radius:4px;padding:3px 10px;cursor:pointer">copy transcript</button>
          <button id="lb-close" style="font:inherit;font-size:11px;background:#2a2214;color:#e8dcc0;border:1px solid #6b5a33;border-radius:4px;padding:3px 10px;cursor:pointer">close [L]</button>
        </span>
      </div>
      <div id="lb-body" style="margin-top:12px"></div>
    </div>`;
  document.body.appendChild(panel);

  const render = () => {
    const body = panel.querySelector('#lb-body');
    const entries = system.logbook.recentFirst();
    const arcs = system.tracker.completedArcs();
    const rail = spineRailHtml(system);
    const tbSlot = '<div id="lb-teachback"></div>';   // filled below (garnish)
    if (!entries.length && !rail) {
      body.innerHTML = tbSlot + `<div style="opacity:.7">Empty so far. The first completed quest writes
        the first memory — the logbook is how the yard remembers what you learned.</div>`;
      renderTeachback();
      return;
    }
    if (!entries.length) { body.innerHTML = tbSlot + rail; renderTeachback(); return; }
    const html = entries.map(e => {
      const b = ARC_BADGE[e.arc] ?? ARC_BADGE.earl;
      return `
      <div style="border-left:3px solid #6b5a33;padding:6px 12px;margin:10px 0;background:#100c06">
        <div style="display:flex;justify-content:space-between;gap:8px">
          <b style="color:#ffd97a">${b.icon} ${e.title}</b>
          <span style="opacity:.6;white-space:nowrap">${e.dateLabel}${e.day != null ? ` · day ${e.day}` : ''}</span>
        </div>
        <div style="margin:4px 0;font-style:italic">"${e.memory}"</div>
        <div style="opacity:.75;font-size:12px">${e.kidPhrase}</div>
        <div style="opacity:.5;font-size:11px;margin-top:2px">concept: ${e.concept} · ${b.label}</div>
      </div>`;
    }).join('');
    const gate = system.finaleAvailable()
      ? `<div style="border-left:3px solid #8ef7c1;padding:6px 12px;margin:10px 0;color:#8ef7c1">
           🏁 Two arcs walked. The Midnight Race is on — ask Earl about the county letter.</div>`
      : `<div style="opacity:.55;margin-top:10px;font-size:11px">
           Arcs complete: ${arcs.length}/2 to unlock the Midnight Race. Bolt ⚡ · Magma 🌋 · Juno ✨ · Rivet 🔩</div>`;

    // Sticker Row perk (full Field Guide) — one extra row to pin the good
    // days. Additive: the logbook reads exactly the same without it.
    let stickers = '';
    const stickerRows = system.game?.prestige?.perkEffectsNow?.().stickerRows ?? 0;
    if (stickerRows > 0) {
      const pins = arcs.map(a => ARC_BADGE[a]?.icon ?? '⭐');
      pins.push('📚');   // the Field Guide itself, fully read
      stickers = `<div style="border:1px dashed #6b5a33;border-radius:8px;padding:6px 12px;margin-top:10px">
        <div style="font-size:11px;opacity:.6;letter-spacing:1px">STICKER ROW — the good days, pinned</div>
        <div style="font-size:20px;letter-spacing:8px;margin-top:2px">${pins.join('')}</div>
      </div>`;
    }
    body.innerHTML = tbSlot + rail + html + gate + stickers;
    renderTeachback();
  };

  /** The teach-back moment: a companion asks a naive question, the kid
   *  answers as the teacher (TeachBack grades + records the rung). Pure
   *  garnish — any error leaves the panel exactly as it was. */
  const renderTeachback = () => {
    try {
      const slot = panel.querySelector('#lb-teachback');
      if (!slot) return;
      const tb = system.game?.teachBack;
      if (!tb || typeof tb.available !== 'function' || tb.available() === 0) {
        slot.innerHTML = '';
        return;
      }
      const moment = tb.nextMoment();
      if (!moment) { slot.innerHTML = ''; return; }
      const who  = ASKER_FACE[moment.question.asker] ?? '🔩 a friend';
      const escS = s => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      slot.innerHTML = `
      <div style="border:1px solid #7a5a2f;border-radius:6px;padding:10px 14px;margin:0 0 14px;background:#120d06">
        <div style="letter-spacing:2px;font-size:12px;color:#c9e8b0;margin-bottom:4px">🔩 TEACH-BACK — you're the teacher</div>
        <div style="font-style:italic;margin-bottom:8px">${who} asks: “${escS(moment.question.naiveQuestion)}”</div>
        <div id="lb-tb-opts" style="display:flex;flex-direction:column;gap:6px">
          ${moment.options.map((o, i) =>
            `<button class="lb-tb-opt" data-i="${i}" style="font:inherit;font-size:12px;text-align:left;background:#1c150b;color:#e8dcc0;border:1px solid #6b5a33;border-radius:5px;padding:6px 10px;cursor:pointer">${escS(o.text)}</button>`).join('')}
        </div>
      </div>`;
      slot.querySelectorAll('.lb-tb-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          try {
            const res = tb.answer(moment.question.id, Number(btn.dataset.i));
            const box = slot.querySelector('#lb-tb-opts');
            if (!box) return;
            const color = res.correct ? '#8ef7c1' : '#ffd97a';
            const line  = res.correct
              ? (res.taughtLine ?? 'Taught. The yard keeps it.')
              : (res.retryLine ?? 'Close — try it again after two more practice runs.');
            box.innerHTML = `<div style="color:${color};line-height:1.6">${escS(line)}</div>`
              + (!res.correct && res.misconception
                ? `<div style="opacity:.7;font-size:11px;margin-top:2px">(${escS(res.misconception)})</div>` : '')
              + (tb.available() > 0
                ? '<button id="lb-tb-more" style="font:inherit;font-size:11px;background:#2a2214;color:#ffd97a;border:1px solid #6b5a33;border-radius:4px;padding:3px 10px;cursor:pointer;margin-top:6px">another question</button>' : '');
            box.querySelector('#lb-tb-more')?.addEventListener('click', () => renderTeachback());
          } catch { /* answering is garnish */ }
        });
      });
    } catch { /* teach-back never breaks the logbook */ }
  };
  render();

  panel.querySelector('#lb-close').addEventListener('click', () => panel.remove());
  // Cross-link: Mo's Ledger — the career record over the same scrim. The
  // ledger panel removes this one (cross-linked opens, never stacked).
  panel.querySelector('#lb-ledger')?.addEventListener('click', () => {
    try { openMosLedgerPanel(system.game); } catch { panel.remove(); }
  });
  panel.querySelector('#lb-copy').addEventListener('click', ev => {
    const tx = system.logbook.transcript();
    navigator.clipboard?.writeText(tx).then(() => {
      ev.target.textContent = 'copied ✓';
      setTimeout(() => { ev.target.textContent = 'copy transcript'; }, 1600);
    }).catch(() => {});
  });
  panel.addEventListener('keydown', e => { if (e.code === 'KeyL' || e.code === 'Escape') panel.remove(); });
  panel.tabIndex = 0;
  panel.focus();
}
