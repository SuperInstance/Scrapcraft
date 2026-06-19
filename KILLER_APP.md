# SCRAPCRAFT — From Cool Widget to Killer App
## A Synthesis of The CraftMind Universe, Classic Mechanics, and STEM Science

---

## The Core Diagnosis

**Cool widget:** A voxel scrapyard where you mine blocks and craft items.

**Killer app:** A physics simulation engine that teaches STEM by letting you build machines
that actually work — the engineering pillar of a connected CraftMind learning universe that
middle schools pay for because it covers curriculum standards, and kids play because it's
genuinely more interesting than anything else on their screen.

The gap is not features. It's **emergence** — systems that interact with each other so that
discovery comes from tinkering, not from reading. The Incredible Machine taught an entire
generation of kids about cause and effect not by explaining it, but by making it feel like
magic when a gear finally meshed and the rube goldberg ran.

That's what we're missing.

---

## What The CraftMind Universe Tells Us

The four sibling games paint a picture:

| Game | STEM Pillar | What It Teaches |
|---|---|---|
| **craftmind-researcher** | Scientific Method | Hypothesis → experiment → data → conclusion |
| **craftmind-ranch** | Biology / Ecology | Life cycles, genetics, food chains, ecosystems |
| **craftmind-circuits** | Electronics / CS | Current, resistance, logic gates, programming |
| **craftmind-fishing** | Environmental Science | Ecology, patience, populations, data collection |
| **Scrapcraft** | Engineering / Physics | Forces, machines, energy, systems thinking |

Together this is a full STEM curriculum. The missing pillar is **Mathematics** — which is
embedded in everything but never foregrounded. More on that below.

**The killer-app realization:** These games should not be five separate experiences.
They should be one platform where things you learn and build in one game matter in another.
Scrapcraft is the **assembly floor** — everything else feeds into it and out of it.

---

## The Three Transformational Ideas

### I. Machines That Actually Work (The Incredible Machine Model)

The single biggest gap: crafted items are inventory trophies. A go-kart sits in a slot.
A flying machine is a completion badge. **Nothing runs. Nothing breaks. Nothing surprises.**

The Incredible Machine's genius: you placed parts, connected them, hit PLAY, and watched
physics happen. The ball rolled, the lever pivoted, the gear turned the wheel.
When it didn't work you stared at it until you understood why, then fixed it.
That iteration loop IS the learning. No explanation required.

**What Scrapcraft needs:**

**A. The Workbench becomes a 2D Machine Canvas**

When you open the Workbench, instead of a crafting grid you get a 16×16 canvas.
You drag scrap components onto it. They connect with wires/rods/belts.
You hit a RUN button. The simulation executes. Physics happen on the canvas in real time.

- **Gear**: Drag a gear, connect to a shaft. Rotate the shaft, the gear turns. Attach to a
  second gear — now you've built a ratio. The smaller gear turns faster. You feel it before
  you know why.
- **Lever**: Attach mass to one end, force to the other. Longer arm = more force. Archimedes'
  principle without a single word about Archimedes.
- **Pulley**: Attach rope over a pulley, one side has weight. Add more pulleys.
  Watch the mechanical advantage. Lift heavier loads with less effort each time.
- **Circuit**: Add a battery, a switch, and an LED to your canvas. Close the switch.
  Light turns on. Add a resistor. Light dims. Now you know what resistors do.
  Add a second battery in series. Light gets brighter. Parallel. Same brightness, longer life.
- **Motor**: Wire the circuit to a motor. Motor turns a gear. Gear turns something on the
  canvas. You just built an electromechanical machine from scratch.

When you hit CRAFT with a valid machine layout, it produces the item AND runs the simulation
showing the item working. The blueprint is saved. You can share it.

**B. The World Machines Play**

Machines you craft from the canvas affect the 3D world:
- Your gear assembly speeds up the forge (attached to the workbench beside it)
- Your motor powers a conveyor on the floor
- Your circuit lights up the shed

You stop playing with items. You start engineering systems.

---

### II. The Circuit Layer (Synergy with craftmind-circuits)

craftmind-circuits is a sibling game. The canonical move is to **make them share a layer**.

**In Scrapcraft, electricity is a first-class mechanic:**

