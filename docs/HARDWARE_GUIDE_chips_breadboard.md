# Hardware Guide — The Six Inference Chips on a Real Breadboard

*Canon: `ai-writings/papers/223-inference-chips.md`. Code reference:
`src/maker/primitives.js` (the six agentic actuators) and
`src/maker/FirmwareGen.js` (`ARDUINO_HELPERS` + `collectPins`). Every pin
number below is a pin constant the codegen actually emits — if the code and
this guide ever disagree, the code is right and this guide is stale.*

**Board baseline:** the emitted pin constants are ESP32 GPIO numbers
(25/26/27/14, 17/16, 21/22, 34/35), so the default brain for chip builds is
the **Spark Brain (ESP32 devkit, ~$4–6)**. WITNESS also runs happily on a Tin
Brain (Arduino Uno) because it touches no external pins. All six sketches in
`tools/wokwi/chips/` are verbatim `toArduino()` output — copy the emitted
functions, never rewrite them.

## Chip → pin map (verbatim from the codegen)

| Chip | Tile | Emitted pin constants | Peripheral |
|---|---|---|---|
| ECHO | remember_path | `IN1=25, IN2=26, ENA=27, ENB=14` | L298N motor driver (path ring buffer lives in SRAM) |
| SENTRY | watch_obstacle | `TRIG_PIN=5, ECHO_PIN=18, ENA=27, ENB=14` | HC-SR04 ultrasonic + motor park pins |
| RUMOR | hear_share | `TX=17, RX=16` (`Serial1` @ 9600, routed `SERIAL_8N1, 16, 17`) | HC-05 Bluetooth UART |
| WITNESS | log_tick | *internal* — EEPROM addresses 0–3 (`steps/laps/bumps/charges`) | on-chip EEPROM via `EEPROM.h` |
| PILOT | seek_line | `IR_L=34, IR_R=35, IN1=25, IN2=26, ENA=27, ENB=14` | 2× TCRT5000 IR reflective + L298N |
| EMBER | keep_warm | `SDA=21, SCL=22, IN1=25, IN2=26, ENA=27, ENB=14, LED_R=14, LED_G=12, LED_B=33` | INA219 I²C battery sense + red LED |

---

## ECHO — remember-path (replay the road behind)

**What the chip does:** `echoRecord(drivePwm, turnPwm)` pushes motor orders
into a 64-step ring buffer; `echoReplay()` plays them back, 500 ms per step,
then stops.

**Pin map**

| Constant | Pin | Goes to |
|---|---|---|
| `IN1` | GPIO 25 | L298N IN1 (left motor direction) |
| `IN2` | GPIO 26 | L298N IN2 |
| `ENA` | GPIO 27 | L298N ENA (left motor PWM) |
| `ENB` | GPIO 14 | L298N ENB (right motor PWM) |

**Parts list (~$8 without board)**
- L298N motor driver module (~$2)
- 2× TT gear motors with wheels (~$3/pair)
- 2-cell 18650 or 4×AA battery pack (~$3)
- Jumper wires, breadboard

**Wiring, in plain language.** Battery pack + to the L298N's 12 V screw
terminal, battery − to L298N GND **and** to an ESP32 GND (grounds must be
shared or the signals mean nothing). ESP32 pin 27 to ENA, 25 to IN1, 26 to
IN2, 14 to ENB. Left motor wires to OUT1/OUT2, right motor to OUT3/OUT4.
Leave the ENA/ENB jumpers **off** — the code PWMs those pins directly.

**Current draw.** ESP32 ~160 mA average; L298N logic ~36 mA; TT motors
~150–300 mA each running, ~1.2 A stall each. Budget 1.5 A peaks from the
battery rail. Never power the motors from the ESP32's 3V3 pin.

**Cracked ECHO (±15% mumble).** A cracked chip scales `delay()` values by its
seeded jitter (0.85×–1.15×). On the breadboard: each replayed step lasts
425–575 ms instead of 500 ms, so the replayed path *drifts* — same motor
orders, wrong cadence. The robot traces a recognizably similar but
wrong-timed route. The sketch header carries the `⚠ cracked ECHO chip`
canon note with the seed.

---

## SENTRY — watch-obstacle (the yard ahead)

