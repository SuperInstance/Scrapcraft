/**
 * ───────────────────────────────────────────────────────────────────────────
 *  FIRMWARE GEN  —  tile tree  →  real Arduino C++ / MicroPython
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  Two jobs, same code path:
 *    • LAYER-3 VIEW   show an advanced student the real firmware behind their
 *                     tiles, side-by-side, in-game.
 *    • EXPORT BRIDGE  emit a flashable sketch (Arduino) or .py (MicroPython)
 *                     they can drop into Wokwi or onto a $6 ESP32.
 *
 *  This is what makes Scrapcraft a maker pipeline rather than a toy: the tiles a
 *  10-year-old dragged around become literal, correct embedded code. We walk the
 *  SAME tile tree the VM runs, so the simulation and the exported firmware are
 *  guaranteed to describe the same behaviour.
 *
 *  Helper functions (drive/turn/readBrightness/...) are emitted only for the
 *  primitives the program actually uses, keyed off primitives.js metadata.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { getActuator, getSensor, BRAINS } from './primitives.js';
import { expandMacro } from './TileCompiler.js';

// Per-language helper bodies, emitted only when the matching primitive is used.
const ARDUINO_HELPERS = {
  drive: `void drive(int dir, int pwm){ digitalWrite(IN1, dir==FORWARD); digitalWrite(IN2, dir!=FORWARD); analogWrite(ENA, pwm); }`,
  turn:  `void turn(int dir, int pwm){ /* spin in place via differential drive */ analogWrite(ENA, pwm); analogWrite(ENB, pwm); }`,
  stop:  `void stopMotors(){ analogWrite(ENA,0); analogWrite(ENB,0); }`,
  led:   `void setLed(String c){ digitalWrite(LED_R, c=="red"||c=="white"); digitalWrite(LED_G, c=="green"||c=="white"); digitalWrite(LED_B, c=="blue"||c=="white"); }`,
  brightness: `float readBrightness(){ return analogRead(LDR_PIN) / 1023.0; }`,
  distance_ahead: `float readDistance(){ digitalWrite(TRIG_PIN,LOW); delayMicroseconds(2); digitalWrite(TRIG_PIN,HIGH); delayMicroseconds(10); digitalWrite(TRIG_PIN,LOW); long us=pulseIn(ECHO_PIN,HIGH); float cm=us/58.0; return min(cm/200.0, 1.0); }`,
  // ── inference-chip helpers (templates, honest + minimal) ──
  // ECHO — ring buffer replay of the recorded drive/turn sequence
  remember_path: `int echoBuf[64][2]; int echoLen=0; void echoRecord(int dpwm,int tpwm){ if(echoLen<64){ echoBuf[echoLen][0]=dpwm; echoBuf[echoLen][1]=tpwm; echoLen++; } } void echoReplay(){ for(int i=0;i<echoLen;i++){ analogWrite(ENA,echoBuf[i][0]); analogWrite(ENB,echoBuf[i][1]); delay(500); } analogWrite(ENA,0); analogWrite(ENB,0); }`,
  // SENTRY — proximity guard + hysteresis latch around the chosen block
  watch_obstacle: `bool sentryTripped=false; void sentryWatch(int tripPct,int clearPct){ digitalWrite(TRIG_PIN,LOW); delayMicroseconds(2); digitalWrite(TRIG_PIN,HIGH); delayMicroseconds(10); digitalWrite(TRIG_PIN,LOW); float d=min(pulseIn(ECHO_PIN,HIGH)/58.0/200.0,1.0); if(!sentryTripped&&d*100<tripPct){ sentryTripped=true; analogWrite(ENA,0); analogWrite(ENB,0); } else if(sentryTripped&&d*100>clearPct){ sentryTripped=false; } }`,
  // RUMOR — tx/rx exactly one fact byte over the wire
  hear_share: `byte rumorIn=0; void rumorShare(byte f){ Serial1.write(f); if(Serial1.available()) rumorIn=Serial1.read(); }`,
  // WITNESS — EEPROM milestone counters
  log_tick: `void witnessTick(int addr){ byte c=EEPROM.read(addr); if(c<255) c++; EEPROM.update(addr,c); }`,
  // PILOT — line-sensor P-control toward the lane
  seek_line: `void pilotSeek(int kp,int base){ int err=analogRead(A2)-analogRead(A1); int corr=constrain(kp*err/4,-255,255); digitalWrite(IN1,HIGH); digitalWrite(IN2,LOW); analogWrite(ENA,base); analogWrite(ENB,constrain(base+corr,0,255)); }`,
  // EMBER — low-battery guard: park + flash the LED
  keep_warm: `void emberGuard(int floorPct){ float v=ina219.getBusVoltage_V()/7.4; if(v*100<floorPct){ analogWrite(ENA,0); analogWrite(ENB,0); for(int i=0;i<6;i++){ digitalWrite(LED_R,HIGH); delay(150); digitalWrite(LED_R,LOW); delay(150); } } }`,
};

const PY_HELPERS = {
  brightness: `def read_brightness():\n    return ldr.read() / 4095`,
  distance_ahead: `def read_distance():\n    return min(sonar.distance_cm() / 200, 1.0)`,
  beep: `def beep(freq):\n    buzz.freq(freq); buzz.duty(512); sleep_ms(150); buzz.duty(0)`,
  led: `def set_led(c):\n    r.value(c in ("red","white")); g.value(c in ("green","white")); b.value(c in ("blue","white"))`,
  // ── inference-chip helpers (templates, honest + minimal) ──
  remember_path: `def echo_record(dpwm, tpwm):\n    if len(echo_buf) < 64: echo_buf.append((dpwm, tpwm))\ndef echo_replay():\n    for dpwm, tpwm in echo_buf:\n        ena.duty(abs(dpwm)); enb.duty(abs(tpwm)); sleep_ms(500)\n    ena.duty(0); enb.duty(0)`,
  watch_obstacle: `def sentry_watch(trip, clear):\n    global sentry_tripped\n    d = min(sonar.distance_cm() / 200, 1.0)\n    if (not sentry_tripped) and d < trip:\n        sentry_tripped = True; ena.duty(0); enb.duty(0)\n    elif sentry_tripped and d > clear:\n        sentry_tripped = False`,
  hear_share: `def rumor_share(f):\n    uart.write(bytes([f]))\n    if uart.any(): rumor_in = uart.read(1)[0]`,
  log_tick: `def witness_tick(key):\n    try: cnt = nvs.get_i32(key) + 1\n    except OSError: cnt = 1\n    nvs.set_i32(key, cnt); nvs.commit()`,
  seek_line: `def pilot_seek(kp, speed):\n    err = ir_r.read() - ir_l.read()\n    corr = max(-255, min(255, int(kp * err)))\n    ena.duty(int(speed * 255)); enb.duty(max(0, min(255, int(speed * 255) + corr)))`,
  keep_warm: `def ember_guard(floor):\n    v = ina.voltage() / 7.4\n    if v < floor:\n        ena.duty(0); enb.duty(0)\n        for _ in range(6):\n            lr.value(1); sleep_ms(150); lr.value(0); sleep_ms(150)`,
};

// ── Inference-chip jitter (canon: a cracked chip mumbles ±15%, seeded) ──────

/** First cracked chip on the program → its seeded timing multiplier.
 *  Clean board → 1.0 (no change). Deterministic: the multiplier is the one
 *  the growth seed fixed at shelf time — same chip, same mumble, forever. */
function _chipJitter(program) {
  for (const c of program?.chips ?? []) {
    if (c && typeof c === 'object' && c.cracked) {
      return { jm: Number(c.jitter) || 1, chip: c.type, seed: c.seed };
    }
  }
  return { jm: 1, chip: null, seed: null };
}

// ── Arduino C++ ──────────────────────────────────────────────────────────────

export function toArduino(program) {
  const used = program.usedPrimitives();
  const { jm, chip, seed } = _chipJitter(program);
  const L = [];

  L.push(`// ─────────────────────────────────────────────`);
  L.push(`// Generated by Scrapcraft Maker Lab`);
  L.push(`// Brain: "${program.name}"  ·  Target: ${BRAINS[program.brain]?.chip ?? 'Arduino'}`);
  L.push(`// These are your tiles, as real firmware. Flash it to a robot.`);
  L.push(`// ─────────────────────────────────────────────`);
  L.push('');
  L.push('#define FORWARD 1');
  L.push('#define BACKWARD 0');
  L.push('#define RIGHT 1');
  L.push('#define LEFT 0');

  // Cracked-chip canon note: the mumble is IN the timing, not a comment.
  if (chip) L.push(`// ⚠ cracked ${String(chip).toUpperCase()} chip mounted: delays fire ±15% off (seed ${String(seed).slice(0, 12)}) — canon, not a bug`);

  // Extra #includes a primitive needs (e.g. EEPROM for WITNESS's counters).
  const includes = new Set();
  for (const id of [...used.actuators, ...used.sensors]) {
    const def = getActuator(id) ?? getSensor(id);
    for (const inc of def?.hw?.arduinoIncludes ?? []) includes.add(inc);
  }
  for (const inc of includes) L.push(`#include <${inc}>`);
  if (includes.size) L.push('');

  // Pin declarations from the hardware mappings of used primitives.
  const pins = collectPins([...used.actuators, ...used.sensors]);
  for (const p of pins) L.push(p);
  L.push('');

  // Helper fns.
  const helpers = new Set();
  for (const id of used.actuators) if (ARDUINO_HELPERS[id]) helpers.add(ARDUINO_HELPERS[id]);
  for (const id of used.sensors)   if (ARDUINO_HELPERS[id]) helpers.add(ARDUINO_HELPERS[id]);
  for (const h of helpers) L.push(h);
  if (helpers.size) L.push('');

  // Global variable declarations
  const varNames = collectAllVarNames(program.nodes);
  for (const name of varNames) L.push(`int ${name} = 0;`);
  if (varNames.length) L.push('');

  // setup()
  L.push('void setup() {');
  if (_hasPrintNode(program.nodes)) L.push('  Serial.begin(9600);');
  for (const id of [...used.actuators, ...used.sensors]) {
    const def = getActuator(id) ?? getSensor(id);
    const line = def?.hw?.setup?.arduino;
    if (line) L.push('  ' + line);
  }
  L.push('}');
  L.push('');

  // Subroutines (forward-declare before loop())
  const subNodes = program.nodes.filter(n => n.type === 'define_sub');
  for (const sub of subNodes) {
    L.push('');
    L.push(`void ${sub.name || 'sub'}() {`);
    emitArduino(sub.body ?? [], L, 1, { jm });
    L.push('}');
  }
  if (subNodes.length) L.push('');

  // loop()
  const { loopBody } = splitRoots(program.nodes.filter(n => n.type !== 'define_sub'));
  L.push('void loop() {');
  emitArduino(loopBody, L, 1, { jm });
  L.push('}');

  return L.join('\n');
}

