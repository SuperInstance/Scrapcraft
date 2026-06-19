# SCRAPCRAFT — The AI Maker Lab
## Gamified Embedded Engineering Through Conversational Tile-Programming

> *"The exact coding of the ESP32 can be blurred into working. Function-first thinking works
> fine because the backend just needs to satisfy the game mechanics. The chatbot iterates with
> the student about what they want their creation doing, and builds the custom tile for them."*
> — the core insight

---

## Why This Is The Killer App (And The Earlier Docs Weren't Enough)

The Machine Canvas and block-code editor from `KILLER_APP.md` teach logic and physics.
Good — but they're closed systems. The blocks are fixed. The ceiling is the blocks we ship.

**This is different.** When a student can say *"I want my scrap-rover to follow the brightest
light but stop and beep if it gets too close to a wall,"* and an AI companion turns that into a
working tile they drop onto their creation — the ceiling disappears. The student is now doing
**real embedded systems thinking** (sensors → logic → actuators) on real hardware abstractions
(ESP32 GPIO, PWM, I2C) without ever seeing a semicolon.

This is the thing no competitor has. Wokwi simulates firmware but demands you write C++.
Scratch generates blocks but controls a sprite, not a robot. ChatScratch helps with Scratch
but stays in Scratch's sandbox. **Nobody has fused conversational AI + tile programming +
real embedded abstractions + a game world where the creations actually live and matter.**

We can. We already have the world, the foreman, and the buildable robot.

---

## The Central Design Principle: Function-First, Firmware-Blurred

A middle schooler does not need to know that `analogWrite(13, 200)` sets PWM duty cycle on
GPIO 13. They need to know **"spin the motor at about 80% speed."** The genius of doing this
in a *game* is that **the firmware only has to satisfy game mechanics, not reality.** So we
get to abstract aggressively and correctly at the same time.

```
   WHAT THE STUDENT THINKS         WHAT THE TILE REPRESENTS        WHAT IT MAPS TO (HIDDEN)
   ───────────────────────         ────────────────────────        ────────────────────────
   "spin motor at 80%"        →    [SET motor speed 80%]      →    analogWrite(M1, 204)  (PWM)
   "when light sensor bright" →    [WHEN brightness > 60%]    →    if(analogRead(LDR)>614)
   "beep twice"               →    [BEEP x2]                  →    tone(BUZZ,880); delay...
   "follow the wall"          →    [custom: wall-follow]      →    PID loop on ultrasonic
```

The three columns are **the three difficulty tiers** of the same game. A student starts in
column 1 (pure intent), graduates to column 2 (named functions as tiles), and the prodigies
peek into column 3 (the generated firmware) — all in the same interface, same creation,
same companion.

**Crucially: the mapping is real.** When the student is ready, the tile they've been using is
the same GPIO/PWM/I2C concept that runs on an actual ESP32. We're not teaching a toy. We're
teaching the real thing with the hard edges sanded off by the game layer.

---

## Meet The Companion: "SPARK"

Earl is the gruff foreman — quests, lore, personality, the soul of the yard. Spark is different.

**Spark** is a small floating AI drone (a few glowing voxels, an expressive single-eye lens)
that is the student's **build partner and conversational tile-smith.** Where Earl gives you
problems, Spark helps you *solve* them by building the brains of your creations.

Personality contrast (this matters for the demographic):
- **Earl:** sarcastic, old-school, "figure it out yourself, rookie." The challenge.
- **Spark:** endlessly curious, collaborative, slightly chaotic optimist, talks like the
  smartest kid at the table who genuinely thinks YOUR idea is the best idea. The enabler.
  *"Ooh ok ok ok — so you want it to RUN AWAY from light? That's a phototphobic rover, that's
  amazing, I've literally never built one of those. Let's do it. What should it do when it's
  cornered?"*

Spark runs on Claude (the same `_claudeReply` infra already in `Foreman.js`), with a tool-use
loop that lets it actually emit tiles into the canvas. Offline, Spark falls back to a library
of pre-built "recipe conversations" that produce known-good tiles.

---

## The Three-Layer Tile Architecture

### Layer 1 — Intent Tiles (Ages ~10-12, "I just want it to work")

