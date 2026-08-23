/**
 * ───────────────────────────────────────────────────────────────────────────
 *  PIN MODEL  —  a virtual Arduino Uno living inside the game
 * ───────────────────────────────────────────────────────────────────────────
 *
 * "Hardware twin" mode: every tile program runs against BOTH the physics sim
 * (VirtualRobot) and this pin model. The same `drive forward 0.6` that moves
 * the bot ALSO writes D5's PWM register to 153. When a kid later holds a real
 * Uno, D5 was already a muscle they exercised.
 *
 * Real Uno facts (ATmega328P, because the mapping must be REAL):
 *   • 14 digital pins D0..D13 (D13 = the built-in LED)
 *   • 6 analog inputs A0..A5 (analogRead → 0..1023, 10-bit)
 *   • PWM (analogWrite, duty 0..255) on D3, D5, D6, D9, D10, D11 only
 *   • pinMode INPUT / OUTPUT / INPUT_PULLUP; writes to OUTPUT pins stick
 *     until changed — exactly like motor-driver pins on a real bot.
 *
 * Zero Three.js, zero DOM — runs headless in unit tests.
 */

export const DIGITAL_PINS = 14;          // D0..D13
export const ANALOG_PINS  = 6;           // A0..A5
export const PWM_PINS     = [3, 5, 6, 9, 10, 11];
export const LED_BUILTIN  = 13;

export const INPUT = 0, OUTPUT = 1, INPUT_PULLUP = 2;
export const LOW = 0, HIGH = 1;

/**
 * The Scrapcraft↔Uno wiring contract — which sensor/actuator lives on which
 * pin. This is the map the wiring view draws and FirmwareGen agrees with.
 * (D0/D1 reserved: USB serial. A4/A5 reserved: I2C.)
 */
export const UNO_WIRING = {
  sensors: {
    distance_ahead: { pin: 'A0', kind: 'analog',   label: 'HC-SR04 distance (front)' },
    light:          { pin: 'A1', kind: 'analog',   label: 'LDR photoresistor' },
    temperature:    { pin: 'A2', kind: 'analog',   label: 'NTC thermistor' },
    line_under:     { pin: 'D2',  kind: 'digital', label: 'TCRT5000 IR line' },
    motion_nearby:  { pin: 'D3',  kind: 'digital', label: 'PIR motion' },
  },
  actuators: {
    // differential drive: left = drive+turn, right = drive−turn (real skid-steer)
    motorL:  { dir: 'D4',  pwm: 'D5',  label: 'Left motor (dir+PWM)' },
    motorR:  { dir: 'D7',  pwm: 'D6',  label: 'Right motor (dir+PWM)' },
    buzzer:  { pin: 'D8',             label: 'Piezo buzzer (tone)' },
    servo:   { pin: 'D9',             label: 'Grabber servo (PWM angle)' },
    ledR:    { pin: 'D12',            label: 'LED red' },
    ledG:    { pin: 'D11',            label: 'LED green (PWM)' },
    ledB:    { pin: 'D10',            label: 'LED blue (PWM)' },
    builtin: { pin: 'D13',            label: 'Built-in LED (blink pin!)' },
  },
};

export class UnoPinModel {
  constructor() {
    this.mode    = new Array(DIGITAL_PINS).fill(INPUT);
    this.out     = new Array(DIGITAL_PINS).fill(LOW);    // digital output level
    this.duty    = new Array(DIGITAL_PINS).fill(-1);     // PWM duty 0..255, -1 = not PWM-writing
    this._inDig  = new Array(DIGITAL_PINS).fill(LOW);    // driven by the world (sensors)
    this._inAna  = new Array(ANALOG_PINS).fill(0);       // 0..1023 driven by the world
    this.toneHz  = 0;                                    // D8 tone() frequency, 0 = silent
    this.warnings = [];                                  // non-fatal misuse notes (teachable!)
  }

  _warn(msg) {
    if (this.warnings.length < 32) this.warnings.push(msg);
  }

  /** Normalize 'D5' / 5 / 'A1' / 'a1' → { d: <index> } or { a: <index> }; null if invalid. */
  static parsePin(name) {
    if (typeof name === 'number' && Number.isInteger(name) && name >= 0 && name < DIGITAL_PINS) {
      return { d: name };
    }
    const m = String(name ?? '').trim().toUpperCase().match(/^([DA])(\d+)$/);
    if (!m) return null;
    const n = parseInt(m[2], 10);
    if (m[1] === 'D' && n < DIGITAL_PINS) return { d: n };
    if (m[1] === 'A' && n < ANALOG_PINS)  return { a: n };
    return null;
  }

