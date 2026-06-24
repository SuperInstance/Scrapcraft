/**
 * Maker Lab test harness — run with:  node src/maker/__tests__/run-tests.mjs
 *
 * No framework. Pure Node ES modules (package.json has "type":"module").
 * Proves the load-bearing pieces: compiler validation, macro expansion, the
 * resumable VM's timing semantics, robot kinematics + collision, an end-to-end
 * behaviour, and firmware codegen. Exits non-zero on any failure (CI-friendly).
 */

import { compile } from '../TileCompiler.js';
import { TileVM } from '../TileVM.js';
import { VirtualRobot } from '../VirtualRobot.js';
import { MakerRuntime } from '../index.js';
import { toArduino, toMicroPython } from '../FirmwareGen.js';
import {
  TileProgram, T,
  EXAMPLE_WALL_AVOIDER, EXAMPLE_LIGHT_RUNNER, EXAMPLE_SQUARE,
  EXAMPLE_BUMP_COUNTER,
} from '../TileProgram.js';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
}
function approx(a, b, eps = 0.25) { return Math.abs(a - b) <= eps; }

// Configurable sensor-backing mock.
class MockWorld {
  constructor() { this.light = 1; this.dist = 1; this.playerDist = 99; this.solid = () => false; }
  lightAt() { return this.light; }
  distanceAhead() { return this.dist; }
  playerDistance() { return this.playerDist; }
  isSolidAt(x, z) { return this.solid(x, z); }
}

// ── 1. Compiler: validation + macro expansion ──────────────────────────────
console.log('\nCompiler');
{
  const good = compile(EXAMPLE_WALL_AVOIDER);
  ok('valid program compiles cleanly', good.ok && good.errors.length === 0,
     JSON.stringify(good.errors));
  ok('emits a HALT terminator', good.bytecode.at(-1).op === 'HALT');

  const bad = compile(new TileProgram({ nodes: [T.action('frobnicate')] }));
  ok('rejects unknown actuator (AI safety rail)', !bad.ok && bad.errors.length > 0);

  const sq = compile(EXAMPLE_SQUARE);
  ok('macro program compiles ok', sq.ok, JSON.stringify(sq.errors));
  ok('turn_angle macro expands into a timed WAIT', sq.bytecode.some(i => i.op === 'WAIT'));
  ok('turn_angle macro expands into turn ACTs', sq.bytecode.some(i => i.op === 'ACT' && i.action === 'turn'));
}

// ── 2. VM: WAIT is non-blocking and correctly timed ─────────────────────────
console.log('\nVM · non-blocking wait');
{
  const prog = new TileProgram({ nodes: [
    T.action('drive', { dir: 'forward', speed: 0.5 }),
    T.wait(1.0),
    T.action('stop'),
  ]});
  const rt = new MakerRuntime(prog, { x: 0, z: 0, heading: 0 }, new MockWorld());
  for (let i = 0; i < 15; i++) rt.tick(0.1);
  ok('drove ~1.5 blocks over a 1.0s wait', approx(rt.robot.z, 1.5), `z=${rt.robot.z.toFixed(2)}`);
  ok('program halted and cut motors', rt.vm.halted && rt.robot.drivePower === 0);
}

// ── 3. VM: forever yields one pass per tick (mirrors loop()) ────────────────
console.log('\nVM · forever pacing');
{
  const prog = new TileProgram({ nodes: [ T.forever([ T.action('beep', { pitch: 'mid' }) ]) ]});
  const rt = new MakerRuntime(prog, {}, new MockWorld());
  rt.tick(0.016);
  rt.tick(0.016);
  rt.tick(0.016);
  const beeps = rt.drainEvents().filter(e => e.kind === 'beep').length;
  ok('three ticks → three beeps (one per frame)', beeps === 3, `beeps=${beeps}`);
  ok('forever never halts', !rt.vm.halted);
}

