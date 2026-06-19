import { getItem } from './data/items.js';
import { BLOCK_DEF } from './data/blocks.js';

export class UI {
  constructor(game) {
    this.game = game;
    this._hotbar = document.getElementById('hotbar');
    this._overlay = document.getElementById('overlay');
    this._invGrid = document.getElementById('inv-grid');
    this._recipeList = document.getElementById('recipe-list');
    this._craftBtn = document.getElementById('craft-btn');
    this._foremanBubble = document.getElementById('foreman-bubble');
    this._foremanText = document.getElementById('foreman-text');
    this._questBox = document.getElementById('quest-box');
    this._questTitle = document.getElementById('quest-title');
    this._questSteps = document.getElementById('quest-steps');
    this._blockLabel = document.getElementById('block-label');
    this._notifContainer = document.getElementById('notifications');
    this._tooltip = document.getElementById('tooltip');
    this._tipName = document.getElementById('tip-name');
    this._tipDesc = document.getElementById('tip-desc');

    this._selectedRecipe = null;
    this._overlayOpen = false;
    this._currentStation = 'workbench';
    this._dismissTimer = null;

    document.getElementById('foreman-dismiss').addEventListener('click', () => this.hideForeman());
    this._craftBtn.addEventListener('click', () => this._doCraft());

    document.addEventListener('mousemove', e => this._moveTooltip(e));

    this._buildHotbar();
  }

  // ── Hotbar ──────────────────────────────────────────────────────────────

