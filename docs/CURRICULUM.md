# CURRICULUM — The Honest Concept Ladder

## The Mission

> "Middle schoolers (11-14) building robots in a scrapyard. Embedded systems, one knob at a time."

This game teaches real embedded engineering disguised as play. No lecturing. No worksheets. Kids salvage, build, code, crash, debug, and race real robots made of game scrap. The curriculum is the lived experience: what they practice becomes what they know.

---

## The Ladder as Lived

### Four Tiers × Sixteen Concepts

**Tier 1: SENSE** — Reading the world (sensors, calibration, thresholds)
**Tier 2: THINK** — Making decisions (conditionals, loops, variables, debugging)
**Tier 3: ACT** — Doing things (actuation, feedback, optimization)
**Tier 4: ENGINEER** — Building systems (firmware, failure analysis, integration, power)

| # | CONCEPT | TIER | WHERE TAUGHT | HOW PRACTICED | ASSESSED? |
|---|---------|------|-------------|------|-----------|
| 1 | **sensors-overview** | SENSE | Ch6 (Deep Yard) / earl-11, juno-3 | Run bot in varying light; watch sensor readings in editor | TEACHBACK q1-2; play-testing |
| 2 | **thresholds** | SENSE | Ch5-6 (Oval physics) / earl-9 | Adjust light/distance thresholds in line-follower; see immediate effect | TEACHBACK q5-6; broken-bot clinic |
| 3 | **calibration** | SENSE | Ch6-7 (Deep Yard + Export) / earl-14 | Recalibrate light sensor for new rooms; feel the difference | No formal test (add: calibration clinic in future) |
| 4 | **conditionals** | THINK | Ch4-5 (First Program) / earl-7, earl-9 | Write "if" tiles; watch bot avoid walls or follow lines | **TEACHBACK q1-2** |
| 5 | **loops-forever** | THINK | Ch4 (Feedback Loop) / earl-7 | Program "forever" loops for constant sensing | **TEACHBACK q3-4** |
| 6 | **loops-counted** | THINK | Ch5-6 (Repeated Actions) / juno-2 | Use counted loops for "n times" actions | **TEACHBACK q5-6** |
| 7 | **loops-until** | THINK | Ch5-6 (Drive-to-Wall) / earl-9, juno-4 | Write "until distance < 20" conditions | **TEACHBACK q7-8** |
| 8 | **variables** | THINK | Ch7 (Firmware Export) / earl-8 | Use var tiles; see them change in real code | **TEACHBACK q9-10** |
| 9 | **subroutines** | THINK | Ch7 (Code Compression) / side-write-shorter | Call named blocks multiple times; reduce tile count | **TEACHBACK q11-12** |
| 10 | **actuation** | ACT | Ch3-4 (Build a Friend) / earl-4 | Command motors; see results | TEACHBACK q13-14; no formal assessment |
| 11 | **feedback-loop** | ACT | Ch4 (One Knob at a Time) / earl-6, earl-7 | Sense → decide → act → sense again, live | **TEACHBACK q15-16** (sense-think-act spine) |
| 12 | **optimization** | ACT | side-write-shorter (Same Lap, Fewer Tiles) | Compress line-follower: fewer tiles, same lap time | **TEACHBACK q17-18**; experiment-tracked |
| 13 | **debugging** | ENGINEER | Ch4 + Ch8 (Plaques) / side-debug-clinic | Hypothesis-first: read symptom, change one thing | **TEACHBACK q19-20**; broken-bot clinic (3 scenarios) |
| 14 | **firmware-export** | ENGINEER | Ch7 (The Same Robot, Real) / earl-8, earl-18 | Export to Wokwi; see tiles become C++ | **TEACHBACK q21-22** (Spark only) |
| 15 | **failure-analysis** | ENGINEER | Ch8 (Fail Loudly) / plaques & monuments | Read crash data; learn from others' wrecks | Assessment via plaque-reading + logbook |
| 16 | **power-systems** | ENGINEER | Ch3, Ch12 (Power & Race Day) / earl-3, earl-15 | Craft solar panels, manage battery; race-day checks | Play-tested; no formal teachback |

**Legend:** TEACHBACK = invisible assessment question included; broken-bot clinic = guided diagnostic; play-tested = learned through doing, surfaced in logs.

---

## The Gaps (Honest Assessment)

### What Was Missing Before This Release

**1. Assessment Without Testing**
- The old curriculum taught concepts (kids learned by playing) but never asked them to *explain* the concepts.
- No safe way to know if a kid understood thresholds vs. conditionals, or just got lucky on a lap.
- **Fix:** Teachback questions (28 total, 2 per core concept). Rivet/Bolt/Juno/Magma ask genuinely naive questions; kid answers and teaches them back. Feels like play, *is* assessment.

