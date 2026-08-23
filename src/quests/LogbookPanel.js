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
 * Self-contained DOM (the field-notes pattern): appends to #hud, releases
 * pointer lock, zero UI.js churn. Also owns the compact quest-log HUD widget
 * (the scoreboard: what's active now, story-pulled by companion arc).
 */

const ARC_BADGE = {
  earl:  { icon: '☕', label: 'Earl’s chain' },
  bolt:  { icon: '⚡', label: 'Bolt — racing' },
  magma: { icon: '🌋', label: 'Magma — workshop' },
  juno:  { icon: '✨', label: 'Juno — exploration' },
  rivet: { icon: '🔩', label: 'Rivet — the yard' },
  finale:{ icon: '🏁', label: 'The Midnight Race' },
};

// ── Quest-log HUD widget (always-on scoreboard) ─────────────────────────────

export function renderQuestHud(system, quests, { finale, arcsDone }) {
  let hud = document.getElementById('quest-log-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'quest-log-hud';
    hud.style.cssText = `
      position: fixed; top: 64px; right: 12px; width: 250px; z-index: 40;
      font-family: 'Courier New', monospace; color: #e8dcc0;
      background: rgba(20, 16, 10, 0.82); border: 1px solid #6b5a33;
      border-radius: 8px; padding: 8px 10px; font-size: 11px; line-height: 1.45;
      pointer-events: auto;`;
    document.getElementById('hud')?.appendChild(hud) ?? document.body.appendChild(hud);
  }
  if (!quests.length && !finale) {
    hud.innerHTML = `<div style="opacity:.7">📓 Quests: none on the books — explore the yard.</div>`;
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
  hud.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px">
      <b style="letter-spacing:1px">📓 QUESTS</b>
      <span id="ql-open" style="cursor:pointer;color:#9fd0ff">[L] logbook</span>
    </div>
    ${rows}${finaleLine}`;
  hud.querySelector('#ql-open')?.addEventListener('click', () => system.openLogbook());
  hud.querySelector('#ql-finale')?.addEventListener('click', () => system.openLogbook());
}

// ── The Logbook panel (the journal) ─────────────────────────────────────────

export function openLogbookPanel(system) {
  document.getElementById('logbook-panel')?.remove();
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
    if (!entries.length) {
      body.innerHTML = `<div style="opacity:.7">Empty so far. The first completed quest writes
        the first memory — the logbook is how the yard remembers what you learned.</div>`;
      return;
    }
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
    body.innerHTML = html + gate;
  };
  render();

  panel.querySelector('#lb-close').addEventListener('click', () => panel.remove());
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
