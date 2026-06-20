# Maker Lab — Complete Reference

The Maker Lab is Scrapcraft's embedded-programming layer. It lives in `src/maker/` and is designed around three principles:

1. **Function-first, firmware-blurred** — students describe what they want, not how it works.
2. **Game mechanics = real hardware abstractions** — sensors and actuators map 1:1 to physical components.
3. **compile() is the safety rail** — AI-generated or user-authored programs are always validated before execution.

This document is the complete reference for tile programs, sensors, actuators, the bytecode VM, and firmware export. See `src/maker/README.md` for contribution/extension guidance.

---

## Opening the Tile Editor

Press `T` in-game. The panel slides in from the right.

```
┌────────────────────────────────────────────────────────────────┐
│ TILE EDITOR                                [▶ Run] [■ Stop]   │
│                                                                │
│ Preset: [select... ▾]         Bot: [Bot 1 ▾]                 │
│                                                                │
│ ┌──────────────────────────┐  ┌────────────────────────────┐  │
│ │  PROGRAM CANVAS          │  │  SENSOR READOUT            │  │
│ │                          │  │  distance_ahead  0.82      │  │
│ │  [forever]               │  │  light           0.41      │  │
│ │    [if ...]              │  │  temperature     0.12      │  │
│ │      [drive fwd]         │  │  line_under      false     │  │
│ │    [else]                │  │  motion_nearby   false     │  │
│ │      [turn right 0.5s]   │  │  pos  (35.2, 84.7)        │  │
│ │                          │  │  hdg  NE                  │  │
│ └──────────────────────────┘  └────────────────────────────┘  │
│                                                                │
│ 💬 Ask Spark: "follow the track and beep if lost"  [Send]    │
│                                                                │
│ [Arduino C++] [MicroPython] [Wokwi] [Share 🔗]               │
└────────────────────────────────────────────────────────────────┘
```

---

## Tile program format

A `TileProgram` is a JSON-serializable tree of nodes. The `T` namespace provides constructors:

```js
import { TileProgram, T } from './src/maker/TileProgram.js';

const prog = new TileProgram({
  name: 'My Program',
  brain: 'tin',          // 'tin' | 'spark' | 'vision'
  nodes: [
    T.forever([
      T.ifElse(
        T.is('line_under', true),                          // condition
        [ T.action('drive', { dir: 'forward', speed: 0.6 }) ],  // then
        [                                                         // else
          T.action('turn', { dir: 'right', speed: 0.5 }),
          T.wait(0.2),
        ]
      ),
    ]),
  ],
});
```

### Node types

| Constructor | Description |
|---|---|
| `T.forever(nodes)` | Repeats nodes forever (yields once per iteration) |
| `T.repeat(n, nodes)` | Repeats nodes `n` times (runs hot within a tick) |
| `T.ifElse(cond, thenNodes, elseNodes)` | Conditional branch |
| `T.if(cond, thenNodes)` | Conditional (no else) |
| `T.action(prim, params)` | Execute actuator |
| `T.wait(seconds)` | Non-blocking pause |
| `T.macro(name, params)` | Intent tile (expanded by compiler) |

### Condition constructors

| Constructor | Description |
|---|---|
| `T.is(sensor, value)` | Sensor equals value (equality) |
| `T.lt(sensor, value)` | Sensor < value |
| `T.gt(sensor, value)` | Sensor > value |
| `T.not(cond)` | Invert condition |

---

## Sensors reference

| Sensor ID | Type | Range | Description | Real component |
|---|---|---|---|---|
| `distance_ahead` | float | 0–1 | 0 = wall right there, 1 = totally clear | HC-SR04 ultrasonic |
| `light` | float | 0–1 | 0 = dark, 1 = bright (boosted by Floodlight blocks) | LDR photoresistor |
| `temperature` | float | 0–1 | 0 = cold (Deep Yard), 1 = hot (near forge/smelter) | NTC thermistor |
| `line_under` | bool | true/false | true when bot is on a TRACK block (B.TRACK=17) | TCRT5000 IR sensor |
| `motion_nearby` | bool | true/false | true when player is within ~8 blocks | PIR sensor |

### In-game sensor wiring

`GameWorldAdapter.js` bridges game state to sensor readings:

| Sensor | World check |
|---|---|
| `distance_ahead` | Raycasts in bot heading direction, returns normalized hit distance |
| `light` | Samples ambient light + checks Floodlight blocks within 12 blocks |
| `temperature` | Distance to nearest forge/smelter block |
| `line_under` | Checks `world.getBlock(x, 0, z)` against `LINE_IDS` set (includes B.TRACK=17) |
| `motion_nearby` | `player.pos.distanceTo(robot.pos) < 8` |