// ── 4. VM: counted repeat runs to completion within one tick ───────────────
console.log('\nVM · counted loop');
{
  const prog = new TileProgram({ nodes: [ T.repeat(3, [ T.action('beep', { pitch: 'low' }) ]) ]});
  const rt = new MakerRuntime(prog, {}, new MockWorld());
  rt.tick(0.016);
  const beeps = rt.drainEvents().filter(e => e.kind === 'beep').length;
  ok('repeat(3) emits 3 beeps in a single tick', beeps === 3, `beeps=${beeps}`);
  ok('finite program halts after the loop', rt.vm.halted);
}

// ── 5. VM: if/else picks the right branch from a sensor ─────────────────────
console.log('\nVM · conditionals');
{
  const prog = new TileProgram({ nodes: [
    T.ifElse(T.cond('distance_ahead', 'lt', 0.25),
      [ T.action('beep', { pitch: 'high' }) ],
      [ T.action('beep', { pitch: 'low' }) ]),
  ]});

  const clear = new MockWorld(); clear.dist = 1.0;
  const rtA = new MakerRuntime(prog, {}, clear);
  rtA.tick(0.016);
  ok('clear path → ELSE branch (low beep)',
     rtA.drainEvents().some(e => e.kind === 'beep' && e.pitch === 'low'));

  const wall = new MockWorld(); wall.dist = 0.1;
  const rtB = new MakerRuntime(prog, {}, wall);
  rtB.tick(0.016);
  ok('wall ahead → THEN branch (high beep)',
     rtB.drainEvents().some(e => e.kind === 'beep' && e.pitch === 'high'));

  // digital 'is' condition
  const prog2 = new TileProgram({ nodes: [
    T.ifElse(T.is('bumped', true),
      [ T.action('led', { state: 'red' }) ],
      [ T.action('led', { state: 'green' }) ]),
  ]});
  const bump = new MockWorld(); bump.dist = 0.05; // < 0.08 → bumped true
  const rtC = new MakerRuntime(prog2, {}, bump);
  rtC.tick(0.016);
  ok('digital "is bumped" true → red led', rtC.robot.led === 'red', `led=${rtC.robot.led}`);
}

// ── 6. Robot kinematics + collision ────────────────────────────────────────
console.log('\nVirtualRobot · physics');
{
  const r = new VirtualRobot({ x: 0, z: 0, heading: 0 });
  r.setDrive(1);
  r.tick(1.0, null);
  ok('drive forward 1s at full = ~3 blocks +Z', approx(r.z, 3.0, 0.3), `z=${r.z.toFixed(2)}`);

  const r2 = new VirtualRobot({ heading: 0 });
  r2.setTurn(1);
  r2.tick(0.5, null); // 180 deg/s * 0.5 = 90°
  ok('turn right 0.5s at full = ~90°', approx(r2.heading, Math.PI / 2, 0.1), `hdg=${r2.heading.toFixed(2)}`);

  const r3 = new VirtualRobot({ x: 0, z: 0, heading: 0 });
  const wall = { isSolidAt: (x, z) => z >= 2 };
  r3.setDrive(1);
  for (let i = 0; i < 60; i++) r3.tick(0.05, wall);
  ok('collision stops bot before the wall', r3.z < 2 && r3.z > 1.0, `z=${r3.z.toFixed(2)}`);
}

// ── 7. End-to-end: wall-avoider actually avoids ────────────────────────────
console.log('\nEnd-to-end · Wall Avoider in a corridor');
{
  // Corridor: open from z=0..4, wall at z>=5. Bot should drive up, then turn.
  const world = new MockWorld();
  world.solid = (x, z) => z >= 5;
  // distanceAhead must reflect the wall; emulate a simple forward probe.
  world.distanceAhead = function () {
    // robot tracked externally below
    return this._d ?? 1;
  };
  const rt = new MakerRuntime(EXAMPLE_WALL_AVOIDER, { x: 0, z: 0, heading: 0 }, world);
  let turned = false;
  for (let i = 0; i < 200; i++) {
    // feed the sonar based on current pose
    const clear = Math.max(0, (5 - 0.25 - rt.robot.z) / 6);
    world._d = clear;
    rt.tick(0.05);
    if (Math.abs(rt.robot.heading) > 0.2) turned = true;
  }
  ok('bot stayed shy of the wall', rt.robot.z < 5, `z=${rt.robot.z.toFixed(2)}`);
  ok('bot turned when it neared the wall', turned);
}

// ── 8. Firmware codegen ────────────────────────────────────────────────────
console.log('\nFirmwareGen');
{
  const ino = toArduino(EXAMPLE_WALL_AVOIDER);
  ok('Arduino: has loop()', ino.includes('void loop()'));
  ok('Arduino: uses ultrasonic helper', ino.includes('readDistance()'));
  ok('Arduino: drives the motor', ino.includes('drive(FORWARD'));
  ok('Arduino: declares motor pins', ino.includes('#define ENA'));

  const py = toMicroPython(EXAMPLE_LIGHT_RUNNER);
  ok('MicroPython: has main loop', py.includes('while True:'));
  ok('MicroPython: reads brightness', py.includes('read_brightness()'));
}

// ── 9. Phase 2.2 sensors ──────────────────────────────────────────────────
console.log('\nPhase 2.2 · new sensors');
{
  // line_under — digital, backed by lineUnder()
  const prog = new TileProgram({ nodes: [
    T.ifElse(T.is('line_under', true),
      [ T.action('led', { state: 'green' }) ],
      [ T.action('led', { state: 'red' }) ]),
  ]});

  const lineWorld = new MockWorld();
  lineWorld.lineUnder = () => true;
  const rtLine = new MakerRuntime(prog, {}, lineWorld);
  rtLine.tick(0.016);
  ok('line_under true → green LED', rtLine.robot.led === 'green', `led=${rtLine.robot.led}`);

  const noLineWorld = new MockWorld();
  noLineWorld.lineUnder = () => false;
  const rtNoLine = new MakerRuntime(prog, {}, noLineWorld);
  rtNoLine.tick(0.016);
  ok('line_under false → red LED', rtNoLine.robot.led === 'red', `led=${rtNoLine.robot.led}`);

  // compass — analog, normalized 0..1 from heading
  const progComp = new TileProgram({ nodes: [
    T.ifElse(T.cond('compass', 'lt', 0.5),
      [ T.action('led', { state: 'blue' }) ],
      [ T.action('led', { state: 'white' }) ]),
  ]});
  const rtComp = new MakerRuntime(progComp, { heading: Math.PI * 0.4 }, new MockWorld());
  rtComp.tick(0.016);
  ok('compass < 0.5 when heading is π×0.4', rtComp.robot.led === 'blue', `led=${rtComp.robot.led}`);

  // temperature — analog, backed by temperatureAt()
  const progTemp = new TileProgram({ nodes: [
    T.ifElse(T.cond('temperature', 'gt', 0.5),
      [ T.action('beep', { pitch: 'high' }) ],
      [ T.action('beep', { pitch: 'low'  }) ]),
  ]});
  const hotWorld  = new MockWorld(); hotWorld.temperatureAt  = () => 0.9;
  const coldWorld = new MockWorld(); coldWorld.temperatureAt = () => 0.2;

  const rtHot  = new MakerRuntime(progTemp, {}, hotWorld);  rtHot.tick(0.016);
  ok('temperature >0.5 (hot) → high beep',
     rtHot.drainEvents().some(e => e.kind === 'beep' && e.pitch === 'high'));

  const rtCold = new MakerRuntime(progTemp, {}, coldWorld); rtCold.tick(0.016);
  ok('temperature <0.5 (cold) → low beep',
     rtCold.drainEvents().some(e => e.kind === 'beep' && e.pitch === 'low'));

  // color_sensor — digital, backed by colorUnder()
  const progCol = new TileProgram({ nodes: [
    T.ifElse(T.is('color_sensor', true),
      [ T.action('led', { state: 'red' }) ],
      [ T.action('led', { state: 'off' }) ]),
  ]});
  const colWorld = new MockWorld(); colWorld.colorUnder = () => true;
  const rtCol = new MakerRuntime(progCol, {}, colWorld);
  rtCol.tick(0.016);
  ok('color_sensor true → red LED', rtCol.robot.led === 'red', `led=${rtCol.robot.led}`);
}

