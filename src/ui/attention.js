/**
 * ───────────────────────────────────────────────────────────────────────────
 *  ATTENTION DISCIPLINE  —  one voice per moment (playtest finding #1)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The first-five-minutes bug: at the yard gate, FIVE voices shout at once —
 * Earl's tutorial dialog (foreman bubble + mission card), the quest panel
 * ("Mine 5 iron"), the Salvage Run chip ("Collect 4 copper"), the Daily
 * Contract chip, and the gate itself. A hesitant kid freezes here; there are
 * two competing objectives (iron quest vs copper salvage) with no stated
 * priority.
 *
 * This module makes the UI take turns (fail-soft, additive):
 *
 *   1. TAKE TURNS — while the gate/entry overlay is open (companion gate or
 *      onboarding wizard), the quest panel AND the secondary chips collapse
 *      to slim headers. They unfold only after the gate closes. While Earl's
 *      tutorial dialog is mid-beat (foreman bubble / mission card / Earl
 *      chat), the secondary chips stay collapsed. One voice per moment.
 *
 *   2. SECONDARY OBJECTIVES SAY "later" — until the FIRST quest (earl-1,
 *      "Mine 5 iron scrap") completes, the Salvage Run and Daily Contract
 *      chips render dimmed + collapsed with a subtle "Earl's mission first"
 *      cue. The moment it completes, they unfold with a small fanfare beat
 *      (once per session).
 *
 *   3. The ➜ NEXT row stays authoritative throughout — the quest panel is
 *      only ever collapsed while the gate owns the screen; the moment the
 *      gate closes it unfolds, and the ➜ NEXT row is its first line.
 *
 * Design:
 *   - PURE decisions (`chipAttention`, `questPanelAttention`) — headless
 *     testable, no DOM.
 *   - `readAttentionContext` — fail-soft DOM reads (every lookup optional).
 *   - `AttentionDirector` — the per-frame applier (throttled, dirty-checked,
 *     idempotent). Reuses the existing `.hud-panel.collapsed` mechanism so
 *     the collapse toggle, the slim-header CSS, and renderQuestHud's
 *     collapse-state restore all keep working unchanged.
 *   - Missing systems degrade to the pre-fix behavior: no quest tracker → the
 *     first quest counts as done (chips open); no DOM → no-ops.
 */

export const FIRST_QUEST_ID = 'earl-1';
export const DEFER_CUE = 'Earl’s mission first — this opens when it’s done.';
export const FANFARE_NOTIFY = '📋 Salvage Run & Daily Contract are on the board — Earl’s first mission is done.';

/**
 * PURE — the chip state for a SECONDARY objective (Salvage Run / Daily).
 * @param {object} ctx
 * @param {boolean} ctx.gateOpen      entry overlay (gate/wizard) owns the screen
 * @param {boolean} ctx.earlTalking   Earl's tutorial dialog is mid-beat
 * @param {boolean} ctx.firstQuestDone the campaign's FIRST quest is complete
 * @param {boolean} [ctx.playerCollapsed] the player manually collapsed the chip
 * @returns {{collapsed: boolean, cue: boolean}} collapsed = slim header;
 *   cue = show the "Earl's mission first" note in the header.
 */
export function chipAttention({ gateOpen, earlTalking, firstQuestDone, playerCollapsed = false }) {
  if (gateOpen || earlTalking) return { collapsed: true, cue: false };
  if (!firstQuestDone) return { collapsed: true, cue: true };
  return { collapsed: !!playerCollapsed, cue: false };
}

/**
 * PURE — the quest panel (the ➜ NEXT surface). Collapsed ONLY while the gate
 * owns the screen; otherwise open (authoritative). Earl mid-beat does NOT
 * collapse it — the mission card and the quest panel reinforce each other.
 * @returns {{collapsed: boolean}}
 */
export function questPanelAttention({ gateOpen }) {
  return { collapsed: !!gateOpen };
}

/**
 * Read the attention context from the DOM + game. Every read is optional:
 * missing elements, a missing document, or a missing quest tracker all
 * degrade to safe defaults. No tracker → the first quest counts as done
 * (chips open — exactly the pre-fix behavior, so a quest-less build is
 * never left with permanently-deferred chips).
 */
export function readAttentionContext(doc, game) {
  if (!doc || typeof doc.getElementById !== 'function') {
    return { gateOpen: false, earlTalking: false, firstQuestDone: false };
  }
  const gateOpen =
    !!doc.getElementById('companion-gate') ||
    !!doc.getElementById('onboarding-wizard');

  const foreman = doc.getElementById('foreman-bubble');
  const foremanVisible = !!foreman && foreman.style?.display === 'block';
  const mission = doc.getElementById('mission-card');
  const tutorialActive = !!mission && mission.classList?.contains?.('show');
  const earlTalking = foremanVisible || tutorialActive || !!doc.getElementById('earl-chat');

  const tracker = game?.quests?.tracker;
  const firstQuestDone = !tracker ? true : !!tracker.isCompleted?.(FIRST_QUEST_ID);

  return { gateOpen, earlTalking, firstQuestDone };
}

/**
 * AttentionDirector — throttled per-frame applier. Reads the context, then
 * forces the three HUD panels into the disciplined states. Dirty-checked:
 * steady state costs a few classList reads, zero writes.
 */
