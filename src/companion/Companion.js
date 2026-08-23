/**
 * ───────────────────────────────────────────────────────────────────────────
 *  COMPANION  —  the orchestrator, one soul per persona
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Rivet's engine, generalized: state (per-persona traits + own storage key)
 * → banter (own banks) → nudge (own weights = own story pull) → converse
 * (own persona prompt + canned bank). Side effects stay injected — this
 * class is fully headless and testable.
 *
 *   Rivet.js remains as a compat shim (Rivet === Companion(rivet persona)).
 *
 * `managed: true` disables the internal nudge tick — the roster's
 * PartyNudger owns nudging for the whole crew (one clock, weighted
 * arbitration between companions).
 */

import { CompanionState } from './state.js';
import { renderLine, tierUpLine } from './banter.js';
import { pickRoundnessIdle, wantFlawBeat } from './roundness.js';
import { LineMemory, ChatterGuard, pickBanterFresh, pickObservationFresh } from './variety.js';
import { Nudger } from './nudge.js';
import { getPersona } from './personas.js';

const REACTIVE_DEBOUNCE_S = 5;     // min gap between reactive lines
const IDLE_AFTER_S = 30;           // quiet this long → the companion notices things
const OBSERVATION_COOLDOWN_S = 75; // don't narrate silence too eagerly
const TALK_TIMEOUT_MS = 12000;

export class Companion {
  /**
   * @param {object} [opts]
   * @param {string|object} [opts.persona] persona id or persona object
   * @param {(text:string, meta:object) => void} [opts.speak]      speech sink (voice + subtitle)
   * @param {() => Promise<string>} [opts.listen]                   hold-to-talk STT sink
   * @param {object} [opts.converse]                                CompanionConverse-like (ask(question, state))
   * @param {Storage} [opts.storage]                                injectable persistence
   * @param {() => number} [opts.rng]
   * @param {boolean} [opts.managed]                                roster owns the nudge tick
   * @param {ChatterGuard} [opts.chatter]                           injectable cadence guard
   */
  constructor(opts = {}) {
    this.persona = typeof opts.persona === 'string' ? getPersona(opts.persona) : (opts.persona ?? getPersona('rivet'));
    this.state = new CompanionState({ persona: this.persona, storage: opts.storage });
    this.nudger = new Nudger({
      state: this.state,
      weights: this.persona.nudgeWeights,
      personaId: this.persona.id,
      rng: opts.rng,
    });
    this._converse = opts.converse ?? null;
    this._listen = opts.listen ?? null;
    this._rng = opts.rng ?? Math.random;
    this._speakFn = opts.speak ?? (() => {});
    this._managed = Boolean(opts.managed);

    // variety: ring memory (save-persisted, fail-soft) + cadence guard.
    // The guard rides this companion's own clock so tests stay deterministic.
    this._memory = LineMemory.from(this.state?.data?.banterRecent);
    this._chatter = opts.chatter ?? new ChatterGuard({ now: () => this._moodClock });
    this._ambientCtx = null;        // { tod, weather } — set by update() from the game

    // timing
    this._sinceReactive = Infinity;
    this._idleS = 0;
    this._sinceObservation = 0;
    this._batteryWarned = false;
    this._talking = false;

    // avatar-visible mood
    this.mood = 'idle';            // idle | happy | dismay | talking
    this._moodUntil = 0;
    this._moodClock = 0;
  }

  get id() { return this.persona.id; }
  get name() { return this.persona.name; }

  /**
   * Session opener. First ever meeting → first_meet. Otherwise → greet_return.
   * The onboarding conversation IS the tutorial now.
   */
  greet() {
    const first = !this.state.data.firstMetAt;
    this.observe(first ? 'first_meet' : 'greet_return');
    return first;
  }

  /** Speak a line through the injected sink, in this companion's voice. */
  say(text, meta = {}) {
    if (!text) return;
    this._speakFn(text, { voice: this.persona.voice.name, companion: this.persona.id, ...meta });
    this._chatter.noteSpeech();     // any speech extends the quiet gap
    if (meta.mood) this._setMood(meta.mood);
  }

