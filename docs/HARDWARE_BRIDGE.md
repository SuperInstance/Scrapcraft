# The Hardware Bridge — From Scrapyard to Real Robots

> The moment Scrapcraft stops being a game and becomes a maker pipeline: a kid
> designs a phototropic honking rover in the scrapyard, exports it, buys a $5
> chip, and builds the real thing in their bedroom.

This doc covers the **hardware twin** (virtual Arduino Uno pin model), the
**browser flash paths**, which boards work, and the shopping list.

---

## The Hardware Twin (always on)

Every ScrapBot carries a **virtual Arduino Uno** (`src/maker/PinModel.js`).
Tile programs run against BOTH the physics sim AND the pin model — every tick:

- World sensors drive the input pins (A0..A2 analog, D2/D3 digital)
- The program's motor/LED/buzzer state drives the output pins
- The **📐 Wiring** button in the Tile Editor shows it live: pins light up,
  PWM duties change, D13 (the classic built-in LED) blinks

Real Uno semantics, because the mapping must be REAL:

| Thing | Behavior |
|---|---|
| Pins | 14 digital (D0–D13), 6 analog inputs (A0–A5) |
| `digitalWrite` | sticks on OUTPUT pins; on INPUT pins it's the documented pull-up trick (and the view says so) |
| `analogWrite` (PWM) | duty 0–255, **only on D3, D5, D6, D9, D10, D11** — anywhere else warns "this pin has no PWM!" (true on a real Uno) |
| `analogRead` | 10-bit, 0–1023 counts (~4.9mV/count) |
| D13 | built-in LED, glows in the wiring view |
| D0/D1 | reserved (USB serial) · A4/A5 reserved (I2C) |

### The wiring contract (`UNO_WIRING`)

| Sensor / actuator | Pin | Real part |
|---|---|---|
| distance_ahead | A0 | HC-SR04 ultrasonic |
| light | A1 | LDR photoresistor |
| temperature | A2 | NTC thermistor |
| line_under | D2 | TCRT5000 IR reflectance |
| motion_nearby | D3 | PIR module |
| Left motor dir / PWM | D4 / D5 | L298N channel A |
| Right motor dir / PWM | D7 / D6 | L298N channel B |
| Buzzer | D8 | piezo (tone) |
| Grabber servo | D9 | SG90 (PWM angle) |
| LED blue / green / red | D10 / D11 / D12 | RGB LED — **D12 can't dim** (no PWM), a real constraint the view teaches |
| Built-in LED | D13 | the blink pin |

Differential drive is real skid-steer math: `left = drive + turn`,
`right = drive − turn` — the same thing an L298N robot does.

---

## Flash paths (browser → real board)

### 1. MicroPython paste-mode — ESP32 / Pi Pico / Pico W ✅ best path

The **⚡ Flash to Device** button (Chrome/Edge) opens the port picker and
pushes the generated MicroPython straight onto the board via REPL paste mode
(Ctrl+E / Ctrl+D). No Arduino IDE, no esptool. The serial monitor shows
live `print()` output from the tile program.

### 2. AVR109 bootloader — Leonardo-class & STM32 ✅ new

The **🔥 Flash .hex** button speaks the AVR109 ("Butterfly") bootloader
protocol over Web Serial (`src/maker/Avr109Flasher.js` — the avrgirl-arduino /
Wokwi approach): identify → chip erase → paged block writes → leave-program &
reboot into the sketch. Feed it any `.hex` compiled from your exported `.ino`
(Arduino IDE: Sketch → Export Compiled Binary, or Wokwi's export).

| Board | Bootloader | Works? |
|---|---|---|
| Arduino Leonardo | Caterina | ✅ |
| Pro Micro / Micro 32u4 | Caterina | ✅ |
| Adafruit Metro 32u4 / Flora | Caterina variants | ✅ |
| STM32 "Blue Pill" (STM32duino bootloader) | AVR109 emulation | ✅ |
| ESP32 (MicroPython) | — | ✅ use path 1 |
| Pi Pico / Pico W | — | ✅ use path 1 (paste mode; UF2 also possible) |
| **Classic Uno / Nano (optiboot)** | **STK500v1, not AVR109** | ❌ not in v1 — use Wokwi, an ESP32, or a Leonardo |
| Metro M0/M4 / SAMD | UF2 | ❌ v2 (drag-and-drop UF2 is planned) |

### Graceful degradation is the contract

No board? Cable not plugged in? Cancelled the picker? Firefox/Safari?
**Nothing breaks.** Every flash failure returns a friendly one-liner —
*"No device connected — keep simulating!"* — and the simulator keeps running
the exact same program. The hardware is an upgrade, never a requirement.

---

## The $5 shopping list (one real robot)

| Part | ~Price | Maps to |
|---|---|---|
| ESP32 DevKit-C clone (MicroPython) | $4–6 | Spark Brain |
| Micro gear motor ×2 + wheels | $3–4 | drive/turn |
| L298N mini motor driver | $1.50 | D4–D7 |
| HC-SR04 ultrasonic | $1 | A0 distance_ahead |
| LDR photoresistor | $0.20 | A1 light |
| TCRT5000 IR line sensor | $1 | D2 line_under |
| Piezo buzzer | $0.30 | D8 beep |
| RGB LED + resistors | $0.30 | D10–D12 led |
| SG90 servo | $2 | D9 grab |
| Breadboard + jumpers + USB cable | $3 | wiring |

A no-frills version (ESP32 + 1 motor + LDR + LED + piezo) is genuinely **~$5**.
Everything the tile editor teaches — sensors → logic → actuators — runs on it
via the MicroPython export + paste-mode flash.

---

## Teacher notes

- The wiring view is curriculum gold: pins, PWM duty, INPUT vs OUTPUT, and the
  Uno's real limitations (only 6 PWM pins; D13 can't dim) show up as the
  program runs.
- Wokwi export (🔌 button) remains the zero-hardware bridge: the same program
  as a browser firmware simulation, no purchase at all.
- Achievement `hardware_flash` fires on the first successful flash either path.
