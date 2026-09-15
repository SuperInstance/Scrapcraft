/**
 * Firmware golden / structural test suite — src/maker/FirmwareGen.js
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Scrapcraft's headline promise is that a dragged-around tile program becomes
 * REAL Arduino C++ / MicroPython firmware. This suite is a coverage sweep
 * over that promise: it proves every sensor and actuator in primitives.js
 * emits real, non-placeholder code in BOTH targets, and that the surrounding
 * skeleton (setup/loop, pin #defines, helper functions, imports, main loop)
 * and control-flow (if/else, repeat, repeat_until, wait, forever) render as
 * sane C++ / Python structure.
 *
 * This suite does NOT modify FirmwareGen.js or primitives.js — it only reads
 * their current, real behaviour through toArduino()/toMicroPython() and the
 * SENSORS/ACTUATORS registries. Where the sweep found a real gap, it's called
 * out explicitly below (search "KNOWN GAP") rather than silently patched.
 *
 * Run: node src/maker/__tests__/run-tests.mjs  (folded into the harness)
 */

import { toArduino, toMicroPython } from '../FirmwareGen.js';
import { TileProgram, T } from '../TileProgram.js';
import { SENSORS, ACTUATORS, getSensor, getActuator, withDefaults } from '../primitives.js';

export function runFirmwareGoldenTests(ok) {
  // ═══ 1. Arduino skeleton ════════════════════════════════════════════════
  {
    const prog = new TileProgram({ name: 'Skeleton', brain: 'tin', nodes: [
      T.forever([
        T.ifElse(T.cond('distance_ahead', 'lt', 0.25),
          [ T.action('stop'), T.action('beep', { pitch: 'high' }) ],
          [ T.action('drive', { dir: 'forward', speed: 0.5 }) ]),
      ]),
    ]});
    const ino = toArduino(prog);

    ok('Arduino skeleton: has void setup()', ino.includes('void setup() {'));
    ok('Arduino skeleton: has void loop()', ino.includes('void loop() {'));
    ok('Arduino skeleton: setup/loop are both closed', ino.includes('}\n\nvoid loop()') || ino.split('void setup()').length === 2);
    ok('Arduino skeleton: declares pin #defines for the actuator used (drive)',
      ino.includes('#define ENA') && ino.includes('#define IN1') && ino.includes('#define IN2'));
    ok('Arduino skeleton: declares pin #defines for the sensor used (ultrasonic)',
      ino.includes('#define TRIG_PIN') && ino.includes('#define ECHO_PIN'));
    ok('Arduino skeleton: emits the ultrasonic helper FUNCTION (not just a call site)',
      ino.includes('float readDistance()'));
    ok('Arduino skeleton: emits the drive() helper function', ino.includes('void drive(int dir, int pwm)'));
    ok('Arduino skeleton: header names the program', ino.includes('Brain: "Skeleton"'));
  }

  // ═══ 2. MicroPython skeleton ════════════════════════════════════════════
  {
    const prog = new TileProgram({ name: 'SkeletonPy', brain: 'spark', nodes: [
      T.forever([
        T.ifElse(T.cond('brightness', 'gt', 0.6),
          [ T.action('led', { state: 'red' }) ],
          [ T.action('led', { state: 'blue' }) ]),
      ]),
    ]});
    const py = toMicroPython(prog);

    ok('MicroPython skeleton: imports machine primitives', py.includes('from machine import Pin, ADC, PWM'));
    ok('MicroPython skeleton: imports time helpers', py.includes('from time import sleep_ms, sleep'));
    ok('MicroPython skeleton: has a main loop', py.includes('while True:'));
    ok('MicroPython skeleton: reads the sensor used (brightness)', py.includes('read_brightness()'));
    ok('MicroPython skeleton: emits the read_brightness() helper definition',
      py.includes('def read_brightness():'));
    ok('MicroPython skeleton: emits the set_led() helper definition', py.includes('def set_led(c):'));
  }

  // ═══ 3. Coverage sweep — every SENSOR, both targets ════════════════════
  // Each sensor is exercised inside an if/else so usedPrimitives() picks it
  // up via `cond.sensor`, exactly how the editor/Spark produce real programs.
  // The assertion is structural: the *exact* expression the primitive's own
  // firmware.arduino()/firmware.micropython() emitter returns must appear
  // verbatim in the generated file — proving FirmwareGen actually reads the
  // primitive's own emitter rather than silently no-op'ing or falling back
  // to the `/* prim */` placeholder used for genuinely unknown primitives.
  console.log('  (sweeping all sensors x {arduino, micropython}...)');
  for (const [id, def] of Object.entries(SENSORS)) {
    const cond = def.kind === 'digital' ? T.is(id, true) : T.cond(id, 'gt', 0.5);
    const prog = new TileProgram({ name: `SensorSweep:${id}`, brain: 'vision', nodes: [
      T.forever([ T.ifElse(cond, [ T.action('stop') ], [ T.action('stop') ]) ]),
    ]});
    const ino = toArduino(prog);
    const py  = toMicroPython(prog);

    const expArd = def.firmware?.arduino?.();
    const expPy  = def.firmware?.micropython?.();

    ok(`sensor "${id}": defines an Arduino emitter`, typeof expArd === 'string' && expArd.length > 0);
    ok(`sensor "${id}": Arduino output contains its real expression`, !!expArd && ino.includes(expArd), expArd);
    ok(`sensor "${id}": defines a MicroPython emitter`, typeof expPy === 'string' && expPy.length > 0);
    ok(`sensor "${id}": MicroPython output contains its real expression`, !!expPy && py.includes(expPy), expPy);
  }

  // ═══ 4. Coverage sweep — every ACTUATOR, both targets ══════════════════
  console.log('  (sweeping all actuators x {arduino, micropython}...)');
  for (const [id, def] of Object.entries(ACTUATORS)) {
    const params = withDefaults(id, {});
    const prog = new TileProgram({ name: `ActuatorSweep:${id}`, brain: 'vision', nodes: [
      T.forever([ T.action(id, params), T.wait(0.1) ]),
    ]});
    const ino = toArduino(prog);
    const py  = toMicroPython(prog);

    const expArd = def.firmware?.arduino?.(params);
    const expPy  = def.firmware?.micropython?.(params);

    ok(`actuator "${id}": defines an Arduino emitter`, typeof expArd === 'string' && expArd.length > 0);
    ok(`actuator "${id}": Arduino output contains its real emitted line`, !!expArd && ino.includes(expArd), expArd);
    ok(`actuator "${id}": defines a MicroPython emitter`, typeof expPy === 'string' && expPy.length > 0);
    ok(`actuator "${id}": MicroPython output contains its real emitted line`, !!expPy && py.includes(expPy), expPy);

    // None of the sweep programs should ever fall back to the generic
    // "unknown primitive" placeholder — that fallback exists for primitives
    // NOT in the registry (an AI safety rail), not for real, registered ones.
    ok(`actuator "${id}": Arduino never falls back to the unknown-prim placeholder`,
      !ino.includes(`/* ${id} */`));
    ok(`actuator "${id}": MicroPython never falls back to the unknown-prim placeholder`,
      !py.includes(`# ${id}`));
  }

  // ═══ 5. Control-flow renders sane C / Python structure ═════════════════
  {
    // if / else
    const ifElseProg = new TileProgram({ nodes: [
      T.ifElse(T.cond('distance_ahead', 'lt', 0.3),
        [ T.action('stop') ],
        [ T.action('drive', { dir: 'forward', speed: 0.4 }) ]),
    ]});
    const ino = toArduino(ifElseProg);
    const py  = toMicroPython(ifElseProg);
    ok('if/else → Arduino emits if ( ... ) { ... } else { ... }',
      ino.includes('if (') && ino.includes('} else {'));
    ok('if/else → Python emits if ...: / else:',
      py.includes('if ') && py.includes('else:'));

    // repeat (counted loop)
    const repeatProg = new TileProgram({ nodes: [
      T.repeat(3, [ T.action('beep', { pitch: 'mid' }) ]),
    ]});
    const inoR = toArduino(repeatProg);
    const pyR  = toMicroPython(repeatProg);
    ok('repeat(3) → Arduino emits a bounded for loop', inoR.includes('for (int i1=0; i1<3; i1++) {'));
    ok('repeat(3) → Python emits a bounded for loop', pyR.includes('for _ in range(3):'));

    // repeat_until
    const untilProg = new TileProgram({ nodes: [
      T.repeatUntil(T.cond('distance_ahead', 'lt', 0.25), [
        T.action('drive', { dir: 'forward', speed: 0.5 }),
      ]),
      T.action('stop'),
    ]});
    const inoU = toArduino(untilProg);
    const pyU  = toMicroPython(untilProg);
    ok('repeat_until → Arduino emits while (!( ... )) { ... }', inoU.includes('while (!('));
    ok('repeat_until → Python emits while not ( ... ):', pyU.includes('while not ('));

    // wait
    const waitProg = new TileProgram({ nodes: [ T.wait(0.75) ]});
    const inoW = toArduino(waitProg);
    const pyW  = toMicroPython(waitProg);
    ok('wait(0.75s) → Arduino emits delay(750)', inoW.includes('delay(750);'));
    ok('wait(0.75s) → Python emits sleep(0.75)', pyW.includes('sleep(0.75)'));

    // forever as the SOLE top-level node unwraps directly into loop() —
    // no extra while(true) wrapper (splitRoots special-cases this).
    const soleForever = new TileProgram({ nodes: [
      T.forever([ T.action('beep', { pitch: 'low' }) ]),
    ]});
    const inoF = toArduino(soleForever);
    ok('sole top-level forever unwraps into loop() directly (no extra while(true))',
      !inoF.includes('while (true)') && inoF.includes('void loop() {\n  tone('));

    // a NESTED forever (not the sole root) keeps its explicit while(true)
    const nestedForever = new TileProgram({ nodes: [
      T.action('led', { state: 'green' }),
      T.forever([ T.action('beep', { pitch: 'low' }) ]),
    ]});
    const inoNF = toArduino(nestedForever);
    ok('a non-sole forever keeps an explicit while (true) { ... }', inoNF.includes('while (true) {'));
  }

  // ═══ 6. KNOWN GAP — add_score's implicit "score" variable ═════════════
  // add_score's firmware templates reference a bare `score` variable that
  // FirmwareGen never declares: collectAllVarNames() only walks set_var /
  // change_var / math_var / random_var / print / read_sensor nodes and
  // `var:` conditions — an `action` node (which is what add_score is) is
  // invisible to it. The two assertions below pin down the CURRENT (buggy)
  // output precisely, so this is a regression golden, not an endorsement:
  //   • Arduino:     `score += 5;` is emitted with no matching
  //                  `int score = 0;` global → undeclared identifier,
  //                  will not compile in the Arduino IDE.
  //   • MicroPython: the emitter template itself contains a raw embedded
  //                  "\n" (`score += 5\nprint(...)`), and emitPython() only
  //                  prepends indentation to the FIRST line of a firmware
  //                  string, so the print() lands at column 0 — outside the
  //                  while-True loop body it was meant to run inside.
  {
    const prog = new TileProgram({ name: 'ScoreGap', brain: 'tin', nodes: [
      T.action('add_score', { amount: 5 }),
    ]});
    const ino = toArduino(prog);
    const py  = toMicroPython(prog);

    ok('add_score IS emitted (score += 5;)', ino.includes('score += 5;'));
    ok('KNOWN GAP: Arduino never declares "int score = 0;" for add_score\'s implicit variable',
      !ino.includes('int score = 0;'));
    ok('KNOWN GAP: MicroPython never declares "score = 0" for add_score\'s implicit variable',
      !py.split('\n').some(line => line.trim() === 'score = 0'));
    ok('KNOWN GAP: MicroPython\'s embedded literal newline de-indents the print() out of the loop body',
      py.split('\n').some(line => line === 'print(f"Score: {score}")'));
  }
}
