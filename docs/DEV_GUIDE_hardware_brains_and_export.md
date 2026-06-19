# Dev Guide — Hardware Brains, Sensor/Actuator Items & Real-Hardware Export

**Goal:** make the three "brains" (Tin/Spark/Vision) and the sensors/actuators
into craftable progression, and ship the **Export to Real Hardware** bridge that
turns a kid's in-game robot into a flashable sketch + wiring diagram.

**Effort:** ~2.5 weeks total (brains+items ~1 wk, vision ~1.5 wk, export ~1 wk).

**Read first:** `src/maker/primitives.js` (`BRAINS`, the `hw` mappings, the
`requiresBrain` gate) and `src/maker/FirmwareGen.js` (already produces real code).

---

## Part A — Brains as craftable progression

`primitives.js` already defines `BRAINS = { tin, spark, vision }` and each
sensor/actuator carries `hw.platform`. The progression gate (`requiresBrain` +
brain-tier check) is enforced by the compiler. Wire it into crafting:

### A1 — New items (`src/data/items.js`)

Add below the existing items:

```js
// ── Maker Lab brains ──
tin_brain: {
  name: 'Tin Brain',
  icon: '🧠',
  desc: "A humble ATmega with dreams above its station. Runs your tiles. Don't underestimate it.",
  category: 'maker',
  stackSize: 1,
  tier: 1,
},
spark_brain: {
  name: 'Spark Brain',
  icon: '⚡',
  desc: 'An ESP32, the workhorse of the IoT revolution. WiFi, Bluetooth, 240MHz of ambition.',
  category: 'maker',
  stackSize: 1,
  tier: 2,
},
vision_brain: {
  name: 'Vision Brain',
  icon: '👁️',
  desc: 'A Jetson Nano that can actually see. Paired with a camera. Earl is suspicious of it.',
  category: 'maker',
  stackSize: 1,
  tier: 3,
},

// ── Sensor/actuator modules ──
ultrasonic_module: {
  name: 'Ultrasonic Sensor',
  icon: '📡',
  desc: 'HC-SR04. Pings walls and tells you how close you are to disaster.',
  category: 'maker',
  stackSize: 4,
},
ldr_module: {
  name: 'Light Sensor',
  icon: '☀️',
  desc: 'An LDR. Figures out if the lights are on. Metaphorically applicable.',
  category: 'maker',
  stackSize: 4,
},
pir_module: {
  name: 'Motion Sensor',
  icon: '👀',
  desc: 'PIR sensor. Detects humans. Mildly creepy but useful.',
  category: 'maker',
  stackSize: 4,
},
buzzer_module: {
  name: 'Piezo Buzzer',
  icon: '🔔',
  desc: 'Makes noise. Annoying noise. Which is sometimes exactly what you need.',
  category: 'maker',
  stackSize: 4,
},
servo_module: {
  name: 'Servo Motor (SG90)',
  icon: '🦾',
  desc: 'For the grab arm. 180° of reach, one tab of plastic, infinite satisfaction.',
  category: 'maker',
  stackSize: 2,
},
motor_driver: {
  name: 'Motor Driver (L298N)',
  icon: '⚙️',
  desc: 'Bridges the gap between "delicate electronics" and "screaming motors".',
  category: 'maker',
  stackSize: 2,
},
camera_module: {
  name: 'Camera Module',
  icon: '📷',
  desc: 'CSI ribbon cable + lens. Makes the Vision Brain actually see. Treat it gently.',
  category: 'maker',
  stackSize: 1,
},
```

### A2 — New recipes (`src/data/recipes.js`)

