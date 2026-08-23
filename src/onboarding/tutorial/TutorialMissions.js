/**
 * ───────────────────────────────────────────────────────────────────────────
 *  TUTORIAL MISSIONS — gamified quest-like progression with event-driven
 *  step tracking, companion reactions, medal thresholds, and persistence.
 *
 * Headless engine: no DOM at module scope, state only via injected events.
 * All game events are injectable (Game.js calls notify(event, payload)).
 * Storage is injectable (localStorage in-game, Map in tests).
 *
 * Missions are once-per-kid ceremonies (persistent via storage).
 * Medals: speedster (sub-threshold time), style (hints shown <10s before
 * events), veteran (fast-skip from later-step events showing competence).
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * Tutorial missions: quest-like progression with event-driven step advancement,
 * companion reactions, and medal thresholds. All data; no DOM or imports.
 * @type {Array<{id: string, title: string, icon: string, brief: string, steps: Array, rivetLines: Object, reward: Object}>}
 */
export const TUTORIAL_MISSIONS = [
  {
    id: 'tm-first-steps',
    title: 'First Steps',
    icon: '🚶',
    brief: 'Learn the yard by walking it.',
    steps: [
      { id: 'walk',   hint: 'Press <b>W A S D</b> to walk', event: 'move',           medalSecs: 20 },
      { id: 'mine',   hint: 'Hold <b>left-click</b> on a <b>Rust Heap</b>', event: 'mine', medalSecs: 45 },
      { id: 'bench',  hint: 'Press <b>E</b> — the Workshop turns piles into parts', event: 'open_bench', medalSecs: 30 },
      { id: 'maker',  hint: 'Press <b>T</b> — bots get brains here', event: 'open_maker', medalSecs: 30 },
      { id: 'run',    hint: 'Press <b>▶ RUN</b> to test your bot', event: 'program_run', medalSecs: 60 },
      { id: 'build',  hint: 'Click <b>⚡ BUILD IT</b> for real firmware', event: 'build', medalSecs: 90, optional: true },
    ],
    // Rivet voice: warm, quick, funny (read spine.json for persona reference)
    rivetLines: {
      walk: 'Walking works! You passed the test. Next: see that rust heap? It wants to be mined. Hold left-click on it — trust me, it likes it.',
      mine: 'Look at all that scrap you OWN now. Press E — the workshop turns piles into parts. Alchemy, but with hammers.',
      bench: 'Ok, big moment: press T. The Maker Lab is where bots get brains. Earl pre-loaded yours. He acts casual, but he prepared.',
      maker: null, // Maker Lab has the floor; no Rivet line here
      run: 'You just ran your OWN program! Want the real thing? Hit BUILD IT — real firmware, real board, real wheels. I get chatty when I\'m excited. This is me being chill.',
      build: null, // Optional step; no guaranteed reaction
    },
    reward: { xp: 20, note: 'Mission complete!' },
  },
];

/**
 * Headless mission engine: processes game events, tracks progress, awards medals.
 * State: currentMission, currentStep, startedAt, hintShownAt (per-step timestamp
 * when hint rendered), medalsEarned (mission→medal map), skipped, done.
 * Storage is injectable (localStorage in-game, Map in tests); falls back to memory.
 *
 * Medal logic:
 * - Speedster: mission completed in time < sum(step.medalSecs)
 * - Style: zero hints shown >10s before their step's event
 * - Veteran: fast-skip from a later-step event (player showed competence)
 *
 * Fail-soft: notify on unknown events/unstarted engine → null; corrupt storage
 * falls through to in-memory state, never throws.
 */
export class TutorialEngine {
  /**
   * @param {Object} options
   * @param {Object} options.storage - localStorage-like injectable storage
   * @param {Function} options.rng - random number generator (injected for tests)
   */
  constructor({ storage = null, rng = Math.random } = {}) {
    this._storage = storage;
    this._rng = rng;
    // In-memory fallback for corrupt/missing storage
    this._mem = { medals: {}, done: false };

    this._currentMission = null;
    this._currentStep = 0;
    this._startedAt = null;
    this._hintShownAt = {};  // step index → timestamp when hint was displayed
    this._eventTimes = {};   // step index → timestamp when event fired
    this._skipped = false;
    this._doneThisSession = false;  // track if we marked done in this session

    this._loadState();
  }

