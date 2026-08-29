/**
 * ───────────────────────────────────────────────────────────────────────────
 *  BUILD PANEL  —  the [E] physical-assembly menu
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  The first of the two E-menus (DESIGN_BRIEF_e_menus_and_chips.md). One slot
 *  per part type — chassis, wheels, motors, battery, and the Arduino (tin
 *  brain) with its TWO CHIP SOCKETS. What you bolt together here is what
 *  PROGRAM is allowed to assume: no wheels → no drive tiles; no Arduino →
 *  no sockets → no chips.
 *
 *  It also hosts the chip GROWTH bench (wafer + failure shards → acid bath →
 *  cold shelf → crystal) because growing a part IS building it. The shelf is
 *  a real timer ticked by the game loop (Game.tick → chipForge.tick), not by
 *  this panel — closing the panel doesn't pause the night.
 *
 *  Shares the tile editor's .te-* panel styling (same frame, same buttons).
 *  DOM overlay only: no behaviour beyond equipping/mounting — the compile
 *  gate and the ChipForge own the rules.
 */

import { ITEMS } from '../data/items.js';
import { CHIPS, CHIP_IDS, SOCKET_COUNT, MAX_SHARDS, SHARD_CRACK_THRESHOLD, SHELF_MS } from '../maker/Chips.js';

/** BUILD slots: part type → inventory item that fills it. */
export const BUILD_SLOTS = [
  { key: 'chassis', item: 'bot_chassis',  label: 'CHASSIS', hint: 'the frame everything bolts to' },
  { key: 'wheels',  item: 'wheel_set',    label: 'WHEELS',  hint: 'no wheels, no drive tiles' },
  { key: 'motors',  item: 'motor_driver', label: 'MOTORS',  hint: 'L298N — the muscle' },
  { key: 'battery', item: 'battery_pack', label: 'BATTERY', hint: 'what EMBER guards' },
  { key: 'arduino', item: 'tin_brain',    label: 'ARDUINO', hint: 'two chip sockets live here' },
];

export class BuildPanel {
  /** @param {import('../Game.js').Game} game */
  constructor(game) {
    this._game = game;
    this._open = false;
    this._rafId = null;
    this._growType = 'echo';       // chip selected in the growth bench
    this._growShards = 0;
    this._buildDOM();
  }

  get isOpen() { return this._open; }

  // ── DOM ─────────────────────────────────────────────────────────────────────

  _buildDOM() {
    const old = document.getElementById('build-panel');
    if (old) old.remove();

    const p = document.createElement('div');
    p.id = 'build-panel';
    p.style.display = 'none';
    p.innerHTML = `
      <div class="te-header">
        <span class="te-title">🛠 BUILD — BOLT YOUR BOT TOGETHER</span>
        <div class="te-header-actions">
          <button id="bp-craft-btn" class="te-btn" title="Open the crafting workshop">⚒ CRAFT</button>
          <button id="bp-close-btn" class="te-btn">✕</button>
        </div>
      </div>
      <div class="bp-body">
        <div class="bp-col bp-assembly">
          <div class="bp-col-title">PARTS — drag or click to slot</div>
          <div id="bp-slots" class="bp-slots"></div>
          <div class="bp-note">What you bolt here is what PROGRAM may assume.<br>
            No wheels → no drive blocks. No Arduino → no chip sockets.</div>
        </div>
        <div class="bp-col bp-chips">
          <div class="bp-col-title">CHIP SOCKETS — grow a crystal, mount it</div>
          <div id="bp-sockets" class="bp-sockets"></div>
          <div class="bp-col-title" style="margin-top:14px;">GROWTH BENCH — acid bath + cold shelf</div>
          <div id="bp-grow" class="bp-grow"></div>
        </div>
      </div>`;
    document.body.appendChild(p);

    this._panel = p;
    p.querySelector('#bp-close-btn').addEventListener('click', () => this.close());
    p.querySelector('#bp-craft-btn').addEventListener('click', () => {
      this.close();
      const st = this._game?.ui?._currentStation ?? 'workbench';
      this._game?.ui?.openInventory(st);
    });
    this._render();
  }

