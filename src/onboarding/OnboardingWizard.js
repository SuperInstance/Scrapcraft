/**
 * OnboardingWizard — first-run setup overlay for Scrapcraft.
 *
 * Multi-step wizard that:
 * 1. Greets player + asks about AI features
 * 2. Lets them pick an AI provider and enter an API key
 * 3. Checks for Cloudflare Worker availability
 * 4. Runs a 3-step guided tutorial
 * 5. Saves configuration and starts the game
 */

import { PROVIDERS } from './ProviderList.js';

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to the Scrapyard!',
    icon: '🏭',
    content: `
      <p>Big Earl runs this place. There's scrap everywhere,
      a robot waiting to be built, and a lot of work to do.</p>
      <p>Let's get you set up.</p>
    `,
  },
  {
    id: 'ai_setup',
    title: 'AI Power — Pick Your Engine',
    icon: '🧠',
    content: `
      <p>Scrapcraft's Spark AI helps you build robot programs,
      generates Codex entries, and powers Earl's dialogue.</p>
      <p>Select a provider and enter your API key, or skip for offline mode.</p>
    `,
    render: 'ai_setup',
  },
  {
    id: 'cloudflare_connect',
    title: '☁️ SuperInstance Connect',
    icon: '🌤️',
    content: `
      <p>If you have Cloudflare Workers, Scrapcraft can:
      • Save games to the cloud (D1)
      • Search recipes semantically (Vectorize)
      • Generate custom textures (Workers AI)
      • Race bots in real-time (Durable Objects)
      • Access unlocked SuperInstance features</p>
    `,
    render: 'cloudflare',
  },
  {
    id: 'tutorial',
    title: 'Quick Tutorial',
    icon: '🎮',
    render: 'tutorial',
    steps: [
      'Move with WASD — explore the yard',
      'Hold left-click to mine scrap',
      'Press [E] to open the Workshop',
    ],
  },
  {
    id: 'ready',
    title: "You're Ready!",
    icon: '🚀',
    content: `
      <p>Talk to Big Earl by pressing [F] when you're inside the game.</p>
      <p>Press [H] anytime for controls. Let's get to work!</p>
    `,
  },
];

