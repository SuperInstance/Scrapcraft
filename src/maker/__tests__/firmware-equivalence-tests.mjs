/**
 * Firmware ↔ VM semantic-ordering equivalence — src/maker/FirmwareGen.js
 * ───────────────────────────────────────────────────────────────────────────
 *
 * firmware-golden-tests.mjs already proves that codegen emits valid,
 * non-placeholder code for every primitive. This suite hardens the OTHER
 * half of "your tiles become REAL firmware": that the ACTUATOR-CALL
 * SEQUENCE emitted into Arduino/MicroPython is the SAME sequence the
 * deterministic VM actually runs for that program — not just similar code,
 * but a faithful account of the same behaviour.
 *
 * Method, for each program:
 *   (a) run it through MakerRuntime for a bounded number of ticks and collect
 *       the ordered actuator names from `rt.vm.trace` (only `op === 'act'`
 *       entries — sense/branch/wait trace entries are a different concern);
 *   (b) parse the emitted Arduino AND MicroPython source for the actuator
 *       CALL SITES (never the one-time helper FUNCTION DEFINITIONS
 *       FirmwareGen also emits for some primitives — see the *_CALL_PATTERNS
 *       below, which are written to match only a call, not a `void drive(...)
 *       { ... }` / `def beep(freq): ...` declaration).
 *
 * We assert, for every program: the SET of actuators the VM actually called
 * equals the set the program declares (via `usedPrimitives()`) equals the
 * set emitted in both firmware targets — no dropped, no extra — and that
 * the relative order matches.
 *
 * KNOWN LIMITATION (documented per the task, not a bug): firmware source is
 * STATIC TEXT — a branch's body appears exactly once, in program order,
 * regardless of whether it fires at runtime, and a loop body appears once
 * regardless of how many times the VM repeats it. So:
 *   - For a program with NO loop and NO always-taken-either-way branching
 *     ambiguity (a straight sequence, or an `if` whose condition is fixed
 *     for the whole run), the VM's action sequence and the firmware's
 *     source-order sequence should match EXACTLY (checked with strict
 *     `firstOccurrenceOrder` equality below, which is a no-op dedupe when
 *     there are no repeats).
 *   - For a program with a LOOP (forever/repeat), the VM trace repeats a
 *     cycle; the firmware only ever spells that cycle once. We assert the
 *     SET + FIRST-OCCURRENCE order for these instead of a strict 1:1 replay.
 *   - For a program with a BRANCH whose condition can go either way across
 *     a run (EXAMPLE_WALL_AVOIDER below), comparing "which branch's actions
 *     come first" between the VM (a runtime, data-dependent decision) and
 *     the firmware source (branches appear in a fixed textual order
 *     independent of which one ever actually fires) is not a meaningful
 *     comparison — the source's if/else order does not encode "the `if`
 *     branch always runs before the `else` branch". We therefore drive that
 *     program through two separate fixed-condition runs (one per branch),
 *     and for EACH run check that run's order is *consistent* with the
 *     firmware's source order once the untaken branch's ids are filtered
 *     out (a stable subsequence match — see `orderConsistent`), plus that
 *     the UNION of both runs' actuator sets equals the full firmware set.
 *
 * Deterministic + headless: fixed/constant mock worlds, fixed tick counts,
 * no timers, no randomness.
 *
 * Run: node src/maker/__tests__/run-tests.mjs  (folded into the harness)
 */

import { toArduino, toMicroPython } from '../FirmwareGen.js';
import { MakerRuntime } from '../index.js';
import { TileProgram, T, EXAMPLE_WALL_AVOIDER } from '../TileProgram.js';

