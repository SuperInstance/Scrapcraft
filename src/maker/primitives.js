/**
 * ───────────────────────────────────────────────────────────────────────────
 *  CAPABILITY SCHEMA  —  the primitive vocabulary of the Maker Lab
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  This file is THE CONTRACT. Everything else in src/maker/ depends on it:
 *
 *    • TileCompiler   validates tile programs against these definitions
 *    • TileVM         executes the `sim` functions to drive a robot in-game
 *    • FirmwareGen    reads `hw` + `firmware` to emit real Arduino / MicroPython
 *    • Spark (the AI) may ONLY compose programs from primitives listed here.
 *      That last point is the safety rail: the AI cannot invent hardware that
 *      doesn't exist, because the compiler rejects any op not in this registry.
 *
 *  The "function-first, firmware-blurred" principle lives here. Each primitive
 *  carries BOTH a friendly game-side `sim` behaviour AND an honest `hw` mapping
 *  to a real peripheral, so the same tile a 10-year-old drags around is the same
 *  GPIO/PWM/I2C concept that runs on a $6 ESP32.
 *
 *  To add a capability: add an entry here, and every layer picks it up for free.
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * Parameter type system used for validation + UI knob surfacing.
 *   number  → slider        { min, max, step, default, unit }
 *   enum    → dropdown       { values:[...], default }
 *   bool    → toggle         { default }
 */

// ── SENSORS ──────────────────────────────────────────────────────────────
// category 'sense'. Each has read(robot, world) -> value (number 0..1 or bool).
// `kind` is 'analog' (0..1) or 'digital' (bool) — drives how conditions compare.

