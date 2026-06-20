# Items & Recipes — Complete Catalog

Full reference for every item, drop source, and crafting recipe in Scrapcraft.

---

## Item categories

| Category | Description |
|---|---|
| `material` | Raw scrap — mined from blocks or dropped from containers |
| `tool` | Equippable tools that unlock crafting stations or grant abilities |
| `device` | Crafted machines and equipment |
| `vehicle` | Movement-enhancing vehicles |
| `wearable` | Equippable items that change player stats |
| `consumable` | Single-use items activated with `G` |
| `utility` | Signal and support items |
| `maker` | Maker Lab brains, sensors, and actuators |
| `companion` | ScrapBot and related companion items |

---

## Materials

| ID | Icon | Name | Stack | Source |
|---|---|---|---|---|
| `iron_scrap` | 🔩 | Iron Scrap | 64 | Rust Heap, Scrap Pile, Iron Block, Steel Beam |
| `copper_wire` | 🪢 | Copper Wire | 64 | Copper Conduit |
| `rubber_chunk` | ⬛ | Rubber Chunk | 32 | Barrel |
| `gear_small` | ⚙️ | Small Gear | 32 | Gear Tower |
| `circuit_board` | 🟢 | Circuit Board | 16 | Circuit Cluster |
| `fuel_can` | 🛢️ | Fuel Can | 16 | Barrel (rare drop) |
| `wood_plank` | 🪵 | Wood Plank | 32 | Crate |
| `glass_shard` | 💎 | Glass Shard | 32 | Crate, craft at Smelter |
| `spring` | 🌀 | Spring | 32 | Scrap Pile |
| `battery_dead` | 🔋 | Dead Battery | 16 | Circuit Cluster |
| `track_strip` | ▬ | Track Strip | 64 | Crafted; also spawns in Circuit City |
| `floodlight` | 💡 | Floodlight | 8 | Crafted |

---

## Tools

| ID | Icon | Name | Effect |
|---|---|---|---|
| `wrench` | 🔧 | Wrench | Required for Forge/mechanical recipes |
| `hammer` | 🔨 | Hammer | Required for structural recipes |
| `blowtorch` | 🔥 | Blowtorch | Required for forge/smelter welding |
| `pliers` | ✂️ | Pliers | Required for electrical/circuit recipes |
| `grapple_hook` | 🪝 | Grapple Hook | Extended reach when held |
| `scrap_magnet` | 🧲 | Scrap Magnet | 60% bonus drop from metallic blocks |

---

## Wearables

| ID | Icon | Name | Effect |
|---|---|---|---|
| `spring_boots` | 👟 | Spring Boots | Jump height ×2.5 |
| `night_goggles` | 🥽 | Night Goggles | Enhanced visibility at night |

---

## Vehicles

| ID | Icon | Name | Effect |
|---|---|---|---|
| `go_kart` | 🏎️ | Go-Kart | Movement speed ×3 |

---

## Consumables (G key)

| ID | Icon | Name | Effect on use |
|---|---|---|---|
| `repair_kit` | 🩹 | Repair Kit | +5 XP, visual pulse |
| `signal_flare` | 🚨 | Signal Flare | Summons Earl, red particles |
| `fuel_can` | 🛢️ | Fuel Can | Speed ×1.8 for 8 seconds |
| `battery_pack` | 🔋 | Battery Pack | +15 XP, energy flash |
| `charging_pad` | 🔌 | Charging Pad | ScrapBot circuit particle burst |

---

## Devices

| ID | Icon | Name | Stack | Notes |
|---|---|---|---|---|
| `pipe_cannon` | 💨 | Pipe Cannon | 1 | OSHA disapproves |
| `generator` | ⚡ | Generator | 1 | Required for Go-Kart unlock |
| `robot_arm` | 🦾 | Robot Arm | 4 | Required for ScrapBot |
| `radio_beacon` | 📡 | Radio Beacon | 1 | Summons Earl remotely |
| `flying_machine` | ✈️ | Flying Machine | 1 | Prestige build |
| `antenna` | 📻 | Signal Antenna | 1 | Extends Spark range |