  _buildHotbar() {
    this._hotbar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.dataset.index = i;
      slot.innerHTML = `<span class="slot-num">${i + 1}</span>
        <span class="item-icon"></span>
        <span class="item-count"></span>`;
      this._hotbar.appendChild(slot);
    }
  }

  updateHotbar(player) {
    const slots = this._hotbar.querySelectorAll('.hotbar-slot');
    slots.forEach((slot, i) => {
      const item = player.inventory[i];
      slot.classList.toggle('active', i === player.hotbarIndex);
      slot.querySelector('.item-icon').textContent = item ? getItem(item.id)?.icon ?? '?' : '';
      slot.querySelector('.item-count').textContent = item && item.qty > 1 ? item.qty : '';
    });
  }

  // ── Block targeting label ───────────────────────────────────────────────

  setBlockLabel(blockId) {
    if (blockId == null) {
      this._blockLabel.style.display = 'none';
    } else {
      const def = BLOCK_DEF[blockId];
      this._blockLabel.textContent = def ? `[ ${def.name.toUpperCase()} ]` : '';
      this._blockLabel.style.display = 'block';
    }
  }

  // ── Inventory / Crafting overlay ────────────────────────────────────────

  openInventory(station = 'workbench') {
    this._currentStation = station;
    this._overlayOpen = true;
    this._overlay.classList.add('open');
    this._renderInventory();
    this._renderRecipes();
    this.game.player.unlock?.();
    document.exitPointerLock();
  }

  closeInventory() {
    this._overlayOpen = false;
    this._overlay.classList.remove('open');
    this._selectedRecipe = null;
    this._craftBtn.style.display = 'none';
    document.getElementById('game-canvas').requestPointerLock();
  }

  toggleInventory() {
    if (this._overlayOpen) this.closeInventory();
    else this.openInventory(this._currentStation);
  }

  get isOpen() { return this._overlayOpen; }

  _renderInventory() {
    this._invGrid.innerHTML = '';
    const inv = this.game.player.inventory;
    for (let i = 0; i < 36; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      const item = inv[i];
      if (item) {
        const def = getItem(item.id);
        slot.innerHTML = `<span class="item-icon">${def?.icon ?? '?'}</span>
          <span class="item-name">${def?.name ?? item.id}</span>
          ${item.qty > 1 ? `<span class="item-count">${item.qty}</span>` : ''}`;
        slot.addEventListener('mouseenter', e => this._showTooltip(e, item.id));
        slot.addEventListener('mouseleave', () => this.hideTooltip());
      }
      this._invGrid.appendChild(slot);
    }
  }

  _renderRecipes() {
    this._recipeList.innerHTML = '';
    const craftSystem = this.game.craftingSystem;
    const recipes = craftSystem.getAvailableRecipes(this._currentStation, this.game.player.crafted);

    for (const r of recipes) {
      const card = document.createElement('div');
      card.className = `recipe-card${r.canCraft ? ' craftable' : ''}`;
      const outputDef = getItem(r.output);

      const ingLines = Object.entries(r.ingredients).map(([id, qty]) => {
        const have = this.game.player.countItem(id);
        const def = getItem(id);
        const ok = have >= qty;
        return `<span class="${ok ? 'ok' : 'missing'}">${ok ? '✓' : '✗'} ${qty}x ${def?.name ?? id} (${have})</span>`;
      });
      if (r.tool) {
        const have = this.game.player.hasTool(r.tool);
        const toolDef = getItem(r.tool);
        ingLines.push(`<span class="${have ? 'ok' : 'missing'}">${have ? '✓' : '✗'} Tool: ${toolDef?.name ?? r.tool}</span>`);
      }

      card.innerHTML = `
        <div class="r-name">${outputDef?.icon ?? ''} ${outputDef?.name ?? r.output} ×${r.qty}</div>
        <div class="r-result">${outputDef?.desc ?? ''}</div>
        <div class="r-station">Station: ${r.station}</div>
        <div class="r-reqs">${ingLines.join('<br>')}</div>`;

      card.addEventListener('click', () => {
        this._selectedRecipe = r;
        this._craftBtn.style.display = r.canCraft ? 'block' : 'none';
        document.querySelectorAll('.recipe-card').forEach(c => c.style.outline = 'none');
        card.style.outline = '2px solid #f0b429';
      });

      this._recipeList.appendChild(card);
    }
  }

  _doCraft() {
    if (!this._selectedRecipe) return;
    const result = this.game.craftingSystem.craft(this._selectedRecipe.id);
    if (result.ok) {
      const def = getItem(result.output);
      this.notify(`Crafted ${result.qty}x ${def?.name ?? result.output}! ${def?.icon ?? ''}`);
      if (result.dropped > 0) this.notify('Inventory full — some items were lost!');
      // Refresh
      this._renderInventory();
      this._renderRecipes();
      this._selectedRecipe = null;
      this._craftBtn.style.display = 'none';
      this.updateHotbar(this.game.player);
    } else {
      this.notify(`Can't craft: ${result.reason}`);
    }
  }

  // ── Foreman dialogue ────────────────────────────────────────────────────

  showForeman(text) {
    this._foremanText.textContent = text;
    this._foremanBubble.style.display = 'block';
    clearTimeout(this._dismissTimer);
    this._dismissTimer = setTimeout(() => this.hideForeman(), 8000);
  }

  hideForeman() {
    this._foremanBubble.style.display = 'none';
  }

  showQuest(quest) {
    this._questTitle.textContent = quest.title;
    this._questSteps.innerHTML = quest.steps
      .map(s => `<div class="quest-step">${s.label}</div>`).join('');
    this._questBox.style.display = 'block';
  }

  updateQuestProgress(quest, player) {
    const stepEls = this._questSteps.querySelectorAll('.quest-step');
    quest.steps.forEach((s, i) => {
      stepEls[i]?.classList.toggle('done', s.check(player));
    });
  }

  clearQuest() {
    this._questBox.style.display = 'none';
  }

  // ── Tooltip ─────────────────────────────────────────────────────────────

  _showTooltip(e, itemId) {
    const def = getItem(itemId);
    if (!def) return;
    this._tipName.textContent = `${def.icon} ${def.name}`;
    this._tipDesc.textContent = def.desc ?? '';
    this._tooltip.style.display = 'block';
    this._moveTooltip(e);
  }

  _moveTooltip(e) {
    this._tooltip.style.left = (e.clientX + 12) + 'px';
    this._tooltip.style.top  = (e.clientY + 12) + 'px';
  }

  hideTooltip() {
    this._tooltip.style.display = 'none';
  }

  // ── Notifications ───────────────────────────────────────────────────────

  notify(text) {
    const el = document.createElement('div');
    el.className = 'notif';
    el.textContent = text;
    this._notifContainer.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
}
