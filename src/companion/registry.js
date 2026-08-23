/**
 * ───────────────────────────────────────────────────────────────────────────
 *  COMPANION ROSTER  —  the replay-value engine
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Same yard, different friend, different journey. The roster:
 *
 *   entry      the gate delivers a starter companion (Earl's two questions,
 *              or free pick) — the starter IS the tutorial voice and the
 *              primary nudge source; save the choice: the run's story identity
 *   growth     every companion grows independently (own state, own key)
 *   recruit    reach FRIEND (tier 3 of 3) with a companion → Earl's "the yard
 *              pairs you well" moment → recruit the next
 *   party      up to 2 initially, 3 at high progress; the ACTIVE companion
 *              talks/nudges, inactive ones chime in (crosstalk)
 *   arbitrate  party members share the nudge pool and ARGUE about
 *              priorities — weighted, jittered, the insistent voice usually
 *              wins, and the loser occasionally objects out loud
 *
 * FACADE: the roster proxies the active companion (observe/say/talk/state/
 * mood/talking) so a decade of `game.rivet?.observe(...)` call sites route
 * through the whole crew without changing a line.
 *
 * Headless-testable: storage/speak/listen/converse factory injectable.
 */

import { Companion } from './Companion.js';
import { CompanionConverse } from './converse.js';
import { PartyNudger } from './nudge.js';
import { PERSONAS, PERSONA_IDS, getPersona } from './personas.js';
import { pickCrosstalk, pickObjection } from './party.js';
import { quiltCells, storySummaryText } from './story.js';

const ROSTER_KEY = 'scrapcraft_companions';
const ROSTER_VERSION = 1;

const CROSSTALK_COOLDOWN_S = 90;   // inactive chatter is a spice, not a soup
const CROSSTALK_CHANCE = 0.22;     // per eligible event

export const RECRUIT_RULE = 'Reach FRIEND tier with a companion to recruit the next.';
export const EARL_PAIRING_LINE = 'Earl looks between you two over the mug. "Yard pairs you well, rookie. Take the crew. The scrap\'s not going to lift itself."';

export class CompanionRoster {
  /**
   * @param {object} [opts]
   * @param {Storage|object|null} [opts.storage]
   * @param {(companion:Companion, text:string, meta:object) => void} [opts.speak]   speech sink per companion
   * @param {() => Promise<string>} [opts.listen]                                     hold-V STT sink
   * @param {(persona:object) => object} [opts.converseFactory]                       CompanionConverse-like factory
   * @param {() => number} [opts.rng]
   * @param {(companion:Companion) => void} [opts.onRecruit] Earl's pairing-moment hook
   */
  constructor(opts = {}) {
    this._storage = opts.storage !== undefined
      ? opts.storage
      : (typeof localStorage !== 'undefined' ? localStorage : null);
    this._rng = opts.rng ?? Math.random;
    this._speak = opts.speak ?? null;
    this._listen = opts.listen ?? null;
    this._converseFactory = opts.converseFactory ?? (p => new CompanionConverse({ persona: p }));
    this._onRecruit = opts.onRecruit ?? null;

    // companion instances, lazily built (each with isolated state)
    this._companions = new Map();
    this._speakers = opts.speakers ?? null; // { personaId: speakFn } override

    // roster record
    this.data = this._fresh();
    this.load();

    // timing
    this._clock = 0;
    this._sinceCrosstalk = Infinity;

    // the party nudge engine — ONE clock for the whole crew
    this._partyNudger = null;
    this._rebuildPartyNudger();
    this.crosstalkCount = 0;
  }

  _fresh() {
    return {
      v: ROSTER_VERSION,
      startedWith: null,   // the gate's delivery — the run's story identity
      activeId: null,      // null → rivet until chosen
      met: [],             // companion ids ever instantiated (entry flow)
      recruited: [],       // ids recruited via Earl moments (party members)
    };
  }

  // ── companions ─────────────────────────────────────────────────────────────

  /** Build (once) and return the companion for a persona id. */
  get(id) {
    const persona = getPersona(id);
    if (!this._companions.has(persona.id)) {
      const c = new Companion({
        persona,
        storage: this._storage,
        listen: this._listen,
        converse: this._converseFactory(persona),
        rng: this._rng,
        managed: true,   // the roster's PartyNudger owns nudge timing
        speak: (text, meta) => {
          // resolve at call time (the instance may not exist yet)
          const fn = this._speakers?.[persona.id] ?? this._speak;
          if (fn) fn(this.get(persona.id), text, meta);
        },
      });
      this._companions.set(persona.id, c);
      if (!this.data.met.includes(persona.id)) this.data.met.push(persona.id);
    }
    return this._companions.get(persona.id);
  }