---

## Companion

| ID | Icon | Name | Notes |
|---|---|---|---|
| `robot_helper` | 🤖 | ScrapBot | Follow mode (B) + tile programming (T) |

---

## Maker Lab items

### Brains (microcontrollers)

| ID | Icon | Name | Real hardware | Capabilities |
|---|---|---|---|---|
| `tin_brain` | 🧠 | Tin Brain | ATmega328P (Arduino Uno) | Basic sensors, drive, beep |
| `spark_brain` | ⚡ | Spark Brain | ESP32 | WiFi, Bluetooth, motion sensing, grab arm |
| `vision_brain` | 👁️ | Vision Brain | NVIDIA Jetson Nano | Computer vision, camera |

### Sensors

| ID | Icon | Name | Real hardware | Sensor ID |
|---|---|---|---|---|
| `ultrasonic_module` | 📡 | Ultrasonic Sensor | HC-SR04 | `distance_ahead` |
| `ldr_module` | ☀️ | Light Sensor | LDR photoresistor | `light` |
| `pir_module` | 👀 | Motion Sensor | PIR sensor | `motion_nearby` |
| `ir_module` | 🏁 | IR Line Sensor | TCRT5000 | `line_under` |

### Actuators

| ID | Icon | Name | Real hardware | Action ID |
|---|---|---|---|---|
| `buzzer_module` | 🔔 | Piezo Buzzer | Passive buzzer | `beep` |
| `servo_module` | 🦾 | Servo Motor | SG90 9g servo | `grab` |
| `motor_driver` | ⚙️ | Motor Driver | L298N dual H-bridge | `drive`, `turn` |
| `camera_module` | 📷 | Camera Module | CSI ribbon camera | (Vision Brain only) |

---

## Crafting recipes

### Tier 1 — Hand / anywhere

| Recipe | Output | Qty | Ingredients |
|---|---|---|---|
| `r_wrench` | Wrench | 1 | 🔩×3 🪵×1 |
| `r_hammer` | Hammer | 1 | 🔩×2 🪵×2 |
| `r_pliers` | Pliers | 1 | 🔩×2 🪢×1 |
| `r_repair_kit` | Repair Kit | 1 | ⬛×2 🪢×1 🌀×1 |
| `r_signal_flare` | Signal Flare | 3 | 🛢×1 🪢×2 |
| `r_glass_smelt` | Glass Shard | 4 | ⬛×1 🔩×2 *(smelter)* |

### Tier 1 — Workbench

| Recipe | Output | Qty | Ingredients | Tool |
|---|---|---|---|---|
| `r_blowtorch` | Blowtorch | 1 | 🔩×3 🪢×2 🛢×1 | — |
| `r_tin_brain` | Tin Brain | 1 | 🟢×2 🪢×4 🔩×3 | ✂️ |
| `r_ultrasonic_module` | Ultrasonic | 1 | 🟢×1 🪢×2 | — |
| `r_ldr_module` | Light Sensor | 2 | 🟢×1 🪢×1 | — |
| `r_buzzer_module` | Buzzer | 2 | ⚙️×1 🪢×1 | — |
| `r_motor_driver` | Motor Driver | 1 | 🟢×1 🔩×2 | — |
| `r_track_strip` | Track Strip | 8 | ⬛×2 🔩×1 | — |
| `r_floodlight` | Floodlight | 1 | 💎×2 🪢×2 🔩×3 | — |

### Tier 2 — Workbench