  // ── open / close ────────────────────────────────────────────────────────────

  open() {
    if (!this._panel) this._buildDOM();
    this._panel.style.display = 'flex';
    this._open = true;
    this._game?.observer?.menuOpen?.('build_bench');
    this._render();
    this._startShelfTicker();
  }

  close() {
    if (!this._panel) return;
    this._panel.style.display = 'none';
    this._open = false;
    this._game?.observer?.menuClose?.('build_bench');
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }

  /** Keep the shelf countdown live while open. The forge itself ticks in the
   *  game loop — this is just the clock face. */
  _startShelfTicker() {
    const step = () => {
      if (!this._open) return;
      this._tickShelfClocks();
      this._rafId = requestAnimationFrame(step);
    };
    if (!this._rafId) this._rafId = requestAnimationFrame(step);
  }

  _tickShelfClocks() {
    const forge = this._game?.chipForge;
    if (!forge) return;
    this._panel.querySelectorAll('[data-grow-uid]').forEach(el => {
      const g = forge.growing.find(x => x.uid === el.dataset.growUid);
      if (!g) return;
      const rem = forge.shelfRemaining(g);
      el.textContent = this._fmtRemaining(rem);
      if (rem <= 0) this._render();   // crack it free — full re-render
    });
  }

  _fmtRemaining(ms) {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ── rendering ───────────────────────────────────────────────────────────────

  _render() {
    if (!this._panel || !this._open) return;
    this._renderSlots();
    this._renderSockets();
    this._renderGrow();
  }

  _renderSlots() {
    const wrap = this._panel.querySelector('#bp-slots');
    wrap.innerHTML = '';
    const asm = this._game.botAssembly ?? {};

    for (const slot of BUILD_SLOTS) {
      const def = ITEMS[slot.item];
      const owned = this._game.player?.countItem?.(slot.item) ?? 0;
      const equipped = !!asm[slot.key];

      const el = document.createElement('div');
      el.className = 'bp-slot' + (equipped ? ' bp-slot-filled' : '');
      el.innerHTML = equipped
        ? `<span class="bp-slot-icon">${def?.icon ?? '?'}</span>`
          + `<span class="bp-slot-txt"><b>${def?.name ?? slot.item}</b><br><span class="bp-slot-sub">✓ bolted on — click to unslot</span></span>`
        : `<span class="bp-slot-icon bp-slot-empty">＋</span>`
          + `<span class="bp-slot-txt"><b>${slot.label}</b><br><span class="bp-slot-sub">${owned > 0
            ? `have ${owned}× ${def?.name ?? ''} — click to bolt on`
            : `${slot.hint} — craft ${def?.name ?? slot.item} first`}</span></span>`;

      // drag-part-to-slot (from anywhere in the panel) + click twin
      el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('bp-slot-over'); });
      el.addEventListener('dragleave', () => el.classList.remove('bp-slot-over'));
      el.addEventListener('drop', e => {
        e.preventDefault(); el.classList.remove('bp-slot-over');
        const item = e.dataTransfer.getData('text/scrap-item');
        if (item === slot.item) this._equip(slot);
      });
      el.addEventListener('click', () => {
        if (equipped) this._unequip(slot);
        else if (owned > 0) this._equip(slot);
        else this._game.ui?.notify(`Craft a ${ITEMS[slot.item]?.name ?? slot.item} first (⚒ CRAFT).`);
      });
      wrap.appendChild(el);
    }

