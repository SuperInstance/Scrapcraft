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
    sourceMap: [],   // [{ pc, nodeId }] — maps bytecode offset to tile node id
  };

  for (const node of nodes) compileNode(node, ctx);
  ctx.out.push({ op: 'HALT' });

  return {
    ok: ctx.errors.length === 0,
    bytecode: ctx.out,
    errors: ctx.errors,
    warnings: ctx.warnings,
    sourceMap: ctx.sourceMap,
  };
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
    case 'repeat':  return compileLoop(node, ctx, false);
    case 'forever': return compileLoop(node, ctx, true);
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
  for (const child of node.body ?? []) compileNode(child, ctx);

  if (hasElse) {
    const jmpIdx = emitPlaceholder(ctx, 'JMP');   // THEN falls through past ELSE
    patch(ctx, jzIdx, ctx.out.length);            // JZ → start of ELSE
    for (const child of node.elseBody ?? []) compileNode(child, ctx);
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
  for (const child of node.body ?? []) compileNode(child, ctx);
  ctx.out.push({ op: 'NEXT', head });

  patch(ctx, loopIdx, ctx.out.length, 'end');               // LOOP.end → after NEXT
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