function emitArduino(nodes, L, depth, jx = { jm: 1 }) {
  const pad = '  '.repeat(depth);
  for (const node of nodes) {
    switch (node.type) {
      case 'action': {
        const def = getActuator(node.prim);
        L.push(pad + (def?.firmware?.arduino?.(node.params) ?? `/* ${node.prim} */`));
        break;
      }
      case 'wait':
        // Cracked-chip mumble: waits fire late/early within seeded ±15%.
        L.push(pad + `delay(${Math.round(node.seconds * 1000 * jx.jm)});`);
        break;
      case 'if':
        L.push(pad + `if (${condArduino(node.cond)}) {`);
        emitArduino(node.body, L, depth + 1, jx);
        L.push(pad + '}');
        break;
      case 'if_else':
        L.push(pad + `if (${condArduino(node.cond)}) {`);
        emitArduino(node.body, L, depth + 1, jx);
        L.push(pad + '} else {');
        emitArduino(node.elseBody, L, depth + 1, jx);
        L.push(pad + '}');
        break;
      case 'repeat': {
        const v = `i${depth}`;
        L.push(pad + `for (int ${v}=0; ${v}<${node.count}; ${v}++) {`);
        emitArduino(node.body, L, depth + 1, jx);
        L.push(pad + '}');
        break;
      }
      case 'forever':
        L.push(pad + 'while (true) {');
        emitArduino(node.body, L, depth + 1, jx);
        L.push(pad + '}');
        break;
      case 'repeat_until':
        L.push(pad + `while (!(${condArduino(node.cond)})) {`);
        emitArduino(Array.isArray(node.body) ? node.body : [], L, depth + 1, jx);
        L.push(pad + '}');
        break;
      case 'wait_until':
        L.push(pad + `while (!(${condArduino(node.cond)})) { delay(10); }`);
        break;
      case 'break':
        L.push(pad + 'break;');
        break;
      case 'print': {
        const vname = node.name || 'count';
        L.push(pad + `Serial.print("${vname} = ");`);
        L.push(pad + `Serial.println(${vname});`);
        break;
      }
      case 'comment':
        L.push(pad + `// ${(node.text || 'note').replace(/\*\//g, '* /')}`);
        break;
      case 'random_var': {
        const n = node.name || 'x', lo = Math.floor(Number(node.min) || 1), hi = Math.floor(Number(node.max) || 10);
        L.push(pad + `${n} = random(${lo}, ${Math.max(lo, hi) + 1});`);
        break;
      }
      case 'read_sensor': {
        const rsDef = getSensor(node.sensor);
        const rsExpr = rsDef?.firmware?.arduino?.() ?? '0';
        L.push(pad + `${node.name || 'dist'} = ${rsExpr};`);
        break;
      }
      case 'math_var': {
        const mv = node.name || 'x', mop = node.op || 'mul', mo = Number(node.operand) || 0;
        const opStr = { add: '+=', sub: '-=', mul: '*=', div: '/=' }[mop] ?? '+=';
        if (mop === 'div' && mo === 0) L.push(pad + `// division by zero skipped`);
        else L.push(pad + `${mv} ${opStr} ${mo};`);
        break;
      }
      case 'define_sub':
        // Hoisted to top level in toArduino(); skip here if encountered nested
        break;
      case 'call_sub':
        L.push(pad + `${node.name || 'sub'}();`);
        break;
      case 'macro':
        emitArduino(expandMacro(node) ?? [], L, depth, jx);
        break;
      case 'set_var':
        L.push(pad + `${node.name || 'count'} = ${Number(node.value) || 0};`);
        break;
      case 'change_var': {
        const delta = Number(node.delta) || 0;
        const op = delta >= 0 ? '+=' : '-=';
        L.push(pad + `${node.name || 'count'} ${op} ${Math.abs(delta)};`);
        break;
      }
    }
  }
}

