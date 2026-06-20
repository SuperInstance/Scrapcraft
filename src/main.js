import { Game } from './Game.js';
import { TileProgram } from './maker/TileProgram.js';

const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');

const game = new Game(canvas);
game.init();
// Wire game reference so CraftingSystem can call back
game.craftingSystem.setGame(game);

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

startBtn.addEventListener('click', () => {
  startScreen.style.opacity = '0';
  startScreen.style.transition = 'opacity 0.6s';
  setTimeout(() => {
    startScreen.style.display = 'none';
    canvas.requestPointerLock();
    game.start();
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
