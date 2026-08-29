/**
 * ───────────────────────────────────────────────────────────────────────────
 *  JR SHOWCASE  —  the shared Jr build wall for the youngest builders
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  VIBE WITH THE TEAM: Scrapcraft has no real-time multiplayer plumbing yet
 *  (no WebSockets — the fleet talks to Cloudflare Workers via request/response:
 *  SaveBackend saves, ClassRoom joins, BrainGallery shares). So Jr's shared
 *  surface rides the SAME scrap-spark gallery the big kids use: Jr programs
 *  publish to the /gallery shared wall with a "JR ·" title prefix, and this
 *  panel browses + loads them.
 *
 *  Each showcase card renders a "block strip" — the program's icon blocks
 *  drawn on a small canvas. That's the kid-legible bot screenshot, and it's
 *  deterministic (no WebGL preserveDrawingBuffer games).
 *
 *  Live presence (teammates' bots moving in the yard) is a SEAM, not a fake:
 *  see JrPresence.js — subscribe()/publish()/presence list — ready for the
 *  day a Durable Object / WebSocket layer lands.
 */

import { SparkCache } from '../spark/SparkCache.js';
import { JrProgram } from './JrProgram.js';
import { JR_BLOCKS } from './JrBlocks.js';

const JR_PREFIX = 'JR · ';
const LIGHT_COLOR = { green: '#3f6', blue: '#39f', red: '#f55', off: '#555' };

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function b64encode(str) {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(str)));
  return Buffer.from(str, 'utf-8').toString('base64');
}

function b64decode(b64) {
  if (typeof atob === 'function') return decodeURIComponent(escape(atob(b64)));
  return Buffer.from(b64, 'base64').toString('utf-8');
}

export class JrShowcase {
  /**
   * @param {import('./JrEditor.js').JrEditor} editor
   * @param {object} [opts] { spark: SparkCache } — injectable for tests
   */
  constructor(editor, opts = {}) {
    this._editor = editor;
    this._spark  = opts.spark ?? new SparkCache();
    this._el     = null;
  }

  open() {
    if (this._el) { this._refresh(); return; }
    this._render();
    this._refresh();
  }

  close() {
    if (this._el) { this._el.remove(); this._el = null; }
  }

  get available() { return this._spark.enabled; }

  // ── Publish ──────────────────────────────────────────────────────────────

