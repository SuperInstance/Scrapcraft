/**
 * ───────────────────────────────────────────────────────────────────────────
 *  JR PROGRAM  —  the data model for a Scrapcraft Jr creation
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  A Jr program is a flat sequence of icon-blocks; the ONLY nesting is a
 *  repeat block, whose body may hold plain blocks (no loops inside loops).
 *  That one-loop ceiling is deliberate: ages 6–10 get "sequence + repeat"
 *  before the tile editor's forever/if/else world.
 *
 *      { name, steps: [ {block:'forward'}, {block:'sound', opt:'high'},
 *                       {block:'repeat', opt:3, body:[{block:'left'},{block:'forward'}]},
 *                       {block:'stop'} ] }
 *
 *  toTileProgram() is the whole bridge: it produces the SAME TileProgram the
 *  Maker Bench edits, so the same compiler, VM, sim bot, and firmware
 *  exporters (Arduino C++ / MicroPython / Wokwi) serve the youngest builders.
 *  There is no parallel runtime — Jr is a dialect of the same language.
 */

import { TileProgram, T } from '../maker/TileProgram.js';
import { JR_BLOCKS, JR_REPEAT_CAP, JR_SEQUENCE_CAP, jrStepToNodes, isBodyBlock } from './JrBlocks.js';

export class JrProgram {

  constructor({ name = 'My Jr Bot', steps = [] } = {}) {
    this.name = name;
    this.steps = steps;
  }

  /** Compile into a real TileProgram (brain tier 'tin' — Jr is entry lane). */
  toTileProgram() {
    const nodes = [];
    for (const step of this.steps) {
      if (step.block === 'start') continue;   // implicit program head
      nodes.push(...jrStepToNodes(step));
    }
    return new TileProgram({ name: this.name, brain: 'tin', nodes, meta: { jr: true } });
  }

  /** Validate against Jr rules. Returns array of kid-friendly error strings. */
  validate({ unlocked = null } = {}) {
    const errs = [];
    if (this.steps.length > JR_SEQUENCE_CAP) {
      errs.push(`Too many blocks (max ${JR_SEQUENCE_CAP}).`);
    }
    let sawStart = false;
    for (const step of this.steps) {
      const def = JR_BLOCKS[step.block];
      if (!def) { errs.push(`Unknown block "${step.block}".`); continue; }
      if (step.block === 'start') {
        sawStart = true;
        continue;
      }
      if (unlocked && !unlocked.has(step.block)) {
        errs.push(`🔒 Craft the ${step.gate ? 'part' : 'block'} to use ${def.icon}.`);
      }
      if (step.block === 'repeat') {
        const count = Math.floor(Number(step.opt) || 2);
        if (count < 1 || count > JR_REPEAT_CAP) {
          errs.push(`🔁 can only repeat 1–${JR_REPEAT_CAP} times.`);
        }
        for (const inner of step.body ?? []) {
          if (!isBodyBlock(inner.block)) {
            errs.push('No 🔁 inside a 🔁 — one loop at a time.');
          }
          if (unlocked && !unlocked.has(inner.block)) {
            errs.push(`🔒 Craft the part to use ${JR_BLOCKS[inner.block]?.icon ?? inner.block}.`);
          }
        }
      }
    }
    if (!sawStart) errs.push('Start with the 🏁 block.');
    return errs;
  }

  toJSON() { return { jr: 1, name: this.name, steps: this.steps }; }

  static fromJSON(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('JrProgram.fromJSON: not an object');
    const prog = new JrProgram({ name: obj.name, steps: Array.isArray(obj.steps) ? obj.steps : [] });
    return prog;
  }

  /** Compact share code rides the same base64 channel as TileProgram. */
  toShareCode() {
    const json = JSON.stringify(this.toJSON());
    if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(json)));
    return Buffer.from(json, 'utf-8').toString('base64');
  }

  static fromShareCode(code) {
    let json;
    if (typeof atob === 'function') json = decodeURIComponent(escape(atob(code)));
    else json = Buffer.from(code, 'base64').toString('utf-8');
    return JrProgram.fromJSON(JSON.parse(json));
  }
}

/** Example: the first Jr build — a honking zig-zag. Seed content + test anchor. */
export const EXAMPLE_JR_ZIGZAG = new JrProgram({
  name: 'Zig Zag Bot',
  steps: [
    { block: 'start' },
    { block: 'forward' },
    { block: 'sound', opt: 'high' },
    { block: 'repeat', opt: 3, body: [ { block: 'left' }, { block: 'forward' } ] },
    { block: 'stop' },
  ],
});
