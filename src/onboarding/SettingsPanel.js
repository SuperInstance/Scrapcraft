/**
 * SettingsPanel — Settings → Advanced (post-spawn, optional).
 *
 * The old onboarding wizard's AI-engine and Cloudflare steps live here now.
 * Spark works OFFLINE by default; entering a key here upgrades Spark (and
 * Earl's chat) live — no restart. Opened from the [H]elp overlay's gear
 * button (and anywhere else the game wants to).
 *
 * Headless-friendly: open() is DOM work, but config round-trips go through
 * ./config.js so tests can prove the settings surface holds AI/CF config.
 */

import { PROVIDERS } from './ProviderList.js';
import { loadConfig, saveConfig, hasLiveAI, announceConfigChange } from './config.js';

export class SettingsPanel {
  constructor(game) {
    this.game = game;
    this.el = null;
  }

  /** Current config snapshot (test seam + render seed). */
  get config() { return loadConfig(); }

  open() {
    if (this.el) { this.close(); return; }   // toggle, not stack

    this._injectCss();
    const cfg = loadConfig();

    this.el = document.createElement('div');
    this.el.id = 'sc-settings-overlay';
    this.el.innerHTML = `
      <div class="set-card">
        <div class="set-header">
          <span class="set-icon">⚙️</span>
          <h2>Advanced</h2>
          <button class="set-close" id="set-close">✕</button>
        </div>
        <div class="set-body">
          <p class="set-intro">Spark works great offline — no connection needed. Adding an AI
          key is <b>optional</b> and takes seconds. When you add one, Spark upgrades live.
          No restart. No fuss.</p>

          <h3 class="set-section">🧠 AI Engine (optional)</h3>
          <div class="set-provider-grid">
            ${PROVIDERS.map(p => `
              <div class="set-provider-card${p.id === cfg.aiProvider ? ' selected' : ''}" data-provider="${p.id}">
                <span class="set-provider-icon">${p.icon}</span>
                <div class="set-provider-info">
                  <div class="set-provider-name">${p.name}</div>
                  <div class="set-provider-desc">${p.description}</div>
                </div>
                <span class="set-provider-tier set-tier-${p.tier}">${p.tier}</span>
              </div>
            `).join('')}
            <div class="set-provider-card${(!cfg.aiProvider || cfg.aiProvider === 'offline') ? ' selected' : ''}" data-provider="offline">
              <span class="set-provider-icon">🔋</span>
              <div class="set-provider-info">
                <div class="set-provider-name">Offline (default)</div>
                <div class="set-provider-desc">18+ offline recipes. Always works.</div>
              </div>
              <span class="set-provider-tier set-tier-free">free</span>
            </div>
          </div>
          <div class="set-key-area" id="set-key-area" style="display:${cfg.apiKey && cfg.aiProvider !== 'offline' ? 'block' : 'none'}">
            <label class="set-label">API Key</label>
            <div class="set-key-wrap">
              <input type="password" class="set-key-input" id="set-api-key" spellcheck="false"
                value="${this._esc(cfg.apiKey ?? '')}" placeholder="Paste your API key here..." />
              <button class="set-eye" id="set-eye" title="Show/Hide key">👁️</button>
            </div>
            <div class="set-hint">💡 Your key stays in your browser — it only ever goes to the provider you pick.</div>
          </div>

          <h3 class="set-section">☁️ SuperInstance Connect (optional)</h3>
          <div class="set-cf-wrap">
            <input type="url" class="set-cf-input" id="set-cf-url" spellcheck="false"
              value="${this._esc(cfg.cfWorkerUrl ?? '')}"
              placeholder="https://scrapcraft-gateway.my-username.workers.dev" />
            <button class="set-btn set-btn-test" id="set-cf-test">Test</button>
          </div>
          <div class="set-cf-status" id="set-cf-status">⏹️ Not connected</div>

          <h3 class="set-section">🛰 Rift Telemetry (optional — off by default)</h3>
          <div class="set-uscp-wrap">
            <label class="set-uscp-toggle">
              <input type="checkbox" id="set-uscp-enabled" ${cfg.uscpEnabled ? 'checked' : ''} />
              <span>Share yard signals with the fleet quilt</span>
            </label>
            <div class="set-hint">📡 When on, the yard broadcasts tiny anonymous signals (blocks mined, builds,
            laps, quests) to the fleet's live quilt. <b>Nothing personal ever leaves</b> — no name, no
            chat text, no save data. Off by default; the game plays exactly the same either way.</div>
            <input type="url" class="set-cf-input" id="set-uscp-url" spellcheck="false"
              value="${this._esc(cfg.uscpEndpoint ?? '')}"
              placeholder="fleet quilt URL (blank = the fleet's public host)" />
          </div>

          <div class="set-footer">
            <button class="set-btn set-btn-save" id="set-save">Save</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);
    requestAnimationFrame(() => this.el.classList.add('set-visible'));

    this.el.querySelector('#set-close').addEventListener('click', () => this.close());
    this._bindProviders();
    this._bindCf();
    this.el.querySelector('#set-save').addEventListener('click', () => this._save());
  }

  close() {
    if (!this.el) return;
    this.el.classList.remove('set-visible');
    const el = this.el;
    setTimeout(() => el.remove(), 250);
    this.el = null;
  }

  get isOpen() { return !!this.el; }

  // ── bindings ────────────────────────────────────────────────────────────

  _bindProviders() {
    const cards = this.el.querySelectorAll('.set-provider-card');
    const keyArea = this.el.querySelector('#set-key-area');
    this._pendingProvider = null;
    cards.forEach(card => {
      card.addEventListener('click', () => {
        cards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const id = card.dataset.provider;
        this._pendingProvider = id;
        if (id === 'offline') {
          keyArea.style.display = 'none';
        } else {
          keyArea.style.display = 'block';
          const p = PROVIDERS.find(x => x.id === id);
          this.el.querySelector('#set-api-key').placeholder = p?.keyHint ?? 'Paste your API key here...';
        }
      });
    });
    const eye = this.el.querySelector('#set-eye');
    eye?.addEventListener('click', () => {
      const input = this.el.querySelector('#set-api-key');
      const pw = input.type === 'password';
      input.type = pw ? 'text' : 'password';
      eye.textContent = pw ? '🙈' : '👁️';
    });
  }

  _bindCf() {
    this.el.querySelector('#set-cf-test').addEventListener('click', async () => {
      const status = this.el.querySelector('#set-cf-status');
      const url = this.el.querySelector('#set-cf-url').value.trim();
      if (!url) { status.textContent = '⚠️ Enter a URL first'; return; }
      status.textContent = '⏳ Testing connection...';
      try {
        const resp = await fetch(url + '/health', { method: 'GET', signal: AbortSignal.timeout(5000) });
        status.textContent = resp.ok ? '✅ Connected! Worker is online.' : `⚠️ Responded with HTTP ${resp.status}`;
      } catch (err) {
        status.textContent = `❌ Failed: ${err.message ?? 'Could not reach URL'}`;
      }
    });
  }

  /** Persist the advanced config and hot-upgrade the yard's voices. */
  _save() {
    const provider = this._pendingProvider ?? this.config.aiProvider ?? 'offline';
    const apiKey = this.el.querySelector('#set-api-key')?.value.trim() || null;
    const cfWorkerUrl = this.el.querySelector('#set-cf-url')?.value.trim() || null;
    const uscpEnabled = this.el.querySelector('#set-uscp-enabled')?.checked ?? false;
    const uscpEndpoint = this.el.querySelector('#set-uscp-url')?.value.trim() || null;

    const merged = saveConfig({
      aiProvider: provider,
      apiKey: provider === 'offline' ? null : apiKey,
      cfWorkerUrl,
      uscpEnabled,
      uscpEndpoint,
    });

    // Live upgrade, no restart: Spark + Earl drop cached provider lookups.
    announceConfigChange();
    this.game?.onAdvancedConfigChanged?.(hasLiveAI(merged));

    this.game?.ui?.notify?.(
      hasLiveAI(merged)
        ? '⚡ Spark just woke up for real. No restart needed — ask away.'
        : "Spark's running offline. Building and learning work great like this — add a key anytime.",
    );
    this.close();
  }

  _esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _injectCss() {
    if (document.getElementById('sc-settings-style')) return;
    const style = document.createElement('style');
    style.id = 'sc-settings-style';
    style.textContent = `
#sc-settings-overlay {
  position: fixed; inset: 0; z-index: 2100;
  background: rgba(4,4,4,0.9);
  display: flex; align-items: center; justify-content: center;
  font-family: 'Courier New', monospace;
  opacity: 0; transition: opacity 0.25s ease;
}
#sc-settings-overlay.set-visible { opacity: 1; }
.set-card {
  background: #121212; border: 1px solid #2a2a2a; border-radius: 14px;
  max-width: 540px; width: 92%; max-height: 88vh; overflow-y: auto;
  padding: 24px 28px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(240,180,41,0.06);
}
.set-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
  padding-bottom: 10px; border-bottom: 1px solid #1e1e1e; }
.set-header h2 { font-size: 15px; color: #f0b429; letter-spacing: 1.5px; margin: 0; flex: 1; }
.set-close { background: none; border: 1px solid #333; color: #888; border-radius: 6px;
  cursor: pointer; padding: 4px 10px; }
.set-close:hover { color: #f0b429; border-color: #f0b429; }
.set-body p.set-intro { font-size: 11px; color: #888; line-height: 1.6; }
.set-section { font-size: 12px; color: #ddd; margin: 18px 0 8px; letter-spacing: 0.5px; }
.set-provider-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.set-provider-card { display: flex; align-items: center; gap: 8px; background: #0a0a0a;
  border: 1px solid #222; border-radius: 8px; padding: 9px; cursor: pointer;
  transition: all 0.12s ease; position: relative; }
.set-provider-card:hover { border-color: #444; }
.set-provider-card.selected { border-color: #f0b429; background: #1a1508; }
.set-provider-icon { font-size: 18px; }
.set-provider-name { font-size: 11px; color: #ddd; font-weight: bold; }
.set-provider-desc { font-size: 9px; color: #555; margin-top: 2px; }
.set-provider-tier { position: absolute; top: 4px; right: 4px; font-size: 7px;
  padding: 1px 5px; border-radius: 3px; text-transform: uppercase; }
.set-tier-premium { background: #1a0a20; color: #bb66ff; border: 1px solid #2a1040; }
.set-tier-budget { background: #0a1a20; color: #44ccdd; border: 1px solid #0a3040; }
.set-tier-free { background: #0a1a0a; color: #44cc66; border: 1px solid #0a2a10; }
.set-key-area { margin-top: 10px; padding-top: 10px; border-top: 1px solid #1a1a1a; }
.set-label { font-size: 10px; color: #777; letter-spacing: 1px; display: block; margin-bottom: 5px; }
.set-key-wrap { display: flex; gap: 4px; }
.set-key-input { flex: 1; background: #080808; border: 1px solid #2a2a2a; border-radius: 5px;
  color: #ccc; padding: 8px 10px; font-family: 'Courier New', monospace; font-size: 12px; }
.set-key-input:focus { border-color: #f0b42966; outline: none; }
.set-eye { background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 5px; color: #666;
  cursor: pointer; padding: 0 10px; }
.set-cf-wrap { display: flex; gap: 6px; }
.set-cf-input { flex: 1; background: #080808; border: 1px solid #2a2a2a; border-radius: 5px;
  color: #ccc; padding: 8px 10px; font-family: 'Courier New', monospace; font-size: 11px; }
.set-cf-input:focus { border-color: #f0b42966; outline: none; }
.set-cf-status { font-size: 11px; color: #888; margin-top: 8px; }
.set-hint { font-size: 10px; color: #555; font-style: italic; margin-top: 6px; }
.set-footer { display: flex; justify-content: flex-end; margin-top: 18px; gap: 8px; }
.set-btn { font-family: 'Courier New', monospace; font-size: 11px; border-radius: 6px;
  cursor: pointer; padding: 8px 16px; letter-spacing: 1px; }
.set-btn-test { background: #0a1a10; border: 1px solid #1a3a1a; color: #44cc66; }
.set-btn-test:hover { border-color: #44cc66; }
.set-btn-save { background: #f0b429; border: 1px solid #f0b429; color: #000; font-weight: bold; }
.set-btn-save:hover { background: #ffd060; }
@media (max-width: 540px) { .set-provider-grid { grid-template-columns: 1fr; } }
`;
    document.head.appendChild(style);
  }
}
