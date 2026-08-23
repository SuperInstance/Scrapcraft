# TEACHER PACK — Unit 1: "Teach Your Robot"
**Grades 6–8 · 8 lessons × 45 min · browser-only · no accounts**

> Print this pack. Everything else (full lesson plans, rubric detail, privacy statement) is in [UNIT-1.md](UNIT-1.md). Machine-readable mapping for the teacher console: `src/learning/data/unit1.json`.

---

## Materials (whole unit)

**Every lesson:** student browser (Chromebook OK) · paper + pencil · this pack.
**Specific lessons:** tape + index cards (L2) · grey paint chips or printed gradient (L3) · printed bug-triage cards (L6, templates below) · printer/shared doc for firmware exports (L8).
**That's the whole list.** No installs, no accounts, no downloads.

---

## Access & Day-Zero (read before Lesson 1)

- **Game URL:** any modern browser. Public URL pending deployment — pilots get it from the project or run locally. On the board before students arrive.
- **Same machine every lesson** (saves live in that browser). Assign seats on shared carts.
- **Room codes (optional):** create a class in the teacher console, students join with code + display name. **First names or initials only** — names are student-typed and visible to the class console.
- **Offline plan:** every warm-up runs on paper. Network dies, extend the warm-up + that lesson's paper activity (L1 bot-design boxes, L2 flowchart cards, L3 chips, L4 shoelace, L5 transcript sort, L6 triage cards, L7 fault debate, L8 be-the-compiler). No lesson dies with the Wi-Fi.
- **Timing:** each lesson = warm-up (6-7) + frame (3-4) + game (22-25) + teach-back (8-12) + close (2) = **45 exactly.** The close is one exit sentence: "what did your bot teach you today?"

---

## Lesson cards (one glance each)

### L1 — A Pile of Parts Is Not a Robot
**Students learn:** power, structure, and actuation are three systems; a bot without senses is a paperweight.
**Do:** 7 min "Human Bot" pairs → 3 min frame → 25 min game Ch1–3, quests earl-1…earl-5 (first contact is SLOW — target is a first build underway; the boot beep opens L2 for slow classes) → 8 min Magma teach-back ("why does it need the other junk?") → 2 min close.
**If tech fails:** swap warm-up roles, then paper-design a bot — three boxes: POWER / STRUCTURE / MOVEMENT — plus one sentence on what it still can't do.
**Mastery:** names all three systems without prompting.
**Earl opener:** *"I got a crate of motors that never once talked to a sensor. Paperweights."*
**Big Ideas:** 1-seed, 5-seed · **Game:** earl-1…earl-5 (earl-6 "Build a Brain" opens L2)

### L2 — Sense, Think, Act
**Students learn:** if-tiles inside forever loops; the sense→decide→act loop.
**Do:** 6 min "Walk the flowchart" (taped path, IF cards; flip one card absurd) → 25 min Ch4 "One Knob at a Time," one change per run → 8 min live teach-back `tb-conditionals-1`.
**Earl opener:** *"If the bot never checks anything, it just keeps doing the first thing forever?"*
**Mastery:** explains THEN-vs-ELSE *and* volunteers that both never run in the same pass.
**Big Ideas:** 2, 1 · **Game:** earl-6, earl-7

### L3 — Drawing the Line
**Students learn:** thresholds are choices, not facts; recalibrate when the world changes.
**Do:** 6 min "Where does black become white?" (paint chips, private answers, compare) → 25 min oval line-follower + library calibration (ch9-1 stretch) → 8 min Juno teach-back ("why is it drunk in the dusty stacks?").
**Earl opener:** *"Rivet keeps insisting gray is basically white. You gonna let him get away with that?"*
**Mastery:** says some version of “the sensor's world changed, so the old threshold is a lie — recalibrate.”
**Big Ideas:** 1 · **Game:** earl-9, bolt-3, ch9-1

