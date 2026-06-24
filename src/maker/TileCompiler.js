/**
 * ───────────────────────────────────────────────────────────────────────────
 *  TILE COMPILER  —  tile tree  →  flat bytecode  (the safety rail)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  This is the deterministic gate between "what someone (a kid, or the AI Spark)
 *  authored" and "what the VM will actually run". It does three jobs:
 *
 *    1. VALIDATE  every node against the capability schema. Unknown actuators or
 *       sensors are rejected (this is precisely what stops Spark from inventing
 *       hardware that doesn't exist — the AI can only target real primitives).
 *
 *    2. EXPAND  macros — the Layer-1 "intent" tiles like `turn 90°` — into the
 *       honest primitive sequence (turn + timed wait + stop). This is where a
 *       friendly tile collapses into real firmware-shaped operations.
 *
 *    3. EMIT  a flat bytecode array with resolved jump targets, ready for the
 *       resumable VM. Structured control flow (if / repeat / forever) becomes
 *       jumps and loop frames — the same shape a real compiler produces.
 *
 *  Returns { ok, bytecode, errors, warnings }. Even when ok === false we return
 *  best-effort bytecode (invalid nodes skipped) so the game can always run
 *  *something* and surface the problem rather than crashing.
 *
 *  BYTECODE OPS
 *  ────────────
 *    SENSE {sensor}        push sensor reading (bool coerced to 0/1)
 *    CONST {value}         push a literal number
 *    CMP   {cmp}           pop b,a → push (a cmp b) as 0/1
 *    NOT                   pop a   → push (a==0 ? 1 : 0)
 *    JZ    {target}        pop a; if a==0 → pc = target
 *    JMP   {target}        pc = target
 *    ACT   {action,params} run an actuator on the robot
 *    WAIT  {seconds}       set wait timer, yield this tick
 *    LOOP  {count,forever,end}  push loop frame; if exhausted at entry → pc = end
 *    NEXT  {head}          loop back-edge; forever loops yield one pass / tick
 *    UNTIL {condStart}     repeat_until back-edge; jumps to condStart and yields one tick
 *    BREAK                 pop the innermost loop frame and jump to its end address
 *    PRINT_VAR {name}      read vars[name] and emit a 'print' event via robot
 *    RAND_VAR  {name,min,max}  set vars[name] to a random integer in [min, max]
 *    CALL_SUB  {name,target}  push return address, jump to sub start
 *    SUB_RETURN               pop return address and resume
 *    READ_SENSOR {name,sensor}  read live sensor into vars[name] (numeric, not boolean)
 *    MATH_VAR {name,op,operand}  vars[name] = vars[name] op operand  (op ∈ add|sub|mul|div)
 *    HALT                  stop the program
 * ───────────────────────────────────────────────────────────────────────────
 */

import { getActuator, getSensor, withDefaults, BRAINS } from './primitives.js';
import { TURN_RATE } from './kinematics.js';

