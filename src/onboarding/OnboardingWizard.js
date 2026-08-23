/**
 * OnboardingWizard — first-run overlay for Scrapcraft. TWO steps, zero
 * ceremony:
 *
 *   1. Big Earl's Yard   — Earl's greeting + Quest 1 ("mine me five iron")
 *                          + the only three controls that matter.
 *   2. The Yard Awaits   — you're free, Earl's watching, [F]/[H] exist.
 *
 * The old AI-engine and Cloudflare steps moved to Settings → Advanced
 * (post-spawn, optional — a 10-year-old should never see an API key dialog
 * before they've held a wrench). Spark starts OFFLINE by default; entering a
 * key later in Settings upgrades Spark live, no restart.
 *
 * The wizard no longer runs an inline tutorial — the yard IS the tutorial.
 * On finish it hands off to Game._onOnboardingComplete(), which fires Earl's
 * spawn conscription and the in-game mission card.
 */

import { EARL_CONSCRIPTION_LINES } from './coldstart.js';

export const STEPS = [
  {
    id: 'welcome',
    title: "Big Earl's Yard",
    icon: '🏭',
    content: `
      <p><b>Earl:</b> <i>"So you finally showed up. The junk's been piling up
      waiting for someone with thumbs."</i></p>
      <p>First job: <b>mine 5 iron scrap</b> off the rust heaps —
      <b>hold left-click</b> to dig.</p>
      <p><b>WASD</b> to move &nbsp;·&nbsp; <b>E</b> for the workshop.
      That's everything. Get to work, rookie.</p>
    `,
  },
  {
    id: 'ready',
    title: 'The Yard Awaits',
    icon: '🚀',
    content: `
      <p>You're loose in the yard now. The iron's out there waiting.</p>
      <p>Hit <b>F</b> to talk to Earl. Stuck? Hit <b>H</b> any time.</p>
      <p>And if something floats by and says hello while you're hauling
      scrap… don't run away.</p>
    `,
  },
];

export class OnboardingWizard {
  constructor(game) {
    this.game = game;
    this.el = null;
    this.currentStep = 0;
    this.config = {
      aiProvider: null,
      apiKey: null,
      cfWorkerUrl: null,
      tutorialComplete: false,
    };
  }

  /** Returns true if onboarding was already completed */
  isComplete() {
    return localStorage.getItem('scrapcraft_onboarding_done') === 'true';
  }

  /** Mark onboarding done */
  markComplete() {
    localStorage.setItem('scrapcraft_onboarding_done', 'true');
    localStorage.setItem('scrapcraft_onboarding_config', JSON.stringify(this.config));
  }

  /** Load saved config (compat: the yard's voices read this same record) */
  loadConfig() {
    try {
      const saved = localStorage.getItem('scrapcraft_onboarding_config');
      if (saved) Object.assign(this.config, JSON.parse(saved));
    } catch (e) {
      // ignore corrupt config
    }
  }