  pinMode(pin, mode) {
    const p = UnoPinModel.parsePin(pin);
    if (!p || p.a !== undefined || mode < INPUT || mode > INPUT_PULLUP) {
      this._warn(`pinMode(${pin}, ${mode}) — no such digital pin`);
      return;
    }
    this.mode[p.d] = mode;
    if (mode === INPUT_PULLUP) this._inDig[p.d] = HIGH;   // pull-up reads HIGH until pulled low
  }

  /**
   * digitalWrite — real semantics: sticks on OUTPUT pins; on INPUT pins it
   * is the documented (weird, real) "enable/disable internal pull-up" trick.
   */
  digitalWrite(pin, value) {
    const p = UnoPinModel.parsePin(pin);
    if (!p || p.a !== undefined) { this._warn(`digitalWrite(${pin}) — no such digital pin`); return; }
    const v = value ? HIGH : LOW;
    if (this.mode[p.d] === OUTPUT) {
      this.out[p.d] = v;
      if (PWM_PINS.includes(p.d)) this.duty[p.d] = -1;    // a plain write cancels PWM, like real AVR
    } else {
      this._inDig[p.d] = v ? HIGH : LOW;                  // pull-up control on input pins
      this._warn(`digitalWrite(${pin}) on an INPUT pin — that's the pull-up trick, not an output!`);
    }
  }

  /** digitalRead — reads the world (INPUT) or your own output (OUTPUT). */
  digitalRead(pin) {
    const p = UnoPinModel.parsePin(pin);
    if (!p || p.a !== undefined) { this._warn(`digitalRead(${pin}) — no such digital pin`); return LOW; }
    return this.mode[p.d] === OUTPUT ? this.out[p.d] : this._inDig[p.d];
  }

  /**
   * analogWrite — PWM duty 0..255. Real semantics: only on PWM-capable pins
   * (Uno: 3,5,6,9,10,11); anywhere else it silently does nothing (and here,
   * kindly tells you why). Writing to an INPUT pin also does nothing.
   */
  analogWrite(pin, duty) {
    const p = UnoPinModel.parsePin(pin);
    if (!p || p.a !== undefined) { this._warn(`analogWrite(${pin}) — no such digital pin`); return; }
    if (!PWM_PINS.includes(p.d)) {
      this._warn(`analogWrite(D${p.d}) — D${p.d} has no PWM! On an Uno only ${PWM_PINS.map(n => 'D' + n).join(', ')} can analogWrite`);
      return;
    }
    if (this.mode[p.d] !== OUTPUT) {
      this._warn(`analogWrite(D${p.d}) — pin is not an OUTPUT yet (call pinMode first)`);
      return;
    }
    this.duty[p.d] = Math.max(0, Math.min(255, Math.round(duty)));
    this.out[p.d]  = this.duty[p.d] > 127 ? HIGH : LOW;   // what a multimeter would roughly see
  }

  /** analogRead — 10-bit, 0..1023, from the world (analog pins A0..A5). */
  analogRead(pin) {
    const p = UnoPinModel.parsePin(pin);
    if (!p || p.d !== undefined) { this._warn(`analogRead(${pin}) — analog pins are A0..A${ANALOG_PINS - 1}`); return 0; }
    return this._inAna[p.a];
  }

  /** tone()/noTone() on the buzzer pin. */
  tone(freqHz) {
    const f = Math.max(0, Math.round(Number(freqHz) || 0));
    this.toneHz = f;
    if (f > 0 && this.mode[8] !== OUTPUT) this._warn('tone() before pinMode(D8, OUTPUT) — quiet servo, sad beep');
  }

  // ── World side: the sim drives sensor pins each tick ──────────────────────

  /** Drive one analog input (0..1 float from the game world) → 10-bit counts. */
  setAnalogInput(pin, unitFloat) {
    const p = UnoPinModel.parsePin(pin);
    if (!p || p.d !== undefined) return;
    this._inAna[p.a] = Math.max(0, Math.min(1023, Math.round(unitFloat * 1023)));
  }

  setDigitalInput(pin, value) {
    const p = UnoPinModel.parsePin(pin);
    if (!p || p.a !== undefined) return;
    if (this.mode[p.d] === INPUT_PULLUP && !value) { this._inDig[p.d] = LOW; return; } // device pulls low
    if (this.mode[p.d] !== OUTPUT) this._inDig[p.d] = value ? HIGH : LOW;
  }

