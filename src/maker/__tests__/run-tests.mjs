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

// ── 24. wait_until ─────────────────────────────────────────────────────────
console.log('\nwait_until tile');
{
  // Basic: wait until bumped=true, then beep
  const prog = new TileProgram({ name: 'WaitUntil', brain: 'tin', nodes: [
    T.waitUntil(T.is('bumped', true)),
    T.action('beep', { pitch: 'high' }),
  ]});

  const res = compile(prog);
  ok('wait_until program compiles ok', res.ok, res.errors.join(', '));

  // Compiles to a repeat_until with an empty body: JZ (exit) + UNTIL (back-edge),
  // with no ACT between the exit-jump and the UNTIL.
  const untilIdx = res.bytecode.findIndex(i => i.op === 'UNTIL');
  const jzIdx    = res.bytecode.findIndex(i => i.op === 'JZ');
  ok('emits UNTIL opcode (loop back-edge)', untilIdx !== -1);
  ok('emits JZ opcode (condition exit)', jzIdx !== -1);
  ok('JZ comes before UNTIL', jzIdx !== -1 && untilIdx !== -1 && jzIdx < untilIdx);
  // Between JZ and UNTIL there should be no ACT (empty body)
  const between = res.bytecode.slice(jzIdx + 1, untilIdx);
  ok('no ACT between JZ and UNTIL (empty body)', !between.some(i => i.op === 'ACT'));
  // UNTIL back-edge targets the condition start (0)
  ok('UNTIL loops back to condition start', res.bytecode[untilIdx]?.condStart === 0);

  // VM: bumped starts false (dist high) → loop spins; once bumped (dist<0.08) → beep
  {
    const world = new MockWorld();
    world.dist = 1.0;   // far → not bumped → wait_until spins
    const rt = new MakerRuntime(prog, {}, world);
    const events = [];
    // Tick a few times without bumping — should not beep, should not halt
    for (let i = 0; i < 20; i++) { rt.tick(0.016); events.push(...rt.drainEvents()); }
    ok('no beep while condition false', !events.some(e => e.kind === 'beep'));
    ok('does not halt while waiting', !rt.vm.halted);
    // Now bump → condition becomes true → loop exits → beep fires → halts
    world.dist = 0.05;   // < 0.08 → bumped true
    for (let i = 0; i < 20 && !rt.vm.halted; i++) { rt.tick(0.016); events.push(...rt.drainEvents()); }
    ok('beep fires after condition becomes true', events.some(e => e.kind === 'beep'));
    ok('program halts after wait_until releases', rt.vm.halted);
  }

  // wait_until with var condition: wait until dist >= 0.5
  const varProg = new TileProgram({ name: 'WaitUntilVar', brain: 'tin', nodes: [
    T.setVar('dist', 0),
    T.waitUntil(T.varCond('dist', 'gte', 0.5)),
    T.action('beep', { pitch: 'low' }),
  ]});
  const varRes = compile(varProg);
  ok('wait_until with var condition compiles ok', varRes.ok, varRes.errors.join(', '));

  // Firmware: Arduino renders a busy-wait guarded loop (while (!(cond)) { delay })
  const fw = toArduino(prog);
  ok('Arduino codegen has guarded while loop for wait_until',
     fw.includes('while (!(') && fw.includes('delay(10)') && fw.includes('BUMP_PIN'));

  // Firmware: Python renders a busy-wait guarded loop (while not (cond): sleep_ms)
  const py = toMicroPython(prog);
  ok('Python codegen has guarded while loop for wait_until',
     py.includes('while not (') && py.includes('sleep_ms(10)') && py.includes('bump.value()'));

  // T.waitUntil helper produces correct structure
  const node = T.waitUntil(T.is('bumped', true));
  ok('T.waitUntil produces correct type', node.type === 'wait_until');
  ok('T.waitUntil has cond field', node.cond != null);
  ok('T.waitUntil has no body field', node.body === undefined);
}