  /** Show the wizard overlay */
  show() {
    if (this.isComplete()) return;
    this.loadConfig();

    // Inject CSS if not already present
    if (!document.getElementById('onboarding-wizard-style')) {
      const style = document.createElement('style');
      style.id = 'onboarding-wizard-style';
      style.textContent = this._css();
      document.head.appendChild(style);
    }

    this.el = document.createElement('div');
    this.el.className = 'ow-overlay';
    this.el.id = 'onboarding-wizard';
    this.el.innerHTML = `
      <div class="ow-card">
        <div class="ow-header">
          <span class="ow-icon" id="ow-icon">🏭</span>
          <h2 class="ow-title" id="ow-title">Big Earl's Yard</h2>
        </div>
        <div class="ow-body" id="ow-body"></div>
        <div class="ow-dots" id="ow-dots"></div>
        <div class="ow-nav">
          <button class="ow-btn ow-btn-back" id="ow-back" disabled>← Back</button>
          <button class="ow-btn ow-btn-skip" id="ow-skip">Skip →</button>
          <button class="ow-btn ow-btn-next" id="ow-next">Next →</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);

    // Build dots
    this._buildDots();

    // Bind navigation
    this.el.querySelector('#ow-next').addEventListener('click', () => this._nextStep());
    this.el.querySelector('#ow-back').addEventListener('click', () => this._prevStep());
    this.el.querySelector('#ow-skip').addEventListener('click', () => this.finish());

    // Fade in
    requestAnimationFrame(() => this.el.classList.add('ow-visible'));

    this.renderStep();
  }

  _buildDots() {
    const dotsEl = document.getElementById('ow-dots');
    if (!dotsEl) return;
    dotsEl.innerHTML = STEPS.map((s, i) =>
      `<span class="ow-dot${i === 0 ? ' active' : ''}" data-index="${i}"></span>`
    ).join('');
  }

  _updateDots() {
    const dots = this.el.querySelectorAll('.ow-dot');
    dots.forEach((d, i) => d.classList.toggle('active', i === this.currentStep));
  }

  _updateNav() {
    const back = this.el.querySelector('#ow-back');
    const next = this.el.querySelector('#ow-next');
    const skip = this.el.querySelector('#ow-skip');
    const step = STEPS[this.currentStep];

    back.disabled = this.currentStep === 0;

    if (step.id === 'ready') {
      next.textContent = '🚀 Start Playing!';
      skip.style.display = 'none';
    } else {
      next.textContent = 'Next →';
      skip.style.display = '';
    }
  }

  renderStep() {
    const step = STEPS[this.currentStep];
    const iconEl = document.getElementById('ow-icon');
    const titleEl = document.getElementById('ow-title');
    const bodyEl = document.getElementById('ow-body');

    if (!bodyEl) return;

    // Fade out
    bodyEl.classList.remove('ow-body-in');
    bodyEl.style.opacity = '0';
    bodyEl.style.transform = 'translateX(20px)';

    setTimeout(() => {
      if (iconEl) iconEl.textContent = step.icon;
      if (titleEl) titleEl.textContent = step.title;
      let html = step.content ?? '';
      if (step.id === 'welcome') {
        // Earl rotates his opener — the yard never gives the same speech twice
        const quip = EARL_CONSCRIPTION_LINES[Math.floor(Math.random() * 3)].split(' — ')[0];
        html = `<p><b>Earl:</b> <i>"${quip}"</i></p>` + html.replace(/<p><b>Earl:<\/b>[\s\S]*?<\/p>/, '');
      }
      bodyEl.innerHTML = `<div class="ow-content">${html}</div>`;

      this._updateNav();

      // Fade in
      requestAnimationFrame(() => {
        bodyEl.style.opacity = '1';
        bodyEl.style.transform = 'translateX(0)';
        bodyEl.classList.add('ow-body-in');
      });

      this._updateDots();
    }, 150);
  }

  // ── Navigation ──────────────────────────────────────────────

  _nextStep() {
    if (this.currentStep < STEPS.length - 1) {
      this.currentStep++;
      this.renderStep();
    } else {
      this.finish();
    }
  }

  _prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.renderStep();
    }
  }

  // ── Finish ─────────────────────────────────────────────────

  /** Save config and dismiss wizard — the yard takes over from here. */
  finish() {
    this.markComplete();

    // Animate out
    if (this.el) {
      this.el.classList.remove('ow-visible');
      setTimeout(() => {
        this.el?.remove();
        this.el = null;
        // Hand off: Earl conscripts at spawn, mission card starts, pointer locks.
        this.game._onOnboardingComplete?.();
        // Lock only if nothing else holds the opening — the yard gate may
        // still be pending, and its buttons need a free cursor.
        if (!document.pointerLockElement && !this.game?.openingPending) {
          this.game.canvas?.requestPointerLock();
        }
      }, 300);
    } else {
      this.game._onOnboardingComplete?.();
    }
  }

  // ── CSS (injected once) ─────────────────────────────────────

  _css() {
    return `
/* ── Onboarding Wizard — first-run overlay (2 steps, no ceremony) ── */
.ow-overlay {
  position: fixed; inset: 0;
  /* Translucent scrim — the yard orbits behind the wizard (world-before-
     menu); the card itself stays opaque so the copy keeps its contrast. */
  background: rgba(8, 10, 6, 0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000;
  font-family: 'Courier New', monospace;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.ow-overlay.ow-visible {
  opacity: 1;
}

.ow-card {
  background: #121212;
  border: 1px solid #2a2a2a;
  border-radius: 14px;
  padding: 28px 32px;
  max-width: 520px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(240,180,41,0.06);
  transform: translateY(10px);
  transition: transform 0.3s ease;
}
.ow-visible .ow-card {
  transform: translateY(0);
}

.ow-header {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #1e1e1e;
}
.ow-icon {
  font-size: 28px;
  flex-shrink: 0;
}
.ow-title {
  font-size: 16px;
  color: #f0b429;
  font-weight: bold;
  letter-spacing: 1.5px;
  margin: 0;
}

.ow-body {
  min-height: 160px;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.ow-body-in {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.ow-content p {
  font-size: 12px;
  color: #999;
  line-height: 1.65;
  margin: 6px 0;
}
.ow-content b { color: #ddd; }
.ow-content i { color: #c9a15a; }

/* ── Navigation Dots ── */
.ow-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin: 16px 0 12px;
}
.ow-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #222;
  transition: all 0.2s ease;
}
.ow-dot.active {
  background: #f0b429;
  box-shadow: 0 0 6px rgba(240,180,41,0.4);
}

/* ── Navigation ── */
.ow-nav {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  align-items: center;
}
.ow-btn {
  padding: 8px 18px;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  cursor: pointer;
  letter-spacing: 1px;
  transition: all 0.12s;
}
.ow-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.ow-btn-back {
  background: transparent;
  border: 1px solid #333;
  color: #666;
  margin-right: auto;
}
.ow-btn-back:hover:not(:disabled) {
  border-color: #666;
  color: #bbb;
}

.ow-btn-skip {
  background: transparent;
  border: 1px solid #2a2a2a;
  color: #444;
}
.ow-btn-skip:hover {
  border-color: #666;
  color: #888;
}

.ow-btn-next {
  background: #f0b429;
  border: 1px solid #f0b429;
  color: #000;
  font-weight: bold;
}
.ow-btn-next:hover:not(:disabled) {
  background: #ffd060;
  border-color: #ffd060;
}
.ow-btn-next:active:not(:disabled) {
  transform: scale(0.97);
}

/* ── Responsive tweaks ── */
@media (max-width: 540px) {
  .ow-card { padding: 20px 18px; }
}
`;
  }
}
