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
import { isBigMoment, pickBigMomentFallback, initiativeBankOf, pickInitiative } from './liveliness.js';

const REACTIVE_DEBOUNCE_S = 5;     // min gap between reactive lines
const IDLE_AFTER_S = 30;           // quiet this long → the companion notices things
const OBSERVATION_COOLDOWN_S = 75; // don't narrate silence too eagerly
// Liveliness (playtest fixes — see liveliness.js): the fast lane, the
// companion's own initiative, and the reaction-type variety guarantee.
const NOTICE_AFTER_S = 120;            // this quiet, this long → the companion notices
const QUESTION_FIRST_AFTER_S = 300;    // first companion-initiated question ~5 min in
const QUESTION_GAP_S = 480;            // then ≥8 min between questions (rare)
const QUESTION_GAP_JITTER_S = 120;     // …plus a little randomness so it never ticks
const QUESTION_MAX_PER_SESSION = 3;    // three questions a session, ever (no interrogation)
// Hour-one presence: idle-only observations left moving kids in companion
// silence — a first-hour kid NEVER stands still 30s. Ambient noticing fires
// while moving too, at most once per ~3–4 min (the chatter-budget min-gap;
// it shares OBSERVATION_COOLDOWN_S with the idle path so the two never stack).
const AMBIENT_OBS_MIN_S = 180;
const AMBIENT_OBS_JITTER_S = 60;
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
    this._ambientS = 0;                     // moving-clock for hour-one presence
    this._ambientGap = AMBIENT_OBS_MIN_S;   // first ambient notice at ~3 min in
    this._batteryWarned = false;
    this._talking = false;

    // liveliness: reaction-type variety + the companion's own initiative
    this._lastType = null;              // never the same reaction type twice in a row
    this._sinceInteraction = 0;         // observe/talk clock — the kid's talking to us
    this._noticeSpoken = false;         // the "you've been quiet" beat, once per session
    this._playS = 0;                    // real yard time (locked, not mid-flow)
    this._sinceQuestion = 0;            // question spacing clock
    this._questionGap = QUESTION_FIRST_AFTER_S; // first question waits the long intro
    this._questionsAsked = 0;           // rare: capped per session

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
    this._lastType = meta.type ?? 'line';   // variety guarantee: track the kind
    if (meta.mood) this._setMood(meta.mood);
  }

  /**
   * Reaction-type variety: a companion never speaks the same KIND of line
   * twice in a row (observation after observation, question after question).
   * Exempt: tier-ups and fast-lane big moments — those are guaranteed speech.
   * @param {string} type meta.type of the line about to speak
   * @param {boolean} [exempt] fast lane / tier-up bypass the guarantee
   */
  _typeVarietyOk(type, exempt = false) {
    return exempt || this._lastType === null || type !== this._lastType;
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
    this._sinceInteraction = 0;   // the kid just did something — we're not being ignored

    // tier promotion outranks everything — always spoken. The want-vs-flaw
    // arc beats are earned HERE (and only here): the deeper layer is the gift
    // that comes with the new tier. Fail-soft: no roundness → no beat.
    if (rec.tierUp) {
      const line = tierUpLine(rec.tierUp, this._rng, this.persona.tierUpLines);
      const beat = wantFlawBeat(this.persona, rec.tierUp, this._rng);
      if (line) {
        this.say(line, { mood: 'happy', event: 'tier_up', type: 'tier_up' });
      }
      if (beat) {
        this.say(beat, { mood: 'happy', event: 'tier_up', type: 'tier_up' });
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
    // BIG MOMENTS (rare loot, a crash, a race win) run the FAST LANE: they
    // bypass the debounce and speak NOW, budget-exempt like tier-ups — the
    // kid's loudest moments are never swallowed by the 5s line.
    {
      const banterKey = event === 'crash_survived' ? 'crash' : event;
      const big = isBigMoment(event);
      if (big || this._reactiveCooldownOk()) {
        if (this._typeVarietyOk('reactive', big)) {
          let line = pickBanterFresh(banterKey, this.state, this._rng, this.persona.banter, this._memory, {
            prefix: this.persona.id,
            detail,
            context: this._ambientCtx,
            data: this.state.data,
          });
          if (!line && big) {
            // the bank drew a null on a big moment — the fallback bank
            // GUARANTEES a line so the moment is never left unanswered
            line = pickBigMomentFallback(this.persona, this.state, this._rng);
            if (line) this._memory.remember(`${this.persona.id}:big`, line, 8);
          }
          if (line) {
            this.say(renderLine(line, detail), {
              mood: event === 'crash_survived' ? 'dismay'
                : (event === 'rare_loot' || event === 'flash_success' || event === 'bot_built' || event === 'ghost_beaten' || event === 'lap_complete') ? 'happy' : 'idle',
              event,
              type: 'reactive',
            });
            this._sinceReactive = 0;
            this._syncMemory();
          }
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

    // liveliness clocks — only real yard time counts (locked, not mid-flow):
    // menus, editing, and cinematics are the kid being busy, not ignoring us
    if (ctx.locked && !ctx.midFlow) {
      this._playS += dt;
      this._sinceInteraction += dt;
      this._sinceQuestion += dt;
    }

    // idle → the companion notices things (only when the player is actually
    // there, standing still, not in a menu). Gated by the cadence guard:
    // observations are unsolicited, and unsolicited lines respect the
    // minimum gap + the rolling chatter budget.
    if (ctx.locked && !ctx.moving && !ctx.midFlow) {
      this._idleS += dt;
      if (this._idleS >= IDLE_AFTER_S && this._sinceObservation >= OBSERVATION_COOLDOWN_S && this._chatter.canSpeakUnsolicited() && this._typeVarietyOk('observation')) {
        this._idleS = 0;
        this._sinceObservation = 0;
        // roundness banks rotate into the idle slot (fail-soft: null → classic
        // observations). Want/flaw beats are NOT here — those are tier-up only.
        const line = pickRoundnessIdle(this.persona, this.state, this._rng)
          ?? pickObservationFresh(this.state, this._rng, this.persona.observations, this._memory, this.persona.ambient, this._ambientCtx, `${this.persona.id}:obs`);
        if (line) {
          this.say(line, { mood: 'idle', event: 'observation', type: 'observation' });
          this._chatter.commitUnsolicited();
          this._syncMemory();
        }
      }
    } else {
      this._idleS = 0;
    }

    // ambient noticing → hour-one presence. The kid is MOVING — mining,
    // exploring, being new — and the companion still notices the world
    // beside them. Hard min-gap (180–240s) + the shared observation cooldown
    // + the chatter guard's unsolicited budget: one line per ~3–4 min,
    // never mid-menu, never over the yard's chatter allowance.
    if (ctx.locked && !ctx.midFlow) {
      this._ambientS += dt;
      if (this._ambientS >= this._ambientGap) {
        const ready = this._sinceObservation >= OBSERVATION_COOLDOWN_S
          && this._chatter.canSpeakUnsolicited()
          && this._typeVarietyOk('observation');
        const line = ready
          ? (pickRoundnessIdle(this.persona, this.state, this._rng)
            ?? pickObservationFresh(this.state, this._rng, this.persona.observations, this._memory, this.persona.ambient, this._ambientCtx, `${this.persona.id}:amb`))
          : null;
        if (line) {
          this.say(line, { mood: 'idle', event: 'observation', type: 'observation' });
          this._chatter.commitUnsolicited();
          this._syncMemory();
          this._sinceObservation = 0;   // shared with the idle path — one budget
          this._ambientS = 0;
          this._ambientGap = AMBIENT_OBS_MIN_S + this._rng() * AMBIENT_OBS_JITTER_S;
        } else {
          // not speakable yet (chatter guard busy, cooldown running, variety
          // holding the type, or the bank drew a silent line) — hold the
          // thought and re-check shortly: the moment isn't lost, just waiting
          this._ambientS = this._ambientGap - 12;
        }
      }
    } else {
      this._ambientS = 0;
    }

    // companion-initiated questions & challenges — spaced (first ~5 min in,
    // then ≥8 min apart) and rare (capped per session). The companion ASKS
    // the kid things instead of only ever being asked.
    if (ctx.locked && !ctx.midFlow && !this._talking
        && this._playS >= QUESTION_FIRST_AFTER_S
        && this._sinceQuestion >= this._questionGap
        && this._questionsAsked < QUESTION_MAX_PER_SESSION
        && this._chatter.canSpeakUnsolicited()
        && this._typeVarietyOk('question')) {
      const bank = initiativeBankOf(this.persona);
      const kind = this._rng() < 0.7 ? 'questions' : 'challenges';
      const line = bank ? pickInitiative(bank, kind, this.state, this._rng) : null;
      if (line) {
        this.say(line, { mood: 'idle', event: 'question', type: 'question' });
        this._chatter.commitUnsolicited();
        this._sinceQuestion = 0;
        this._questionGap = QUESTION_GAP_S + this._rng() * QUESTION_GAP_JITTER_S;
        this._questionsAsked++;
      }
    }

    // "you've been quiet" — ONE gentle beat per session after ~2 min of real
    // yard time without the kid talking to us or doing anything we can see.
    // In character, never a guilt trip, budget-respecting (unsolicited).
    if (ctx.locked && !ctx.midFlow && !this._noticeSpoken
        && this._sinceInteraction >= NOTICE_AFTER_S
        && this._chatter.canSpeakUnsolicited()
        && this._typeVarietyOk('notice')) {
      const bank = initiativeBankOf(this.persona);
      const line = bank ? pickInitiative(bank, 'notice', this.state, this._rng) : null;
      if (line) {
        this.say(line, { mood: 'idle', event: 'notice', type: 'notice' });
        this._chatter.commitUnsolicited();
        this._noticeSpoken = true;
      }
    }

    // battery — one warning per low-charge episode (warnings bypass the
    // chatter gate: actionable info beats cadence; say() still extends the gap)
    if (typeof ctx.battery === 'number') {
      if (ctx.battery <= 15 && !this._batteryWarned) {
        this._batteryWarned = true;
        const line = pickBanterFresh('low_battery', this.state, this._rng, this.persona.banter, this._memory, {
          prefix: this.persona.id, context: this._ambientCtx, data: this.state.data,
        });
        if (line) { this.say(line, { mood: 'dismay', event: 'low_battery', type: 'warning' }); this._syncMemory(); }
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
      if (nudge && this._chatter.canSpeakUnsolicited() && this._typeVarietyOk('nudge')) {
        this.say(nudge.line, { mood: 'happy', event: 'nudge', topic: nudge.topic, type: 'nudge' });
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
    this._sinceInteraction = 0;   // holding V IS interaction
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
      this.say(text, { mood: 'talking', event: 'talk', source, type: 'talk' });
      return { question: q, text, source };
    } finally {
      this._talking = false;
      this._moodUntil = this._moodClock; // fall back to idle next frame
    }
  }

  get talking() { return this._talking; }
}
