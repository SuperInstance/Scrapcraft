# Dev Guide — Hardware Brains, Sensor/Actuator Items & Real-Hardware Export

**Goal:** make the three "brains" (Tin/Spark/Vision) and the sensors/actuators
into craftable progression, and ship the **Export to Real Hardware** bridge that
turns a kid's in-game robot into a flashable sketch + wiring diagram.

**Effort:** ~2.5 weeks total (brains+items ~1wk, vision ~1.5wk, export ~1wk).

**Read first:** `src/maker/primitives.js` (`BRAINS`, the `hw` mappings, the
`requiresBrain` gate) and `src/maker/FirmwareGen.js` (already produces real code).

---

## Part A — Brains as crafted progression

`primitives.js` already defines `BRAINS = { tin, spark, vision }` and each sensor/
actuator carries `hw.platform`. The progression gate (`requiresBrain` +
brain-tier check) is already enforced by the compiler. You wire it into crafting:

1. **Add items** to `src/data/items.js`: `tin_brain`, `spark_brain`,
   `vision_brain`, plus sensor/actuator parts (`ultrasonic`, `ldr`, `buzzer`,
   `servo`, `motor_driver`, `camera_module`). Witty descriptions, Earl-flavoured.
2. **Add recipes** to `src/data/recipes.js`, gated by band depth (Tin in band 0,
   Spark needs band-1/2 materials, Vision needs band-3 + circuit boards). Mirror
   the existing tier/`unlockAfter` pattern.
3. **The Maker Bench** — a new interactive station block (`B.MAKER_BENCH` in
   `blocks.js`, station id `'maker'`). Opening it (the existing `near_<station>`
   flow in `Game.js`) launches the tile editor instead of the crafting overlay.
4. **Install flow:** a robot's brain tier = the highest brain item the player has
   installed. Set `program.brain` accordingly; the compiler then unlocks the
   matching sensors/actuators. Lower brains literally can't compile Vision tiles
   (the compiler warns) — that IS the gate.

> Curriculum mapping (see `FUTURE_DEVELOPMENT.md`): Tin = "make it react",
> Spark = "make it decide/talk", Vision = "make it see". Bands already exist;
> this aligns each band's available parts to its topic.

## Part B — The Vision Brain (the unforgettable one)

The `sees_target` sensor is already stubbed in `primitives.js`
(`requiresBrain: 'vision'`) and backed by a facing-cone check in
`GameWorldAdapter.seesTarget()`. To make it sing:

- Add more vision sensors: `sees_color` (enum red/green/blue crate),
  `target_bearing` (analog: where in view, for centering), `target_distance`.
- Back them in `GameWorldAdapter` by scanning nearby blocks/entities in the
  facing cone (you already have `world.getBlock`/landmarks). Keep it cheap —
  one cone scan per tick.
- New actuators it pairs with: `grab` (exists) + `drive`/`turn` → a "fetch the
  red crate" behaviour becomes buildable. That demo ("I built an AI robot that
  finds things with a camera") is the screenshot that sells the game.
- On real hardware these map to an on-device detector; the firmware codegen
  already emits a `vision.sees("target")` MicroPython line as the honest analog.

## Part C — Export to Real Hardware

`FirmwareGen.toArduino(program)` and `toMicroPython(program)` already produce
correct, flashable code (verified by `npm test`). The export feature is UI +
packaging around them.

### C1 — Copy/Download buttons (½ day)
In the editor's `</>` code view, add **Copy** and **Download .ino / .py**. That's
`new Blob([toArduino(program)])` → object URL → `<a download>`. Done — a kid can
already paste this into the Arduino IDE.

### C2 — "Open in Wokwi" (1–2 days)
[Wokwi](https://wokwi.com) simulates ESP32/Arduino firmware in-browser. Two paths:
- **Simple:** generate the sketch + a `diagram.json` (Wokwi's wiring format) and
  let the user paste, OR
- **Slick:** Wokwi supports loading projects; generate a project payload and open
  `https://wokwi.com/projects/new/esp32` with the code prefilled where the API
  allows. Check current Wokwi project-sharing docs before committing to a method.

The `diagram.json` is buildable from the same `hw` metadata you already have:
each used primitive lists its peripheral + pins. Write a `toWokwiDiagram(program)`
next to the firmware generators that emits the parts list and wires from
`usedPrimitives()` + each def's `hw.pins`. (New function, ~150 lines, pure data.)

### C3 — Wiring diagram (2–3 days)
Generate an SVG breadboard: for each used primitive, place its part and draw a
labelled wire to the named pin (`IN1=25`, `TRIG_PIN=5`, …). The pin names already
come out of `collectPins()` in `FirmwareGen.js` — factor that into a shared
`pinMap(program)` helper both the firmware and the diagram consume. A kid with a
real ESP32 + the cheap parts can now physically build their game robot.

---

## Acceptance criteria

- Crafting a Spark Brain unlocks the ESP32-tier sensors in the editor; a Tin
  Brain robot can't compile a Vision tile (gets the friendly warning).
- A Vision robot can be told (via tiles or Spark) to find + grab the red crate.
- `</>` view → Download produces a `.ino` that compiles in the Arduino IDE and a
  `.py` that runs on a real ESP32 (spot-check one of each in Wokwi).
- "Open in Wokwi" lands on a simulation of the kid's exact robot.

## Why this is the business

This is the game→reality bridge almost no educational game delivers. A kid
designs a robot in the scrapyard, exports it, buys a $6 ESP32 + $3 motor, and
builds the real thing. That story is what sells site licenses to schools and
convinces parents. Keep the exported code **honest** (it must actually work on
hardware) — that honesty is the whole value proposition.
