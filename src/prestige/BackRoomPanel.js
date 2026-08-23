/**
 * ───────────────────────────────────────────────────────────────────────────
 *  BACK ROOM PANEL  —  Earl's board UI (the field-notes pattern)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Self-contained DOM, exactly like LogbookPanel: appends to body, releases
 * pointer lock, zero UI.js churn. Opened via Shift+M (the boxes marked M —
 * ch11 lore). Renders the catalog from PrestigeSystem.board() with flat
 * prices, owned/affordable states, and Earl at the top of the board.
 *
 * No dark patterns here either: no timers, no countdowns, no "only today".
 * A kid who can't afford something reads Earl's "it'll keep" line and
 * closes the panel without a knot in their stomach.
 */

export function openBackRoomPanel(prestige) {
  document.getElementById('backroom-panel')?.remove();
  document.exitPointerLock?.();

  const panel = document.createElement('div');
  panel.id = 'backroom-panel';
  panel.style.cssText = `
    position: fixed; inset: 0; z-index: 200; display: flex;
    align-items: center; justify-content: center;
    background: rgba(8, 6, 3, 0.75); font-family: 'Courier New', monospace;`;
  panel.innerHTML = `
    <div style="
        width: min(640px, 92vw); max-height: 84vh; overflow-y: auto;
        background: #17120a; border: 2px solid #6b5a33; border-radius: 10px;
        color: #e8dcc0; padding: 20px 24px; font-size: 13px; line-height: 1.55;">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <h2 style="margin:0;font-size:18px;letter-spacing:2px;color:#ffd97a">☕ EARL'S BACK ROOM</h2>
        <span>
          <span id="br-marks" style="color:#ffd97a;margin-right:12px"></span>
          <button id="br-close" style="font:inherit;font-size:11px;background:#2a2214;color:#e8dcc0;border:1px solid #6b5a33;border-radius:4px;padding:3px 10px;cursor:pointer">close [Esc]</button>
        </span>
      </div>
      <div id="br-earl" style="margin:10px 0;font-style:italic;color:#c9b98a"></div>
      <div id="br-body"></div>
    </div>`;
  document.body.appendChild(panel);

  const render = () => {
    panel.querySelector('#br-marks').textContent = `🏅 ${prestige.marks} mark${prestige.marks === 1 ? '' : 's'}`;
    const lines = prestige.earlBoardLines ?? [];
    panel.querySelector('#br-earl').textContent =
      `"${lines[Math.floor(Math.random() * lines.length)] ?? 'Back room\'s open.'}" — Earl`;

    const items = prestige.board();
    panel.querySelector('#br-body').innerHTML = items.map(r => `
      <div style="border-left:3px solid ${r.owned ? '#8ef7c1' : '#6b5a33'};padding:8px 12px;margin:8px 0;background:#100c06;display:flex;justify-content:space-between;gap:10px;align-items:center">
        <div>
          <b style="color:#ffd97a">${r.icon} ${r.label}</b>
          ${r.owned ? '<span style="color:#8ef7c1"> ✓ yours</span>' : ''}
          <div style="opacity:.75;font-size:12px">${r.desc}</div>
          <div style="opacity:.55;font-size:11px;font-style:italic">"${r.earlLine}"</div>
        </div>
        <div style="white-space:nowrap">
          ${r.owned ? '' : `<button data-buy="${r.id}" ${r.affordable ? '' : 'disabled'} style="font:inherit;font-size:11px;background:${r.affordable ? '#2f4a2a' : '#2a2214'};color:${r.affordable ? '#8ef7c1' : '#7a6f58'};border:1px solid #6b5a33;border-radius:4px;padding:4px 10px;cursor:${r.affordable ? 'pointer' : 'default'}">🏅 ${r.cost}</button>`}
        </div>
      </div>`).join('');

    panel.querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => { prestige.purchase(btn.dataset.buy); render(); });
    });
  };
  render();

  panel.querySelector('#br-close').addEventListener('click', () => panel.remove());
  panel.addEventListener('keydown', e => { if (e.code === 'Escape') panel.remove(); });
  panel.tabIndex = 0;
  panel.focus();
}
