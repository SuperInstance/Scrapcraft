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
 *    repeat       { type:'repeat', count, body:[...] }          loop N times
 *    forever      { type:'forever', body:[...] }                loop endlessly (= loop())
 *    repeat_until { type:'repeat_until', cond, body:[...] }     loop until cond is true (= while !cond)
 *    break        { type:'break' }                               exit the enclosing forever/repeat loop
 *    print        { type:'print', name }                         emit variable value to serial/HUD (console.log)
 *    comment      { type:'comment', text }                       non-executing annotation (becomes a code comment)
 *    random_var   { type:'random_var', name, min, max }          set variable to random integer in [min, max]
 *    read_sensor  { type:'read_sensor', name, sensor }           read live sensor value into a variable
 *    math_var     { type:'math_var', name, op, operand }        name = name op operand  (op ∈ add|sub|mul|div)
 *    if           { type:'if',   cond, body:[...] }             conditional
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
  cond:    (sensor, cmp, value)   => ({ sensor, cmp, value }),
  is:      (sensor, value = true) => ({ sensor, cmp: 'is', value }),
  not:     (c)                    => ({ ...c, not: !c.not }),

  // variable tiles
  setVar:    (name, value = 0)         => ({ type: 'set_var',      name, value }),
  changeVar: (name, delta = 1)         => ({ type: 'change_var',   name, delta }),
  varCond:   (name, cmp, value)        => ({ sensor: `var:${name}`, cmp, value }),
  varVsCond: (name, cmp, otherName)    => ({ sensor: `var:${name}`, cmp, varValue: otherName }),

  // repeat_until: runs body until condition becomes true (= while !cond)
  repeatUntil: (cond, body = []) => ({ type: 'repeat_until', cond, body }),

  // break: immediately exits the enclosing forever or repeat loop
  break: () => ({ type: 'break' }),

  // print: emits the current value of a variable to the serial monitor / HUD
  print: (name) => ({ type: 'print', name }),

  // comment: a non-executing annotation tile — pure documentation
  comment: (text = 'note') => ({ type: 'comment', text }),

  // random_var: set a variable to a random integer in [min, max]
  randomVar: (name, min = 1, max = 10) => ({ type: 'random_var', name, min, max }),

  // read_sensor: capture the live numeric value of a sensor into a variable
  readSensor: (name, sensor = 'distance_ahead') => ({ type: 'read_sensor', name, sensor }),

  // math_var: name = name op operand  (op ∈ 'add' | 'sub' | 'mul' | 'div')
  mathVar: (name, op = 'mul', operand = 1) => ({ type: 'math_var', name, op, operand: Number(operand) || 0 }),
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
        if (Array.isArray(node.body)) recur(node.body, depth + 1);
        if (Array.isArray(node.elseBody)) recur(node.elseBody, depth + 1);
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
      if (n.type === 'read_sensor' && n.sensor) sensors.add(n.sensor);
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

/**
 * Crystal ore hunter — drives through The Deep Yard scanning for ore signals.
 * LED colour codes the signal strength: red=searching, blue=warm, green=jackpot.
 * Uses the ore_nearby hall-effect sensor (Spark Brain required).
 */
export const EXAMPLE_ORE_HUNTER = new TileProgram({
  name: 'Ore Hunter',
  brain: 'spark',
  nodes: [
    T.forever([
      T.ifElse(
        T.cond('ore_nearby', 'gt', 0.65),  // close hit — stop and signal
        [
          T.action('stop'),
          T.action('led', { state: 'green' }),
          T.action('beep', { pitch: 'high' }),
          T.wait(0.3),
          T.action('beep', { pitch: 'high' }),
          T.wait(0.5),
        ],
        [
          T.ifElse(
            T.cond('ore_nearby', 'gt', 0.3),  // warm — creep toward signal
            [T.action('led', { state: 'blue' }), T.action('drive', { dir: 'forward', speed: 0.3 })],
            [T.action('led', { state: 'red' }),  T.action('drive', { dir: 'forward', speed: 0.55 })],
          ),
          // Wall avoidance while scanning
          T.if(T.cond('distance_ahead', 'lt', 0.2), [
            T.action('drive', { dir: 'backward', speed: 0.4 }), T.wait(0.3),
            T.action('turn', { dir: 'right', speed: 0.6 }),     T.wait(0.35),
          ]),
        ],
      ),
    ]),
  ],
});

// Battery-aware patrol: slows to 30% speed when battery drops below 25%
// Teaches: conditional branching, sensor thresholds, power management
export const EXAMPLE_BATTERY_SAVER = new TileProgram({
  name: 'Battery Saver Patrol',
  brain: 'tin',
  nodes: [
    T.forever([
      // High battery: full-speed patrol loop
      T.if(
        T.cond('battery', 'gt', 0.25),
        [
          T.action('drive', { dir: 'forward', speed: 0.8 }),
          T.wait(1.5),
          T.if(
            T.cond('distance_ahead', 'lt', 0.15),
            [
              T.action('drive', { dir: 'backward', speed: 0.5 }),
              T.wait(0.3),
              T.action('turn', { dir: 'right', speed: 0.7 }),
              T.wait(0.5),
            ],
          ),
        ],
      ),
      // Low battery: slow to 30% and beep a warning
      T.if(
        T.cond('battery', 'lte', 0.25),
        [
          T.action('beep', { pitch: 'low' }),
          T.action('drive', { dir: 'forward', speed: 0.3 }),
          T.wait(1.0),
          T.if(
            T.cond('distance_ahead', 'lt', 0.15),
            [T.action('turn', { dir: 'right', speed: 0.4 }), T.wait(0.5)],
          ),
        ],
      ),
      // Dead battery: stop and beep SOS
      T.if(
        T.cond('battery', 'lte', 0.05),
        [T.action('stop'), T.action('beep', { pitch: 'low' }), T.wait(0.5)],
      ),
    ]),
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

// Bump counter — counts wall collisions; stops and flashes red after 5.
// Teaches: variables, change_var, reading a variable in a condition.
export const EXAMPLE_BUMP_COUNTER = new TileProgram({
  name: 'Bump Counter',
  brain: 'tin',
  nodes: [
    T.setVar('bumps', 0),                         // initialize counter
    T.forever([
      T.action('drive', { dir: 'forward', speed: 0.6 }),
      T.if(T.is('bumped', true), [
        T.changeVar('bumps', 1),                  // bumps += 1
        T.action('beep', { pitch: 'high' }),
        T.action('turn', { dir: 'right', speed: 0.6 }),
        T.wait(0.4),
      ]),
      T.if(T.varCond('bumps', 'gte', 5), [        // if bumps >= 5 → stop
        T.action('stop'),
        T.action('led', { state: 'red' }),
        T.action('beep', { pitch: 'low' }),
        T.wait(2),
        T.setVar('bumps', 0),                     // reset counter
      ]),
    ]),
  ],
});
