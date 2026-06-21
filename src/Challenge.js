import { B } from './data/blocks.js';
import { getItem } from './data/items.js';

// Pool of one-session challenges.  One is picked at random each session (and
// again 8 seconds after completion).  No persistence — fresh goal every time.
const POOL = [
  {
    type: 'collect', target: 'iron_scrap', need: 5,
    label: 'Salvage 5 Iron Scrap', icon: '🔩',
    reward: { xp: 50, item: 'copper_wire', qty: 2 },
  },
  {
    type: 'collect', target: 'rubber_chunk', need: 3,
    label: 'Collect 3 Rubber Chunks', icon: '⬛',
    reward: { xp: 40, item: 'battery_pack', qty: 1 },
  },
  {
    type: 'mine_block', target: B.CONCRETE, need: 8,
    label: 'Break 8 Concrete Blocks', icon: '🧱',
    reward: { xp: 60, item: 'iron_scrap', qty: 3 },
  },
  {
    type: 'mine_block', target: B.SCRAP_PILE, need: 6,
    label: 'Mine 6 Scrap Piles', icon: '📦',
    reward: { xp: 55, item: 'copper_wire', qty: 3 },
  },
  {
    type: 'craft', need: 2,
    label: 'Craft 2 Items at any station', icon: '🔧',
    reward: { xp: 50, item: 'circuit_board', qty: 1 },
  },
  {
    type: 'bot_run', need: 20,
    label: 'Run a bot program for 20 seconds', icon: '🤖',
    reward: { xp: 70, item: 'battery_pack', qty: 1 },
  },
  {
    type: 'collect', target: 'crystal_fragment', need: 2,
    label: 'Find 2 Crystal Fragments', icon: '💎',
    reward: { xp: 90, item: 'circuit_board', qty: 2 },
  },
  {
    type: 'collect', target: 'copper_wire', need: 4,
    label: 'Collect 4 Copper Wires', icon: '🪢',
    reward: { xp: 45, item: 'iron_scrap', qty: 3 },
  },
  {
    type: 'mine_block', target: B.RUST_METAL, need: 5,
    label: 'Salvage 5 Rusted Metal Sheets', icon: '🪤',
    reward: { xp: 55, item: 'iron_scrap', qty: 2 },
  },
  {
    type: 'craft', need: 3,
    label: 'Craft 3 Items at any station', icon: '⚙️',
    reward: { xp: 65, item: 'gear_small', qty: 2 },
  },
  {
    type: 'mine_block', target: B.OIL_DRUM, need: 4,
    label: 'Crack Open 4 Oil Drums', icon: '🛢️',
    reward: { xp: 60, item: 'fuel_can', qty: 2 },
  },
  {
    type: 'collect', target: 'gear_small', need: 3,
    label: 'Collect 3 Small Gears', icon: '⚙️',
    reward: { xp: 45, item: 'copper_wire', qty: 2 },
  },
];

export class Challenge {
  constructor(game) {
    this._game = game;
    this._current  = null;
    this._progress = 0;
    this._completed = false;
    this._cooldown  = 0;  // countdown before next challenge shows
    this._pick();
  }

  // ── Public event hooks (called by Game) ────────────────────────────────

  onMine(blockId) {
    if (this._completed || !this._current) return;
    if (this._current.type === 'mine_block' && this._current.target === blockId) {
      this._advance(1);
    }
  }

  onCollect(itemId) {
    if (this._completed || !this._current) return;
    if (this._current.type === 'collect' && this._current.target === itemId) {
      this._advance(1);
    }
  }

  onCraft() {
    if (this._completed || !this._current) return;
    if (this._current.type === 'craft') {
      this._advance(1);
    }
  }

  tick(dt) {
    if (this._completed) {
      this._cooldown -= dt;
      if (this._cooldown <= 0) this._pick();
      return;
    }
    if (!this._current) return;
    // Time-based: bot must be actively running
    if (this._current.type === 'bot_run') {
      const bots = [this._game.scrapBot, this._game.scrapBot2].filter(Boolean);
      const running = bots.some(b => b._brainMode && (b.battery ?? 100) > 0);
      if (running) this._advance(dt);
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────

  _pick() {
    this._current   = POOL[Math.floor(Math.random() * POOL.length)];
    this._progress  = 0;
    this._completed = false;
    this._cooldown  = 0;
    this._game.ui?.updateChallenge(this._current, 0, false);
    this._game.ui?.notify(`📋 Salvage Run: ${this._current.label}`);
  }

  _advance(amount) {
    this._progress = Math.min(this._current.need, this._progress + amount);
    this._game.ui?.updateChallenge(this._current, this._progress, false);
    if (this._progress >= this._current.need) this._complete();
  }

  _complete() {
    this._completed = true;
    const c = this._current;
    const r = c.reward;
    const itemName = getItem(r.item)?.name ?? r.item;
    this._game.ui?.notify(`🏆 Salvage Run complete! +${r.xp} XP  +${r.qty}× ${itemName}`);
    this._game.xpSystem?.gain(r.xp);
    this._game.player?.addItem(r.item, r.qty);
    this._game.ui?.updateChallenge(c, c.need, true);
    this._game.foreman?.onEvent('challenge_complete', {});
    this._game.achievements?.track('challenge_complete', {});
    this._cooldown = 8;
  }
}