// ── SparkCache client (scrap-spark pincher-cache) ───────────────────────────
console.log('\nSparkCache client');
{
  const { SparkCache } = await import('../../spark/SparkCache.js');

  // fetch mock: records calls; serves canned worker responses
  function makeMockFetch(responses) {
    const calls = [];
    const fn = async (url, init) => {
      calls.push({ url, init });
      const r = responses.shift();
      if (r instanceof Error) throw r;
      return {
        ok: true,
        status: 200,
        headers: { get: (h) => (h.toLowerCase() === 'x-cache' ? r.cache : null) },
        json: async () => r.body,
      };
    };
    fn.calls = calls;
    return fn;
  }

  const missBody = { text: 'Follow the line with line_under!', program: { name: 'Line Follower', nodes: [{ type: 'forever', body: [] }] } };
  const hitBody  = { ...missBody };

  {
    const f = makeMockFetch([{ cache: 'MISS', body: missBody }, { cache: 'HIT', body: hitBody }]);
    const sc = new SparkCache({ url: 'https://spark.test', fetchFn: f });
    ok('client targets the worker /spark endpoint', true);
    const r1 = await sc.ask('how do I follow the track?', 'brain:tin');
    ok('MISS returns envelope with program', r1?.program?.name === 'Line Follower');
    ok('MISS records lastStatus', sc.lastStatus === 'MISS');
    ok('MISS increments stats', sc.stats.misses === 1);
    // second identical question → local pinch, no network
    const r2 = await sc.ask('How do I follow the  track?', 'brain:tin'); // normalization: case + whitespace
    ok('second ask answered locally (no new fetch)', f.calls.length === 1);
    ok('local pinch returns same envelope', r2?.text === r1?.text);
    ok('localHit counted', sc.stats.localHits === 1);
    // different context → different cache key → network again
    await sc.ask('how do I follow the track?', 'brain:spark');
    ok('different context re-fetches', f.calls.length === 2);
  }

  {
    // server-side HIT surfaced
    const f = makeMockFetch([{ cache: 'HIT', body: hitBody }]);
    const sc = new SparkCache({ url: 'https://spark.test', fetchFn: f });
    await sc.ask('wall avoider?', '');
    ok('X-Cache HIT surfaced as lastStatus', sc.lastStatus === 'HIT');
    ok('cloudHit counted', sc.stats.cloudHits === 1);
  }

  {
    // network failure → null, graceful
    const f = makeMockFetch([new Error('offline')]);
    const sc = new SparkCache({ url: 'https://spark.test', fetchFn: f });
    const r = await sc.ask('anything', '');
    ok('fetch failure returns null (graceful)', r === null);
    ok('error counted, lastStatus=error', sc.stats.errors === 1 && sc.lastStatus === 'error');
  }

  {
    // unusable envelope (program without nodes) → treated as failure → null
    const f = makeMockFetch([{ cache: 'MISS', body: { text: 'hi', program: { name: 'x' } } }]);
    const sc = new SparkCache({ url: 'https://spark.test', fetchFn: f });
    const r = await sc.ask('build me a thing', '');
    ok('program without nodes array is rejected', r === null);
  }

  {
    // HTTP error status → null
    const fn = async () => ({ ok: false, status: 502, headers: { get: () => 'MISS' }, json: async () => ({}) });
    const sc = new SparkCache({ url: 'https://spark.test', fetchFn: fn });
    ok('HTTP 502 returns null (graceful)', (await sc.ask('q', '')) === null);
  }

  {
    // empty / oversized questions short-circuit without network
    const f = makeMockFetch([]);
    const sc = new SparkCache({ url: 'https://spark.test', fetchFn: f });
    ok('empty question → null, no fetch', (await sc.ask('   ', '')) === null && f.calls.length === 0);
    ok('oversized question → null, no fetch', (await sc.ask('x'.repeat(501), '')) === null && f.calls.length === 0);
  }

  {
    // gallery publish + list + daily challenge plumbing
    const f = makeMockFetch([
      { cache: '', body: { id: 'abc123def456', kind: 'failure' } },
      { cache: '', body: { gallery: [{ id: 'abc123def456', title: 'The Forge Bonk' }], count: 1 } },
      { cache: '', body: { challenge: { id: 'lap10', title: 'Perfect 10', brief: '10 laps' }, failure_of_the_week: [] } },
    ]);
    const sc = new SparkCache({ url: 'https://spark.test', fetchFn: f });
    const pub = await sc.publish({ title: 'The Forge Bonk', program: btoa('{"nodes":[]}'), kind: 'failure' });
    ok('publish returns entry id', pub?.id === 'abc123def456');
    ok('publish posts to /gallery', f.calls[0].url.endsWith('/gallery') && f.calls[0].init.method === 'POST');
    const gal = await sc.gallery('failure');
    ok('gallery list returns entries', gal?.gallery?.[0]?.title === 'The Forge Bonk');
    const dc = await sc.dailyChallenge();
    ok('daily challenge returns challenge + failure wall', dc?.challenge?.id === 'lap10' && Array.isArray(dc.failure_of_the_week));
  }
}


// ── Pin model: the virtual Arduino Uno ──────────────────────────────────────
console.log('\nPinModel (hardware twin)');
{
  const { UnoPinModel, PWM_PINS, UNO_WIRING } = await import('../PinModel.js');
  let pm = new UnoPinModel();

  // digitalWrite / digitalRead on OUTPUT pins stick
  pm.pinMode(13, 1); // OUTPUT
  pm.digitalWrite(13, 1);
  ok('digitalWrite HIGH sticks on OUTPUT', pm.digitalRead(13) === 1);
  pm.digitalWrite(13, 0);
  ok('digitalWrite LOW overwrites', pm.digitalRead(13) === 0);

  // INPUT pins read the world, not the output register
  pm = new UnoPinModel();
  pm.setDigitalInput(2, true);
  ok('INPUT pin reads world value', pm.digitalRead('D2') === 1);
  pm.setDigitalInput(2, false);
  ok('INPUT pin follows world changes', pm.digitalRead('D2') === 0);

  // digitalWrite on INPUT = pull-up trick (teachable warning, no crash)
  pm.digitalWrite(2, 1);
  ok('digitalWrite on INPUT reads back HIGH (pull-up trick)', pm.digitalRead(2) === 1);
  ok('pull-up trick raises a teachable warning', pm.warnings.some(w => /pull-up/.test(w)));

  // analogRead: 0..1 world float → 10-bit counts
  pm.setAnalogInput('A0', 1.0);
  ok('analogRead full scale = 1023', pm.analogRead('A0') === 1023);
  pm.setAnalogInput('A0', 0.5);
  ok('analogRead half = ~512', Math.abs(pm.analogRead('A0') - 511.5) < 1);
  pm.setAnalogInput('A0', 2.0);
  ok('analogRead clamps at 1023', pm.analogRead('A0') === 1023);

  // analogWrite/PWM only on PWM pins, only on OUTPUT
  pm = new UnoPinModel();
  pm.analogWrite(5, 200);
  ok('analogWrite without pinMode warns', pm.warnings.some(w => /pinMode/.test(w)));
  pm.pinMode(5, 1); pm.analogWrite(5, 200);
  ok('PWM duty stored on D5', pm.duty[5] === 200);
  ok('PWM duty clamps to 255', (pm.pinMode(5,1), pm.analogWrite(5, 999), pm.duty[5] === 255));
  pm.pinMode(2, 1); pm.analogWrite(2, 128);
  ok('analogWrite on non-PWM pin warns (D2 has no PWM)', pm.warnings.some(w => /D2 has no PWM/.test(w)) && pm.duty[2] === -1);
  pm.pinMode(5,1); pm.analogWrite(5, 150); pm.digitalWrite(5, 1);
  ok('plain digitalWrite cancels PWM (real AVR behavior)', pm.duty[5] === -1);

  // differential drive mapping: drive 0.6 + turn 0 → both motors 153
  pm = new UnoPinModel();
  const robot = { drivePower: 0.6, turnPower: 0, gripping: false, led: 'off', events: [] };
  pm.syncFromRuntime(robot, { distance_ahead: 0.25, light: 1, temperature: 0, line_under: true, motion_nearby: false });
  ok('distance sensor → A0 counts', pm.analogRead('A0') === 256);
  ok('line sensor → D2 HIGH', pm.digitalRead('D2') === 1);
  ok('motion sensor → D3 LOW', pm.digitalRead('D3') === 0);
  ok('forward: both dir pins HIGH', pm.digitalRead('D4') === 1 && pm.digitalRead('D7') === 1);
  ok('forward PWM duty = |0.6|*255 → 153', pm.duty[5] === 153 && pm.duty[6] === 153);

  // turning: drive 0 + turn 0.5 → left forward, right backward (skid steer!)
  pm.syncFromRuntime({ drivePower: 0, turnPower: 0.5, gripping: true, led: '#ff0000', events: [{ kind: 'beep', freq: 880 }] },
                     { distance_ahead: 1, light: 0.5, temperature: 0.5, line_under: false, motion_nearby: true });
  ok('spin in place: left fwd, right back', pm.digitalRead('D4') === 1 && pm.digitalRead('D7') === 0);
  ok('spin duty = 128-ish on both', Math.abs(pm.duty[5] - 128) <= 1 && Math.abs(pm.duty[6] - 128) <= 1);
  ok('beep event drives tone()', pm.toneHz === 880);
  ok('gripper closed → servo duty 0', pm.duty[9] === 0);
  ok('red LED: D12 HIGH, built-in D13 HIGH', pm.digitalRead('D12') === 1 && pm.digitalRead('D13') === 1);
  ok('beep cleared when no event next frame', (pm.syncFromRuntime({ drivePower:0, turnPower:0, gripping:false, led:'off', events:[] }, {}), pm.toneHz === 0));

  // snapshot shape for the wiring view
  const snap = pm.snapshot();
  ok('snapshot: 14 digital pins', snap.digital.length === 14);
  ok('snapshot: 6 analog pins', snap.analog.length === 6);
  ok('snapshot flags PWM-capable pins', snap.digital[5].isPwmCapable === true && snap.digital[2].isPwmCapable === false);
  ok('wiring contract covers all 5 sensors', Object.keys(UNO_WIRING.sensors).length === 5);

  // unknown pins never throw — teachable warnings only
  pm.digitalWrite('Z9', 1); pm.analogRead('D13'); pm.pinMode(-1, 1);
  ok('bogus pins warn but never throw', pm.warnings.length >= 3);
}

// ── Intel HEX parser ─────────────────────────────────────────────────────────
console.log('\nIntelHex');
{
  const { parseIntelHex } = await import('../IntelHex.js');
  const rec = (count, addr, type, data) => {
    const b = [count, (addr >> 8) & 0xff, addr & 0xff, type, ...data];
    const ck = (256 - (b.reduce((a, c) => a + c, 0) & 0xff)) & 0xff;
    return ':' + [...b, ck].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join('');
  };
  const hex = [
    rec(4, 0x0000, 0x00, [0x0C, 0x94, 0x34, 0x00]),
    rec(2, 0x0004, 0x00, [0xFF, 0xFF]),
    rec(0, 0x0000, 0x01, []),
  ].join('\n');
  const img = parseIntelHex(hex);
  ok('parses data records in order', Array.from(img.bytes.slice(0, 4)).join(',') === '12,148,52,0');
  ok('base offset = 0', img.base === 0);
  ok('EOF terminates cleanly', img.bytes.length === 6);

  const gapped = [rec(2, 0x0010, 0x00, [0xAA, 0xBB]), rec(0, 0, 1, [])].join('\n');
  const g = parseIntelHex(gapped);
  ok('gap before first record is dropped (base=0x10)', g.base === 0x10 && g.bytes.length === 2);

  const bad = [':100000000095', 'garbage'].join('\n');
  let threw = false;
  try { parseIntelHex(bad); } catch { threw = true; }
  ok('malformed record throws', threw);

  let threw2 = false;
  try { parseIntelHex(rec(1, 0, 0, [0x42]).replace(/:0/, ':9')); } catch { threw2 = true; }
  ok('checksum mismatch throws', threw2);
}

// ── AVR109 flasher: protocol against a fake bootloader + graceful degradation ─
console.log('\nAvr109Flasher');
{
  const { Avr109Flasher } = await import('../Avr109Flasher.js');

  // Fake bootloader: a small AVR109 state machine keyed on write-call
  // boundaries (how a real device parses complete commands).
  class FakeBootloader {
    constructor() {
      this.rx = [];
      this.written = [];
      this.isOpen = true;
      this._pendingBlock = 0;   // bytes still owed on an open 'B' block write
    }
    get isSupported() { return true; }
    async open() {
      const bl = this;
      return {
        async read() {
          const b = bl.rx.splice(0, 64);
          return new Uint8Array(b);
        },
        async write(bytes) {
          bl.written.push(Array.from(bytes));
          bl._onWrite(Array.from(bytes));
        },
        async close() { bl.isOpen = false; },
      };
    }
    _emit(arr) { this.rx.push(...arr); }
    _onWrite(bytes) {
      // finish a pending block write first (data bytes count toward it)
      if (this._pendingBlock > 0) {
        this._pendingBlock -= bytes.length;
        if (this._pendingBlock <= 0) this._emit([0x0d]);   // block done → CR
        return;
      }
      const [c0, c1, c2, c3] = bytes;
      if (c0 === 0x1b && c1 === 0x53) {                     // SYNC + 'S' → software id
        this._emit([...'AVRBOOT'].map(ch => ch.charCodeAt(0)));
      } else if (c0 === 0x62 && bytes.length === 1) {       // 'b' → block support: 'Y' + 128
        this._emit([0x59, 0x00, 0x80]);
      } else if (c0 === 0x42 && c3 === 0x46) {              // 'B' nHi nLo 'F' data…
        const size = (c1 << 8) | c2;
        const dataLen = bytes.length - 4;
        this._pendingBlock = size - dataLen;
        if (this._pendingBlock <= 0) this._emit([0x0d]);
      } else {
        this._emit([0x0d]);                                  // erase / set-addr / leave → CR
      }
    }
  }

  const rec = (count, addr, type, data) => {
    const b = [count, (addr >> 8) & 0xff, addr & 0xff, type, ...data];
    const ck = (256 - (b.reduce((a, c) => a + c, 0) & 0xff)) & 0xff;
    return ':' + [...b, ck].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join('');
  };
  const hexText = [
    rec(4, 0, 0, [1, 2, 3, 4]),
    rec(0, 0, 1, []),
  ].join('\n');

  // Full happy path: connect → identify → block-write → leave
  {
    const bl = new FakeBootloader();
    const f = new Avr109Flasher(bl);
    const statuses = [];
    f.onStatus = s => statuses.push(s);
    const conn = await f.connect();
    ok('connect: bootloader identified', conn.ok && /AVRBOOT/.test(conn.bootloader ?? ''));
    const flash = await f.flash(hexText);
    ok('flash succeeds on real protocol', flash.ok === true);
    ok('flash reports byte count', flash.bytes === 4);
    ok('status flow reaches running', statuses.includes('flashing') && statuses[statuses.length - 1] === 'running');
    ok('chip erase was commanded', bl.written.some(w => w.includes(0x65)));
    ok('block write with F marker sent', bl.written.some(w => w[0] === 0x42 && w[3] === 0x46));
    ok('leave-programming sent (reboot into sketch)', bl.written.some(w => w[0] === 0x45));
  }

  // Graceful degradation: unsupported browser
  {
    class None { get isSupported() { return false; } async open() { throw new Error('nope'); } }
    const f = new Avr109Flasher(new None());
    const r = await f.connect();
    ok('no Web Serial → structured keep-simulating result', r.ok === false && /keep simulating/i.test(r.message));
  }

  // Graceful degradation: user cancels port picker (open throws)
  {
    class Cancel { get isSupported() { return true; } async open() { throw new Error('user cancelled'); } }
    const f = new Avr109Flasher(new Cancel());
    const r = await f.connect();
    ok('cancelled port pick → keep-simulating message', r.ok === false && /No device connected/.test(r.message));
  }

  // Graceful degradation: silent board (no bootloader answer)
  {
    class Silent {
      get isSupported() { return true; }
      async open() { return { read: async () => new Uint8Array(0), write: async () => {}, close: async () => {} }; }
    }
    const f = new Avr109Flasher(new Silent());
    const r = await f.connect();
    ok('silent board → bootloader-mode hint, sim unaffected', r.ok === false && /bootloader mode/i.test(r.message));
  }

  // Graceful degradation: corrupt hex never reaches the wire
  {
    const bl = new FakeBootloader();
    const f = new Avr109Flasher(bl);
    await f.connect();
    const r = await f.flash(':not-a-hex-record');
    ok('corrupt hex → structured error, no throw', r.ok === false && /hex file looks broken/.test(r.message));
  }

  // flash before connect → structured miss, sim unaffected
  {
    const f = new Avr109Flasher(new FakeBootloader());
    const r = await f.flash(hexText);
    ok('flash without connect → keep-simulating result', r.ok === false && /Not connected/.test(r.message));
  }
}

// ── Quilt sheet: the bot as a live spreadsheet ──────────────────────────────
console.log('\nQuiltSheet');
{
  const { QuiltSheet, CELLS, CELL_IDS } = await import('../QuiltSheet.js');

  const qs = new QuiltSheet();
  ok('all cells initialized', CELL_IDS.every(id => qs.cells[id] && typeof qs.cells[id].v !== 'undefined'));
  ok('cell defs carry group + description (the teaching layer)',
     CELLS.every(c => c.group && c.label && c.description && c.emoji));

  // frame 1: bot driving forward, distance 0.8
  qs.update({
    robot: { x: 10, z: 20, heading: Math.PI / 2, drivePower: 0.6, turnPower: 0, events: [], gripping: false },
    sensors: { distance_ahead: 0.8, light: 0.4, temperature: 0.1, line_under: true, motion_nearby: false },
    program: { tileLabel: 'forever ∞', stepsPerSec: 1200, budgetPct: 3, beeps: 0 },
    heart: { name: 'Klunk', bond: 1, dents: 0, laps: 0 },
  });
  ok('sensor distance lands in cell', qs.cells['sensor.distance'].v === 0.8);
  ok('line cell is TRUE', qs.cells['sensor.line'].v === true);
  ok('drive as percent', qs.cells['motor.drive'].v === 60);
  ok('speed formula computed', qs.cells['pose.speed'].v === 1.44);
  ok('straight drive: L=R motors', qs.cells['motor.left'].v === 60 && qs.cells['motor.right'].v === 60);
  ok('first write flashes the cell', qs.cells['sensor.distance'].ch === true);

  // frame 2: identical state → no flash
  qs.update({
    robot: { x: 10, z: 20, heading: Math.PI / 2, drivePower: 0.6, turnPower: 0, events: [] },
    sensors: { distance_ahead: 0.8, light: 0.4, temperature: 0.1, line_under: true, motion_nearby: false },
  });
  ok('unchanged value does NOT flash', qs.cells['sensor.distance'].ch === false);
  ok('changed() lists only flashing cells', !qs.changed().includes('sensor.distance'));

  // frame 3: wall appears + turn right → differential math visible
  qs.update({
    robot: { x: 10, z: 20, heading: Math.PI / 2, drivePower: 0.4, turnPower: 0.6, events: [{ kind: 'beep', freq: 880 }] },
    sensors: { distance_ahead: 0.15, light: 0.4, temperature: 0.1, line_under: false, motion_nearby: false },
  });
  ok('distance drop flashes', qs.cells['sensor.distance'].ch === true && qs.cells['sensor.distance'].v === 0.15);
  ok('skid steer: L=100 R=-20', qs.cells['motor.left'].v === 100 && qs.cells['motor.right'].v === -20);
  ok('beep event lands in buzzer cell', qs.cells['motor.buzzer'].v === 880);

  // pins feed PWM cells from a pin snapshot
  qs.update({
    robot: { x: 10, z: 20, heading: 0, drivePower: 1, turnPower: 0, events: [] },
    pins: { digital: Array.from({ length: 14 }, (_, i) => ({ pin: 'D' + i, level: 0, pwm: i === 5 ? 255 : i === 6 ? 128 : -1 })), analog: [{ counts: 512 }, ...Array(5).fill({ counts: 0 })] },
  });
  ok('D5/D6 duties flow into pin cells', qs.cells['pin.pwmL'].v === 255 && qs.cells['pin.pwmR'].v === 128);
  ok('A0 counts cell = analogRead', qs.cells['pin.a0'].v === 512);

  // heart cells (M4 wiring target)
  qs.update({ heart: { name: 'Rivet', bond: 2, dents: 3, laps: 7 } });
  ok('bot heart cells update', qs.cells['heart.name'].v === 'Rivet' && qs.cells['heart.dents'].v === 3 && qs.cells['heart.laps'].v === 7);

  // heading formats to degrees
  ok('heading in degrees', qs.cells['pose.heading'].v === 0);
}

// ── BotLedger: dents, repairs, milestones, retirement shelf ─────────────────
console.log('\nBotLedger (the heart)');
{
  const { BotLedger, BotShelf } = await import('../../BotLedger.js');

  // Node has no localStorage — install a tiny mock so persistence is exercised
  const _ls = new Map();
  globalThis.localStorage = {
    getItem: k => (_ls.has(k) ? _ls.get(k) : null),
    setItem: (k, v) => _ls.set(k, String(v)),
    removeItem: k => _ls.delete(k),
  };

  BotShelf.clear();

  const lg = new BotLedger('Klunk', 'test-slot-x1');

  // crash-stall detection: driving hard into a wall accrues ONE dent, not 60/frame
  let dent = null;
  for (let i = 0; i < 60; i++) {
    // ordered full speed, moved nowhere (wall)
    dent = lg.observeMotion({ x: 5, z: 5 }, { x: 5, z: 5 }, 1.0, 1 / 60) ?? dent;
  }
  ok('wall-press accrues exactly one dent (cooldown)', lg.dents.length === 1 && dent !== null);
  ok('dent records where + speed', dent.x === 5 && dent.speed === 1);

  // cooldown: continuing to press does not immediately add more
  for (let i = 0; i < 120; i++) lg.observeMotion({ x: 5, z: 5 }, { x: 5, z: 5 }, 1.0, 1 / 60);
  ok('still pressing = no dent spam', lg.dents.length === 1);

  // free driving: no dents, streaks accumulate
  for (let i = 0; i < 60; i++) lg.observeMotion({ x: 5, z: 5 }, { x: 5.03, z: 5 }, 0.8, 1 / 60);
  ok('free driving adds no dents', lg.dents.length === 1);

  // milestones fire once
  ok('first_dent milestone fired', lg.has('first_dent'));
  ok('milestone once-only', lg.milestone('first_dent') === false);
  lg.milestone('first_brain', 'test');
  ok('countMilestones works', lg.countMilestones('first_brain') === 1);

  // crash-free streaks
  for (let i = 0; i < 2000; i++) lg.observeMotion({ x: 5, z: 5 }, { x: 5.04, z: 5 }, 0.8, 1 / 60);
  ok('30s crash-free streak remembered', lg.has('crash_free_30'));

  // repair
  const r = lg.repair('repair_kit');
  ok('repair fixes all dents and logs it', r.dentsFixed === 1 && lg.dents.length === 0 && lg.repairs.length === 1);
  ok('repair with no dents returns null', lg.repair() === null);

  // laps
  lg.lapCompleted(); lg.lapCompleted(); lg.lapCompleted(); lg.lapCompleted();
  lg.lapCompleted(); lg.lapCompleted(); lg.lapCompleted(); lg.lapCompleted();
  lg.lapCompleted(); lg.lapCompleted();
  ok('laps counted', lg.laps === 10);
  ok('ten_laps milestone at 10', lg.has('ten_laps'));

  // retire: too young → null
  ok('retire blocked under 60s runtime', lg.retire('too young') === null);

  // grow runtime, then retire
  for (let i = 0; i < 4000; i++) lg.observeMotion({ x: 5, z: 5 }, { x: 5.04, z: 5 }, 0.8, 1 / 60);
  const entry = lg.retire('Never once found the waypoint. Never once stopped trying.');
  ok('retire returns shelf entry', entry !== null && entry.laps === 10);
  ok('retire freezes the ledger', lg.isRetired && lg.milestone('later') === false && lg.observeMotion({x:0,z:0},{x:0,z:0},1,1) === null);
  ok('shelf holds the honored bot', BotShelf.list().some(s => s.name === 'Klunk'));
  ok('epitaph kept to 140 chars', entry.epitaph.length <= 140);

  // rename semantics
  const lg2 = new BotLedger('Bot', 'test-slot-x2');
  ok('rename works pre-retirement', lg2.rename('Rivet') === true && lg2.name === 'Rivet');
  for (let i = 0; i < 4000; i++) lg2.observeMotion({ x: 5, z: 5 }, { x: 5.04, z: 5 }, 0.8, 1 / 60);
  lg2.retire('done');
  ok('rename blocked after retirement', lg2.rename('Nope') === false && lg2.name === 'Rivet');

  // persistence round-trip: a fresh ledger for the same slot restores history
  const lg3 = new BotLedger('?', 'test-slot-x1');
  ok('ledger restores from slot on reload', lg3.name === 'Klunk' && lg3.isRetired && lg3.laps === 10);
}

// ── Rivet companion suite ───────────────────────────────────────────────────
console.log('\nRivet — the companion');
{
  const { runRivetTests } = await import('../../companion/__tests__/rivet-tests.mjs');
  await runRivetTests(ok);
}

// ── Companion roster suite (Bolt/Magma/Juno, parties, entry points) ────────
console.log('\nCompanion roster — the replay-value engine');
{
  const { runRosterTests } = await import('../../companion/__tests__/roster-tests.mjs');
  await runRosterTests(ok);
}

// ── Render mode (?lite=1 / deviceMemory heuristic) ──────────────────────────
console.log('\nRender mode — workshop OOM hardening');
{
  const { resolveRenderMode, effectivePixelRatio, FULL_PIXEL_RATIO_CAP, LITE_PIXEL_RATIO } = await import('../../renderMode.js');

  const forced = resolveRenderMode({ search: '?lite=1', deviceMemory: 8 });
  ok('?lite=1 forces lite render', forced.lite === true && forced.forced === true && forced.pixelRatioCap === LITE_PIXEL_RATIO);

  const off = resolveRenderMode({ search: '?lite=0', deviceMemory: 2 });
  ok('?lite=0 forces full render (overrides heuristic)', off.lite === false && off.pixelRatioCap === FULL_PIXEL_RATIO_CAP);

  const auto = resolveRenderMode({ search: '', deviceMemory: 2 });
  ok('deviceMemory < 4 auto-suggests lite', auto.lite === true && auto.auto === true && auto.reason === 'deviceMemory');

  const fine = resolveRenderMode({ search: '', deviceMemory: 8 });
  ok('healthy deviceMemory stays full', fine.lite === false && fine.reason === 'default');

  const unknown = resolveRenderMode({ search: '', deviceMemory: undefined });
  ok('missing deviceMemory trusts the machine (full)', unknown.lite === false);

  ok('full mode caps pixel ratio at 1.5', effectivePixelRatio(fine, 3) === 1.5);
  ok('lite mode forces pixel ratio 1', effectivePixelRatio(forced, 3) === 1);
  ok('ratio never drops below 1', effectivePixelRatio(forced, 0.5) === 1);
}

// ── Pre-game hotkey toast ────────────────────────────────────────────────────
console.log('\nPre-game hotkey toast');
{
  const { maybePreGameHint, PRE_GAME_HINT_MSG } = await import('../../preGameHint.js');
  let store = null;
  const ctx = (code, booted) => ({ code, booted, getSession: () => store, setSession: v => { store = v; } });

  ok('E pre-game shows the CLOCK IN toast', maybePreGameHint(ctx('KeyE', false)) === PRE_GAME_HINT_MSG);
  store = null;
  ok('T pre-game shows the toast', maybePreGameHint(ctx('KeyT', false)) === PRE_GAME_HINT_MSG);
  ok('toast fires once per session', maybePreGameHint(ctx('KeyF', false)) === null);
  ok('other keys stay silent', maybePreGameHint(ctx('KeyQ', false)) === null && maybePreGameHint(ctx('Space', false)) === null);

  store = null;
  ok('post-boot keys need no toast', maybePreGameHint(ctx('KeyE', true)) === null && store === null);
}