- **Power Boxes** already exist in the world. Make them actually output power (a number: volts).
- **Copper Wire** (already exists) becomes placeable in the world as a wire that carries power.
- **Switches** (new block): toggle power flow.
- **Logic Gates** (new craftable from circuit boards): AND, OR, NOT.
  Place them between wires. Connect inputs and outputs.
  Gate your forge door to only open if BOTH a keycard switch AND a timer are active.
  Now you've taught Boolean logic through a puzzle about a door.
- **Sensors** (new): Motion sensor (player nearby → signal), daylight sensor (daytime → signal),
  pressure plate (block on top → signal).
- **Actuators**: Piston (extends/retracts a block), lamp (lights up), siren (plays sound), door.

The bridge to craftmind-circuits:
- Completing circuits challenges in craftmind-circuits **unlocks advanced components** in Scrapcraft
  (capacitors, transistors, microcontrollers).
- Circuit boards you analyze in craftmind-circuits have higher stats when used in Scrapcraft recipes
  (faster ScrapBot, better generator output).
- A shared "Electrical IQ" score carries between both games and gates advanced content.

---

### III. ScrapBot Programming (The Scratch Model)

Scratch has 135 million users because it makes programming feel like directing a character.
"When [space] pressed, move 10 steps." The program IS the story.

**ScrapBot gets a programming interface:**

When your ScrapBot is active, pressing B opens a **visual block-code editor** — no text,
pure drag-and-drop blocks, exactly like Scratch's interface:

```
[WHEN game starts]
  [REPEAT forever]
    [IF nearby scrap within 3 blocks]
      [move toward nearest scrap]
      [pick up scrap]
    [ELSE]
      [follow player]
    [END IF]
  [END REPEAT]
```

Blocks are color-coded by category (Motion, Sensing, Logic, Actions).
You drag them together like Lego. Press RUN. ScrapBot executes your program.

**Why this is the killer feature:**
- Kids who "hack" the ScrapBot to do cool things will show their friends immediately.
- A ScrapBot that autonomously mines a whole section of the yard is genuinely impressive.
- The logic required is real CS: loops, conditionals, variables, events.
- Earl has opinions about your code. "That infinite loop is gonna cause problems. Don't ask me how I know."

**Advanced ScrapBot programming (unlocked via skill tree):**
- Variables: "store_count = 0; if store_count > 20, return to crate"
- Functions: define a subroutine called "patrol" that you call from multiple places
- Multi-bot: program two ScrapBots to cooperate (one mines, one carries)
- Export program as shareable code: paste into craftmind-circuits to control a circuit

---

## The CraftMind Universe Integration Map

```
craftmind-ranch ──────┐
  Biology/Ecology      │  Biological materials (rubber latex, bone,
  Grows organisms      │  bio-oil) flow INTO Scrapcraft as crafting
                       │  ingredients for organic components
                       ▼
craftmind-fishing ───► SCRAPCRAFT ◄─── craftmind-circuits
  Environmental sci    │  The Engineering   Electronics/CS
  Provides: fish oil,  │  Hub               Provides: analyzed
  bio-materials,       │                    circuit boards,
  patience mechanic    │                    advanced components,
                       │                    Electrical IQ score
                       ▼
              craftmind-researcher
                Scientific Method
                Provides: research
                tokens that unlock
                hidden Scrapcraft
                blueprints; Earl's
                backstory revealed
                through research quests
```

**The shared layer:** One account, one progression. A **Discovery Score** tracks STEM mastery
across all games. Displayed on a shared profile page. Earnable badges:
"Electrical Engineer", "Biologist", "Mechanical Engineer", "Computer Scientist".

**The portal mechanic:** In Band 3 (The Deep Yard), there's a portal device.
Craft it and you get a mini-menu: "Visit craftmind-ranch / circuits / fishing / researcher."
Your inventory carries across (limited slots). You bring rubber from the ranch.
You bring circuit boards from circuits. Scrapcraft is the hub world.

---

## What Classic Mechanics to Steal

### From The Incredible Machine
- **Rube Goldberg puzzle mode:** A separate tab in the overlay. "Connect these two components
  to make the scrap land in the bucket." 50 handcrafted puzzles of escalating complexity.
  Each puzzle teaches one physics concept. Puzzle 1: inclined plane. Puzzle 12: gear ratios.
  Puzzle 30: circuit logic. Puzzle 50: build a machine that programs a ScrapBot.
- **Free Build mode:** No goal. Just a canvas. Build whatever. Share it.
- **The "PLAY" button moment:** After every significant craft, there's a brief simulation
  showing the item working. Even just 3 seconds. It makes the crafting emotionally satisfying.

### From Mindustry
- **Logic Processors:** Once you've learned ScrapBot programming, unlock a placeable
  **Control Unit** block. Wire it to machines in the world. Script it with your block-code.
  Your automation can now control forge temperature, start/stop conveyors, open/close doors
  based on inventory levels. This is real factory automation logic. Middle schoolers who get
  here have learned more CS than most adults.
- **Supply chains:** Conveyors connect to machines. Drills feed smelters. Smelters feed
  workbenches. Satisfying optimization loop. Every machine in the chain is a math problem
  (input rate vs. output rate vs. buffer size).

### From Scratch / Code.org
- **Immediate feedback:** Every block of code shows what it does the second you add it.
  No compile step. No error messages. Just behavior.
- **Remix culture:** Any ScrapBot program or machine blueprint can be "remixed."
  You see what another player built, open it, change one thing, save as yours.
  This is how middle schoolers actually learn to code — by modifying things that work.
- **Certificates:** Complete the 5-lesson "ScrapCode" tutorial and get a "Certified
  ScrapCoder" badge that appears on your profile. These are surprisingly motivating.

### From Roblox
- **The social identity layer:** Your character has a customizable appearance (colors,
  accessories you craft). Your customizations are visible to friends in co-op.
  Kids grind for cosmetics — make the good ones hard to get.
- **Game within a game:** Once you've built a machine that works, you can SET it as a
  "challenge" for other players. "Beat my machine's output rate." Leaderboard appears.
- **The Studio moment:** The final Band 3 endgame is "Earl's Retirement Plan" — a large
  empty lot. Earl says: "Design a machine shop that can build everything I taught you.
  From scratch. I'm watching." You build a factory. It runs. That's the end state.
  Screenshot it, share it, that's your diploma.

### From Forager
- **Skill islands:** Instead of a skill tree panel, skills are physical locations in the
  world. "The Gear Institute" (Band 1, hidden shed): enter it and you're in a mini-puzzle
  room that teaches gear ratios; complete it to unlock the Gear Efficiency skill.
  "The Circuit Academy" (Band 2 power grid): complete 5 circuit puzzles to unlock
  Electrical Expert. Skills feel EARNED because you had to understand something to get them.
- **The notification that hits:** Every skill unlock gets a full-screen Earl moment.
  He appears, says something genuinely funny, and the new ability kicks in immediately
  so you feel it right away.

### From Valheim
- **Biome-gated knowledge:** Each band doesn't just have different blocks — it has a
  different TOPIC. Band 0 teaches Simple Machines (levers, pulleys, inclined planes).
  Band 1 teaches Mechanical Systems (gears, motors, engines). Band 2 teaches
  Electrical Systems (circuits, logic gates). Band 3 teaches Automation and CS
  (programming, optimization, systems thinking). You can't meaningfully progress in
  Band 2 without the mechanical knowledge from Band 1. The world IS the curriculum.

---

## The Classroom Backdoor (The Real Killer App)

**Market context:** The game-based learning market is growing at 21% CAGR toward $95B by 2033.
67% of U.S. K-12 schools already use educational gaming tools. Minecraft Education has millions
of classroom licenses. **The school market is the sustainable revenue stream that makes this
a business, not a hobby.**

**What schools need (and will pay for):**

### Teacher Dashboard
A separate URL (`/teacher`) that mirrors the student's session. Shows:
- Time spent per band (topic area)
- Which machines were built and tested
- Which circuit puzzles were solved
- ScrapBot programs written (yes/no + complexity score)
- STEM concepts encountered: auto-tagged from in-game events

Map these to curriculum standards:
- **Band 0 completions** → NGSS MS-PS2 (Forces and Motion)
- **Circuit completion** → NGSS MS-PS3 (Energy)
- **ScrapBot programming** → CSTA K-12 CS Standards 6-8
- **Machine canvas puzzles** → Common Core Math (ratios, rates)

Report formats: PDF per student, CSV export, Google Classroom integration.