export class OnboardingWizard {
  constructor(game) {
    this.game = game;
    this.el = null;
    this.currentStep = 0;
    this.tutorialSubStep = 0; // 0=wasd, 1=mine, 2=workshop
    this.config = {
      aiProvider: null,
      apiKey: null,
      cfWorkerUrl: null,
      tutorialComplete: false,
    };
    this._onKeyDown = null;
    this._onMineCheck = null;
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

  /** Load saved config */
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
          <h2 class="ow-title" id="ow-title">Welcome to the Scrapyard!</h2>
        </div>
        <div class="ow-body" id="ow-body"></div>
        <div class="ow-dots" id="ow-dots"></div>
        <div class="ow-nav">
          <button class="ow-btn ow-btn-back" id="ow-back" disabled>← Back</button>
          <button class="ow-btn ow-btn-skip" id="ow-skip">Skip Setup →</button>
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

    // Disable next on cloudflare step if connection test failed
    if (step.id === 'cloudflare_connect' && this._cfTestResult === 'failed') {
      next.disabled = true;
    } else {
      next.disabled = false;
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

      switch (step.render) {
        case 'ai_setup':
          bodyEl.innerHTML = this._renderAiSetup();
          break;
        case 'cloudflare':
          bodyEl.innerHTML = this._renderCloudflare();
          break;
        case 'tutorial':
          bodyEl.innerHTML = this._renderTutorial();
          break;
        default:
          bodyEl.innerHTML = `<div class="ow-content">${step.content ?? ''}</div>`;
          break;
      }

      this._updateNav();

      // Bind UI elements after render
      this._bindUi();

      // Fade in
      requestAnimationFrame(() => {
        bodyEl.style.opacity = '1';
        bodyEl.style.transform = 'translateX(0)';
        bodyEl.classList.add('ow-body-in');
      });

      this._updateDots();
    }, 150);
  }

  // ── AI Setup Render ───────────────────────────────────────────────────

  _renderAiSetup() {
    const selected = this.config.aiProvider;
    return `
      <div class="ow-content">
        <div class="ow-provider-grid">
          ${PROVIDERS.map(p => `
            <div class="ow-provider-card${p.id === selected ? ' selected' : ''}" data-provider="${p.id}">
              <span class="ow-provider-icon">${p.icon}</span>
              <div class="ow-provider-info">
                <div class="ow-provider-name">${p.name}</div>
                <div class="ow-provider-desc">${p.description}</div>
              </div>
              <span class="ow-provider-tier ow-tier-${p.tier}">${p.tier}</span>
            </div>
          `).join('')}
        </div>
        <div class="ow-api-key-area" id="ow-api-key-area" style="${selected && selected !== 'offline' && selected !== 'workers_ai' ? 'display:block' : 'display:none'}">
          <label class="ow-label">API Key</label>
          <div class="ow-key-input-wrap">
            <input type="password" class="ow-key-input" id="ow-api-key" spellcheck="false"
              value="${this._escapeHtml(this.config.apiKey ?? '')}"
              placeholder="${this._getKeyHint(selected)}" />
            <button class="ow-eye-btn" id="ow-eye-btn" title="Show/Hide key">👁️</button>
          </div>
          <div class="ow-key-status" id="ow-key-status"></div>
        </div>
        <p class="ow-hint">💡 Your key stays in your browser. It's never sent anywhere except to the AI provider you pick.</p>
      </div>
    `;
  }

  _getKeyHint(providerId) {
    const p = PROVIDERS.find(x => x.id === providerId);
    return p?.keyHint ?? 'Paste your API key here...';
  }

  // ── Cloudflare Render ────────────────────────────────────────────────

  _renderCloudflare() {
    return `
      <div class="ow-content">
        <div class="ow-cf-form">
          <label class="ow-label">Cloudflare Worker URL</label>
          <div class="ow-cf-input-wrap">
            <input type="url" class="ow-cf-input" id="ow-cf-url" spellcheck="false"
              value="${this._escapeHtml(this.config.cfWorkerUrl ?? '')}"
              placeholder="https://scrapcraft-gateway.my-username.workers.dev" />
            <button class="ow-btn ow-btn-test" id="ow-cf-test">Test</button>
          </div>
          <div class="ow-cf-status" id="ow-cf-status">
            <span class="ow-cf-status-icon">⏹️</span>
            <span class="ow-cf-status-text">Not connected</span>
          </div>
        </div>
        <p class="ow-hint">🔧 No Cloudflare account? Skip this step. Everything still works offline.</p>
      </div>
    `;
  }

  // ── Tutorial Render ──────────────────────────────────────────────────

  _renderTutorial() {
    const steps = STEPS[this.currentStep].steps;
    return `
      <div class="ow-content ow-tutorial">
        <div class="ow-tut-steps">
          ${steps.map((s, i) => `
            <div class="ow-tut-step${i === this.tutorialSubStep ? ' active' : ''}${i < this.tutorialSubStep ? ' done' : ''}" data-step="${i}">
              <span class="ow-tut-check">${i < this.tutorialSubStep ? '✓' : i === this.tutorialSubStep ? '▶' : '○'}</span>
              <span class="ow-tut-text">${s}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ── UI Bindings ──────────────────────────────────────────────────────

  _bindUi() {
    const step = STEPS[this.currentStep];
    if (step.id === 'ai_setup') this._bindAiSetup();
    if (step.id === 'cloudflare_connect') this._bindCloudflare();
    if (step.id === 'tutorial') this._bindTutorial();
  }

  _bindAiSetup() {
    const cards = this.el.querySelectorAll('.ow-provider-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        cards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const providerId = card.dataset.provider;
        this.config.aiProvider = providerId;

        const apiArea = document.getElementById('ow-api-key-area');
        if (providerId === 'offline' || providerId === 'workers_ai') {
          apiArea.style.display = 'none';
          this.config.apiKey = null;
          this.el.querySelector('#ow-next').disabled = false;
        } else {
          apiArea.style.display = 'block';
          const input = document.getElementById('ow-api-key');
          input.placeholder = this._getKeyHint(providerId);
          this.el.querySelector('#ow-next').disabled = !input.value.trim();
        }
      });
    });

    const keyInput = document.getElementById('ow-api-key');
    if (keyInput) {
      keyInput.addEventListener('input', () => {
        this.config.apiKey = keyInput.value.trim();
        if (this.config.aiProvider) {
          this.el.querySelector('#ow-next').disabled = !this.config.apiKey;
        }
      });

      const eyeBtn = document.getElementById('ow-eye-btn');
      if (eyeBtn) {
        eyeBtn.addEventListener('click', () => {
          const isPassword = keyInput.type === 'password';
          keyInput.type = isPassword ? 'text' : 'password';
          eyeBtn.textContent = isPassword ? '🙈' : '👁️';
        });
      }
    }
  }

  _bindCloudflare() {
    const urlInput = document.getElementById('ow-cf-url');
    const testBtn = document.getElementById('ow-cf-test');
    const statusEl = document.getElementById('ow-cf-status');
    const nextBtn = this.el.querySelector('#ow-next');

    const setStatus = (icon, text, ok) => {
      statusEl.innerHTML = `<span class="ow-cf-status-icon">${icon}</span><span class="ow-cf-status-text">${text}</span>`;
      this._cfTestResult = ok ? 'ok' : text.includes('Failed') ? 'failed' : 'pending';
      if (this._cfTestResult === 'failed') {
        nextBtn.disabled = true;
      } else {
        nextBtn.disabled = false;
      }
    };

    if (!urlInput.value.trim()) {
      setStatus('⏹️', 'Not connected', false);
    }

    testBtn.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      if (!url) {
        setStatus('⚠️', 'Enter a URL first', false);
        return;
      }
      this.config.cfWorkerUrl = url;
      setStatus('⏳', 'Testing connection...', false);

      try {
        const resp = await fetch(url + '/health', { method: 'GET', signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
          setStatus('✅', 'Connected! Worker is online.', true);
          // Try to get available providers
          try {
            const data = await resp.json();
            if (data?.bindings) {
              this._cfBindings = data.bindings;
            }
          } catch (_) { /* ignore */ }
        } else {
          setStatus('⚠️', `Responded with HTTP ${resp.status}`, false);
        }
      } catch (err) {
        setStatus('❌', `Failed: ${err.message ?? 'Could not reach URL'}`, false);
      }
    });
  }

  _bindTutorial() {
    // Clean up previous listeners
    this._cleanupTutorialListeners();

    // Step 0: detect WASD
    this._onKeyDown = (e) => {
      if (this.tutorialSubStep === 0 && /^(Key[WASD])$/.test(e.code)) {
        this._advanceTutorialSubStep();
      }
    };
    document.addEventListener('keydown', this._onKeyDown);

    // Step 1: detect mining (we check in a polling loop)
    this._onMineCheck = setInterval(() => {
      if (this.tutorialSubStep === 1 && this.game?._mineProgress > 0.8) {
        this._advanceTutorialSubStep();
      }
    }, 300);

    // Step 2: detect workshop open
    this._onWorkshopCheck = () => {
      if (this.tutorialSubStep === 2 && this.game?.ui?.isOpen) {
        this._advanceTutorialSubStep();
      }
    };
    // Hook into the game's workshop open

    // Intercept UI.openInventory for step 2 advancement
    this._origOpenInventory = this.game?.ui?.openInventory;
    if (this.game?.ui && this._origOpenInventory) {
      this.game.ui.openInventory = (...args) => {
        this._origOpenInventory.apply(this.game.ui, args);
        this._onWorkshopCheck();
      };
    }
  }

  _advanceTutorialSubStep() {
    const steps = STEPS[this.currentStep].steps;
    if (this.tutorialSubStep < steps.length - 1) {
      this.tutorialSubStep++;
      this.config.tutorialComplete = false;
      // Re-render the tutorial display
      const bodyEl = document.getElementById('ow-body');
      if (bodyEl) {
        const tutSteps = bodyEl.querySelectorAll('.ow-tut-step');
        tutSteps.forEach((s, i) => {
          s.classList.toggle('active', i === this.tutorialSubStep);
          s.classList.toggle('done', i < this.tutorialSubStep);
          s.querySelector('.ow-tut-check').textContent =
            i < this.tutorialSubStep ? '✓' : i === this.tutorialSubStep ? '▶' : '○';
        });
      }
    } else {
      // All tutorial steps done
      this.config.tutorialComplete = true;
      this._cleanupTutorialListeners();
      this._nextStep();
    }
  }

  _cleanupTutorialListeners() {
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._onMineCheck) {
      clearInterval(this._onMineCheck);
      this._onMineCheck = null;
    }
    if (this._origOpenInventory && this.game?.ui) {
      this.game.ui.openInventory = this._origOpenInventory;
      this._origOpenInventory = null;
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────

  _nextStep() {
    if (this.currentStep < STEPS.length - 1) {
      this.currentStep++;
      // Reset tutorial sub-step when entering the tutorial step
      if (STEPS[this.currentStep].id === 'tutorial') {
        this.tutorialSubStep = 0;
      }
      this.renderStep();
    } else {
      this.finish();
    }
  }

  _prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this._cleanupTutorialListeners();
      this.renderStep();
    }
  }

  // ── Finish ─────────────────────────────────────────────────────────

  /** Save config and dismiss wizard */
  finish() {
    this._cleanupTutorialListeners();
    this.markComplete();

    // Animate out
    if (this.el) {
      this.el.classList.remove('ow-visible');
      setTimeout(() => {
        this.el?.remove();
        this.el = null;
        // Start the guided tutorial in-game
        this.game._startTutorial?.();
        // If the pointer wasn't locked, lock it now
        if (!document.pointerLockElement) {
          this.game.canvas?.requestPointerLock();
        }
      }, 300);
    }
  }

  // ── Utility ─────────────────────────────────────────────────────────

  _escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── CSS (injected once) ─────────────────────────────────────────────

  _css() {
    return `
/* ── Onboarding Wizard — first-run overlay ── */
.ow-overlay {
  position: fixed; inset: 0;
  background: rgba(4, 4, 4, 0.92);
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

/* ── Provider Grid ── */
.ow-provider-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin: 12px 0;
}
.ow-provider-card {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #0a0a0a;
  border: 1px solid #222;
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.12s ease;
  position: relative;
}
.ow-provider-card:hover {
  border-color: #444;
  background: #111;
}
.ow-provider-card.selected {
  border-color: #f0b429;
  background: #1a1508;
  box-shadow: 0 0 10px rgba(240,180,41,0.1);
}
.ow-provider-icon {
  font-size: 20px;
  flex-shrink: 0;
}
.ow-provider-info {
  flex: 1;
  min-width: 0;
}
.ow-provider-name {
  font-size: 11px;
  color: #ddd;
  font-weight: bold;
  letter-spacing: 0.3px;
}
.ow-provider-desc {
  font-size: 9px;
  color: #555;
  line-height: 1.3;
  margin-top: 2px;
}
.ow-provider-tier {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 7px;
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.ow-tier-premium {
  background: #1a0a20;
  color: #bb66ff;
  border: 1px solid #2a1040;
}
.ow-tier-budget {
  background: #0a1a20;
  color: #44ccdd;
  border: 1px solid #0a3040;
}
.ow-tier-free {
  background: #0a1a0a;
  color: #44cc66;
  border: 1px solid #0a2a10;
}

/* ── API Key Input ── */
.ow-api-key-area {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #1a1a1a;
}
.ow-label {
  font-size: 10px;
  color: #777;
  letter-spacing: 1px;
  display: block;
  margin-bottom: 6px;
  text-transform: uppercase;
}
.ow-key-input-wrap {
  display: flex;
  gap: 4px;
}
.ow-key-input {
  flex: 1;
  background: #080808;
  border: 1px solid #2a2a2a;
  border-radius: 5px;
  color: #ccc;
  padding: 8px 10px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  outline: none;
  letter-spacing: 0.5px;
}
.ow-key-input:focus {
  border-color: #f0b42966;
}
.ow-key-input::placeholder {
  color: #333;
}
.ow-eye-btn {
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  border-radius: 5px;
  color: #666;
  cursor: pointer;
  padding: 0 10px;
  font-size: 14px;
  transition: color 0.1s;
}
.ow-eye-btn:hover {
  color: #f0b429;
}
.ow-key-status {
  font-size: 10px;
  color: #666;
  margin-top: 4px;
  min-height: 14px;
}

/* ── Cloudflare Form ── */
.ow-cf-form {
  margin: 12px 0;
}
.ow-cf-input-wrap {
  display: flex;
  gap: 6px;
}
.ow-cf-input {
  flex: 1;
  background: #080808;
  border: 1px solid #2a2a2a;
  border-radius: 5px;
  color: #ccc;
  padding: 8px 10px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  outline: none;
}
.ow-cf-input:focus {
  border-color: #f0b42966;
}
.ow-cf-input::placeholder {
  color: #333;
}
.ow-btn-test {
  background: #0a1a10;
  border: 1px solid #1a3a1a;
  border-radius: 5px;
  color: #44cc66;
  padding: 8px 14px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  cursor: pointer;
  letter-spacing: 1px;
  white-space: nowrap;
  transition: all 0.12s;
}
.ow-btn-test:hover {
  background: #0c2a14;
  border-color: #44cc66;
}
.ow-cf-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 11px;
  color: #888;
}
.ow-cf-status-icon {
  font-size: 14px;
}

/* ── Tutorial Steps ── */
.ow-tut-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 14px 0;
}
.ow-tut-step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #0a0a0a;
  border: 1px solid #1a1a1a;
  border-radius: 8px;
  font-size: 12px;
  color: #555;
  transition: all 0.2s ease;
}
.ow-tut-step.active {
  border-color: #f0b429;
  color: #f0f0f0;
  background: #141008;
}
.ow-tut-step.done {
  border-color: #1a3a1a;
  color: #6a6a6a;
}
.ow-tut-check {
  font-size: 14px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}
.ow-tut-step.active .ow-tut-check {
  color: #f0b429;
}
.ow-tut-step.done .ow-tut-check {
  color: #44cc66;
}

/* ── Hints ── */
.ow-hint {
  font-size: 10px !important;
  color: #555 !important;
  margin-top: 14px !important;
  font-style: italic;
  line-height: 1.5 !important;
}

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
  .ow-provider-grid { grid-template-columns: 1fr; }
}
`;
  }
}