    // parts bin: what the kid owns, draggable toward the slots
    const bin = document.createElement('div');
    bin.className = 'bp-bin';
    bin.innerHTML = '<div class="bp-bin-title">PARTS BIN</div>';
    let any = false;
    for (const slot of BUILD_SLOTS) {
      const n = this._game.player?.countItem?.(slot.item) ?? 0;
      if (n <= 0) continue;
      any = true;
      const def = ITEMS[slot.item];
      const chip = document.createElement('div');
      chip.className = 'bp-part';
      chip.draggable = true;
      chip.innerHTML = `${def?.icon ?? '?'} <span>${def?.name ?? slot.item} ×${n}</span>`;
      chip.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/scrap-item', slot.item);
        e.dataTransfer.effectAllowed = 'copy';
      });
      chip.addEventListener('click', () => this._equip(slot));   // tap twin
      bin.appendChild(chip);
    }
    if (!any) bin.innerHTML += '<div class="bp-slot-sub">empty — craft parts ⚒</div>';
    wrap.appendChild(bin);
  }

  _renderSockets() {
    const wrap = this._panel.querySelector('#bp-sockets');
    wrap.innerHTML = '';
    const forge = this._game.chipForge;
    const asm = this._game.botAssembly ?? {};
    if (!forge) return;

    if (!asm.arduino) {
      wrap.innerHTML = '<div class="bp-note">Slot an ARDUINO (Tin Brain) to open the sockets.</div>';
      return;
    }

    for (let i = 0; i < SOCKET_COUNT; i++) {
      const chip = forge.mounted[i];
      const el = document.createElement('div');
      el.className = 'bp-socket' + (chip ? ' bp-socket-filled' : '');
      if (chip) {
        const cd = CHIPS[chip.type];
        el.innerHTML = `<span class="bp-socket-icon">${cd?.icon ?? '◈'}</span>`
          + `<span class="bp-socket-txt"><b>${cd?.label ?? chip.type}</b> ${chip.cracked ? '<span class="bp-cracked">cracked ⚠</span>' : ''}<br>`
          + `<span class="bp-slot-sub">mask: ${cd?.mask ?? '?'} — click to unmount</span></span>`;
        el.title = `seed ${chip.seed}${chip.cracked ? ` · timing mumbles ±15% (${chip.jitter.toFixed(2)}×)` : ''}`;
        el.addEventListener('click', () => {
          forge.unmount(i);
          this._game.ui?.notify(`◈ ${cd?.label} chip unmounted — its tile is now locked.`);
          this._onChipsChanged();
        });
      } else {
        const ready = forge.ready.length;
        el.innerHTML = `<span class="bp-socket-icon bp-slot-empty">⬡</span>`
          + `<span class="bp-socket-txt"><b>SOCKET ${i + 1}</b><br><span class="bp-slot-sub">${ready ? `${ready} chip${ready > 1 ? 's' : ''} on the shelf — click to mount` : 'empty — grow a chip below'}</span></span>`;
        el.addEventListener('click', () => {
          if (!forge.ready.length) return;
          // mount the first ready chip (list order = shelf order)
          const c = forge.ready[0];
          if (forge.mount(c.uid, i)) {
            this._game.ui?.notify(`${CHIPS[c.type]?.icon ?? ''} ${CHIPS[c.type]?.label} mounted — its agentic tile is unlocked in PROGRAM.`);
            this._game.audio?.craft?.();
            this._onChipsChanged();
          }
        });
      }
      // drop a ready chip by uid
      el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('bp-slot-over'); });
      el.addEventListener('dragleave', () => el.classList.remove('bp-slot-over'));
      el.addEventListener('drop', e => {
        e.preventDefault(); el.classList.remove('bp-slot-over');
        const uid = e.dataTransfer.getData('text/scrap-chip');
        if (uid && forge.mount(uid, i)) {
          const c = forge.mounted[i];
          this._game.ui?.notify(`${CHIPS[c.type]?.icon ?? ''} ${CHIPS[c.type]?.label} mounted.`);
          this._onChipsChanged();
        }
      });
      wrap.appendChild(el);
    }

    // shelf of grown-but-unmounted chips (draggable into sockets)
    if (forge.ready.length) {
      const shelf = document.createElement('div');
      shelf.className = 'bp-bin';
      shelf.innerHTML = '<div class="bp-bin-title">GROWN CHIPS — drag to a socket</div>';
      for (const c of forge.ready) {
        const cd = CHIPS[c.type];
        const el = document.createElement('div');
        el.className = 'bp-part bp-chip' + (c.cracked ? ' bp-chip-cracked' : '');
        el.draggable = true;
        el.innerHTML = `${cd?.icon ?? '◈'} <b>${cd?.label ?? c.type}</b>${c.cracked ? ' ⚠ cracked' : ''} <span class="bp-slot-sub">${cd?.mask ?? ''}</span>`;
        el.title = `seed ${c.seed} · ${c.shards} shards${c.cracked ? ` · timing ±15% (${c.jitter.toFixed(2)}×)` : ''}`;
        el.addEventListener('dragstart', e => {
          e.dataTransfer.setData('text/scrap-chip', c.uid);
          e.dataTransfer.effectAllowed = 'copy';
        });
        shelf.appendChild(el);
      }
      wrap.appendChild(shelf);
    }
  }

  _renderGrow() {
    const wrap = this._panel.querySelector('#bp-grow');
    wrap.innerHTML = '';
    const forge = this._game.chipForge;
    if (!forge) return;
    const player = this._game.player;

    // ── chip type picker ──
    const picker = document.createElement('div');
    picker.className = 'bp-picker';
    for (const id of CHIP_IDS) {
      const cd = CHIPS[id];
      const btn = document.createElement('button');
      btn.className = 'bp-chip-btn' + (this._growType === id ? ' bp-chip-btn-active' : '');
      btn.innerHTML = `${cd.icon} ${cd.label}`;
      btn.title = `mask: ${cd.mask} (${cd.maskHint}) · unlocks the ${cd.tileLabel} tile`;
      btn.addEventListener('click', () => { this._growType = id; this._render(); });
      picker.appendChild(btn);
    }
    wrap.appendChild(picker);

    const sel = CHIPS[this._growType];
    const growingThis = forge.growing.find(g => g.type === this._growType);

    // ── shards stepper ──
    const row = document.createElement('div');
    row.className = 'bp-shard-row';
    const risk = this._growShards > SHARD_CRACK_THRESHOLD
      ? ` <span class="bp-cracked">crack risk — past ${SHARD_CRACK_THRESHOLD} shards the seed decides</span>`
      : ` <span class="bp-slot-sub">${sel.temperament}</span>`;
    row.innerHTML = `<span class="bp-slot-sub">failure shards in the bath:</span>`
      + ` <button class="te-btn" id="bp-shard-minus">−</button>`
      + ` <b class="bp-shard-count">${this._growShards}</b>`
      + ` <button class="te-btn" id="bp-shard-plus">＋</button>`
      + risk;
    row.querySelector('#bp-shard-minus').addEventListener('click', () => {
      this._growShards = Math.max(0, this._growShards - 1); this._render();
    });
    row.querySelector('#bp-shard-plus').addEventListener('click', () => {
      this._growShards = Math.min(MAX_SHARDS, this._growShards + 1); this._render();
    });
    wrap.appendChild(row);

    // ── start / status ──
    const wafers = player?.countItem?.('salvaged_wafer') ?? 0;
    const acids  = player?.countItem?.('acid_vial') ?? 0;
    const shards = player?.countItem?.('failure_shard') ?? 0;

    if (growingThis) {
      const status = document.createElement('div');
      status.className = 'bp-shelf-status';
      status.innerHTML = `<span>${CHIPS[growingThis.type].icon} ${CHIPS[growingThis.type].label} on the cold shelf — </span>`
        + `<b data-grow-uid="${growingThis.uid}">${this._fmtRemaining(forge.shelfRemaining(growingThis))}</b>`
        + `<span class="bp-slot-sub"> (real minutes; close the panel, the night continues)</span>`;
      wrap.appendChild(status);
    } else {
      const canGrow = wafers >= 1 && acids >= 1 && shards >= this._growShards;
      const btn = document.createElement('button');
      btn.className = 'te-btn te-btn-run';
      btn.innerHTML = `🌱 START GROWTH <span class="bp-slot-sub">(1 ⬡ wafer + 1 🧪 acid${this._growShards ? ` + ${this._growShards} 🔻` : ''})</span>`;
      btn.disabled = !canGrow;
      if (!canGrow) btn.title = 'Need: 1 salvaged wafer, 1 acid vial, and the shards shown (craft them ⚒)';
      btn.addEventListener('click', () => this._startGrowth());
      wrap.appendChild(btn);
      const inv = document.createElement('div');
      inv.className = 'bp-slot-sub';
      inv.innerHTML = `in stock: ⬡ ${wafers} · 🧪 ${acids} · 🔻 ${shards} — shelf time ${Math.round(SHELF_MS / 60000)} min`;
      wrap.appendChild(inv);
    }

    // other growths in flight
    for (const g of forge.growing) {
      if (g.type === this._growType) continue;
      const el = document.createElement('div');
      el.className = 'bp-slot-sub';
      el.innerHTML = `${CHIPS[g.type].icon} ${CHIPS[g.type].label} also on the shelf — <b data-grow-uid="${g.uid}">${this._fmtRemaining(forge.shelfRemaining(g))}</b>`;
      wrap.appendChild(el);
    }

    // collected-but-uncollected notice (ready chips show up by the sockets)
    if (forge.ready.length) {
      const el = document.createElement('div');
      el.className = 'bp-slot-sub';
      el.innerHTML = `✨ ${forge.ready.length} chip${forge.ready.length > 1 ? 's' : ''} cracked free — mount above.`;
      wrap.appendChild(el);
    }
  }

  // ── actions ─────────────────────────────────────────────────────────────────

  _equip(slot) {
    const asm = this._game.botAssembly;
    if (asm[slot.key]) return;
    if (!this._game.player?.removeItem?.(slot.item, 1)) return;
    asm[slot.key] = true;
    this._game.audio?.craft?.();
    this._game.ui?.notify(`${ITEMS[slot.item]?.icon ?? ''} ${ITEMS[slot.item]?.name ?? slot.item} bolted on.`);
    this._game.saveSystem?.markDirty();
    this._render();
  }

  _unequip(slot) {
    const asm = this._game.botAssembly;
    if (!asm[slot.key]) return;
    // unslotting the Arduino pops both chips back to the shelf
    if (slot.key === 'arduino' && this._game.chipForge) {
      for (let i = 0; i < SOCKET_COUNT; i++) this._game.chipForge.unmount(i);
      this._onChipsChanged();
    }
    asm[slot.key] = false;
    this._game.player?.addItem?.(slot.item, 1);
    this._game.ui?.notify(`${ITEMS[slot.item]?.name ?? slot.item} unslotted — back in inventory.`);
    this._game.saveSystem?.markDirty();
    this._render();
  }

  _startGrowth() {
    const forge = this._game.chipForge;
    const player = this._game.player;
    if (!forge || !player) return;
    const n = this._growShards;
    if ((player.countItem?.('salvaged_wafer') ?? 0) < 1 || (player.countItem?.('acid_vial') ?? 0) < 1) return;
    if ((player.countItem?.('failure_shard') ?? 0) < n) return;
    if (!forge.startGrowth(this._growType, n)) return;
    player.removeItem('salvaged_wafer', 1);
    player.removeItem('acid_vial', 1);
    if (n > 0) player.removeItem('failure_shard', n);
    this._game.audio?.craft?.();
    this._game.ui?.notify(`🧪 ${CHIPS[this._growType].label} wafer seeded — onto the cold shelf. Check back in ${Math.round(SHELF_MS / 60000)} minutes.`);
    this._game.saveSystem?.markDirty();
    this._render();
  }

  /** Chip set changed → the running program's gates may have changed. */
  _onChipsChanged() {
    this._game.saveSystem?.markDirty();
    this._render();
  }
}