```js
// Tier 1 — Tin Brain: band 0 materials
{
  id: 'tin_brain',
  result: 'tin_brain',
  count: 1,
  station: 'workbench',
  tier: 1,
  ingredients: [
    { item: 'circuit_board', count: 2 },
    { item: 'copper_wire',   count: 4 },
    { item: 'iron_scrap',    count: 3 },
  ],
  desc: 'Basic microcontroller brain. Runs your first tile programs.',
},

// Tier 1 — sensor/actuator items (any workbench)
{
  id: 'ultrasonic_module',
  result: 'ultrasonic_module', count: 1, station: 'workbench', tier: 1,
  ingredients: [{ item: 'circuit_board', count: 1 }, { item: 'copper_wire', count: 2 }],
},
{
  id: 'ldr_module',
  result: 'ldr_module', count: 2, station: 'workbench', tier: 1,
  ingredients: [{ item: 'circuit_board', count: 1 }, { item: 'copper_wire', count: 1 }],
},
{
  id: 'buzzer_module',
  result: 'buzzer_module', count: 2, station: 'workbench', tier: 1,
  ingredients: [{ item: 'gear_small', count: 1 }, { item: 'copper_wire', count: 1 }],
},
{
  id: 'motor_driver',
  result: 'motor_driver', count: 1, station: 'workbench', tier: 1,
  ingredients: [{ item: 'circuit_board', count: 1 }, { item: 'iron_scrap', count: 2 }],
},

// Tier 2 — Spark Brain: requires band-2 materials
{
  id: 'spark_brain',
  result: 'spark_brain', count: 1, station: 'smelter', tier: 2,
  unlockAfter: 'tin_brain',
  ingredients: [
    { item: 'tin_brain',     count: 1 },
    { item: 'circuit_board', count: 3 },
    { item: 'copper_wire',   count: 6 },
    { item: 'fuel_can',      count: 1 },
  ],
  desc: 'ESP32 brain. WiFi, more sensors, arm actuator unlocked.',
},
{
  id: 'pir_module',
  result: 'pir_module', count: 1, station: 'workbench', tier: 2,
  unlockAfter: 'spark_brain',
  ingredients: [{ item: 'circuit_board', count: 1 }, { item: 'rubber_chunk', count: 1 }],
},
{
  id: 'servo_module',
  result: 'servo_module', count: 1, station: 'workbench', tier: 2,
  unlockAfter: 'spark_brain',
  ingredients: [{ item: 'gear_small', count: 2 }, { item: 'copper_wire', count: 2 }],
},

// Tier 3 — Vision Brain: requires band-3 materials
{
  id: 'vision_brain',
  result: 'vision_brain', count: 1, station: 'smelter', tier: 3,
  unlockAfter: 'spark_brain',
  ingredients: [
    { item: 'spark_brain',   count: 1 },
    { item: 'circuit_board', count: 5 },
    { item: 'glass_shard',   count: 3 },
    { item: 'fuel_can',      count: 2 },
  ],
  desc: 'Jetson Nano brain. Computer vision sensors unlocked. Earl thinks it watches him.',
},
{
  id: 'camera_module',
  result: 'camera_module', count: 1, station: 'workbench', tier: 3,
  unlockAfter: 'vision_brain',
  ingredients: [{ item: 'glass_shard', count: 2 }, { item: 'circuit_board', count: 2 }],
},
```

### A3 — Maker Bench station block

Add to `src/data/blocks.js` (or wherever block definitions live):

```js
MAKER_BENCH: {
  id: 36,
  name: 'Maker Bench',
  label: '🔧 Maker Bench',
  color: 0x2244AA,
  emissive: 0x001133,
  hardness: 4,
  station: 'maker',   // triggers tile editor instead of crafting overlay
},
```

Recipe to craft it:

```js
{
  id: 'maker_bench',
  result: 'maker_bench', count: 1, station: 'workbench', tier: 2,
  unlockAfter: 'tin_brain',
  ingredients: [
    { item: 'wood_plank',    count: 4 },
    { item: 'iron_scrap',    count: 4 },
    { item: 'circuit_board', count: 1 },
  ],
},
```

### A4 — Brain tier = highest brain item crafted

When the player crafts a brain item, update their active brain tier. Add to
`Game.js` (in whatever handles craft-result logic):

```js
const BRAIN_ITEMS = ['vision_brain', 'spark_brain', 'tin_brain']; // priority order
function getPlayerBrainTier(inventory) {
  for (const id of BRAIN_ITEMS) {
    if (inventory.count(id) > 0) return id.replace('_brain', '');
  }
  return null;  // no brain crafted yet
}
// Then pass this tier as TileProgram.brain when opening the editor.
```

---

## Part B — The Vision Brain (the unforgettable sensor)

`sees_target` is already in `primitives.js` with `requiresBrain: 'vision'`. The
Vision Brain tier unlocks two more sensor classes:

### B1 — Add to `primitives.js` → SENSORS