function condArduino(cond) {
  if (!cond?.sensor) return 'false';
  if (cond.sensor.startsWith('var:')) {
    const name = cond.sensor.slice(4);
    const rhs = cond.varValue ? cond.varValue : `${Number(cond.value) || 0}`;
    const out = `${name} ${cmpSym(cond.cmp)} ${rhs}`;
    return cond.not ? `!(${out})` : out;
  }
  const def = getSensor(cond.sensor);
  const expr = def?.firmware?.arduino?.() ?? 'false';
  let out;
  if (cond.cmp === 'is') out = cond.value ? `${expr}` : `!(${expr})`;
  else out = `${expr} ${cmpSym(cond.cmp)} ${Number(cond.value) || 0}`;
  return cond.not ? `!(${out})` : out;
}

// ── MicroPython ──────────────────────────────────────────────────────────────

export function toMicroPython(program) {
  const used = program.usedPrimitives();
  const { jm, chip, seed } = _chipJitter(program);
  const L = [];
  L.push(`# Generated by Scrapcraft Maker Lab`);
  L.push(`# Brain: "${program.name}"  ·  Target: ${BRAINS[program.brain]?.chip ?? 'ESP32'}`);
  if (chip) L.push(`# ⚠ cracked ${String(chip).toUpperCase()} chip mounted: sleeps fire ±15% off (seed ${String(seed).slice(0, 12)}) — canon, not a bug`);
  L.push('from machine import Pin, ADC, PWM');
  // Extra imports a primitive needs (UART for RUMOR, NVS for WITNESS).
  const pyImports = new Set();
  for (const id of [...used.actuators, ...used.sensors]) {
    const def = getActuator(id) ?? getSensor(id);
    for (const imp of def?.hw?.pyImports ?? []) pyImports.add(imp);
  }
  for (const imp of pyImports) L.push(imp);
  L.push('from time import sleep_ms, sleep');
  L.push('');
  // setup
  for (const id of [...used.actuators, ...used.sensors]) {
    const def = getActuator(id) ?? getSensor(id);
    const line = def?.hw?.setup?.micropython;
    if (line) L.push(line);
  }
  L.push('');
  const helpers = new Set();
  for (const id of [...used.actuators, ...used.sensors]) if (PY_HELPERS[id]) helpers.add(PY_HELPERS[id]);
  for (const h of helpers) { L.push(h); L.push(''); }

  // Global variable declarations (before the main loop)
  const varNames = collectAllVarNames(program.nodes);
  for (const name of varNames) L.push(`${name} = 0`);
  if (varNames.length) L.push('');

  // Subroutines as def functions (before main loop)
  const pySubNodes = program.nodes.filter(n => n.type === 'define_sub');
  for (const sub of pySubNodes) {
    L.push(`def ${sub.name || 'sub'}():`);
    emitPython(sub.body ?? [], L, 1, { jm });
    L.push('');
  }

  const { loopBody } = splitRoots(program.nodes.filter(n => n.type !== 'define_sub'));
  L.push('while True:');
  emitPython(loopBody, L, 1, { jm });
  return L.join('\n');
}