  /** The active companion (the one who talks, listens, rides your shoulder). */
  get active() {
    return this.get(this.activeId);
  }

  get activeId() {
    return this.data.activeId ?? 'rivet';
  }

  get startedWith() { return this.data.startedWith; }

  get partyIds() {
    // party = recruited companions + the starter is the default active
    const ids = [this.activeId];
    for (const id of this.data.recruited) if (!ids.includes(id)) ids.push(id);
    return ids;
  }

  /** Party members as instances (active first). */
  party() { return this.partyIds.map(id => this.get(id)); }

  _rebuildPartyNudger() {
    const members = this.partyIds.map(id => {
      const c = this.get(id);
      return { id, nudger: c.nudger, companion: c };
    });
    this._partyNudger = new PartyNudger({ members, rng: this._rng });
  }

  // ── entry flow ─────────────────────────────────────────────────────────────

  /**
   * The gate's delivery. Locks in the starter companion (the tutorial voice,
   * the primary story pull) and greets. Call once per run, on new game.
   * @returns {Companion} the starter
   */
  beginRun(personaId) {
    const persona = getPersona(personaId);
    this.data.startedWith = persona.id;
    this.data.activeId = persona.id;
    if (!this.data.met.includes(persona.id)) this.data.met.push(persona.id);
    this._rebuildPartyNudger();
    this.save();
    return this.get(persona.id);
  }

  /** True while the gate still owes the player a starter (new game). */
  get needsEntryChoice() {
    return this.data.startedWith === null;
  }

  // ── recruitment + party ────────────────────────────────────────────────────

  /** Ids not yet recruited (and not currently active). */
  recruitableIds() {
    if (!this._entryUnlocked()) return [];
    return PERSONA_IDS.filter(id =>
      id !== this.startedWith && !this.data.recruited.includes(id));
  }

  /** A companion at FRIEND tier unlocks the next recruitment (Earl's moment). */
  _entryUnlocked() {
    return this.partyIds.some(id => this.get(id).state.tierIndex() >= 2);
  }

  /** Max party size: 2 initially, 3 once two companions have hit FRIEND. */
  maxPartySize() {
    const friends = PERSONA_IDS.filter(id => this.get(id).state.tierIndex() >= 2).length;
    return friends >= 2 ? 3 : 2;
  }

  /**
   * Earl's pairing moment: recruit a new companion into the party.
   * @returns {{ok:boolean, reason?:string, companion?:Companion}}
   */
  recruit(personaId) {
    const persona = getPersona(personaId);
    if (!this._entryUnlocked()) return { ok: false, reason: RECRUIT_RULE };
    if (persona.id === this.startedWith) return { ok: false, reason: 'Already your starter — since day one.' };
    if (this.data.recruited.includes(persona.id)) return { ok: false, reason: 'Already in the crew.' };
    if (this.partyIds.length >= this.maxPartySize()) {
      return { ok: false, reason: `Party is full (${this.maxPartySize()}). Reach FRIEND with another companion to grow it.` };
    }
    this.data.recruited.push(persona.id);
    this._rebuildPartyNudger();
    this.save();
    const c = this.get(persona.id);
    c.observe('first_meet');
    return { ok: true, companion: c };
  }

  /** Swap the active companion (party member takes the shoulder). */
  setActive(personaId) {
    const persona = getPersona(personaId);
    const ok = persona.id === this.startedWith || this.data.recruited.includes(persona.id);
    if (!ok) return false;
    this.data.activeId = persona.id;
    this._rebuildPartyNudger();
    this.save();
    this.get(persona.id).observe('greet_return');
    return true;
  }

  // ── the facade: proxy the active companion to legacy call sites ────────────

  /** Active companion observes the event; party members may crosstalk. */
  observe(event, detail = {}) {
    const rec = this.active.observe(event, detail);
    this._maybeCrosstalk(event, detail);

    // FRIEND tier reached → Earl's "the yard pairs you well" moment:
    // the next companion walks in and joins the crew
    if (rec.tierUp === 'friend') {
      const next = this.recruitableIds()[0];
      if (next) {
        const r = this.recruit(next);
        if (r.ok && this._onRecruit) this._onRecruit(r.companion);
      }
    }
    return rec;
  }

  say(text, meta) { return this.active.say(text, meta); }
  greet() { return this.active.greet(); }
  async talk() { return this.active.talk(); }
  get talking() { return this.active.talking; }
  get mood() { return this.active.mood; }
  get state() { return this.active.state; }
  get persona() { return this.active.persona; }