| Recipe | Output | Qty | Ingredients | Tool | Unlock after |
|---|---|---|---|---|---|
| `r_battery_pack` | Battery Pack | 2 | 🔋×2 🪢×3 ⬛×1 | ✂️ | — |
| `r_spring_boots` | Spring Boots | 1 | 🌀×4 ⬛×2 🔩×2 | 🔨 | — |
| `r_radio_beacon` | Radio Beacon | 1 | 🟢×2 🪢×4 💎×1 🔩×2 | ✂️ | — |
| `r_night_goggles` | Night Goggles | 1 | 💎×2 🪢×3 🟢×1 ⬛×1 | ✂️ | — |
| `r_grapple_hook` | Grapple Hook | 1 | cable×2 🔩×3 🌀×1 | 🔧 | steel_cable |
| `r_charging_pad` | Charging Pad | 1 | 🟢×2 🔋×2 🪢×3 🔩×2 | ✂️ | battery_pack |
| `r_pipe_cannon` | Pipe Cannon | 1 | 🔩×5 ⬛×1 🌀×2 | 🔧 | — |
| `r_ir_module` | IR Sensor | 4 | 🟢×1 🪢×2 | — | — |
| `r_antenna` | Antenna | 1 | 🪢×4 🔩×2 💎×1 | — | — |
| `r_pir_module` | PIR Sensor | 1 | 🟢×1 ⬛×1 | — | spark_brain |
| `r_servo_module` | Servo | 1 | ⚙️×2 🪢×2 | — | spark_brain |
| `r_sensor_array` | Radio Beacon | 1 | ultra×1 ldr×1 buzz×1 🟢×2 | ✂️ | tin_brain |
| `r_copper_spool` | Copper Wire | 8 | ⚙️×2 🔩×3 ⬛×1 | 🔥 | — |

### Tier 2 — Forge

| Recipe | Output | Qty | Ingredients | Tool |
|---|---|---|---|---|
| `r_robot_arm` | Robot Arm | 1 | 🔩×4 ⚙️×3 🪢×2 | 🔥 |
| `r_generator` | Generator | 1 | 🔩×6 ⚙️×4 🛢×2 🪢×3 | 🔧 |
| `r_steel_cable` | Steel Cable | 4 | 🔩×3 🌀×2 ⬛×1 | 🔨 |
| `r_scrap_magnet` | Scrap Magnet | 1 | 🔩×4 🪢×3 🔋×1 | — |

### Tier 3 — Forge

| Recipe | Output | Qty | Ingredients | Tool | Unlock after |
|---|---|---|---|---|---|
| `r_go_kart` | Go-Kart | 1 | 🔩×8 ⬛×4 ⚙️×6 🪵×4 | 🔧 | generator |

### Tier 3 — Smelter

| Recipe | Output | Qty | Ingredients | Tool | Unlock after |
|---|---|---|---|---|---|
| `r_robot_helper` | ScrapBot | 1 | arm×2 🟢×4 ⚙️×6 🔋×2 🪢×5 | 🔥 | robot_arm |
| `r_flying_machine` | Flying Machine | 1 | 🔩×12 gen×1 arm×2 🟢×6 ⬛×4 🛢×4 💎×3 | 🔥 | go_kart |
| `r_spark_brain` | Spark Brain | 1 | tin×1 🟢×3 🪢×6 🛢×1 | 🔥 | tin_brain |
| `r_vision_brain` | Vision Brain | 1 | spark×1 🟢×5 💎×3 🛢×2 | 🔥 | spark_brain |
| `r_mega_battery` | Battery Pack | 4 | 🔋×6 🪢×4 ⬛×2 🛢×1 | 🔥 | battery_pack |

---

## Drop tables (block → item)

| Block | Drop | Notes |
|---|---|---|
| Rust Heap | iron_scrap ×2–4 | Common |
| Scrap Pile | iron_scrap ×1–3, spring ×0–1 | — |
| Iron Block | iron_scrap ×1–2 | — |
| Steel Beam | iron_scrap ×2–3 | — |
| Copper Conduit | copper_wire ×2–4 | — |
| Barrel | rubber_chunk ×1–2, fuel_can (10% chance) | — |
| Crate | wood_plank ×1–2, glass_shard ×0–1 | — |
| Circuit Cluster | circuit_board ×1–2, battery_dead ×0–1 | Rare |
| Gear Tower | gear_small ×2–4 | — |

**Scrap Magnet bonus:** When held, gives a 60% additional drop from any metallic block (Rust Heap, Scrap Pile, Iron Block, Steel Beam, Copper Conduit, Circuit Cluster).
