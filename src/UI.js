import { getItem } from './data/items.js';
import { BLOCK_DEF } from './data/blocks.js';
import { ACHIEVEMENT_LIST } from './Achievements.js';

// ── Engineering Codex entries (teaches real science, middle-school tone) ──
const CODEX = [
  {
    id: 'generator',
    title: 'How Does a Generator Work?',
    icon: '⚡',
    text: `A generator converts mechanical energy into electrical energy using a concept called electromagnetic induction. When you spin a coil of wire inside a magnetic field, electrons in the wire get pushed — creating electric current. This is literally how your city's power plant works, just bigger and not made of scrap.\n\nFun fact: Michael Faraday figured this out in 1831 using a coil and a horseshoe magnet. He basically invented the modern world.`,
  },
  {
    id: 'circuit_board',
    title: 'What Are Circuit Boards?',
    icon: '🟢',
    text: `Circuit boards are flat panels that hold and connect electronic components using tiny copper pathways called traces. The green stuff is epoxy. The silver lines are actual copper (plated with tin so it doesn't corrode).\n\nThe little chips on them contain millions — sometimes billions — of transistors. A transistor is basically a tiny switch. Flip a billion switches fast enough and you get a smartphone.`,
  },
  {
    id: 'robot_helper',
    title: 'How Do Robots Work?',
    icon: '🤖',
    text: `Real robots have three main systems: sensors (to perceive), actuators (to move), and a controller (to decide). The actuators are usually motors — electric motors turn electricity into rotational force.\n\nModern robot joints use servo motors with position feedback. The robot "knows" where its arm is because sensors tell the controller. The ScrapBot uses a simplified version of this — but the principle is the same as a Mars rover.`,
  },
  {
    id: 'blowtorch',
    title: 'What Is Welding?',
    icon: '🔥',
    text: `Welding joins two pieces of metal by melting them together. A blowtorch burns a fuel gas (like acetylene) mixed with oxygen to reach temperatures above 3,000°C — hot enough to melt steel.\n\nThe science: combustion is a rapid chemical reaction where fuel reacts with oxygen, releasing heat and light. "Hot enough to melt steel" sounds like a meme but in welding it's literally Tuesday.`,
  },
  {
    id: 'gear_small',
    title: 'How Do Gears Work?',
    icon: '⚙️',
    text: `Gears transfer rotational force between shafts. When a small gear drives a big gear, you trade speed for torque (turning force). When a big gear drives a small one, you trade torque for speed. This is why bikes have multiple gears — different trade-offs for flat ground vs. hills.\n\nThe ratio matters: a 10-tooth gear driving a 40-tooth gear turns at ¼ the speed but 4× the torque. That math is behind every transmission ever built.`,
  },
  {
    id: 'rubber_chunk',
    title: 'Why Is Rubber Stretchy?',
    icon: '⬛',
    text: `Natural rubber is made of long, coiled polymer chains — like springs at the molecular level. When you stretch rubber, you're straightening those chains. When you let go, they spring back.\n\nVulcanization (heating rubber with sulfur, invented by Charles Goodyear in 1839) crosslinks those chains together, making rubber stronger and more elastic. Every tire, every seal, every rubber band owes its existence to one guy accidentally dropping a rubber-sulfur mixture on a hot stove.`,
  },
  {
    id: 'flying_machine',
    title: 'How Does Flight Work?',
    icon: '✈️',
    text: `Four forces act on any flying machine: thrust (forward), drag (backward), lift (up), weight (down). Fly if lift > weight and thrust > drag.\n\nLift comes from wings shaped so air moving over the top travels faster than air below — faster air = lower pressure (Bernoulli's principle). The wing pushes air down; by Newton's third law, air pushes the wing up.\n\nBuilding one from scrap? Earl said it couldn't be done. You proved him wrong. That's also science.`,
  },
  {
    id: 'battery_pack',
    title: 'How Do Batteries Work?',
    icon: '🔋',
    text: `A battery stores chemical energy and converts it to electrical energy through a chemical reaction called redox (reduction + oxidation). Two different materials (electrodes) sit in a chemical solution (electrolyte). Electrons flow from the negative electrode (anode) through your circuit to the positive (cathode).\n\nWhen all the chemical reactant is used up, the battery "dies." Rechargeable batteries reverse the reaction by forcing electrons back the other way. Your phone does this hundreds of times before the chemistry degrades.`,
  },
  {
    id: 'copper_wire',
    title: 'Why Copper for Wire?',
    icon: '🪢',
    text: `Copper is one of the best electrical conductors that exists at room temperature (silver is slightly better but way more expensive). Electrons flow through copper easily because its outer electrons are loosely held.\n\nCopper is also ductile — it can be drawn into very thin wire without breaking. And it's abundant. Those three things together make it the backbone of all electrical infrastructure on Earth. There's over 250 million tons of copper in global electrical systems right now.`,
  },
  {
    id: 'go_kart',
    title: 'How Do Engines Work?',
    icon: '🏎️',
    text: `Internal combustion engines turn fuel explosions into rotation. The four-stroke cycle: intake (suck air + fuel in), compression (squeeze it), combustion (spark → boom), exhaust (push the gases out). That boom pushes a piston down, which turns a crankshaft, which turns your wheels.\n\nThe go-kart doesn't need an engine because Earl didn't put one in the plans. That's a future upgrade. For now, imagine it rolling downhill. Quickly.`,
  },
  {
    id: 'track_strip',
    title: 'How Do IR Line Sensors Work?',
    icon: '🏁',
    text: `A line-following robot uses infrared (IR) sensors. An IR LED shines invisible light downward; a photodetector measures how much bounces back. Dark surfaces absorb light (low return); pale surfaces reflect it (high return). The robot reads the difference and steers to stay over the dark line.\n\nThis is exactly what robot vacuum cleaners use to detect cliff edges — they look down, see no reflection, and stop. The TRACK blocks in Scrapcraft simulate this: the bot's 'line_under' sensor goes true when it's over the dark rubber strips.`,
  },
  {
    id: 'tin_brain',
    title: 'What Is a Microcontroller?',
    icon: '🧠',
    text: `A microcontroller (MCU) is a tiny computer on a single chip. It has a CPU, memory, and input/output pins — all in one package smaller than your thumbnail. The Arduino Uno uses an ATmega328P; an ESP32 (the Spark Brain) adds WiFi and Bluetooth and runs at 240 MHz.\n\nUnlike a regular computer, a microcontroller runs one program in a loop forever. That's the "forever" tile in the Maker Lab — it's not a game abstraction, it's literally how embedded code works. void loop() {} in Arduino IS the forever block.`,
  },
  {
    id: 'floodlight',
    title: 'How Do LEDs Make Light?',
    icon: '💡',
    text: `LEDs (Light Emitting Diodes) produce light through electroluminescence. When electricity flows through a semiconductor junction, electrons drop to a lower energy state and release that energy as photons — particles of light. The color depends on the semiconductor material used.\n\nOld lights waste 90% of their energy as heat. LEDs convert 50-90% into light, making them wildly more efficient. A 10W LED produces as much light as a 60W incandescent bulb. The Floodlight in Scrapcraft uses a point-light model — the same math graphics engines use to simulate physical lights.`,
  },
  {
    id: 'robot_arm',
    title: 'How Do Robot Arms Work?',
    icon: '🦾',
    text: `Industrial robot arms have multiple joints, each controlled by a servo motor with position feedback. The controller computes inverse kinematics — given "put the gripper at position XYZ," it works backward to figure out what angle each joint needs. That's serious math involving matrices and trigonometry.\n\nThe human arm does this instantly, without you thinking about it. Your brain's motor cortex is running continuous inverse kinematics. You are already a robot. Just a wet, squishy one.`,
  },
];

