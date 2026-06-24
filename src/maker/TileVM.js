/**
 * ───────────────────────────────────────────────────────────────────────────
 *  TILE VM  —  the resumable bytecode interpreter (the hard part)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  A real robot's firmware runs continuously: setup() once, then loop() forever,
 *  with delay() the only thing that pauses. We must reproduce that INSIDE a 60fps
 *  game loop without ever blocking a frame. You cannot `delay(500)` in a render
 *  loop, and you cannot run a `forever` loop to completion (it never completes).
 *
 *  So this VM is a *cooperative coroutine*. Each game tick calls `step(dt)`, and
 *  the VM advances through bytecode until it hits a YIELD POINT, then returns
 *  control to the game. Yield points:
 *
 *    • WAIT            — non-blocking timer; resumes after `seconds` elapse
 *    • forever NEXT    — one pass of an endless loop per tick (mirrors loop())
 *    • UNTIL           — repeat_until back-edge; yields one tick then re-checks condition
 *    • instruction budget exhausted — hard safety net against pathological
 *                        tight loops (e.g. a counted repeat of 1e9)
 *
 *  Counted loops (repeat N) run to completion within a single tick (subject to
 *  budget) — exactly like a real `for` loop inside loop(). Only `forever` paces
 *  itself one iteration per tick, and only `wait` blocks on time.
 *
 *  State that makes it resumable: a program counter `pc`, an expression `stack`,
 *  and a `loops` stack of frames. All restartable, all inspectable (the editor
 *  can highlight the currently-executing tile via `pc` → source map; see
 *  DEV guides). The VM holds NO game/Three.js references — it talks to the world
 *  only through the injected `robot` interface, which keeps it unit-testable
 *  headlessly.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { getActuator, getSensor } from './primitives.js';

const MAX_STEPS_PER_TICK = 4096;   // safety budget; generous for real programs

export class TileVM {
  /**
   * @param {Array}  bytecode  output of TileCompiler.compile().bytecode
   * @param {object} robot     VirtualRobot (or any object with setDrive/setTurn/emit + x,z,heading)
   * @param {object} world     sensor backing: lightAt/distanceAhead/playerDistance/...
   */
  constructor(bytecode, robot, world) {
    this.code = bytecode ?? [{ op: 'HALT' }];
    this.robot = robot;
    this.world = world;
    this.reset();
  }

  reset() {
    this.pc = 0;
    this.stack = [];
    this.loops = [];        // [{ remaining, forever, head }]
    this.waitRemaining = 0; // seconds left on a WAIT
    this.halted = false;
    this._yield = false;
    this.steps = 0;         // total instructions executed (telemetry)
    this.sensorReads = 0;   // SENSE ops fired
    this.motorActs   = 0;   // drive/turn ACT ops fired
    this.vars = {};          // named variables (set_var / change_var tiles)
  }

  get isRunning() { return !this.halted; }

  /**
   * Advance to the next source-mapped node boundary for the step debugger.
   * Executes instructions until the pc crosses into a different tile's range,
   * the VM yields (WAIT / NEXT-forever), or the budget is exhausted.
   * @param {Array} sourceMap  [{pc, nodeId}] from TileCompiler
   * @returns {string|null} the newly active nodeId, or null if halted
   */
  stepOneNode(sourceMap) {
    if (this.halted) return null;
    const startId = _nodeAt(sourceMap, this.pc);
    this._yield = false;
    let budget = MAX_STEPS_PER_TICK;
    while (!this._yield && !this.halted && budget-- > 0) {
      this._exec(this.code[this.pc]);
      if (_nodeAt(sourceMap, this.pc) !== startId) break;
    }
    return _nodeAt(sourceMap, this.pc);
  }

  /** Advance one game frame. Non-blocking. */
  step(dt) {
    if (this.halted) return;

    // Honor an in-progress WAIT before executing anything.
    if (this.waitRemaining > 0) {
      this.waitRemaining -= dt;
      // Keep applying continuous actuator state (motors stay set) while waiting —
      // the robot's own physics tick handles motion; nothing to do here.
      if (this.waitRemaining > 0) return;
      this.waitRemaining = 0;
    }

    this._yield = false;
    let budget = MAX_STEPS_PER_TICK;
    while (!this._yield && !this.halted && budget-- > 0) {
      this._exec(this.code[this.pc]);
    }
  }

  // ── Instruction dispatch ──────────────────────────────────────────────────

  _exec(instr) {
    if (!instr) { this.halted = true; return; }
    this.steps++;

    switch (instr.op) {
      case 'CONST':
        this.stack.push(Number(instr.value) || 0);
        this.pc++;
        break;

      case 'SENSE':
        this.stack.push(this._read(instr.sensor));
        this.sensorReads++;
        this.pc++;
        break;

      case 'CMP': {
        const b = this.stack.pop();
        const a = this.stack.pop();
        this.stack.push(compare(a, b, instr.cmp) ? 1 : 0);
        this.pc++;
        break;
      }

      case 'NOT':
        this.stack.push(this.stack.pop() === 0 ? 1 : 0);
        this.pc++;
        break;

      case 'JZ': {
        const v = this.stack.pop();
        if (v === 0) this.pc = instr.target;
        else this.pc++;
        break;
      }

      case 'JMP':
        this.pc = instr.target;
        break;

      case 'ACT':
        this._act(instr.action, instr.params);
        if (instr.action === 'drive' || instr.action === 'turn') this.motorActs++;
        this.pc++;
        break;

      case 'WAIT':
        this.waitRemaining = instr.seconds;
        this.pc++;          // resume AT the instruction after WAIT next time
        this._yield = true; // give the frame back
        break;

      case 'LOOP': {
        if (!instr.forever && instr.count <= 0) {
          this.pc = instr.end;            // zero-iteration loop: skip body entirely
        } else {
          this.loops.push({ remaining: instr.count, forever: instr.forever, head: this.pc + 1, end: instr.end });
          this.pc++;
        }
        break;
      }

      case 'NEXT': {
        const frame = this.loops[this.loops.length - 1];
        if (!frame) { this.pc++; break; }  // defensive: malformed loop
        if (frame.forever) {
          this.pc = frame.head;
          this._yield = true;              // one endless-loop pass per tick (= loop())
        } else {
          frame.remaining--;
          if (frame.remaining > 0) {
            this.pc = frame.head;          // counted loops run hot within the tick
          } else {
            this.loops.pop();
            this.pc++;
          }
        }
        break;
      }

      case 'UNTIL':
        // repeat_until back-edge: jump to condStart and yield one tick (like forever NEXT)
        this.pc = instr.condStart;
        this._yield = true;
        break;

      case 'SET_VAR':
        this.vars[instr.name] = this.stack.pop() ?? 0;
        this.pc++;
        break;

      case 'GET_VAR':
        this.stack.push(this.vars[instr.name] ?? 0);
        this.pc++;
        break;

      case 'CHANGE_VAR':
        this.vars[instr.name] = (this.vars[instr.name] ?? 0) + (instr.delta ?? 0);
        this.pc++;
        break;

      case 'HALT':
        this.halted = true;
        // Safety: cut motors when a (non-forever) program ends.
        this.robot?.setDrive?.(0);
        this.robot?.setTurn?.(0);
        break;

      default:
        // Unknown op — skip rather than crash. Compiler should prevent this.
        this.pc++;
    }
  }

  // ── World/robot bridge ────────────────────────────────────────────────────

  _read(sensorId) {
    const def = getSensor(sensorId);
    if (!def) return 0;
    const v = def.read(this.robot, this.world);
    return typeof v === 'boolean' ? (v ? 1 : 0) : (Number(v) || 0);
  }

  _act(actionId, params) {
    const def = getActuator(actionId);
    if (!def) return;
    def.exec(this.robot, params ?? {});
  }
}

function _nodeAt(sourceMap, pc) {
  let id = null;
  for (const e of sourceMap) {
    if (e.pc <= pc) id = e.nodeId;
    else break;
  }
  return id;
}

function compare(a, b, cmp) {
  switch (cmp) {
    case 'gt':  return a >  b;
    case 'lt':  return a <  b;
    case 'gte': return a >= b;
    case 'lte': return a <= b;
    case 'eq':  return a === b;
    case 'neq': return a !== b;
    case 'is':  return a === b;
    default:    return false;
  }
}