**2. Debugging Was Preached, Never Played**
- Ch4 taught "one knob at a time" as a plaque.
- Ch8 showed other people's wrecks (failure monuments).
- But kids never *practiced* diagnosing their own broken code in a guided way.
- **Fix:** Broken-bot clinic (3 diagnostic scenarios: inverted sonar, missing break, wrong sensor). Earl gives hints; kid forms hypothesis; runs the fix. Debugging is now a playable skill.

**3. Optimization Had No Challenge**
- Subroutines existed, but no quest forced kids to use them.
- Loop economy (reducing tile count) was never measured.
- **Fix:** "Same Lap, Fewer Tiles" side quest (Bolt affinity). Three experiments, hypothesis-driven: prove the line-follower works in fewer tiles. Optimization becomes concrete.

**4. Teacher Tools Showed Grades, Not Concepts**
- XP and bond metrics tracked engagement, not understanding.
- No way for teachers to quickly see what concepts each kid was solid on.
- **Fix:** This curriculum document + mission cards. Teachers can now scan one page and see: "Ch4 teaches feedback loops; kids show it by running the Mellon Loop. Assess it with teachback q15-16."

---

## What This Release Adds

### Deliverable: Teach-Back (src/learning/data/teachback.json)

**28 Questions across 14 concepts.** Rivet, Bolt, Juno, and Magma ask kid-friendly questions with real misconceptions baked into the wrong answers.

Examples:
- *Rivet:* "If I see a wall, I turn left—does that mean 'if' is like definitely turning?"
- *Bolt:* "If distance < 50, does it check constantly or just once at the start?"
- *Juno:* "Can a forever loop use up all the battery?"

**Why it works:** Companion asks naively (no shame), kid becomes the teacher. The answer lived in the kid's hands-on experience. Misconceptions are real (collected from middle schoolers): "if means maybe," "forever loops use power faster," "variables stay locked."

**Integrated:** After any major quest chain, a companion can ask a random teachback question. Kid answers; companion has an "OH!" moment if correct, or gently offers a retry. No fail state. No score. Just conversation, revealing understanding.

### Deliverable: Broken-Bot Clinic (src/learning/data/brokenbots.json)

**3 Diagnostic Scenarios** (systems coder implements as playable encounters):
1. **left-forever** — Bot spins left in open space. Hypothesis: sonar comparison is inverted (< vs >). Hints escalate from "read the sensor" to "change the comparison operator."
2. **never-stops** — Bot drives into wall forever. Hypothesis: missing break/exit condition in the loop. Hints guide: "when does the loop END?"
3. **wrong-sensor** — Light-runner ignores flashlight, responds to bump sensor. Hypothesis: code reads wrong sensor. Hints: "which sensor is the 'if' actually checking?"

**Why it works:** Real misconceptions kids hit. Earl's gruff coaching preserves dignity. Hypothesis-first (not trial-and-error). One change = observable fix. Debugging becomes a skill that transfers.

### Deliverable: Side Quests (2 new, src/quests/data/side-quests.json)

1. **rivet-debug-clinic** (friend-gated, Rivet affinity)
   - Watch the spinning bot twice
   - Edit code and run it once more
   - Experiment: flip the comparison
   - Teaching: "Debugging — symptoms to causes: read behavior, form hypothesis, change ONE thing"
   - Reward: repair kit + copper wire
   - Bonds Rivet's "I'm good at spotting broken things" with kid's new debugging power

2. **bolt-write-shorter** (friend-gated, Bolt affinity)
   - Three runs of the line-follower, each smaller than the last
   - Three experiments: loops vs subroutines, each one measured
   - Teaching: "Optimization — same behavior, less code: loops and subroutines as compression"
   - Reward: crystal fragments + battery
   - Bonds Bolt's pit crew economy ("economy," "efficiency") with code elegance

### Deliverable: Mission Cards (docs/mission-cards.md)

**12 Printable Cards** (one per chapter).
- Chapter title & core skill
- 3 discussion prompts (for co-teacher or parent)
- 1 offline "unplugged" activity (no power needed)

Example (Ch4):
- **Skill:** The feedback loop
- **Discussion:** Why did changing one knob work? What's harder—understanding the break or trusting one change?
- **Activity:** "One Change at a Time"—mark a lap on the floor, race three times, change only one variable each time (speed, angle, height). Which single change worked best?

**Why it works:** Teachers can run the offline activity in a hallway or home. It surfaces the concept mechanically, no code. Kids experience the loop (sense the difference, adjust, test) before they program it. Transfers understanding.

