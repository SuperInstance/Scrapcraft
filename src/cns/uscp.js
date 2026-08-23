/**
 * ───────────────────────────────────────────────────────────────────────────
 *  USCP TELEMETRY — the Rift's emitter (RIFT-PHASE-1)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  Scrapcraft as a first-class CNS citizen: the game's event streams, batched
 *  into USCP packets ({payload:{signal_type,data}, metadata:{lore_ref}}) and
 *  POSTed to the fleet quilt. Docs: docs/cns/RIFT-PHASE-1.md.
 *
 *  PRIVACY STANCE (the load-bearing rule — read before touching):
 *    * OFF by default. The emitter is inert until a player (or a teacher,
 *      for a classroom fleet) flips Settings → Advanced → Rift Telemetry.
 *      Kids' browsers never phone home without intent.
 *    * No identifiers. No player name, no session id, no free text — the
 *      payloads carry event kinds and small structured data (item ids,
 *      lap seconds, counts) and nothing else.
 *    * Fail-soft above all: telemetry must NEVER affect gameplay. Every
 *      send path is wrapped; a dead endpoint drops packets silently.
 *
 *  Taps the SAME choke points the quest tracker already uses (foreman.onEvent,
 *  companions.observe/say, the coach radio) — we reuse streams, never
 *  re-instrument the game.
 *
 *  Headless: no DOM, no game imports. The game injects its own seams
 *  (fetch, config, clock) so tests can prove batching, packet shape, the
 *  opt-in gate, and fail-soft without a browser.
 */

// ── the fleet endpoint ──────────────────────────────────────────────────────
// One constant. Opt-in still required — this is where packets go WHEN enabled.

export const USCP_ENDPOINT =
  'https://fleet-static-host.casey-digennaro.workers.dev/api/uscp';

import { loadConfig as defaultLoadConfig } from '../onboarding/config.js';

// ── lore registry ───────────────────────────────────────────────────────────
// lore_ref values resolve against the scrapcraft-world worldbible namespaces
// (worldbible/characters/*, yard-bible, campaign, items, spark-personality)
// plus Scrapcraft's own mechanics docs. The CNS reads implications, not just
// values (RIFT-PHASE-1): these refs are how a signal stays grounded in lore.

const LORE = {
  block_mined:    (d) => `lore://worldbible/items#${d?.item ?? 'scrap'}`,
  item_crafted:   (d) => `lore://worldbible/items#${d?.item ?? 'crafted'}`,
  program_run:    ()  => 'lore://scrapcraft/maker-lab#tile-programs',
  lap_complete:   ()  => 'lore://worldbible/yard-bible#race-oval',
  quest_complete: ()  => 'lore://worldbible/campaign',
  companion_line: (d) => `lore://worldbible/characters/${d?.speaker ?? 'rivet'}`,
  coach_radio:    ()  => 'lore://scrapcraft/vhf-doctrine',
};

/** Allowed top-level signal types (the sink validates against this set too). */
export const SIGNAL_TYPES = Object.keys(LORE);

/** Build one USCP packet. Pure — tests prove the shape here. */
export function buildPacket(signalType, data, now = Date.now()) {
  const lore = LORE[signalType]?.(data) ?? 'lore://scrapcraft';
  return {
    payload: { signal_type: signalType, data: sanitize(data) },
    metadata: { lore_ref: lore, t: now },
  };
}

/** Kid-safe payload scrub: structured values only — free text never ships. */
function sanitize(data) {
  if (!data || typeof data !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string' && /^[a-z0-9_-]+$/i.test(v)) out[k] = v.slice(0, 32);
    else if (typeof v === 'boolean') out[k] = v;
    // objects/arrays/free text: dropped by design
  }
  return out;
}

// ── raw-event → signal mapping ──────────────────────────────────────────────
// The foreman stream speaks `mine_iron_scrap` / `craft_gear` / `quest_complete`;
// the companion stream already speaks `block_mined` / `lap_complete` /
// `program_run`. One vocabulary out: SIGNAL_TYPES.

const MINE_RE = /^mine_(.+)$/;
const CRAFT_RE = /^craft_(.+)$/;

export function mapForemanEvent(event) {
  if (MINE_RE.test(event)) {
    const item = event.slice(5);
    return { signal: 'block_mined', data: { item } };
  }
  if (CRAFT_RE.test(event)) {
    const item = event.slice(6);
    return { signal: 'item_crafted', data: { item } };
  }
  if (event === 'quest_complete') return { signal: 'quest_complete', data: {} };
  return null; // the foreman quips about many things; only these are signals
}

const COMPANION_SIGNALS = new Set(['block_mined', 'lap_complete', 'program_run']);

// ── the emitter ──────────────────────────────────────────────────────────────

export class UscpEmitter {
  /**
   * @param {object} [opts]
   * @param {string}  [opts.endpoint]      fleet sink URL (default: the constant)
   * @param {() => boolean} [opts.isEnabled] the opt-in gate — false = inert
   * @param {typeof fetch} [opts.fetch]     fetch seam (tests inject a spy)
   * @param {() => number} [opts.now]       clock seam
   * @param {number} [opts.maxBatch]        packets per flush (default 20)
   * @param {number} [opts.flushMs]         max age of the oldest packet (default 15 s)
   */
  constructor(opts = {}) {
    this.endpoint = opts.endpoint || USCP_ENDPOINT;
    this.isEnabled = opts.isEnabled || (() => false);
    this._fetch = opts.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    this._now = opts.now || (() => Date.now());
    this.maxBatch = opts.maxBatch ?? 20;
    this.flushMs = opts.flushMs ?? 15000;
    this._queue = [];
    this._timer = null;
    this._inFlight = false;
    this.sent = 0;   // test/diagnostic counters (never surfaced in gameplay UI)
    this.dropped = 0;
  }

