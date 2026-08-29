/**
 * BrainGallery — browse and publish community robot programs.
 *
 * Opens as a full-screen modal over the TileEditor. Fetches /api/v1/brains
 * from the configured Worker and displays a grid of shareable programs.
 *
 * Students can:
 *   • Browse community brains and load any into their TileEditor in one click
 *   • Publish their current program with a grade badge attached
 *   • Filter by tag (wall_avoider, line_follower, etc.)
 */

import { TileProgram } from './maker/TileProgram.js';

const GRADE_FROM_BUDGET = (pct) => {
  if (pct < 5)  return { grade: 'A+', rating: 5.0 };
  if (pct < 20) return { grade: 'A',  rating: 4.0 };
  if (pct < 50) return { grade: 'B',  rating: 3.0 };
  if (pct < 80) return { grade: 'C',  rating: 2.0 };
  return           { grade: 'D',  rating: 1.0 };
};

const GRADE_COLOR = { 'A+': '#00ffaa', A: '#00ff88', B: '#88cc44', C: '#f0b429', D: '#f44336' };

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function relTime(isoStr) {
  try {
    const dt = new Date(isoStr.includes('Z') || isoStr.includes('+') ? isoStr : isoStr + 'Z');
    const sec = Math.round((Date.now() - dt.getTime()) / 1000);
    if (sec < 86400) return 'today';
    if (sec < 604800) return `${Math.floor(sec/86400)}d ago`;
    return dt.toLocaleDateString();
  } catch { return ''; }
}

export class BrainGallery {
  constructor(tileEditor) {
    this._editor = tileEditor;
    this._el     = null;
    this._tab    = 'community'; // 'community' | 'publish'
    this._filter = '';
    this._brains = [];
    this._loading = false;
    this._spark  = tileEditor?._spark?.cloud ?? null; // scrap-spark shared wall
  }

  open() {
    if (this._el) return; // already open
    this._render();
    this._fetchBrains();
  }