---

## Actuators reference

| Action ID | Parameters | Description | Real component |
|---|---|---|---|
| `drive` | `dir: 'forward'|'back'`, `speed: 0–1` | Set drive motors | L298N H-bridge |
| `turn` | `dir: 'left'|'right'`, `speed: 0–1` | Set differential turn | L298N H-bridge |
| `beep` | `freq: Hz`, `duration: seconds` | Play tone | Passive piezo buzzer |
| `led` | `color: '#rrggbb'`, `brightness: 0–1` | Set LED | RGB LED or NeoPixel |
| `grab` | `state: 'open'|'close'` | Gripper arm | SG90 servo |

`drive` and `turn` are *persistent* — they keep running until changed or a `halt` is issued. `beep`, `led`, `grab` are fire-and-forget events drained by `ScrapBot._handleEffect()`.

---

## Built-in preset programs

### Wall Avoider

```js
T.forever([
  T.ifElse(
    T.lt('distance_ahead', 0.3),
    [ T.action('turn', { dir: 'right', speed: 0.8 }), T.wait(0.5) ],
    [ T.action('drive', { dir: 'forward', speed: 0.6 }) ],
  ),
])
```

*Drives forward and turns right when a wall is within 0.3 distance units.*

### Line Follower

```js
T.forever([
  T.ifElse(
    T.is('line_under', true),
    [ T.action('drive', { dir: 'forward', speed: 0.5 }) ],
    [ T.action('turn', { dir: 'right', speed: 0.5 }), T.wait(0.15) ],
  ),
])
```

*Drives on TRACK strips, turns right when it loses the line.*

### Light Runner

```js
T.forever([
  T.ifElse(
    T.gt('light', 0.6),
    [ T.action('drive', { dir: 'forward', speed: 0.8 }) ],
    [ T.action('turn', { dir: 'left', speed: 0.5 }), T.wait(0.25) ],
  ),
])
```

*Chases bright spots — floodlights are the easiest targets.*

### Honking Square

```js
T.repeat(4, [
  T.action('drive', { dir: 'forward', speed: 0.5 }),
  T.wait(2.0),
  T.action('turn', { dir: 'right', speed: 0.6 }),
  T.wait(0.85),
  T.action('beep', { freq: 440, duration: 0.2 }),
])
```

*Drives four sides of a square, honks at each corner. Classic.*

---

## Offline Spark recipes

When the Claude API is unavailable, Spark matches keywords from the player's message against a pre-built recipe bank. 18 recipes cover the most common requests:

| Recipe | Keywords |
|---|---|
| Wall Avoider | wall, obstacle, avoid, sonar, stuck, distance, crash |
| Line Follower | line, track, follow, strip, ir, infrared, rail, course |
| Light Runner | light, bright, glow, lamp, dark, photoresist, sun, ldr |
| Zigzag Bot | zigzag, zig, zag, weave, slalom, snake |
| Sentry Bot | sentry, guard, patrol, motion, intruder, pir, watch |
| Heat Seeker | heat, warm, temperature, hot, cold, forge, thermal, temp |
| Square | square, box, rectangle, loop, circuit |
| Sprint | fast, speed, sprint, dash, quick, rush |
| Spin | spin, rotate, circle, turn, 360, pirouette |
| Honk | honk, beep, buzz, sound, noise, alarm |
| Grab | grab, pick, hold, grip, arm, servo |
| Dodge Left | dodge, left, avoid left |
| Dodge Right | dodge, right, avoid right |
| *(+ 5 more)* | … |

---

## Bytecode reference

`TileCompiler.compile(program)` returns:

```js
{
  ok: true,
  bytecode: [ { op: 'SENSE', sensor: 'line_under' }, ... ],
  // or
  ok: false,
  error: 'Unknown sensor: "flux_capacitor"',
}
```

### Instruction set

| Op | Operands | Effect |
|---|---|---|
| `CONST` | `value` | Push literal onto stack |
| `SENSE` | `sensor` | Call `sensor.read(robot, world)`, push result |
| `CMP` | `cmp` (op string) | Pop a, b; push `a cmp b` as 0/1 |
| `NOT` | — | Pop a; push `!a` |
| `JZ` | `target` (PC) | Pop a; jump if a===0 |
| `JMP` | `target` (PC) | Unconditional jump |
| `ACT` | `action`, `params` | Call `actuator.exec(robot, params)` |
| `WAIT` | `seconds` | Set `waitRemaining`, yield tick |
| `LOOP` | `count`, `forever`, `end` | Push loop frame |
| `NEXT` | `head` (PC) | Counted: decrement + loop; Forever: loop + yield |
| `HALT` | — | Zero motors; terminate program |

