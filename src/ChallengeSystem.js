/**
 * ChallengeSystem — polls for teacher-assigned challenges and auto-grades
 * student robot programs against defined criteria.
 *
 * Currently supports one challenge type:
 *   "wall_avoider" — robot must run for N seconds without bumping a wall.
 *
 * Wiring (Game.js):
 *   this.challengeSystem = new ChallengeSystem(this);
 *   // In tick loop:
 *   this.challengeSystem.tick(dt);
 */

const POLL_INTERVAL_SEC = 60;

export class ChallengeSystem {
  constructor(game) {
    this._game    = game;
    this._challenge   = null;   // current active challenge object
    this._pollTimer   = POLL_INTERVAL_SEC; // trigger first poll immediately
    this._survivalSec = 0;      // seconds robot has survived without bumping
    this._completed   = false;  // already submitted this challenge
    this._bannerEl    = null;
    this._joinNotified = false; // fire class_joined quip once per session
  }

  tick(dt) {
    const session = this._sessionInfo();
    if (!session) return; // not in a class

    // One-shot Earl reaction when the player is in a class session
    if (!this._joinNotified) {
      this._joinNotified = true;
      this._game.foreman?.onEvent('class_joined', {});
    }

    // Periodic poll for new challenge from teacher
    this._pollTimer += dt;
    if (this._pollTimer >= POLL_INTERVAL_SEC) {
      this._pollTimer = 0;
      this._pollChallenge(session);
    }

    if (!this._challenge || this._completed) return;

    const te = this._game.tileEditor;
    if (!te?.isRunning) {
      // Robot stopped — reset survival timer
      this._survivalSec = 0;
      this._updateBanner();
      return;
    }

    const sensors   = te.lastSensors;
    const bumpedSensor = sensors.find(s => s.key === 'bumped');
    const bumped    = bumpedSensor?.val === true;

    const criteria  = this._challenge.criteria;

    if (criteria.type === 'wall_avoider') {
      if (bumped) {
        this._survivalSec = 0;
      } else {
        this._survivalSec += dt;
      }
      this._updateBanner();
      if (this._survivalSec >= (criteria.durationSec ?? 30)) {
        this._submit();
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
          this._hideBanner();
        }
        return;
      }

      // New challenge
      if (this._challenge?.id !== challenge.id) {
        this._challenge   = challenge;
        this._survivalSec = 0;
        this._completed   = false;
        this._showBanner();
        this._game.ui?.notify(`🏆 New challenge: ${challenge.title}`);
        this._game.foreman?.onEvent('class_challenge_assigned', {});
      }
    } catch { /* network hiccup — try again next poll */ }
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
      display:flex; align-items:center; gap:10px; min-width:260px;
      box-shadow:0 0 20px rgba(0,160,60,0.25);
    `;
    el.innerHTML = `
      <span style="font-size:18px">🏆</span>
      <div style="flex:1">
        <div style="font-size:9px;color:#336633;letter-spacing:2px">ACTIVE CHALLENGE</div>
        <div id="cb-title" style="font-size:11px;color:#88ffaa"></div>
        <div id="cb-progress" style="font-size:10px;color:#44aa44;margin-top:2px"></div>
      </div>
    `;
    document.body.appendChild(el);
    this._bannerEl = el;
    this._updateBanner();
  }

  _hideBanner() {
    if (this._bannerEl) { this._bannerEl.remove(); this._bannerEl = null; }
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
    if (criteria.type === 'wall_avoider') {
      const target = criteria.durationSec ?? 30;
      const done   = Math.min(Math.floor(this._survivalSec), target);
      const pct    = Math.round((done / target) * 100);
      const te     = this._game.tileEditor;
      const running = te?.isRunning;
      progEl.textContent = running
        ? `${done}s / ${target}s survived  [${pct}%]`
        : `Start robot to begin — ${done}s banked`;
    }
  }
}