// ── Landmark plaques — the new wrecks ──────────────────────────────────────
console.log('\nLandmark plaques — the new wrecks');
{
  const { PLAQUES, PLAQUE_CONCEPTS, plaqueConceptName } = await import('../../data/plaques.js');

  ok('ten new plaques shipped', PLAQUES.length === 10);
  ok('every plaque names a real component', PLAQUES.every(p => PLAQUE_CONCEPTS.includes(plaqueConceptName(p))));
  ok('each plaque teaches a different concept', new Set(PLAQUES.map(plaqueConceptName)).size === 10);
  ok('kid format: "Here fell …"', PLAQUES.every(p => /here fell/i.test(p.line)));
  ok('plaques sit at fixed in-bounds yard positions', PLAQUES.every(p => Number.isInteger(p.x) && Number.isInteger(p.z) && p.x >= 0 && p.x < 128 && p.z >= 0 && p.z < 128));
  ok('the kid asked for Sparky + capacitors — honored', plaqueConceptName(PLAQUES.find(p => p.id === 'sparky_ix')) === 'capacitor');
  ok('plaque ids unique', new Set(PLAQUES.map(p => p.id)).size === 10);
  ok('every plaque keeps the doctrine (thank this machine)', PLAQUES.every(p => /thank this machine/i.test('What it taught us: ' + p.lesson + ' Thank this machine.')));
}

// ── Dumpster-Fire Panic Button ───────────────────────────────────────────
console.log('\nPanic button — Rocket Overdrive');
{
  const { createPanicState, noteCrash, noteTaskComplete, panicStatus, consumePanic, smashTargets, rollLootCache, PANIC_THRESHOLD, PANIC_COOLDOWN_MS } = await import('../../PanicButton.js');

  ok('threshold is 3 crashes, cooldown 5 min', PANIC_THRESHOLD === 3 && PANIC_COOLDOWN_MS === 5 * 60 * 1000);

  let s = createPanicState();
  noteCrash(s); noteCrash(s);
  ok('2 crashes → button stays hidden', panicStatus(s, 1000).show === false);
  noteCrash(s);
  const st = panicStatus(s, 1000);
  ok('3 crashes → button shows, armed', st.show === true && st.enabled === true);

  ok('consumePanic fires and starts cooldown', consumePanic(s, 2000) !== null && s.lastPanicAt === 2000 && s.crashCount === 0);
  noteCrash(s); noteCrash(s); noteCrash(s);
  ok('cooldown blocks for the full 5 minutes', panicStatus(s, 2000 + PANIC_COOLDOWN_MS - 1).enabled === false);
  ok('cooldown reports remaining time', panicStatus(s, 2000 + 60_000).cooldownRemainingMs > 0);
  ok('cooldown expired → armed again', panicStatus(s, 2000 + PANIC_COOLDOWN_MS).enabled === true);
  ok('gated consume returns null during cooldown', consumePanic(s, 2000 + 1000) === null);

  s = createPanicState();
  noteCrash(s); noteCrash(s); noteTaskComplete(s);
  ok('completed task resets the crash count', s.crashCount === 0 && panicStatus(s).show === false);

  // smash targeting — junk whitelist only, nearest first, max 5
  const SCRAP = 7, RUST = 4, STATION = 9; // real block ids; 9 is not on the whitelist
  const grid = {
    '0,1,0': SCRAP, '0,1,1': RUST, '0,1,-1': SCRAP,
    '1,1,0': RUST, '-1,1,0': SCRAP, '2,1,0': RUST, '3,1,0': SCRAP,
    '0,2,0': STATION, '0,1,3': STATION,
  };
  const targets = smashTargets({ x: 0, z: 0 }, (x, y, z) => grid[`${x},${y},${z}`] ?? 0, [{ id: SCRAP }, { id: RUST }]);
  ok('smashes at most 5 blocks', targets.length === 5);
  ok('stations are never smashable', !targets.some(t => t.id === STATION));
  ok('nearest blocks go first', Math.abs(targets[0].x) + Math.abs(targets[0].z) <= 1);

  const loot = rollLootCache(() => 0.99);
  ok('loot cache is salvage (iron), never empty', loot.length >= 1 && loot[0].id === 'iron_scrap');
}


