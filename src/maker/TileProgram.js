/**
 * ───────────────────────────────────────────────────────────────────────────
 *  TILE PROGRAM  —  the data model for a creation's "brain"
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  A tile program is a tree of nodes. This is what the drag-drop editor edits,
 *  what Spark (the AI) emits, what the compiler turns into bytecode, and what
 *  the firmware generator turns into Arduino / MicroPython.
 *
 *  It is plain JSON-serializable data — NO behaviour lives here. Behaviour is
 *  in primitives.js (what tiles do) and TileVM.js (how they run). Keeping the
 *  program as pure data is what makes save/load, sharing-by-URL, AI-authoring,
 *  and remixing all trivial.
 *
 *  NODE TYPES
 *  ──────────
 *    action       { type:'action', prim, params }          do one actuator op
 *    wait         { type:'wait',   seconds }                pause (non-blocking)
 *    repeat       { type:'repeat', count, body:[...] }      loop N times
 *    forever      { type:'forever', body:[...] }            loop endlessly (= loop())
 *    if           { type:'if',   cond, body:[...] }         conditional
 *    if_else      { type:'if_else', cond, body:[...], elseBody:[...] }
 *    macro        { type:'macro', kind, params }            expands at compile time
 *                                                            (Layer-1 "intent" tiles)
 *
 *  CONDITION  (used by if / if_else)
 *  ─────────
 *    { sensor, cmp, value }   e.g. { sensor:'brightness', cmp:'gt', value:0.6 }
 *    For digital sensors:     { sensor:'bumped', cmp:'is', value:true }
 *    Negation:                { not:true, sensor, cmp, value }
 *
 *  cmp ∈ 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'is'
 * ───────────────────────────────────────────────────────────────────────────
 */

import { withDefaults } from './primitives.js';

export const SCHEMA_VERSION = 1;

// ── Node constructors (used by editor, Spark, and tests) ────────────────────

export const T = {
  action: (prim, params = {}) => ({ type: 'action', prim, params: withDefaults(prim, params) }),
  wait:   (seconds)           => ({ type: 'wait', seconds: Math.max(0, Number(seconds) || 0) }),
  repeat: (count, body = [])  => ({ type: 'repeat', count: Math.max(0, Math.floor(count) || 0), body }),
  forever:(body = [])         => ({ type: 'forever', body }),
  if:     (cond, body = [])   => ({ type: 'if', cond, body }),
  ifElse: (cond, body = [], elseBody = []) => ({ type: 'if_else', cond, body, elseBody }),
  macro:  (kind, params = {}) => ({ type: 'macro', kind, params }),

  // condition builders
  cond:   (sensor, cmp, value)   => ({ sensor, cmp, value }),
  is:     (sensor, value = true) => ({ sensor, cmp: 'is', value }),
  not:    (c)                    => ({ ...c, not: !c.not }),
};

/**
 * A TileProgram wraps the node list plus metadata (brain tier, name, author).
 */
export class TileProgram {
  constructor({ name = 'Untitled Brain', brain = 'tin', nodes = [], meta = {} } = {}) {
    this.name = name;
    this.brain = brain;        // 'tin' | 'spark' | 'vision'
    this.nodes = nodes;        // array of root-level nodes
    this.meta = meta;          // { author, createdAt, remixOf, ... }
    this.version = SCHEMA_VERSION;
  }

  // ── Serialization (save / load / share-by-URL) ──────────────────────────

  toJSON() {
    return { version: this.version, name: this.name, brain: this.brain, nodes: this.nodes, meta: this.meta };
  }

  static fromJSON(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('TileProgram.fromJSON: not an object');
    const prog = new TileProgram({ name: obj.name, brain: obj.brain, nodes: obj.nodes ?? [], meta: obj.meta ?? {} });
    prog.version = obj.version ?? SCHEMA_VERSION;
    return prog;
  }

  /** Compact base64 string for ?brain=... share links. */
  toShareCode() {
    const json = JSON.stringify(this.toJSON());
    // btoa exists in browser; Buffer fallback for Node (tests / SSR codegen).
    if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(json)));
    return Buffer.from(json, 'utf-8').toString('base64');
  }

  static fromShareCode(code) {
    let json;
    if (typeof atob === 'function') json = decodeURIComponent(escape(atob(code)));
    else json = Buffer.from(code, 'base64').toString('utf-8');
    return TileProgram.fromJSON(JSON.parse(json));
  }

  /** Walk every node depth-first (incl. nested bodies). cb(node, depth, parentBody). */
  walk(cb) {
    const recur = (list, depth) => {
      for (const node of list) {
        cb(node, depth, list);
        if (node.body) recur(node.body, depth + 1);
        if (node.elseBody) recur(node.elseBody, depth + 1);
      }
    };
    recur(this.nodes, 0);
  }

  /** Set of primitive/sensor ids actually used — drives firmware #includes/setup. */
  usedPrimitives() {
    const acts = new Set(), sensors = new Set();
    this.walk((n) => {
      if (n.type === 'action') acts.add(n.prim);
      if (n.cond?.sensor) sensors.add(n.cond.sensor);
    });
    return { actuators: [...acts], sensors: [...sensors] };
  }
}