### L4 — Same Job, Less Code
**Students learn:** counted/until loops, variables, subroutines as compression — same lap, fewer tiles.
**Do:** 7 min shoelace pseudocode (write 15 steps, rewrite with "repeat 2×", count savings) + 2-min scoreboard beat ("where does the robot write the lap count?" — a variable is the scoreboard; introduced today, not quiz-stressed) → 25 min side quest "Same Lap, Fewer Tiles" (hypothesis sentence required) → 8 min teach-back (forever vs until vs counted).
**Earl opener:** *"You wrote the same three tiles eight times. You building a program or a wall?"*
**Mastery:** picks loops by asking “do I know when it ends?” — not by syntax.
**Big Ideas:** 2 · **Game:** bolt-write-shorter, earl-19 (stretch)

### L5 — Which Friend Actually Learns? ⚡AI-literacy center
**Students learn:** Earl & co. are scripts; Spark is a real learned model; "learning from data" at sixth-grade level.
**Do:** 6 min "Rule-follower or learner?" card sort (thermostat/autocomplete/adventure-book/dog/spam-filter — the book is the trick) → 25 min: talk to a scripted companion twice, then Spark (or paper-fallback transcripts if offline) → 8 min teach-back ("which one LEARNED?").
**Earl (the honest one):** *"Folks ask if I 'know' 'em from last time. Nah — you do the remembering. That's kinda the point."*
**Mastery:** “Earl's writers wrote everything he'll ever say; Spark generates from patterns in data — so it can say new things, and new wrong things.”
**Big Ideas:** 3, 4, 5-seed · **Game:** Spark + companion comparison · **Offline fallback: yes (paper transcripts)**

### L6 — The Detective's Clinic
**Students learn:** hypothesis-first debugging — symptom → hypothesis → ONE change → re-run.
**Do:** 7 min bug-triage card sort (sensor/logic/power piles) → 25 min Broken-Bot Clinic ×3 (hypothesis sentence BEFORE touching code; rivet-2 or bolt-side-3 stretch) → 8 min Rivet teach-back ("how did you know before you fixed it?").
**Earl opener:** *"The bot sees nothing and decides nothing. Start by asking: what IS the sensor reading right now?"*
**Mastery:** reconstructs the evidence chain (symptom → reading → hypothesis → one change), not just the fix.
**Big Ideas:** 2, 1 · **Game:** brokenbot-left-forever / never-stops / wrong-sensor, rivet-2 + bolt-side-3 (stretch)

### L7 — Fail Loudly, Learn Publicly 💥Societal Impact
**Students learn:** failures are data; real-world robot failures have human costs; write an honest plaque.
**Do:** 6 min "Who's at fault?" (delivery robot in a pond — pick ONE: sensor/coder/calibration/company, defend) → 25 min Ch8 plaque wall + write your own plaque from any crash in L1–6 → 8 min Rivet teach-back ("why is yours worth one?").
**Earl opener:** *"Every wreck wrote a letter. Reading it is the cheapest education you'll ever get."*
**Mastery:** the plaque names a *cause*, not just a crash — and the student says what it teaches a reader. (ch8-2 “Ask Spark Why Someday” is titled narratively; its content is offline — no Spark call.)
**Big Ideas:** 5 (the 6–8 first-class topic), 2 · **Game:** ch8-1…ch8-3

### L8 — Export Day: The Same Robot, Real 🎓Capstone
**Students learn:** tiles really compile to C++/MicroPython; every student leaves holding real code with their name on it, and teaches one concept to the class.
**Do:** 6 min "Be the compiler" (English → symbols, compare three versions) → 22 min Ch7 export chain (print the firmware; flash a board live ONLY if IT allows) → 12 min **partner-pair expo**: each student teaches their strongest concept to a partner for 60 s, swap; teacher circulates with the 3-item checklist (names the idea / shows it in their bot / answers one question); 2–3 volunteers close for the class → 2 min close.
**Earl opener:** *"Chips don't think — they do exactly what you told 'em, in a language you couldn't read last month."*
**Capstone debate:** *"Your threshold works on THIS floor. The school buys darker floors. Who should have thought about that?"*
**Mastery:** finds their name in the firmware header and maps three lines of C++ to three of their tiles.
**Big Ideas:** 2, 5 · **Game:** ch7-1…ch7-3, earl-8/18/20, magma-3…5

