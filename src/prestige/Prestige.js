/**
 * ───────────────────────────────────────────────────────────────────────────
 *  PRESTIGE  —  Earl's Back Room (marks in, kindness out)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Finishing the Midnight Race (spine ch12 — the finale quest) or completing
 * any companion arc (Bolt / Magma / Juno / Rivet, 5 quests each) earns a
 * Prestige Mark. Marks spend on the Back Room board (backroom.json): bot
 * paint, yard decorations, lantern colors, a second bot slot.
 *
 * The economy is FINITE by design: 6 marks max (1 per arc + 2 for the
 * Midnight Race), catalog costs 9 — the kid chooses, nothing is grindable,
 * nothing expires, nothing is missed by waiting. No dark patterns: prices
 * are flat, no timers, no streak anything.
 *
 * Wiring (surgical, additive):
 *   QuestSystem._completeQuest  →  game.prestige.onQuestCompleted(q, tracker)
 *   Game.js                     →  new PrestigeSystem(this); load/save via SaveSystem
 *   SaveSystem.js               →  prestige: g.prestige?.toSaveData() (+ load)
 *
 * Headless: injectable storage, zero DOM, zero game imports inside logic —
 * the optional `_game` is only ever used for notify/Earl garnish.
 */

import board from './backroom.json' with { type: 'json' };
import { perkEffects } from './perks.js';

const LS_KEY = 'scrapcraft_prestige_v1';
const STORAGE_VERSION = 1;

/** Every purchasable reward on the board, flattened. */
export const BACKROOM_CATALOG = [
  ...board.paintSchemes,
  ...board.yardDecorations,
  ...board.lanternColors,
  ...board.botSlots,
];

export const EARL_BOARD_LINES = board.earlBoardLines;
export const EARL_FIRST_MARK_LINE = board.earlFirstMarkLine;
export const EARL_CANT_AFFORD_LINE = board.earlCantAffordLine;
export const EARL_PURCHASE_LINES = board.earlPurchaseLines;

/** Which category a reward id belongs to (for rendering). Pure. */
export function rewardCategory(id) {
  if (board.paintSchemes.some(r => r.id === id)) return 'paint';
  if (board.yardDecorations.some(r => r.id === id)) return 'decor';
  if (board.lanternColors.some(r => r.id === id)) return 'lantern';
  if (board.botSlots.some(r => r.id === id)) return 'botSlot';
  return null;
}

/** Mark awards per accomplishment. The whole economy, in one object. */
export const MARK_AWARDS = {
  arc: 1,        // each completed companion arc (bolt/magma/juno/rivet)
  finale: 2,     // the Midnight Race (spine ch12 payoff)
};

const ARC_IDS = ['bolt', 'magma', 'juno', 'rivet'];
export { ARC_IDS };   // companion arcs that pay marks (mirrors schema ARC_SIZES)

export class PrestigeSystem {
  /**
   * @param {object} [game]  optional — UI/Earl garnish only, never required
   * @param {object} [opts]
   * @param {Storage|object|null} [opts.storage]  injectable for tests
   */
  constructor(game = null, opts = {}) {
    this._game = game;
    this._storage = opts.storage !== undefined ? opts.storage
      : (typeof localStorage !== 'undefined' ? localStorage : null);

    this.data = {
      v: STORAGE_VERSION,
      marks: 0,                 // unspent marks
      earned: {},               // sourceId ('arc:bolt', 'finale') → { at, amount }
      owned: [],                // purchased reward ids
    };
  }

  // ── earning ───────────────────────────────────────────────────────────────