function emitPython(nodes, L, depth, jx = { jm: 1 }) {
  const pad = '    '.repeat(depth);
  if (!nodes.length) { L.push(pad + 'pass'); return; }
  for (const node of nodes) {
    switch (node.type) {
      case 'action': {
        const def = getActuator(node.prim);
        L.push(pad + (def?.firmware?.micropython?.(node.params) ?? `# ${node.prim}`));
        break;
      }
      case 'wait':
        // Cracked-chip mumble: sleeps fire late/early within seeded ±15%.
        L.push(pad + `sleep(${(node.seconds * jx.jm).toFixed(2)})`);
        break;
      case 'if':
        L.push(pad + `if ${condPython(node.cond)}:`);
        emitPython(node.body, L, depth + 1, jx);
        break;
      case 'if_else':
        L.push(pad + `if ${condPython(node.cond)}:`);
        emitPython(node.body, L, depth + 1, jx);
        L.push(pad + 'else:');
        emitPython(node.elseBody, L, depth + 1, jx);
        break;
      case 'repeat':
        L.push(pad + `for _ in range(${node.count}):`);
        emitPython(node.body, L, depth + 1, jx);
        break;
      case 'forever':
        L.push(pad + 'while True:');
        emitPython(node.body, L, depth + 1, jx);
        break;
      case 'repeat_until':
        L.push(pad + `while not (${condPython(node.cond)}):`);
        emitPython(Array.isArray(node.body) ? node.body : [], L, depth + 1, jx);
        break;
      case 'wait_until':
        L.push(pad + `while not (${condPython(node.cond)}):`);
        L.push(pad + '    sleep_ms(10)');
        break;
      case 'break':
        L.push(pad + 'break');
        break;
      case 'print':
        L.push(pad + `print(f"${node.name || 'count'} = {${node.name || 'count'}}")`);
        break;
      case 'comment':
        L.push(pad + `# ${node.text || 'note'}`);
        break;
      case 'random_var': {
        const n = node.name || 'x', lo = Math.floor(Number(node.min) || 1), hi = Math.floor(Number(node.max) || 10);
        L.push(pad + `import random`);
        L.push(pad + `${n} = random.randint(${lo}, ${Math.max(lo, hi)})`);
        break;
      }
      case 'read_sensor': {
        const rsDef = getSensor(node.sensor);
        const rsExpr = rsDef?.firmware?.micropython?.() ?? '0';
        L.push(pad + `${node.name || 'dist'} = ${rsExpr}`);
        break;
      }
      case 'math_var': {
        const mv = node.name || 'x', mop = node.op || 'mul', mo = Number(node.operand) || 0;
        if (mop === 'div' && mo === 0) L.push(pad + `# division by zero skipped`);
        else L.push(pad + `${mv} ${mop === 'add' ? '+' : mop === 'sub' ? '-' : mop === 'mul' ? '*' : '/'}= ${mo}`);
        break;
      }
      case 'define_sub':
        // Hoisted to top level in toMicroPython(); skip here if nested
        break;
      case 'call_sub':
        L.push(pad + `${node.name || 'sub'}()`);
        break;
      case 'macro':
        emitPython(expandMacro(node) ?? [], L, depth, jx);
        break;
      case 'set_var':
        L.push(pad + `${node.name || 'count'} = ${Number(node.value) || 0}`);
        break;
      case 'change_var': {
        const delta = Number(node.delta) || 0;
        L.push(pad + `${node.name || 'count'} += ${delta}`);
        break;
      }
    }
  }
}

