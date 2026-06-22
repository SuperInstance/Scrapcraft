/**
 * Codex — Field Guide for discovered items.
 *
 * Tracks every item ID the player has ever held. Persists independently in
 * localStorage so it survives save resets. Opening the panel with [C] shows
 * a grid of discovered items; unknown entries appear as silhouettes.
 */

import { ITEMS } from './data/items.js';

const SAVE_KEY = 'sc_codex_v1';

export class Codex {
  constructor() {
    this._discovered = new Set();
    this._load();
  }

  /**
   * Mark itemId as discovered. Returns true when this is a first discovery.
   * Silently ignores IDs not in the ITEMS catalog.
   */
  discover(itemId) {
    if (!ITEMS[itemId] || this._discovered.has(itemId)) return false;
    this._discovered.add(itemId);
    this._save();
    return true;
  }

  hasDiscovered(id) { return this._discovered.has(id); }

  /** All item catalog entries, each annotated with `discovered` boolean. */
  getAll() {
    return Object.entries(ITEMS).map(([id, def]) => ({
      id,
      ...def,
      discovered: this._discovered.has(id),
    }));
  }

  get count()  { return this._discovered.size; }
  get total()  { return Object.keys(ITEMS).length; }
  get percent(){ return this.total > 0 ? Math.round(this.count / this.total * 100) : 0; }

  _save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify([...this._discovered]));
    } catch (_) { /* noop */ }
  }

  _load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
      if (Array.isArray(d)) d.forEach(id => this._discovered.add(id));
    } catch (_) { /* noop */ }
  }
}
