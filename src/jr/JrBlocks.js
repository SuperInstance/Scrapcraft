/**
 * ───────────────────────────────────────────────────────────────────────────
 *  JR BLOCKS  —  the icon-block vocabulary for Scrapcraft Jr (ages 6–10)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  Jr mode is a pre-literacy programming lane: big chunky ICON tiles, no
 *  reading required. It is LAYERED ON TOP of the tile editor — it does not
 *  replace it. Every Jr program compiles into the same TileProgram the
 *  Maker Bench edits, so it flows through the same compile() → VM → firmware
 *  path. A 7-year-old's 3-block program exports to real Arduino C++ /
 *  MicroPython, exactly like a 13-year-old's wall-avoider.
 *
 *  This module is PURE DATA + pure functions (zero DOM) so it can be tested
 *  in Node. The UI lives in JrEditor.js; the program model in JrProgram.js.
 *
 *  CRAFTING GATES
 *  ──────────────
 *  Icon blocks are unlocked by crafting the matching hardware part:
 *
 *    ⬆️⬅️➡️ motor blocks  ← craft a Motor Driver (L298N)
 *    💡  light block      ← craft an LED Module
 *    🎵  sound block      ← craft a Piezo Buzzer
 *
 *  🏁 when-start, ⏰ wait, 🔁 repeat, 🛑 stop are always available — timing
 *  and control are the free starter kit; ACTUATORS are earned. That mirrors
 *  the scrapyard economy: you don't get motion/light/sound until you build
 *  the parts. It also teaches the deepest lesson in embedded: hardware
 *  first, then software.
 *
 *  CODEGEN MAPPING (icon-block → minimal firmware statements)
 *  ─────────────────────────────────────────────────────────────────────────
 *  | Jr icon block | Craft gate      | TileProgram nodes                 |
 *  |---------------|-----------------|-----------------------------------|
 *  | 🏁 start      | — (always)      | (program head; no emitted node)   |
 *  | ⬆️ forward    | motor_driver    | drive(forward,0.6) + wait(1.0)    |
 *  | ⬅️ left       | motor_driver    | turn(left,0.6)    + wait(0.5)     |
 *  | ➡️ right      | motor_driver    | turn(right,0.6)   + wait(0.5)     |
 *  | ⏰ wait       | — (always)      | wait(n), n ∈ 1..4 s (tap cycles)  |
 *  | 🔁 repeat     | — (always)      | repeat(n ≤ 4, body) — no nesting  |
 *  | 💡 light      | led_module      | led(state), state cycles on tap   |
 *  | 🎵 sound      | buzzer_module   | beep(pitch), pitch cycles on tap  |
 *  | 🛑 stop       | — (always)      | stop()                            |
 *  ─────────────────────────────────────────────────────────────────────────
 *
 *  Motor blocks are "actuate + one beat" — drive THEN a fixed wait — because
 *  that is what a non-reading kid expects the arrow to mean ("go forward for
 *  a bit"), and it is honest firmware: the motors run during the delay.
 */

import { T } from '../maker/TileProgram.js';

/** Maximum repeat count a Jr loop tile may hold (tap cycles 1→2→3→4→1). */
export const JR_REPEAT_CAP = 4;

/** Maximum blocks in one Jr sequence (top level). Generous but bounded. */
export const JR_SEQUENCE_CAP = 16;

/** Fixed "beat" lengths that make each motor block feel like one action. */
export const JR_BEATS = { drive: 1.0, turn: 0.5 };

/** Motor speed for Jr blocks — one safe speed, no slider. */
export const JR_SPEED = 0.6;

/**
 * The Jr block registry. Order = tray order.
 * `gate` is the item id that must have been crafted (or be in inventory).
 * `opts` are the tap-cycled options (first = default).
 */
