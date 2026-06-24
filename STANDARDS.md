# Scrapcraft — Standards Alignment

Scrapcraft is a browser-based robotics programming game targeting grades 5–8.
Students design robot behavior using visual tile programming, generate real
MicroPython/Arduino firmware, and optionally flash their code to physical ESP32
hardware — all without any installation.

---

## CSTA K-12 CS Standards

| Standard | Code | How Scrapcraft Addresses It |
|---|---|---|
| Algorithms & Programming: Sequences | **1B-AP-10** | Students sequence drive, turn, wait, and output tiles to create robot behavior |
| Algorithms & Programming: Loops | **2-AP-10** | `forever` and `repeat N` loop tiles control continuous robot motion |
| Algorithms & Programming: Conditionals | **2-AP-12** | `if` and `if/else` tiles trigger actions on sensor readings (distance, light, bumper) |
| Algorithms & Programming: Decomposition | **2-AP-14** | Students decompose "avoid walls and seek light" into sub-programs using nested blocks |
| Algorithms & Programming: Abstraction | **2-AP-11** | Sensor tiles abstract hardware I/O (ADC readings become named values like `brightness`) |
| Algorithms & Programming: Testing & Debugging | **2-AP-19** | In-game simulation shows sensor values live; efficiency grade surfaces over-budgeted programs |
| Impacts of Computing: Inclusive Design | **2-IC-21** | Classroom system uses no PII, no email — COPPA-compliant by design |
| Networks & Internet: Hardware | **3A-NI-04** | Flash Receipt shows the real firmware students are sending; WebSerial bridge uploads to ESP32 |
| Data & Analysis: Inference | **2-DA-08** | Students interpret live sensor readings to tune robot behavior |

---

## NGSS Science & Engineering Practices

| Practice | How Scrapcraft Addresses It |
|---|---|
| **SEP 1 — Asking Questions** | Each Mission Card presents a design challenge that requires students to state a behavioral goal for their robot |
| **SEP 2 — Developing & Using Models** | Tile programs are abstract models of physical robot behavior; students simulate before flashing |
| **SEP 3 — Planning & Carrying Out Investigations** | Students modify one tile at a time, re-run, and observe the change in robot behavior |
| **SEP 5 — Using Mathematics & Computational Thinking** | Distance sensor values (0–1 normalized), timing (seconds), and efficiency budget (0–100%) quantify design decisions |
| **SEP 6 — Constructing Explanations** | The Flash Receipt modal shows generated firmware alongside stats — students explain why a leaner program earns a higher grade |
| **SEP 8 — Obtaining, Evaluating, Communicating** | Shared brain library lets students publish programs and evaluate peers' approaches |

---

## Common Core Math Connections

| Domain | Connection |
|---|---|
| **Ratios & Proportional Relationships (6.RP)** | Sensor values are ratios (0.0 → 1.0); students reason about thresholds |
| **Expressions & Equations (6-8.EE)** | Conditional tiles use comparison operators (<, >, ≤, ≥, =, ≠) on sensor values |
| **Statistics & Probability (6-8.SP)** | Efficiency grade and budget percentage show variability across runs; students see distributions |

---

## Next Generation Science Standards — Engineering Design

| Performance Expectation | Alignment |
|---|---|
| **MS-ETS1-1**: Define criteria and constraints | Mission Card challenges give explicit success criteria (e.g., "survive 30s without bumping") |
| **MS-ETS1-2**: Evaluate competing solutions | Students compare programs by efficiency grade; the Brain Gallery shows community solutions |
| **MS-ETS1-3**: Analyze data to improve | Live sensor panel and budget metric let students diagnose and iterate |
| **MS-ETS1-4**: Build and test at increasing scale | Virtual simulation → Wokwi browser simulation → physical ESP32 hardware |

---

## Time & Scope Recommendations

| Session | Duration | Activity |
|---|---|---|
| Intro | 45 min | Complete the 6-step Mission Card tutorial; run the pre-loaded Wall Avoider program |
| Exploration | 45 min | Modify the Wall Avoider; try the Light Seeker preset; open the Codex |
| Design Challenge | 45–90 min | Teacher assigns a challenge; students tune their programs for the highest grade |
| Real Hardware (optional) | 45 min | Use Chrome + WebSerial to flash student programs to ESP32 dev boards |
| Showcase | 20 min | Students share their Brain in the gallery and explain their design decisions |

---

## Hardware Kit for Physical Robot Sessions (Optional)

| Component | Notes | ~Cost (2025) |
|---|---|---|
| ESP32 Dev Board (38-pin) | Any WROOM-32 variant | $4–8 |
| L298N motor driver | Dual H-bridge, 5V logic | $2–4 |
| 2× N20 gearmotors (6V) | 150–300 RPM | $3–6/pair |
| HC-SR04 ultrasonic sensor | Distance sensor | $1–2 |
| LDR + 10kΩ resistor | Light sensor voltage divider | <$1 |
| 7.4V LiPo battery + BMS | 1000–1500 mAh | $8–15 |
| Chassis (laser-cut or 3D print) | STL/DXF files in `/hardware/` | varies |

Total per robot: **~$20–40** depending on sourcing.

Wokwi diagram (generated from the Flash Receipt screen) maps directly to this
pinout so students can simulate before assembling.

---

*Scrapcraft is open source and free to use in educational settings.*
*Questions: open an issue at github.com/superinstance/scrapcraft*
