/**
 * QuiltView — DOM rendering for the QuiltSheet (local-only v1).
 *
 * The FLIP: the Tile Editor's 🧾 Quilt button flips the program canvas into a
 * live spreadsheet of the bot itself. Every value change flashes amber — the
 * mist-quilt overlay pattern. The bot stops being a black box and becomes a
 * page of numbers you can READ.
 *
 * Zero dependencies, one render loop driven by the editor's tick.
 */

import { GROUPS, CELLS, CELL_IDS } from './QuiltSheet.js';

export class QuiltView {
  /**
   * @param {HTMLElement} container  parent to mount into (the canvas wrap)
   * @param {object} sheet           QuiltSheet instance (source of truth)
   */
  constructor(container, sheet) {
    this._el = document.createElement('div');
    this._el.id = 'te-quilt-panel';
    this._el.className = 'quilt-panel';
    this._sheet = sheet;
    this._rowEls = {};

    // group headers + rows, in CELLS order
    const byGroup = new Map();
    for (const c of CELLS) {
      if (!byGroup.has(c.group)) byGroup.set(c.group, []);
      byGroup.get(c.group).push(c);
    }

    let html = `<div class="quilt-head">
      <span>🧾 QUILT VIEW</span>
      <span class="quilt-sub">your bot, as a live spreadsheet — watch values flash when they change</span>
    </div><div class="quilt-body">`;
    for (const [gid, cells] of byGroup) {
      const g = GROUPS[gid];
      html += `<div class="quilt-group" style="--gcolor:${g.color}">
        <div class="quilt-group-head">${g.emoji} ${g.label}</div>`;
      for (const c of cells) {
        html += `<div class="quilt-row" id="qr-${cssId(c.id)}" title="${escapeAttr(c.description)}">
          <span class="q-label">${c.emoji} ${c.label}${c.kind === 'formula' ? ' <span class="q-fx">ƒ</span>' : ''}</span>
          <span class="q-value" id="qv-${cssId(c.id)}">—</span>
        </div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    this._el.innerHTML = html;
    container.appendChild(this._el);

    for (const id of CELL_IDS) {
      this._rowEls[id] = {
        value: this._el.querySelector(`#qv-${cssId(id)}`),
        row:   this._el.querySelector(`#qr-${cssId(id)}`),
        last: undefined,
      };
    }
  }

  /** Call each frame (or on an interval). Applies values + change flashes. */
  render() {
    for (const id of CELL_IDS) {
      const cell = this._sheet.cells[id];
      const el = this._rowEls[id];
      if (!el?.value) continue;
      const text = formatValue(cell.v, CELLS.find(c => c.id === id)?.fmt);
      if (el.value.textContent !== text) {
        el.value.textContent = text;
        // value flash: restart the CSS animation
        el.row.classList.remove('q-flash');
        void el.row.offsetWidth;           // reflow to restart animation
        el.row.classList.add('q-flash');
      }
    }
  }

  destroy() { this._el.remove(); }
}

function formatValue(v, fmt) {
  if (fmt === 'bool') return v ? 'TRUE' : 'false';
  if (fmt === 'pct')  return `${Math.round(v)}%`;
  if (fmt === 'deg')  return `${Math.round(v)}°`;
  if (fmt === 'hz')   return v ? `${Math.round(v)} Hz` : '—';
  if (fmt === 'int')  return String(Math.round(v));
  return String(v);
}

function cssId(id) { return id.replace(/\./g, '-'); }
function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }
