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

  // set_var inside nested body still counts as declared
  const progNested = new TileProgram({ nodes: [
    T.setVar('laps', 0),
    T.forever([
      T.changeVar('laps', 1),
      T.if(T.varCond('laps', 'gte', 3), [ T.action('stop') ]),
    ]),
  ]});
  const r4 = compile(progNested);
  ok('no warning when nested change_var+cond match top-level set_var',
     !r4.warnings.some(w => w.includes('"laps"')));

  // Two variables — only one missing init → warning only for that one
  const progTwoVars = new TileProgram({ nodes: [
    T.setVar('a', 0),
    T.changeVar('a', 1),
    T.changeVar('b', 1),   // b is never initialized
  ]});
  const r5 = compile(progTwoVars);
  ok('warns only for the uninitialised variable when two vars are present',
     r5.warnings.some(w => w.includes('"b"')) && !r5.warnings.some(w => w.includes('"a"')));
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

// ── 14. repeat_until tile ──────────────────────────────────────────────────
console.log('\nrepeat_until tile');
{
  // Basic compile: repeat_until emits NOT + JZ + UNTIL opcodes
  const prog = new TileProgram({ nodes: [
    T.repeatUntil(T.cond('distance_ahead', 'lt', 0.25), [
      T.action('drive', { dir: 'forward', speed: 0.5 }),
    ]),
    T.action('stop'),
  ]});
  const r = compile(prog);
  ok('repeat_until compiles without errors', r.ok, JSON.stringify(r.errors));
  ok('emits NOT opcode (condition inversion)', r.bytecode.some(i => i.op === 'NOT'));
  ok('emits UNTIL opcode (loop back-edge)', r.bytecode.some(i => i.op === 'UNTIL'));
  ok('emits HALT terminator', r.bytecode.at(-1).op === 'HALT');

  // VM behaviour: loop runs until condition becomes true
  {
    const world = new MockWorld();
    world.dist = 1.0;    // clear ahead
    const rt = new MakerRuntime(prog, { x: 0, z: 0, heading: 0 }, world);

    // Run a few ticks — condition false (dist=1.0 is not < 0.25) → body runs
    rt.tick(0.016);
    rt.tick(0.016);
    ok('body runs while condition is false', rt.robot.drivePower > 0,
       `drivePower=${rt.robot.drivePower}`);

    // Set world dist to trigger exit (dist < 0.25 → condition true → loop exits)
    world.dist = 0.1;
    rt.tick(0.016);   // this tick re-checks condition → exits loop → runs stop
    rt.tick(0.016);   // executes stop, then HALT
    ok('loop exits when condition becomes true', rt.vm.halted || rt.robot.drivePower === 0,
       `halted=${rt.vm.halted} drivePower=${rt.robot.drivePower}`);
  }

  // repeat_until with var: condition
  const varProg = new TileProgram({ nodes: [
    T.setVar('n', 0),
    T.repeatUntil(T.varCond('n', 'gte', 3), [
      T.changeVar('n', 1),
    ]),
    T.action('beep', { pitch: 'high' }),
  ]});
  const vr = compile(varProg);
  ok('repeat_until with var condition compiles ok', vr.ok, JSON.stringify(vr.errors));
  {
    const world2 = new MockWorld();
    const rt2 = new MakerRuntime(varProg, {}, world2);
    // Tick enough to run: set_var, then repeat_until body 3 times, then beep, then halt
    for (let i = 0; i < 30; i++) rt2.tick(0.016);
    ok('var n incremented to 3 by repeat_until', rt2.vm.vars.n === 3, `n=${rt2.vm.vars.n}`);
    ok('program halted after repeat_until exits', rt2.vm.halted);
  }

  // Firmware codegen: Arduino generates while (!(cond)) { ... }
  const fw = toArduino(prog);
  ok('Arduino codegen emits while(!(...))', fw.includes('while (!('));

  // Firmware codegen: Python generates while not (...)
  const py = toMicroPython(prog);
  ok('Python codegen emits while not (...)', py.includes('while not'));

  // _checkVarInit: var used in repeat_until condition warns if not initialized
  const uninitProg = new TileProgram({ nodes: [
    T.repeatUntil(T.varCond('counter', 'gte', 5), [ T.action('stop') ]),
  ]});
  const ur = compile(uninitProg);
  ok('warns when var in repeat_until cond is never initialized',
     ur.warnings.some(w => w.includes('"counter"')));
}

// ── 15. break tile ─────────────────────────────────────────────────────────
console.log('\nbreak tile');
{
  // break inside repeat — exits after first iteration
  const prog = new TileProgram({ nodes: [
    T.repeat(5, [
      T.action('beep', { pitch: 'high' }),
      T.break(),
    ]),
    T.action('stop'),
  ]});
  const r = compile(prog);
  ok('break inside repeat compiles ok', r.ok, JSON.stringify(r.errors));
  ok('emits BREAK opcode', r.bytecode.some(i => i.op === 'BREAK'));
  {
    const rt = new MakerRuntime(prog, {}, new MockWorld());
    for (let i = 0; i < 20; i++) rt.tick(0.016);
    const beeps = rt.drainEvents().filter(e => e.kind === 'beep').length;
    ok('break exits repeat after 1 iteration (1 beep not 5)', beeps === 1, `beeps=${beeps}`);
    ok('program halts after break exits repeat', rt.vm.halted);
  }

  // break inside forever — exits on first condition hit
  const foreverBreak = new TileProgram({ nodes: [
    T.forever([
      T.action('drive', { dir: 'forward', speed: 0.5 }),
      T.if(T.cond('distance_ahead', 'lt', 0.25), [ T.break() ]),
    ]),
    T.action('stop'),
  ]});
  const r2 = compile(foreverBreak);
  ok('break inside forever compiles ok', r2.ok, JSON.stringify(r2.errors));
  {
    const world = new MockWorld();
    world.dist = 0.1;   // wall right away → if condition true → break on first tick
    const rt2 = new MakerRuntime(foreverBreak, {}, world);
    for (let i = 0; i < 10; i++) rt2.tick(0.016);
    ok('forever exits when break is hit', rt2.vm.halted || rt2.robot.drivePower === 0,
       `halted=${rt2.vm.halted}`);
  }

  // Firmware: Arduino emits break;
  const fw = toArduino(prog);
  ok('Arduino codegen emits break;', fw.includes('break;'));

  // Firmware: Python emits break
  const py = toMicroPython(prog);
  ok('Python codegen emits break', py.includes('break'));
}

// ── 16. print tile ─────────────────────────────────────────────────────────
console.log('\nprint tile');
{
  const prog = new TileProgram({ nodes: [
    T.setVar('score', 7),
    T.print('score'),
  ]});
  const r = compile(prog);
  ok('print compiles ok', r.ok, JSON.stringify(r.errors));
  ok('emits PRINT_VAR opcode', r.bytecode.some(i => i.op === 'PRINT_VAR'));
  ok('PRINT_VAR carries variable name', r.bytecode.some(i => i.op === 'PRINT_VAR' && i.name === 'score'));

  // VM emits print event with correct value
  const events = [];
  const fakeRobot = {
    setDrive: () => {}, setTurn: () => {}, gripping: false,
    emit: (kind, data) => events.push({ kind, ...data }),
  };
  const rt = new TileVM(r.bytecode, fakeRobot, {});
  for (let i = 0; i < 20; i++) { if (!rt.halted) rt.step(0.016); }
  const printEvt = events.find(e => e.kind === 'print' && e.name === 'score');
  ok('VM emits print event with correct name', !!printEvt, `events=${JSON.stringify(events)}`);
  ok('VM emits correct value (7)', printEvt?.value === 7, `value=${printEvt?.value}`);

  // Firmware: Arduino emits Serial.println
  const fw = toArduino(prog);
  ok('Arduino codegen emits Serial.println', fw.includes('Serial.println'));
  ok('Arduino setup has Serial.begin when print used', fw.includes('Serial.begin(9600)'));

  // Firmware: Python emits print(...)
  const py = toMicroPython(prog);
  ok('Python codegen emits print(f"...")', py.includes('print(f"'));
}

// ── 17. comment tile ───────────────────────────────────────────────────────
console.log('\ncomment tile');
{
  const prog = new TileProgram({ nodes: [
    T.comment('initialize the counter'),
    T.setVar('x', 5),
    T.comment('done'),
  ]});
  const r = compile(prog);
  ok('comment compiles ok', r.ok, JSON.stringify(r.errors));
  ok('comment emits NO bytecode (annotation only)',
     !r.bytecode.some(i => i.op === 'COMMENT'));
  // Program still executes: comment tiles are transparent
  const world = new MockWorld();
  const rt = new MakerRuntime(prog, {}, world);
  for (let i = 0; i < 10; i++) rt.tick(0.016);
  ok('program with comments runs and halts', rt.vm.halted);
  ok('variable was set despite comment tiles', rt.vm.vars.x === 5, `x=${rt.vm.vars.x}`);

  // Firmware: Arduino emits // comment
  const fw = toArduino(prog);
  ok('Arduino codegen emits // comment', fw.includes('// initialize the counter'));

  // Firmware: Python emits # comment
  const py = toMicroPython(prog);
  ok('Python codegen emits # comment', py.includes('# initialize the counter'));
}

// ── 18. random_var tile ────────────────────────────────────────────────────
console.log('\nrandom_var tile');
{
  const prog = new TileProgram({ nodes: [
    { type: 'random_var', name: 'roll', min: 1, max: 6 },
  ]});
  const r = compile(prog);
  ok('random_var compiles ok', r.ok, JSON.stringify(r.errors));
  ok('emits RAND_VAR opcode', r.bytecode.some(i => i.op === 'RAND_VAR'));
  ok('RAND_VAR carries min/max', r.bytecode.some(i => i.op === 'RAND_VAR' && i.min === 1 && i.max === 6));

  // VM: variable is set to a value within [min, max]
  const rt = new MakerRuntime(prog, {}, new MockWorld());
  for (let i = 0; i < 20; i++) rt.tick(0.016);
  const roll = rt.vm.vars.roll;
  ok('random result is within [1, 6]', roll >= 1 && roll <= 6, `roll=${roll}`);
  ok('program halts after random_var', rt.vm.halted);

  // Firmware: Arduino uses random()
  const fw = toArduino(prog);
  ok('Arduino codegen emits random()', fw.includes('random('));

  // Firmware: Python uses random.randint
  const py = toMicroPython(prog);
  ok('Python codegen emits random.randint', py.includes('random.randint'));
}

// ── 19. subroutines (define_sub / call_sub) ────────────────────────────────
console.log('\nsubroutines');
{
  // Basic call: define a sub, call it once
  const prog = new TileProgram({ nodes: [
    { type: 'call_sub', name: 'ping' },
    { type: 'define_sub', name: 'ping', body: [
      T.action('beep', { pitch: 'high' }),
    ]},
  ]});
  const r = compile(prog);
  ok('subroutine program compiles ok', r.ok, JSON.stringify(r.errors));
  ok('emits CALL_SUB opcode', r.bytecode.some(i => i.op === 'CALL_SUB'));
  ok('emits SUB_RETURN opcode', r.bytecode.some(i => i.op === 'SUB_RETURN'));
  ok('CALL_SUB has resolved target (not -1)', r.bytecode.some(i => i.op === 'CALL_SUB' && i.target !== -1));

  // VM: sub body actually runs
  const rt = new MakerRuntime(prog, {}, new MockWorld());
  for (let i = 0; i < 20; i++) rt.tick(0.016);
  const beeps = rt.drainEvents().filter(e => e.kind === 'beep').length;
  ok('subroutine body ran (got 1 beep)', beeps === 1, `beeps=${beeps}`);
  ok('program halted after returning from sub', rt.vm.halted);

  // Error: call_sub with no matching define_sub
  const undefinedCall = new TileProgram({ nodes: [
    { type: 'call_sub', name: 'missing' },
  ]});
  const ur = compile(undefinedCall);
  ok('error when calling undefined sub', !ur.ok && ur.errors.some(e => e.includes('"missing"')));

  // Multiple calls to same sub
  const multiCall = new TileProgram({ nodes: [
    { type: 'call_sub', name: 'beepSub' },
    { type: 'call_sub', name: 'beepSub' },
    { type: 'define_sub', name: 'beepSub', body: [ T.action('beep', { pitch: 'mid' }) ]},
  ]});
  const mr = compile(multiCall);
  ok('multiple calls to same sub compile ok', mr.ok, JSON.stringify(mr.errors));
  {
    const rt2 = new MakerRuntime(multiCall, {}, new MockWorld());
    for (let i = 0; i < 30; i++) rt2.tick(0.016);
    const b2 = rt2.drainEvents().filter(e => e.kind === 'beep').length;
    ok('two calls produce 2 beeps', b2 === 2, `beeps=${b2}`);
  }

  // Firmware: Arduino emits void function + call
  const fw = toArduino(prog);
  ok('Arduino codegen emits void function', fw.includes('void ping()'));
  ok('Arduino codegen emits function call', fw.includes('ping();'));

  // Firmware: Python emits def function + call
  const py = toMicroPython(prog);
  ok('Python codegen emits def function', py.includes('def ping():'));
  ok('Python codegen emits function call', py.includes('ping()'));
}

// ── 20. read_sensor ───────────────────────────────────────────────────────
console.log('\nread_sensor');
{
  const prog = new TileProgram({ name: 'SensorLogger', brain: 'spark', nodes: [
    T.setVar('dist', 0),
    T.readSensor('dist', 'distance_ahead'),
    T.print('dist'),
  ]});

  const res = compile(prog);
  ok('read_sensor program compiles ok', res.ok, res.errors.join(', '));
  ok('emits READ_SENSOR opcode', res.bytecode.some(i => i.op === 'READ_SENSOR'));
  const rsInstr = res.bytecode.find(i => i.op === 'READ_SENSOR');
  ok('READ_SENSOR has var name', rsInstr?.name === 'dist', `name=${rsInstr?.name}`);
  ok('READ_SENSOR has sensor id', rsInstr?.sensor === 'distance_ahead', `sensor=${rsInstr?.sensor}`);

  // VM: sensor value written to vars
  {
    const world = new MockWorld();
    world.dist = 0.42;
    const vm = new TileVM(res.bytecode, res.sourceMap);
    const robot = new VirtualRobot(world);
    vm.robot = robot; vm.world = world;
    while (!vm.halted) vm.step(0.016);
    const distVal = vm.vars['dist'];
    ok('VM stores sensor reading in vars.dist', Math.abs(distVal - 0.42) < 0.01, `dist=${distVal}`);
  }

  // Error for unknown sensor
  const badProg = new TileProgram({ nodes: [ T.readSensor('x', 'no_such_sensor') ] });
  const badRes = compile(badProg);
  ok('error for unknown sensor', !badRes.ok && badRes.errors.some(e => e.includes('no_such_sensor')));

  // read_sensor counts as initializing the variable (no "uninitialized" warning)
  const warnProg = new TileProgram({ nodes: [
    T.readSensor('dist', 'distance_ahead'),
    T.if(T.varCond('dist', 'lt', 0.3), [T.action('stop')]),
  ]});
  const warnRes = compile(warnProg);
  ok('no uninitialized warning for read_sensor var', !warnRes.warnings.some(w => w.includes('"dist"')));

  // Firmware: Arduino
  const fw = toArduino(prog);
  ok('Arduino codegen emits sensor read', fw.includes('dist = readDistance()'));

  // Firmware: Python
  const py = toMicroPython(prog);
  ok('Python codegen emits sensor read', py.includes('dist = read_distance()'));
}

// ── 21. math_var ─────────────────────────────────────────────────────────
console.log('\nmath_var');
{
  const prog = new TileProgram({ name: 'MathTest', brain: 'tin', nodes: [
    T.setVar('x', 10),
    T.mathVar('x', 'mul', 2),
    T.mathVar('x', 'add', 5),
    T.mathVar('x', 'sub', 3),
    T.mathVar('x', 'div', 4),
  ]});

  const res = compile(prog);
  ok('math_var program compiles ok', res.ok, res.errors.join(', '));
  ok('emits MATH_VAR opcode', res.bytecode.some(i => i.op === 'MATH_VAR'));
  const mv = res.bytecode.find(i => i.op === 'MATH_VAR' && i.mathOp === 'mul');
  ok('MATH_VAR carries mathOp', mv?.mathOp === 'mul', `mathOp=${mv?.mathOp}`);
  ok('MATH_VAR carries operand', mv?.operand === 2, `operand=${mv?.operand}`);

  // VM: (10 * 2 + 5 - 3) / 4 = 22 / 4 = 5.5
  {
    const world = new MockWorld();
    const vm = new TileVM(res.bytecode, res.sourceMap);
    vm.robot = new VirtualRobot(world); vm.world = world;
    while (!vm.halted) vm.step(0.016);
    const xVal = vm.vars['x'];
    ok('VM math chain: (10 * 2 + 5 - 3) / 4 = 5.5', Math.abs(xVal - 5.5) < 0.001, `x=${xVal}`);
  }

  // division by zero → 0
  {
    const dz = new TileProgram({ nodes: [ T.setVar('y', 9), T.mathVar('y', 'div', 0) ] });
    const dzRes = compile(dz);
    const world = new MockWorld();
    const vm = new TileVM(dzRes.bytecode, dzRes.sourceMap);
    vm.robot = new VirtualRobot(world); vm.world = world;
    while (!vm.halted) vm.step(0.016);
    ok('division by zero → 0 (no crash)', vm.vars['y'] === 0, `y=${vm.vars['y']}`);
  }

  // warns when used before set_var
  const warnProg = new TileProgram({ nodes: [ T.mathVar('z', 'mul', 2) ] });
  const warnRes = compile(warnProg);
  ok('warns: math_var without set_var', warnRes.warnings.some(w => w.includes('"z"')));

  // Arduino codegen
  const fw = toArduino(prog);
  ok('Arduino codegen emits *=', fw.includes('x *= 2'));
  ok('Arduino codegen emits +=', fw.includes('x += 5'));
  ok('Arduino codegen emits -=', fw.includes('x -= 3'));
  ok('Arduino codegen emits /=', fw.includes('x /= 4'));

  // Python codegen
  const py = toMicroPython(prog);
  ok('Python codegen emits *=', py.includes('x *= 2'));
}

// ── 22. add_score ─────────────────────────────────────────────────────────
console.log('\nadd_score');
{
  const prog = new TileProgram({ name: 'ScoreTest', brain: 'tin', nodes: [
    T.action('add_score', { amount: 5 }),
    T.action('add_score', { amount: 3 }),
  ]});

  const res = compile(prog);
  ok('add_score program compiles ok', res.ok, res.errors.join(', '));
  ok('emits ACT opcode for add_score', res.bytecode.some(i => i.op === 'ACT' && i.action === 'add_score'));
  const instr = res.bytecode.find(i => i.op === 'ACT' && i.action === 'add_score');
  ok('ACT carries amount param', instr?.params?.amount === 5, `amount=${instr?.params?.amount}`);

  // VM: score events emitted
  {
    const world = new MockWorld();
    const vm = new TileVM(res.bytecode, res.sourceMap);
    const events = [];
    const robot = new VirtualRobot(world);
    robot.emit = (kind, data) => { events.push({ kind, ...data }); };
    vm.robot = robot; vm.world = world;
    while (!vm.halted) vm.step(0.016);
    const scoreEvents = events.filter(e => e.kind === 'score');
    ok('two score events emitted', scoreEvents.length === 2, `count=${scoreEvents.length}`);
    ok('first event delta=5', scoreEvents[0]?.delta === 5, `delta=${scoreEvents[0]?.delta}`);
    ok('second event delta=3', scoreEvents[1]?.delta === 3, `delta=${scoreEvents[1]?.delta}`);
  }

  // Firmware
  const fw = toArduino(prog);
  ok('Arduino codegen includes score +=', fw.includes('score += 5'));
  const py = toMicroPython(prog);
  ok('Python codegen includes score +=', py.includes('score += 5'));
}

// ── 23. var-vs-var conditions ──────────────────────────────────────────────
console.log('\nvar-vs-var conditions');
{
  // Program: set a=10, threshold=7; if var:a > var:threshold → beep high; else beep low
  const prog = new TileProgram({ name: 'VarVsVar', brain: 'tin', nodes: [
    T.setVar('a', 10),
    T.setVar('threshold', 7),
    T.ifElse(
      T.varVsCond('a', 'gt', 'threshold'),
      [ T.action('beep', { pitch: 'high' }) ],
      [ T.action('beep', { pitch: 'low' }) ],
    ),
  ]});

  const res = compile(prog);
  ok('var-vs-var program compiles ok', res.ok, res.errors.join(', '));
  // Should emit two GET_VAR opcodes (one for 'a', one for 'threshold')
  const getVarOps = res.bytecode.filter(i => i.op === 'GET_VAR');
  ok('emits two GET_VAR opcodes', getVarOps.length === 2, `count=${getVarOps.length}`);
  ok('first GET_VAR is for a', getVarOps[0]?.name === 'a', `name=${getVarOps[0]?.name}`);
  ok('second GET_VAR is for threshold', getVarOps[1]?.name === 'threshold', `name=${getVarOps[1]?.name}`);

  // VM: a=10, threshold=7 → 10 > 7 → THEN branch (high beep)
  {
    const world = new MockWorld();
    const vm = new TileVM(res.bytecode, res.sourceMap);
    const events = [];
    const robot = new VirtualRobot(world);
    robot.emit = (kind, data) => { events.push({ kind, ...data }); };
    vm.robot = robot; vm.world = world;
    while (!vm.halted) vm.step(0.016);
    const beep = events.find(e => e.kind === 'beep');
    ok('a > threshold → high beep', beep?.pitch === 'high', `pitch=${beep?.pitch}`);
  }

  // VM: a=5, threshold=7 → 5 > 7 false → ELSE branch (low beep)
  {
    const prog2 = new TileProgram({ name: 'VarVsVar2', brain: 'tin', nodes: [
      T.setVar('a', 5),
      T.setVar('threshold', 7),
      T.ifElse(T.varVsCond('a', 'gt', 'threshold'),
        [ T.action('beep', { pitch: 'high' }) ],
        [ T.action('beep', { pitch: 'low' }) ],
      ),
    ]});
    const r2 = compile(prog2);
    const world = new MockWorld();
    const vm = new TileVM(r2.bytecode, r2.sourceMap);
    const events = [];
    const robot = new VirtualRobot(world);
    robot.emit = (kind, data) => { events.push({ kind, ...data }); };
    vm.robot = robot; vm.world = world;
    while (!vm.halted) vm.step(0.016);
    const beep = events.find(e => e.kind === 'beep');
    ok('a < threshold → low beep', beep?.pitch === 'low', `pitch=${beep?.pitch}`);
  }

  // Firmware: Arduino var-vs-var condition
  const fw = toArduino(prog);
  ok('Arduino codegen renders var-vs-var condition', fw.includes('a > threshold'));

  // Firmware: Python var-vs-var condition
  const py = toMicroPython(prog);
  ok('Python codegen renders var-vs-var condition', py.includes('a > threshold'));

  // _checkVarInit warns when varValue var is uninitialised
  const warnProg = new TileProgram({ nodes: [
    T.setVar('a', 10),
    T.if(T.varVsCond('a', 'gt', 'limit'), [ T.action('stop') ]),
  ]});
  const warnRes = compile(warnProg);
  ok('warns when varValue var is uninitialised', warnRes.warnings.some(w => w.includes('"limit"')));
}

// ── summary ────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
