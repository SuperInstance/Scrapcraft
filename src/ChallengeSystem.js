/**
 * ChallengeSystem — polls for teacher-assigned challenges and auto-grades
 * student robot programs against defined criteria.
 *
 * Supported challenge types:
 *   "wall_avoider"     — robot must survive N seconds without bumping a wall.
 *   "exploration"      — robot must run for N seconds (any movement, no bump req).
 *   "efficiency_runner"— robot must run N seconds AND achieve grade A or better.
 *
 * Wiring (Game.js):
 *   this.challengeSystem = new ChallengeSystem(this);
 *   // In tick loop:
 *   this.challengeSystem.tick(dt);
 */

const POLL_INTERVAL_SEC = 60;
const GRADE_ORDER = { 'A+': 0, A: 1, B: 2, C: 3, D: 4 };
const GRADE_COLOR = { 'A+': '#00ffaa', A: '#44ee88', B: '#aadd44', C: '#f0b429', D: '#f44336' };

export class ChallengeSystem {
  constructor(game) {
    this._game    = game;
    this._challenge   = null;   // current active challenge object
    this._pollTimer   = POLL_INTERVAL_SEC; // trigger first poll immediately
    this._survivalSec = 0;      // seconds robot has survived meeting criteria
    this._completed   = false;  // already submitted this challenge
    this._bannerEl    = null;
    this._joinNotified = false; // fire class_joined quip once per session

    this._leaderboard = [];     // latest leaderboard snapshot
    this._lbEl        = null;   // leaderboard popup element
    this._lbCount     = 0;      // total enrolled students
  }