Pre-built, plain-language tiles. No configuration beyond a slider or dropdown. This is the
on-ramp. A student drops these together and their rover works in 90 seconds.

```
  SENSE                 THINK                  ACT
  ─────                 ─────                  ───
  [light is bright]     [if ___ then ___]      [drive forward]
  [something is close]  [wait ___ seconds]     [turn left / right]
  [bumped into wall]    [repeat forever]       [beep]
  [it's dark out]       [pick the nearest]     [blink light]
  [player is near]      [otherwise...]         [grab with arm]
```

These map 1:1 to ESP32 peripherals under the hood: LDR, ultrasonic (HC-SR04), bumper switch,
motor driver, buzzer, LED, servo. The student never hears those words yet.

### Layer 2 — Function Tiles (Ages ~12-14, "I want it to do something specific")

This is where **Spark earns its existence.** The student wants behavior that isn't a shipped
tile. They *talk to Spark*:

```
STUDENT: i want the rover to drive in a square
SPARK:   A square! Classic. So that's: drive forward, turn 90°, four times, right?
         Want sharp corners or smooth ones?
STUDENT: sharp. and honk at each corner
SPARK:   *chef's kiss* A honking square rover. Building you a tile now...
         
         ┌─────────────────────────────┐
         │  ▶ DRIVE IN SQUARE           │   ← new custom tile appears in tray
         │    corner honk: ON           │
         │    speed: [====----] 50%     │
         └─────────────────────────────┘
         
         Drop it on your rover and hit RUN. If the corners are too wide, tell me and
         I'll tighten the turn timing.
```

Behind that tile, Spark has authored a real function — a sequence of motor + servo + buzzer
calls with timing. The student sees a clean named tile with two parameters. **The function is
collapsed into a tile the moment it's understood.** This is the user's exact insight: custom
tiles, built by chatbot iteration, exposing only the knobs that matter.

The student can:
- **Use** the tile (drop it, run it)
- **Tweak** the exposed parameters (sliders Spark chose to surface)
- **Ask Spark to revise** it ("make it turn tighter," "add a second honk")
- **Open** it (Layer 3) to see what's inside — optional, never forced

### Layer 3 — Code Tiles (Ages ~14+, "show me what's really happening")

For the curious and the advanced. Opening a custom tile reveals its internals — still as
tiles, but now the *primitive* tiles: the actual `set pin`, `read analog`, `pwm write`,
`delay`, `if`, loop constructs. This is one inch from real Arduino/MicroPython, and Spark
will, on request, show the literal generated firmware side-by-side:

```
   TILE VIEW                          FIRMWARE VIEW  (Spark: "here's the real code, btw")
   ─────────                          ─────────────
   [REPEAT 4 times]                   for (int i=0; i<4; i++) {
     [drive forward 0.5s]               drive(FORWARD, 128); delay(500);
     [turn right 90°]                   turn(RIGHT, 90);
     [honk]                             tone(BUZZER, 880, 200);
   [end]                              }
```

The advanced levels of the game *live here* — late-game Band 3 creations require students to
crack open tiles, understand the primitives, and compose new ones from scratch. By the time
they get here, they've been reading this code structure passively for hours. It's familiar,
not scary.

---

## The Hardware Targets (And Why They're Perfect for This)

The game models three real platforms as **escalating "brain" components** you craft and install
in your creations. Each is a real chip with real capabilities, gamified as a tier of intelligence.

| Brain (craftable) | Real Chip | Game Role | Concepts Taught |
|---|---|---|---|
| **Tin Brain** | Arduino Uno (ATmega) | Simple reactive bots. Digital I/O, a few sensors. | GPIO, digital/analog read, basic loops |
| **Spark Brain** | ESP32 | The workhorse. WiFi, more pins, PWM, sensors galore. Robots, vehicles, smart devices. | PWM, I2C sensors, WiFi events, interrupts |
| **Vision Brain** | Jetson Nano | Endgame. Camera + AI. Bots that SEE and recognize. | Computer vision, ML inference, "the bot knows what it's looking at" |