function condPython(cond) {
  if (!cond?.sensor) return 'False';
  if (cond.sensor.startsWith('var:')) {
    const name = cond.sensor.slice(4);
    const rhs = cond.varValue ? cond.varValue : `${Number(cond.value) || 0}`;
    const out = `${name} ${cmpSym(cond.cmp)} ${rhs}`;
    return cond.not ? `not (${out})` : out;
  }
  const def = getSensor(cond.sensor);
  const expr = def?.firmware?.micropython?.() ?? 'False';
  let out;
  if (cond.cmp === 'is') out = cond.value ? `${expr}` : `not (${expr})`;
  else out = `${expr} ${cmpSym(cond.cmp)} ${Number(cond.value) || 0}`;
  return cond.not ? `not (${out})` : out;
}

// ── shared helpers ───────────────────────────────────────────────────────────

function cmpSym(cmp) {
  return { gt: '>', lt: '<', gte: '>=', lte: '<=', eq: '==', neq: '!=', is: '==' }[cmp] ?? '>';
}

/** If the program is a single top-level forever, unwrap its body into loop(). */
function splitRoots(nodes) {
  if (nodes.length === 1 && nodes[0].type === 'forever') {
    return { loopBody: nodes[0].body, setupExtra: [] };
  }
  return { loopBody: nodes, setupExtra: [] };
}

