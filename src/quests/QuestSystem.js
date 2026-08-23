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
import { renderQuestHud, openLogbookPanel, renderChapterCeremony, renderChapterCompleteCeremony } from './LogbookPanel.js';
import { SpineState } from './Spine.js';
import { SPINE } from './data/index.js';
import { FINALE_ARC_GATE } from './schema.js';
import { Wakes, WAKE_EVENTS } from '../story/Wakes.js';
import { nextStep } from './NextStep.js';

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

    // THE SPINE, live — chapter position + ceremonies + soft bands (Spine.js).
    // After tracker.load(): the migration check needs the loaded completions.
    this.spine = new SpineState({ spine: SPINE, tracker: this.tracker });
    this.spine.load();
    // returning players (progress pre-spine, no spine save) skip the catch-up
    // wall: ceremonies are for chapters reached LIVE, not remembered ones.
    if (!this.spine.data.opened.__ever) {
      if (Object.keys(this.tracker.data.completed).length) this.spine.markAllStartedAsOpened();
      this.spine.data.opened.__ever = true; this.spine.save();
    }
    // returning players also skip completion ceremony catch-up wall
    if (!this.spine.data.completedEver) {
      this.spine.markAllCompletedAsCeremonied();
      this.spine.data.completedEver = true; this.spine.save();
    }
    this._lastChapterIdx = this.spine.currentChapterIndex();

    this._tapEvents();
    this._renderHud();   // the scoreboard paints immediately
    this._checkSpine();  // chapter 1's ceremony greets a truly fresh player
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
    this._checkSpine();
    if (done.length) this.game.saveSystem?.markDirty?.();
  }

  // ── the spine, live (ceremonies + chapter re-key) ─────────────────────

  /** Fire chapter-open ceremonies for newly-reached chapters (once ever,
   *  persisted in SpineState) and re-key the DailyContract when the
   *  player's chapter position advances. Headless-safe: the ceremony DOM
   *  no-ops without a document; position math is pure. */
  _checkSpine() {
    // Thread 3: the yard wakes one dormant thing per completed chapter —
    // and the kid HEARS about it (fail-soft: no spine/wakes, no ceremony).
    try {
      this.wakes ??= new Wakes({ storage: this.game?.storage ?? null });
      const newly = this.wakes.sync(this.spine);
      // CUTSCENE (fail-soft): the FIRST wake ever gets the film treatment —
      // wakes.count()===newly.length means everything awake woke just now.
      // ch9's ghost-track reveal ('wake-oldbot-turn', the Long Route Home)
      // plays the same id — that cutscene IS the ghost-track waking. Fired
      // BEFORE the tease notify; a cutscene must never gate a quest.
      try {
        if (newly.length && this.wakes.count() === newly.length) {
          this.game?.playCutscene?.('wake-first-light');
        } else if (newly.includes('wake-oldbot-turn')) {
          this.game?.playCutscene?.('wake-first-light');
        }
      } catch { /* cinema is a garnish */ }
      for (const id of newly) this._wakeTease(id);
    } catch { /* the spine never leans on the wakes */ }
    for (const c of this.spine.dueCeremonies()) {
      this.spine.markOpened(c.id);
      const withN = { ...c, n: this.spine.indexOf(c.id) };
      try { renderChapterCeremony(this.game, withN); } catch { /* DOM-optional */ }
    }
    for (const c of this.spine.dueCompletedCeremonies()) {
      this.spine.markCompleted(c.id);
      const withN = { ...c, n: this.spine.indexOf(c.id) };
      // CUTSCENE (fail-soft): ch12's close IS the finale moment — the film
      // plays first and the completion card lands in its onDone. Sequencing
      // choice: onDone-deferred (not fire-and-continue) so the card never
      // talks over the film; playCutscene fires onDone IMMEDIATELY (fail-soft)
      // when the cinema is absent, so the card can never be stranded either.
      if (c.id === 'ch12') {
        try {
          this.game?.playCutscene?.('finale-candlelight', {
            onDone: () => {
              try { renderChapterCompleteCeremony(this.game, withN); } catch { /* DOM-optional */ }
            },
          });
          continue;   // ceremony handled by the cutscene's onDone
        } catch { /* fall through to the direct ceremony below */ }
      }
      try { renderChapterCompleteCeremony(this.game, withN); } catch { /* DOM-optional */ }
    }
    const idx = this.spine.currentChapterIndex();
    if (idx !== this._lastChapterIdx) {
      this._lastChapterIdx = idx;
      this.game.dailyContract?.onChapter?.(this.spine.chapter(idx));
    }
  }

  // ── completion ────────────────────────────────────────────────────────────

  /** A dormant thing woke — one gentle tease, once ever (Wakes.sync only
   *  reports newly-woken). Subtle by design: a notify, a spark-crackle, and
   *  the companion noticing. No quest, no objective — the yard noticed. */
  _wakeTease(wakeId) {
    const ev = WAKE_EVENTS.find(e => e.id === wakeId);
    if (!ev) return;
    const game = this.game;
    game?.ui?.notify?.(`👁 Something in the yard just woke — <b>${ev.name}</b>.`);
    try { game?.audio?.spark?.(); } catch { /* audio optional */ }
    try {
      game?.companions?.active?.say?.(
        `Did you feel that? ${ev.name} — it hasn't stirred in years. The yard's paying attention to you.`,
        { mood: 'happy', event: 'wake' },
      );
    } catch { /* companions optional */ }
  }

  _completeQuest(q) {
    // Concept ladder — completion is the objective-evidence rung (fail-soft).
    try { this.game.concepts?.observe({ type: 'quest_done', questId: q.id }); } catch { /* garnish */ }
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

    // A finished quest may have made a concept teach-back-eligible — one
    // gentle pointer at the Logbook, then silence (fail-soft).
    try { this.game._maybeTeachBackNudge?.(); } catch { /* garnish */ }
  }

  // ── the finale gate (worldbible: any two arcs → the Midnight Race) ───────

  /** Two roads to the race (docs/SPINE.md): any two companion arcs, OR the
   *  spine itself — every pre-finale carrier walked. Either way, the kid
   *  arrives with muscles the last lap trusts. */
  finaleAvailable() {
    return !this.tracker.isCompleted('finale-midnight-race')
      && (this.tracker.finaleUnlocked(FINALE_ARC_GATE)
        || this.spine?.spineCompletePreFinale?.());
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
    // Concept ladder — a quest surfacing in the log IS a sighting (once per
    // quest per session; the ledger does the counting). DOM-only on purpose:
    // headless construction stays inert.
    try {
      this._conceptsSeen ??= new Set();
      for (const q of show) {
        if (this._conceptsSeen.has(q.id)) continue;
        this._conceptsSeen.add(q.id);
        this.game.concepts?.observe({ type: 'quest_seen', questId: q.id });
      }
    } catch { /* the ladder is garnish */ }
    renderQuestHud(this, show.map(q => ({
      id: q.id,
      title: q.title,
      arc: q.arc,
      affinity: q.affinity,
      objectives: q.objectives.map(o => this.tracker.objectiveStatus(q, o)),
    })), {
      finale: this.finaleAvailable(),
      arcsDone: this.tracker.completedArcs().length,
      nextStep: nextStep(this.tracker, show, { finale: this.finaleAvailable() }),
    });
  }

  // ── logbook access for the panel ─────────────────────────────────────────

  openLogbook() {
    try { openLogbookPanel(this); } catch { /* panel is a garnish, never a crash */ }
  }
}