  // ── Hardware twin sync: mirror the sim into the pins ──────────────────────
  /**
   * Called once per frame by the integration layer. Inputs: world sensor
   * values (0..1 / bool). Outputs: robot motor/led/buzzer state → pins.
   * The kid sees their program's behavior BOTH as physics AND as pin levels.
   */
  syncFromRuntime(robot, sensors) {
    if (!robot) return;
    // -- inputs (world → pins)
    if (sensors) {
      if (typeof sensors.distance_ahead === 'number') this.setAnalogInput('A0', sensors.distance_ahead);
      if (typeof sensors.light          === 'number') this.setAnalogInput('A1', sensors.light);
      if (typeof sensors.temperature    === 'number') this.setAnalogInput('A2', sensors.temperature);
      this.setDigitalInput('D2', !!sensors.line_under);
      this.setDigitalInput('D3', !!sensors.motion_nearby);
    }

    // -- ensure actuator pins behave like a wired robot (setup() equivalent)
    for (const d of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      if (this.mode[d] !== OUTPUT) this.mode[d] = OUTPUT;   // the motor shield is soldered on
    }

    // -- differential drive mapping (real skid-steer math)
    const drive = clamp(robot.drivePower ?? 0, -1, 1);
    const turn  = clamp(robot.turnPower  ?? 0, -1, 1);
    const left  = clamp(drive + turn, -1, 1);
    const right = clamp(drive - turn, -1, 1);
    this.digitalWrite('D4', left  >= 0 ? HIGH : LOW);
    this.digitalWrite('D7', right >= 0 ? HIGH : LOW);
    this.analogWrite('D5', Math.abs(left)  * 255);
    this.analogWrite('D6', Math.abs(right) * 255);

    // -- buzzer: latest beep event wins for this frame
    const events = robot.events ?? [];
    const beep = [...events].reverse().find(e => e.kind === 'beep');
    if (beep) this.tone(beep.freq ?? 880);
    else if (this.toneHz > 0) this.toneHz = 0;

    // -- gripper servo: 90° open ↔ 0° closed → duty
    this.analogWrite('D9', robot.gripping ? 0 : 255);

    // -- LED: parse robot.led state 'off'|'#rrggbb'|color name
    const led = String(robot.led ?? 'off');
    if (led === 'off' || led === 'none') {
      this.digitalWrite('D11', LOW); this.digitalWrite('D12', LOW); this.digitalWrite('D13', LOW);
    } else {
      const rgb = _parseLedColor(led);
      this.analogWrite('D11', rgb[1]);   // G (PWM)
      this.analogWrite('D10', rgb[2]);   // B (PWM)
      this.digitalWrite('D12', rgb[0] > 127 ? HIGH : LOW);  // R (no PWM on D12 — real constraint!)
      this.digitalWrite('D13', HIGH);    // built-in LED mirrors "led on"
    }
  }

  /** A plain snapshot for the wiring view / tests. */
  snapshot() {
    const digital = [];
    for (let d = 0; d < DIGITAL_PINS; d++) {
      digital.push({
        pin: `D${d}`,
        mode: ['INPUT', 'OUTPUT', 'INPUT_PULLUP'][this.mode[d]],
        level: this.digitalRead(d),
        pwm: PWM_PINS.includes(d) ? this.duty[d] : undefined,
        isPwmCapable: PWM_PINS.includes(d),
        isLed: d === LED_BUILTIN,
        tone: d === 8 && this.toneHz > 0 ? this.toneHz : undefined,
      });
    }
    const analog = [];
    for (let a = 0; a < ANALOG_PINS; a++) {
      analog.push({ pin: `A${a}`, counts: this._inAna[a], volts: +(this._inAna[a] / 1023 * 5).toFixed(2) });
    }
    return { digital, analog, toneHz: this.toneHz, warnings: [...this.warnings] };
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

const LED_NAMES = {
  red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255],
  yellow: [255, 255, 0], cyan: [0, 255, 255], magenta: [255, 0, 255],
  white: [255, 255, 255], orange: [255, 128, 0], purple: [128, 0, 255],
  pink: [255, 105, 180], rainbow: [255, 255, 255],
};

function _parseLedColor(state) {
  if (LED_NAMES[state]) return LED_NAMES[state];
  const m = String(state).match(/^#?([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return [255, 255, 255];   // unknown "on" state → white-ish
}