/** Returns true if the program uses any print tiles. */
function _hasPrintNode(nodes) {
  const recur = (list) => {
    for (const n of list) {
      if (n.type === 'print') return true;
      if (Array.isArray(n.body)     && recur(n.body))     return true;
      if (Array.isArray(n.elseBody) && recur(n.elseBody)) return true;
    }
    return false;
  };
  return recur(nodes);
}

/** Collect all variable names referenced anywhere in the tile tree. */
function collectAllVarNames(nodes) {
  const names = new Set();
  const recur = (list) => {
    for (const n of list) {
      if (n.type === 'set_var' || n.type === 'change_var' || n.type === 'math_var' || n.type === 'random_var' || n.type === 'print' || n.type === 'read_sensor') names.add(n.name || 'count');
      if (n.cond?.sensor?.startsWith('var:')) names.add(n.cond.sensor.slice(4));
      if (Array.isArray(n.body))     recur(n.body);
      if (Array.isArray(n.elseBody)) recur(n.elseBody);
    }
  };
  recur(nodes);
  return [...names];
}

// ── Wokwi diagram export ──────────────────────────────────────────────────────

/** Generate a Wokwi diagram.json for the used primitives. */
export function toWokwiDiagram(program) {
  const used = program.usedPrimitives();
  const parts = [];
  const connections = [];

  const chip    = BRAINS[program.brain]?.platform ?? 'esp32';
  const mcuType = chip === 'uno' ? 'wokwi-arduino-uno' : 'wokwi-esp32-devkit-v1';
  parts.push({ type: mcuType, id: 'mcu1', top: 0, left: 0, attrs: {} });

  const seen = new Set();
  for (const id of [...used.actuators, ...used.sensors]) {
    const spec = WOKWI_PARTS[id];
    if (!spec || seen.has(spec.type)) continue;
    seen.add(spec.type);
    const partId = id + '1';
    parts.push({ type: spec.type, id: partId, top: spec.top ?? 100, left: spec.left ?? 300, attrs: {} });

    const def  = getActuator(id) ?? getSensor(id);
    const pins = _pinPairs(def);
    for (const { mcuPin, devPin, color } of pins) {
      connections.push([`mcu1:${mcuPin}`, `${partId}:${devPin}`, color, []]);
    }
    connections.push([`mcu1:3.3V`,   `${partId}:VCC`, 'red',   []]);
    connections.push([`mcu1:GND.1`,  `${partId}:GND`, 'black', []]);
  }

  return JSON.stringify({ version: 1, author: 'Scrapcraft Maker Lab', parts, connections }, null, 2);
}

