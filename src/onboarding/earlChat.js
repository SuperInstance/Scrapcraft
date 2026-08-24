/**
 * ───────────────────────────────────────────────────────────────────────────
 *  EARL CHAT  —  talk to Big Earl without a browser prompt() (finding #4a)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The dry-run's worst break was F → a raw JS `prompt('Talk to Big Earl:')` —
 * a native modal that read as an error, hard-blocked the session, and could
 * not be dismissed (the automated driver had to restart the browser). This
 * replaces it with an in-fiction chat input panel in the same style the game
 * already uses (ClassRoom modal): a small card, a labelled input, Ask/Enter
 * to send, Esc/✕ to cancel. prompt() stays as an absolute last-resort fallback
 * for ancient runtimes, but never by default.
 *
 * Contract: entirely fail-soft + headless. No DOM → this module no-ops and
 * the caller falls back to prompt(). No shared global CSS requirement (we
 * inject a scoped <style>, exactly like ClassRoom._css does). One input, one
 * button, plain text — COPPA clean, no PII storage.
 *
 * Usage (from Game.js F handler):
 *   const msg = await openEarlChat({
 *     title: 'Talk to Big Earl:',
 *     placeholder: 'Want to ask Earl something?',
 *     fallback: () => prompt('Talk to Big Earl:') ?? '',
 *   });
 *   if (msg != null) { if (msg) foreman.playerTalks(msg); else foreman.say('idle'); }
 */

const STYLE_ID = 'earl-chat-style';

/** Open the Earl chat panel. Resolves with the typed message (string) on
 *  send, or null when cancelled/Escaped. Fails closed to the injected
 *  `fallback` (a prompt() wrapper) when DOM is unavailable.
 *  @param {object} opts
 *  @returns {Promise<string|null>}
 */
export async function openEarlChat({
  title = 'Talk to Big Earl:',
  placeholder = "Ask Earl about the yard, the jobs, the bots…",
  promptLabel = 'ASK',
  fallback = null,
} = {}) {
  if (typeof document === 'undefined' || !document.body) return fallback ? fallback() : null;
  try {
    return await new Promise(resolve => {
      injectStyle();

      const overlay = document.createElement('div');
      overlay.id = 'earl-chat';
      overlay.innerHTML = `
        <div class="ec-card">
          <div class="ec-head">
            <span class="ec-icon">🧔</span>
            <div>
              <div class="ec-title">BIG EARL</div>
              <div class="ec-sub">${title.replace(/</g, '&lt;')}</div>
            </div>
            <button class="ec-x" id="ec-close" aria-label="close">✕</button>
          </div>
          <div class="ec-body">
            <input id="ec-input" class="ec-input" type="text"
                   placeholder="${String(placeholder).replace(/"/g, '&quot;')}"
                   autocomplete="off" spellcheck="false" maxlength="120" />
            <div class="ec-hint">Enter to send · Esc to close</div>
            <div class="ec-actions">
              <button class="ec-btn ec-btn-ask" id="ec-ask">${promptLabel} →</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));

      const input = overlay.querySelector('#ec-input');
      const close = overlay.querySelector('#ec-close');
      const ask   = overlay.querySelector('#ec-ask');

      const done = (val) => {
        overlay.classList.remove('show');
        document.removeEventListener('keydown', onKey, true);
        // fade before removing so the transition reads as polish, not a blink
        setTimeout(() => { overlay.remove(); }, 180);
        resolve(val);
      };
      const submit = () => {
        const v = (input?.value ?? '').trim();
        done(v);   // empty string is a valid "say idle" signal
      };
      const cancel = () => done(null);
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
        else if (e.key === 'Enter') { e.preventDefault(); submit(); }
      };

      close?.addEventListener('click', cancel);
      ask?.addEventListener('click', submit);
      document.addEventListener('keydown', onKey, true);
      setTimeout(() => input?.focus(), 200);   // pointer-lock games need a beat
    });
  } catch {
    return fallback ? fallback() : null;
  }
}

/** Inject the scoped stylesheet once (ClassRoom-style, under #earl-chat). */
export function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    #earl-chat {
      position:fixed; inset:0; background:rgba(8,6,3,0.55);
      display:flex; align-items:center; justify-content:center;
      z-index:220; opacity:0; visibility:hidden;
      transition:opacity 0.2s ease, visibility 0.2s ease;
      font-family:'Courier New', monospace;
    }
    #earl-chat.show { opacity:1; visibility:visible; }
    .ec-card {
      background:#17120a; border:2px solid #6b5a33; border-radius:12px;
      width:420px; max-width:95vw;
      box-shadow:0 0 40px rgba(240,180,41,0.15), 0 8px 40px rgba(0,0,0,0.8);
    }
    .ec-head {
      display:flex; align-items:center; gap:10px;
      padding:14px 16px 12px; border-bottom:1px solid #3a2a0a;
      background:#1d160c; border-radius:10px 10px 0 0;
    }
    .ec-icon { font-size:20px; }
    .ec-title { font-size:13px; color:#ffd97a; letter-spacing:2px; font-weight:bold; }
    .ec-sub  { font-size:10px; color:#a08a55; letter-spacing:0.5px; margin-top:2px; }
    .ec-x    { background:none; border:none; color:#a08a55; cursor:pointer; font-size:16px; padding:2px 6px; margin-left:auto; }
    .ec-x:hover { color:#ffd97a; }
    .ec-body { padding:16px; }
    .ec-input {
      width:100%; background:#0b0906; border:1px solid #4a3a1a; border-radius:6px;
      padding:11px 13px; color:#f0ddb0;
      font-family:inherit; font-size:14px; outline:none;
      transition:border-color 0.15s;
    }
    .ec-input:focus { border-color:#f0b429; }
    .ec-hint { font-size:9px; color:#6a5a35; letter-spacing:1px; margin:6px 2px 0; }
    .ec-actions { margin-top:14px; }
    .ec-btn {
      width:100%; padding:11px; border-radius:6px; cursor:pointer;
      font-family:inherit; font-size:11px; letter-spacing:1px;
      transition:filter 0.15s;
    }
    .ec-btn:hover { filter:brightness(1.2); }
    .ec-btn-ask { background:#3a2a0a; border:2px solid #f0b429; color:#ffd97a; font-weight:bold; }
  `;
  document.head.appendChild(s);
}
