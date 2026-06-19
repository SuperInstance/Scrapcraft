import { RECIPES } from '../data/recipes.js';
import { getItem } from '../data/items.js';

export class CraftingSystem {
  constructor(player, foreman) {
    this.player = player;
    this.foreman = foreman;
  }

  /** Return list of recipes available at this station, annotated with craftability */
  getAvailableRecipes(station, unlockedItems) {
    return RECIPES
      .filter(r => {
        if (r.unlockAfter && !unlockedItems.has(r.unlockAfter)) return false;
        return r.station === 'any' || r.station === station;
      })
      .map(r => ({
        ...r,
        canCraft: this._canCraft(r),
      }));
  }

  /** Returns true if the player has all ingredients + required tool */
  _canCraft(recipe) {
    for (const [id, qty] of Object.entries(recipe.ingredients)) {
      if (this.player.countItem(id) < qty) return false;
    }
    if (recipe.tool && !this.player.hasTool(recipe.tool)) return false;
    return true;
  }

  /** Attempt to craft. Returns { ok, output, qty } or { ok: false, reason } */
  craft(recipeId) {
    const r = RECIPES.find(x => x.id === recipeId);
    if (!r) return { ok: false, reason: 'Unknown recipe' };
    if (!this._canCraft(r)) return { ok: false, reason: 'Missing materials or tool' };

    // Consume ingredients
    for (const [id, qty] of Object.entries(r.ingredients)) {
      this.player.removeItem(id, qty);
    }

    // Give output
    const leftover = this.player.addItem(r.output, r.qty);

    // Track crafted set for quest/unlock purposes
    this.player.crafted.add(r.output);

    // Foreman quip
    const outputDef = getItem(r.output);
    if (r.foremanQuip) {
      this.foreman.sayLine(r.foremanQuip);
    } else {
      // Generic quip based on output category
      const cat = outputDef?.category;
      if (cat === 'tool')      this.foreman.onEvent('craft_tool', {});
      else if (cat === 'vehicle' || cat === 'companion') this.foreman.onEvent(`craft_${r.output}`, {});
      else                     this.foreman.onEvent('craft_device', {});
    }

    // Trigger quest check
    this.foreman.onEvent(`craft_${r.output}`, {});

    return { ok: true, output: r.output, qty: r.qty, dropped: leftover };
  }
}