  /** Post the editor's current program to the scrap-spark shared wall. */
  async publish(author = 'a yard kid') {
    const prog = this._editor.program;
    if (!prog || prog.steps.length <= 1) return { ok: false, reason: 'empty' };
    if (!this._spark.enabled) return { ok: false, reason: 'offline' };
    try {
      const res = await this._spark.publish({
        title: `${JR_PREFIX}${prog.name || 'My Jr Bot'}`.slice(0, 80),
        program: b64encode(JSON.stringify(prog.toJSON())),
        kind: 'build',
        author: String(author || 'a yard kid').slice(0, 24),
        note: 'jr build',
        bot_name: prog.name || '',
      });
      if (!res) return { ok: false, reason: 'network' };
      this._editor._game.achievements?.track('brain_share', {});
      this._editor._game.xpSystem?.gain(25);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'network' };
    }
  }

  // ── Browse ───────────────────────────────────────────────────────────────

  /** Fetch the shared wall, keep only Jr entries. Never throws. */
  async entries() {
    if (!this._spark.enabled) return [];
    try {
      const d = await this._spark.gallery('', 'new');
      return (d?.gallery ?? [])
        .filter(g => String(g.title ?? '').startsWith(JR_PREFIX))
        .map(g => ({
          id:      g.id,
          title:   String(g.title).slice(JR_PREFIX.length),
          author:  g.author ?? 'a yard kid',
          likes:   g.likes ?? 0,
          created: g.created,
          program: g.program ?? null,   // some list endpoints omit it
        }));
    } catch {
      return [];
    }
  }

  /** Load a showcase entry into the editor. */
  loadEntry(entry) {
    try {
      const prog = JrProgram.fromJSON(JSON.parse(b64decode(entry.program)));
      this._editor.program.name = prog.name;
      this._editor.program.steps = prog.steps;
      const nameIn = this._editor._el?.querySelector('.jr-name');
      if (nameIn) nameIn.value = prog.name;
      this._editor._save?.();
      this._editor._render?.();
      this._editor._game.ui?.notify(`🌟 Loaded "${prog.name}" from the Jr wall!`);
      this.close();
      return true;
    } catch {
      this._editor._game.ui?.notify('⚠ That Jr program could not be loaded.');
      return false;
    }
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  _render() {
    const el = document.createElement('div');
    el.id = 'jr-showcase';
    el.innerHTML = `
      <div class="jrs-overlay">
        <div class="jrs-card">
          <div class="jrs-head">
            <span style="font-size:26px">🌟</span>
            <div><div class="jrs-title">JR SHOWCASE</div><div class="jrs-sub">robots built by the youngest yard crew</div></div>
            <button class="jrs-btn" id="jrs-refresh">↻</button>
            <button class="jrs-btn" id="jrs-close">✕</button>
          </div>
          <div class="jrs-actions">
            <input id="jrs-author" maxlength="24" placeholder="your name" />
            <button class="jrs-btn jrs-publish" id="jrs-publish">📤 SHOW MY BOT!</button>
          </div>
          <div class="jrs-grid" id="jrs-grid"><div class="jrs-loading">loading the wall…</div></div>
        </div>
      </div>`;
    document.body.appendChild(el);
    this._el = el;
    this._injectCSS();

    el.querySelector('#jrs-close').addEventListener('click', () => this.close());
    el.querySelector('#jrs-refresh').addEventListener('click', () => this._refresh());
    el.querySelector('#jrs-publish').addEventListener('click', async () => {
      const btn = el.querySelector('#jrs-publish');
      const author = el.querySelector('#jrs-author').value.trim() || 'a yard kid';
      btn.disabled = true; btn.textContent = 'posting…';
      const res = await this.publish(author);
      btn.disabled = false; btn.textContent = '📤 SHOW MY BOT!';
      if (res.ok) { this._editor._game.ui?.notify('🌟 Your Jr bot is on the showcase wall!'); this._refresh(); }
      else this._editor._game.ui?.notify(res.reason === 'empty' ? 'Build a program first!' : '⚠ The wall is unreachable right now.');
    });
  }

  async _refresh() {
    const grid = this._el?.querySelector('#jrs-grid');
    if (!grid) return;
    if (!this.available) {
      grid.innerHTML = `<div class="jrs-loading">The showcase wall needs the yard cloud (scrap-spark). Ask a grown-up to connect it!</div>`;
      return;
    }
    grid.innerHTML = '<div class="jrs-loading">loading the wall…</div>';
    const list = await this.entries();
    if (!list.length) {
      grid.innerHTML = '<div class="jrs-loading">Nothing on the wall yet — show YOUR bot first! 🌟</div>';
      return;
    }
    grid.innerHTML = '';
    for (const entry of list.slice(0, 30)) {
      const card = document.createElement('div');
      card.className = 'jrs-entry';
      const strip = this._stripCanvas(entry);
      const name = document.createElement('div');
      name.className = 'jrs-entry-name';
      name.textContent = `${entry.title} · by ${entry.author}`;
      card.appendChild(strip ?? document.createTextNode('🤖'));
      card.appendChild(name);
      if (entry.program) {
        const load = document.createElement('button');
        load.className = 'jrs-load';
        load.textContent = '→ TRY IT';
        load.addEventListener('click', () => this.loadEntry(entry));
        card.appendChild(load);
      }
      grid.appendChild(card);
    }
  }

  /**
   * The block strip — the program drawn as its icon blocks on a canvas.
   * This is the deterministic "bot screenshot" for the showcase wall.
   */
  _stripCanvas(entry) {
    let steps = [];
    try {
      const prog = JrProgram.fromJSON(JSON.parse(b64decode(entry.program)));
      steps = prog.steps;
    } catch { return null; }
    const W = 320, H = 64, COLS = 8;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.className = 'jrs-strip';
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#141820'; ctx.fillRect(0, 0, W, H);
    let flat = [];
    for (const s of steps) {
      flat.push(s);
      for (const b of s.body ?? []) flat.push({ ...b, _in: true });
    }
    flat.slice(0, COLS * 2).forEach((s, i) => {
      const def = JR_BLOCKS[s.block];
      if (!def) return;
      const x = 4 + (i % COLS) * (W / COLS);
      const y = 4 + Math.floor(i / COLS) * 30;
      ctx.fillStyle = s._in ? '#1a1408' : '#1c2438';
      ctx.strokeStyle = s._in ? '#f0b42966' : '#445';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, W / COLS - 8, 26, 6);
      else ctx.rect(x, y, W / COLS - 8, 26);
      ctx.fill(); ctx.stroke();
      ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = LIGHT_COLOR[def.id === 'light' ? (s.opt ?? 'green') : ''] ?? '#eee';
      ctx.fillText(def.icon.replace(/️/g, ''), x + (W / COLS - 8) / 2, y + 14);
    });
    return c;
  }

  _injectCSS() {
    if (document.getElementById('jr-showcase-css')) return;
    const css = document.createElement('style');
    css.id = 'jr-showcase-css';
    css.textContent = `
#jr-showcase .jrs-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:70;display:flex;align-items:center;justify-content:center}
#jr-showcase .jrs-card{width:min(720px,92vw);max-height:86vh;overflow:auto;background:#161c28;border:3px solid #f0b429;border-radius:18px;padding:14px;font-family:'Comic Sans MS','Segoe UI',system-ui,sans-serif;color:#eee}
#jr-showcase .jrs-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
#jr-showcase .jrs-title{font-size:20px;font-weight:bold;letter-spacing:1px;color:#f0b429}
#jr-showcase .jrs-sub{font-size:12px;color:#9ab}
#jr-showcase .jrs-btn{margin-left:auto;background:#232c40;border:2px solid #445;color:#ffe;border-radius:10px;padding:6px 12px;cursor:pointer;font-size:15px}
#jr-showcase .jrs-head .jrs-btn:first-of-type{margin-left:auto}
#jr-showcase .jrs-actions{display:flex;gap:8px;margin-bottom:10px}
#jr-showcase #jrs-author{flex:1;background:#10141f;border:2px solid #334;color:#ffd;border-radius:10px;padding:6px 10px;font-size:15px}
#jr-showcase .jrs-publish{font-weight:bold;margin-left:0}
#jr-showcase .jrs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px}
#jr-showcase .jrs-loading{color:#9ab;padding:12px;font-size:14px}
#jr-showcase .jrs-entry{background:#1c2438;border:2px solid #445;border-radius:14px;padding:8px;display:flex;flex-direction:column;gap:6px;align-items:center}
#jr-showcase .jrs-strip{border-radius:8px;max-width:100%}
#jr-showcase .jrs-entry-name{font-size:13px;color:#cde}
#jr-showcase .jrs-load{background:#0a4;border:none;color:#fff;font-weight:bold;border-radius:10px;padding:5px 14px;cursor:pointer;font-size:14px}`;
    document.head.appendChild(css);
  }
}