**The progression IS the curriculum.** A Tin Brain rover can follow a line. A Spark Brain rover
can navigate by ultrasonic and phone home over WiFi. A Vision Brain rover can be told *"find the
red crate and bring it to me"* and actually do it — because the Jetson abstraction gives you a
[SEE: object] sensor tile that pre-trained vision makes "just work" in the game world.

The Vision Brain is where this becomes unforgettable. A middle schooler programming a robot that
**recognizes objects with a camera** — even in a game, even abstracted — has touched the actual
frontier of robotics. That's the screenshot they send their friends. That's the "I built an AI
robot" they tell their parents.

---

## How Spark Actually Builds A Tile (The Technical Loop)

Spark is a Claude agent with a constrained tool-use loop. The student's natural language goes in;
a validated, runnable tile comes out. The "blur" is enforced by a **capability schema** — Spark
can only compose from a known vocabulary of primitives that the game's simulation can execute.

```
  Student intent (NL)
        │
        ▼
  ┌──────────────────────────────────────────────────┐
  │ SPARK (Claude, system-prompted as build partner)  │
  │  - clarifies intent conversationally               │
  │  - emits a TILE_SPEC via tool call:                │
  │      { name, params[], body: [primitive ops] }     │
  └──────────────────────────────────────────────────┘
        │
        ▼
  ┌──────────────────────────────────────────────────┐
  │ TILE COMPILER (deterministic, game-side)           │
  │  - validates body against capability schema        │
  │    (only real ESP32/Arduino-mappable primitives)   │
  │  - rejects/repairs anything unsafe or impossible    │
  │  - generates: (a) the tile UI, (b) the sim bytecode,│
  │    (c) the "real firmware" view for Layer 3         │
  └──────────────────────────────────────────────────┘
        │
        ▼
  Tile appears in tray → student drops it → sim runs it on their creation
        │
        ▼
  Behavior observed → student reacts → Spark iterates ("tighter turns?")
```

Three reasons this is robust:
1. **Spark can't generate broken hardware logic** — the compiler only accepts primitives that
   map to real, simulatable peripheral operations. The "blur" is a *safety rail*, not a fudge.
2. **It's the same vocabulary as real firmware** — every primitive Spark composes corresponds
   to a genuine Arduino/ESP32 call. We can literally export to Wokwi (see below).
3. **The conversation is the lesson** — when Spark asks *"sharp corners or smooth?"* the student
   is making an engineering decision about turn dynamics. The pedagogy is in the dialogue.

---

## The Real-World Bridge (The Parent-Convincing, School-Selling Feature)

Everything above is in-game and abstracted. But the vocabulary is real. So we ship the door:

**"Export to Real Hardware."** Any creation's brain can export its tile program to:
- **Wokwi project** (browser ESP32/Arduino sim) — one click, opens a real firmware simulation
  of their exact creation. The tiles become real C++/MicroPython they can read.
- **Arduino sketch / MicroPython file** — downloadable, flashable to a $6 ESP32 they can buy.
- **Wiring diagram** — Spark generates the breadboard layout (which real sensor goes to which
  real pin) so a kid with actual hardware can build the physical version of their game robot.

**This is the moment Scrapcraft stops being a game and becomes a maker pipeline.** A kid designs
a phototropic honking rover in the scrapyard, exports it, buys a $6 chip and a $3 motor, and
builds the real thing in their bedroom. That story sells the platform to every STEM teacher and
every parent on Earth. The game-based learning market ($17B → $95B by 2033) is built on exactly
this kind of game-to-reality bridge, and almost nobody delivers it.

---

## Where It Plugs Into Existing Scrapcraft

This is additive to what's built, not a rewrite:

| Existing System | How It Extends |
|---|---|
| `ScrapBot.js` | Becomes the first programmable creation. Gets a Brain slot + tile program. |
| Machine Canvas (planned) | The tile editor IS the canvas, second mode: "Logic" vs "Mechanical." |
| `Foreman.js` (Earl + Claude infra) | Spark reuses the `_claudeReply` fetch loop with a new system prompt + tool schema. |
| `recipes.js` / `items.js` | Add: Tin Brain, Spark Brain, Vision Brain, sensors (LDR, ultrasonic, camera), actuators (servo, buzzer, motor driver). |
| Recipes / crafting stations | A new **Maker Bench** station where brains + sensors are assembled and programmed. |
| Skill tree (planned) | New "Roboticist" branch: unlock custom-tile authoring, then tile-cracking, then firmware view. |
| Quests | Earl sets the goal ("I need something that sorts scrap by itself"); Spark helps you build the brain that does it. The two AIs play off each other. |