/** Generate a human-readable wiring SVG from the pin map. */
export function toWiringSVG(program) {
  const used = program.usedPrimitives();
  const W = 900, H = 600;
  const L = [];
  L.push(`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`);
  L.push(`  <rect width="${W}" height="${H}" fill="#1a1a2e"/>`);
  L.push(`  <rect x="30" y="50" width="120" height="400" rx="6" fill="#2a2a4a" stroke="#4488ff" stroke-width="2"/>`);
  L.push(`  <text x="90" y="38" fill="#aabbff" font-size="13" text-anchor="middle" font-family="monospace">${BRAINS[program.brain]?.chip ?? 'MCU'}</text>`);

  const allIds = [...new Set([...used.actuators, ...used.sensors])];
  let row = 0;
  const seen = new Set();
  for (const id of allIds) {
    const def = getActuator(id) ?? getSensor(id);
    if (!def?.hw) continue;
    const pairs = _pinPairs(def);
    if (!pairs.length) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    const bx = 750, by = 70 + row * 110;
    L.push(`  <rect x="${bx-70}" y="${by}" width="140" height="50" rx="4" fill="#1a2a1a" stroke="#44aa44" stroke-width="1.5"/>`);
    L.push(`  <text x="${bx}" y="${by+22}" fill="#aaffaa" font-size="12" text-anchor="middle" font-family="monospace">${def.label ?? id}</text>`);
    L.push(`  <text x="${bx}" y="${by+38}" fill="#667766" font-size="9" text-anchor="middle" font-family="monospace">${def.hw.peripheral ?? ''}</text>`);

    for (let i = 0; i < pairs.length; i++) {
      const { mcuPin, devPin, color } = pairs[i];
      const my = 65 + (parseInt(mcuPin) % 22) * 17;
      const cy = by + 8 + i * 14;
      L.push(`  <polyline points="150,${my} 210,${my} 210,${cy} ${bx-70},${cy}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4,2"/>`);
      L.push(`  <text x="155" y="${my-3}" fill="${color}" font-size="8" font-family="monospace">${mcuPin}</text>`);
      L.push(`  <text x="${bx-72}" y="${cy-2}" fill="${color}" font-size="8" text-anchor="end" font-family="monospace">${devPin}</text>`);
    }
    row++;
  }

  L.push('</svg>');
  return L.join('\n');
}

