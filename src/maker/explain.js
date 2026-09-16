/**
 * ───────────────────────────────────────────────────────────────────────────
 *  EXPLAIN  —  "why did my robot do that?"  (the trace narrator)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  Kids write a brain out of tiles, hit RUN, and the robot does… something.
 *  When it does the *wrong* something, "why?" is the whole game. A real robot
 *  can't tell you. Ours can: the VM keeps a bounded decision trace (see
 *  TileVM.traceCap) recording what it sensed, what it compared, which branch it
 *  took, and what it did. This module turns that trace into plain English a
 *  ten-year-old can read — the deterministic, offline half of the trace-debugger
 *  moat. (The cloud /chat endpoint layers a conversational answer on top; this
 *  works with no network and no opt-in.)
 *
 *  Pure + dependency-light (only sensor/actuator metadata), so it unit-tests
 *  without a browser or a running game.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { getSensor, getActuator } from './primitives.js';

const CMP_PHRASE = { gt: '>', lt: '<', gte: '≥', lte: '≤', eq: '=', neq: '≠', is: 'is' };

const ACTION_VERB = {
  drive: (p) => `🚗 Driving ${p?.dir === 'backward' ? 'backward' : 'forward'}${_speed(p)}`,
  turn:  (p) => `${p?.dir === 'left' ? '↩️' : '↪️'} Turning ${p?.dir === 'left' ? 'left' : 'right'}${_speed(p)}`,
  stop:  () => '🛑 Stopping',
  beep:  (p) => `🔊 Beeping${p?.pitch ? ` (${p.pitch})` : ''}`,
  led:   (p) => `💡 Light ${p?.color ? p.color : 'on'}`,
  grab:  (p) => `🦾 ${p?.state === 'release' || p?.open ? 'Opening' : 'Closing'} the arm`,
};

function _speed(p) {
  if (p == null || typeof p.speed !== 'number') return '';
  const pct = Math.round((Math.abs(p.speed) <= 1 ? p.speed : p.speed / 100) * 100);
  return Number.isFinite(pct) ? ` at ${pct}%` : '';
}

function _fmt(v) {
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '?');
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** One human phrase for a single action, grounded in the actuator's own label
 *  when we don't have a nicer verb. Exported for reuse (badges, tooltips). */
export function describeAction(action, params) {
  const verb = ACTION_VERB[action];
  if (verb) return verb(params ?? {});
  const label = getActuator(action)?.label;
  return label ? `▶️ ${label}` : `▶️ ${action ?? 'acting'}`;
}

/**
 * Narrate a decision trace (TileVM.trace) into { headline, reason, history }.
 *   headline — what the robot is doing right now (last action / wait / halt)
 *   reason   — the branch decision that led there, phrased with the sensor it
 *              read, the comparison, and the outcome ('' when it just ran in
 *              order with no condition in play)
 *   history  — up to `opts.historyLen` recent one-line steps, oldest→newest
 *
 * @param {Array}  trace  array of trace entries (see TileVM._trace)
 * @param {object} [opts] { historyLen = 5 }
 */
export function explainTrace(trace = [], opts = {}) {
  const historyLen = opts.historyLen ?? 5;
  if (!Array.isArray(trace) || trace.length === 0) {
    return { headline: 'Waiting to start…', reason: '', history: [] };
  }

  // The most recent thing the robot actually DID (or is waiting on / halted).
  let actIdx = -1;
  for (let i = trace.length - 1; i >= 0; i--) {
    const op = trace[i].op;
    if (op === 'act' || op === 'wait' || op === 'halt') { actIdx = i; break; }
  }

  let headline;
  if (actIdx < 0) {
    headline = 'Thinking…';        // only senses/compares so far, no action yet
  } else {
    const e = trace[actIdx];
    headline = e.op === 'act'  ? describeAction(e.action, e.params)
             : e.op === 'wait' ? `⏳ Waiting ${_fmt(e.seconds)}s`
             : '🏁 Program finished';
  }

  return { headline, reason: _reasonFor(trace, actIdx), history: _history(trace, historyLen) };
}

/** Find the branch decision (and the comparison + sensor feeding it) that most
 *  immediately preceded the action at `actIdx`, and phrase it. Stops at the
 *  previous action so one action's reason never borrows another's. */
function _reasonFor(trace, actIdx) {
  if (actIdx <= 0) return '';
  let branchIdx = -1;
  for (let i = actIdx - 1; i >= 0; i--) {
    const op = trace[i].op;
    if (op === 'branch') { branchIdx = i; break; }
    if (op === 'act' || op === 'wait') break;   // crossed into a prior step
  }
  if (branchIdx < 0) return '';

  // The comparison that produced the branch value, then the sensor it read.
  let cmp = null, senseLabel = null;
  for (let i = branchIdx - 1; i >= 0 && i >= branchIdx - 4; i--) {
    if (!cmp && trace[i].op === 'cmp') cmp = trace[i];
    if (trace[i].op === 'sense') { senseLabel = getSensor(trace[i].sensor)?.label ?? trace[i].sensor; break; }
  }

  const yes = trace[branchIdx].taken;
  if (cmp) {
    const subject = senseLabel ?? 'the reading';
    const phrase = CMP_PHRASE[cmp.cmp] ?? cmp.cmp;
    return `It checked: is ${subject} ${phrase} ${_fmt(cmp.b)}? Reading was ${_fmt(cmp.a)} → ${yes ? 'YES' : 'no'}.`;
  }
  if (senseLabel) return `It checked ${senseLabel} → ${yes ? 'YES' : 'no'}.`;
  return yes ? 'Its check was true.' : 'Its check was false.';
}

function _history(trace, n) {
  const out = [];
  for (const e of trace) {
    if (e.op === 'act')       out.push(describeAction(e.action, e.params));
    else if (e.op === 'wait') out.push(`⏳ waited ${_fmt(e.seconds)}s`);
    else if (e.op === 'branch') out.push(e.taken ? '✓ condition true' : '✗ condition false');
    else if (e.op === 'sense') out.push(`👁 read ${getSensor(e.sensor)?.label ?? e.sensor} = ${_fmt(e.value)}`);
    else if (e.op === 'halt') out.push('🏁 finished');
    // cmp entries are folded into the branch line, not listed on their own
  }
  return out.slice(-n);
}

/**
 * Lightweight narrator from a live cell snapshot (no trace needed) — the
 * fallback when tracing is off. Reads the active tile label + sensor cells and
 * says what the robot appears to be doing. Coarser than explainTrace (no "why"),
 * but always available.
 *
 * @param {object} snap  { currentTile, robot:{drivePower,turnPower}, sensors:{distance_ahead,...} }
 */
export function narrateSnapshot(snap = {}) {
  const r = snap.robot ?? {};
  const drive = Number(r.drivePower) || 0;
  const turn = Number(r.turnPower) || 0;
  let headline;
  if (Math.abs(drive) < 3 && Math.abs(turn) < 3) headline = '🛑 Holding still';
  else if (Math.abs(turn) > Math.abs(drive))     headline = `${turn < 0 ? '↩️ Turning left' : '↪️ Turning right'}`;
  else                                           headline = `🚗 Driving ${drive < 0 ? 'backward' : 'forward'}`;

  const tile = typeof snap.currentTile === 'string' && snap.currentTile !== '—' ? snap.currentTile : null;
  return { headline, reason: tile ? `Current tile: ${tile}` : '', history: [] };
}