  /** Persist the variety rings into the companion save (fail-soft). */
  _syncMemory() {
    try {
      this.state.data.banterRecent = this._memory.toData();
      this.state.save();
    } catch { /* full or blocked — variety degrades to in-session memory */ }
  }

  _setMood(mood, holdS = 3) {
    this.mood = mood;
    this._moodUntil = this._moodClock + holdS;
  }

  _reactiveCooldownOk() { return this._sinceReactive >= REACTIVE_DEBOUNCE_S; }

  /**
   * A game event happened. Records it, grows the relationship, and (when this
   * companion would actually say something) speaks a reactive line.
   * @param {string} event  see BOND_EVENTS keys (+ greet_return)
   * @param {object} [detail] e.g. { name: 'Circuit City' }, { secs: 12.4 }
   */
  observe(event, detail = {}) {
    const rec = this.state.record(event, detail);

    // tier promotion outranks everything — always spoken. The want-vs-flaw
    // arc beats are earned HERE (and only here): the deeper layer is the gift
    // that comes with the new tier. Fail-soft: no roundness → no beat.
    if (rec.tierUp) {
      const line = tierUpLine(rec.tierUp, this._rng, this.persona.tierUpLines);
      const beat = wantFlawBeat(this.persona, rec.tierUp, this._rng);
      if (line) {
        this.say(line, { mood: 'happy', event: 'tier_up' });
      }
      if (beat) {
        this.say(beat, { mood: 'happy', event: 'tier_up' });
      }
      if (line || beat) {
        this._sinceReactive = 0;
        return rec;
      }
    }

    // progress bookkeeping for the nudge engine
    const NUDGE_MAP = {
      block_mined: 'mine_iron',
      bot_built: 'build_first_bot',
      program_run: 'program_bot',
      lap_complete: 'race_lap',
      flash_success: 'flash_hardware',
      repair_done: 'repair_bot',
      ghost_beaten: 'beat_a_ghost',
      spark_consult: 'ask_spark_question',
      line_follow_done: 'line_follow',
    };
    if (NUDGE_MAP[event]) {
      if (this.state.isNudgeDone(NUDGE_MAP[event]) === false) {
        this.state.markNudgeDone(NUDGE_MAP[event]);
        // following the companion's earlier suggestion grows the bond extra
        if (this.nudger.fired().includes(NUDGE_MAP[event])) {
          this.state.record('nudge_followed', { note: NUDGE_MAP[event] });
        }
      }
    }
    if (event === 'crash_survived') this.nudger.noteCrash();
    if (rec.first?.biome) {
      if (rec.first.biome === 'Circuit City') this.state.markNudgeDone('explore_city');
      if (rec.first.biome === 'The Deep Yard') this.state.markNudgeDone('explore_deep_yard');
    }

    // reactive banter — debounced so nobody machine-guns. Variety-picked:
    // ring memory keeps recent lines out, `when` gates keep the lines that
    // belong to THIS moment (tod/weather/telemetry) and silence the rest.
    {
      const banterKey = event === 'crash_survived' ? 'crash' : event;
      if (this._reactiveCooldownOk()) {
        const line = pickBanterFresh(banterKey, this.state, this._rng, this.persona.banter, this._memory, {
          prefix: this.persona.id,
          detail,
          context: this._ambientCtx,
          data: this.state.data,
        });
        if (line) {
          this.say(renderLine(line, detail), {
            mood: event === 'crash_survived' ? 'dismay'
              : (event === 'rare_loot' || event === 'flash_success' || event === 'bot_built' || event === 'ghost_beaten') ? 'happy' : 'idle',
            event,
          });
          this._sinceReactive = 0;
          this._syncMemory();
        }
      }
    }
    return rec;
  }