// ── Actuator call-SITE signatures (not helper-function DEFINITIONS) ─────────
// Covers the actuators this suite's hand-built programs exercise: drive,
// turn, stop, beep, led. Read straight off FirmwareGen.js/primitives.js's
// own emitters (toArduino/toMicroPython + ACTUATORS[*].firmware.*), e.g.
// drive → `drive(FORWARD, 128);` (Arduino) / `m.drive("forward", 0.50)`
// (MicroPython) — verified against ARDUINO_HELPERS/PY_HELPERS so none of
// these patterns can accidentally match a helper's own `void drive(int dir,
// int pwm){...}` / `def beep(freq): ...` declaration line instead of a call.
const ARDUINO_CALL_PATTERNS = {
  drive: /drive\((?:FORWARD|BACKWARD)/g,
  turn:  /turn\((?:RIGHT|LEFT)/g,
  stop:  /stopMotors\(\);/g,
  beep:  /tone\(BUZZ_PIN/g,
  led:   /setLed\(\"/g,
};
const PYTHON_CALL_PATTERNS = {
  drive: /m\.drive\(/g,
  turn:  /m\.turn\(/g,
  stop:  /m\.stop\(\)/g,
  beep:  /\bbeep\(\d/g,
  led:   /set_led\(\"/g,
};

/** Ordered list (duplicates kept) of actuator ids as their call sites appear
 *  in the source text, left-to-right by character index. */
function callOrderInSource(source, patterns) {
  const hits = [];
  for (const [id, re] of Object.entries(patterns)) {
    const r = new RegExp(re.source, re.flags);
    let m;
    while ((m = r.exec(source))) hits.push({ id, idx: m.index });
  }
  hits.sort((a, b) => a.idx - b.idx);
  return hits.map(h => h.id);
}

/** First-occurrence order: each id kept once, at the position it first
 *  appears. A no-op dedupe for a sequence with no repeats. */
function firstOccurrenceOrder(list) {
  const seen = new Set();
  const out = [];
  for (const id of list) if (!seen.has(id)) { seen.add(id); out.push(id); }
  return out;
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function setEq(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** Is `runOrder` (one concrete run's first-occurrence order) a
 *  order-preserving subsequence of `firmwareOrder` (the full source's
 *  first-occurrence order)? i.e. filter the firmware order down to just the
 *  ids that fired this run and confirm their relative order survives. This
 *  is the "linear prefix" check from an if/else branch whose textual
 *  position doesn't predict which branch runs first at runtime. */
function orderConsistent(firmwareOrder, runOrder) {
  const filtered = firmwareOrder.filter(id => runOrder.includes(id));
  return arraysEqual(filtered, runOrder);
}

/** Minimal deterministic sensor-backing world with fixed readings. */
function fixedWorld({ dist = 1, light = 1 } = {}) {
  return {
    lightAt: () => light,
    distanceAhead: () => dist,
    playerDistance: () => 99,
    isSolidAt: () => false,
  };
}

/** Run a program for `ticks` frames and collect its ORDERED actuator-action
 *  trace (only `op === 'act'` entries — the VM's decision trace also records
 *  sense/branch/wait entries, a different concern from "what fired"). Stops
 *  early if the program halts (a finite, non-looping program will). */
function runActuatorTrace(program, world, { dt = 0.1, ticks = 30, spawn = {} } = {}) {
  const rt = new MakerRuntime(program, spawn, world);
  for (let i = 0; i < ticks && rt.isRunning; i++) rt.tick(dt);
  return rt.vm.trace.filter(e => e.op === 'act').map(e => e.action);
}

export function runFirmwareEquivalenceTests(ok, fail) {
  const check = (name, cond, extra = '') => (cond ? ok(name) : fail(name, extra));

  /** Full equivalence check for a program with exactly ONE possible runtime
   *  path (no loop, or a loop/if with a condition fixed for the whole run):
   *  VM trace order, program-declared set, and both firmware targets' call
   *  order/set must all agree — a strict match (after first-occurrence
   *  dedup, a no-op when there are no repeats). */
  function checkSingleRunProgram(name, { program, world, dt, ticks, spawn }) {
    const declared = new Set(program.usedPrimitives().actuators);
    const trace = runActuatorTrace(program, world, { dt, ticks, spawn });
    const traceOrder = firstOccurrenceOrder(trace);
    const traceSet = new Set(trace);

    const ino = toArduino(program);
    const py = toMicroPython(program);
    const inoOrder = firstOccurrenceOrder(callOrderInSource(ino, ARDUINO_CALL_PATTERNS));
    const pyOrder = firstOccurrenceOrder(callOrderInSource(py, PYTHON_CALL_PATTERNS));

    check(`${name}: program's declared actuator set == VM trace set`,
      setEq(declared, traceSet), `declared=${[...declared]} traced=${[...traceSet]}`);
    check(`${name}: program's declared actuator set == Arduino emitted set`,
      setEq(declared, new Set(inoOrder)), `declared=${[...declared]} arduino=${inoOrder}`);
    check(`${name}: program's declared actuator set == MicroPython emitted set`,
      setEq(declared, new Set(pyOrder)), `declared=${[...declared]} micropython=${pyOrder}`);
    check(`${name}: Arduino call order matches VM trace order`,
      arraysEqual(inoOrder, traceOrder), `arduino=${inoOrder} vm=${traceOrder}`);
    check(`${name}: MicroPython call order matches VM trace order`,
      arraysEqual(pyOrder, traceOrder), `micropython=${pyOrder} vm=${traceOrder}`);
  }

  // ═══ 1. Linear sequence — no loop, no branch ══════════════════════════════
  // Every actuator fires exactly once, in tile order. This is the strongest
  // case: firmware source order IS the run order, with no dedup needed.
  {
    const program = new TileProgram({
      name: 'Linear Sequence', brain: 'tin', nodes: [
        T.action('drive', { dir: 'forward', speed: 0.5 }),
        T.wait(0.1),
        T.action('turn', { dir: 'right', speed: 0.5 }),
        T.wait(0.1),
        T.action('beep', { pitch: 'mid' }),
        T.wait(0.1),
        T.action('led', { state: 'blue' }),
        T.wait(0.1),
        T.action('stop'),
      ],
    });
    checkSingleRunProgram('Linear sequence', {
      program, world: fixedWorld(), dt: 0.1, ticks: 20,
    });
  }

  // ═══ 2. Inside an `if` whose condition is fixed for the whole run ════════
  {
    const program = new TileProgram({
      name: 'If Branch', brain: 'tin', nodes: [
        T.action('led', { state: 'white' }),
        T.if(T.cond('distance_ahead', 'lt', 0.9), [
          T.action('drive', { dir: 'forward', speed: 0.4 }),
          T.wait(0.1),
          T.action('beep', { pitch: 'low' }),
        ]),
        T.action('stop'),
      ],
    });
    // dist=0.5 < 0.9 always → the if body always runs, so there is exactly
    // one possible path through this program.
    checkSingleRunProgram('If (fixed-true condition)', {
      program, world: fixedWorld({ dist: 0.5 }), dt: 0.1, ticks: 20,
    });
  }

  // ═══ 3. Inside a `forever` loop, no branch ════════════════════════════════
  // The VM trace repeats the cycle every pass; the firmware spells the
  // cycle once. First-occurrence order still has to match (KNOWN
  // LIMITATION above: a full 1:1 replay comparison isn't meaningful for a
  // loop, since source text doesn't repeat).
  {
    const program = new TileProgram({
      name: 'Forever Cycle', brain: 'tin', nodes: [
        T.forever([
          T.action('drive', { dir: 'forward', speed: 0.3 }),
          T.wait(0.05),
          T.action('turn', { dir: 'left', speed: 0.3 }),
          T.wait(0.05),
          T.action('led', { state: 'green' }),
          T.wait(0.05),
          T.action('beep', { pitch: 'high' }),
          T.wait(0.05),
        ]),
      ],
    });
    checkSingleRunProgram('Forever loop (no branch)', {
      program, world: fixedWorld(), dt: 0.05, ticks: 40,
    });

    // Sanity check that the loop really did repeat within the tick budget —
    // otherwise the "SET + first-occurrence" fallback above would be
    // vacuously true from a single pass and wouldn't actually be exercising
    // the loop-repetition limitation this test documents.
    const trace = runActuatorTrace(program, fixedWorld(), { dt: 0.05, ticks: 40 });
    const driveCount = trace.filter(a => a === 'drive').length;
    check('Forever loop (no branch): actually looped more than once within the tick budget',
      driveCount > 1, `drive fired ${driveCount}x`);
  }

  // ═══ 4. EXAMPLE_WALL_AVOIDER — forever + if/else, BOTH branches used ═════
  // A branch's condition can go either way at runtime, so we drive it
  // through two fixed-condition runs (one per branch) rather than one
  // wandering run, per the KNOWN LIMITATION documented above.
  {
    const name = 'EXAMPLE_WALL_AVOIDER (forever + if/else)';
    const declared = new Set(EXAMPLE_WALL_AVOIDER.usedPrimitives().actuators);

    const traceClear = runActuatorTrace(EXAMPLE_WALL_AVOIDER, fixedWorld({ dist: 1.0 }), { dt: 0.1, ticks: 10 });
    const traceWall = runActuatorTrace(EXAMPLE_WALL_AVOIDER, fixedWorld({ dist: 0.1 }), { dt: 0.1, ticks: 10 });
    const unionSet = new Set([...traceClear, ...traceWall]);

    const ino = toArduino(EXAMPLE_WALL_AVOIDER);
    const py = toMicroPython(EXAMPLE_WALL_AVOIDER);
    const inoOrder = firstOccurrenceOrder(callOrderInSource(ino, ARDUINO_CALL_PATTERNS));
    const pyOrder = firstOccurrenceOrder(callOrderInSource(py, PYTHON_CALL_PATTERNS));

    check(`${name}: program declares exactly {drive, beep, turn}`,
      setEq(declared, new Set(['drive', 'beep', 'turn'])), [...declared].join(','));
    check(`${name}: clear-path run (else branch) only drives`,
      setEq(new Set(traceClear), new Set(['drive'])), [...new Set(traceClear)].join(','));
    check(`${name}: blocked-path run (then branch) beeps + turns`,
      setEq(new Set(traceWall), new Set(['beep', 'turn'])), [...new Set(traceWall)].join(','));
    check(`${name}: blocked-path run order is beep→turn (tile order)`,
      arraysEqual(firstOccurrenceOrder(traceWall), ['beep', 'turn']),
      firstOccurrenceOrder(traceWall).join('>'));

    check(`${name}: union of both branch runs == program's full declared actuator set (no dropped)`,
      setEq(unionSet, declared), `union=${[...unionSet]} declared=${[...declared]}`);
    check(`${name}: union of both branch runs == Arduino emitted actuator set (no dropped/extra)`,
      setEq(unionSet, new Set(inoOrder)), `union=${[...unionSet]} arduino=${inoOrder}`);
    check(`${name}: union of both branch runs == MicroPython emitted actuator set (no dropped/extra)`,
      setEq(unionSet, new Set(pyOrder)), `union=${[...unionSet]} micropython=${pyOrder}`);

    check(`${name}: Arduino order consistent with clear-path run`,
      orderConsistent(inoOrder, firstOccurrenceOrder(traceClear)),
      `arduino=${inoOrder} run=${firstOccurrenceOrder(traceClear)}`);
    check(`${name}: Arduino order consistent with blocked-path run`,
      orderConsistent(inoOrder, firstOccurrenceOrder(traceWall)),
      `arduino=${inoOrder} run=${firstOccurrenceOrder(traceWall)}`);
    check(`${name}: MicroPython order consistent with clear-path run`,
      orderConsistent(pyOrder, firstOccurrenceOrder(traceClear)),
      `micropython=${pyOrder} run=${firstOccurrenceOrder(traceClear)}`);
    check(`${name}: MicroPython order consistent with blocked-path run`,
      orderConsistent(pyOrder, firstOccurrenceOrder(traceWall)),
      `micropython=${pyOrder} run=${firstOccurrenceOrder(traceWall)}`);
  }
}