const CMP_OPS = new Set(['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'is']);
const BRAIN_TIER = { tin: 0, spark: 1, vision: 2 };

export function compile(program) {
  const brain = program?.brain ?? 'tin';
  const nodes = program?.nodes ?? [];
  const ctx = {
    out: [],
    errors: [],
    warnings: [],
    brainTier: BRAIN_TIER[brain] ?? 0,
    sourceMap: [],    // [{ pc, nodeId }] — maps bytecode offset to tile node id
    subs: {},         // name → start PC (filled when subroutines are emitted)
    callPatches: {},  // name → [bytecode index of CALL_SUB] — resolved after sub emission
  };

  // Pre-pass: warn about variables used but never initialized with set_var
  _checkVarInit(nodes, ctx);

  // Hoist define_sub to end; compile the rest as the main body
  const mainNodes = nodes.filter(n => n.type !== 'define_sub');
  const subNodes  = nodes.filter(n => n.type === 'define_sub');

  for (const node of mainNodes) compileNode(node, ctx);
  ctx.out.push({ op: 'HALT' });

  // Subroutine bodies — appended after HALT (never reached sequentially)
  for (const sub of subNodes) {
    const name = (sub.name ?? 'sub').trim() || 'sub';
    ctx.subs[name] = ctx.out.length;
    if (sub.id) ctx.sourceMap.push({ pc: ctx.out.length, nodeId: sub.id });
    for (const child of Array.isArray(sub.body) ? sub.body : []) compileNode(child, ctx);
    ctx.out.push({ op: 'SUB_RETURN' });
  }

  // Patch all CALL_SUB placeholders now that sub addresses are known
  for (const [name, indices] of Object.entries(ctx.callPatches)) {
    const target = ctx.subs[name];
    if (target === undefined) {
      ctx.errors.push(`Subroutine "${name}" is called but never defined — add a "define subroutine" tile named "${name}".`);
    } else {
      for (const idx of indices) ctx.out[idx].target = target;
    }
  }

  return {
    ok: ctx.errors.length === 0,
    bytecode: ctx.out,
    errors: ctx.errors,
    warnings: ctx.warnings,
    sourceMap: ctx.sourceMap,
  };
}

function _checkVarInit(nodes, ctx) {
  const declared = new Set();
  const used     = new Set();
  const walk = (list) => {
    for (const n of list) {
      if ((n.type === 'set_var' || n.type === 'read_sensor') && n.name) declared.add(n.name);
      if ((n.type === 'change_var' || n.type === 'math_var') && n.name) used.add(n.name);
      if (n.cond?.sensor?.startsWith('var:')) used.add(n.cond.sensor.slice(4));
      if (Array.isArray(n.body))     walk(n.body);
      if (Array.isArray(n.elseBody)) walk(n.elseBody);
      // repeat_until has a cond (already handled above) and a body (already handled)
    }
  };
  walk(nodes);
  for (const name of used) {
    if (!declared.has(name)) {
      ctx.warnings.push(`Variable "${name}" is used but never initialized — add a "set variable" tile to set its starting value.`);
    }
  }
}

// ── Node compilation ───────────────────────────────────────────────────────

function compileNode(node, ctx) {
  if (!node || typeof node !== 'object') {
    ctx.errors.push(`Skipped a malformed tile: ${JSON.stringify(node)}`);
    return;
  }

  if (node.id) ctx.sourceMap.push({ pc: ctx.out.length, nodeId: node.id });

  switch (node.type) {
    case 'action':  return compileAction(node, ctx);
    case 'wait':    return void ctx.out.push({ op: 'WAIT', seconds: Math.max(0, Number(node.seconds) || 0) });
    case 'if':      return compileIf(node, ctx, false);
    case 'if_else': return compileIf(node, ctx, true);
    case 'repeat':       return compileLoop(node, ctx, false);
    case 'forever':      return compileLoop(node, ctx, true);
    case 'repeat_until': return compileUntil(node, ctx);
    case 'break':        return void ctx.out.push({ op: 'BREAK' });
    case 'print':        return void ctx.out.push({ op: 'PRINT_VAR', name: _sanitizeVarName(node.name) });
    case 'comment':      return;   // annotation only — no bytecode emitted
    case 'random_var':   return compileRandomVar(node, ctx);
    case 'call_sub':     return compileCallSub(node, ctx);
    case 'define_sub':
      // define_sub is hoisted out of the main body in compile() — if one appears
      // nested (e.g. inside forever), warn and skip rather than crash.
      ctx.warnings.push(`"define subroutine" tile "${node.name || 'sub'}" must be at the top level — move it out of loops and conditions.`);
      return;
    case 'read_sensor': return compileReadSensor(node, ctx);
    case 'math_var':   return compileMathVar(node, ctx);
    case 'macro':      return compileMacro(node, ctx);
    case 'set_var':    return compileSetVar(node, ctx);
    case 'change_var': return compileChangeVar(node, ctx);
    default:
      ctx.errors.push(`Unknown tile type "${node.type}" — skipped.`);
  }
}

function compileAction(node, ctx) {
  const def = getActuator(node.prim);
  if (!def) {
    ctx.errors.push(`No such action "${node.prim}" — this tile does not map to any real hardware, skipped.`);
    return;
  }
  if (def.requiresBrain && (BRAIN_TIER[def.requiresBrain] ?? 0) > ctx.brainTier) {
    ctx.warnings.push(`"${def.label}" needs a ${BRAINS[def.requiresBrain]?.label}; current brain can't do it yet.`);
  }
  const params = withDefaults(node.prim, node.params);
  ctx.out.push({ op: 'ACT', action: node.prim, params });
}

function compileIf(node, ctx, hasElse) {
  compileCondition(node.cond, ctx);

  // JZ over the THEN body
  const jzIdx = emitPlaceholder(ctx, 'JZ');
  for (const child of Array.isArray(node.body) ? node.body : []) compileNode(child, ctx);

  if (hasElse) {
    const jmpIdx = emitPlaceholder(ctx, 'JMP');   // THEN falls through past ELSE
    patch(ctx, jzIdx, ctx.out.length);            // JZ → start of ELSE
    for (const child of Array.isArray(node.elseBody) ? node.elseBody : []) compileNode(child, ctx);
    patch(ctx, jmpIdx, ctx.out.length);           // JMP → after ELSE
  } else {
    patch(ctx, jzIdx, ctx.out.length);            // JZ → after THEN
  }
}

function compileLoop(node, ctx, forever) {
  const count = forever ? Infinity : Math.max(0, Math.floor(node.count) || 0);
  const loopIdx = ctx.out.length;
  ctx.out.push({ op: 'LOOP', count, forever, end: -1 });   // end patched below

  const head = ctx.out.length;                              // first body instruction
  for (const child of Array.isArray(node.body) ? node.body : []) compileNode(child, ctx);
  ctx.out.push({ op: 'NEXT', head });

  patch(ctx, loopIdx, ctx.out.length, 'end');               // LOOP.end → after NEXT
}

function compileUntil(node, ctx) {
  // Runs the body repeatedly until the condition becomes true.
  // Each iteration: evaluate condition → if true exit, else run body → yield → repeat.
  //
  //   condStart:
  //     [condition]       pushes 1 (true) or 0 (false)
  //     NOT               invert: exit when original was 1
  //     JZ after          if inverted=0 (cond was true): exit
  //     [body]
  //     UNTIL condStart   yield one tick, then jump back to condStart
  //   after:

  const condStart = ctx.out.length;
  compileCondition(node.cond, ctx);
  ctx.out.push({ op: 'NOT' });
  const jzIdx = emitPlaceholder(ctx, 'JZ');                    // exit when cond is true

  for (const child of Array.isArray(node.body) ? node.body : []) compileNode(child, ctx);
  ctx.out.push({ op: 'UNTIL', condStart });

  patch(ctx, jzIdx, ctx.out.length);                           // JZ → after UNTIL
}

/**
 * Macro tiles — Layer-1 "intent" tiles that expand into honest primitives.
 * This is the heart of "function-first, firmware-blurred": a single friendly
 * tile becomes the real timed sequence a robot actually executes.
 */
function compileMacro(node, ctx) {
  const expansion = expandMacro(node, ctx);
  if (!expansion) {
    ctx.errors.push(`Unknown intent tile "${node.kind}" — skipped.`);
    return;
  }
  for (const child of expansion) compileNode(child, ctx);
}

export function expandMacro(node, ctx) {
  switch (node.kind) {
    case 'turn_angle': {
      // "turn right 90°" → start turning, wait the right amount, stop turning.
      const dir = node.params?.dir === 'left' ? 'left' : 'right';
      const degrees = Math.max(0, Number(node.params?.degrees) || 90);
      const speed = 0.6;
      const seconds = degrees / (TURN_RATE * speed);
      return [
        { type: 'action', prim: 'turn', params: withDefaults('turn', { dir, speed }) },
        { type: 'wait', seconds },
        { type: 'action', prim: 'turn', params: withDefaults('turn', { dir, speed: 0 }) },
      ];
    }
    case 'drive_distance': {
      // "drive forward 3 blocks" → drive, wait, stop.
      const dir = node.params?.dir === 'backward' ? 'backward' : 'forward';
      const blocks = Math.max(0, Number(node.params?.blocks) || 1);
      const speed = 0.6;
      const seconds = blocks / (3.0 * speed); // DRIVE_SPEED * speed
      return [
        { type: 'action', prim: 'drive', params: withDefaults('drive', { dir, speed }) },
        { type: 'wait', seconds },
        { type: 'action', prim: 'drive', params: withDefaults('drive', { dir, speed: 0 }) },
      ];
    }
    default:
      return null;
  }
}

function compileSetVar(node, ctx) {
  const name  = _sanitizeVarName(node.name);
  const value = Number(node.value) || 0;
  ctx.out.push({ op: 'CONST', value });
  ctx.out.push({ op: 'SET_VAR', name });
}

function compileChangeVar(node, ctx) {
  const name  = _sanitizeVarName(node.name);
  const delta = Number(node.delta) || 0;
  ctx.out.push({ op: 'CHANGE_VAR', name, delta });
}

function compileRandomVar(node, ctx) {
  const name = _sanitizeVarName(node.name);
  const min  = Math.floor(Number(node.min) || 1);
  const max  = Math.floor(Number(node.max) || 10);
  ctx.out.push({ op: 'RAND_VAR', name, min, max: Math.max(min, max) });
}

function compileCallSub(node, ctx) {
  const name = (node.name ?? 'sub').trim() || 'sub';
  const idx  = ctx.out.length;
  ctx.out.push({ op: 'CALL_SUB', name, target: -1 });
  if (!ctx.callPatches[name]) ctx.callPatches[name] = [];
  ctx.callPatches[name].push(idx);
}

const MATH_OPS = new Set(['add', 'sub', 'mul', 'div']);

function compileMathVar(node, ctx) {
  const name = _sanitizeVarName(node.name);
  const op = MATH_OPS.has(node.op) ? node.op : 'add';
  const operand = Number(node.operand) || 0;
  ctx.out.push({ op: 'MATH_VAR', name, mathOp: op, operand });
}

function compileReadSensor(node, ctx) {
  const name = _sanitizeVarName(node.name);
  const sensor = node.sensor;
  if (!getSensor(sensor)) {
    ctx.errors.push(`No such sensor "${sensor}" — this does not map to real hardware, treated as 0.`);
  }
  ctx.out.push({ op: 'READ_SENSOR', name, sensor });
}

function _sanitizeVarName(raw) {
  return String(raw || 'count').replace(/[^a-z0-9_]/gi, '_') || 'count';
}

// ── Condition compilation ────────────────────────────────────────────────────

function compileCondition(cond, ctx) {
  if (!cond || !cond.sensor) {
    ctx.errors.push('A decision tile is missing its condition — treating it as "false".');
    ctx.out.push({ op: 'CONST', value: 0 });
    return;
  }

  // Variable read: "var:count > 5" → GET_VAR + CONST + CMP
  if (cond.sensor.startsWith('var:')) {
    const varName = _sanitizeVarName(cond.sensor.slice(4));
    const cmp = CMP_OPS.has(cond.cmp) ? cond.cmp : 'gt';
    ctx.out.push({ op: 'GET_VAR', name: varName });
    ctx.out.push({ op: 'CONST', value: Number(cond.value) || 0 });
    ctx.out.push({ op: 'CMP', cmp });
    if (cond.not) ctx.out.push({ op: 'NOT' });
    return;
  }

  const def = getSensor(cond.sensor);
  if (!def) {
    ctx.errors.push(`No such sensor "${cond.sensor}" — this does not map to real hardware, treated as "false".`);
    ctx.out.push({ op: 'CONST', value: 0 });
    return;
  }
  if (def.requiresBrain && (BRAIN_TIER[def.requiresBrain] ?? 0) > ctx.brainTier) {
    ctx.warnings.push(`Sensor "${def.label}" needs a ${BRAINS[def.requiresBrain]?.label}.`);
  }

  const cmp = CMP_OPS.has(cond.cmp) ? cond.cmp : 'gt';
  ctx.out.push({ op: 'SENSE', sensor: cond.sensor });

  if (cmp === 'is') {
    ctx.out.push({ op: 'CONST', value: cond.value ? 1 : 0 });
    ctx.out.push({ op: 'CMP', cmp: 'eq' });
  } else {
    ctx.out.push({ op: 'CONST', value: Number(cond.value) || 0 });
    ctx.out.push({ op: 'CMP', cmp });
  }

  if (cond.not) ctx.out.push({ op: 'NOT' });
}

// ── Jump patching helpers ────────────────────────────────────────────────────

function emitPlaceholder(ctx, op) {
  const idx = ctx.out.length;
  ctx.out.push({ op, target: -1 });
  return idx;
}

function patch(ctx, idx, target, field = 'target') {
  ctx.out[idx][field] = target;
}