  /** Inactive party members occasionally chime in (cooldown + chance). */
  _maybeCrosstalk(event, detail = {}) {
    if (event === 'tier_up' || event === 'first_meet') return;
    if (this._sinceCrosstalk < CROSSTALK_COOLDOWN_S) return;
    if (this._rng() > CROSSTALK_CHANCE) return;
    const sidelines = this.party().filter(c => c.id !== this.activeId);
    if (!sidelines.length) return;
    const speaker = sidelines[Math.floor(this._rng() * sidelines.length)];
    let line = pickCrosstalk(speaker.id, event, this._rng);
    if (!line) return;
    line = line.replace(/\{(\w+)\}/g, (_, k) => (detail[k] !== undefined ? String(detail[k]) : `{${k}}`));
    this._sinceCrosstalk = 0;
    this.crosstalkCount++;
    speaker.say(line, { event: 'crosstalk' });
  }

  // ── ticking ────────────────────────────────────────────────────────────────

  /**
   * Per-frame: active companion ticks (idle/observations/battery), the party
   * arbitrates nudges on ONE clock, crosstalk cools down.
   * @param {number} dt seconds
   * @param {object} [ctx] { locked, moving, midFlow, battery }
   */
  update(dt, ctx = {}) {
    this._clock += dt;
    this._sinceCrosstalk += dt;

    // active companion: presence behaviors (nudges are party-managed)
    this.active.update(dt, ctx);

    // inactive party members still record the session clock for their nudgers
    for (const c of this.party()) {
      if (c.id === this.activeId) continue;
      // advance their nudger clocks via the shared party clock (below)
    }

    const nudge = this._partyNudger?.tick(dt, { midFlow: Boolean(ctx.midFlow) || this.talking });
    if (nudge) {
      // the runner-up objects sometimes — the argument is the personality
      if (nudge.objection && this._sinceCrosstalk >= CROSSTALK_COOLDOWN_S / 2) {
        const loser = this.get(nudge.objection.id);
        const obj = pickObjection(nudge.objection.id, this._rng);
        if (loser && obj && loser.id !== nudge.id) {
          loser.say(obj, { event: 'crosstalk', topic: nudge.objection.topic });
          this.crosstalkCount++;
          this._sinceCrosstalk = Math.min(this._sinceCrosstalk, CROSSTALK_COOLDOWN_S / 2);
        }
      }
      const speaker = this.get(nudge.id);
      speaker.say(nudge.line, { mood: 'happy', event: 'nudge', topic: nudge.topic });
    }
  }

  /** Crash suppression travels to the whole party. */
  noteCrash() { this._partyNudger?.noteCrash(); }

  // ── story identity ─────────────────────────────────────────────────────────

  storyText() { return storySummaryText(this); }
  quilt() { return quiltCells(this); }

  // ── persistence ────────────────────────────────────────────────────────────

  save() {
    if (!this._storage) return;
    try {
      this._storage.setItem(ROSTER_KEY, JSON.stringify(this.data));
    } catch { /* full or blocked — the yard goes on */ }
    for (const c of this._companions.values()) c.state.save();
  }

  load() {
    if (!this._storage) return;
    try {
      const raw = this._storage.getItem(ROSTER_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && d.v === ROSTER_VERSION) {
        this.data = { ...this._fresh(), ...d };
      }
    } catch { /* corrupt — fresh roster */ }
  }

  /** Adopt save-payload state (roster + per-companion tiers/bond). Local
   *  copy wins; this exists for fresh browsers / classroom machines. */
  fromSaveData(d) {
    if (!d) return false;
    let adopted = false;
    try {
      if (d.roster?.v === ROSTER_VERSION && !this._storage?.getItem(ROSTER_KEY)) {
        this.data = { ...this._fresh(), ...d.roster };
        this._storage?.setItem(ROSTER_KEY, JSON.stringify(this.data));
        adopted = true;
      }
      for (const [id, stateData] of Object.entries(d.states ?? {})) {
        if (!stateData || typeof stateData !== 'object') continue;
        let persona = null;
        try { persona = getPersona(id); } catch { continue; }
        const c = this.get(persona.id);
        if (!c?.state) continue;
        try {
          if (this._storage?.getItem(c.state._key)) continue;   // local wins
          c.state.data = { ...c.state._fresh(), ...stateData };
          c.state.save();
          adopted = true;
        } catch { /* one bad state never blocks the rest */ }
      }
    } catch { /* fail-soft */ }
    return adopted;
  }

  /** Test/dev helper. */
  static reset(storage) {
    try { (storage ?? (typeof localStorage !== 'undefined' ? localStorage : null))?.removeItem(ROSTER_KEY); } catch {}
  }
}

export { PERSONAS, PERSONA_IDS, getPersona };