const WOKWI_PARTS = {
  distance_ahead: { type: 'wokwi-hc-sr04',                top:  80, left: 350 },
  bumped:         { type: 'wokwi-pushbutton',               top: 180, left: 350 },
  brightness:     { type: 'wokwi-photoresistor-sensor',     top: 280, left: 350 },
  is_dark:        { type: 'wokwi-photoresistor-sensor',     top: 280, left: 350 },
  player_near:    { type: 'wokwi-pir-motion-sensor',        top: 380, left: 350 },
  beep:           { type: 'wokwi-buzzer',                   top:  80, left: 550 },
  led:            { type: 'wokwi-rgb-led',                  top: 180, left: 550 },
  drive:          { type: 'wokwi-l298n',                    top: 280, left: 550 },
  turn:           { type: 'wokwi-l298n',                    top: 280, left: 550 },
  stop:           { type: 'wokwi-l298n',                    top: 280, left: 550 },
  grab:           { type: 'wokwi-servo',                    top: 380, left: 550 },
};

function _pinPairs(def) {
  if (!def?.hw) return [];
  const COL = { TRIG: 'green', ECHO: 'blue', IN1: '#f0b429', IN2: '#ff8800',
                ENA: '#ffcc00', ENB: '#ff6600', A0: 'green', D4: 'green',
                D13: 'cyan', D15: 'magenta', D19: 'lime', 'CSI-0': 'purple' };
  const frags = [];
  if (def.hw.pin)  frags.push(...String(def.hw.pin).split(','));
  if (def.hw.pins) for (const p of def.hw.pins) frags.push(...String(p).split(','));
  return frags.map(f => {
    const m = f.trim().match(/([A-Za-z0-9_-]+)\s*=\s*(\d+)/);
    return m ? { mcuPin: m[2], devPin: m[1], color: COL[m[1]] ?? '#aaaaaa' } : null;
  }).filter(Boolean);
}

/** Build pin #define lines from hw mappings (best-effort, de-duplicated). */
function collectPins(ids) {
  const defines = new Map();
  const add = (name, num) => { if (!defines.has(name)) defines.set(name, num); };
  for (const id of ids) {
    const def = getActuator(id) ?? getSensor(id);
    if (!def?.hw) continue;
    // Parse "NAME=NN" fragments out of pin / pins fields.
    const frags = [];
    if (def.hw.pin) frags.push(...String(def.hw.pin).split(','));
    if (def.hw.pins) for (const p of def.hw.pins) frags.push(...String(p).split(','));
    for (const f of frags) {
      const m = f.trim().match(/([A-Za-z0-9_]+)\s*=\s*(\d+)/);
      if (m) add(m[1], m[2]);
    }
    // Named conventional pins for the common primitives.
    if (id === 'brightness' || id === 'is_dark') add('LDR_PIN', 'A0');
    if (id === 'distance_ahead' || id === 'bumped') { add('TRIG_PIN', '5'); add('ECHO_PIN', '18'); }
    if (id === 'bumped') add('BUMP_PIN', '4');
    if (id === 'beep') add('BUZZ_PIN', '13');
    if (id === 'led') { add('LED_R', '14'); add('LED_G', '12'); add('LED_B', '33'); }
    if (id === 'drive' || id === 'turn' || id === 'stop') { add('IN1', '25'); add('IN2', '26'); add('ENA', '27'); add('ENB', '14'); }
    if (id === 'player_near') add('PIR_PIN', '19');
    // Inference-chip peripherals: the templates above reference these pins.
    if (id === 'watch_obstacle') { add('TRIG_PIN', '5'); add('ECHO_PIN', '18'); }
    if (id === 'remember_path' || id === 'seek_line' || id === 'keep_warm') { add('IN1', '25'); add('IN2', '26'); add('ENA', '27'); add('ENB', '14'); }
    if (id === 'keep_warm') { add('LED_R', '14'); add('LED_G', '12'); add('LED_B', '33'); }
  }
  return [...defines.entries()].map(([n, v]) => `#define ${n} ${v}`);
}