### Class Challenge Mode
Teacher sets parameters: "This week's challenge: build a machine that lifts a 10-unit load
using the least possible number of gears." All students work independently. Results ranked
by Earl. Class leaderboard. Best solution gets presented (shown in game and on teacher dashboard).

### Curriculum Packs
Downloadable mission packs aligned to specific units:
- "Simple Machines Unit" (6 missions, 2-3 hours, grades 6-7)
- "Circuits & Energy Unit" (8 missions, 4 hours, grades 7-8)
- "Intro to Programming Unit" (10 missions, 5 hours, grades 7-9)

Each pack is free. The platform subscription ($4/student/month) is what the school pays for
the teacher dashboard and progress tracking.

---

## The Math Layer (The Missing Pillar)

Every mechanic in Scrapcraft has a math problem hiding inside it:

| Mechanic | Hidden Math | Surface experience |
|---|---|---|
| Gear ratio | Ratios and proportions | "Why does small gear spin faster?" |
| Circuit resistance | Ohm's Law (V=IR) | "Why is the light dimmer?" |
| Lever balance | Torque (F×d) | "How do I lift that heavy block?" |
| Conveyor throughput | Rate × time | "Why is my forge backed up?" |
| ScrapBot program | Algorithm complexity | "Why is the bot slow?" |
| Generator output | Power = voltage × current | "Why does my battery drain?" |

**The Earl Math Moment:** When you build a machine and it doesn't quite work,
Earl can ask: "The gear on the left has 8 teeth. The gear on the right has 24.
How many times does the right gear spin for each full spin of the left?"
A small quiz appears. You answer. Correct: the animation SHOWS the ratio happening.
Wrong: Earl walks you through it with a diagram. This is math-in-context learning,
the most effective known pedagogy for middle school math.

---

## The Viral Loop (How It Spreads)

Every successful middle-school platform has a sharing mechanic:
- Scratch: share your project
- Roblox: invite friends to your game
- Minecraft: multiplayer + screenshots

Scrapcraft's:

1. **Machine GIF export**: Hit a Share button after a machine runs. Auto-generates a
   3-second GIF of your machine in motion. Downloads to device. Posts to Discord/Reddit/etc.
   This is free marketing.

2. **Blueprint URL**: Every machine canvas layout gets a unique URL. `scrapcraft.io/m/abc123`.
   Share it. Friend opens it, sees your machine, can REMIX it. Scratch proved this is
   the single most powerful user-growth mechanic for this demographic.

3. **Challenge links**: "Beat my score." Click → opens the game with that exact puzzle
   preloaded. Friend immediately has context, immediately is competing with you.

4. **Earl's Scoreboard**: Weekly leaderboard of most impressive machines (voted on by players).
   Top 5 get a nameplate in the game world in Band 0 for that week.

---

## The Build Order (What to Actually Implement Next)

Given everything above, the real priority order is different from the roadmap:

```
Week 1-2:  Save system (non-negotiable, do this now)
Week 2-3:  Block placement (unlocks building)
Week 3-5:  Machine Canvas (workbench becomes simulation) ← THE BIG ONE
Week 5-6:  Placeable wires + electricity flow
Week 6-7:  3 logic gates (AND, OR, NOT) + switches + lamps
Week 7-9:  ScrapBot visual block-code editor (basic: move, sense, pick up)
Week 9-10: 5 Incredible Machine-style puzzles per band (20 total)
Week 10-11: Skill Islands (physical world locations that teach + unlock)
Week 11-12: Machine GIF export + Blueprint URL sharing
Month 4:   Teacher dashboard (session report, curriculum tags)
Month 5:   CraftMind portal (crossgame inventory slot, Discovery Score)
Month 6:   Class challenge mode + curriculum packs
Month 7+:  Multiplayer, mobile, craftmind-ranch integration
```

---

## The One-Sentence Pitch

**Scrapcraft is where middle schoolers build machines that actually work —
from a go-kart to a programmable robot factory — in a scrapyard world that teaches
more STEM than a textbook while Earl pretends not to be impressed.**

That's the killer app.

---

*Synthesized from: The Incredible Machine (Sierra, 1993), Mindustry (Anuken),
Scratch (MIT Media Lab), Forager, Valheim, Roblox Education, Mindustry,
craftmind-circuits/ranch/fishing/researcher ecosystem, and game-based learning
market research showing $17B → $95B growth through 2033.*
