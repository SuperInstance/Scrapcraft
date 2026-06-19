import { Game } from './Game.js';

const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');

const game = new Game(canvas);
game.init();
// Wire game reference so CraftingSystem can call back
game.craftingSystem.setGame(game);

startBtn.addEventListener('click', () => {
  startScreen.style.opacity = '0';
  startScreen.style.transition = 'opacity 0.6s';
  setTimeout(() => {
    startScreen.style.display = 'none';
    canvas.requestPointerLock();
    game.start();
  }, 600);
});

// Codex button → open Workshop overlay on the codex tab
document.getElementById('codex-btn')?.addEventListener('click', () => {
  game.ui.openInventory('any');
  // Switch to codex tab
  setTimeout(() => document.querySelector('[data-tab="codex"]')?.click(), 50);
});