  /**
   * Called by QuestSystem after any quest completes. Awards marks for
   * freshly-completed arcs and the finale — once each, ever. Returns the
   * list of awards made (usually []).
   * @param {object} questDef   the quest definition just completed
   * @param {object} tracker    QuestTracker (uses completedArcs/isCompleted)
   */
  onQuestCompleted(questDef, tracker) {
    const awards = [];
    if (!tracker) return awards;
    const firstEver = Object.keys(this.data.earned).length === 0;

    // Companion arcs: all their quests done → one mark, once per arc
    if (ARC_IDS.includes(questDef.arc)) {
      const arcDone = tracker.questDefs
        .filter(q => q.arc === questDef.arc)
        .every(q => tracker.isCompleted(q.id));
      if (arcDone) awards.push(this._award(`arc:${questDef.arc}`, MARK_AWARDS.arc));
    }

    // The Midnight Race — spine ch12 is the campaign payoff (2 marks)
    if (questDef.id === 'finale-midnight-race' && tracker.isCompleted(questDef.id)) {
      awards.push(this._award('finale', MARK_AWARDS.finale));
    }

    const made = awards.filter(Boolean);
    if (made.length) {
      const total = made.reduce((n, a) => n + a.amount, 0);
      this.save();
      this._game?.ui?.notify(`🏅 Prestige Mark${total > 1 ? 's' : ''} earned — ${total} to spend at Earl's Back Room`);
      if (firstEver) this._game?.foreman?.sayLine?.(EARL_FIRST_MARK_LINE);
    }
    return made;
  }

  _award(sourceId, amount) {
    if (this.data.earned[sourceId]) return null;   // once, ever
    this.data.earned[sourceId] = { at: new Date().toISOString(), amount };
    this.data.marks += amount;
    return { sourceId, amount };
  }

  // ── the board ─────────────────────────────────────────────────────────────

  get marks() { return this.data.marks; }
  get owned() { return [...this.data.owned]; }
  owns(id) { return this.data.owned.includes(id); }

  /** Board entries with afford/owned flags for rendering. */
  board() {
    return BACKROOM_CATALOG.map(r => ({
      ...r,
      category: rewardCategory(r.id),
      owned: this.owns(r.id),
      affordable: this.owns(r.id) || this.data.marks >= r.cost,
    }));
  }

  canPurchase(id) {
    const r = BACKROOM_CATALOG.find(x => x.id === id);
    return Boolean(r) && !this.owns(id) && this.data.marks >= r.cost;
  }

  /**
   * Spend marks on a reward. Flat prices, no expiry, no confirmation games.
   * @returns {object|null} the reward def if purchased, else null
   */
  purchase(id) {
    if (!this.canPurchase(id)) {
      if (BACKROOM_CATALOG.some(x => x.id === id) && !this.owns(id))
        this._game?.foreman?.sayLine?.(EARL_CANT_AFFORD_LINE);
      return null;
    }
    const r = BACKROOM_CATALOG.find(x => x.id === id);
    this.data.marks -= r.cost;
    this.data.owned.push(id);
    this.save();
    const catLine = EARL_PURCHASE_LINES?.[rewardCategory(id)];
    this._game?.ui?.notify(`${r.icon} ${r.label} — yours.`);
    this._game?.foreman?.sayLine?.(catLine ?? r.earlLine);
    return r;
  }

  // ── persistence ───────────────────────────────────────────────────────────

  toSaveData() { return JSON.parse(JSON.stringify(this.data)); }

  fromSaveData(d) {
    if (!d || d.v !== STORAGE_VERSION) return;
    this.data = {
      v: STORAGE_VERSION,
      marks: Math.max(0, d.marks ?? 0),
      earned: d.earned ?? {},
      owned: [...new Set(Array.isArray(d.owned) ? d.owned.filter(id =>
        BACKROOM_CATALOG.some(r => r.id === id)) : [])],
    };
  }

  save() {
    if (!this._storage) return;
    try { this._storage.setItem(LS_KEY, JSON.stringify(this.data)); } catch { /* full disk: fine */ }
  }

  // ── achievement perks (computed, never stored — earned is earned) ───────

  /** Aggregate perk effects from the game's unlocked achievements. */
  perkEffectsNow() {
    return perkEffects(this._game?.achievements?.unlocked ?? new Set());
  }

  /** The Back Room panel (Shift+M — the boxes marked M). Lazy import keeps
   *  the game bundle lean and the panel optional, like the logbook panel. */
  async openBoard() {
    const { openBackRoomPanel } = await import('./BackRoomPanel.js');
    openBackRoomPanel(this);
  }

  /** Earl's board lines, for the panel. */
  get earlBoardLines() { return EARL_BOARD_LINES; }

  load() {
    if (!this._storage) return;
    try {
      const raw = this._storage.getItem(LS_KEY);
      if (raw) this.fromSaveData(JSON.parse(raw));
    } catch { /* corrupt: start fresh */ }
  }
}