  /**
   * Per-frame tick. Owns: idle detection, observations, battery watch, nudges
   * (unless the roster manages nudging for the party).
   * @param {number} dt seconds
   * @param {object} [ctx] { locked, moving, midFlow, battery, secondsSinceCrash }
   */
  update(dt, ctx = {}) {
    this._moodClock += dt;
    this._sinceReactive += dt;
    this._sinceObservation += dt;
    if (this._moodClock > this._moodUntil && this.mood !== 'talking' && this.mood !== 'idle') {
      this.mood = 'idle';
    }

    // idle → the companion notices things (only when the player is actually
    // there, standing still, not in a menu). Gated by the cadence guard:
    // observations are unsolicited, and unsolicited lines respect the
    // minimum gap + the rolling chatter budget.
    if (ctx.locked && !ctx.moving && !ctx.midFlow) {
      this._idleS += dt;
      if (this._idleS >= IDLE_AFTER_S && this._sinceObservation >= OBSERVATION_COOLDOWN_S && this._chatter.canSpeakUnsolicited()) {
        this._idleS = 0;
        this._sinceObservation = 0;
        // roundness banks rotate into the idle slot (fail-soft: null → classic
        // observations). Want/flaw beats are NOT here — those are tier-up only.
        const line = pickRoundnessIdle(this.persona, this.state, this._rng)
          ?? pickObservationFresh(this.state, this._rng, this.persona.observations, this._memory, this.persona.ambient, this._ambientCtx, `${this.persona.id}:obs`);
        if (line) {
          this.say(line, { mood: 'idle', event: 'observation' });
          this._chatter.commitUnsolicited();
          this._syncMemory();
        }
      }
    } else {
      this._idleS = 0;
    }

    // battery — one warning per low-charge episode (warnings bypass the
    // chatter gate: actionable info beats cadence; say() still extends the gap)
    if (typeof ctx.battery === 'number') {
      if (ctx.battery <= 15 && !this._batteryWarned) {
        this._batteryWarned = true;
        const line = pickBanterFresh('low_battery', this.state, this._rng, this.persona.banter, this._memory, {
          prefix: this.persona.id, context: this._ambientCtx, data: this.state.data,
        });
        if (line) { this.say(line, { mood: 'dismay', event: 'low_battery' }); this._syncMemory(); }
      } else if (ctx.battery > 30) {
        this._batteryWarned = false;
      }
    }

    // ambient context (tod/weather) from the game — fail-soft: absent context
    // simply disables ambient-gated lines
    if (ctx.tod !== undefined || ctx.weather !== undefined) {
      this._ambientCtx = { ...this._ambientCtx, ...(ctx.tod !== undefined ? { tod: ctx.tod } : {}), ...(ctx.weather !== undefined ? { weather: ctx.weather } : {}) };
    }

    // the progress engine (never mid-flow — Nudger enforces the rest).
    // Nudges are unsolicited: the cadence guard gets a say too.
    if (!this._managed) {
      const nudge = this.nudger.tick(dt, { midFlow: Boolean(ctx.midFlow) || this._talking });
      if (nudge && this._chatter.canSpeakUnsolicited()) {
        this.say(nudge.line, { mood: 'happy', event: 'nudge', topic: nudge.topic });
        this._chatter.commitUnsolicited();
      }
    }
  }

  /**
   * Hold-V conversation round trip:
   *   listen() → transcript → converse.ask(transcript, state) → say() in character.
   * @returns {Promise<{question:string, text:string, source:string}|null>}
   */
  async talk() {
    if (this._talking || !this._listen || !this._converse) return null;
    this._talking = true;
    this._setMood('talking', TALK_TIMEOUT_MS / 1000);
    try {
      const question = (await Promise.race([
        this._listen(),
        new Promise(resolve => setTimeout(() => resolve(''), TALK_TIMEOUT_MS)),
      ])) ?? '';
      const q = String(question).trim();
      if (!q) {
        this.say('…You gotta say words! Hold V and try again.', { mood: 'idle', event: 'talk_empty' });
        return null;
      }
      const { text, source } = await this._converse.ask(q, this.state);
      this.state.record('conversation', { note: q.slice(0, 40) });
      this.say(text, { mood: 'talking', event: 'talk', source });
      return { question: q, text, source };
    } finally {
      this._talking = false;
      this._moodUntil = this._moodClock; // fall back to idle next frame
    }
  }

  get talking() { return this._talking; }
}