The VM has a hard step budget of 4096 per tick to catch infinite loops that don't contain `WAIT` or `NEXT(forever)`.

---

## Firmware export

### Arduino C++

`FirmwareGen.toArduino(program)` generates a complete `.ino` sketch:

```cpp
// === SCRAPCRAFT EXPORT (Arduino) ===
// Program: Wall Avoider
// Generated by Scrapcraft Maker Lab

#define TRIG_PIN 5
#define ECHO_PIN 18
#define MOTOR_L1 25
#define MOTOR_L2 26
#define MOTOR_R1 32
#define MOTOR_R2 33

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(MOTOR_L1, OUTPUT); /* ... */
}

void loop() {
  float distance = readUltrasonic();
  if (distance < 0.3) {
    setMotors(-0.8, 0.8);   // turn right
    delay(500);
  } else {
    setMotors(0.6, 0.6);    // drive forward
  }
}
```

### MicroPython

`FirmwareGen.toMicroPython(program)` generates a `.py` script for ESP32/Pico:

```python
# === SCRAPCRAFT EXPORT (MicroPython) ===
from machine import Pin, PWM, ADC
import time

TRIG = Pin(5, Pin.OUT)
ECHO = Pin(18, Pin.IN)

def read_distance():
    # ... HC-SR04 pulse
    pass

while True:
    d = read_distance()
    if d < 0.3:
        set_motors(-0.8, 0.8)
        time.sleep(0.5)
    else:
        set_motors(0.6, 0.6)
```

### Wokwi

`FirmwareGen.toWokwi(program)` generates a JSON package for browser simulation at [wokwi.com](https://wokwi.com). The package contains:

- `diagram.json` — component placement (MCU, sensors, motors, wires)
- `sketch.ino` — the Arduino firmware
- `libraries.txt` — required libraries

Paste into a new Wokwi project and click Run. Your game bot runs in the browser circuit simulator.

---

## Brain sharing

Click **Share 🔗** in the Tile Editor. This:

1. Calls `TileProgram.toShareCode()` → `JSON.stringify(nodes)` → `btoa()` (base64).
2. Copies `?brain=<base64>` URL to clipboard.
3. Awards the **Shareable Science** achievement.

Anyone who opens the URL will have the program pre-loaded into their Tile Editor. Useful for:

- Teachers distributing example programs to a class.
- Sharing race-optimized programs.
- Debugging with a friend.

The URL parameter is read at startup in `Game.init()` and passed to `TileEditor.loadProgram()`.

---

## The compile() safety rail

This is the most important invariant in the Maker Lab:

```
AI output (JSON) ──→ compile() ──→ validate against primitives.js ──→ bytecode
                                         │
                                   reject if any sensor/actuator
                                   name is not in the schema
```

Spark (the AI) emits programs using the `emit_tiles` tool. The tool schema is derived from `primitives.js`, so Spark can only name sensors and actuators that actually exist. Even so, `compile()` validates every node before execution — the AI literally cannot invent a sensor. The worst it can do is produce a validation error, which is surfaced to the player, not run.

This is why `MakerRuntime`'s constructor calls `compile()` even if `TileEditor` already called it. It's not redundant — it's the safety rail for any code path that might call `setBrain()` without going through the editor.

---

## Test suite

```bash
npm test
```

36 tests, no external dependencies, no browser required. All tests live in `src/maker/__tests__/run-tests.mjs`.

| Section | Count | What it tests |
|---|---|---|
| Compiler | 6 | Compile, HALT, AI safety rail ×2, macro expansion ×2 |
| VM wait | 2 | WAIT timer; HALT cuts motors |
| VM forever | 2 | One pass per tick; never halts |
| VM counted loop | 2 | 3 beeps in one tick; halts cleanly |
| VM conditionals | 3 | Clear path / wall path / digital sensor |
| VirtualRobot | 3 | Drive distance, turn angle, wall collision |
| End-to-end | 2 | Wall-avoider stays shy of walls; turns |
| FirmwareGen | 6 | Arduino loop/helpers/motor/pins; MicroPython while/brightness |
| Line follower | 2 | line_under drives forward; turns on miss |
| Presets | 4 | All four presets compile and run without error |
| SparkOffline | 4 | keyword matching returns correct recipes |

Always add a test when changing the engine. The count goes up, never down.