export const SENSORS = {
  brightness: {
    id: 'brightness',
    category: 'sense',
    kind: 'analog',
    label: 'brightness',
    blurb: 'how much light is hitting me (0 = pitch black, 1 = blinding)',
    read: (robot, world) => world.lightAt(robot.x, robot.z),
    hw: {
      platform: ['uno', 'esp32', 'jetson'],
      peripheral: 'LDR (photoresistor)',
      pin: 'A0',
      setup: { arduino: 'pinMode(LDR_PIN, INPUT);', micropython: 'ldr = ADC(Pin(36))' },
    },
    firmware: {
      // analogRead is 0..1023 (Uno) / 0..4095 (esp32); we expose normalized 0..1
      arduino: () => 'readBrightness()',          // helper emitted by FirmwareGen
      micropython: () => 'read_brightness()',
    },
  },

  distance_ahead: {
    id: 'distance_ahead',
    category: 'sense',
    kind: 'analog',
    label: 'distance ahead',
    blurb: 'how far the nearest wall is in front of me (1 = far, 0 = touching)',
    // Normalized: 1.0 at >= MAX_RANGE blocks, 0 right against a wall.
    read: (robot, world) => world.distanceAhead(robot.x, robot.z, robot.heading),
    hw: {
      platform: ['uno', 'esp32', 'jetson'],
      peripheral: 'HC-SR04 ultrasonic',
      pin: 'TRIG_PIN=5, ECHO_PIN=18',
      setup: {
        arduino: 'pinMode(TRIG_PIN, OUTPUT); pinMode(ECHO_PIN, INPUT);',
        micropython: 'sonar = HCSR04(trigger_pin=5, echo_pin=18)',
      },
    },
    firmware: { arduino: () => 'readDistance()', micropython: () => 'read_distance()' },
  },

  bumped: {
    id: 'bumped',
    category: 'sense',
    kind: 'digital',
    label: 'bumped a wall',
    blurb: 'true the moment my front bumper hits something',
    read: (robot, world) => world.distanceAhead(robot.x, robot.z, robot.heading) < 0.08,
    hw: {
      platform: ['uno', 'esp32', 'jetson'],
      peripheral: 'tactile bumper switch',
      pin: 'D4',
      setup: {
        arduino: 'pinMode(BUMP_PIN, INPUT_PULLUP);',
        micropython: 'bump = Pin(4, Pin.IN, Pin.PULL_UP)',
      },
    },
    firmware: { arduino: () => 'digitalRead(BUMP_PIN) == LOW', micropython: () => '(bump.value() == 0)' },
  },

  is_dark: {
    id: 'is_dark',
    category: 'sense',
    kind: 'digital',
    label: "it's dark out",
    blurb: 'true when the world is in night / low light',
    read: (robot, world) => world.lightAt(robot.x, robot.z) < 0.35,
    hw: {
      platform: ['uno', 'esp32', 'jetson'],
      peripheral: 'LDR threshold',
      pin: 'A0',
      setup: { arduino: '', micropython: '' },
    },
    firmware: { arduino: () => '(readBrightness() < 0.35)', micropython: () => '(read_brightness() < 0.35)' },
  },

  player_near: {
    id: 'player_near',
    category: 'sense',
    kind: 'digital',
    label: 'player is near',
    blurb: 'true when a person is within a few blocks of me',
    read: (robot, world) => world.playerDistance(robot.x, robot.z) < 4,
    hw: {
      platform: ['esp32', 'jetson'],
      peripheral: 'PIR motion sensor',
      pin: 'D19',
      setup: { arduino: 'pinMode(PIR_PIN, INPUT);', micropython: 'pir = Pin(19, Pin.IN)' },
    },
    firmware: { arduino: () => 'digitalRead(PIR_PIN) == HIGH', micropython: () => '(pir.value() == 1)' },
  },

  sees_color: {
    id: 'sees_color',
    category: 'sense',
    kind: 'digital',
    label: 'sees a coloured block',
    blurb: 'camera detects a distinctly-coloured (non-grey) block in view (Vision Brain only)',
    requiresBrain: 'vision',
    read: (robot, world) => world.seesColor?.(robot.x, robot.z, robot.heading) ?? false,
    hw: {
      platform: ['jetson'],
      peripheral: 'CSI camera + colour classifier',
      pin: 'CSI-0',
      setup: { arduino: '/* Vision requires Jetson */', micropython: '# detector = ColourDetector("scrap.onnx")' },
    },
    firmware: {
      arduino: () => '/* not supported on AVR */ false',
      micropython: () => 'vision.sees_color()',
    },
  },

  target_bearing: {
    id: 'target_bearing',
    category: 'sense',
    kind: 'analog',
    label: 'target bearing',
    blurb: 'how far left/right the target is in view (−1 = far left, +1 = far right)',
    requiresBrain: 'vision',
    read: (robot, world) => world.targetBearing?.(robot.x, robot.z, robot.heading) ?? 0,
    hw: {
      platform: ['jetson'],
      peripheral: 'CSI camera',
      pin: 'CSI-0',
      setup: { arduino: '/* Vision */', micropython: '' },
    },
    firmware: {
      arduino: () => '/* not supported on AVR */ 0',
      micropython: () => 'vision.target_bearing()',
    },
  },

  target_distance: {
    id: 'target_distance',
    category: 'sense',
    kind: 'analog',
    label: 'target distance',
    blurb: 'how far away the nearest target is (0 = right here, 1 = far away)',
    requiresBrain: 'vision',
    read: (robot, world) => world.targetDistance?.(robot.x, robot.z, robot.heading) ?? 1,
    hw: {
      platform: ['jetson'],
      peripheral: 'CSI camera (depth estimate)',
      pin: 'CSI-0',
      setup: { arduino: '/* Vision */', micropython: '' },
    },
    firmware: {
      arduino: () => '/* not supported on AVR */ 1.0',
      micropython: () => 'vision.target_distance()',
    },
  },

  // Vision Brain (Jetson) — abstracted computer vision. "Just works" in-game;
  // maps to a real on-device inference call on actual hardware.
  sees_target: {
    id: 'sees_target',
    category: 'sense',
    kind: 'digital',
    label: 'I can see the target',
    blurb: 'camera + AI: true when my target object is in view (Vision Brain only)',
    requiresBrain: 'vision',
    read: (robot, world) => world.seesTarget?.(robot.x, robot.z, robot.heading) ?? false,
    hw: {
      platform: ['jetson'],
      peripheral: 'CSI camera + object detector',
      pin: 'CSI-0',
      setup: { arduino: '/* Vision requires Jetson */', micropython: '# vision = ObjectDetector("scrap.onnx")' },
    },
    firmware: { arduino: () => '/* not supported on AVR */ false', micropython: () => 'vision.sees("target")' },
  },
};