---

## For Teachers: Standards Alignment

### How Tiers Map to Real Computer Science & Embedded Standards

**Tier 1: SENSE** → **Data & Measurement** (CS Standards 3A, 3B)
- Real concept: Reading analog input from sensors; understanding noise and calibration
- Scrapcraft version: Kids calibrate light sensors for different rooms, see real-time drift
- Informal standard: "Students collect and analyze data from physical systems"
- Transfer: Understanding why weather stations exist; why phones need compass calibration

**Tier 2: THINK** → **Control Flow & Logic** (CS Standards 2A, 2B, CS50 foundations)
- Real concept: Conditionals, loops, state machines, variables
- Scrapcraft version: "If" and "until" prevent crashes; forever loops keep the bot working; variables hold sensor readings
- Informal standard: "Students trace logic, predict outputs, debug decisions"
- Transfer: Understanding why programs need branches and loops; how to think algorithmically

**Tier 3: ACT** → **Feedback Systems** (Engineering Standards ETS1, ETS3)
- Real concept: Actuators (motors), power management, closed-loop control, optimization
- Scrapcraft version: Kids see motors stall under load; optimize code to save memory; run feedback loops that keep bots on course
- Informal standard: "Students understand systems, energy, and feedback"
- Transfer: Understanding robotics, power budgets, why real systems are harder than simulations

**Tier 4: ENGINEER** → **System Integration & Failure Analysis** (Engineering Standards ETS2, ETS4; CS50 final projects)
- Real concept: Firmware export (abstraction across layers), post-mortems, power checks, debugging under constraints
- Scrapcraft version: Program → tiles → C++ code → real chip; read plaques to learn from failures; check battery before race day
- Informal standard: "Students design, build, test, and iterate on integrated systems"
- Transfer: Understanding product development, why real engineers keep detailed logs, how to handle failure as data

### Quick Checklist for Alignment

If your district asks "Where are your standards?"—use this:

- **Data Literacy:** Ch6 (calibration), Ch10 (timestamps + correlation)
- **Computational Thinking:** Ch4 (feedback loop, one-knob-at-a-time)
- **Control Systems:** Ch5 (closed-loop racing), Ch9 (night racing under signal loss)
- **Engineering Design:** Ch11 (multi-system rebuild), Ch12 (race-day integration)
- **Debugging & Resilience:** Ch8 (plaques), side-debug-clinic (hypothesis-first)
- **Efficiency:** side-write-shorter (code compression)

---

## Implementation Notes

### Roll-Out Strategy (For Designers/Implementers)

1. **Teachback (Tier 1):** Integrate companion question system into the Tracker. After major arcs (Ch4, Ch7, Ch10, Ch12), a companion can ask a stored question. No forced sequence—just availability.

2. **Broken-Bot Clinic (Tier 1):** Add as a side-location encounter in the yard (Earl's diagnostic shed or the repair pit). Three bot scenarios, escalating hints, one-change-at-a-time testing. Players can return to practice.

3. **Side Quests (Tier 1):** Already integrated. Verification: `node src/maker/__tests__/run-tests.mjs` confirms arc size (side: 12 → 14 quests total).

4. **Mission Cards (Tier 2):** Print + distribute. No game integration needed. These are teacher handouts.

5. **Curriculum Doc (Tier 2):** Post publicly. Teachers use it to understand the scope and justify to parents/admin. It's not a strict pacing guide—it's an honest map.

### What Still Needs Work

- **Calibration Clinic:** Sensor drift + recalibration should be its own guided experience (not yet built).
- **Power Systems:** Ch3 and Ch12 touch it, but no deep dive on voltage, current, thermal management. Next release?
- **Real Hardware Progression:** Kids export to Wokwi but don't (yet) flash real Arduino boards. That's phase 2.

---

## Closing: Why This Curriculum Works

This curriculum doesn't tell kids what to learn. It shows them problems, gives them tools, lets them fail safely, and celebrates the failure as data. By the end of the twelve chapters, they've:

- **Built** (Ch1-3): physical systems from scrap
- **Coded** (Ch4-7): logic in tiles, firmware in C++
- **Raced** (Ch5, Ch9, Ch12): against the clock and each other
- **Debugged** (Ch4, Ch8, side-debug-clinic): by reading behavior, not guessing
- **Optimized** (side-write-shorter): fewer tiles, same result
- **Failed** (Ch8): loudly, on purpose, and learned from it

That's embedded engineering. They just didn't know they were doing it.

**Print this. Share it. Let kids teach it back to you.**
