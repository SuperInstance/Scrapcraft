import { Game } from './Game.js';
import { TileProgram } from './maker/TileProgram.js';

const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');

/** Show a friendly full-screen fallback instead of a silent white screen. */
function showFatalError(err) {
  // eslint-disable-next-line no-console
  console.error('[Scrapcraft] Fatal startup error:', err);
  const webglOk = (() => {
    try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; }
  })();
  const hint = webglOk
    ? "Try reloading the page. If it keeps happening, your save data may be corrupt — you can reset it below."
    : "This game needs WebGL, which looks disabled or unavailable in this browser. Try a recent Chrome, Edge, Firefox, or Safari with hardware acceleration on.";
  const el = document.createElement('div');
  el.setAttribute('role', 'alert');
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;'
    + 'align-items:center;justify-content:center;gap:16px;background:#0a0a0a;color:#f0b429;'
    + "font-family:'Courier New',monospace;text-align:center;padding:24px;";
  el.innerHTML =
    '<div style="font-size:34px;letter-spacing:6px;font-weight:bold;">SCRAPCRAFT</div>'
    + '<div style="font-size:15px;color:#e0e0e0;max-width:520px;line-height:1.6;">'
    + "Big Earl scratches his head. The yard didn't boot up right.</div>"
    + `<div style="font-size:12px;color:#9a8a6a;max-width:520px;line-height:1.6;">${hint}</div>`
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">'
    + '<button id="fatal-reload" style="background:#f0b429;color:#111;border:0;padding:9px 18px;'
    + "border-radius:5px;font-family:inherit;font-weight:bold;cursor:pointer;letter-spacing:1px;\">RELOAD</button>"
    + '<button id="fatal-reset" style="background:#1a1a1a;color:#e0a08f;border:1px solid #3a1a1a;'
    + "padding:9px 18px;border-radius:5px;font-family:inherit;cursor:pointer;letter-spacing:1px;\">RESET SAVE &amp; RELOAD</button>"
    + '</div>';
  document.body.appendChild(el);
  el.querySelector('#fatal-reload')?.addEventListener('click', () => location.reload());
  el.querySelector('#fatal-reset')?.addEventListener('click', () => {
    try { localStorage.clear(); } catch { /* storage blocked — nothing to clear */ }
    location.reload();
  });
}

let game = null;
let booted = false;

try {
  game = new Game(canvas);
  game.init();
  // Wire game reference so CraftingSystem can call back
  game.craftingSystem.setGame(game);
  booted = true;
} catch (err) {
  showFatalError(err);
}

// A boot-time error thrown asynchronously (e.g. first render frame) still lands
// on a friendly screen rather than a blank canvas. Once the player has clicked
// into the game we stop hijacking errors so gameplay hiccups stay non-fatal.
window.addEventListener('error', (e) => { if (!booted) showFatalError(e.error || e.message); });

if (booted) {
  // Load shared blueprint from URL param ?brain=<shareCode>
  const _brainParam = new URLSearchParams(location.search).get('brain');
  if (_brainParam) {
    try {
      const prog = TileProgram.fromShareCode(_brainParam);
      game.tileEditor.loadProgram(prog);
      // Strip the param from the URL without a reload so sharing again gives a clean link
      history.replaceState(null, '', location.pathname);
    } catch (e) {
      console.warn('[main] Bad ?brain= param, ignoring.', e);
    }
  }

  startBtn?.addEventListener('click', () => {
    startScreen.style.opacity = '0';
    startScreen.style.transition = 'opacity 0.6s';
    setTimeout(() => {
      startScreen.style.display = 'none';
      canvas.requestPointerLock();
      try {
        game.start();
      } catch (e) {
        showFatalError(e);
        return;
      }
      // If a shared brain was loaded, tell the player
      if (_brainParam) game.ui?.notify('🔗 Shared brain loaded — open Maker Bench to run it!');
    }, 600);
  });

  // Codex button → open Workshop overlay on the codex tab
  document.getElementById('codex-btn')?.addEventListener('click', () => {
    game.ui.openInventory('any');
    // Switch to codex tab
    setTimeout(() => document.querySelector('[data-tab="codex"]')?.click(), 50);
  });
}
