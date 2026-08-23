# SCRAPCRAFT

> *A voxel scrapyard where middle schoolers build robots, program them with AI, and race them on a floodlit oval — all while accidentally learning embedded engineering.*

---

```
  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  ░  THE YARD GATE   ░  INDUSTRIAL   ░   CIRCUIT CITY   ░   THE DEEP YARD  ░
  ░  z=0..31         ░  CORRIDOR     ░   z=64..95        ░   z=96..127      ░
  ░  Starter loot    ░  z=32..63     ░   Electronics     ░   Rare loot      ░
  ░  Earl's shed     ░  Metal towers ░   Oval TRACK       ░   Final workshop ░
  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

---

## What Is This

Scrapcraft is a browser-based 3D voxel game (à la Minecraft-lite) set in an industrial scrapyard. Players mine blocks, craft gear, build robot companions, and program those robots using a visual tile editor backed by an AI assistant called **Spark**. Programs compile to real **Arduino C++** and **MicroPython** firmware — the game teaches embedded systems thinking without requiring students to read a single semicolon.

**Target audience:** Middle schoolers, ages 10–14. Also: curious adults, STEM teachers, robotics clubs.

**Stack:** Three.js · Vite · Vanilla ES modules · Web Audio API · Workers AI (Spark, via the cached scrap-spark worker)

---

## What's New — The Four Revolutions (2026-08)

### ⚡ scrap-spark — the fleet's cached brain

Spark now runs through **[scrap-spark](https://github.com/SuperInstance/scrap-spark)** — a
Cloudflare Worker implementing the pincher-cache doctrine: `SHA-256(question+context)` →
R2/D1, `X-Cache: HIT|MISS`. The first kid pays the model call; every kid after gets the
can. Also hosts the **shared build wall** (`/gallery` — builds AND failures), the daily
challenge, and the **Most Interesting Failure of the Week**. Crashes are publishable art.

### 🔌 The hardware bridge

- **Hardware twin**: every program runs against a virtual Arduino Uno (14 digital pins,
  6 analog, PWM on D3/5/6/9/10/11 only — real constraints). The **📐 Wiring** view shows
  your tiles driving actual pins live.
- **Browser flashing**: ⚡ MicroPython paste-mode (ESP32/Pico) and 🔥 AVR109 `.hex`
  (Leonardo-class, STM32duino). No device? *"No device connected — keep simulating!"*
  Nothing ever breaks. See [docs/HARDWARE_BRIDGE.md](docs/HARDWARE_BRIDGE.md) for the
  board table and the **$5 shopping list**.

### 🧾 The quilt view

Flip the Tile Editor into a **live spreadsheet of your bot**: sensors, pose, motors,
program flow, pin duties, and the bot's heart — every value flashes as it changes.
Causality becomes visible.

### 💛 The heart

The first ScrapBot becomes a character: it gets a **name**, **dents** from crashes
(with where + how fast), a **repair log** (repair_kit hammers them out), remembered
**milestones** (first brain, first lap, crash-free streaks), and one day — when you're
both ready — the **retirement shelf**, where a bot's stats freeze with an epitaph,
honored forever. Open the 💛 BOT card in the Tile Editor.

---

## Quick Start

```bash
npm install
npm run dev       # → http://localhost:5173
```

To build for production:

```bash
npm run build     # output in /dist
npm run preview   # serve the dist build locally
```

To run the Maker Lab unit test suite (no build step, no browser needed):

```bash
npm test          # 36 framework-free tests, all green
```

---

## Controls

| Key | Action |
|---|---|
| `W A S D` | Move |
| `Shift` + move | Sprint (×1.8 speed) |
| `Space` | Jump |
| `Mouse` | Look (click canvas to lock pointer) |
| `1–9` | Select hotbar slot |
| `Left click` | Mine / break block |
| `Right click` | Place held block |
| `E` | Open / close inventory |
| `T` | Open / close Tile Editor (Maker Lab) |
| `B` | Toggle ScrapBot follow mode |
| `Shift+B` | Give second bot a brain |
| `F` | Summon Earl (Foreman) |
| `G` | Use / consume active item |
| `R` | Respawn to start |
| `H` | Help overlay |
| `M` | Toggle background music |
| `I` | Sort inventory |
| `N` | Close Codex overlay |
| `F5` | Manual save |
| `F9` | Load save |

### Movement bonuses

| Item in inventory | Effect |
|---|---|
| `spring_boots` | Jump height ×2.5 |
| `go_kart` | Movement speed ×3 |
| `fuel_can` (consumed via G) | Speed ×1.8 for 8 seconds |
| `headlamp` | Emissive block glow effect |
| `grapple_hook` | Vertical pull toward aimed block |

---

## The World

The map is **128×128 blocks** (10 blocks tall) generated deterministically from seed 42. Three concrete roads at x=8, x=64, x=120 connect the four bands.

| Band | Z range | Name | Character |
|---|---|---|---|
| 0 | 0–31 | **The Yard Gate** | Starter area — Earl's shed, workbench, forge, smelter. Concrete & gravel. |
| 1 | 32–63 | **Industrial Corridor** | Metal towers, oil refineries, dense scrap piles. |
| 2 | 64–95 | **Circuit City** | Electronics bay, crate warehouses, **oval TRACK circuit** (center: 35, 84; radii 14×7). |
| 3 | 96–127 | **The Deep Yard** | Extreme clutter, rare loot, the final workshop. |

### Block types

| ID | Name | Description |
|---|---|---|
| 0 | Air | Empty |
| 1 | Concrete | Road, floor |
| 2 | Gravel | Ground filler |
| 3 | Dirt | Deep Yard floor |
| 4 | Iron Block | Structural scrap |
| 5 | Steel Beam | Large metal pillar |
| 6 | Rust Heap | Mineable iron scrap source |
| 7 | Barrel | Drops rubber_chunk |
| 8 | Crate | Drops wood_plank, glass_shard |
| 9 | Scrap Pile | Drops iron_scrap |
| 10 | Copper Conduit | Drops copper_wire |
| 11 | Circuit Cluster | Drops circuit_board |
| 12 | Workbench | Crafting station (tier 1–2) |
| 13 | Forge | Crafting station (metal/advanced) |
| 14 | Smelter | Crafting station (tier 3 prestige) |
| 15 | Gear Tower | Decorative / mineable gear_small |
| 16 | Lamp Post | Decorative |
| 17 | **Track Strip** | Dark rubber strip — bot follows via `line_under` sensor |
| 18 | **Floodlight** | Emissive light block — boosts `light` sensor brightness |
| 19 | Acid Puddle | Hazard — hurts player on contact |
| 20 | Buried Cache | Special loot block — signal radio locates it |
| 21 | Crystal Formation | Rare — drops crystal_fragment |

### Day/Night Cycle

A full day/night cycle runs every **6 minutes**. Ambient light modulates smoothly. Night increases rare drop rates (8% vs 3%) and triggers a Night Bonus HUD indicator.

### Weather System

Dynamic weather cycles between **clear**, **rain**, and **storm** (with lightning flashes). Rain and storms trigger procedural audio effects.

---

## Items & Crafting

### Materials (raw drops)

| Item | Icon | Source |
|---|---|---|
| iron_scrap | 🔩 | Rust Heap, Scrap Pile, Iron Block |
| copper_wire | 🪢 | Copper Conduit |
| rubber_chunk | ⬛ | Barrel |
| gear_small | ⚙️ | Gear Tower |
| circuit_board | 🟢 | Circuit Cluster |
| fuel_can | 🛢️ | Barrel (rare) |
| wood_plank | 🪵 | Crate |
| glass_shard | 💎 | Crate |
| spring | 🌀 | Scrap Pile |
| battery_dead | 🔋 | Circuit Cluster |
| track_strip | ▬ | Craft: 2× rubber_chunk + 1× iron_scrap → 8× track_strip |
| floodlight | 💡 | Craft: 2× glass_shard + 2× copper_wire + 3× iron_scrap |
| crystal_fragment | 💠 | Crystal Formation |

### Crafting stations

Approach a station and press `E` to see available recipes. Stations gate recipe tiers.

| Station | Tier | Recipes available |
|---|---|---|
| Hand (anywhere) | 1 | Wrench, Hammer, Pliers, Repair Kit, Signal Flare |
| Workbench | 1–2 | Most common gear, Maker Lab basics |
| Forge | 2–3 | Metal-intensive items, Robot Arm, Generator |
| Smelter | 3 | Go-Kart, ScrapBot, Flying Machine, advanced brains |

### Recipe reference (56 recipes, ~50 unique outputs)

<details>
<summary><strong>Tier 1 — Hand tools & consumables</strong></summary>

| Output | Ingredients | Station | Tool |
|---|---|---|---|
| Wrench ×1 | 🔩×3 🪵×1 | any | — |
| Hammer ×1 | 🔩×2 🪵×2 | any | — |
| Pliers ×1 | 🔩×2 🪢×1 | any | — |
| Blowtorch ×1 | 🔩×3 🪢×2 🛢×1 | workbench | — |
| Repair Kit ×1 | ⬛×2 🪢×1 🌀×1 | any | — |
| Signal Flare ×3 | 🛢×1 🪢×2 | any | — |
| Steel Cable ×4 | 🔩×3 🌀×2 ⬛×1 | forge | 🔨 |
| Tin Brain ×1 | 🟢×2 🪢×4 🔩×3 | workbench | ✂️ |
| Ultrasonic Module ×1 | 🟢×1 🪢×2 | workbench | — |
| Light Sensor (LDR) ×2 | 🟢×1 🪢×1 | workbench | — |
| Buzzer Module ×2 | ⚙️×1 🪢×1 | workbench | — |
| Motor Driver ×1 | 🟢×1 🔩×2 | workbench | — |
| Floodlight ×1 | 💎×2 🪢×2 🔩×3 | workbench | — |
| Track Strip ×8 | ⬛×2 🔩×1 | workbench | — |

</details>

<details>
<summary><strong>Tier 2 — Devices & advanced gear</strong></summary>

| Output | Ingredients | Station | Tool |
|---|---|---|---|
| Battery Pack ×2 | 🔋×2 🪢×3 ⬛×1 | workbench | ✂️ |
| Spring Boots ×1 | 🌀×4 ⬛×2 🔩×2 | workbench | 🔨 |
| Robot Arm ×1 | 🔩×4 ⚙️×3 🪢×2 | forge | 🔥 |
| Generator ×1 | 🔩×6 ⚙️×4 🛢×2 🪢×3 | forge | 🔧 |
| Radio Beacon ×1 | 🟢×2 🪢×4 💎×1 🔩×2 | workbench | ✂️ |
| Night Goggles ×1 | 💎×2 🪢×3 🟢×1 ⬛×1 | workbench | ✂️ |
| Grapple Hook ×1 | cable×2 🔩×3 🌀×1 | workbench | 🔧 |
| Charging Pad ×1 | 🟢×2 🔋×2 🪢×3 🔩×2 | workbench | ✂️ |
| IR Line Sensor ×4 | 🟢×1 🪢×2 | workbench | — |
| Signal Antenna ×1 | 🪢×4 🔩×2 💎×1 | workbench | — |
| PIR Motion Module ×1 | 🟢×1 ⬛×1 | workbench | — |
| Servo Module ×1 | ⚙️×2 🪢×2 | workbench | — |
| Pipe Cannon ×1 | 🔩×5 ⬛×1 🌀×2 | workbench | 🔧 |
| Scrap Cannon ×1 | 🔩×6 ⚙️×2 🛢×1 🪢×2 | forge | 🔧 |
| Speed Coil ×1 | 🪢×4 🔩×3 ⚙️×1 🔋×1 | forge | 🔧 |
| Headlamp ×1 | 💎×1 🪢×2 🔩×1 | workbench | — |
| Rubber Boots ×1 | ⬛×3 🌀×1 | any | — |
| Ore Scanner ×1 | 🟢×2 🪢×3 🔩×2 💠×1 | workbench | ✂️ |
| Signal Radio ×1 | 🟢×2 🪢×4 💎×1 🔩×2 💠×1 | workbench | ✂️ |
| Spark Brain ×1 | tin_brain×1 🟢×3 🪢×6 🛢×1 | smelter | 🔥 |
| Flare Pack ×3 | 🛢×2 🪢×3 | workbench | — |
| Waypoint Flag ×4 | 🔩×2 🪵×2 | any | — |
| Scrap Grenade ×1 | 🔩×3 🪢×1 🛢×1 | workbench | — |
| Signal Amp ×1 | 🟢×2 🪢×3 🔩×2 | workbench | — |

</details>

<details>
<summary><strong>Tier 3 — Prestige builds</strong></summary>

| Output | Ingredients | Station | Tool |
|---|---|---|---|
| Go-Kart ×1 | 🔩×8 ⬛×4 ⚙️×6 🪵×4 | forge | 🔧 |
| ScrapBot ×1 | robot_arm×2 🟢×4 ⚙️×6 🔋×2 🪢×5 | smelter | 🔥 |
| Flying Machine ×1 | 🔩×12 generator×1 robot_arm×2 🟢×6 ⬛×4 🛢×4 💎×3 | smelter | 🔥 |
| Vision Brain ×1 | spark_brain×1 🟢×5 💎×3 🛢×2 | smelter | 🔥 |
| Scrap Magnet ×1 | 🔩×4 🪢×3 🔋×1 | forge | — |
| Camera Module ×1 | 🟢×3 💎×2 🪢×2 | workbench | — |

</details>

---

## Functional Items

### Consumables (G key)

Press `G` to use the item in your active hotbar slot.

| Item | Effect |
|---|---|
| `repair_kit` | +5 XP, visual heal pulse |
| `signal_flare` | Summons Earl, red particle burst |
| `fuel_can` | 8-second speed ×1.8 boost |
| `battery_pack` | +15 XP, energy flash |
| `charging_pad` | ScrapBot circuit particle burst |
| `flare_pack` | Halves supply drop countdown |
| `scrap_grenade` | Deals AoE damage in blast radius |
| `scrap_cannon` | Fires projectile with camera shake on impact |

### Equipment (passive)

| Item | Effect |
|---|---|
| `headlamp` | Blocks emit a faint glow around you in dark areas |
| `spring_boots` | Jump height ×2.5 |
| `rubber_boots` | Reduces acid puddle damage |
| `night_goggles` | Improves visibility at night |
| `go_kart` | Movement speed ×3 |
| `grapple_hook` | Pulls player toward targeted block |
| `speed_coil` | Permanent speed boost (×1.4 from backpack) |

### Tools (advanced interactions)

| Item | Effect |
|---|---|
| `ore_scanner` | Highlights nearby ore blocks on HUD |
| `signal_radio` | Pings buried caches — shows distance/direction |
| `waypoint_flag` | Drops a nav marker at current position |

---

## ScrapBot

Craft a **ScrapBot** (`robot_helper`) and it will follow you around the yard. Press `B` to toggle follow mode. Open the **Tile Editor** (`T`) to program its brain.

### Follow mode

When following, the bot steers around obstacles using a 45° wall-avoidance algorithm — it tries right first, then left, then stops.

### Lap Timer & Ghost Replay

The bot detects when it crosses the **start gate** at x=29.5–46.5, z=13–15.5. After the first crossing, each subsequent crossing in ≥2 seconds counts as a lap. Time displays at bottom-right; a new best record triggers confetti, Earl audio, and +20 XP.

A **ghost replay** of your best lap records the bot's position/yaw each frame. On subsequent attempts, a translucent ghost bot plays back alongside your current run, so you can race your own best time.

### Dual-bot system (Level 5)

At Level 5 (Engineer skill), you can activate a **second bot**. Press `Shift+B` to give it a brain. The Tile Editor has a bot selector dropdown (Bot 1 / Bot 2) — both run simultaneously, perfect for drag races.

### Sensors

| Sensor ID | Type | Range | Hardware equivalent |
|---|---|---|---|
| `distance_ahead` | float | 0 (wall) – 1 (clear) | HC-SR04 ultrasonic |
| `light` | float | 0 – 1 | LDR photoresistor |
| `temperature` | float | 0 – 1 | NTC thermistor |
| `line_under` | bool | true / false | TCRT5000 IR reflectance |
| `motion_nearby` | bool | true / false | PIR sensor |

### Actuators

| Action | Parameters | Hardware equivalent |
|---|---|---|
| `drive` | dir: forward/back, speed: 0–1 | L298N motor driver |
| `turn` | dir: left/right, speed: 0–1 | Differential drive |
| `beep` | freq: Hz, duration: s | Piezo buzzer |
| `led` | color: hex, brightness: 0–1 | RGB LED |
| `grab` | state: open/close | SG90 servo |

---

## Maker Lab (Tile Editor)

Press `T` to open the Tile Editor — Scrapcraft's visual programming layer for robot brains.

```
┌─────────────────────────────────────────────────────────────┐
│  TILE EDITOR                              [▶ Run] [■ Stop]  │
│                                                              │
│  Preset: [Wall Avoider ▾]    Bot: [Bot 1 ▾]                │
│  ┌──────────────────────────┐  ┌──────────────────────┐    │
│  │  PROGRAM CANVAS          │  │  SENSOR READOUT       │    │
│  │                          │  │  distance_ahead 0.82  │    │
│  │  [forever]               │  │  light        0.41  │    │
│  │    [if distance < 0.3]   │  │  temperature  0.12  │    │
│  │      [turn right 0.8s]   │  │  line_under   false │    │
│  │    [else]                │  │  pos  (35.2, 84.7)  │    │
│  │      [drive forward]     │  │  hdg  NE           │    │
│  │                          │  └──────────────────────┘    │
│  └──────────────────────────┘                               │
│                                                              │
│  💬 Ask Spark: "make it follow the track"   [Send]         │
│                                                              │
│  [Arduino] [MicroPython] [Wokwi] [Share 🔗]                │
└─────────────────────────────────────────────────────────────┘
```

### Built-in presets

| Preset | Behavior |
|---|---|
| Wall Avoider | Drives forward, turns right on obstacle |
| Line Follower | Drives forward on TRACK strip, turns right when off |
| Light Chaser | Drives toward brightest spot |
| Light Runner | Chases brightest spot (higher speed) |
| Square Patrol | Drives a square pattern |
| Spin Artist | Continuous spin |
| Greeter Bot | Beeps when motion detected nearby |
| Disco Bot | Blinks LEDs in rainbow sequence |
| Symphony Bot | Plays a melody |
| Grabber Bot | Opens/closes grabber arm |
| Careful Creeper | Slow approach, stops early |
| Speed Demon | Full speed ahead |

### Spark AI companion

Click the chat bubble at the bottom of the Tile Editor. Describe what you want in plain English:

> *"make the bot drive in a zigzag"*
> *"stop if there's a wall within half a block"*
> *"follow the track and beep when it loses the line"*

Spark calls the Claude API (`claude-sonnet-4-6`) and emits a fully validated tile program. If you're offline (or `VITE_ANTHROPIC_API_KEY` isn't set), Spark falls back to 18+ pre-written offline recipes matching common keywords.

All AI-generated programs pass through `compile()` before execution — raw AI output never executes directly.

### Brain sharing

Click **Share 🔗** to encode the current program as a `?brain=` URL parameter (base64). Anyone with the link loads the program immediately on page open — useful for teachers distributing example programs to a class.

### Firmware export

The Tile Editor exports your program as real, flashable firmware:

| Button | Output |
|---|---|
| **Arduino** | `.ino` sketch for ATmega328P / ESP32 (copy-paste into Arduino IDE) |
| **MicroPython** | `.py` script for ESP32 / Raspberry Pi Pico |
| **Wokwi** | Circuit diagram JSON + firmware for browser simulation at wokwi.com |

Exporting Wokwi unlocks the **Game → Reality** achievement.

---

## Earl's Quests & Supply Drops

### Earl "The Foreman"

Earl is the crusty yard boss who assigns quests, reacts to your accomplishments, and has an opinion about everything.

| # | Quest | Objective | Reward |
|---|---|---|---|
| 1 | First Day | Mine 5 iron scrap | copper_wire ×8 |
| 2 | Tool Up | Craft a wrench | fuel_can ×3 |
| 3 | Power Up | Craft a generator | battery_pack ×4 |
| 4 | Circuit Breaker | Collect 5 circuit boards | circuit_board ×5 |
| 5 | Build a Bot | Craft a ScrapBot | tin_brain ×1 |
| 6 | First Program | Run a tile program | gear_small ×8 |
| 7 | Sensor Safari | Use 3 different sensors | ldr_module ×3 |
| 8 | Firmware | Export any firmware | circuit_board ×3 |
| 9 | Race Circuit | Complete a bot lap | ir_module ×4 |
| 10 | Light It Up | Craft + place a floodlight | scrap_magnet ×1 |

Earl has AI dialogue via Claude (when `VITE_ANTHROPIC_API_KEY` is set) with an offline personality bank fallback.

### Supply Drops

Random airdrops arrive every **90–180 seconds**. A compass direction notification tells you where. Loot includes rare items and extra resources. The `flare_pack` item halves the countdown.

### Salvage Run Challenges

Repeatable one-session challenges appear periodically (e.g. "Salvage 5 Iron Scrap"). Complete them for bonus XP and rewards.

---

## XP & Skills

Earn XP from mining, crafting, completing quests, and running programs.

| Event | XP |
|---|---|
| Mine a block | 1 |
| Craft any item | 5 |
| Complete a quest | 50 |
| Run a tile program | 10 |
| Export firmware | 15 |
| Complete a bot lap (new best) | 20 |
| Use item (G key) | 5–15 |
| Spark generates a program | 10 |
| Complete a Salvage Run | 25 |

### Skill Nodes

| Level | Skill | Effect |
|---|---|---|
| 1 | **Tinkerer** | Opens the Maker Lab |
| 3 | **Programmer** | Enables advanced tile programming |
| 5 | **Engineer** | Unlocks second bot |
| 8 | **Maker** | Master tier crafting |
| 12 | **Inventor** | Ultimate crafting unlocks |

---

## Achievements (49 total)

<details>
<summary><strong>Crafting milestones</strong></summary>

| Achievement | Condition |
|---|---|
| 🔩 Hands In The Grease | Mine first block |
| 🪛 Rust Whisperer | Collect 50 iron scrap |
| 🔧 Wrench Wrangler | Craft a wrench |
| ⚡ Sparky | Craft a generator |
| 🟢 Circuit Breaker | Collect 10 circuit boards |
| 🔥 Fire Starter | Craft a blowtorch |
| 📡 Can You Hear Me Now | Craft a radio beacon |
| 👟 Spring Chicken | Craft spring boots |
| 💨 OSHA Nightmare | Craft a pipe cannon |
| 🦾 Arm Day | Craft 4 robot arms |
| 🏎️ Zero To Oh-No | Craft the go-kart |
| ✈️ Earl Was Wrong | Build the flying machine |
| 🧲 Magnetic Personality | Craft the scrap magnet |

</details>

<details>
<summary><strong>Progress milestones</strong></summary>

| Achievement | Condition |
|---|---|
| 📦 Scrap Hoarder | Fill inventory ≥80% |
| 🌙 Night Owl | Mine 5 blocks at night |
| ⛏️ 100 Blocks Down | Mine 100 blocks total |
| 📋 Junior Engineer | Craft 5 different things |
| 🏆 Need For Speed | Craft 10 different things |
| 🏆 Master Builder | Craft 15 different things |
| 👑 King of the Yard | Complete 5 quests |
| ⚡ Speed Crafter | Craft 3 items in 60 seconds |
| 🧱 Placer | Place your first block |

</details>

<details>
<summary><strong>Maker Lab achievements</strong></summary>

| Achievement | Condition |
|---|---|
| 🤖 Not Alone Anymore | Build a ScrapBot |
| 🧠 First Brain | Craft a Tin Brain |
| ⚡ Going Wireless | Craft a Spark Brain |
| 👁️ Eagle Eye | Craft a Vision Brain |
| 🏅 All Three Brains | Craft all 3 brains |
| 🥽 Night Sight | Craft night goggles |
| 🪝 Hook Shot | Craft the grapple hook |
| 🤖 Tile Runner | Run first tile program |
| 🔌 Game → Reality | Export a Wokwi diagram |
| 🏁 Track Builder | Place 16 track strips |
| 🏆 Bot Racer | Bot completes a lap |
| 🏎️ Oval Racer | Bot completes 3 laps |
| 💡 Illuminator | Place first floodlight |
| 🔗 Shared Brain | Share a tile program URL |
| ✨ AI Collaborator | Spark builds you a program |
| 📡 Sensor Explorer | Use 4 different sensor types |

</details>

<details>
<summary><strong>Adventure & exploration</strong></summary>

| Achievement | Condition |
|---|---|
| 💠 Crystal Hunter | Mine 3 crystal formations |
| 💡 Headlamp On | Craft a headlamp |
| 🔫 Scrap Gunner | Fire the scrap cannon |
| 🚩 Waypoint Ace | Place 5 waypoint flags |
| 🤖 Bot Scanner | Use the ore scanner |
| 💣 Grenadier | Throw a scrap grenade |
| 📦 Supply Runner | Loot 3 supply drops |
| 🍀 Lucky Strike | Find hidden rare item in scrap |
| 🏃 Narrow Escape | Survive with 1 HP |
| ♻️ Salvage Pro | Complete 3 Salvage Run challenges |
| 📻 Signal Hunter | Use the signal radio to find a buried cache |

</details>

---

## Save System

Progress is saved to `localStorage` under the key `scrapcraft_save_v6`.

| Trigger | Action |
|---|---|
| Every 60 seconds | Autosave |
| `F5` | Manual save |
| `F9` | Load most recent save |

Saved state: player position, inventory, hotbar index, achievements, XP, quest progress, world diffs (mined and placed blocks), skills unlocked, stats bag (total mined, crafted, etc.).

---

## Engineering Codex (27 entries)

Press `I` in the inventory to access the Engineering Codex — 27 real-science entries written at a middle-school level. Topics include:

- How generators work (electromagnetic induction)
- Circuit boards and silicon
- Battery chemistry (rechargeable cells)
- Copper wire and conductivity
- Rubber insulation and vulcanization
- Gear ratios and torque
- Signal radio and radio waves
- Ore scanner technology
- Lightning storms and static electricity
- Acid reactions and pH
- Fall physics and terminal velocity
- And more...

---

## HUD

| Element | Description |
|---|---|
| Health bar | Top-left, depletes on damage (explosions, acid, falls) |
| XP bar | Top-center, fills toward next level |
| Level badge | Shows current level and skill node |
| Weather indicator | Current weather state (clear/rain/storm) |
| Day/Night indicator | Time of day with moon/sun icon |
| Minimap | Top-right — 128×128 pixel fog-of-war exploration map |
| Hotbar | Bottom — 9 slots with tooltips on hover |
| Active item label | Above hotbar |
| Bot sensor readout | Right side — live sensor values when bot is running |
| Lap timer | Bottom-right — shows current lap time |
| Challenge overlay | One-session Salvage Run objectives |
| Notification area | Top-center — item pickups, events, tips |
| Damage vignette | Red flash on hit |
| Crosshair states | Spreads when moving, turns gold on interactive blocks, mining arc shown during hold-to-mine |

---

## Architecture

```
Scrapcraft/
├── index.html                  Entry point — all UI markup, CSS-in-head
├── src/
│   ├── Game.js                 Main loop, tick coordinator, input routing
│   ├── World.js                128×128×10 voxel map, procedural generation, save diffs
│   ├── Player.js               Movement, collision, inventory, hotbar
│   ├── Renderer.js             Three.js scene, BufferGeometry instancing, PointLight pool
│   ├── UI.js                   HUD, inventory overlay, Codex, notifications, achievement toasts
│   ├── WeatherSystem.js        Dynamic weather (clear, rain, storm with lightning)
│   ├── DayNight.js             Sky cycle and ambient light modulation
│   ├── ScrapBot.js             Companion robot — follow AI, tile program execution bridge
│   ├── Foreman.js              Earl NPC — quests, dialogue, event reactions (Claude + fallback)
│   ├── Spark.js                AI companion — Claude API + offline recipe fallback
│   ├── TileEditor.js           Visual tile editor panel, Spark chat, firmware export UI
│   ├── AudioSystem.js          Procedural Web Audio synthesis (no audio files)
│   ├── ParticleSystem.js       800-particle pool — mine, craft, spark, confetti, track sparks
│   ├── Achievements.js         49-achievement system with stats bag
│   ├── SaveSystem.js           localStorage persistence with autosave
│   ├── XPSystem.js             XP gain, level milestones, 5 skill nodes
│   ├── Challenge.js            Repeatable Salvage Run challenges
│   ├── TextureGen.js           Procedural block texture generation
│   ├── data/
│   │   ├── blocks.js           Block IDs, definitions, drop tables, solidity flags
│   │   ├── items.js            45+ item definitions with icons, categories, stack sizes
│   │   └── recipes.js          56 crafting recipes, tier gating, foreman quips
│   └── maker/                  ← The Maker Lab engine (Three.js-free, fully testable)
│       ├── primitives.js       Single source of truth: sensors + actuators schema
│       ├── TileProgram.js      Tile-tree data model, node constructors (T.*), examples
│       ├── TileCompiler.js     Tree → bytecode (AI safety rail + macro expansion)
│       ├── TileVM.js           Resumable bytecode interpreter (cooperative, 60fps-safe)
│       ├── VirtualRobot.js     Pure-logic robot physics + collision
│       ├── FirmwareGen.js      Bytecode → Arduino C++ / MicroPython / Wokwi JSON
│       ├── GameWorldAdapter.js Sensor bridge: game world → robot sensor readings
│       ├── SparkOfflineRecipes.js 18+ keyword-matched fallback programs
│       └── __tests__/
│           └── run-tests.mjs   36 framework-free tests
├── scripts/
│   └── deploy.sh               Build + timestamped release script
├── docs/
│   ├── ARCHITECTURE.md         Deep-dive: data flow, module contracts, extension points
│   ├── MAKER_LAB.md            Tile engine reference for contributors
│   ├── ITEMS_AND_RECIPES.md    Full item + recipe catalog with drop sources
│   └── DEV_GUIDE_*.md          Per-system implementation guides
└── releases/                   Timestamped production builds
```

### Key design decisions

**No audio files.** Every sound is synthesized at runtime via Web Audio API oscillators, buffers, and gain nodes. This means zero asset loading time and a single-file deployment.

**No texture atlas.** Block colors are defined in `blocks.js` and rendered as flat-shaded Three.js materials. Art style is deliberately minimal — the world reads clearly at 60fps on a Chromebook.

**Maker Lab is Three.js-free.** Everything in `src/maker/` runs headlessly in Node.js. The 36-test suite requires no browser, no DOM, no build step — just `npm test`. Integration happens only at `ScrapBot.js` and `GameWorldAdapter.js`.

**compile() is always called before execution.** This is the non-negotiable AI safety rail. Spark emits JSON; `compile()` validates it against the primitives schema and rejects anything that isn't real hardware. Raw AI output never executes directly.

**BufferGeometry instancing.** The renderer maintains one InstancedMesh per block type. Block changes call `setMatrixAt()` rather than rebuilding geometry. This keeps frame time flat even with 16,000+ surface blocks visible.

---

## The STEM Education Layer

Scrapcraft is a game *first* and a curriculum *second* — but the curriculum is real.

| What happens in game | What it teaches |
|---|---|
| Dragging a `[WHEN distance < 0.3]` tile | Conditional logic, threshold comparison |
| Connecting `[IF line_under] → [drive] / [turn]` | Finite state machines |
| Watching the sensor readout while the bot runs | Closed-loop feedback, sensor interpretation |
| Exporting Arduino firmware and seeing the same behavior | Hardware abstraction, firmware architecture |
| Asking Spark to build a program | Prompt engineering, AI collaboration |
| Sharing a brain URL with a classmate | Version sharing, reproducibility |
| Timing bot laps and improving programs | Iterative engineering, optimization mindset |

The three-tier model: students start with **intent** ("follow the line"), graduate to **named functions** (tile programs), and prodigies peek into **firmware** (the exported `.ino`). All three tiers live in the same interface.

---

## Development

### Adding a new block

1. Add an entry to `src/data/blocks.js` — pick the next unused ID integer.
2. Define `color`, `emissive`, `drop`, `solid`, and `name`.
3. If the block should affect a sensor, update `GameWorldAdapter.js`.
4. Add a recipe in `src/data/recipes.js` if craftable.

### Adding a new sensor

1. Add an entry to `src/maker/primitives.js` → `SENSORS`.
2. Implement `read(robot, world)` using `GameWorldAdapter`.
3. Add firmware snippets under `firmware.arduino` and `firmware.micropython`.
4. Wire the sensor to real world state in `GameWorldAdapter.js`.
5. Add a test in `src/maker/__tests__/run-tests.mjs`. Run `npm test`.

### Adding an achievement

1. Add an entry to `ACHIEVEMENT_LIST` in `src/Achievements.js`.
2. Add the stat it checks to the `stats` bag (if new).
3. Update `track()` to increment the stat on the right event.
4. Update `load()`/`save()` in `SaveSystem.js` to persist the new stat.

### Environment variables

| Variable | Purpose |
|---|---|
| `VITE_ANTHROPIC_API_KEY` | Enables Spark live AI mode (optional — falls back to offline recipes) |

Set in `.env.local` (never commit this file).

---

## Testing

```bash
npm test
```

Output:
```
Compiler:          6 tests  ✓
VM wait:           2 tests  ✓
VM forever:        2 tests  ✓
VM counted loop:   2 tests  ✓
VM conditionals:   3 tests  ✓
VirtualRobot:      3 tests  ✓
End-to-end:        2 tests  ✓
FirmwareGen:       6 tests  ✓
Line follower:     2 tests  ✓
Presets:           4 tests  ✓
SparkOffline:      4 tests  ✓
──────────────────────────────
TOTAL:            36/36  ✓
```

The test suite covers the Maker Lab engine end-to-end: compiler, VM, robot physics, firmware generation, and offline recipe matching. It runs in under 200ms with no external dependencies.

---

## License

MIT — do whatever you want, but a star or a mention is appreciated.

---

*Built with Three.js, caffeine, and a healthy disregard for OSHA regulations.*
*"The yard has officially claimed you." — Earl*