**What the chip does:** pings the HC-SR04 every tile tick; if the distance
drops under `trip` it latches and parks the motors (ENA/ENB → 0); it only
releases when distance climbs past `clear`. Hysteresis, not flapping.

**Pin map**

| Constant | Pin | Goes to |
|---|---|---|
| `TRIG_PIN` | GPIO 5 | HC-SR04 TRIG |
| `ECHO_PIN` | GPIO 18 | HC-SR04 ECHO ⚠ through a divider (below) |
| `ENA` | GPIO 27 | L298N ENA (parked LOW on trip) |
| `ENB` | GPIO 14 | L298N ENB (parked LOW on trip) |

**Parts list (~$4 without board/motors)**
- HC-SR04 ultrasonic sensor (~$1.50)
- 2× resistors for the ECHO divider: 1 kΩ + 2 kΩ (~$0.05)
- L298N + motors as per ECHO (only if the bot drives)

**Wiring, in plain language.** HC-SR04 VCC to the 5 V pin, GND to GND, TRIG
straight to GPIO 5. The ECHO pin outputs **5 V** and the ESP32 is a 3.3 V
part: run ECHO through a 1 kΩ resistor to GPIO 18, and a 2 kΩ resistor from
GPIO 18 down to GND. That divider turns the 5 V click into a safe ~3.3 V.
Mount the sensor on the front bumper, round eyes forward.

**Current draw.** HC-SR04 ~15 mA while ranging. Everything else as per ECHO.

**Cracked SENTRY.** The mumble scales the wait *between* pings: a cracked
SENTRY re-checks the yard every 0.85–1.15 s instead of every 1 s. A
slow-mumbling chip (1.15×) reacts late to a fast-approaching obstacle — the
hysteresis still holds once tripped, but the trip itself arrives on the
chip's own crooked schedule.

---

## RUMOR — hear-share (the gallery wall)

**What the chip does:** `rumorShare(f)` writes exactly one fact byte
(`ore=1, rain=2, bot=3, earl=4`) to `Serial1` and reads one byte back if a
neighbor sent one. One fact per tick — that's the whole protocol.

**Pin map**

| Constant | Pin | Goes to |
|---|---|---|
| `TX` | GPIO 17 | HC-05 RXD |
| `RX` | GPIO 16 | HC-05 TXD ⚠ 3.3 V logic check (below) |

**Parts list (~$4 per bot)**
- HC-05 Bluetooth module **on a breakout board with a level shifter**, or a
  bare HC-05 plus 1 kΩ/2 kΩ divider for its RXD (~$3.50)
- A second bot (or a phone running a Bluetooth serial terminal) to hear the
  rumor

**Wiring, in plain language.** HC-05 VCC to 5 V (the breakout regulates to
3.3 V internally), GND to GND. ESP32 GPIO 17 (TX) to the HC-05's RXD —
through the divider if your breakout has no level shifter. HC-05 TXD to ESP32
GPIO 16 (RX) directly; 3.3 V logic into the ESP32 is fine. The codegen routes
`Serial1` to pins 16/17 explicitly (`Serial1.begin(9600, SERIAL_8N1, 16, 17)`)
because the ESP32's default UART1 pins are strapped to the flash chip —
don't "simplify" that line away. Pair two HC-05s (one as master,
`AT+ROLE=1`, bind with `AT+BIND=`), or pair one to a phone.

**Current draw.** HC-05 ~30–40 mA paired, ~8 mA idle listening.

**Cracked RUMOR.** Facts still arrive intact — the byte is the byte — but a
cracked chip *speaks* on its jittered cadence (0.85–1.15 s between shares).
Two cracked bots develop an erratic gossip rhythm: bursts, then silence. In
the Wokwi project the TX/RX pins are looped back (17 → 16) so the bot hears
its own rumor; Wokwi cannot simulate Bluetooth.

---

## WITNESS — log-tick (the journal)

**What the chip does:** `witnessTick(addr)` reads one EEPROM byte, increments
it (capped at 255), and writes it back **only if changed** — `EEPROM.update`,
not `EEPROM.put`. That choice is deliberate: an EEPROM cell is rated for
~100,000 writes, and `update` skips no-op writes. One address per milestone:
`steps=0, laps=1, bumps=2, charges=3`.

**Pin map**