export class UI {
  constructor(game) {
    this.game = game;
    this._hotbar          = document.getElementById('hotbar');
    this._overlay         = document.getElementById('overlay');
    this._invGrid         = document.getElementById('inv-grid');
    this._recipeList      = document.getElementById('recipe-list');
    this._craftBtn        = document.getElementById('craft-btn');
    this._foremanBubble   = document.getElementById('foreman-bubble');
    this._foremanText     = document.getElementById('foreman-text');
    this._questBox        = document.getElementById('quest-box');
    this._questTitle      = document.getElementById('quest-title');
    this._questSteps      = document.getElementById('quest-steps');
    this._blockLabel      = document.getElementById('block-label');
    this._notifContainer  = document.getElementById('notifications');
    this._tooltip         = document.getElementById('tooltip');
    this._tipName         = document.getElementById('tip-name');
    this._tipDesc         = document.getElementById('tip-desc');
    this._zoneLabel       = document.getElementById('zone-label');
    this._achieveToast    = document.getElementById('achieve-toast');
    this._codexList    = document.getElementById('codex-list');
    this._codexContent = document.getElementById('codex-content');

    this._selectedRecipe  = null;
    this._overlayOpen     = false;
    this._currentStation  = 'any';
    this._dismissTimer    = null;
    this._achieveQueue    = [];
    this._showingAchieve  = false;
    this._activeTab       = 'crafting';
    this._zoneToastTimer  = null;
    this._paused          = false;

    // Crosshair & mine ring elements
    this._crosshair   = document.getElementById('crosshair');
    this._mineArc     = document.getElementById('mine-arc');
    this._pauseOverlay = document.getElementById('pause-overlay');
    this._zoneToast   = document.getElementById('zone-toast');
    this._activeLabel = document.getElementById('active-item-label');

    // XP bar
    this._xpFill      = document.getElementById('xp-fill');
    this._xpLevelText = document.getElementById('xp-level-text');
    this._xpSkillBadge= document.getElementById('xp-skill-badge');
    this._levelupToast = document.getElementById('levelup-toast');
    this._luIcon  = document.getElementById('lu-icon');
    this._luTitle = document.getElementById('lu-title');
    this._luSkill = document.getElementById('lu-skill');
    this._luTimer = null;

    this._hotbarTip = document.getElementById('hotbar-tip');

    this._buildHotbar();
    this._buildCodex();
    this._bindOverlayEvents();

    document.getElementById('foreman-dismiss').addEventListener('click', () => this.hideForeman());
  }

