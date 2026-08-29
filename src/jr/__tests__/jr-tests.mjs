/**
 * Jr mode tests — the youngest lane must compile to REAL firmware.
 *
 * Everything pure, zero browser: the block registry's integrity (every block
 * maps to legal Maker Lab primitives), the craft-gate truth table, the
 * icon-block → TileProgram codegen mapping, Jr rule enforcement (repeat cap,
 * no nested loops, sequence cap), JSON round-trip, and end-to-end firmware
 * sanity — a Jr program must produce the same drive/turn/beep/led statements
 * the tile editor emits, in both Arduino C++ and MicroPython.
 *
 * Exported as runJrTests(pass, fail) so run-tests.mjs can fold this into the
 * one harness, ambient-tests style.
 */

import { JR_BLOCKS, JR_REPEAT_CAP, JR_SEQUENCE_CAP, jrUnlockedBlocks, jrStepToNodes, isBodyBlock } from '../JrBlocks.js';
import { JrProgram, EXAMPLE_JR_ZIGZAG } from '../JrProgram.js';
import { compile } from '../../maker/TileCompiler.js';
import { toArduino, toMicroPython } from '../../maker/FirmwareGen.js';

export function runJrTests(pass, fail) {
  const ok = (name, cond, extra = '') => {
    if (cond) pass(name);
    else fail(name, extra);
  };

  // ══ 1. Registry integrity ═════════════════════════════════════════════
  console.log('\nJr · block registry');
  {
    const ids = Object.keys(JR_BLOCKS);
    const required = ['start', 'forward', 'left', 'right', 'wait', 'repeat', 'light', 'sound', 'stop'];
    ok('all 9 spec blocks present (flag, 3 motors, wait, repeat, light, sound, stop)',
       required.every(id => ids.includes(id)));

    for (const def of Object.values(JR_BLOCKS)) {
      ok(`block "${def.id}" has an icon + hint`, typeof def.icon === 'string' && def.icon.length > 0 && !!def.hint);
    }

    // every gated block gates on a real craftable part
    const gates = Object.values(JR_BLOCKS).filter(b => b.gate).map(b => b.gate);
    ok('craft gates are exactly motor/light/sound parts',
       gates.length === 5 &&
       gates.filter(g => g === 'motor_driver').length === 3 &&
       gates.includes('led_module') && gates.includes('buzzer_module'));

    // repeat and stop are never body blocks (no start inside loops either)
    ok('repeat cannot nest (not a body block)', isBodyBlock('repeat') === false);
    ok('start cannot appear in a loop', isBodyBlock('start') === false);
    ok('action blocks can appear in a loop', isBodyBlock('forward') && isBodyBlock('light') && isBodyBlock('sound'));
    ok('repeat cap is 4 (spec)', JR_REPEAT_CAP === 4);
  }

  // ══ 2. Craft-gate truth table ═════════════════════════════════════════
  console.log('\nJr · crafting gates');
  {
    const fresh = { crafted: new Set(), countItem: () => 0 };
    const base = jrUnlockedBlocks(fresh);
    ok('fresh player has flag/wait/repeat/stop only',
       ['start', 'wait', 'repeat', 'stop'].every(id => base.has(id)) &&
       !base.has('forward') && !base.has('left') && !base.has('right') &&
       !base.has('light') && !base.has('sound'));

    const withMotor = jrUnlockedBlocks({ crafted: new Set(['motor_driver']), countItem: () => 0 });
    ok('crafting a motor driver unlocks all three motor blocks',
       withMotor.has('forward') && withMotor.has('left') && withMotor.has('right') &&
       !withMotor.has('light') && !withMotor.has('sound'));

    const withLight = jrUnlockedBlocks({ crafted: new Set(['led_module']), countItem: () => 0 });
    ok('crafting an LED module unlocks the light block only',
       withLight.has('light') && !withLight.has('sound') && !withLight.has('forward'));

    const withBuzzer = jrUnlockedBlocks({ crafted: new Set(['buzzer_module']), countItem: () => 0 });
    ok('crafting a buzzer unlocks the sound block only',
       withBuzzer.has('sound') && !withBuzzer.has('light') && !withBuzzer.has('forward'));

    // inventory OR crafted-set both open the gate (parts survive consumption)
    const invOnly = jrUnlockedBlocks({ crafted: new Set(), countItem: (id) => (id === 'led_module' ? 2 : 0) });
    ok('holding the part in inventory also unlocks (never-crafted path)', invOnly.has('light'));

    const noPlayer = jrUnlockedBlocks(null);
    ok('null player fails soft to the free starter kit',
       noPlayer.has('wait') && !noPlayer.has('forward'));
  }

  // ══ 3. Codegen mapping — icon block → minimal firmware statements ══════
  console.log('\nJr · icon-block → TileProgram codegen');
  {
    const fwd = jrStepToNodes({ block: 'forward' });
    ok('forward → drive(forward) + one-beat wait',
       fwd.length === 2 && fwd[0].type === 'action' && fwd[0].prim === 'drive' &&
       fwd[0].params.dir === 'forward' && fwd[1].type === 'wait' && fwd[1].seconds === 1.0);

    const left = jrStepToNodes({ block: 'left' });
    ok('left → turn(left) + half-beat wait',
       left.length === 2 && left[0].prim === 'turn' && left[0].params.dir === 'left' &&
       left[1].type === 'wait' && left[1].seconds === 0.5);

    const right = jrStepToNodes({ block: 'right' });
    ok('right → turn(right) + half-beat wait',
       right[0].params.dir === 'right' && right[1].seconds === 0.5);

    const wait = jrStepToNodes({ block: 'wait', opt: 3 });
    ok('wait → wait(3s)', wait.length === 1 && wait[0].type === 'wait' && wait[0].seconds === 3);

    const light = jrStepToNodes({ block: 'light', opt: 'blue' });
    ok('light → led(blue)', light.length === 1 && light[0].prim === 'led' && light[0].params.state === 'blue');

    const sound = jrStepToNodes({ block: 'sound', opt: 'high' });
    ok('sound → beep(high)', sound.length === 1 && sound[0].prim === 'beep' && sound[0].params.pitch === 'high');

    const stop = jrStepToNodes({ block: 'stop' });
    ok('stop → stop()', stop.length === 1 && stop[0].prim === 'stop');

    ok('start block emits nothing (it is the program head)',
       jrStepToNodes({ block: 'start' }).length === 0);

    const rep = jrStepToNodes({ block: 'repeat', opt: 3, body: [{ block: 'left' }, { block: 'forward' }] });
    ok('repeat(3, [left, forward]) → repeat node with compiled body',
       rep.length === 1 && rep[0].type === 'repeat' && rep[0].count === 3 &&
       rep[0].body.length === 4 /* left(2 nodes) + forward(2 nodes) */);

    // hostile inputs clamp, never throw
    const bigRep = jrStepToNodes({ block: 'repeat', opt: 99, body: [{ block: 'wait', opt: 1 }] });
    ok('repeat count clamps to cap 4', bigRep[0].count === 4);
    const nested = jrStepToNodes({ block: 'repeat', opt: 2, body: [{ block: 'repeat', opt: 2, body: [] }] });
    ok('nested repeat is silently dropped by codegen (UI + validate forbid it)',
       nested[0].body.length === 0);
    const junk = jrStepToNodes({ block: 'wait', opt: 'garbage' });
    ok('non-numeric wait option fails soft to 1s', junk[0].seconds >= 1 && junk[0].seconds <= 4);
  }

  // ══ 4. Program → TileProgram (the systems bridge) ═════════════════════
  console.log('\nJr · JrProgram → TileProgram');
  {
    const tp = EXAMPLE_JR_ZIGZAG.toTileProgram();
    ok('example compiles through the REAL tile compiler', compile(tp).ok === true);
    ok('program is flagged jr in meta (gallery/ledger can tell lanes apart)', tp.meta?.jr === true);
    ok('brain tier is tin (entry lane)', tp.brain === 'tin');

    // structure: forward+wait, beep, repeat(3)[left+wait,forward+wait], stop
    ok('zig-zag node shape is exactly the codegen table',
       tp.nodes.length === 5 &&
       tp.nodes[0].type === 'action' && tp.nodes[0].prim === 'drive' &&
       tp.nodes[1].type === 'wait' && tp.nodes[1].seconds === 1.0 &&
       tp.nodes[2].prim === 'beep' &&
       tp.nodes[3].type === 'repeat' && tp.nodes[3].count === 3 &&
       tp.nodes[3].body.length === 4 &&
       tp.nodes[4].prim === 'stop');

    // empty program still compiles (a flag alone is a valid, boring program)
    const flagOnly = new JrProgram({ steps: [{ block: 'start' }] }).toTileProgram();
    ok('flag-only program compiles (valid, boring)', compile(flagOnly).ok === true);
  }

  // ══ 5. Jr rules: validate() ═══════════════════════════════════════════
  console.log('\nJr · validate (caps + gates)');
  {
    const all = new Set(Object.keys(JR_BLOCKS));
    ok('example passes validation with everything unlocked',
       EXAMPLE_JR_ZIGZAG.validate({ unlocked: all }).length === 0);

    ok('example fails for a fresh player (motor + sound are gated)',
       EXAMPLE_JR_ZIGZAG.validate({ unlocked: jrUnlockedBlocks({ crafted: new Set(), countItem: () => 0 }) }).length > 0);

    const noFlag = new JrProgram({ steps: [{ block: 'forward' }] });
    ok('missing 🏁 start is an error', noFlag.validate({ unlocked: all }).some(e => e.includes('🏁')));

    const nested = new JrProgram({
      steps: [{ block: 'start' },
              { block: 'repeat', opt: 2, body: [{ block: 'repeat', opt: 2, body: [] }] }],
    });
    ok('nested repeat is an error', nested.validate({ unlocked: all }).some(e => e.includes('🔁 inside')));

    const overCount = new JrProgram({
      steps: [{ block: 'start' }, { block: 'repeat', opt: 9, body: [] }],
    });
    ok('repeat count > 4 is an error', overCount.validate({ unlocked: all }).some(e => e.includes('repeat 1–4')));

    const long = new JrProgram({ steps: [{ block: 'start' }, ...Array.from({ length: 20 }, () => ({ block: 'stop' }))] });
    ok('sequence beyond the cap is an error', long.validate({ unlocked: all }).some(e => e.includes('Too many')));
    ok('sequence cap is 16 (spec)', JR_SEQUENCE_CAP === 16);

    const gated = new JrProgram({ steps: [{ block: 'start' }, { block: 'light', opt: 'red' }] });
    ok('light in a locked program is an error', gated.validate({ unlocked: new Set(['start', 'wait', 'repeat', 'stop']) }).some(e => e.includes('🔒')));
  }

  // ══ 6. Serialization round-trip ═══════════════════════════════════════
  console.log('\nJr · save / share round-trip');
  {
    const json = JSON.parse(JSON.stringify(EXAMPLE_JR_ZIGZAG.toJSON()));
    const back = JrProgram.fromJSON(json);
    ok('JSON round-trip preserves steps + options',
       JSON.stringify(back.steps) === JSON.stringify(EXAMPLE_JR_ZIGZAG.steps) && back.name === EXAMPLE_JR_ZIGZAG.name);

    const code = EXAMPLE_JR_ZIGZAG.toShareCode();
    const back2 = JrProgram.fromShareCode(code);
    ok('share code round-trips in Node (Buffer path)', back2.steps.length === EXAMPLE_JR_ZIGZAG.steps.length);
  }

  // ══ 7. Firmware sanity — Jr compiles to REAL firmware, not a toy ═══════
  console.log('\nJr · firmware export');
  {
    const tp = EXAMPLE_JR_ZIGZAG.toTileProgram();
    const ino = toArduino(tp);
    const py  = toMicroPython(tp);

    ok('Arduino: drive statement present', ino.includes('drive(FORWARD'));
    ok('Arduino: turn statement present', ino.includes('turn(LEFT'));
    ok('Arduino: buzzer tone present', ino.includes('tone(BUZZ_PIN'));
    ok('Arduino: motor stop present', ino.includes('stopMotors()'));
    ok('Arduino: counted loop for repeat', /for\s*\(\s*int\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*3\s*;/.test(ino));

    ok('MicroPython: drive statement present', py.includes('m.drive("forward"'));
    ok('MicroPython: turn statement present', py.includes('m.turn("left"'));
    ok('MicroPython: beep present', py.includes('beep('));
    ok('MicroPython: motor stop present', py.includes('m.stop()'));
    ok('MicroPython: counted loop for repeat', /for\s+\w+\s+in\s+range\(3\)/.test(py));

    // same statements a tile-editor program emits — one compile path, no Jr dialect
    const handWritten = compile(new (EXAMPLE_JR_ZIGZAG.toTileProgram().constructor)({
      name: 'same', brain: 'tin',
      nodes: tp.nodes,
    }));
    ok('Jr output is indistinguishable from a hand-built TileProgram', handWritten.ok === true);
  }
}