```js
sees_color: {
  id: 'sees_color',
  category: 'sense',
  kind: 'digital',
  label: 'sees a coloured crate',
  blurb: 'camera detects a red/green/blue crate in view (Vision Brain only)',
  requiresBrain: 'vision',
  params: {
    color: { type: 'enum', values: ['red', 'green', 'blue'], default: 'red' },
  },
  read: (robot, world, params) => world.seesColor?.(robot.x, robot.z, robot.heading, params?.color) ?? false,
  hw: {
    platform: ['jetson'],
    peripheral: 'CSI camera + colour detector',
    pin: 'CSI-0',
    setup: { micropython: '# detector = ColourDetector("scrap.onnx")' },
  },
  firmware: { micropython: (p) => `vision.sees_color("${p?.color ?? 'red'}")` },
},

target_bearing: {
  id: 'target_bearing',
  category: 'sense',
  kind: 'analog',
  label: 'target bearing',
  blurb: 'how far left/right the target is in view (−1 = far left, +1 = far right)',
  requiresBrain: 'vision',
  read: (robot, world) => world.targetBearing?.(robot.x, robot.z, robot.heading) ?? 0,
  hw: { platform: ['jetson'], peripheral: 'CSI camera', pin: 'CSI-0', setup: {} },
  firmware: { micropython: () => 'vision.target_bearing()' },
},

target_distance: {
  id: 'target_distance',
  category: 'sense',
  kind: 'analog',
  label: 'target distance',
  blurb: 'how far away the target is (0 = right here, 1 = far away)',
  requiresBrain: 'vision',
  read: (robot, world) => world.targetDistance?.(robot.x, robot.z, robot.heading) ?? 1,
  hw: { platform: ['jetson'], peripheral: 'CSI camera (depth estimate)', pin: 'CSI-0', setup: {} },
  firmware: { micropython: () => 'vision.target_distance()' },
},
```

### B2 — Back in `GameWorldAdapter`

```js
// 30° cone, within SONAR_RANGE blocks
seesColor(x, z, heading, color) {
  const CONE = Math.PI / 6;   // 30°
  // scan nearby blocks in the facing cone
  for (const [bx, bz, blockId] of this._conescan(x, z, heading)) {
    if (COLOUR_BLOCK_IDS[color]?.includes(blockId)) return true;
  }
  return false;
}

targetBearing(x, z, heading) {
  for (const [bx, bz] of this._conescan(x, z, heading)) {
    const dx = bx - x, dz = bz - z;
    const angle = Math.atan2(dx, dz) - heading;
    return Math.sin(angle);  // −1..+1
  }
  return 0;
}

targetDistance(x, z, heading) {
  for (const [bx, bz] of this._conescan(x, z, heading)) {
    return Math.hypot(bx - x, bz - z) / SONAR_RANGE;
  }
  return 1;
}

// helper: yield [bx, bz, blockId] within cone, closest first
*_conescan(x, z, heading, range = SONAR_RANGE, halfCone = Math.PI / 6) {
  for (let r = 1; r <= range; r++) {
    for (let a = -halfCone; a <= halfCone; a += 0.15) {
      const bx = Math.round(x + r * Math.sin(heading + a));
      const bz = Math.round(z + r * Math.cos(heading + a));
      const id = this.world.getBlock?.(bx, 1, bz);
      if (id) yield [bx, bz, id];
    }
  }
}
```

`COLOUR_BLOCK_IDS` maps colour names to the block types that count:

```js
const COLOUR_BLOCK_IDS = {
  red:   [B.IRON_SCRAP, B.RUST_PILE],
  green: [B.CIRCUIT_NODE, B.SMELTER],
  blue:  [B.COPPER_VEIN, B.MAKER_BENCH],
};
```

---

## Part C — Export to Real Hardware

`FirmwareGen.toArduino(program)` and `toMicroPython(program)` already produce
correct, flashable code (verified by `npm test`). The export feature is UI + packaging.

### C1 — Copy / Download buttons (½ day)

Already specified in `DEV_GUIDE_tile_editor.md` — the `_download()` method on
`TileEditor` creates a `Blob` and triggers a download. Summary:

```js
const blob = new Blob([toArduino(program)], { type: 'text/plain' });
const url  = URL.createObjectURL(blob);
const a    = Object.assign(document.createElement('a'), { href: url, download: 'robot.ino' });
a.click();
URL.revokeObjectURL(url);
```

### C2 — Wokwi diagram generation

`toWokwiDiagram(program)` emits a `diagram.json` in Wokwi's project format.
Add this function to `src/maker/FirmwareGen.js`:

```js
/**
 * Generate a Wokwi diagram.json for the used primitives.
 * The kid can paste this + the sketch into wokwi.com to simulate their robot.
 *
 * Wokwi diagram format (simplified):
 *   { "version": 1, "parts": [...], "connections": [...] }
 *
 * Each part: { "type": "<wokwi-part-id>", "id": "<unique>", "attrs": {...} }
 * Each connection: ["<part1>:<pin>", "<part2>:<pin>", "color", []]
 */
export function toWokwiDiagram(program) {
  const used = program.usedPrimitives();
  const parts = [];
  const connections = [];

  // Always include the MCU
  const chip = BRAINS[program.brain]?.platform ?? 'esp32';
  const mcuType = chip === 'uno' ? 'wokwi-arduino-uno' : 'wokwi-esp32-devkit-v1';
  const mcuId = 'mcu1';
  parts.push({ type: mcuType, id: mcuId, top: 0, left: 0, attrs: {} });

  // Wire colour by peripheral category
  const COL = { power: 'red', ground: 'black', signal: 'green', pwm: 'yellow' };

  for (const id of [...used.actuators, ...used.sensors]) {
    const def = getActuator(id) ?? getSensor(id);
    const hw  = def?.hw;
    if (!hw) continue;

    const partSpec = WOKWI_PARTS[id];
    if (!partSpec) continue;

    const partId = id + '1';
    parts.push({ type: partSpec.type, id: partId, top: partSpec.top ?? 100, left: partSpec.left ?? 200, attrs: partSpec.attrs ?? {} });

    // Generate connections from the hw.pins / hw.pin metadata
    const pins = pinPairs(def);
    for (const { mcuPin, devPin, color } of pins) {
      connections.push([`${mcuId}:${mcuPin}`, `${partId}:${devPin}`, color, []]);
    }
    // VCC / GND
    connections.push([`${mcuId}:3.3V`, `${partId}:VCC`, COL.power, []]);
    connections.push([`${mcuId}:GND.1`, `${partId}:GND`, COL.ground, []]);
  }

  return JSON.stringify({ version: 1, author: 'Scrapcraft Maker Lab', parts, connections }, null, 2);
}

// Wokwi part types for each primitive
const WOKWI_PARTS = {
  distance_ahead: { type: 'wokwi-hc-sr04',      top:  80, left: 300 },
  bumped:         { type: 'wokwi-pushbutton',     top: 160, left: 300 },
  brightness:     { type: 'wokwi-photoresistor-sensor', top: 240, left: 300 },
  is_dark:        { type: 'wokwi-photoresistor-sensor', top: 240, left: 300 },
  player_near:    { type: 'wokwi-pir-motion-sensor', top: 320, left: 300 },
  beep:           { type: 'wokwi-buzzer',         top:  80, left: 500 },
  led:            { type: 'wokwi-rgb-led',         top: 160, left: 500 },
  drive:          { type: 'wokwi-l298n',           top: 240, left: 500 },
  turn:           { type: 'wokwi-l298n',           top: 240, left: 500 },  // same module
  stop:           { type: 'wokwi-l298n',           top: 240, left: 500 },
  grab:           { type: 'wokwi-servo',           top: 320, left: 500 },
};

/** Extract signal pin pairs from a primitive's hw metadata. */
function pinPairs(def) {
  const pairs = [];
  if (!def?.hw) return pairs;
  const COL = { TRIG: 'green', ECHO: 'blue', IN1: 'yellow', IN2: 'orange',
                ENA: 'yellow', ENB: 'orange', A0: 'green', D4: 'green', D13: 'green',
                D15: 'green', D19: 'green', 'CSI-0': 'purple' };

  const frags = [];
  if (def.hw.pin)  frags.push(...String(def.hw.pin).split(','));
  if (def.hw.pins) for (const p of def.hw.pins) frags.push(...String(p).split(','));

  for (const f of frags) {
    const m = f.trim().match(/([A-Za-z0-9_]+)\s*=\s*(\d+)/);
    if (m) {
      const [, name, num] = m;
      pairs.push({ mcuPin: num, devPin: name, color: COL[name] ?? 'green' });
    }
  }
  return pairs;
}
```

### C3 — "Open in Wokwi" button (1–2 days)

Wokwi supports pre-loading projects via URL. Generate the sketch + diagram and
encode them into the share URL:

```js
export async function openInWokwi(program) {
  const sketch  = toArduino(program);
  const diagram = toWokwiDiagram(program);

  // Wokwi's URL-based project loading (check current docs — API may change):
  //   https://wokwi.com/projects/new/esp32 accepts query params or localStorage injection
  // Simplest approach: download both files and link to the "New project" page.
  downloadFile(sketch,  `${program.name}.ino`);
  downloadFile(diagram, 'diagram.json');

  setTimeout(() => {
    window.open('https://wokwi.com/projects/new/esp32', '_blank');
  }, 500);   // give downloads a head start

  return { message: "Two files downloaded — drag them into the Wokwi project!" };
}
```

For a slicker integration, Wokwi supports loading a sketch via `localStorage`
on their domain — but this requires the user to visit Wokwi first. Document
both options in the UI.

### C4 — Wiring diagram SVG (2–3 days)

Generate a human-readable breadboard SVG from the same `pinPairs()` data:

```js
export function toWiringSVG(program) {
  const used = program.usedPrimitives();
  const W = 900, H = 600;
  const lines = [];
  lines.push(`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`);
  lines.push(`  <rect width="${W}" height="${H}" fill="#1a1a2e"/>`);

  // MCU box
  lines.push(`  <rect x="30" y="50" width="120" height="400" rx="6" fill="#2a2a4a" stroke="#4488ff" stroke-width="2"/>`);
  lines.push(`  <text x="90" y="30" fill="#fff" font-size="13" text-anchor="middle">ESP32</text>`);

  let y = 0;
  for (const id of [...used.actuators, ...used.sensors]) {
    const def  = getActuator(id) ?? getSensor(id);
    const pairs = pinPairs(def);
    if (!pairs.length) continue;

    const bx = 700, by = 80 + y * 120;
    const label = def?.label ?? id;

    // Component box
    lines.push(`  <rect x="${bx-60}" y="${by}" width="130" height="50" rx="4" fill="#2a3a2a" stroke="#44aa44" stroke-width="1.5"/>`);
    lines.push(`  <text x="${bx+5}" y="${by+30}" fill="#aaffaa" font-size="12" text-anchor="middle">${label}</text>`);
    lines.push(`  <text x="${bx+5}" y="${by+44}" fill="#667766" font-size="9" text-anchor="middle">${def?.hw?.peripheral ?? ''}</text>`);

    // Wires from MCU to component
    for (let i = 0; i < pairs.length; i++) {
      const { mcuPin, devPin, color } = pairs[i];
      const my = 70 + (parseInt(mcuPin) % 20) * 18;
      const cy = by + 10 + i * 12;
      lines.push(`  <polyline points="150,${my} 200,${my} 200,${cy} ${bx-60},${cy}" fill="none" stroke="${color}" stroke-width="2"/>`);
      lines.push(`  <text x="158" y="${my-3}" fill="${color}" font-size="8">${mcuPin}</text>`);
      lines.push(`  <text x="${bx-62}" y="${cy-2}" fill="${color}" font-size="8" text-anchor="end">${devPin}</text>`);
    }

    y++;
  }

  lines.push('</svg>');
  return lines.join('\n');
}
```

Add a "⬇ Wiring Diagram" button in the editor code-view panel:

```js
document.getElementById('te-dl-svg').addEventListener('click', () => {
  const svg  = toWiringSVG(this._program);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'wiring.svg' });
  a.click();
});
```

---

## Pin mapping reference table

| Primitive | Platform | MCU Pins | Part |
|---|---|---|---|
| brightness / is_dark | all | A0 (Uno) / 36 (ESP32) | LDR (photoresistor) → voltage divider |
| distance_ahead / bumped | all | TRIG=5, ECHO=18 | HC-SR04 ultrasonic |
| bumped (switch) | all | D4 | Tactile switch (INPUT_PULLUP) |
| player_near | esp32/jetson | D19 | PIR motion sensor |
| sees_target | jetson | CSI-0 | Camera (on-device inference) |
| sees_color | jetson | CSI-0 | Camera + colour classifier |
| drive / turn / stop | all | IN1=25, IN2=26, ENA=27 | L298N motor driver |
| beep | all | D13 (Uno) / 13 (ESP32) | Piezo buzzer |
| led | all | R=14, G=12, B=33 | RGB LED (common cathode) |
| grab | esp32/jetson | D15 (PWM) | SG90 servo |

---

## Acceptance criteria

- Crafting a Spark Brain → `spark_brain` in inventory → brain tier = `spark` →
  ESP32-tier sensors (player_near, grab) unlock in the tile editor.
- A Tin Brain robot can't compile a Vision tile — compiler emits a friendly
  warning like "Sensor 'sees_target' needs a Vision Brain; your Tin Brain can't
  do that yet."
- A Vision robot program can be built that uses `sees_color` + `drive` + `grab`
  to "find the red crate" — the bot approaches crates and triggers the grab
  animation.
- `</>` view → Download .ino produces an Arduino sketch that compiles cleanly in
  the Arduino IDE (spot-check in Wokwi).
- Download .py produces a MicroPython file that runs on ESP32 (spot-check in
  Wokwi).
- "Open in Wokwi" downloads the sketch + diagram.json; pasting them into Wokwi
  loads a simulation of the correct circuit.
- The wiring SVG shows labelled connections for every used primitive.

---

## Why this is the business

This is the game→reality bridge almost no educational game delivers. A kid
designs a robot in the scrapyard, exports it, buys a $6 ESP32 + $3 motor, and
builds the real thing. That story sells site licenses to schools and convinces
parents. Keep the exported code **honest** (it must actually run on hardware) —
that honesty is the whole value proposition.