---

## Misconception guide (from the teach-back distractors & clinic bugs)

| Students say… | What's actually true | When it shows up |
|---|---|---|
| "If means maybe" | If is a test with a definite answer: TRUE road or ELSE road, never both in one pass | L2 |
| "Forever loops drain the battery faster" | The loop runs at the same speed forever; power draw is about what's inside it | L2 |
| "The sensor is wrong" | The sensor reports a number; the THRESHOLD decides — and we chose it | L3, L6 |
| "One threshold works everywhere" | Thresholds are promises made to one room; new conditions renegotiate (this is also how bias enters machines — seed it, don't lecture) | L3, L8 |
| "Calibration means something was broken" | Calibration is maintenance, not repair | L3 |
| "Variables stay locked at one value" | Changing is a variable's whole job | L4 |
| "Shorter code is always better" | Same lap, fewer tiles, *still readable* — budgets include humans | L4 |
| "Everything that talks is AI" | Earl/Rivet/Bolt/Juno/Magma are scripted; Spark is the learned model — knowing which is which is the lesson | L5 |
| "Spark understands me" | Spark predicts likely language from patterns; it can be wrong in new ways | L5 |
| "Debugging means fixing" | Debugging means EXPLAINING first — hypothesis, one change, evidence | L6 |
| "It's broken" (reflex) | Two of three clinic bugs are logic, not hardware | L6 |
| "Failure is bad" | Failure is data; the yard displays it on purpose | L7 |
| "The export is magic" | The export is a translation — find your name in the header, map three lines to three tiles | L8 |
| "Simulation is fake, hardware is real" | The simulation enforced real constraints all unit | L8 |

---

## Bug-triage cards (L6 — print & cut)

**Print one set per group of 3–4. Sort each card: SENSOR / LOGIC / POWER. Defend one sort aloud.**

1. "The nightlight never turns on, even in full dark." *(sensor — or its threshold)*
2. "The fan responds to the wall switch but not the remote." *(sensor — listening to the wrong input)*
3. "The robot vacuum bumps the same chair every single morning." *(logic — no learned path / loop without update)*
4. "The tablet works perfectly until 3 pm, then dies. Every day." *(power)*
5. "The sprinkler runs even when it's raining." *(logic — no sensor check, or inverted test)*
6. "The automatic door opens for the delivery truck but not for me." *(sensor/threshold — and quietly: whose threshold?)*

*(Card 6 is the bias seed — flag it for L8's debate.)*

---

## Assessment quick-reference

The game tracks `unseen → seen → practiced → taught` per concept — **teaching is the test; rungs only rise; wrong answers just route back to practice.** Your human check per tier:

- **SENSE:** explains readings as numbers + thresholds as choices; recalibrates unprompted
- **THINK:** predicts before running; picks loops by "do I know when it ends?"; defends compression
- **ACT:** names the three systems; describes the loop unprompted; respects budgets
- **ENGINEER:** hypothesis chains in the clinic; honest plaque (cause, not crash); maps tiles → C++ lines

**"Not yet" is a location, not a failure.** Full rubric: UNIT-1.md §4.

---

## Privacy card (for the sub folder / district file)

**Solo mode (default): no accounts, everything local. Classroom mode (optional): room code + student-typed display name in the project save backend — first names/initials only. USCP telemetry OFF in classroom default — nothing to opt out of; it does not ship on. No voice features ship.** Spark (optional, L5 only) sends the typed question to the project-run scrap-spark service for a cached reply — no account, no profile — but know plainly: typed questions can contain personal info (guidance: no real names in questions), and the content-keyed cache is shared (same question replays the same reply). **Recommended for pilots: Spark off — the unit is complete without it.** Full statement: UNIT-1.md §5.

---

*Unit 1 v1 — research bet #1 build ([RESEARCH-2026-08.md](../RESEARCH-2026-08.md)). Expect v2 after the first pilot classrooms. Frameworks: AI4K12 (ai4k12.org, NSF-supported per site), Experience AI (experience-ai.org) — theme names in these cards are our paraphrases, not official lesson titles.*
