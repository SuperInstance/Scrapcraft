/**
 * ClassRoom — student class-code join and teacher dashboard surface.
 *
 * HOW IT WORKS
 * ────────────
 * Students: enter a 6-char class code + display name → receive a session token
 * from the Worker → token attached to all saves → teacher can see who's active.
 *
 * Teachers: click "Create Class" → get a code to share → see a live grid of
 * all joined students and their bot status.
 *
 * No email, no PII, no passwords — COPPA-friendly by design. The "account" is
 * the session token stored in localStorage under the class code.
 *
 * Wiring: Game.js calls ClassRoom.showJoinPrompt() at startup (once per session)
 * if a worker URL is configured and no active session exists.
 */

export class ClassRoom {
  constructor(saveSystem, ui) {
    this._save = saveSystem;
    this._ui   = ui;
    this._el   = null;
  }

  get backend() { return this._save._backend; }

  /** Returns true if the player is already in a class session. */
  get inClass() { return !!this.backend.sessionId; }

  /** Returns the current session info or null. */
  get session() {
    try {
      const raw = localStorage.getItem('scrapcraft_session');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  /** Show the join prompt if a Worker is configured and no session exists. */
  showJoinPromptIfNeeded() {
    if (!this.backend.workerUrl || this.inClass) return;
    // Delay slightly so the game renders first
    setTimeout(() => this._renderPanel('join'), 600);
  }

  /** Open the class panel (join or teacher) explicitly — e.g. from UI button. */
  openPanel() {
    this._renderPanel(this.inClass ? 'status' : 'join');
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _renderPanel(mode) {
    this._closePanel();
    const el = document.createElement('div');
    el.id = 'classroom-panel';
    el.innerHTML = this._panelHTML(mode);
    document.body.appendChild(el);
    this._el = el;

    // Inject CSS once
    if (!document.getElementById('classroom-style')) {
      const s = document.createElement('style');
      s.id = 'classroom-style';
      s.textContent = this._css();
      document.head.appendChild(s);
    }

    requestAnimationFrame(() => el.classList.add('show'));
    this._bindPanel(mode);
  }

  _closePanel() {
    if (this._el) { this._el.remove(); this._el = null; }
  }

  _panelHTML(mode) {
    if (mode === 'join') return `
      <div class="cr-card">
        <div class="cr-head">
          <span class="cr-icon">🏫</span>
          <div>
            <div class="cr-title">JOIN A CLASS</div>
            <div class="cr-sub">Enter your teacher's class code</div>
          </div>
          <button class="cr-x" id="cr-close">✕</button>
        </div>
        <div class="cr-body">
          <label class="cr-label">CLASS CODE</label>
          <input class="cr-input cr-code" id="cr-code" maxlength="6" placeholder="ABC123" spellcheck="false" autocomplete="off" />
          <label class="cr-label" style="margin-top:10px">YOUR NAME (shown to teacher)</label>
          <input class="cr-input" id="cr-name" maxlength="20" placeholder="e.g. Alex" spellcheck="false" />
          <div class="cr-err" id="cr-err" style="display:none"></div>
          <div class="cr-actions">
            <button class="cr-btn cr-btn-join" id="cr-join">JOIN CLASS →</button>
          </div>
          <div class="cr-divider">or</div>
          <div style="text-align:center">
            <button class="cr-btn cr-btn-teacher" id="cr-teacher-mode">I'm a Teacher — Create Class</button>
          </div>
          <div class="cr-skip" id="cr-skip">Skip — play without a class</div>
        </div>
      </div>`;

    if (mode === 'create') return `
      <div class="cr-card">
        <div class="cr-head">
          <span class="cr-icon">📋</span>
          <div>
            <div class="cr-title">CREATE A CLASS</div>
            <div class="cr-sub">Get a code to share with students</div>
          </div>
          <button class="cr-x" id="cr-close">✕</button>
        </div>
        <div class="cr-body">
          <label class="cr-label">YOUR NAME</label>
          <input class="cr-input" id="cr-teacher-name" maxlength="30" placeholder="e.g. Ms. Chen" />
          <div class="cr-err" id="cr-err" style="display:none"></div>
          <div class="cr-actions">
            <button class="cr-btn cr-btn-join" id="cr-create">CREATE CLASS →</button>
          </div>
          <div class="cr-skip" id="cr-back">← Back</div>
        </div>
      </div>`;

    if (mode === 'status') {
      const s = this.session;
      const teacher = this._getTeacherInfo();
      return `
      <div class="cr-card">
        <div class="cr-head">
          <span class="cr-icon">✅</span>
          <div>
            <div class="cr-title">IN CLASS: ${s?.classCode ?? '?'}</div>
            <div class="cr-sub">Playing as: ${s?.displayName ?? '?'}</div>
          </div>
          <button class="cr-x" id="cr-close">✕</button>
        </div>
        <div class="cr-body">
          <div style="color:#88aa88;font-size:11px;line-height:1.6">
            Your progress syncs to the cloud ☁<br>
            You can switch devices and your bot will be there.
          </div>
          ${teacher ? `
          <div class="cr-actions" style="margin-top:14px">
            <button class="cr-btn cr-btn-join" id="cr-dashboard">🏫 Open Teacher Dashboard →</button>
          </div>` : ''}
          <div class="cr-actions" style="margin-top:8px">
            <button class="cr-btn" id="cr-leave" style="color:#f66;border-color:#622">Leave Class</button>
          </div>
        </div>
      </div>`;
    }
    return '';
  }

  _bindPanel(mode) {
    const el = this._el;
    el.querySelector('#cr-close')?.addEventListener('click', () => this._closePanel());

    if (mode === 'join') {
      const codeIn = el.querySelector('#cr-code');
      codeIn?.addEventListener('input', () => {
        codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      });
      el.querySelector('#cr-join')?.addEventListener('click', () => this._doJoin());
      el.querySelector('#cr-teacher-mode')?.addEventListener('click', () => this._renderPanel('create'));
      el.querySelector('#cr-skip')?.addEventListener('click', () => this._closePanel());
    }

    if (mode === 'create') {
      el.querySelector('#cr-create')?.addEventListener('click', () => this._doCreate());
      el.querySelector('#cr-back')?.addEventListener('click', () => this._renderPanel('join'));
    }

    if (mode === 'status') {
      el.querySelector('#cr-leave')?.addEventListener('click', () => {
        if (confirm('Leave the class? Your local save is kept.')) {
          localStorage.removeItem('scrapcraft_session');
          this._closePanel();
          this._ui?.notify('Left class. Progress stays local.');
        }
      });
      el.querySelector('#cr-dashboard')?.addEventListener('click', () => {
        const t = this._getTeacherInfo();
        if (!t) return;
        const url = this._teacherDashUrl(t.classCode, t.teacherKey);
        window.open(url, '_blank');
      });
    }
  }

  _getTeacherInfo() {
    try {
      const raw = localStorage.getItem('scrapcraft_class_teacher');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  async _doJoin() {
    const code = this._el?.querySelector('#cr-code')?.value?.trim();
    const name = this._el?.querySelector('#cr-name')?.value?.trim();
    const errEl = this._el?.querySelector('#cr-err');
    if (!code || code.length < 4) { this._showErr('Enter a valid class code.'); return; }
    if (!name || name.length < 1) { this._showErr('Enter your name.'); return; }
    const btn = this._el?.querySelector('#cr-join');
    if (btn) { btn.textContent = 'Joining…'; btn.disabled = true; }
    try {
      await this.backend.joinClass(code, name);
      this._closePanel();
      this._ui?.notify(`✅ Joined class ${code} as ${name}! Progress syncs to cloud ☁`);
      // Attempt cloud save merge
      await this._save.loadWithCloud().catch(() => {});
    } catch (e) {
      if (btn) { btn.textContent = 'JOIN CLASS →'; btn.disabled = false; }
      this._showErr(e.message ?? 'Could not join. Check the code and try again.');
    }
  }

  async _doCreate() {
    const name = this._el?.querySelector('#cr-teacher-name')?.value?.trim();
    if (!name) { this._showErr('Enter your name.'); return; }
    const btn = this._el?.querySelector('#cr-create');
    if (btn) { btn.textContent = 'Creating…'; btn.disabled = true; }
    try {
      const data = await this.backend.createClass(name);
      // Persist teacher credentials so they can reopen the dashboard
      localStorage.setItem('scrapcraft_class_teacher', JSON.stringify({
        classCode:  data.classCode,
        teacherKey: data.teacherKey,
        teacherName: name,
      }));
      this._closePanel();
      const dashUrl = this._teacherDashUrl(data.classCode, data.teacherKey);
      prompt(
        `Class ${data.classCode} created!\n\nShare this code with students: ${data.classCode}\n\nYour teacher dashboard URL (bookmark it):`,
        dashUrl,
      );
      this._ui?.notify(`🏫 Class ${data.classCode} created. Open teacher.html to see your roster.`);
    } catch (e) {
      if (btn) { btn.textContent = 'CREATE CLASS →'; btn.disabled = false; }
      this._showErr(e.message ?? 'Could not create class.');
    }
  }

  _teacherDashUrl(classCode, teacherKey) {
    const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/teacher.html');
    const params = new URLSearchParams({ code: classCode, key: teacherKey });
    const workerUrl = this.backend.workerUrl;
    if (workerUrl) params.set('url', workerUrl);
    return `${base}?${params}`;
  }

  _showErr(msg) {
    const el = this._el?.querySelector('#cr-err');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }

  _css() {
    return `
    #classroom-panel {
      position:fixed; inset:0; background:rgba(0,0,0,0.6);
      display:flex; align-items:center; justify-content:center;
      z-index:210; opacity:0; visibility:hidden; transition:opacity 0.25s ease, visibility 0.25s ease;
      font-family:'Courier New',monospace;
    }
    #classroom-panel.show { opacity:1; visibility:visible; }
    .cr-card {
      background:#040c04; border:2px solid #226622;
      border-radius:12px; width:400px; max-width:95vw;
      box-shadow:0 0 40px rgba(0,160,60,0.2), 0 8px 40px rgba(0,0,0,0.8);
    }
    .cr-head {
      display:flex; align-items:center; gap:10px;
      padding:14px 16px 12px; border-bottom:1px solid #1a3a1a;
      background:#061006; border-radius:10px 10px 0 0;
    }
    .cr-icon { font-size:20px; }
    .cr-title { font-size:13px; color:#44ee88; letter-spacing:2px; font-weight:bold; }
    .cr-sub { font-size:9px; color:#336633; letter-spacing:1px; margin-top:2px; }
    .cr-x { background:none; border:none; color:#336633; cursor:pointer; font-size:16px; padding:2px 6px; margin-left:auto; }
    .cr-x:hover { color:#44ee88; }
    .cr-body { padding:16px; }
    .cr-label { display:block; font-size:9px; color:#336633; letter-spacing:2px; margin-bottom:4px; }
    .cr-input {
      width:100%; background:#020802; border:1px solid #1a3a1a;
      border-radius:5px; padding:9px 12px; color:#88ffaa;
      font-family:inherit; font-size:14px; outline:none;
      transition:border-color 0.15s;
    }
    .cr-input:focus { border-color:#44aa44; }
    .cr-code { letter-spacing:4px; font-size:20px; text-align:center; font-weight:bold; }
    .cr-err { color:#f44; font-size:10px; margin-top:6px; padding:5px 8px; background:#1a0000; border-radius:4px; border:1px solid #4a0000; }
    .cr-actions { margin-top:14px; }
    .cr-btn {
      width:100%; padding:10px; border-radius:5px; cursor:pointer;
      font-family:inherit; font-size:11px; letter-spacing:1px;
      transition:filter 0.15s;
    }
    .cr-btn:hover { filter:brightness(1.2); }
    .cr-btn-join { background:#0c2c0c; border:1px solid #44aa44; color:#44ee88; }
    .cr-btn-teacher { background:none; border:1px solid #336633; color:#447744; font-size:10px; }
    .cr-divider { text-align:center; color:#1a4a1a; font-size:10px; margin:12px 0 8px; }
    .cr-skip { text-align:center; color:#2a5a2a; font-size:9px; cursor:pointer; margin-top:12px; }
    .cr-skip:hover { color:#44aa44; }
    `;
  }
}