  /** Load persisted state from storage, fall through on corruption. */
  _loadState() {
    try {
      if (this._storage) {
        const snap = this._storage.getItem('scrap.tutorial.missions.v1');
        if (snap) {
          const data = JSON.parse(snap);
          this._mem = data;
        }
      }
    } catch {
      // Corrupt storage: fall through to defaults (fresh state)
    }
  }

  /** Save mission state and medal progress to storage. */
  _saveState() {
    try {
      if (this._storage) {
        this._storage.setItem('scrap.tutorial.missions.v1', JSON.stringify(this._mem));
      }
    } catch {
      // Quota exceeded or blocked: fail-soft (in-memory state persists for this session)
    }
  }

  /**
   * Return a snapshot of engine state.
   * @returns {Object} { currentMission, currentStep, startedAt, hintShownAt, eventTimes, medals, skipped, done }
   */
  state() {
    return {
      currentMission: this._currentMission,
      currentStep: this._currentStep,
      startedAt: this._startedAt,
      hintShownAt: { ...this._hintShownAt },
      eventTimes: { ...this._eventTimes },
      medals: { ...this._mem.medals },
      skipped: this._skipped,
      done: this._mem.done,
    };
  }

  /**
   * Restore engine from a saved snapshot.
   * @param {Object} snap - Snapshot from state()
   */
  restore(snap) {
    this._currentMission = snap.currentMission;
    this._currentStep = snap.currentStep;
    this._startedAt = snap.startedAt;
    this._hintShownAt = { ...snap.hintShownAt };
    this._eventTimes = { ...(snap.eventTimes || {}) };
    this._mem.medals = { ...snap.medals };
    this._skipped = snap.skipped;
    this._mem.done = snap.done;
  }

  /**
   * Begin a mission (or the first mission if none specified).
   * Idempotent-ish: re-begin restarts the mission from step 0.
   * @param {string} missionId - Mission ID (defaults to first mission)
   * @returns {TutorialEngine} this, for chaining
   */
  begin(missionId = null) {
    const mid = missionId || TUTORIAL_MISSIONS[0]?.id;
    this._currentMission = mid;
    this._currentStep = 0;
    this._startedAt = Date.now();
    this._hintShownAt = {};
    this._skipped = false;
    return this;
  }

  /**
   * Host calls when a step hint is rendered to the player.
   * Drives fast-skip medal timing + style medal logic.
   */
  onHintShown() {
    if (this._currentMission && this._currentStep < this._getMission()?.steps.length) {
      this._hintShownAt[this._currentStep] = Date.now();
    }
  }

  /**
   * Notify engine of a game event (e.g., 'move', 'mine', 'open_bench', etc.).
   * Returns state delta if event advanced progress; null if unknown/not begun.
   *
   * Fast-skip: if event matches a LATER step, auto-complete all steps up to
   * and including that one, mark fastSkipped:true, award veteran medal.
   *
   * @param {string} event - Game event identifier
   * @param {Object} payload - Event payload (unused for now; future expansion)
   * @returns {Object|null} { advanced, step, medal?, rivetLine?, fastSkipped?, missionComplete?, allDone? }
   */
  notify(event, payload = {}) {
    if (!this._currentMission) return null;

    const mission = this._getMission();
    if (!mission) return null;

    const currentStepObj = mission.steps[this._currentStep];
    if (!currentStepObj) {
      // All steps done
      if (!this._mem.done) {
        this._mem.done = true;
        this._saveState();
      }
      return { allDone: true };
    }

    // Check if event matches current step or a LATER step (fast-skip)
    const matchingStepIdx = mission.steps.findIndex(s => s.event === event);
    if (matchingStepIdx === -1) {
      // Unknown event
      return null;
    }

    const isFastSkip = matchingStepIdx > this._currentStep;
    if (isFastSkip) {
      // Player showed competence by doing something advanced
      return this._fastSkipTo(matchingStepIdx, mission);
    }

    if (matchingStepIdx === this._currentStep) {
      // Normal advance: event matches current step
      return this._advanceStep(mission);
    }

    // Event is from an earlier step (already completed) — no-op
    return null;
  }