// ── ACTUATORS ────────────────────────────────────────────────────────────
// category 'act'. Each has exec(robot, params) that mutates robot state.
// Robot state is persistent (like real motor pins) — timing is done with WAIT,
// exactly mirroring real embedded code: drive(); delay(500); stop();

export const ACTUATORS = {
  drive: {
    id: 'drive',
    category: 'act',
    label: 'drive',
    blurb: 'run the wheels forward or backward at a chosen speed',
    params: {
      dir:   { type: 'enum',   values: ['forward', 'backward'], default: 'forward' },
      speed: { type: 'number', min: 0, max: 1, step: 0.05, default: 0.5, unit: 'fraction' },
    },
    exec: (robot, p) => { robot.setDrive(p.dir === 'forward' ? p.speed : -p.speed); },
    hw: {
      platform: ['uno', 'esp32', 'jetson'],
      peripheral: 'DC motor driver (L298N)',
      pins: ['IN1=25', 'IN2=26', 'ENA=27 (PWM)'],
      setup: {
        arduino: 'pinMode(IN1,OUTPUT); pinMode(IN2,OUTPUT); pinMode(ENA,OUTPUT);',
        micropython: 'm = MotorDriver(in1=25, in2=26, ena=27)',
      },
    },
    firmware: {
      arduino: (p) => `drive(${p.dir === 'forward' ? 'FORWARD' : 'BACKWARD'}, ${Math.round(p.speed * 255)});`,
      micropython: (p) => `m.drive("${p.dir}", ${p.speed.toFixed(2)})`,
    },
  },

  turn: {
    id: 'turn',
    category: 'act',
    label: 'turn',
    blurb: 'spin in place left or right at a chosen speed',
    params: {
      dir:   { type: 'enum',   values: ['left', 'right'], default: 'right' },
      speed: { type: 'number', min: 0, max: 1, step: 0.05, default: 0.5, unit: 'fraction' },
    },
    exec: (robot, p) => { robot.setTurn(p.dir === 'right' ? p.speed : -p.speed); },
    hw: {
      platform: ['uno', 'esp32', 'jetson'],
      peripheral: 'differential drive (two motors)',
      pins: ['left+right motor driver'],
      setup: { arduino: '', micropython: '' },
    },
    firmware: {
      arduino: (p) => `turn(${p.dir === 'right' ? 'RIGHT' : 'LEFT'}, ${Math.round(p.speed * 255)});`,
      micropython: (p) => `m.turn("${p.dir}", ${p.speed.toFixed(2)})`,
    },
  },

  stop: {
    id: 'stop',
    category: 'act',
    label: 'stop',
    blurb: 'cut all motors — wheels and turning',
    params: {},
    exec: (robot) => { robot.setDrive(0); robot.setTurn(0); },
    hw: { platform: ['uno', 'esp32', 'jetson'], peripheral: 'motor driver', pins: [], setup: { arduino: '', micropython: '' } },
    firmware: { arduino: () => 'stopMotors();', micropython: () => 'm.stop()' },
  },

  beep: {
    id: 'beep',
    category: 'act',
    label: 'beep',
    blurb: 'play a tone on the buzzer',
    params: {
      pitch: { type: 'enum', values: ['low', 'mid', 'high'], default: 'mid' },
    },
    exec: (robot, p) => { robot.emit('beep', { pitch: p.pitch }); },
    hw: {
      platform: ['uno', 'esp32', 'jetson'],
      peripheral: 'piezo buzzer',
      pin: 'D13',
      setup: { arduino: 'pinMode(BUZZ_PIN, OUTPUT);', micropython: 'buzz = PWM(Pin(13))' },
    },
    firmware: {
      arduino: (p) => `tone(BUZZ_PIN, ${({ low: 330, mid: 660, high: 990 })[p.pitch]}, 150);`,
      micropython: (p) => `beep(${({ low: 330, mid: 660, high: 990 })[p.pitch]})`,
    },
  },

  led: {
    id: 'led',
    category: 'act',
    label: 'set light',
    blurb: 'turn my indicator light on (a colour) or off',
    params: {
      state: { type: 'enum', values: ['off', 'red', 'green', 'blue', 'white'], default: 'green' },
    },
    exec: (robot, p) => { robot.emit('led', { state: p.state }); },
    hw: {
      platform: ['uno', 'esp32', 'jetson'],
      peripheral: 'RGB LED',
      pins: ['R=14', 'G=12', 'B=33'],
      setup: { arduino: 'pinMode(LED_R,OUTPUT);pinMode(LED_G,OUTPUT);pinMode(LED_B,OUTPUT);', micropython: '' },
    },
    firmware: {
      arduino: (p) => `setLed("${p.state}");`,
      micropython: (p) => `set_led("${p.state}")`,
    },
  },

  grab: {
    id: 'grab',
    category: 'act',
    label: 'arm',
    blurb: 'open or close the grabber arm (a servo)',
    params: {
      state: { type: 'enum', values: ['open', 'close'], default: 'close' },
    },
    exec: (robot, p) => { robot.emit('grab', { state: p.state }); robot.gripping = (p.state === 'close'); },
    hw: {
      platform: ['esp32', 'jetson'],
      peripheral: 'SG90 servo',
      pin: 'D15 (PWM)',
      setup: { arduino: 'armServo.attach(SERVO_PIN);', micropython: 'arm = Servo(Pin(15))' },
    },
    firmware: {
      arduino: (p) => `armServo.write(${p.state === 'open' ? 10 : 90});`,
      micropython: (p) => `arm.angle(${p.state === 'open' ? 10 : 90})`,
    },
  },
};