// ── Example programs (seed content + test fixtures + Spark few-shot anchors) ─

/** Layer-1: the absolute first program. Avoid walls, beep on bump. */
export const EXAMPLE_WALL_AVOIDER = new TileProgram({
  name: 'Wall Avoider',
  brain: 'tin',
  nodes: [
    T.forever([
      T.ifElse(
        T.cond('distance_ahead', 'lt', 0.25),
        [ T.action('beep', { pitch: 'high' }), T.action('turn', { dir: 'right', speed: 0.6 }), T.wait(0.4) ],
        [ T.action('drive', { dir: 'forward', speed: 0.6 }) ],
      ),
    ]),
  ],
});

/** Layer-2: the "phototophobic honking rover" from the design doc. */
export const EXAMPLE_LIGHT_RUNNER = new TileProgram({
  name: 'Light Runner',
  brain: 'spark',
  nodes: [
    T.forever([
      T.ifElse(
        T.cond('brightness', 'gt', 0.6),
        // bright → flee
        [ T.action('led', { state: 'red' }), T.action('drive', { dir: 'forward', speed: 1 }) ],
        // dark enough → relax
        [ T.action('led', { state: 'blue' }), T.action('drive', { dir: 'forward', speed: 0.3 }) ],
      ),
      T.if(T.is('bumped', true), [
        T.action('beep', { pitch: 'high' }),
        T.action('turn', { dir: 'left', speed: 0.8 }),
        T.wait(0.5),
      ]),
    ]),
  ],
});

/** Line-follower: stay on TRACK blocks using the IR sensor. */
export const EXAMPLE_LINE_FOLLOWER = new TileProgram({
  name: 'Line Follower',
  brain: 'tin',
  nodes: [
    T.forever([
      T.ifElse(
        T.is('line_under', true),
        [ T.action('drive',  { dir: 'forward', speed: 0.5 }) ],
        [ T.action('turn',   { dir: 'right', speed: 0.5 }), T.wait(0.15) ],
      ),
    ]),
  ],
});

/** Macro demo: a Layer-1 "drive in a square" intent tile that expands at compile time. */
export const EXAMPLE_SQUARE = new TileProgram({
  name: 'Honking Square',
  brain: 'tin',
  nodes: [
    T.repeat(4, [
      T.action('drive', { dir: 'forward', speed: 0.6 }),
      T.wait(1.0),
      T.action('beep', { pitch: 'mid' }),
      T.macro('turn_angle', { dir: 'right', degrees: 90 }),  // expands to turn+wait+stop
    ]),
    T.action('stop'),
  ],
});

// Navigate toward the player's dropped waypoint flag (Y key)
export const EXAMPLE_WAYPOINT_NAV = new TileProgram({
  name: 'Waypoint Navigator',
  brain: 'spark',
  nodes: [
    // Loop forever: steer toward the waypoint, stop when close
    T.forever([
      T.ifElse(
        T.cond('waypoint_dist', 'lt', 0.08),  // arrived (within ~1 block)
        [T.action('stop'), T.action('beep', { pitch: 'high' }), T.wait(0.5)],
        [
          // Steer: if bearing > 0.1, turn right; if < -0.1, turn left; else drive
          T.ifElse(
            T.cond('waypoint_bearing', 'gt', 0.1),
            [T.action('turn', { dir: 'right', speed: 0.5 })],
            [
              T.ifElse(
                T.cond('waypoint_bearing', 'lt', -0.1),
                [T.action('turn', { dir: 'left', speed: 0.5 })],
                [T.action('drive', { dir: 'forward', speed: 0.7 })],
              ),
            ],
          ),
          // Obstacle avoidance: if wall ahead, reverse and turn
          T.if(
            T.cond('distance_ahead', 'lt', 0.15),
            [
              T.action('drive', { dir: 'backward', speed: 0.5 }),
              T.wait(0.4),
              T.action('turn', { dir: 'right', speed: 0.6 }),
              T.wait(0.3),
            ],
          ),
        ],
      ),
    ]),
  ],
});