export class AttentionDirector {
  /**
   * @param {object} [game] the Game instance (duck-typed; may be null)
   * @param {object} [opts]
   * @param {Document} [opts.doc] injectable document (tests); default global
   * @param {number} [opts.syncMs] throttle for sync(); default 150ms
   * @param {number} [opts.fanfareMs] unfold animation length; default 1000ms
   */
  constructor(game, opts = {}) {
    this._game = game;
    this._doc = opts.doc ?? null;
    this._syncMs = opts.syncMs ?? 150;
    this._fanfareMs = opts.fanfareMs ?? 1000;
    this._lastSync = 0;
    this._ctx = null;
    this._wasGateOpen = false;
    this._chipPhase = null;    // 'hush' | 'deferred' | 'open'
    this._ready = false;
    this._fanfared = false;
  }

  /** Force a sync (bypasses the throttle). */
  sync(force = false) {
    const doc = this._doc ?? (typeof document !== 'undefined' ? document : null);
    const game = this._game;
    if (!doc || !game) return;
    const now = Date.now();
    if (!force && now - this._lastSync < this._syncMs) return;
    this._lastSync = now;

    const ctx = readAttentionContext(doc, game);
    this._ctx = ctx;

    const quest = doc.getElementById('quest-log-hud');
    const chips = [
      doc.getElementById('challenge-hud'),
      doc.getElementById('daily-hud'),
    ].filter(Boolean);

    // First sync ever: adopt the current state SILENTLY. A returning player
    // (first quest long done) starts with chips open and no fanfare — the
    // fanfare is reserved for the pending → open transition we observe live.
    if (!this._ready) {
      this._ready = true;
      this._fanfared = ctx.firstQuestDone;
      if (ctx.gateOpen) {
        this._setPanel(quest, 'collapsed');
        for (const chip of chips) this._setPanel(chip, 'collapsed');
        this._chipPhase = 'hush';
      } else if (!ctx.firstQuestDone) {
        for (const chip of chips) this._setPanel(chip, 'deferred', DEFER_CUE);
        this._chipPhase = 'deferred';
      } else {
        this._chipPhase = 'open';
      }
      this._wasGateOpen = ctx.gateOpen;
      return;
    }

    // ── (1) Quest panel — collapsed while the gate owns the screen; it
    // unfolds the moment the gate closes and stays authoritative after. ──
    if (ctx.gateOpen) {
      this._setPanel(quest, 'collapsed');
    } else if (this._wasGateOpen) {
      this._setPanel(quest, 'open');
    }
    this._wasGateOpen = ctx.gateOpen;

    // ── (2) Secondary chips — one voice per moment. ──
    if (ctx.gateOpen || ctx.earlTalking) {
      for (const chip of chips) this._setPanel(chip, 'collapsed');
      this._chipPhase = 'hush';
    } else if (!ctx.firstQuestDone) {
      for (const chip of chips) this._setPanel(chip, 'deferred', DEFER_CUE);
      this._chipPhase = 'deferred';
    } else {
      if (this._chipPhase !== 'open') {
        for (const chip of chips) this._setPanel(chip, 'open');
        if (!this._fanfared) {
          this._fanfared = true;
          this._fanfare(chips);
        }
        this._chipPhase = 'open';
      }
      // 'open' phase: chips follow the player's own collapse toggle from here.
    }
  }

  /** One-time unfold celebration when the first quest completes. */
  onFirstQuestDone() {
    this.sync(true);
  }

  /** True while secondary voices should stay quiet (gate open / Earl mid-
   *  beat). Fail-soft: no context available → false (callers speak as before). */
  hushed() {
    if (!this._ctx) {
      const doc = this._doc ?? (typeof document !== 'undefined' ? document : null);
      if (doc) this._ctx = readAttentionContext(doc, this._game);
    }
    return this._ctx ? this._ctx.gateOpen || this._ctx.earlTalking : false;
  }

  /** Apply one panel state. Modes: 'open' | 'collapsed' | 'deferred'.
   *  Reuses the existing .hud-panel.collapsed mechanism; 'deferred' adds
   *  the dim + the header cue line. Dirty-checked (no writes when steady). */
  _setPanel(panel, mode, cue = null) {
    if (!panel) return;
    const collapsed = mode !== 'open';
    const deferred = mode === 'deferred';
    if (panel.classList.contains('collapsed') !== collapsed) {
      panel.classList.toggle('collapsed', collapsed);
      panel.setAttribute('data-collapsed', String(collapsed));
    }
    if (panel.classList.contains('deferred') !== deferred) {
      panel.classList.toggle('deferred', deferred);
    }
    const note = panel.querySelector?.('.hud-defer-note');
    if (note && note.textContent !== (cue ?? '')) note.textContent = cue ?? '';
  }

  _fanfare(chips) {
    for (const chip of chips) {
      chip.classList.remove('unfold');
      if ('offsetWidth' in chip) void chip.offsetWidth;   // restart the animation
      chip.classList.add('unfold');
      setTimeout(() => chip.classList.remove('unfold'), this._fanfareMs);
    }
    try {
      this._game?.ui?.notify?.(FANFARE_NOTIFY);
    } catch { /* a notify must never crash the yard */ }
  }
}
