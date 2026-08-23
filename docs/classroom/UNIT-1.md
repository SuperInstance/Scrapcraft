# UNIT 1 — "Teach Your Robot"

> A complete 8-lesson classroom unit for **grades 6–8 (ages 11–14)** · 45 minutes per lesson · browser-only.
> Source bet: [RESEARCH-2026-08.md](../RESEARCH-2026-08.md) §4 Bet 1 — classroom beachhead in the LEGO SPIKE transition window.
> Companion files: [TEACHER-PACK-1.md](TEACHER-PACK-1.md) (printable pack) · [pack.html](pack.html) (print-ready page) · [unit1.json](../../src/learning/data/unit1.json) (machine-readable mapping, ledger-ID coordinated).

---

## 0. What this unit is — and isn't

**Is:** an 8-lesson arc through Scrapcraft's concept ladder (SENSE → THINK → ACT → ENGINEER, 17 concepts in `src/learning/concepts.js`) that ends with every student exporting a real firmware file and teaching a concept back to the class. Assessment is the game's own teach-back system — the student becomes the teacher; no quizzes.

**Isn't:** a hardware course. The unit is **simulation-first**: every lesson runs in a browser on a Chromebook. The firmware export (Lesson 8) produces real C++/MicroPython text a class can read, print, and — only if the school's IT allows WebSerial — flash to a real board. No lesson *requires* hardware. (Honesty note from the research: WebSerial is blocked on many managed Chromebooks; export-as-artifact is the default, live flashing is the bonus.)

