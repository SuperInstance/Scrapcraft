/**
 * ───────────────────────────────────────────────────────────────────────────
 *  RIVET  —  the companion orchestrator
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Rivet is a small repair-drone who arrived in the yard the same day you did.
 * This class wires the soul together:
 *
 *   state      what you've shared → tier (stranger→coworker→friend) + traits
 *   banter     Rivet reacts to real events, and initiates when it's quiet
 *   nudge      moves the game along — once per topic, never mid-flow
 *   converse   hold V to talk; answers come back as Rivet the character
 *
 * Side effects (speech, STT, avatar) are injected callbacks — this class is
 * fully headless and testable. The Game wires:
 *
 *   speak(text)  → voiceOut.speak(text, { voice: 'rivet' }) + subtitle + avatar pulse
 *   listen()     → voiceIn start/stop (hold V)
 */

import { RivetState } from './state.js';
import { pickBanter, pickObservation, renderLine, tierUpLine } from './banter.js';
import { Nudger } from './nudge.js';

const REACTIVE_DEBOUNCE_S = 5;     // min gap between reactive lines
const IDLE_AFTER_S = 30;           // quiet this long → Rivet notices things
const OBSERVATION_COOLDOWN_S = 75; // don't narrate silence too eagerly
const TALK_TIMEOUT_MS = 12000;

export class Rivet {
  /**
   * @param {object} [opts]
   * @param {(text:string, meta:object) => void} [opts.speak]      speech sink (voice + subtitle)
   * @param {() => Promise<string>} [opts.listen]                   hold-to-talk STT sink
   * @param {object} [opts.converse]                                RivetConverse-like (ask(question, state))
   * @param {Storage} [opts.storage]                                injectable persistence
   * @param {() => number} [opts.rng]
   */
  constructor(opts = {}) {
    this.state = new RivetState({ storage: opts.storage });
    this.nudger = new Nudger({ state: this.state });
    this._converse = opts.converse ?? null;
    this._listen = opts.listen ?? null;
    this._rng = opts.rng ?? Math.random;
    this._speakFn = opts.speak ?? (() => {});

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

  /**
   * Session opener. First ever meeting → first_meet. Otherwise → greet_return.
   * The onboarding conversation IS the tutorial now.
   */
  greet() {
    const first = !this.state.data.firstMetAt;
    this.observe(first ? 'first_meet' : 'greet_return');
    return first;
  }

  /** Speak a line through the injected sink. */
  say(text, meta = {}) {
    if (!text) return;
    this._speakFn(text, { voice: 'rivet', ...meta });
    if (meta.mood) this._setMood(meta.mood);
  }

  _setMood(mood, holdS = 3) {
    this.mood = mood;
    this._moodUntil = this._moodClock + holdS;
  }

  _reactiveCooldownOk() { return this._sinceReactive >= REACTIVE_DEBOUNCE_S; }

  /**
   * A game event happened. Records it, grows the relationship, and (when
   * Rivet would actually say something) speaks a reactive line.
   * @param {string} event  see BOND_EVENTS keys (+ greet_return)
   * @param {object} [detail] e.g. { name: 'Circuit City' }, { secs: 12.4 }
   */
  observe(event, detail = {}) {
    const rec = this.state.record(event, detail);

    // tier promotion outranks everything — always spoken
    if (rec.tierUp) {
      const line = tierUpLine(rec.tierUp, this._rng);
      if (line) {
        this.say(line, { mood: 'happy', event: 'tier_up' });
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
    };
    if (NUDGE_MAP[event]) {
      if (this.state.isNudgeDone(NUDGE_MAP[event]) === false) {
        this.state.markNudgeDone(NUDGE_MAP[event]);
        // following Rivet's earlier suggestion grows the bond a little extra
        if (this.nudger.fired().includes(NUDGE_MAP[event])) {
          this.state.record('nudge_followed', { note: NUDGE_MAP[event] });
        }
      }
    }
    if (event === 'crash_survived') this.nudger.noteCrash();
    if (rec.first?.biome) this.state.markNudgeDone('explore_city');

    // reactive banter — debounced so Rivet never machine-guns
    {
      const banterKey = event === 'crash_survived' ? 'crash' : event;
      const line = pickBanter(banterKey, this.state, this._rng);
      if (line && this._reactiveCooldownOk()) {
        this.say(renderLine(line, detail), {
          mood: event === 'crash_survived' ? 'dismay'
            : (event === 'rare_loot' || event === 'flash_success' || event === 'bot_built') ? 'happy' : 'idle',
          event,
        });
        this._sinceReactive = 0;
      }
    }
    return rec;
  }

  /**
   * Per-frame tick. Owns: idle detection, observations, battery watch, nudges.
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

    // idle → Rivet notices things (only when the player is actually there,
    // standing still, not in a menu)
    if (ctx.locked && !ctx.moving && !ctx.midFlow) {
      this._idleS += dt;
      if (this._idleS >= IDLE_AFTER_S && this._sinceObservation >= OBSERVATION_COOLDOWN_S) {
        this._idleS = 0;
        this._sinceObservation = 0;
        const line = pickObservation(this.state, this._rng);
        if (line) this.say(line, { mood: 'idle', event: 'observation' });
      }
    } else {
      this._idleS = 0;
    }

    // battery — one warning per low-charge episode
    if (typeof ctx.battery === 'number') {
      if (ctx.battery <= 15 && !this._batteryWarned) {
        this._batteryWarned = true;
        const line = pickBanter('low_battery', this.state, this._rng);
        if (line) this.say(line, { mood: 'dismay', event: 'low_battery' });
      } else if (ctx.battery > 30) {
        this._batteryWarned = false;
      }
    }

    // the progress engine (never mid-flow — Nudger enforces the rest)
    const nudge = this.nudger.tick(dt, { midFlow: Boolean(ctx.midFlow) || this._talking });
    if (nudge) {
      this.say(nudge.line, { mood: 'happy', event: 'nudge', topic: nudge.topic });
    }
  }

  /**
   * Hold-V conversation round trip:
   *   listen() → transcript → converse.ask(transcript, state) → say() in Rivet's voice.
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