  // ── Hotbar ────────────────────────────────────────────────────────────

  _buildHotbar() {
    this._hotbar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.innerHTML = `<span class="slot-num">${i + 1}</span>
        <span class="item-icon"></span><span class="item-count"></span>`;
      slot.addEventListener('mouseenter', () => this._showHotbarTip(i));
      slot.addEventListener('mouseleave', () => this._hideHotbarTip());
      this._hotbar.appendChild(slot);
    }
  }

  _showHotbarTip(index) {
    if (!this._hotbarTip) return;
    const item = this.game?.player?.inventory?.[index];
    if (!item) { this._hideHotbarTip(); return; }
    const def = getItem(item.id);
    if (!def) return;
    this._hotbarTip.textContent = `${def.icon} ${def.name}`;
    this._hotbarTip.classList.add('show');
  }

  _hideHotbarTip() {
    this._hotbarTip?.classList.remove('show');
  }

  updateHotbar(player) {
    const slots = this._hotbar.querySelectorAll('.hotbar-slot');
    slots.forEach((slot, i) => {
      const item = player.inventory[i];
      slot.classList.toggle('active', i === player.hotbarIndex);
      slot.querySelector('.item-icon').textContent  = item ? (getItem(item.id)?.icon ?? '?') : '';
      slot.querySelector('.item-count').textContent = item?.qty > 1 ? item.qty : '';
    });
    // Active item label above hotbar
    const active = player.inventory[player.hotbarIndex];
    if (this._activeLabel) {
      const def = active ? getItem(active.id) : null;
      this._activeLabel.textContent = def ? `${def.icon} ${def.name}` : '';
      this._activeLabel.style.opacity = def ? '1' : '0';
    }
  }

  // ── Crosshair state ───────────────────────────────────────────────────

  setCrosshairState(moving, interactive, mineProgress) {
    if (!this._crosshair) return;
    this._crosshair.classList.toggle('ch-spread',      moving && mineProgress < 0.05);
    this._crosshair.classList.toggle('ch-interactive', interactive);
    this._crosshair.classList.toggle('ch-mining',      mineProgress > 0.02);
  }

  setMineProgress(p) {
    if (!this._mineArc) return;
    // stroke-dasharray circumference = 2*π*17 ≈ 106.8
    const circ = 106.8;
    this._mineArc.style.strokeDashoffset = `${circ * (1 - Math.min(1, p))}`;
    this._mineArc.style.opacity = p > 0.01 ? '1' : '0';
  }

  // ── Pause overlay ─────────────────────────────────────────────────────

  setPaused(paused) {
    this._paused = paused;
    if (this._pauseOverlay) {
      this._pauseOverlay.style.display = paused ? 'flex' : 'none';
    }
  }

  // ── Zone / Time HUD ──────────────────────────────────────────────────

  setZone(zone, timeLabel) {
    if (!this._zoneLabel) return;
    const icon = { Night:'🌙', Dawn:'🌅', Morning:'☀️', Midday:'☀️', Afternoon:'🌤️', Dusk:'🌇' }[timeLabel] ?? '🌙';
    this._zoneLabel.textContent = `${zone}  ·  ${icon} ${timeLabel}`;
  }

  showZoneToast(name) {
    if (!this._zoneToast) return;
    this._zoneToast.textContent = `▶  ${name.toUpperCase()}`;
    this._zoneToast.classList.add('show');
    clearTimeout(this._zoneToastTimer);
    this._zoneToastTimer = setTimeout(() => this._zoneToast.classList.remove('show'), 3000);
  }

  // ── Block label ───────────────────────────────────────────────────────

  setBlockLabel(blockId) {
    if (blockId == null) {
      this._blockLabel.style.display = 'none';
    } else {
      const def = BLOCK_DEF[blockId];
      this._blockLabel.textContent = def ? `[ ${def.name.toUpperCase()} ]` : '';
      this._blockLabel.style.display = 'block';
    }
  }

  // ── Inventory overlay ─────────────────────────────────────────────────

  _bindOverlayEvents() {
    this._craftBtn.addEventListener('click', () => this._doCraft());
    document.addEventListener('mousemove', e => this._moveTooltip(e));

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeTab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
        document.getElementById(`tab-${this._activeTab}`)?.style.setProperty('display', 'block');
        if (this._activeTab === 'crafting') this._renderRecipes();
        if (this._activeTab === 'achievements') this._renderAchievements();
        if (this._activeTab === 'codex') this._renderCodexList();
      });
    });
  }

  openInventory(station = 'any') {
    this._currentStation = station;
    this._overlayOpen = true;
    this._overlay.classList.add('open');
    this._activeTab = 'crafting';
    document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    document.querySelectorAll('.tab-panel').forEach((p, i) => p.style.display = i === 0 ? 'block' : 'none');
    this._renderInventory();
    this._renderRecipes();
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
    for (let i = 0; i < 36; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      const item = this.game.player.inventory[i];
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
    const recipes = this.game.craftingSystem.getAvailableRecipes(
      this._currentStation, this.game.player.crafted,
    );

    for (const r of recipes) {
      const card = document.createElement('div');
      card.className = `recipe-card${r.canCraft ? ' craftable' : ''}`;
      const def = getItem(r.output);

      const ingLines = Object.entries(r.ingredients).map(([id, qty]) => {
        const have = this.game.player.countItem(id);
        const idef = getItem(id);
        const ok = have >= qty;
        return `<span class="${ok ? 'ok' : 'missing'}">${ok ? '✓' : '✗'} ${qty}× ${idef?.name ?? id} (${have})</span>`;
      });
      if (r.tool) {
        const have = this.game.player.hasTool(r.tool);
        const tdef = getItem(r.tool);
        ingLines.push(`<span class="${have ? 'ok' : 'missing'}">${have ? '✓' : '✗'} Tool: ${tdef?.name ?? r.tool}</span>`);
      }

      card.innerHTML = `
        <div class="r-name">${def?.icon ?? ''} ${def?.name ?? r.output} ×${r.qty}</div>
        <div class="r-result">${def?.desc ?? ''}</div>
        <div class="r-station">Station: ${r.station}${r.tier ? ` · Tier ${r.tier}` : ''}</div>
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
      if (result.dropped > 0) this.notify('Inventory full — some items were lost!');
      this._renderInventory();
      this._renderRecipes();
      this._selectedRecipe = null;
      this._craftBtn.style.display = 'none';
      this.updateHotbar(this.game.player);
    } else {
      this.notify(`Can't craft: ${result.reason}`);
      this.game.audio.error();
    }
  }

  // ── Achievement tab ───────────────────────────────────────────────────

  _renderAchievements() {
    const list = document.getElementById('ach-list');
    if (!list) return;
    const all = this.game.achievements.getAll();
    list.innerHTML = all.map(a => `
      <div class="ach-item ${a.done ? 'done' : 'locked'}">
        <span class="ach-icon">${a.icon}</span>
        <div class="ach-info">
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.done ? a.desc : '???'}</div>
        </div>
        ${a.done ? '<span class="ach-check">✓</span>' : ''}
      </div>`).join('');
  }

  onAchievement(id) {
    const ach = ACHIEVEMENT_LIST.find(a => a.id === id);
    if (!ach) return;
    this._achieveQueue.push(ach);
    this.game.audio.achievement();
    if (!this._showingAchieve) this._showNextAchieve();
  }

  _showNextAchieve() {
    if (!this._achieveQueue.length) { this._showingAchieve = false; return; }
    this._showingAchieve = true;
    const ach = this._achieveQueue.shift();
    const toast = this._achieveToast;
    document.getElementById('ach-toast-icon').textContent = ach.icon;
    document.getElementById('ach-toast-name').textContent = ach.name;
    document.getElementById('ach-toast-desc').textContent = ach.desc;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => this._showNextAchieve(), 400);
    }, 4000);
  }

  // ── Codex ─────────────────────────────────────────────────────────────

  _buildCodex() {
    if (!this._codexList) return;
    this._codexList.innerHTML = CODEX.map(e => `
      <div class="codex-entry" data-id="${e.id}">
        <span>${e.icon}</span> ${e.title}
      </div>`).join('');
    this._codexList.querySelectorAll('.codex-entry').forEach(el => {
      el.addEventListener('click', () => this._showCodexEntry(el.dataset.id));
    });
  }

  _renderCodexList() { /* already built statically */ }

  _showCodexEntry(id) {
    const entry = CODEX.find(e => e.id === id);
    if (!entry || !this._codexContent) return;
    this._codexContent.innerHTML = `
      <h3>${entry.icon} ${entry.title}</h3>
      <div class="codex-text">${entry.text.split('\n\n').map(p => `<p>${p}</p>`).join('')}</div>`;
  }

  // ── Foreman bubble ────────────────────────────────────────────────────

  showForeman(text) {
    this._foremanText.textContent = text;
    this._foremanBubble.style.display = 'block';
    clearTimeout(this._dismissTimer);
    this._dismissTimer = setTimeout(() => this.hideForeman(), 9000);
    this.game.audio?.earlSpeak();
  }

  hideForeman() { this._foremanBubble.style.display = 'none'; }

  showQuest(quest) {
    this._questTitle.textContent = quest.title;
    this._questSteps.innerHTML = quest.steps.map(s => `<div class="quest-step">${s.label}</div>`).join('');
    this._questBox.style.display = 'block';
  }

  updateQuestProgress(quest, player) {
    const els = this._questSteps.querySelectorAll('.quest-step');
    quest.steps.forEach((s, i) => els[i]?.classList.toggle('done', s.check(player)));
  }

  clearQuest() { this._questBox.style.display = 'none'; }

  // ── Tooltip ───────────────────────────────────────────────────────────

  _showTooltip(e, itemId) {
    const def = getItem(itemId);
    if (!def) return;
    this._tipName.textContent = `${def.icon} ${def.name}`;
    this._tipDesc.textContent = def.desc ?? '';
    this._tooltip.style.display = 'block';
    this._moveTooltip(e);
  }

  _moveTooltip(e) {
    this._tooltip.style.left = (e.clientX + 14) + 'px';
    this._tooltip.style.top  = (e.clientY + 14) + 'px';
  }

  hideTooltip() { this._tooltip.style.display = 'none'; }

  // ── XP Bar ────────────────────────────────────────────────────────────

  setXP(level, progress, skillName = '') {
    if (this._xpFill)       this._xpFill.style.width       = `${Math.round(progress * 100)}%`;
    if (this._xpLevelText)  this._xpLevelText.textContent  = `Lv.${level}`;
    if (this._xpSkillBadge) this._xpSkillBadge.textContent = skillName;
  }

  showLevelUp(level, skill = null) {
    if (!this._levelupToast) return;
    this._luIcon.textContent  = skill?.icon ?? '⬆️';
    this._luTitle.textContent = `LEVEL ${level}`;
    this._luSkill.textContent = skill ? skill.name : '';
    this._levelupToast.classList.add('show');
    clearTimeout(this._luTimer);
    this._luTimer = setTimeout(() => {
      this._levelupToast.classList.remove('show');
    }, 3200);
  }

  // ── Notifications ─────────────────────────────────────────────────────

  notify(text) {
    const el = document.createElement('div');
    el.className = 'notif';
    el.textContent = text;
    this._notifContainer.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
}