**Framework anchors (cited):**
- **AI4K12** (AAAI + CSTA initiative) — the **Five Big Ideas**: 1 Perception, 2 Representation & Reasoning, 3 Learning, 4 Natural Interaction, 5 Societal Impact; grade-band progression charts K-2/3-5/**6-8**/9-12 ([ai4k12.org](https://ai4k12.org/), [grade-band charts](https://ai4k12.org/gradeband-progression-charts/)). In grades 6–8, **Societal Impact becomes a first-class topic** — Lessons 7 and 8 deliver it deliberately. Big Idea 1's core statement — *"Computers perceive the world using sensors; perception is the process of extracting meaning from sensory signals"* — is literally Lessons 2–3.
- **Experience AI** (Raspberry Pi Foundation + Google DeepMind) — free AI-literacy programme for **exactly ages 11–14**, with lesson plans, slide decks, and worksheets ([experience-ai.org](https://experience-ai.org/en/)). Scrapcraft supplies what Experience AI lacks — a world students *re-enter voluntarily* — so each lesson below names the Experience AI **theme** it pairs with — theme names here are *our paraphrases, not official lesson titles*; browse the free lesson library at experience-ai.org for the current official set (teachers can run the Experience AI lesson as homework/prep and Scrapcraft as the lab).
- **Teach-back / protégé effect** — expecting-to-teach measurably improves learning, organization, and effort ([Stanford AAA Lab, teachable agents](https://aaalab.stanford.edu/teachable-agents/research)); the teach-back *method* itself originates in health communication and is AHRQ-endorsed there ([TeamSTEPPS](https://www.ahrq.gov/teamstepps-program/curriculum/communication/tools/teachback.html)) — the classroom evidence weight sits with the Stanford line. Scrapcraft's companions implement this as gameplay.
- **Informal CS/engineering standards mapping** (CSTA 2A/2B, 3A/3B; NGSS ETS1–ETS4) lives in [CURRICULUM.md](../CURRICULUM.md) §Standards.

**The honesty spine (say these out loud to students):**
1. Earl, Rivet, Bolt, Juno, and Magma are **scripted characters** — branching dialogue, not learned models. **Spark is a real language model** (Lesson 5 makes this difference the lesson itself).
2. Your tiles **really do compile** to C++/MicroPython. That part is not a metaphor.
3. Failing loudly is the curriculum, not an accident. The plaque wall is a library.

---

## 1. The arc at a glance

| # | Lesson | Tier focus | Concepts (ledger IDs) | AI4K12 Big Ideas | In-game spine |
|---|--------|-----------|----------------------|------------------|---------------|
| 1 | A Pile of Parts Is Not a Robot | ACT | `actuation`, `power-systems` | 1 (seed), 5 (seed) | Ch1–3, earl-1 → earl-5 |
| 2 | Sense, Think, Act | THINK | `conditionals`, `loops-forever`, `feedback-loop` | 2, 1 | Ch4, earl-6, earl-7 |
| 3 | Drawing the Line | SENSE | `thresholds`, `calibration`, `sensors-overview` | 1 | Ch5–6, bolt-3, earl-9, ch9-1 |
| 4 | Same Job, Less Code | THINK | `loops-counted`, `loops-until`, `subroutines`, `variables`, `optimization` | 2 | side `bolt-write-shorter`, earl-19 |
| 5 | Which Friend Actually Learns? | ENGINEER/AI-literacy | `calibration` (recap), AI concepts | **3, 4**, 5 | Spark conversations + scripted-companion comparison |
| 6 | The Detective's Clinic | ENGINEER | `debugging` (+ `conditionals`, `loops-until`, `sensors-overview`) | 2, 1 | Broken-Bot Clinic ×3, rivet-2, bolt-side-3 |
| 7 | Fail Loudly, Learn Publicly | ENGINEER | `failure-analysis` | **5**, 2 | Ch8, ch8-1 → ch8-3, plaque wall |
| 8 | Export Day: The Same Robot, Real | ENGINEER | `firmware-export`, `integration` | 2, 5 (capstone) | Ch7, ch7-1 → ch7-3, earl-8/18/20, magma-3 → magma-5 |

Arc logic: **build → decide → perceive → compress → interrogate the AI → debug → post-mortem → export.** (Note: `feedback-loop`'s home tier is ACT in the concept ledger; L2 plants it early, L4 and L8 pay it off — the ACT rubric row is where it is scored.) Hands first (L1), thinking second (L2–4), meta-cognition and society third (L5–7), artifact last (L8).

---

## 2. The lessons

Format per lesson: **Objective** (with framework mapping) → **Unplugged warm-up** (5–8 min) → **In-game segment** (~25 min) → **Teach-back check** (~8 min) → **Script cues** (Earl/companion lines as discussion starters) → **Watch for** (misconceptions). Segments are budgeted to sum to exactly 45: warm-up (6–7) + frame (3–4) + gameplay (22–25) + teach-back (8–12) + close (2). The frame covers the objective in kid language; the close is the exit line — "one sentence: what did your bot teach you today?"

---

### LESSON 1 — A Pile of Parts Is Not a Robot
**Tier ACT · Ch1–3 · quests earl-1 … earl-5 · 45 min** — timing: 7 warm-up + 3 frame + 25 game + 8 teach-back + 2 close

**Objective.** Students can name the three things every robot needs — **power, structure/actuation, and (eventually) senses** — and build a working first bot in the yard. *AI4K12:* seeds Big Idea 1 (we *notice* what a machine can and cannot perceive — a motor with no sensor is a paperweight) and Big Idea 5 (who gets to build robots? salvage as access). *Experience AI theme:* "What is AI / what counts as a robot" — pairs with Experience AI's opening what-is-AI lesson as prep.

**Unplugged warm-up (7 min) — "Human Bot."** Pairs. One student is the "bot" with eyes closed; the partner may only give exact commands ("IF my hand touches your shoulder, THEN step left"). No vague instructions. Debrief in one sentence: *what did the bot have to do to follow your rule?* (Sense → decide → act, before we ever name it.)

**In-game (25 min).** New game → Ch1 "The Gate Is Never Locked" (salvage), Ch2 "Earn Your Tools" (craft), Ch3 "Something With Thumbs" (first build: chassis, motor, power — quest chain earl-1 → earl-5). **Honest pacing:** first contact with a new game is slow — loading, controls, reading. Today's target is the crafting pipeline with a first build underway; the boot beep lands today for most classes and opens Lesson 2 for the rest. earl-6 "Build a Brain" is deliberately Lesson 2's opener. Teacher circulates asking "what's it missing?" (Answer they should reach: it can't *see* anything yet.)

**If the tech fails (no network / dead cart):** run the warm-up double-length with roles swapped, then paper-design a bot: three labeled boxes — POWER, STRUCTURE, MOVEMENT — and one sentence on what it still can't do. The objective survives on paper.

**Teach-back check.** Magma asks (misconception style): *"If motors make it move, why does it need all this other junk?"* Student explains in their own words why power + structure + actuation are three separate systems. Mastery = names all three without prompting.

**Script cues.**
- Earl (opener): *"Kid, I got a crate of motors that never once talked to a sensor. Wanna guess what they're good for? Paperweights."* → discussion: what is a robot *without* sensing?
- Earl (on salvage): *"Nothing here is junk. It's just parts waiting for a better job."* → discussion: why does the game start with scrap instead of new parts? Who does that in the real world?

**Watch for (misconceptions).** "The battery is the brain" (power ≠ logic); "it's alive when it moves" (movement ≠ sensing — park this; it's Lesson 2's opener).

---

### LESSON 2 — Sense, Think, Act
**Tier THINK · Ch4 · quests earl-6, earl-7 · 45 min** — timing: 6 warm-up + 4 frame + 25 game + 8 teach-back + 2 close

**Objective.** Students can write a first tile program with an **if** tile inside a **forever** loop, run it, and describe the loop they just built: *sense → decide → act → repeat.* *AI4K12:* Big Idea 2 (Representation & Reasoning — conditionals as decision rules) with Big Idea 1 (a sensor reading is a number the rule tests). *Experience AI theme:* "How AI makes decisions" — rule-based systems are the honest on-ramp to "not everything smart-looking is learning."

**Unplugged warm-up (6 min) — "Walk the flowchart."** Tape a path in the classroom; index cards at junctions: IF wall ahead THEN turn / ELSE straight. Students walk it. Then flip one card to something absurd (IF wall THEN keep walking) and walk again. Debrief: *the walker never broke the rule — the rule was wrong.* That is 90% of debugging.

**In-game (25 min).** Ch4 "One Knob at a Time": quest earl-6 "Build a Brain" (first conditional), earl-7 "First Program" (the sense-think-act loop). Students tune exactly one knob per run — the Mellon Loop discipline. Encourage crashing once on purpose.

**Teach-back check.** Live teach-back ID: **`tb-conditionals-1`** (Rivet: "The if tile has two mouths. Which one eats the answer when the sensor says TRUE?"). Mastery = student explains THEN-vs-ELSE *and* volunteers that both never run in the same pass.

**Script cues.**
- Earl: *"So if the bot never checks anything, it just keeps doing the first thing forever? That sound like a plan to you?"* → discussion: what does 'forever' mean to a machine?
- Rivet (misconception bait): *"If I see a wall, I turn left — does that mean 'if' is like definitely turning?"* → let a *student* correct Rivet, not the teacher.

**Watch for.** "If means maybe" (if is a test, not a probability); "forever loops drain the battery faster" (they run the same speed — the loop is time, not power); "both branches run every loop."

---

### LESSON 3 — Drawing the Line
**Tier SENSE · Ch5–6 + ch9-1 · quests bolt-3, earl-9, ch9-1 · 45 min** — timing: 6 warm-up + 4 frame + 25 game + 8 teach-back + 2 close

**Objective.** Students can explain what a **threshold** is (the line where "enough" becomes "too much"), tune one live in the line-follower, and **recalibrate** it when conditions change. *AI4K12:* Big Idea 1 core — perception is extracting meaning from sensor signals, and the *threshold is where the meaning gets decided*. *Experience AI theme:* "Data, perception, and (seed for L5) training data" — your threshold decision is data about *you*.

**Unplugged warm-up (6 min) — "Where does black become white?"** Hold up grey paint chips / a dimmer gradient. Every student privately writes the exact point black "becomes" white. Compare answers aloud. Debrief: *there is no wrong answer — there is a choice you must justify. Machines make that choice with a number. Who chose the number?* (Park the bias question; Lesson 8 picks it up.)

**In-game (25 min).** Ch5 "The Oval Has Opinions": earl-9 "Race Circuit" (closed-loop feedback racing), bolt-3 "The Ghost" (line-following and sensor thresholds). Then Ch6 "The Library of Almosts" calibration beat, and — for fast finishers — ch9-1 "Stand the Watch" (evidence discipline; thresholds + calibration under low signal).

**Teach-back check.** Companion prompt (Juno-style): *"My line-follower was PERFECT on the oval and now it's drunk in the dusty stacks. Same bot, same code. What changed?"* Mastery = student says some version of *the sensor's world changed, so the old threshold is a lie — recalibrate for today's normal.*

**Script cues.**
- Earl: *"Rivet keeps insisting gray is basically white. You gonna let him get away with that?"* → discussion: what happens to a robot when the world's definition of 'normal' changes?
- Earl: *"A threshold is a promise you made yesterday. Today wants to renegotiate."* → discussion: calibration as re-making the promise.

**Watch for.** "The sensor is wrong" (the sensor reports; the *threshold* decides); "one threshold works everywhere" (context-free thresholds are how bias gets into machines — seed, don't lecture); "calibration is fixing a mistake" (it's maintenance, not repair).

---

### LESSON 4 — Same Job, Less Code
**Tier THINK · side quest bolt-write-shorter + earl-19 · 45 min** — timing: 7 warm-up + 3 frame + 25 game + 8 teach-back + 2 close

**Objective.** Students can compress a working program using **counted loops**, **until-loops**, **variables**, and **subroutines** — same lap, fewer tiles — and articulate *why* the compressed version is better (memory, power, readability). *AI4K12:* Big Idea 2 — abstraction and algorithmic compression. *Experience AI theme:* "Algorithms" — elegance as an engineering value, not a style preference.

**Unplugged warm-up (7 min) — "Shoelace pseudocode."** Students write full step-by-step directions for tying a shoe (they'll write 15+ steps). Then rewrite using "repeat 2×" and one named sub-step ("bunny-ears"). Count the savings aloud as a class. Debrief: *naming a chunk of behavior once and calling it by name is what a subroutine is.* Add the 2-minute **scoreboard beat**: "the lap count changes every run — where does the robot write it down?" A variable is the scoreboard: a labeled place a number changes. (Variables are *introduced* here and practiced via var tiles in-game; only loop-choice and compression are teach-back-assessed today — five concepts in one lesson is deliberate exposure, not a five-question quiz.)

**In-game (25 min).** Side quest **bolt-write-shorter** ("Same Lap, Fewer Tiles" — three measured runs, each smaller; hypothesis-driven). Fast finishers: earl-19 "Lean Machine" (code efficiency and power budgets). Require the hypothesis step in writing or out loud: *which tiles will you remove, and what convinces you the lap stays the same?*

**Teach-back check.** Companion prompt (Juno-style): *"Loop forever, loop until, loop four times — they all repeat. When would you pick each one?"* Mastery = student names the deciding question (*do you know when it ends?*) not the syntax. Bonus live question: **`tb-loops-until-1`** (Bolt: "My drive-to-the-wall program loops forever and never parks. What does it need?").

**Script cues.**
- Earl: *"You wrote the same three tiles eight times in a row. You building a program or a wall?"* → discussion: what does duplication cost a robot? (memory, battery, bugs hiding in copies)
- Bolt (pit-crew voice): *"Every tile is weight. The lap doesn't care how much you typed."* → discussion: optimization as respect for budgets.

**Watch for.** "Shorter code is always better" (readability is a budget too — same lap, fewer tiles, *still understandable*); "variables stay locked" (variables change — that's their whole job); "subroutines are just saving typing" (they're naming an *idea*).

---

### LESSON 5 — Which Friend Actually Learns?
**AI-literacy center · Spark conversations + scripted companions · 45 min** — timing: 6 warm-up + 4 frame + 25 game + 8 teach-back + 2 close

**Objective.** Students can distinguish **three kinds of machine behavior** — (a) scripted rules (Earl, Rivet, Bolt, Juno, Magma: branching dialogue), (b) real learned models (**Spark**: a large language model whose replies come from a model trained on data), and (c) their own tile programs (rules *they* wrote) — and explain what "learning from data" means at a sixth-grade level. *AI4K12:* **Big Idea 3 (Learning)** and **Big Idea 4 (Natural Interaction)** — the unit's deliberate AI-literacy center, with Big Idea 5 seeded (Spark's answers are cached; who reads them?). *Experience AI theme:* "How computers learn / training data" — this lesson IS the Experience AI pairing; run their training-data lesson before or after as bookends.

**Unplugged warm-up (6 min) — "Rule-follower or learner?"** Read five one-line descriptions (thermostat; autocomplete; a choose-your-own-adventure book; a dog that learned fetch; a spam filter). Students sort each: *follows rules someone wrote* vs. *learned from examples*. The book is the trick item — it feels interactive but is fully scripted, exactly like Earl.

**In-game (25 min).** Two structured conversations. (1) Ask **Earl or Rivet** the same question twice in different sessions — students observe the scripted character answers from a fixed pool (branching, `src/companion/`). (2) Ask **Spark** something new — students observe genuinely novel replies (LLM via the scrap-spark service, SHA-256-cached so repeat questions are answered from the can). **Spark-less fallback (offline/IT-blocked):** teacher projects two transcript excerpts (one scripted pool, one Spark log) — the comparison still works on paper; this lesson does not require the network.

**Teach-back check.** Companion prompt: *"Earl remembered your name this morning. Spark made up a poem about your bot. Which one of them LEARNED something — and what's the difference?"* Mastery = student says some version of *Earl's writers wrote everything he'll ever say; Spark's model generated from patterns in data, so it can say new things — and new wrong things.*

**Script cues.**
- Earl (the honest one): *"Folks keep asking if I 'know' 'em from last time. Nah — I ask dumb questions and let you do the remembering. That's kinda the point, ain't it?"* → discussion: is a scripted companion *lying* to you? (No — but know which friend is which.)
- Spark discussion prompts: *How is Spark's poem different from Earl's speech? Where did each one's words come from? Can Spark be confidently wrong? What should you do when it is?*

**Watch for.** "Everything that talks is AI" (the year's most important misconception — Earl is a script); "Spark understands me" (Spark predicts likely language; understanding is a claim students should challenge); "learning = memorizing" (models generalize from examples, which is why they can be wrong in new ways).

> **Teacher note (privacy, stated plainly):** when Spark is enabled, the student's typed question + minimal game context is sent to the scrap-spark service to generate a cached reply — no account, no profile, and the classroom default can run entirely Spark-less (this lesson's fallback). See §5 below.

---

### LESSON 6 — The Detective's Clinic
**Tier ENGINEER · Broken-Bot Clinic ×3 + rivet-2, bolt-side-3 · 45 min** — timing: 7 warm-up + 3 frame + 25 game + 8 teach-back + 2 close

**Objective.** Students can diagnose a broken bot **hypothesis-first** — read the symptom, form one hypothesis, change one thing, re-run — through all three clinic scenarios: inverted sonar comparison, missing loop exit, wrong sensor read. *AI4K12:* Big Idea 2 (reasoning from evidence) + Big Idea 1 (reading what the sensor actually says). *Experience AI theme:* "Problem-solving & debugging" — debugging as the transferable skill, not the punishment.

**Unplugged warm-up (7 min) — "Bug triage card sort."** Physical cards, each one symptom-only: "device never stops," "responds to touch but not light," "works perfectly then dies at 3 pm every day." Small groups sort into **sensor / logic / power** root-cause piles and defend one sort to the class. No computers needed to be a detective.

**In-game (25 min).** Broken-Bot Clinic, all three scenarios (`left-forever`, `never-stops`, `wrong-sensor`). Rule: **write/say the hypothesis BEFORE touching the code** — Earl's hint ladder is there if they stall, but the hypothesis sentence comes first. Fast finishers: rivet-2 "The Toolbox" (diagnosis and systematic repair) or bolt-side-3 "The Lean-In" (pit-stop repair under the clock).

**Teach-back check.** Live question available: **`tb-loops-until-1`** if not used in L4; otherwise companion prompt (Rivet): *"The bot wasn't broken — the *decision* was backwards. How did you know the comparison was flipped before you fixed it?"* Mastery = student reconstructs the evidence chain (symptom → reading → hypothesis → one change), not just the fix.

**Script cues.**
- Earl (clinic opener, from the game): *"I've seen this one before. The bot sees nothing and decides nothing. Start by asking: what IS the ultrasonic sensor reading right now?"* → discussion: why does Earl start with a *question*, not the answer?
- Earl (after a fix): *"The thing works PERFECTLY at being wrong until you un-wrong it."* → discussion: was the bot ever "broken"? (It did exactly what its code said.)

**Watch for.** Trial-and-error guessing (the hypothesis sentence is the assessment — enforce it); "the sensor is broken" as a reflex (two of three scenarios are *logic* bugs); "debugging is fixing" (debugging is *explaining*, then fixing).

---

### LESSON 7 — Fail Loudly, Learn Publicly
**Tier ENGINEER · Ch8 + plaque wall · quests ch8-1 → ch8-3 · 45 min** — timing: 6 warm-up + 4 frame + 25 game + 8 teach-back + 2 close. (ch8-2 "Ask Spark Why Someday" is titled narratively — its content is offline post-mortem reading; the quest makes no Spark call.)

**Objective.** Students can read someone else's failure like data — the plaque wall's fourteen letters — and write their own honest failure plaque: what happened, why, and the one change that would prevent it. *AI4K12:* **Big Idea 5 (Societal Impact), the grade-6–8 first-class topic** — robot failures in the real world (self-driving cars, medical devices, factory arms) are not funny plaques; who pays when they fail? *Experience AI theme:* "Risks & impacts" — pairs directly with their ethics/impact lesson.

**Unplugged warm-up (6 min) — "Who's at fault?"** Read a 3-sentence real-world scenario (a delivery robot drives into a pond; its camera couldn't see the water). Quick round: sensor's fault, coder's fault, calibration's fault, company's fault? Students must pick ONE and defend. No consensus expected — the *defense* is the learning.

**In-game (25 min).** Ch8 "Fail Loudly": ch8-1 "The Fourteen Letters" (post-mortems as mail from the failure), ch8-2 "Ask Spark Why Someday" (post-mortems and missing data), ch8-3 "Wrecks Worth Fixing" (post-mortem → preventive maintenance). Deliverable: each student writes **one plaque of their own** from any crash they've had in Lessons 1–6 (paper is fine; the yard's plaques are the model).

**Teach-back check.** Companion prompt (Rivet): *"Nobody makes a plaque for the bot that worked. Why is yours worth one?"* Mastery = the plaque names a *cause*, not just a crash — and the student can say what the plaque taught someone who reads it.

**Script cues.**
- Earl: *"Every wreck wrote a letter. Reading it is the cheapest education you'll ever get."* → discussion: why does the yard *display* failures instead of hiding them? What does your school hide that it could plaque?
- Earl: *"A robot that fails quietly is worse than one that fails loud. Loud fails teach. Quiet fails compound."* → discussion: what fails *quietly* in the real world? (This is the Big Idea 5 hinge — silent failure is a societal choice made by designers.)

**Watch for.** "Failure is bad" (failure is *data* — the unit's spine); blame-the-human reflex (systems fail as systems); "plaques are for dramatic crashes" (the quiet drift bug deserves a plaque most).

---

### LESSON 8 — Export Day: The Same Robot, Real
**Tier ENGINEER · Ch7 + Ch12 echo · quests ch7-1 → ch7-3, earl-8/18/20, magma-3 → magma-5 · 45 min** — timing: 6 warm-up + 3 frame + 22 game + 12 expo + 2 close

**Objective.** Students export their tile program as **real C++/MicroPython firmware**, read the exported code aloud line-mapped to their tiles, and teach one concept back to the class in a 60-second expo. *AI4K12:* Big Idea 2 (translation between representations — tiles → text → machine) + Big Idea 5 capstone (the bias debate returns: *whose threshold? whose data?*). *Experience AI theme:* "Creating with AI / synthesis" — the artifact lesson.

**Unplugged warm-up (6 min) — "Be the compiler."** Teacher reads a plain-English instruction ("if it's dark, turn on the lamp, wait 2 seconds, do it all again forever"); students write it in strict symbol form on paper (`if light < 300 { lamp ON; wait 2 }` loop). Compare three students' versions — same meaning, different text. That ambiguity is what compilers remove.

**In-game (22 min).** Ch7 "The Same Robot, Real": ch7-1 "The Header" (attribution — your name in the firmware), ch7-2 "Same Brain, Two Bodies" (hardware abstraction), ch7-3 "Friendly Research" (sharing exports); earl-8 "Go Real", earl-18 "See the Code", earl-20 "Finish the Chain" (bootloaders and flashing); magma-3 → magma-5 for the full arc. **Every student ends holding exported code with their name in the header** — printed or on screen. If WebSerial + a real board are available (school IT permitting), flash one bot live as the closer; otherwise the printed firmware IS the artifact. *Simulation-first honesty: the unit is complete without hardware.*

**Teach-back expo (12 min) — partner-pair format (the only format that fits 30 kids).** Students pair up; each teaches their strongest ledger concept to their partner for 60 seconds using their own bot as the example, then swap. Teacher circulates with the 3-item checklist (names the idea / shows it in their bot / answers one partner question) — not 30 staged performances. Close with 2–3 volunteers teaching the whole class while the room packs up. The concept ledger's `taught` rung is the machine's record; the expo is the human one.

**Script cues.**
- Earl: *"Tiles are for thinkin'. Chips don't think — they do exactly what you told 'em, in a language you couldn't read last month."* → discussion: what changed in the last month? (You did.)
- Capstone debate (Big Idea 5, return of L3's parked question): *"Your line-follower's threshold works great on THIS floor. The school buys darker floors for half the building. Who should have thought about that — the sensor, the coder, or you?"* There is no single right answer; the requirement is naming *who bears the cost* of the unasked question.

**Watch for.** "The export is a translation of my ideas" vs "magic box" (read the header, find their name, map three lines to three tiles); "hardware makes it real, simulation is fake" (simulation enforced real constraints all unit); "integration is assembly" (integration is making systems *agree* — sensors + code + power + chassis).

---

## 3. Materials & logistics

**Per student:** a browser (Chromebook is fine) · headphones optional (L5) · paper + pencil every lesson (unplugged warm-ups and plaques are paper-first).
**Per class:** tape + index cards (L2), grey paint chips or a printed gradient (L3), printed bug-triage cards (L6), a printer or shared doc for firmware exports (L8).
**No accounts. No installs. No downloads.** The game is a web page; progress saves locally on the machine.

**Access & Day-Zero (read before Lesson 1):**
- **Game URL:** the game runs in any modern browser. A public hosted URL is pending deployment (research Bet 1, web-direct); for pilots, the teacher receives the URL from the project or runs it locally (`npm run dev`). Write the URL on the board before students arrive.
- **Machines:** students should use the **same machine every lesson** (saves are local to the browser). On shared carts, assign seats.
- **Room-code setup (optional classroom mode):** teacher creates a class in the teacher console (teacher.html) → gets a room code; students join with the code + a display name. **Advise first-name-or-initials-only display names** — the name is student-typed and visible to the class console.
- **Offline plan:** every lesson's warm-up runs on paper. If the network dies mid-lesson, fall back to that lesson's warm-up extended, plus the paper activity named in the teacher pack (L1 bot-design boxes; L2 flowchart cards; L3 chips; L4 shoelace; L5 transcript sort; L6 triage cards; L7 fault debate; L8 be-the-compiler). No lesson dies with the Wi-Fi.
**Spark policy:** Lessons 1–4, 6–8 never require Spark. Lesson 5 uses it or its documented paper fallback — teacher's choice, stated in advance to the class either way.

---

## 4. Assessment rubric — what mastery looks like (honest version)

The game's ledger records `unseen → seen → practiced → taught` per concept (`src/learning/ConceptLedger.js`) — **teaching is the test**. This rubric is the human reading of those rungs. No concept requires all four rungs in 8 lessons; the unit is a first pass down the ladder, not a graduation.

| Tier | A student at mastery… | Evidence | Concepts in Unit 1 |
|------|----------------------|----------|--------------------|
| **SENSE** | Explains a sensor reading as *a number the world gave us* and a threshold as *a choice we made about that number*; recalibrates when conditions change without being told to | L3 teach-back; calibration move in-game; ch9-1 optional | sensors-overview, thresholds, calibration |
| **THINK** | Predicts what a program will do *before running it*; picks forever/until/counted by asking "do I know when it ends?"; compresses with loops/subs and defends the compressed version | L2/L4 teach-backs; bolt-write-shorter tile counts; hypothesis sentences | conditionals, loops-forever, loops-counted, loops-until, variables, subroutines |
| **ACT** | Names power/structure/actuation as separate systems; describes the sense-think-act loop unprompted; treats budgets (tiles, power, time) as real constraints | L1 teach-back; L2 loop description (feedback-loop is planted here, scored as ACT); L4 "same lap fewer tiles" runs | actuation, feedback-loop, optimization |
| **ENGINEER** | Diagnoses hypothesis-first with one change at a time; reads failures as data and writes an honest plaque; maps tiles to exported C++ lines and explains what a compiler does | Clinic evidence chains; L7 plaque; L8 line-mapping + expo | debugging, failure-analysis, firmware-export, integration, (power-systems recapped) |

**AI literacy (cross-cutting, L5):** distinguishes scripted rules from learned models; can say "Spark can be wrong in new ways" and mean it.

**Honest floor (what "not yet" looks like):** fixes by trial-and-error without a hypothesis sentence; calls the sensor "broken" when the threshold is wrong; reads exported code as magic. These are *locations on the ladder*, not failures — the ledger's rungs only rise, and a wrong teach-back answer just means practice comes first. That design choice is the assessment philosophy: **a bad afternoon can't un-teach a kid.**

---

## 5. Classroom safety & privacy — stated plainly

- **Solo mode (the default): no accounts, no logins, no personal data collected.** A student can play the entire unit anonymously in a browser; everything stays on that machine.
- **Saves are local.** Progress (world + concept ledger) lives in that browser's local storage on that machine. Lab carts work fine; students should use the same machine across lessons, or export/import saves where configured.
- **Classroom mode (optional) is rosterless but not data-free — state this accurately.** Joining a class uses a room code + a **student-typed display name** stored in the project's save backend so the teacher console can show class progress (concept coverage, not identities). No roster, no email, no passwords — but a display name *can* contain personal information by student choice, so the pack instructs: first names or initials only. A district running fully local can skip classroom mode entirely; the unit works without it.
- **The USCP/CNS telemetry stays OFF in the classroom default.** Scrapcraft's "the game is the telemetry" doctrine (docs/cns/) is a design research direction; **no behavioral telemetry client ships in the classroom build.** There is nothing to opt out of, because it is not on.
- **Spark (the one network feature) is explicit and optional — full disclosure.** With Spark enabled, the student's typed question + minimal local context is sent to the **scrap-spark service** (a project-operated Cloudflare Worker relaying to the configured model provider) and returns a cached reply. No account, no profile. Two things a district should know plainly: (1) **free-text questions from under-13s can contain personal information** — the teacher-facing guidance is "no real names or personal details in questions," and the offline fallback avoids the channel entirely; (2) **the cache is keyed by question content (SHA-256), so it is shared** — one student's question and reply can be replayed to another student who asks the same thing. For pilot classrooms we recommend Spark **off** (the unit is complete without it) or a per-class cache key before any district-wide rollout. **Lessons 1–4 and 6–8 never call Spark. Lesson 5 runs fully offline via its documented paper fallback.**
- **No voice features ship in the classroom build.** (Under COPPA, long-lived voice profiles of under-13s are regulated; the classroom posture is text-first and voice-free, full stop.)
- **For district files:** one-page summary — *no accounts, local saves, rosterless room codes, telemetry off by default, single optional AI-companion feature that can be disabled; aligns with AI4K12 6–8 band and Experience AI (11–14) framing.* ([FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business) for the district's own compliance plan.)

---

## 6. What this unit deliberately does NOT claim

- It does not claim standards alignment beyond the informal CSTA/NGSS mapping in CURRICULUM.md; formal state-alignment documents are future work after pilot feedback.
- It does not require or promise hardware. WebSerial flashing is a progressive enhancement; exported firmware files are the default artifact.
- It does not claim the companions are "AI" — Lesson 5 exists precisely to un-claim that, except for Spark.
- It assumes no prior programming; if half the class has Scratch, L2–L4 will run fast — bolt-5 "The Hot Lap" (PID, honestly hard) is the built-in stretch content.
- Pilot classrooms (research doc Bet 1) will revise this unit; expect v2 after the first 5 classrooms.
