import { maybePreGameHint } from './preGameHint.js';

const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');

// ── Workshop OOM hardening ─────────────────────────────────────────────────
// The heavy path (WebGL renderer, textures, 128×128 world mesh) used to build
// at page load, behind the start screen. On memory-fragile environments that
// alone could tip the tab over. Now the yard is built lazily — CLOCK IN is
// the "open" that spins up the renderer; the start screen itself is cheap DOM
// and loads with ZERO game JS: three.js and the whole engine sit behind a
// dynamic import inside boot().

// World seed — ?seed=42 overrides the default yard (1337). Anything that
// parses as an integer works; garbage falls back to the default.
function seedFromURL() {
  try {
    const raw = new URLSearchParams(window.location.search).get('seed');
    if (raw === null || raw === '') return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  } catch { return undefined; }
}

let game = null;   // built lazily in boot() — null until CLOCK IN succeeds

let booted = false;

// Standalone toast — works before the game (and its UI) exist.
let _toastTimer = null;
function showPreGameToast(msg) {
  let el = document.getElementById('pregame-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pregame-toast';
    el.style.cssText = `
      position:fixed; bottom:72px; left:50%; transform:translateX(-50%) translateY(8px);
      background:rgba(8,12,8,0.95); border:1px solid #f0b429; border-radius:8px;
      padding:10px 18px; color:#ffd970; font-family:'Courier New',monospace; font-size:12px;
      letter-spacing:0.5px; z-index:2000; opacity:0; transition:opacity .25s, transform .25s;
      pointer-events:none; box-shadow:0 4px 24px rgba(240,180,40,0.25);`;
    document.body.appendChild(el);
  }
  el.innerHTML = msg;
  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 4500);
}

// Boot status line — the loading affordance under CLOCK IN. Created on
// demand so the start screen ships no extra markup.
function bootProgress() {
  let el = document.getElementById('boot-progress');
  if (!el) {
    el = document.createElement('div');
    el.id = 'boot-progress';
    el.style.cssText = `
      margin-top:18px; min-height:16px; color:#ffd970;
      font-family:'Courier New',monospace; font-size:12px; letter-spacing:2px;`;
    startBtn.after(el);
  }
  return el;
}

// Two rAFs guarantee the browser actually painted the status text before we
// block the main thread with the synchronous world build.
const nextPaint = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

// E / T / F are advertised on the boot HUD but do nothing until the game
// exists. Answer the dead keypress with a toast, once per session.
// (sessionStorage can throw in locked-down browsers — fall back to memory.)
const _hintMem = { v: null };
const hintStore = {
  get: () => { try { return sessionStorage.getItem('scrapcraft_pregame_hint_shown'); } catch { return _hintMem.v; } },
  set: v => { try { sessionStorage.setItem('scrapcraft_pregame_hint_shown', v); } catch { _hintMem.v = v; } },
};
document.addEventListener('keydown', e => {
  if (booted) return;
  const msg = maybePreGameHint({
    code: e.code,
    booted: false,
    getSession: hintStore.get,
    setSession: hintStore.set,
  });
  if (msg) showPreGameToast(msg);
});

startBtn.addEventListener('click', () => {
  boot();   // boot() owns the splash fade — it shows loading progress first
});

function fadeStartScreen() {
  startScreen.style.opacity = '0';
  startScreen.style.transition = 'opacity 0.6s';
  // Remove the splash from the layout after the fade — an invisible full-screen
  // overlay at z-index:1000 otherwise eats every click/keypress post-boot (P0).
  setTimeout(() => { startScreen.style.display = 'none'; }, 700);
}

async function boot() {
  if (booted) return;   // double-click CLOCK IN must not double-boot (duplicate loops)
  booted = true;
  startBtn.disabled = true;

  const progress = bootProgress();
  progress.textContent = 'LOADING THE YARD…';
  await nextPaint();

  try {
    const { Game } = await import('./Game.js');

    progress.textContent = 'BUILDING THE YARD…';
    await nextPaint();   // let the paint land before the synchronous game.init()

    game = new Game(canvas, { seed: seedFromURL() });
    game.init();
    // Wire game reference so CraftingSystem can call back
    game.craftingSystem.setGame(game);

    // Load shared blueprint from URL param ?brain=<shareCode> — the module
    // only comes over the wire when the param actually exists.
    const brainParam = new URLSearchParams(location.search).get('brain');
    if (brainParam) {
      try {
        const { TileProgram } = await import('./maker/TileProgram.js');
        const prog = TileProgram.fromShareCode(brainParam);
        game.tileEditor.loadProgram(prog);
        // Strip the param from the URL without a reload so sharing again gives a clean link
        history.replaceState(null, '', location.pathname);
      } catch (e) {
        console.warn('[main] Bad ?brain= param, ignoring.', e);
      }
    }

    game.start();
    // Pointer lock is a desktop affordance — touch devices run the virtual
    // joystick layer instead (game._touchMode), where requestPointerLock
    // would only throw/reject.
    if (!game._touchMode && !game.openingPending) {
      // Chrome returns a Promise that can reject if the click's user-gesture
      // activation expired during the dynamic import — the pause overlay's
      // click-to-resume is the safety net, so just swallow it.
      try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* older browsers return undefined */ }
    }
    if (brainParam) game.ui?.notify('🔗 Shared brain loaded — open Maker Bench to run it!');

    fadeStartScreen();
  } catch (e) {
    console.error('[main] Boot failed', e);
    booted = false;               // allow a retry without a reload
    startBtn.disabled = false;
    progress.textContent = '⚠️ Boot failed — refresh to try again.';
  }
}

startBtn.addEventListener('click', () => { boot(); });

// Codex button → open Workshop overlay on the codex tab (post-boot only)
document.getElementById('codex-btn')?.addEventListener('click', () => {
  if (!booted || !game?.ui) return;
  game.ui.openInventory('any');
  // Switch to codex tab
  setTimeout(() => document.querySelector('[data-tab="codex"]')?.click(), 50);
});