// ── 10. Phase 2.2 actuators ───────────────────────────────────────────────
console.log('\nPhase 2.2 · new actuators');
{
  // speak
  const progSpeak = new TileProgram({ nodes: [ T.action('speak', { phrase: 'done' }) ]});
  const rtSpeak = new MakerRuntime(progSpeak, {}, new MockWorld());
  rtSpeak.tick(0.016);
  ok('speak emits "speak" event with phrase',
     rtSpeak.drainEvents().some(e => e.kind === 'speak' && e.phrase === 'done'));

  // servo_angle — sets robot.gripping based on angle
  const progServo = new TileProgram({ nodes: [ T.action('servo_angle', { angle: 45 }) ]});
  const rtServo = new MakerRuntime(progServo, {}, new MockWorld());
  rtServo.tick(0.016);
  ok('servo_angle < 90 sets gripping=true', rtServo.robot.gripping === true,
     `gripping=${rtServo.robot.gripping}`);

  const progServo2 = new TileProgram({ nodes: [ T.action('servo_angle', { angle: 120 }) ]});
  const rtServo2 = new MakerRuntime(progServo2, {}, new MockWorld());
  rtServo2.tick(0.016);
  ok('servo_angle >= 90 sets gripping=false', rtServo2.robot.gripping === false,
     `gripping=${rtServo2.robot.gripping}`);

  // neopixel
  const progNeo = new TileProgram({ nodes: [ T.action('neopixel', { color: 'cyan' }) ]});
  const rtNeo = new MakerRuntime(progNeo, {}, new MockWorld());
  rtNeo.tick(0.016);
  ok('neopixel emits "neopixel" event with colour',
     rtNeo.drainEvents().some(e => e.kind === 'neopixel' && e.color === 'cyan'));
}

// ── 11. Variables (set_var / change_var / var: conditions) ───────────────────
console.log('\nVariables');
{
  // set_var initialises, change_var increments, var: condition reads
  const progVar = new TileProgram({ nodes: [
    T.setVar('count', 0),
    T.changeVar('count', 1),
    T.changeVar('count', 1),
    T.changeVar('count', 1),
  ]});
  const resultVar = compile(progVar);
  ok('variable program compiles ok', resultVar.ok, JSON.stringify(resultVar.errors));

  const vmVar = new TileVM(resultVar.bytecode, new VirtualRobot(), new MockWorld());
  vmVar.step(0.016);
  ok('set_var + 3 change_var → count=3', vmVar.vars['count'] === 3, `count=${vmVar.vars['count']}`);

  // var: condition — branch taken when var exceeds threshold
  const progCond = new TileProgram({ nodes: [
    T.setVar('x', 10),
    T.if(T.varCond('x', 'gt', 5), [ T.action('beep', { pitch: 'high' }) ]),
  ]});
  const rtCond = new MakerRuntime(progCond, {}, new MockWorld());
  rtCond.tick(0.016);
  ok('var:x > 5 branch taken when x=10', rtCond.drainEvents().some(e => e.kind === 'beep' && e.pitch === 'high'));

  // var: condition — branch NOT taken when var is below threshold
  const progCondFalse = new TileProgram({ nodes: [
    T.setVar('x', 2),
    T.if(T.varCond('x', 'gt', 5), [ T.action('beep', { pitch: 'high' }) ]),
  ]});
  const rtCondFalse = new MakerRuntime(progCondFalse, {}, new MockWorld());
  rtCondFalse.tick(0.016);
  ok('var:x > 5 branch skipped when x=2', !rtCondFalse.drainEvents().some(e => e.kind === 'beep'));

  // Arduino codegen handles variable tiles
  const arduino = toArduino(EXAMPLE_BUMP_COUNTER);
  ok('Arduino: declares variable as global int', arduino.includes('int bumps = 0;'));
  ok('Arduino: change_var renders as +=', arduino.includes('bumps += 1;'));
  ok('Arduino: var: condition renders correctly', arduino.includes('bumps >= 5'));

  const python = toMicroPython(EXAMPLE_BUMP_COUNTER);
  ok('MicroPython: declares variable before loop', python.includes('bumps = 0'));
  ok('MicroPython: change_var renders as +=', python.includes('bumps += 1'));

  // EXAMPLE_BUMP_COUNTER compiles cleanly
  const resultBump = compile(EXAMPLE_BUMP_COUNTER);
  ok('EXAMPLE_BUMP_COUNTER compiles ok', resultBump.ok, JSON.stringify(resultBump.errors));
  ok('bump counter has SET_VAR opcode', resultBump.bytecode.some(i => i.op === 'SET_VAR'));
  ok('bump counter has CHANGE_VAR opcode', resultBump.bytecode.some(i => i.op === 'CHANGE_VAR'));
  ok('bump counter has GET_VAR opcode', resultBump.bytecode.some(i => i.op === 'GET_VAR'));

  // reset() clears variables
  const vmReset = new TileVM(resultVar.bytecode, new VirtualRobot(), new MockWorld());
  vmReset.step(0.016);
  vmReset.reset();
  ok('reset() clears vars', Object.keys(vmReset.vars).length === 0);
}

