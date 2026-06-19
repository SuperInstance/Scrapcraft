import { Game } from './Game.js';

const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');

const game = new Game(canvas);
game.init();

startBtn.addEventListener('click', () => {
  startScreen.style.opacity = '0';
  startScreen.style.transition = 'opacity 0.6s';
  setTimeout(() => {
    startScreen.style.display = 'none';
    canvas.requestPointerLock();
    game.start();
  }, 600);
});