export const JR_BLOCKS = {
  start:   { id: 'start',   icon: '🏁', gate: null,           opts: null,            hint: 'go!' },
  forward: { id: 'forward', icon: '⬆️', gate: 'motor_driver', opts: null,            hint: 'go forward' },
  left:    { id: 'left',    icon: '⬅️', gate: 'motor_driver', opts: null,            hint: 'turn left' },
  right:   { id: 'right',   icon: '➡️', gate: 'motor_driver', opts: null,            hint: 'turn right' },
  wait:    { id: 'wait',    icon: '⏰', gate: null,           opts: [1, 2, 3, 4],    hint: 'wait' },
  repeat:  { id: 'repeat',  icon: '🔁', gate: null,           opts: [2, 3, 4, 1],    hint: 'do again' },
  light:   { id: 'light',   icon: '💡', gate: 'led_module',   opts: ['green', 'blue', 'red', 'off'], hint: 'light' },
  sound:   { id: 'sound',   icon: '🎵', gate: 'buzzer_module', opts: ['mid', 'high', 'low'],         hint: 'sound' },
  stop:    { id: 'stop',    icon: '🛑', gate: null,           opts: null,            hint: 'stop' },
};

/** Blocks that may appear INSIDE a repeat body (no nesting — one loop level). */
export function isBodyBlock(blockId) {
  return blockId !== 'start' && blockId !== 'repeat';
}

/**
 * Which Jr blocks a player has unlocked.
 * Gate passes if the part was EVER crafted (`player.crafted`, persists even
 * after the item is consumed) OR is currently in inventory.
 * Accepts a plain object `{ crafted:Set, hasItem:(id)=>bool }` so tests and
 * the UI can pass either the real Player or a mock.
 */
export function jrUnlockedBlocks(player) {
  const crafted = player?.crafted ?? new Set();
  const hasItem = typeof player?.hasItem === 'function'
    ? (id) => player.hasItem(id)
    : (id) => typeof player?.countItem === 'function' && player.countItem(id) > 0;
  const unlocked = new Set();
  for (const def of Object.values(JR_BLOCKS)) {
    if (!def.gate) { unlocked.add(def.id); continue; }
    if (crafted.has(def.gate) || hasItem(def.gate)) unlocked.add(def.id);
  }
  return unlocked;
}

/**
 * One Jr step → TileProgram nodes. THE codegen mapping. Pure.
 *
 * @param {{block:string, opt?:any, body?:object[]}} step
 * @returns {object[]} TileProgram-ready node objects (built via T constructors)
 */
export function jrStepToNodes(step) {
  switch (step?.block) {
    case 'forward':
      return [T.action('drive', { dir: 'forward', speed: JR_SPEED }), T.wait(JR_BEATS.drive)];
    case 'left':
      return [T.action('turn', { dir: 'left', speed: JR_SPEED }), T.wait(JR_BEATS.turn)];
    case 'right':
      return [T.action('turn', { dir: 'right', speed: JR_SPEED }), T.wait(JR_BEATS.turn)];
    case 'wait': {
      const secs = Math.min(4, Math.max(1, Math.floor(Number(step.opt) || 1)));
      return [T.wait(secs)];
    }
    case 'repeat': {
      const count = Math.min(JR_REPEAT_CAP, Math.max(1, Math.floor(Number(step.opt) || 2)));
      const body = [];
      for (const inner of step.body ?? []) {
        if (!isBodyBlock(inner.block)) continue;      // no nested loops, ever
        body.push(...jrStepToNodes(inner));
      }
      return [T.repeat(count, body)];
    }
    case 'light': {
      const state = ['green', 'blue', 'red', 'off'].includes(step.opt) ? step.opt : 'green';
      return [T.action('led', { state })];
    }
    case 'sound': {
      const pitch = ['low', 'mid', 'high'].includes(step.opt) ? step.opt : 'mid';
      return [T.action('beep', { pitch })];
    }
    case 'stop':
      return [T.action('stop')];
    case 'start':
    default:
      return [];   // the flag is the program head, not an emitted node
  }
}