  close() {
    if (this._el) { this._el.remove(); this._el = null; }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _workerUrl() {
    try {
      const cfg = JSON.parse(localStorage.getItem('scrapcraft_onboarding_config') ?? '{}');
      return cfg.cfWorkerUrl ?? null;
    } catch { return null; }
  }

  _render() {
    const el = document.createElement('div');
    el.id = 'brain-gallery';
    el.innerHTML = `
      <div class="bg-overlay">
        <div class="bg-card">
          <div class="bg-head">
            <span class="bg-icon">🧠</span>
            <div class="bg-title-block">
              <div class="bg-title">BRAIN GALLERY</div>
              <div class="bg-sub">Community robot programs</div>
            </div>
            <button class="bg-close" id="bg-close">✕</button>
          </div>
          <div class="bg-tabs">
            <button class="bg-tab bg-tab-active" id="bg-tab-browse">Browse</button>
            <button class="bg-tab" id="bg-tab-publish">Publish My Brain</button>
          </div>
          <div id="bg-panel-browse">
            <div class="bg-filter-row">
              <select class="bg-filter-sel" id="bg-tag-filter">
                <option value="">All programs</option>
                <option value="wall_avoider">Wall Avoiders</option>
                <option value="line_follower">Line Followers</option>
                <option value="light_seeker">Light Seekers</option>
                <option value="waypoint">Waypoint Navigators</option>
                <option value="ore_hunter">Ore Hunters</option>
                <option value="custom">Custom</option>
              </select>
              <button class="bg-refresh-btn" id="bg-refresh">↻ Refresh</button>
            </div>
            <div class="bg-grid" id="bg-grid">
              <div class="bg-loading">Loading community brains…</div>
            </div>
          </div>
          <div id="bg-panel-publish" style="display:none">
            ${this._publishFormHTML()}
          </div>
        </div>
      </div>`;
    this._injectCSS();
    document.body.appendChild(el);
    this._el = el;

    requestAnimationFrame(() => el.querySelector('.bg-overlay').classList.add('bg-show'));
    this._bind();
  }

  _publishFormHTML() {
    const prog = this._editor._program;
    const grade = this._editor.lastGrade ?? '?';
    const budget = this._editor.lastBudgetPct ?? 0;
    return `
      <div class="bg-publish-form">
        <div class="bg-pub-prog">
          <span class="bg-pub-name">${esc(prog?.name ?? 'My Brain')}</span>
          <span class="bg-grade-badge" style="color:${GRADE_COLOR[grade] ?? '#aaa'}">${grade}</span>
        </div>
        ${grade === '?' ? '<div class="bg-pub-hint">Run your program first to get an efficiency grade!</div>' : ''}
        <label class="bg-pub-label">YOUR NAME (shown in gallery)</label>
        <input class="bg-pub-input" id="bg-author" maxlength="24" placeholder="e.g. Alex" />
        <label class="bg-pub-label" style="margin-top:8px">DESCRIPTION (optional)</label>
        <input class="bg-pub-input" id="bg-desc" maxlength="80" placeholder="What does your bot do?" />
        <label class="bg-pub-label" style="margin-top:8px">TAG</label>
        <select class="bg-pub-input" id="bg-pub-tag">
          <option value="">None</option>
          <option value="wall_avoider">Wall Avoider</option>
          <option value="line_follower">Line Follower</option>
          <option value="light_seeker">Light Seeker</option>
          <option value="waypoint">Waypoint Navigator</option>
          <option value="ore_hunter">Ore Hunter</option>
          <option value="custom">Custom</option>
        </select>
        <label class="bg-pub-label" style="margin-top:10px;display:flex;gap:6px;align-items:center;cursor:pointer">
          <input type="checkbox" id="bg-pub-failure" style="width:auto" />
          💥 This was an <b>interesting failure</b> — publish to the yard's failure wall
        </label>
        <div class="bg-pub-err" id="bg-pub-err" style="display:none"></div>
        <button class="bg-pub-btn" id="bg-pub-submit">📤 Publish to Gallery</button>
        <div class="bg-pub-note">
          Publishing shares your tile program with the community. Your program name,
          description, and the tag you choose will be visible. No account required.
        </div>
      </div>`;
  }

  _bind() {
    const el = this._el;
    el.querySelector('#bg-close').addEventListener('click', () => this.close());
    el.querySelector('.bg-overlay').addEventListener('click', e => {
      if (e.target === el.querySelector('.bg-overlay')) this.close();
    });

    el.querySelector('#bg-tab-browse').addEventListener('click', () => {
      el.querySelector('#bg-panel-browse').style.display = '';
      el.querySelector('#bg-panel-publish').style.display = 'none';
      el.querySelector('#bg-tab-browse').classList.add('bg-tab-active');
      el.querySelector('#bg-tab-publish').classList.remove('bg-tab-active');
    });

    el.querySelector('#bg-tab-publish').addEventListener('click', () => {
      el.querySelector('#bg-panel-browse').style.display = 'none';
      el.querySelector('#bg-panel-publish').style.display = '';
      el.querySelector('#bg-tab-browse').classList.remove('bg-tab-active');
      el.querySelector('#bg-tab-publish').classList.add('bg-tab-active');
    });

    el.querySelector('#bg-tag-filter').addEventListener('change', e => {
      this._filter = e.target.value;
      this._renderGrid();
    });

    el.querySelector('#bg-refresh').addEventListener('click', () => this._fetchBrains());
    el.querySelector('#bg-pub-submit')?.addEventListener('click', () => this._doPublish());
  }

  async _fetchBrains() {
    const url = this._workerUrl();
    const grid = this._el?.querySelector('#bg-grid');
    if (!grid) return;

    if (!url && !this._spark?.enabled) {
      grid.innerHTML = `<div class="bg-loading">No cloud configured — set up a Worker URL in onboarding to enable the gallery.</div>`;
      return;
    }

    grid.innerHTML = '<div class="bg-loading">Loading…</div>';
    this._loading = true;

    // Legacy worker brains + scrap-spark shared wall (builds AND failures), merged.
    const jobs = [];
    if (url) {
      jobs.push(fetch(`${url}/api/v1/brains`).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(d => (d.brains ?? []).map(b => ({ ...b, source: 'worker' }))));
    }
    if (this._spark?.enabled) {
      jobs.push(this._spark.gallery('', 'new').then(d => (d?.gallery ?? []).map(g => ({
        id:          `spark:${g.id}`,
        name:        g.title,
        description: g.note || '',
        author:      g.author ?? 'a yard kid',
        tag:         g.kind === 'failure' ? 'failure' : 'shared',
        rating:      null,
        downloads:   g.likes ?? 0,
        created:     typeof g.created === 'number' ? new Date(g.created).toISOString() : (g.created ?? ''),
        programB64:  null,           // fetched lazily on load
        _sparkId:    g.id,
        source:      'spark',
      }))));
    }

    try {
      const results = await Promise.allSettled(jobs);
      this._brains = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      this._renderGrid();
    } catch (e) {
      grid.innerHTML = `<div class="bg-loading">Could not load gallery: ${esc(e.message)}</div>`;
    } finally {
      this._loading = false;
    }
  }

  _renderGrid() {
    const grid = this._el?.querySelector('#bg-grid');
    if (!grid) return;

    const list = this._filter
      ? this._brains.filter(b => b.tag === this._filter)
      : this._brains;

    if (!list.length) {
      grid.innerHTML = `<div class="bg-loading">${
        this._brains.length
          ? 'No programs with that tag yet — be the first!'
          : 'No programs in the gallery yet — be the first to publish!'
      }</div>`;
      return;
    }

    grid.innerHTML = list.map(b => {
      const { grade } = GRADE_FROM_BUDGET(Math.round((5 - Math.min(5, b.rating ?? 3)) / 5 * 100));
      const color = GRADE_COLOR[grade] ?? '#88ffaa';
      const dl    = b.downloads ?? 0;
      const age   = relTime(b.created ?? '');
      return `
        <div class="bg-brain-card" data-id="${esc(b.id)}">
          <div class="bg-card-top">
            <span class="bg-brain-name">${esc(b.name)}</span>
            <span class="bg-grade-badge" style="color:${color}">${grade}</span>
          </div>
          <div class="bg-card-desc">${esc(b.description || '—')}</div>
          <div class="bg-card-meta">
            <span>by ${esc(b.author)}</span>
            ${b.tag ? `<span class="bg-tag-chip">${esc(b.tag.replace(/_/g,' '))}</span>` : ''}
            <span class="bg-dl-count">⬇ ${dl}</span>
            ${age ? `<span class="bg-age">${age}</span>` : ''}
          </div>
          <button class="bg-load-btn" data-id="${esc(b.id)}">LOAD PROGRAM →</button>
        </div>`;
    }).join('');

    grid.querySelectorAll('.bg-load-btn').forEach(btn => {
      btn.addEventListener('click', () => this._loadBrain(btn.dataset.id));
    });
  }

  async _loadBrain(id) {
    // scrap-spark shared wall entry → fetch b64 program from the worker
    if (String(id).startsWith('spark:')) {
      const sparkId = String(id).slice(6);
      try {
        const one = await fetch(`${this._spark?.url ?? ''}/gallery/${sparkId}`).then(x => x.ok ? x.json() : null);
        const progData = one?.program ? JSON.parse(atob(one.program)) : null;
        if (!progData) throw new Error('program missing');
        const prog = TileProgram.fromJSON({
          name: one?.title ?? 'Shared Brain',
          brain: progData.brain ?? 'tin',
          nodes: progData.nodes ?? [],
        });
        this._editor.loadProgram(prog);
        this._editor._game.ui?.notify(`🧠 Loaded "${prog.name}" from the shared yard wall`);
        this._editor._game.achievements?.track('brain_share', {});
        this.close();
      } catch (e) {
        this._editor._game.ui?.notify(`⚠ Could not load shared brain: ${e.message}`);
      }
      return;
    }
    const url = this._workerUrl();
    if (!url) return;
    try {
      const r = await fetch(`${url}/api/v1/brains/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const brain = await r.json();
      const progData = typeof brain.program_json === 'string'
        ? JSON.parse(brain.program_json)
        : brain.program_json;
      const prog = TileProgram.fromJSON(progData);
      this._editor.loadProgram(prog);
      this._editor._game.ui?.notify(`🧠 Loaded "${brain.name}" by ${brain.author}`);
      this._editor._game.achievements?.track('brain_share', {});
      this.close();
    } catch (e) {
      this._editor._game.ui?.notify(`⚠ Could not load brain: ${e.message}`);
    }
  }

  async _doPublish() {
    const url = this._workerUrl();
    const errEl = this._el?.querySelector('#bg-pub-err');
    const showErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };

    if (!url) { showErr('No cloud Worker configured. Set one up in Onboarding.'); return; }

    const author = this._el?.querySelector('#bg-author')?.value?.trim();
    const desc   = this._el?.querySelector('#bg-desc')?.value?.trim();
    const tag    = this._el?.querySelector('#bg-pub-tag')?.value;
    if (!author) { showErr('Enter your name.'); return; }

    const prog = this._editor._program;
    if (!prog || prog.nodes.length === 0) {
      showErr('Your program is empty — build something first!');
      return;
    }

    const budget = this._editor.lastBudgetPct ?? 50;
    const { grade, rating } = GRADE_FROM_BUDGET(budget);

    const btn = this._el?.querySelector('#bg-pub-submit');
    if (btn) { btn.textContent = 'Publishing…'; btn.disabled = true; }

    try {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const r = await fetch(`${url}/api/v1/share-brain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name:        prog.name || 'Unnamed Brain',
          description: desc || '',
          programJson: prog.toJSON(),
          author,
          tag:    tag || null,
          rating,
        }),
      });

      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        showErr(e.error ?? `Server error ${r.status}`);
        return;
      }

      // Also publish to the scrap-spark shared wall — failures are first-class
      // content ("Most Interesting Failure of the Week"). Best-effort.
      const asFailure = !!this._el?.querySelector('#bg-pub-failure')?.checked;
      if (this._spark?.enabled) {
        const res = await this._spark.publish({
          title:       `${prog.name || 'A bot'} — ${desc || (asFailure ? 'a beautiful crash' : 'a working build')}`.slice(0, 80),
          program:     btoa(JSON.stringify(prog.toJSON())),
          kind:        asFailure ? 'failure' : 'build',
          author,
          note:        desc || '',
          bot_name:    prog.name || '',
        });
        if (res && asFailure) {
          this._editor._game.ui?.notify('💥 Failure published to the yard wall — teach the others!');
          // Mo's Ledger × scrap-spark /gallery: publishing an interesting
          // failure is exactly the milestone Mo keeps ("Most Interesting
          // Failure of the Week" wall — SparkCache.publish kind:'failure').
          this._editor._game?.mosJournal?.observe('failure_published', { title: prog.name });
        }
      }

      // Track the ID so we can show "My Published Brains"
      try {
        const mine = JSON.parse(localStorage.getItem('scrapcraft_my_brains') ?? '[]');
        mine.unshift({ id, name: prog.name, grade, published: new Date().toISOString() });
        localStorage.setItem('scrapcraft_my_brains', JSON.stringify(mine.slice(0, 20)));
      } catch {}

      this._editor._game.achievements?.track('brain_share', {});
      this._editor._game.xpSystem?.gain(50);
      this._editor._game.ui?.notify(`📤 "${prog.name}" published to the gallery!`);
      this.close();
    } catch (e) {
      showErr('Network error: ' + e.message);
    } finally {
      if (btn) { btn.textContent = '📤 Publish to Gallery'; btn.disabled = false; }
    }
  }

  _injectCSS() {
    if (document.getElementById('brain-gallery-style')) return;
    const s = document.createElement('style');
    s.id = 'brain-gallery-style';
    s.textContent = `
    #brain-gallery {
      position: fixed; inset: 0; z-index: 220;
      font-family: 'Courier New', monospace;
    }
    .bg-overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.75);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; visibility: hidden; transition: opacity 0.2s ease, visibility 0.2s ease;
    }
    .bg-overlay.bg-show { opacity: 1; visibility: visible; }
    .bg-card {
      background: #040c04; border: 2px solid #226622;
      border-radius: 12px; width: 760px; max-width: 96vw;
      max-height: 88vh; display: flex; flex-direction: column;
      box-shadow: 0 0 50px rgba(0,160,60,0.2), 0 12px 40px rgba(0,0,0,0.8);
    }
    .bg-head {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px 12px; border-bottom: 1px solid #1a3a1a;
      background: #061006; border-radius: 10px 10px 0 0; flex-shrink: 0;
    }
    .bg-icon { font-size: 22px; }
    .bg-title { font-size: 13px; color: #44ee88; letter-spacing: 2px; font-weight: bold; }
    .bg-sub { font-size: 9px; color: #336633; letter-spacing: 1px; }
    .bg-close {
      margin-left: auto; background: none; border: none;
      color: #336633; cursor: pointer; font-size: 18px; padding: 2px 6px;
    }
    .bg-close:hover { color: #44ee88; }
    .bg-tabs {
      display: flex; gap: 0; border-bottom: 1px solid #1a3a1a; flex-shrink: 0;
    }
    .bg-tab {
      flex: 1; padding: 9px 16px; background: none; border: none;
      border-bottom: 2px solid transparent; color: #336633;
      font-family: 'Courier New', monospace; font-size: 10px;
      letter-spacing: 1px; cursor: pointer; transition: all 0.15s;
    }
    .bg-tab:hover { color: #44ee88; }
    .bg-tab-active { color: #44ee88; border-bottom-color: #44ee88; }
    .bg-filter-row {
      display: flex; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #111a11;
    }
    .bg-filter-sel {
      flex: 1; background: #020802; border: 1px solid #1a3a1a;
      border-radius: 4px; padding: 6px 10px; color: #88ffaa;
      font-family: inherit; font-size: 11px; outline: none;
    }
    .bg-refresh-btn {
      background: none; border: 1px solid #1a3a1a; color: #447744;
      border-radius: 4px; padding: 6px 12px; cursor: pointer;
      font-family: inherit; font-size: 10px;
    }
    .bg-refresh-btn:hover { border-color: #44aa44; color: #44ee88; }
    .bg-grid {
      flex: 1; overflow-y: auto; padding: 12px 14px;
      display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px;
    }
    .bg-loading {
      grid-column: 1 / -1; color: #336633; text-align: center;
      padding: 32px 0; font-size: 11px;
    }
    .bg-brain-card {
      background: #061006; border: 1px solid #1a3a1a; border-radius: 8px;
      padding: 12px; display: flex; flex-direction: column; gap: 6px;
      transition: border-color 0.15s;
    }
    .bg-brain-card:hover { border-color: #44aa44; }
    .bg-card-top { display: flex; align-items: flex-start; gap: 6px; }
    .bg-brain-name { flex: 1; font-size: 12px; color: #88ffaa; font-weight: bold; line-height: 1.3; }
    .bg-grade-badge { font-size: 14px; font-weight: bold; flex-shrink: 0; }
    .bg-card-desc { font-size: 10px; color: #447744; line-height: 1.4; }
    .bg-card-meta {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      font-size: 9px; color: #2a5a2a;
    }
    .bg-tag-chip {
      background: #0c1a0c; border: 1px solid #1a3a1a;
      border-radius: 3px; padding: 1px 5px; color: #447744;
    }
    .bg-dl-count { margin-left: auto; }
    .bg-load-btn {
      margin-top: auto; padding: 7px; background: #0c2c0c;
      border: 1px solid #44aa44; border-radius: 5px; color: #44ee88;
      font-family: inherit; font-size: 10px; letter-spacing: 1px;
      cursor: pointer; transition: filter 0.15s;
    }
    .bg-load-btn:hover { filter: brightness(1.2); }

    /* Publish form */
    .bg-publish-form {
      padding: 16px; display: flex; flex-direction: column; gap: 8px;
      overflow-y: auto; max-height: 70vh;
    }
    .bg-pub-prog {
      display: flex; align-items: center; gap: 10px;
      background: #061006; border: 1px solid #1a3a1a;
      border-radius: 7px; padding: 10px 14px; margin-bottom: 6px;
    }
    .bg-pub-name { font-size: 13px; color: #88ffaa; flex: 1; }
    .bg-pub-label { font-size: 9px; color: #336633; letter-spacing: 2px; }
    .bg-pub-input {
      width: 100%; background: #020802; border: 1px solid #1a3a1a;
      border-radius: 5px; padding: 8px 12px; color: #88ffaa;
      font-family: inherit; font-size: 12px; outline: none;
    }
    .bg-pub-input:focus { border-color: #44aa44; }
    .bg-pub-hint { font-size: 10px; color: #f0b429; }
    .bg-pub-err { color: #f44; font-size: 10px; padding: 4px 8px; background: #180000; border-radius: 4px; }
    .bg-pub-btn {
      padding: 10px; background: #0c2c0c; border: 1px solid #44aa44;
      border-radius: 5px; color: #44ee88; font-family: inherit;
      font-size: 11px; letter-spacing: 1px; cursor: pointer; transition: filter 0.15s;
    }
    .bg-pub-btn:hover { filter: brightness(1.2); }
    .bg-pub-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .bg-pub-note { font-size: 9px; color: #2a5a2a; line-height: 1.5; }
    `;
    document.head.appendChild(s);
  }
}