---

## The Curriculum Arc (Function-First → Real Code)

```
BAND 0  ·  Tin Brain  ·  "Make it react"
   Intent tiles only. Sense → Act. First rover that avoids walls.
   Concept: input causes output. (real: digital GPIO)

BAND 1  ·  Spark Brain ·  "Make it decide"
   IF/ELSE, loops, multiple sensors. Spark builds your first custom tiles.
   Concept: conditional logic, sensor fusion. (real: analog read, PWM, I2C)

BAND 2  ·  Spark Brain+ ·  "Make it remember & talk"
   Variables, counters, WiFi events, multi-bot coordination.
   Spark co-authors complex behaviors; you start tweaking their guts.
   Concept: state, events, communication. (real: ESP32 WiFi, interrupts, vars)

BAND 3  ·  Vision Brain ·  "Make it SEE and think"
   Camera sensor tiles, object recognition, autonomous task completion.
   You crack open tiles, compose primitives, read the real firmware.
   Concept: perception, ML inference, full systems thinking. (real: Jetson CV)

ENDGAME ·  "Earl's Retirement" — build a fully autonomous scrap-sorting factory:
   multiple programmed bots, coordinating over a network, sorting by vision,
   running while you watch. Export the whole thing to real hardware.
   That's the diploma.
```

---

## Build Order (Concrete Next Steps)

```
Phase A — Foundation (prerequisite, from earlier docs)
   • Save system, block placement, basic Machine Canvas

Phase B — The Tile Engine (the core of THIS doc)
   1. Tile data model + capability schema (the primitive vocabulary)        [~1wk]
   2. Tile Compiler: tile-spec → sim bytecode + firmware view              [~1.5wk]
   3. Drag-drop tile editor UI (Layer 1 intent tiles, ~20 shipped)         [~1.5wk]
   4. Creation "Brain slot": attach a tile program to ScrapBot, run it     [~1wk]

Phase C — Spark, The Companion
   5. Spark character (drone model, personality, Claude system prompt)      [~3d]
   6. Spark tool-use loop: NL → TILE_SPEC → compiler → tile in tray        [~1.5wk]
   7. Offline fallback: ~15 scripted "recipe conversations"                 [~3d]
   8. Layer 2 custom-tile authoring + parameter surfacing                   [~1wk]

Phase D — Depth & Reality
   9. Layer 3 tile-cracking + side-by-side firmware view                    [~1wk]
   10. Three Brains (Tin/Spark/Vision) as crafted tiers + sensor/actuator items [~1wk]
   11. Vision Brain: [SEE: object] abstracted CV tiles in the game world    [~1.5wk]
   12. Export to Wokwi / Arduino sketch / wiring diagram                     [~1wk]

Phase E — The Arc
   13. Rewire bands to the Tin→Spark→Vision curriculum progression
   14. Earl×Spark quest interplay (Earl sets goals, Spark enables solutions)
   15. Endgame autonomous factory + real-hardware export diploma
```

---

## The One-Sentence Pitch (Updated)

**Scrapcraft is where a middle schooler tells a friendly AI "I want my scrap-robot to chase
light and honk at corners," watches it come to life from drag-and-drop tiles, and — without
ever seeing a line of code — learns the exact sensor-logic-actuator thinking that runs real
ESP32 robots, then exports it to a $6 chip and builds it for real.**

Function-first. Firmware-blurred. Conversation-driven. Real at the core.
That's not a widget. That's the thing.

---

*Grounded in the current cutting edge: ChatScratch (arXiv 2402.04975 — AI-augmented visual
programming for children), Wokwi (browser ESP32/Arduino/STM32 firmware simulator), PictoBlox
(block-to-Python AI programming), and the function-first abstraction insight that a game's
firmware only needs to satisfy game mechanics — letting us teach the real thing with the hard
edges sanded off.*