  /**
   * Advance to the next step and check for mission completion + medal.
   * @private
   */
  _advanceStep(mission) {
    const stepIdx = this._currentStep;
    const stepObj = mission.steps[stepIdx];
    this._eventTimes[stepIdx] = Date.now();  // Record when this event fired
    this._currentStep++;

    const result = {
      advanced: true,
      step: stepObj,
      medal: null,
      rivetLine: mission.rivetLines?.[stepObj.id],
      fastSkipped: false,
    };

    // Check if mission is complete
    if (this._currentStep >= mission.steps.length) {
      result.missionComplete = true;
      result.medal = this._awardMedalIfEarned(mission, false);
      this._mem.medals[mission.id] = result.medal;
      this._mem.done = true;
      this._doneThisSession = true;
      this._saveState();
    }

    return result;
  }

  /**
   * Fast-skip: auto-complete all steps from current to targetStepIdx (inclusive).
   * Awards veteran medal (player showed competence).
   * @private
   */
  _fastSkipTo(targetStepIdx, mission) {
    // Record event time for the step that triggered the fast-skip
    this._eventTimes[targetStepIdx] = Date.now();
    this._currentStep = targetStepIdx + 1;

    const result = {
      advanced: true,
      step: mission.steps[targetStepIdx],
      medal: 'veteran',
      rivetLine: null,  // No personalized reaction on fast-skip
      fastSkipped: true,
    };

    // Persist veteran medal immediately (player has shown competence)
    if (!this._mem.medals[mission.id]) {
      this._mem.medals[mission.id] = 'veteran';
      this._saveState();
    }

    // If all steps now done, mark mission complete
    if (this._currentStep >= mission.steps.length) {
      result.missionComplete = true;
      this._mem.done = true;
      this._doneThisSession = true;
      this._saveState();
    }

    return result;
  }

  /**
   * Award medal if earned: speedster (sub-threshold time), style (unaided hints).
   * Style: all hints (if any) must be shown <10s before their step's event.
   * No hint shown for a step also counts as unaided.
   * @private
   */
  _awardMedalIfEarned(mission, isFastSkip) {
    if (isFastSkip) return 'veteran';

    const elapsedSecs = (Date.now() - this._startedAt) / 1000;
    const totalThresholdSecs = mission.steps.reduce((sum, s) => sum + (s.medalSecs || 0), 0);

    // Speedster: finished under threshold
    if (elapsedSecs < totalThresholdSecs) {
      return '🥇 speedster';
    }

    // Style: all hints shown <10s before their step's event.
    // Gap = eventTime - hintTime. If no hint shown, gap is implicitly 0 (unaided).
    const hasStyle = mission.steps.every((step, idx) => {
      const hintTime = this._hintShownAt[idx];
      if (hintTime === undefined) return true;  // No hint shown = unaided
      const eventTime = this._eventTimes[idx];
      if (eventTime === undefined) return false;  // Hint shown but event never fired
      const gapMs = eventTime - hintTime;
      return gapMs < 10000;  // Gap < 10s = unaided
    });

    if (hasStyle) {
      return '✨ style';
    }

    return null;
  }

  /**
   * Check if player already showed competence (event from a later step arrived).
   * Used by hosts to decide whether to offer fast-skip upfront.
   * Evidence: we've recorded an event time for a step beyond the current one.
   * @returns {boolean}
   */
  fastSkipEligible() {
    const mission = this._getMission();
    if (!mission) return false;

    // True if a LATER step's event was already handled (recorded in _eventTimes)
    // This indicates the player skipped ahead, showing competence.
    for (let i = this._currentStep + 1; i < mission.steps.length; i++) {
      if (this._eventTimes[i] !== undefined) {
        return true;  // Step i's event already fired (we fast-skipped or will)
      }
    }
    return false;
  }

  /**
   * Dismiss everything: mark mission skipped and done.
   * @returns {Object} { skipped: true, missionId, stepsCompleted }
   */
  skipAll() {
    this._skipped = true;
    this._mem.done = true;
    this._saveState();
    return {
      skipped: true,
      missionId: this._currentMission,
      stepsCompleted: this._currentStep,
    };
  }

  /** Get the current mission object. @private */
  _getMission() {
    return TUTORIAL_MISSIONS.find(m => m.id === this._currentMission);
  }
}