  /** Witness one signal. Never throws — gameplay is upstream of telemetry. */
  witness(signalType, data = {}) {
    try {
      if (!LORE[signalType]) return;
      if (!this.isEnabled()) return; // the gate: OFF means nothing even queues
      this._queue.push(buildPacket(signalType, data, this._now()));
      this._schedule();
    } catch { /* fail-soft: swallow */ }
  }

  /** Raw foreman event (e.g. `mine_iron_scrap`) → witness. */
  witnessForeman(event, data = {}) {
    try {
      const m = mapForemanEvent(event);
      if (m) this.witness(m.signal, m.data);
    } catch { /* fail-soft */ }
  }

  /** Raw companion-observe event (already signal-typed vocabulary). */
  witnessCompanion(event, detail = {}) {
    try {
      if (COMPANION_SIGNALS.has(event)) this.witness(event, detail);
    } catch { /* fail-soft */ }
  }

  _schedule() {
    if (this._queue.length >= this.maxBatch) { this._flush(); return; }
    if (this._timer) return;
    const delay = Math.max(0, this.flushMs - (this._now() - this._queue[0].metadata.t));
    this._timer = setTimeout(() => { this._timer = null; this._flush(); }, delay);
    // Node tests get a bare timer object back — fine either way.
  }

  /** Flush now. Fire-and-forget by design; errors drop the batch silently. */
  _flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (!this._queue.length || this._inFlight || !this.isEnabled()) return;
    const packets = this._queue.splice(0, this.maxBatch);
    const body = JSON.stringify({ source: 'scrapcraft', packets });
    this._inFlight = true;
    this._send(body, packets.length)
      .finally(() => { this._inFlight = false; if (this._queue.length) this._schedule(); });
  }

  _send(body, count) {
    if (!this._fetch) return Promise.resolve();
    const url = typeof this.endpoint === 'function' ? this.endpoint() : this.endpoint;
    if (!url) return Promise.resolve(); // no endpoint configured: drop, stay quiet
    return Promise.resolve(
      this._fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true, // small packets survive tab-close for the last flush
      }),
    )
      .then((res) => {
        if (res && res.ok) this.sent += count;
        else this.dropped += count; // non-2xx: drop, never retry-storm
      })
      .catch(() => { this.dropped += count; }); // endpoint down: drop silently
  }

  /** Flush on pagehide/beforeunload — best effort. */
  flush() { this._flush(); }
}

// ── game wiring ──────────────────────────────────────────────────────────────

/**
 * Install the Rift tap on a booted Game. Same choke-point pattern the quest
 * tracker uses (QuestSystem._tapEvents) — chained wraps, never re-instrumented
 * call sites. Idempotent; returns the emitter (or null if the game object is
 * missing pieces — fail-soft even at install time).
 */
export function installUscp(game, opts = {}) {
  try {
    if (!game || !game.foreman) return null;
    const readConfig = opts.loadConfig || defaultLoadConfig;
    const emitter = new UscpEmitter({
      ...opts,
      endpoint: opts.endpoint || (() => readConfig().uscpEndpoint || USCP_ENDPOINT),
      isEnabled: opts.isEnabled || (() => Boolean(readConfig().uscpEnabled)),
    });

    // Tap 1 — foreman world events (mine_*/craft_*/quest_complete).
    const foreman = game.foreman;
    if (!foreman._uscpTapInstalled) {
      const orig = foreman.onEvent.bind(foreman);
      foreman.onEvent = (event, data) => {
        orig(event, data);
        emitter.witnessForeman(event, data);
      };
      foreman._uscpTapInstalled = true;
    }

    // Tap 2 — companion shared-experience events (block_mined/lap/program_run).
    const roster = game.companions;
    if (roster && !roster._uscpTapInstalled) {
      const orig = roster.observe.bind(roster);
      roster.observe = (event, detail) => {
        const rec = orig(event, detail);
        emitter.witnessCompanion(event, detail);
        return rec;
      };
      // Tap 2b — companion lines shown (the facade `say`): speaker + mood only.
      if (typeof roster.say === 'function') {
        const origSay = roster.say.bind(roster);
        roster.say = (text, meta = {}) => {
          emitter.witness('companion_line', {
            speaker: meta.speaker || roster.activeId || 'rivet',
            mood: meta.mood,
          });
          return origSay(text, meta);
        };
      }
      roster._uscpTapInstalled = true;
    }

    // Tap 3 — coach radio exchanges: TX (kid transmits) + RX (bot acks).
    const coach = game.radio;
    if (coach && !coach._uscpTapInstalled) {
      const origNudge = coach.sendNudge?.bind(coach);
      if (origNudge) {
        coach.sendNudge = (text, o) => {
          emitter.witness('coach_radio', { dir: 'tx' });
          return origNudge(text, o);
        };
      }
      const origAck = coach._beginAck?.bind(coach);
      if (origAck) {
        coach._beginAck = (bot, d, channel) => {
          emitter.witness('coach_radio', { dir: 'rx', intent: d?.intent });
          return origAck(bot, d, channel);
        };
      }
      coach._uscpTapInstalled = true;
    }

    // Last-gasp flush on tab close (best effort — keepalive carries it).
    if (typeof globalThis.addEventListener === 'function' && !game._uscpHideHook) {
      globalThis.addEventListener('pagehide', () => emitter.flush());
      game._uscpHideHook = true;
    }

    return emitter;
  } catch { return null; } // install failure must never boot-block the game
}