| Constant | Pin | Goes to |
|---|---|---|
| — | internal | EEPROM cells 0–3, no external parts, no wires |

**Parts list (~$0).** Nothing. The journal is *inside* the chip. This is the
one chip you can run on a bare Tin Brain (Arduino Uno) with zero wiring —
the Wokwi project is a lone Uno.

**Current draw.** Negligible (microamps during the write itself).

**Cracked WITNESS.** The counts are always exact — EEPROM doesn't mumble.
What jitters is *when the page gets written*: a cracked WITNESS logs its
milestone every 0.85–1.15 s. Power the bot off, power it on, and the ledger
survives — but its timestamps (if you correlate them) show the crooked
cadence. A 1.15× chip simply writes fewer pages per hour.

---

## PILOT — seek-line (the track)

**What the chip does:** `pilotSeek(kp, base)` reads the two IR sensors,
computes `err = right − left`, and steers proportionally — more error, more
correction. Put the tile inside `forever{}`: the loop IS the control loop.

**Pin map**

| Constant | Pin | Goes to |
|---|---|---|
| `IR_L` | GPIO 34 | left TCRT5000 analog out (AO) |
| `IR_R` | GPIO 35 | right TCRT5000 analog out (AO) |
| `IN1` / `IN2` | GPIO 25 / 26 | L298N IN1 / IN2 |
| `ENA` / `ENB` | GPIO 27 / 14 | L298N ENA / ENB |

GPIO 34/35 are input-only ADC1 pins — perfect for analog sensors, and they
match the MicroPython target (`ADC(Pin(34))` / `ADC(Pin(35))`), so both
exports read the same pads.

**Parts list (~$6 without board)**
- 2× TCRT5000 IR reflective modules (~$0.80 each). The codegen reads the
  *analog* pair; a 5-channel line-follow array works too — wire any two
  adjacent outer channels to 34/35 and leave the rest unconnected at v0.
- L298N + motors as per ECHO
- Black electrical tape on pale floor = the track

**Wiring, in plain language.** Each TCRT5000 module: VCC to 3V3, GND to GND,
AO (analog out) to GPIO 34 (left) / GPIO 35 (right). Leave the DO pins
unconnected. Mount both modules under the front bumper, 1–2 cm apart,
straddling the tape line, 5–10 mm above the floor. Motors as per ECHO.

**Current draw.** ~20 mA per TCRT5000 (the IR LED dominates). Rest as per ECHO.

**Cracked PILOT.** The control loop *period* mumbles: corrections land every
0.85–1.15 s instead of every 1 s. A slow-mumbling PILOT weaves — it corrects
late, overshoots, corrects late again. Still homed on the line, just seasick.

---

## EMBER — keep-warm (its own heat)

**What the chip does:** `emberGuard(floorPct)` reads the battery through an
INA219 over I²C; below the floor it parks the motors and flashes the red LED
six times, then checks again. The bot would rather shiver in place than go
cold in the field.

**Pin map**

| Constant | Pin | Goes to |
|---|---|---|
| `SDA` | GPIO 21 | INA219 SDA |
| `SCL` | GPIO 22 | INA219 SCL |
| `LED_R` | GPIO 14 | red LED anode (through 220 Ω) |
| `ENA` / `ENB` | GPIO 27 / 14 | L298N ENA / ENB (parked on trip) |
| `IN1` / `IN2` | GPIO 25 / 26 | L298N IN1 / IN2 |

**Known collision (inherited, documented not hidden):** the emitted constants
put both `LED_R` and `ENB` on GPIO 14 — inherited from the base pin table
(`led` R=14, `ENB=14` in `collectPins`). It's survivable because EMBER parks
*before* flashing, and with IN1=IN2=LOW the L298N brakes regardless of ENB —
so the flash just pulses the enable line of a braked motor. Still: if your
EMBER build has motors, wire the status LED to GPIO 12 (the emitted `LED_G`)
and leave 14 to ENB, or accept the pulse. Untangling 14 in the codegen is a
code commit, not a doc fix.

**Parts list (~$3 without board/motors)**
- INA219 breakout (~$1.50). *Note: the lane brief suggested an LDR as a cheap
  heat proxy — the codegen doesn't emit LDR code for EMBER, it emits INA219
  I²C. This guide follows the code. An LDR-based heat sensor would be a
  codegen change (its own commit), not a wiring variation.*
