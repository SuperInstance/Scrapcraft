/**
 * RaceBoard — Circuit City leaderboard for oval track lap times.
 *
 * Shows 5 NPC ghost times. Player entries are stored in localStorage
 * and updated whenever a new oval lap PB is set.
 */

const SAVE_KEY = 'sc_raceboard_v1';

// NPC ghosts — ordered fastest first
export const NPC_GHOSTS = [
  { name: 'Earl Jr.',    ms: 18400, bot: 'Wrench',   note: 'The foreman\'s nephew. Suspiciously fast.' },
  { name: 'Ratchet',    ms: 23200, bot: 'Cog',       note: 'Old timer. Classic line-follower, no tricks.' },
  { name: 'Scrapdog',   ms: 28900, bot: 'Rivet',     note: 'Scrap-dealer turned racer. Smooth on corners.' },
  { name: 'Gearhead',   ms: 35100, bot: 'Flux',      note: 'Novice. Very enthusiastic. Bot keeps spinning out.' },
  { name: 'Rookie Rex', ms: 44800, bot: 'Nibble',    note: 'First day in the yard. Bless his heart.' },
];

// Earl's quips for beating each ghost (indexed to NPC_GHOSTS order)
export const BEAT_QUIPS = [
  "You beat Earl Jr. I will be telling him this at every family gathering until someone moves away.",
  "Ratchet had that time for three seasons. His bot is going to need therapy.",
  "Scrapdog says he wasn't trying. He was trying. I saw him practicing yesterday at 6 AM.",
  "You beat Gearhead. Gearhead is twelve. You should feel good about that. And also slightly bad.",
  "You beat Rookie Rex. ...You should probably aim higher. But it counts.",
];

function _fmt(ms) {
  if (!isFinite(ms) || ms <= 0) return '—';
  return (ms / 1000).toFixed(2) + 's';
}

export class RaceBoard {
  constructor() {
    this.playerMs   = Infinity;
    this.playerName = 'You';  // updated with bot name when lap set
    this.playerBot  = '';
    this._load();
  }

  /** Update with a new player PB. Returns index of newly-beaten NPC ghosts, or []. */
  setPlayerTime(ms, playerName, botName) {
    const prevMs = this.playerMs;
    if (ms >= this.playerMs) return [];
    this.playerMs   = ms;
    this.playerName = playerName ?? 'You';
    this.playerBot  = botName ?? '';
    this._save();
    // Find which NPC ghosts were newly beaten this run
    const beaten = [];
    for (let i = 0; i < NPC_GHOSTS.length; i++) {
      if (ms < NPC_GHOSTS[i].ms && prevMs >= NPC_GHOSTS[i].ms) {
        beaten.push(i);
      }
    }
    return beaten;
  }

  /** Sorted board entries — NPC ghosts + player entry merged. */
  getBoard() {
    const entries = NPC_GHOSTS.map((g, i) => ({
      rank: 0, name: g.name, bot: g.bot, ms: g.ms, note: g.note, isPlayer: false, npcIdx: i,
    }));
    if (isFinite(this.playerMs)) {
      entries.push({ rank: 0, name: this.playerName, bot: this.playerBot, ms: this.playerMs, note: 'Personal best', isPlayer: true });
    } else {
      entries.push({ rank: 0, name: '—', bot: '?', ms: Infinity, note: 'No laps yet', isPlayer: true, pending: true });
    }
    entries.sort((a, b) => a.ms - b.ms);
    entries.forEach((e, i) => { e.rank = i + 1; });
    return entries;
  }

  _save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ms: this.playerMs, name: this.playerName, bot: this.playerBot }));
    } catch (_) { /* noop */ }
  }

  _load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
      if (d?.ms) { this.playerMs = d.ms; this.playerName = d.name ?? 'You'; this.playerBot = d.bot ?? ''; }
    } catch (_) { /* noop */ }
  }

  static formatTime(ms) { return _fmt(ms); }
}
