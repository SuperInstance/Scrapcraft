import { RECIPES } from '../data/recipes.js';
import { getItem } from '../data/items.js';

export class CraftingSystem {
  constructor(player, foreman) {
    this.player  = player;
    this.foreman = foreman;
    this._game   = null; // set after Game init
  }

  setGame(game) { this._game = game; }

  getAvailableRecipes(station, unlockedItems) {
    return RECIPES
      .filter(r => {
        if (r.unlockAfter && !unlockedItems.has(r.unlockAfter)) return false;
        return r.station === 'any' || r.station === station;
      })
      .map(r => ({ ...r, canCraft: this._canCraft(r) }));
  }

  _canCraft(recipe) {
    for (const [id, qty] of Object.entries(recipe.ingredients)) {
      if (this.player.countItem(id) < qty) return false;
    }
    if (recipe.tool && !this.player.hasTool(recipe.tool)) return false;
    return true;
  }

  craft(recipeId) {
    const r = RECIPES.find(x => x.id === recipeId);
    if (!r) return { ok: false, reason: 'Unknown recipe' };
    if (!this._canCraft(r)) return { ok: false, reason: 'Missing materials or tool' };

    for (const [id, qty] of Object.entries(r.ingredients)) {
      this.player.removeItem(id, qty);
    }

    const leftover = this.player.addItem(r.output, r.qty);
    this.player.crafted.add(r.output);

    // Foreman quip
    if (r.foremanQuip) this.foreman.sayLine(r.foremanQuip);
    else {
      const cat = getItem(r.output)?.category;
      if (cat === 'tool') this.foreman.onEvent('craft_tool', {});
      else                this.foreman.onEvent('craft_device', {});
    }

    // Trigger quest check + achievement + audio + particles via Game
    this.foreman.onEvent(`craft_${r.output}`, {});
    this._game?.onCraft(r.id, r.output, r.qty);

    return { ok: true, output: r.output, qty: r.qty, dropped: leftover };
  }
}