- Red LED + 220 Ω resistor
- L298N + motors as per ECHO (if the bot drives)

**Wiring, in plain language.** INA219: VCC to 3V3, GND to GND, SDA to GPIO
21, SCL to GPIO 22. The INA219 sits *in series with the battery*: battery +
to VIN+, VIN− to the L298N's 12 V input, so all motor current flows through
its sense resistor. LED: GPIO 14 → 220 Ω resistor → LED anode (long leg),
LED cathode to GND.

**Current draw.** INA219 ~1 mA. LED ~10 mA when lit. The guard itself *saves*
the battery it's watching.

**Cracked EMBER.** The health check runs on the jittered cadence — a
slow-mumbling EMBER notices a dying battery up to 15% late, and the six
park-flashes stretch from 150 ms to ~128–173 ms each: the distress blink has
a visibly wrong rhythm. That's the canon: the chip feels the cold on its own
crooked clock.

---

## What stayed a seam

- **Wokwi can't simulate Bluetooth.** The RUMOR project loops GPIO 17 back to
  16 so `rumorShare` hears its own byte. Real bot-to-bot rumors need two
  HC-05s (or one + a phone). The rx side in-game is the same seam
  (`heardRumor` on the robot) noted in the dev guide.
- **Wokwi has no INA219 or TCRT5000 part.** EMBER's sim compiles against the
  real `Adafruit INA219` library (`libraries.txt`) but with no sensor on the
  bus the read returns empty → the guard trips → you get the park-and-flash
  demo. PILOT's sim uses two photoresistor modules as analog stand-ins for
  the IR pair.
- **Jitter rides WAIT tiles only.** A cracked chip scales the emitted
  `delay()` of wait tiles, but the cadence *inside* helpers (ECHO's 500 ms
  step, EMBER's 150 ms flash) is hard-coded in the template. Documented in
  the dev guide; unchanged here.
- **`LED_R=14` collides with `ENB=14`** in the emitted constants (see EMBER).
- **L298N 12 V rail in Wokwi** is wired to the devkit's 5 V pin just to give
  the sim a live net. On the real breadboard, motor power comes from the
  battery pack, never from the devkit.

## src check — how this guide was verified against the codegen

Pins were read from `primitives.js` `hw.pin`/`hw.setup` and
`FirmwareGen.js` `ARDUINO_HELPERS`/`collectPins`, and the six sketches in
`tools/wokwi/chips/` are literal `toArduino()` output for a one-tile program
per chip (a `TileProgram` of `T.forever([T.action(tile, params), T.wait(1)])`
with its chip descriptor mounted — the same fixture shape as
`src/maker/__tests__/chips-tests.mjs`).
Three places where the emitted code did *not* match its own `hw` metadata
were fixed in code (commit `chip-hw: fix emitted pins…`), not papered over
in this doc:

1. `watch_obstacle` — `sentryWatch()` parks via `ENA`/`ENB`, but
   `collectPins` emitted no `ENA`/`ENB` defines → standalone SENTRY export
   didn't compile. Fixed: SENTRY now emits `ENA=27, ENB=14`.
2. `keep_warm` — `emberGuard()` calls `ina219.getBusVoltage_V()` with no
   `#include` and no object → standalone EMBER export didn't compile. Fixed:
   `arduinoIncludes: ['Adafruit_INA219.h']` + `Adafruit_INA219 ina219;`
   emitted with the helper.
3. `hear_share` — setup emitted bare `Serial1.begin(9600)`, which on ESP32
   lands UART1 on GPIO 9/10 (the flash pins), not the documented TX=17/RX=16.
   Fixed: `Serial1.begin(9600, SERIAL_8N1, 16, 17)`.
4. `seek_line` — the Arduino template read `analogRead(A2)-analogRead(A1)`,
   which on the ESP32 core resolves to GPIO 37/38 (not broken out on devkits)
   while the MicroPython target already used 34/35. Fixed: template now reads
   `analogRead(IR_R)-analogRead(IR_L)` with `IR_L=34, IR_R=35` emitted as
   defines — both targets now agree.

All 2294 maker tests pass after these fixes (`node src/maker/__tests__/run-tests.mjs`).