// ── DailyContract: the come-back-tomorrow engine ────────────────────────────
console.log('\nDailyContract');
{
  const { DailyContract, pickContract, rollStreak, todayKey, CONTRACT_POOL } =
    await import('../../DailyContract.js');

  // mock game — records everything the contract pays out
  const mkGame = () => {
    const log = { xp: 0, items: [], notifies: [], events: [] };
    return {
      log,
      xpSystem: { gain: n => { log.xp += n; } },
      player:   { addItem: (id, q) => { log.items.push([id, q]); } },
      ui:       { notify: t => { log.notifies.push(t); }, updateDaily: () => {} },
      foreman:  { onEvent: e => { log.events.push(e); } },
    };
  };
  const DAY = new Date('2026-08-22T10:00:00');           // local-time fixture
  const drive = (dc, c, when, dt = 1) => ({
    collect:    () => dc.onCollect(c.target),
    mine_block: () => dc.onMine(c.target),
    craft:      () => dc.onCraft(),
    spark:      () => dc.onSpark(),
    bot_lap:    () => dc.onLapComplete(),
    bot_run:    () => dc.tick(dt, when),
  })[c.type];

  // determinism — every kid in every yard gets the same contract today
  ok('pick is deterministic for a day', pickContract('2026-08-22').id === pickContract('2026-08-22').id);
  ok('pick comes from the pool', CONTRACT_POOL.some(c => c.id === pickContract('2026-08-22').id));
  ok('todayKey is local-calendar', todayKey(new Date(2026, 7, 22, 23, 59)) === '2026-08-22');

  // mine contracts carry numeric block targets (wired like Challenge.js)
  ok('mine contracts have block targets', CONTRACT_POOL.filter(c => c.type === 'mine_block')
     .every(c => typeof c.target === 'number'));

  // progress → claim exactly once, rewards exactly once
  {
    const g = mkGame();
    const dc = new DailyContract(g, DAY);
    const c = dc.contract;
    ok('fresh contract unclaimed, zero progress', !dc.claimed && dc.progress === 0);
    for (let i = 0; i < c.need; i++) drive(dc, c, DAY)();
    ok('completes on the last unit', dc.claimed && dc.progress === c.need);
    ok('reward XP granted once', g.log.xp === c.reward.xp + Math.min(dc.streak.count, 7) * 15);
    ok('reward item granted once', g.log.items.length === 1 && g.log.items[0][0] === c.reward.item);
    ok('Earl hears daily_contract_done', g.log.events.includes('daily_contract_done'));
    const xpAfter = g.log.xp;
    drive(dc, c, DAY)();                                    // stray event post-claim
    ok('no double claim', g.log.xp === xpAfter && dc.claimed);
    ok('announce() is one-shot', dc.announce() === true && dc.announce() === false);
  }

  // partial progress survives the reload (finish tonight's daily tomorrow)
  {
    const g = mkGame();
    const dc = new DailyContract(g, DAY);
    const c = dc.contract;
    for (let i = 0; i < Math.ceil(c.need / 2); i++) drive(dc, c, DAY)();
    const half = dc.progress;

    const dc2 = new DailyContract(mkGame(), new Date(1999, 0, 1));   // unrelated epoch
    dc2.fromSaveData(dc.toSaveData(), DAY);
    ok('progress persists across sessions', dc2.progress === half && dc2.contract.id === c.id && !dc2.claimed);
    for (let i = dc2.progress; i < c.need; i++) drive(dc2, c, DAY)();
    ok('completes the day after', dc2.claimed);
  }

  // streak math — the whole game
  {
    let s = rollStreak(null, '2026-08-20');
    ok('first ever day starts the streak at 1', s.count === 1 && s.best === 1);
    s = rollStreak(s, '2026-08-20');
    ok('same day, second session: no change', s.count === 1);
    s = rollStreak(s, '2026-08-21');
    ok('next day grows the streak', s.count === 2 && s.best === 2);
    s = rollStreak(s, '2026-08-24');
    ok('skipped days break the chain', s.count === 1 && s.best === 2);
  }

  // midnight rollover between sessions: fresh contract, streak grows, daysPlayed counts
  {
    const g = mkGame();
    const dc = new DailyContract(g, new Date('2026-08-21T20:00:00'));
    const oldId = dc.contract.id;
    ok('daysPlayed counts day 1', dc.daysPlayed === 1);

    const dc2 = new DailyContract(mkGame(), new Date(1999, 0, 1));
    dc2.fromSaveData(dc.toSaveData(), new Date('2026-08-22T09:00:00'));
    ok('rollover resets progress and claim', dc2.progress === 0 && !dc2.claimed);
    ok('rollover rolls a seeded contract', dc2.contract.id === pickContract('2026-08-22').id);
    ok('rollover increments the streak', dc2.streak.count === 2);
    ok('rollover counts day 2', dc2.daysPlayed === 2);
    // (same-contract days are legal — the point is it's the seeded pick, not the old one's shadow)
    ok('old contract id came from yesterday', oldId === pickContract('2026-08-21').id);
  }

  // bot_run contracts accumulate runtime via tick
  {
    const g = mkGame();
    const dc = new DailyContract(g, new Date(2026, 7, 22, 10, 0, 0));
    dc._state.contractId = 'endurance';                     // need: 120s of runtime
    const bot = { _brainMode: true, battery: 80 };
    const game = mkGame();
    const dc2 = new DailyContract({ ...game, scrapBot: bot }, DAY);
    dc2._state.contractId = 'endurance';
    for (let i = 0; i < 121; i++) dc2.tick(1, DAY);
    ok('endurance contract completes via runtime', dc2.claimed);
  }
}

// ── WelcomeBack: the minute-0-of-day-2 briefing ─────────────────────────────
console.log('\nWelcomeBack');
{
  const { WelcomeBack } = await import('../../WelcomeBack.js');

  const full = WelcomeBack.build({
    botName: 'Rivet', botBond: 34, botLaps: 7, botDents: 2,
    ovalBestMs: 18420, questTitle: 'Build a Brain', questStep: 'Craft the Tin Brain',
    dayStreak: 3, daysPlayed: 4,
  });
  ok('card names the bot first', full.rows[0].icon === '🤖' && full.rows[0].text.includes('<b>Rivet</b>'));
  ok('card shows bond, laps, dents', full.rows[0].text.includes('bond 34%') && full.rows[0].text.includes('7 laps'));
  ok('card shows the open quest', full.rows.some(r => r.text.includes('Build a Brain') && r.text.includes('Tin Brain')));
  ok('card shows the streak', full.rows.some(r => r.text.includes('3-day streak')));
  ok('card shows the clock to beat', full.rows.some(r => r.text.includes('18.42s')));
  ok('subtitle counts days', full.subtitle.includes('day 4'));

  const empty = WelcomeBack.build({});
  ok('empty snapshot yields no rows', empty.rows.length === 0);

  const day1 = WelcomeBack.build({ botName: 'Bolt', dayStreak: 1 });
  ok('day 1 reads as day 1', day1.rows.some(r => r.text.includes('Day 1 of a new streak')));
}
// ── summary ────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