// ── Lookup helpers ─────────────────────────────────────────────────────────

export function getSensor(id)   { return SENSORS[id] ?? null; }
export function getActuator(id) { return ACTUATORS[id] ?? null; }
export function isSensor(id)     { return id in SENSORS; }
export function isActuator(id)   { return id in ACTUATORS; }

/** Brain tiers — which platform each unlocks. Used to gate primitives in-game. */
export const BRAINS = {
  tin:    { id: 'tin',    label: 'Tin Brain',    chip: 'Arduino Uno (ATmega328P)', platform: 'uno' },
  spark:  { id: 'spark',  label: 'Spark Brain',  chip: 'ESP32',                     platform: 'esp32' },
  vision: { id: 'vision', label: 'Vision Brain', chip: 'Jetson Nano',               platform: 'jetson' },
};

/** Validate + coerce one param value against its schema. Returns coerced value. */
export function coerceParam(schema, value) {
  if (!schema) return value;
  if (schema.type === 'number') {
    let v = Number(value);
    if (Number.isNaN(v)) v = schema.default ?? 0;
    if (schema.min != null) v = Math.max(schema.min, v);
    if (schema.max != null) v = Math.min(schema.max, v);
    return v;
  }
  if (schema.type === 'enum') {
    return schema.values.includes(value) ? value : (schema.default ?? schema.values[0]);
  }
  if (schema.type === 'bool') return !!value;
  return value;
}

/** Fill in defaults for any missing params of an actuator. */
export function withDefaults(actuatorId, params = {}) {
  const def = getActuator(actuatorId);
  if (!def) return params;
  const out = {};
  for (const [key, schema] of Object.entries(def.params ?? {})) {
    out[key] = coerceParam(schema, params[key] ?? schema.default);
  }
  return out;
}