// ── 12. Variable initialization warnings ────────────────────────────────────
console.log('\nVariable init warnings');
{
  // change_var with no matching set_var → warning
  const progNoInit = new TileProgram({ nodes: [
    T.changeVar('score', 1),
  ]});
  const r1 = compile(progNoInit);
  ok('warns on change_var with no set_var', r1.warnings.some(w => w.includes('"score"')));
  ok('program still compiles ok (warning, not error)', r1.ok);

  // var: condition with no set_var → warning
  const progCondNoInit = new TileProgram({ nodes: [
    T.if(T.varCond('hp', 'lt', 0), [ T.action('stop') ]),
  ]});
  const r2 = compile(progCondNoInit);
  ok('warns on var: condition with no set_var', r2.warnings.some(w => w.includes('"hp"')));

  // set_var + change_var → no warning
  const progOk = new TileProgram({ nodes: [
    T.setVar('score', 0),
    T.changeVar('score', 1),
  ]});
  const r3 = compile(progOk);
  ok('no warning when change_var has matching set_var',
     !r3.warnings.some(w => w.includes('"score"')));
}

// ── 13. Achievement stats for variables ─────────────────────────────────────
console.log('\nAchievement — variable tracking');
{
  // Import dynamically so Node resolves the path without a browser DOM
  const { Achievements } = await import('../../Achievements.js');

  const ach = new Achievements();
  let unlocked = [];
  ach.on('unlock', id => unlocked.push(id));

  // variable_star: first var program run
  ach.track('var_program_run', { varCount: 1, hasCond: false });
  ok('variable_star unlocked on first var program', unlocked.includes('variable_star'));

  // bookkeeper: 3+ distinct vars
  ach.track('var_program_run', { varCount: 3, hasCond: false });
  ok('bookkeeper unlocked at 3 vars', unlocked.includes('bookkeeper'));

  // var_conditioner: hasCond flag
  ach.track('var_program_run', { varCount: 1, hasCond: true });
  ok('var_conditioner unlocked when hasCond=true', unlocked.includes('var_conditioner'));

  // tally_champion: peak value ≥ 10
  ach.track('var_peak_value', { value: 10 });
  ok('tally_champion unlocked at peak value 10', unlocked.includes('tally_champion'));

  // peak value below threshold does NOT unlock
  const ach2 = new Achievements();
  let unlocked2 = [];
  ach2.on('unlock', id => unlocked2.push(id));
  ach2.track('var_peak_value', { value: 5 });
  ok('tally_champion NOT unlocked at peak 5', !unlocked2.includes('tally_champion'));
}

// ── summary ────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