  tick(dt) {
    const session = this._sessionInfo();
    if (!session) return; // not in a class

    // One-shot Earl reaction when the player is in a class session
    if (!this._joinNotified) {
      this._joinNotified = true;
      this._game.foreman?.onEvent('class_joined', {});
    }

    // Periodic poll for new challenge + Spark config from teacher
    this._pollTimer += dt;
    if (this._pollTimer >= POLL_INTERVAL_SEC) {
      this._pollTimer = 0;
      this._pollChallenge(session);
      this._pollSparkConfig(session);
      if (this._challenge && !this._completed) this._pollLeaderboard(session);
    }

    if (!this._challenge || this._completed) return;

    const te = this._game.tileEditor;
    if (!te?.isRunning) {
      // Robot stopped — reset survival timer
      this._survivalSec = 0;
      this._updateBanner();
      return;
    }

    const sensors     = te.lastSensors;
    const bumpedSensor = sensors.find(s => s.key === 'bumped');
    const bumped       = bumpedSensor?.val === true;
    const criteria     = this._challenge.criteria;

    switch (criteria.type) {
      case 'wall_avoider':
        if (bumped) { this._survivalSec = 0; }
        else        { this._survivalSec += dt; }
        this._updateBanner();
        if (this._survivalSec >= (criteria.durationSec ?? 30)) this._submit();
        break;

      case 'exploration':
        // Any runtime counts — just keep the bot running
        this._survivalSec += dt;
        this._updateBanner();
        if (this._survivalSec >= (criteria.durationSec ?? 20)) this._submit();
        break;

      case 'efficiency_runner': {
        // Must run the full duration AND achieve grade A or better
        const grade = te.lastGrade ?? 'D';
        const gradeNum = GRADE_ORDER[grade] ?? 4;
        const targetGradeNum = GRADE_ORDER[criteria.targetGrade ?? 'A'] ?? 1;
        if (bumped) { this._survivalSec = 0; }
        else        { this._survivalSec += dt; }
        this._updateBanner();
        if (this._survivalSec >= (criteria.durationSec ?? 30) && gradeNum <= targetGradeNum) {
          this._submit();
        }
        break;
      }
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _sessionInfo() {
    try {
      const raw = localStorage.getItem('scrapcraft_session');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  _workerUrl() {
    try {
      const cfg = JSON.parse(localStorage.getItem('scrapcraft_onboarding_config') ?? '{}');
      return cfg.cfWorkerUrl ?? null;
    } catch { return null; }
  }

  async _pollChallenge(session) {
    const url = this._workerUrl();
    if (!url) return;
    try {
      const r = await fetch(`${url}/api/v1/class/${session.classCode}/challenge`);
      if (!r.ok) return;
      const { challenge } = await r.json();

      if (!challenge) {
        // Challenge ended
        if (this._challenge) {
          this._challenge = null;
          this._survivalSec = 0;
          this._completed = false;
          this._leaderboard = [];
          this._hideBanner();
        }
        return;
      }

      // New challenge
      if (this._challenge?.id !== challenge.id) {
        this._challenge   = challenge;
        this._survivalSec = 0;
        this._completed   = false;
        this._leaderboard = [];
        this._showBanner();
        this._game.ui?.notify(`🏆 New challenge: ${challenge.title}`);
        this._game.foreman?.onEvent('class_challenge_assigned', {});
        this._pollLeaderboard(session);
      }
    } catch { /* network hiccup — try again next poll */ }
  }

  async _pollLeaderboard(session) {
    const url = this._workerUrl();
    if (!url) return;
    try {
      const r = await fetch(`${url}/api/v1/class/${session.classCode}/leaderboard`);
      if (!r.ok) return;
      const { leaderboard, totalStudents } = await r.json();
      this._leaderboard = leaderboard ?? [];
      this._lbCount = totalStudents ?? 0;
      this._updateLbButton();
      if (this._lbEl) this._renderLeaderboardBody();
    } catch { /* network hiccup */ }
  }

  async _submit() {
    if (this._completed) return;
    this._completed = true;

    const te     = this._game.tileEditor;
    const grade  = te?.lastGrade    ?? 'C';
    const budget = te?.lastBudgetPct ?? 50;
    const session = this._sessionInfo();
    const url     = this._workerUrl();
    if (!url || !session) return;

    try {
      await fetch(`${url}/api/v1/challenge/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Scrapcraft-Session': session.sessionId,
        },
        body: JSON.stringify({
          challengeId: this._challenge.id,
          grade,
          budgetPct: budget,
        }),
      });
    } catch { /* fire-and-forget */ }

    this._game.achievements?.track('challenge_complete');
    this._game.foreman?.onEvent('class_challenge_complete', {});
    this._game.ui?.notify(`🏆 Challenge complete! Grade: ${grade}`);
    this._updateBanner(true);
    // Refresh leaderboard now that we're on it
    this._pollLeaderboard(session);
  }

  async _pollSparkConfig(session) {
    const url = this._workerUrl();
    if (!url) return;
    try {
      const r = await fetch(`${url}/api/v1/class/${session.classCode}/spark-config`);
      if (!r.ok) return;
      const { sparkEnabled } = await r.json();
      const spark = this._game.tileEditor?._spark;
      if (spark) spark.setMuted(!sparkEnabled);
    } catch { /* network hiccup */ }
  }

  // ── Banner UI ────────────────────────────────────────────────────────────────

  _showBanner() {
    this._hideBanner();
    const el = document.createElement('div');
    el.id = 'challenge-banner';
    el.style.cssText = `
      position:fixed; bottom:130px; left:50%; transform:translateX(-50%);
      background:#040c04; border:1px solid #44aa44; border-radius:8px;
      padding:8px 16px; font-family:'Courier New',monospace; z-index:150;
      display:flex; align-items:center; gap:10px; min-width:280px;
      box-shadow:0 0 20px rgba(0,160,60,0.25);
    `;
    el.innerHTML = `
      <span style="font-size:18px">🏆</span>
      <div style="flex:1">
        <div style="font-size:9px;color:#336633;letter-spacing:2px">ACTIVE CHALLENGE</div>
        <div id="cb-title" style="font-size:11px;color:#88ffaa"></div>
        <div id="cb-progress" style="font-size:10px;color:#44aa44;margin-top:2px"></div>
      </div>
      <button id="cb-lb-btn" title="See class leaderboard" style="
        background:none;border:1px solid #336633;border-radius:4px;color:#447744;
        font-family:'Courier New',monospace;font-size:9px;padding:4px 7px;cursor:pointer;
        white-space:nowrap;flex-shrink:0;
      ">👥 0</button>
    `;
    document.body.appendChild(el);
    this._bannerEl = el;
    el.querySelector('#cb-lb-btn').addEventListener('click', () => this._toggleLeaderboard());
    this._updateBanner();
    this._updateLbButton();
  }

  _hideBanner() {
    if (this._bannerEl) { this._bannerEl.remove(); this._bannerEl = null; }
    this._hideLeaderboard();
  }

  _updateBanner(completed = false) {
    if (!this._bannerEl || !this._challenge) return;
    const titleEl = this._bannerEl.querySelector('#cb-title');
    const progEl  = this._bannerEl.querySelector('#cb-progress');
    if (titleEl) titleEl.textContent = this._challenge.title;
    if (!progEl) return;

    if (completed) {
      this._bannerEl.style.borderColor = '#00ffaa';
      progEl.style.color = '#00ffaa';
      progEl.textContent = '✓ COMPLETE!';
      return;
    }

    const criteria = this._challenge.criteria;
    const te       = this._game.tileEditor;
    const running  = te?.isRunning;
    const target   = criteria.durationSec ?? 30;
    const done     = Math.min(Math.floor(this._survivalSec), target);
    const pct      = Math.round((done / target) * 100);

    switch (criteria.type) {
      case 'wall_avoider':
        progEl.textContent = running
          ? `${done}s / ${target}s no-bump  [${pct}%]`
          : `Start robot — ${done}s banked`;
        break;
      case 'exploration':
        progEl.textContent = running
          ? `${done}s / ${target}s running  [${pct}%]`
          : `Start robot — ${done}s banked`;
        break;
      case 'efficiency_runner': {
        const grade = te?.lastGrade ?? '?';
        const targetGrade = criteria.targetGrade ?? 'A';
        progEl.textContent = running
          ? `${done}s / ${target}s | grade ${grade} (need ${targetGrade})`
          : `Start robot — need grade ${targetGrade} or better`;
        break;
      }
    }
  }

  _updateLbButton() {
    const btn = this._bannerEl?.querySelector('#cb-lb-btn');
    if (!btn) return;
    const done = this._leaderboard.length;
    const total = this._lbCount;
    btn.textContent = total > 0 ? `👥 ${done}/${total}` : `👥 ${done}`;
    btn.style.borderColor = done > 0 ? '#44aa44' : '#336633';
    btn.style.color = done > 0 ? '#44ee88' : '#447744';
  }

  // ── Leaderboard popup ────────────────────────────────────────────────────────

  _toggleLeaderboard() {
    if (this._lbEl) { this._hideLeaderboard(); return; }
    this._showLeaderboard();
  }

  _showLeaderboard() {
    this._hideLeaderboard();
    const session = this._sessionInfo();
    const myName = session?.displayName ?? '';

    const el = document.createElement('div');
    el.id = 'challenge-leaderboard';
    el.style.cssText = `
      position:fixed; bottom:190px; left:50%; transform:translateX(-50%);
      background:#040c04; border:1px solid #226622; border-radius:8px;
      font-family:'Courier New',monospace; z-index:151; min-width:300px;
      max-width:360px; max-height:300px; display:flex; flex-direction:column;
      box-shadow:0 0 30px rgba(0,160,60,0.2);
    `;

    const title = this._challenge?.title ?? 'Challenge';
    el.innerHTML = `
      <div style="padding:8px 12px;border-bottom:1px solid #1a3a1a;display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;color:#44ee88;letter-spacing:1px;flex:1">CLASS LEADERBOARD</span>
        <span style="font-size:9px;color:#336633">${title}</span>
        <button id="lb-close" style="background:none;border:none;color:#447744;cursor:pointer;font-size:14px;padding:0 2px">✕</button>
      </div>
      <div id="lb-body" style="overflow-y:auto;flex:1;padding:6px 0"></div>
      <div style="padding:6px 12px;border-top:1px solid #111a11;font-size:9px;color:#2a5a2a;text-align:center">
        Updates every minute · ${this._lbCount} student${this._lbCount !== 1 ? 's' : ''} enrolled
      </div>
    `;

    document.body.appendChild(el);
    this._lbEl = el;
    el.querySelector('#lb-close').addEventListener('click', () => this._hideLeaderboard());
    this._renderLeaderboardBody();
  }

  _renderLeaderboardBody() {
    const body = this._lbEl?.querySelector('#lb-body');
    if (!body) return;
    const session = this._sessionInfo();
    const myName = session?.displayName ?? '';

    if (!this._leaderboard.length) {
      body.innerHTML = `<div style="padding:16px;text-align:center;color:#336633;font-size:10px">
        No completions yet — be the first!
      </div>`;
      return;
    }

    body.innerHTML = this._leaderboard.map(r => {
      const isMe = myName && r.name === myName;
      const gc = GRADE_COLOR[r.grade] ?? '#88ffaa';
      return `<div style="
        display:flex;align-items:center;gap:8px;padding:5px 12px;
        ${isMe ? 'background:#061806;' : ''}
      ">
        <span style="font-size:10px;color:#336633;width:18px;text-align:right">${r.rank}.</span>
        <span style="flex:1;font-size:10px;color:${isMe ? '#00ffaa' : '#88ffaa'}">${_esc(r.name)}${isMe ? ' ◀ YOU' : ''}</span>
        <span style="font-size:12px;font-weight:bold;color:${gc}">${r.grade}</span>
        <span style="font-size:9px;color:#336633">${r.budget_pct ?? '?'}% budget</span>
      </div>`;
    }).join('');
  }

  _hideLeaderboard() {
    if (this._lbEl) { this._lbEl.remove(); this._lbEl = null; }
  }
}

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
