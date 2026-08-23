/**
 * ───────────────────────────────────────────────────────────────────────────
 *  QUEST SYSTEM  —  the facade that wires the framework into the yard
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Tracker (headless engine) + Logbook (the soul) + the game. This is the ONLY
 * game-aware module in src/quests — everything below it is pure data/engine.
 *
 * Wiring doctrine: reuse the yard's existing event stream. The game already
 * emits mining/crafting/program/lap events for achievements and companions —
 * the tracker taps the SAME stream at one point (foreman.onEvent) instead of
 * re-instrumenting the world. One vocabulary, three consumers.
 *
 * DailyContract compatibility (not coupling): briefs may mention "today's
 * contract"; the HUD adds the contract line only if the game has one. No
 * import, no dependency — the comeback lane owns that system.
 */

import { QuestTracker } from './Tracker.js';
import { Logbook } from './Logbook.js';
import { renderQuestHud, openLogbookPanel } from './LogbookPanel.js';
import { FINALE_ARC_GATE } from './schema.js';

export class QuestSystem {
  /**
   * @param {object} game   the Game instance
   * @param {object[]} quests  campaign definitions (from data/index.js)
   */
  constructor(game, quests) {
    this.game = game;

    this.tracker = new QuestTracker({
      quests,
      storage: typeof localStorage !== 'undefined' ? localStorage : null,
      adapter: this._adapter(),
    });
    this.logbook = new Logbook();

    this.tracker.load();

    this._tapEvents();
    this._renderHud();   // the scoreboard paints immediately
    this._hud = null;   // lazy (LogbookPanel)
    this._lastShown = [];
  }

  _adapter() {
    const g = this.game;
    return {
      stats: () => g?.achievements?.stats ?? {},
      crafted: () => g?.player?.crafted ?? new Set(),
      countItem: (id) => g?.player?.countItem?.(id) ?? 0,
      plaquesRead: () => g?._plaquesRead?.size ?? 0,
      lapBestSecs: () => {
        const ms = g?._ovalLapState?.bestMs;
        return Number.isFinite(ms) && ms > 0 ? ms / 1000 : null;
      },
      getTier: (id) => {
        const roster = g?.companions;
        if (!roster) return null;
        if (!roster.data.met.includes(id)) return null;
        return roster.get(id).state.tier ?? 'stranger';
      },
    };
  }

  /** Tap the yard's event streams at their choke points. The foreman tap
   *  carries world events (mine/craft/visit/waypoint); the companion tap
   *  carries the data-rich shared-experience events (lap secs, repairs,
   *  spark consults) — same vocabulary the companions bond on. */
  _tapEvents() {
    const foreman = this.game.foreman;
    if (foreman && !foreman._questTapInstalled) {
      const orig = foreman.onEvent.bind(foreman);
      foreman.onEvent = (event, data) => {
        orig(event, data);
        this.onEvent(event, data);
      };
      foreman._questTapInstalled = true;
    }
    const roster = this.game.companions;
    if (roster && !roster._questTapInstalled) {
      const orig = roster.observe.bind(roster);
      roster.observe = (event, detail) => {
        const rec = orig(event, detail);
        this.onEvent(event, detail);
        return rec;
      };
      roster._questTapInstalled = true;
    }
  }

  /** Old save? Earl's linear chain index becomes completed quests. */
  migrateLegacySave(earlIndex) {
    const had = Object.keys(this.tracker.data.completed).length;
    if (had === 0 && earlIndex > 0) this.tracker.migrateEarlIndex(earlIndex);
  }

  // ── the stream ────────────────────────────────────────────────────────────

  onEvent(event, data) {
    // spark_consult via the roster carries a 30-char note; the TileEditor taps
    // deliver full question text via onSparkAsk — prefer the direct route.
    const done = this.tracker.onEvent(event, data ?? {});
    if (done.length) {
      for (const q of done) this._completeQuest(q);
    }
    this._afterEvents(done);
  }

  /** Spark consults carry their question text — called by the TileEditor taps. */
  onSparkAsk(text) {
    this.onEvent('spark_ask', { text: String(text ?? '') });
  }

  _afterEvents(done) {
    this._renderHud();
    if (done.length) this.game.saveSystem?.markDirty?.();
  }

  // ── completion ────────────────────────────────────────────────────────────

  _completeQuest(q) {
    const day = this.game.dailyContract?.daysPlayed ?? null;
    const entry = this.logbook.record(q, { day });
    const r = q.rewards ?? {};

    // rewards — loot, xp, bond, flags
    for (const l of r.loot ?? []) {
      this.game.player?.addItem?.(l.item, l.qty);
      this.game.ui?.notify(`Quest reward: ${l.qty}× ${l.item.replace(/_/g, ' ')}`);
    }
    if (r.xp) this.game.xpSystem?.gain?.(r.xp);
    for (const [cid, pts] of Object.entries(r.bond ?? {})) {
      const c = this.game.companions?.get?.(cid);
      if (c && pts > 0) {
        c.state.data.bond = (c.state.data.bond ?? 0) + pts;   // quests bond directly
        c.state.save?.();
      }
    }
    for (const f of r.flags ?? []) {
      if (!this.tracker.data.flags.includes(f)) this.tracker.data.flags.push(f);
    }

    // the moment — voice + sound + celebration
    const line = `📓 Logbook: ${q.teaching?.concept ?? q.title} — learned.`;
    const who = q.affinity !== 'earl' ? this.game.companions?.get?.(q.affinity) : null;
    if (who) who.say?.(`Quest complete — ${q.title}. ${q.teaching?.kidPhrase ?? ''}`);
    else this.game.foreman?.sayLine?.(line);
    this.game.audio?.questComplete?.();
    this.game.achievements?.track?.('quest', {});
    if (entry) this.game.ui?.notify?.(`📓 ${entry.memory}`);

    // Prestige — arc / Midnight-Race completion may have earned a mark
    this.game.prestige?.onQuestCompleted?.(q, this.tracker);
  }

  // ── the finale gate (worldbible: any two arcs → the Midnight Race) ───────

  finaleAvailable() {
    return this.tracker.finaleUnlocked(FINALE_ARC_GATE)
      && !this.tracker.isCompleted('finale-midnight-race');
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  /** Active quests, story-pulled: the active companion's arc surfaces first,
   *  then Earl's chain, then everything else. Same events, different logs. */
  displayQuests() {
    const activeId = this.game.companions?.activeId;
    const act = this.tracker.active();
    const score = q => {
      if (q.arc === 'finale') return 0;
      if (q.affinity === activeId) return 1;
      if (q.arc === 'earl') return 2;
      return 3;
    };
    return act.sort((a, b) => score(a) - score(b)).slice(0, 4);
  }

  _renderHud() {
    if (typeof document === 'undefined') return;
    const show = this.displayQuests();
    renderQuestHud(this, show.map(q => ({
      id: q.id,
      title: q.title,
      arc: q.arc,
      affinity: q.affinity,
      objectives: q.objectives.map(o => this.tracker.objectiveStatus(q, o)),
    })), {
      finale: this.finaleAvailable(),
      arcsDone: this.tracker.completedArcs().length,
    });
  }

  // ── logbook access for the panel ─────────────────────────────────────────

  openLogbook() {
    try { openLogbookPanel(this); } catch { /* panel is a garnish, never a crash */ }
  }
}
