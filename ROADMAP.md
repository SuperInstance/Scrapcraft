# SCRAPCRAFT — Development Roadmap

*Synthesized from competitive analysis of Minecraft, Rust, Valheim, Scrap Mechanic, Forager,
Satisfactory, and STEM-game engagement research. Mapped against current codebase gaps.*

---

## Competitive Landscape Summary

| Game | Core Hook | What We Can Steal |
|---|---|---|
| **Minecraft** | Discovery-based crafting with tiered depth | Recipe tree density; biome-locked progression |
| **Scrap Mechanic** | Build actual functional machines | Vehicles/gadgets that DO something in gameplay |
| **Valheim** | Biome → boss → tier loop | Band progression gates; station upgrades unlock recipes |
| **Forager** | Active → passive automation transition | Skill tree; idle auto-collect passive layer |
| **Rust** | Persistence + electricity automation | Wiring system; base permanence |
| **Satisfactory** | Factory chain optimization | Conveyor/pipe logic; crafting automation |

**Key finding from STEM-game research:** Middle schoolers respond to *immediate feedback loops*,
*visible progression* (skill trees, fill bars), *surprise discoveries*, and *social proof*
(leaderboards, showing builds to friends). Educational content lands best when embedded in
decision-making, not delivered as text blocks.

---

## Current State Audit

### ✅ Solid foundations
- 128×128×10 voxel world, 4 parallel bands, deterministic generation
- Hold-to-mine, particle effects, procedural audio, day/night cycle
- 14 recipes / 3 tiers / 4 stations / 20 achievements / 5 quests
- Big Earl AI foreman (Claude + offline fallback), ScrapBot companion
- Engineering Codex (10 real-science entries)

### ❌ Critical gaps (retention killers)
1. **No save system** — Every session starts fresh. This is the #1 reason players don't return.
2. **Crafted items do nothing in gameplay** — Go-kart, flying machine, spring boots are inventory trophies with no functional effect.
3. **No player-placed building** — You mine blocks but can't place them. Scrap Mechanic's entire appeal is building.
4. **14 recipes is too thin** — Minecraft has 300+; even a simple game needs 40+ to sustain a session.
5. **Linear quest chain ends** — After Quest 5 there is literally nothing to do.
6. **No skill progression** — No XP, no level gates, no permanent player growth between sessions.

---

## Phase 1 — Foundation (Highest ROI, Do First)
*Target: 2–3 weeks. These are table-stakes; every competitor has them.*

### 1.1 Save System (localStorage)
**Why:** Forager, Minecraft, every successful crafting game holds players across sessions.
Without saves, players who spend an hour mining lose everything on refresh. Instant churn.

**What:** Serialize `player.inventory`, `player.crafted`, `achievements.unlocked`,
`achievements.stats`, `foreman._questIndex` to `localStorage` as JSON on every craft/mine event
and on `beforeunload`. Load on init. Show "Saved ✓" toast on write.

**Files:** `Game.js` (save/load orchestration), `Player.js` (serializable state),
`Achievements.js` (stats serialization), new `SaveSystem.js`.

### 1.2 Functional Item Effects
**Why:** Scrap Mechanic's whole identity is "things you build actually work." Currently
crafting a Go-Kart is a dead-end trophy. Middle schoolers feel ripped off.

**What:**
- **Spring Boots** → double jump height (add `player.jumpBonus` multiplied into jump velocity when `spring_boots` in inventory)
- **Go-Kart** → hold-to-ride: while selected in hotbar + W held, apply 2.5× speed multiplier and engine audio
- **Flying Machine** → toggle flight mode: smooth vertical thrust, no gravity, different FOV
- **Battery Pack** → extends ScrapBot follow range from 3 → 12 blocks; bot auto-collects nearby drops
- **Pipe Cannon** → right-click fires a physics projectile that knocks loose items toward player (vacuum effect)

**Files:** `Player.js`, `Game.js` (item-use dispatch), `ScrapBot.js`.

### 1.3 Block Placement System
**Why:** You can mine but not build. Half the voxel game loop is missing. Rust, Minecraft,
Scrap Mechanic all center on placing blocks.

**What:** Right-click on a targeted block face → place the active hotbar item (if it's a
block type). Use `target.face` from `renderer.getTargetBlock()` to compute placement
coordinates. Support: WALL_METAL, WOOD_PLANK, CONCRETE, CRATE, ROOF_METAL. Show ghost
preview block on hover.

**Files:** `Renderer.js` (ghost block mesh), `Game.js` (right-click → place),
`World.js` (setBlock already exists), `Player.js` (hasMaterial check).

### 1.4 Recipe Expansion (14 → 45 recipes)
**Why:** Minecraft's crafting depth is its most-cited retention driver. 14 recipes takes
~20 minutes to exhaust. Need 2+ hours of meaningful progression.

**Additions (grouped by theme):**
- **Tier 1 expansions:** Scrap Bucket (carry water), Rope, Steel Nail, Pry Bar, Wire Cutter, Tin Snips
- **Tier 2 structural:** Metal Wall Panel, Catwalk Plank, Hatch Door, Storage Crate (12-slot container), Signal Lamp
- **Tier 2 electronics:** Solar Panel, Voltage Meter, Spark Plug, Relay Switch
- **Tier 2 survival:** Welding Mask (night-vision in dark zones), Work Gloves (faster mine speed)
- **Tier 3 automation:** Conveyor Hook (passive scrap pickup in radius), Pressure Valve, Pneumatic Drill (3× mine speed on metal)
- **Tier 4 prestige:** Exo-Arm (permanent speed + jump boost), Plasma Cutter, Beacon Tower (summons Earl anywhere)

**Files:** `src/data/recipes.js`, `src/data/items.js`, `src/data/blocks.js` (new block types for placeable versions).

---

## Phase 2 — Core Expansion
*Target: 4–6 weeks. This is where Scrapcraft becomes a real game.*

### 2.1 Skill Tree (XP System)
**Why:** Forager's active→passive transition and Valheim's biome-gated skill trees are the
#1 cited "why I kept playing" reason. Visible player growth = retention.

**Design:** Award XP for mining (1 XP), crafting (5–20 XP by tier), quest completion (50 XP),
discoveries (10 XP). At each level threshold, show a skill selection UI (3 random options,
pick 1). Skills are permanent this session; saved to localStorage.

**Skill examples (8 trees, 4 skills each):**
- **Mining:** Faster swing, double-drop chance, auto-smelt ore, seismic sense (see ores through walls)
- **Crafting:** Cheaper recipes (–1 ingredient), instant craft, batch craft ×4, recipe discovery (reveals hidden recipes)
- **Electrical:** Battery lasts longer, arc range ×2, shock on mine (bonus damage), passive charge (ScrapBot auto-recharges)
- **Structural:** Place 2 blocks at once, instant placement preview, wall reinforcement (placed blocks have 2× health)
- **Mobility:** Sprint (Shift = 1.5× speed), wall climb, long fall immunity, grapple hook (new craftable)
- **Engineering:** Gear efficiency (go-kart uses no fuel), overclock (machines run 2×), blueprint mode (save/load building layouts)
- **Scavenging:** Finder's eye (items glow), lucky drops (+20% drop chance), magnet pull (auto-pickup in 3-block radius)
- **Earl Lore:** Unlock extra Earl backstory, rare item tips from Earl, Earl follows you sometimes

**Files:** New `src/systems/SkillSystem.js`, `src/UI.js` (skill tree panel), `Player.js` (apply modifiers).

### 2.2 Side Quests + Repeatable Challenges
**Why:** Rust's monthly wipes and Minecraft's achievement system create infinite replay. After
Earl's 5 quests end there's a void. Side quests fill it.

**Design:**
- 15 side quests unlocked by zone (5 per band), gated by items found in that band
- 10 "Daily Challenge" style timed tasks (mine X in 2 minutes, craft 3 devices before sunset)
- 5 hidden "Earl's Secrets" quests — found by interacting with environment oddities (crashed plane, mystery monument)
- Post-game: Earl's "Legendary Contracts" — repeatable high-reward tasks once all main quests done

**New quest examples:**
- "The Refinery Run" — find all 10 oil drums in Industrial Corridor and destroy them
- "Circuit City Lights" — activate all 5 power boxes in Band 2 within 1 game-day
- "Crash Investigation" — examine all parts of the crashed plane in The Deep Yard
- "The Monument Mystery" — Earl doesn't know what it is. You have to figure it out.

**Files:** `src/Foreman.js` (quest bank expansion), `src/UI.js` (side-quest tracker).

### 2.3 Crafting Station Upgrades
**Why:** Valheim's "upgrade your workbench to tier 3 to unlock tier 3 recipes" is the cleanest
progression gate ever designed. Gives players a goal; makes exploration matter.

**Design:** Each station (workbench, forge, smelter) has 3 upgrade tiers. Upgrading requires
materials found in progressively deeper bands. Tier 2 recipes require tier-2 stations.

| Station | Tier 1 (default) | Tier 2 unlock | Tier 3 unlock |
|---|---|---|---|
| Workbench | Basic tools | 8 iron + 4 wood (any band) | 6 circuit boards (band 2+) |
| Forge | Smelting | 10 iron + 2 fuel (band 1+) | 8 clean metal + 4 gears (band 2+) |
| Smelter | Alloys | 12 iron + 6 gears (band 1+) | 4 circuit boards + 4 batteries (band 3) |

Station level shown visually (emissive glow increases, particle effects).

**Files:** `src/World.js` (station level state), `src/systems/CraftingSystem.js`,
`src/UI.js` (upgrade UI when near station + E).

### 2.4 World Interactables & Secrets
**Why:** Minecraft temples/dungeons, Valheim boss altars, and Rust's monument puzzles are
all cited as major exploration motivators. The world currently has props but no interactive
environmental storytelling.

**Design:**
- **Locked crates** (band 1+): Require specific tool to open; contain rare drops + Earl lore notes
- **Crashed Plane (band 3):** Interact with cockpit → triggers cutscene-style Earl monologue + gives unique "Black Box" item used in a secret recipe
- **Mystery Monument:** Place all 5 "scrap rune" items (found across bands) at the base → Earl reveals his backstory + unlocks Legendary difficulty
- **Oil Drum clusters:** Blow up with pipe cannon → AoE loot burst + Earl quip
- **Radio Tower (band 2):** Repair it with circuit boards → unlocks Earl's "broadcast mode" (random rare quip every 30 seconds)
- **Hidden Basement:** Dig straight down at the mystery monument coordinates → find Earl's old workshop with unique items and lore fragments

**Files:** `src/World.js` (interactive landmark registry), `src/Game.js` (interact dispatch),
`src/Foreman.js` (new lore quip banks).

---

## Phase 3 — Depth & Systems
*Target: 6–8 weeks. Makes the game replayable.*

### 3.1 Automation Layer (Forager-Inspired)
**Why:** Forager's "active → passive" transition is its most addictive mechanic.
Satisfactory's factory chain optimization is endlessly engaging for the engineering-minded.
Middle schoolers who "solve" automation feel genuinely smart.

**Design:**
- **Conveyor Hook** (craftable, tier 3): Place near a scrap pile; auto-mines 1 block/10 seconds into your storage crate
- **Auto-Smelter** (upgrade to existing smelter): Processes ores from connected crates continuously
- **Spark Wire** (new block type): Connect power boxes → lights up structures → unlocks new recipes in wired stations
- **Pneumatic Tube** (placeable): Items placed in one tube end appear at the other end. Teaches real pneumatic logic.
- **Pressure Valve + Boiler**: Chain → creates steam → runs auto-forge at double speed. First real machine chain.

The design goal: by band 3, a player can build a passive scrap-collection system that runs while
they explore. The satisfying moment when your factory ticks without you is the hook.

**Files:** New `src/systems/AutomationSystem.js`, new block types in `blocks.js`.

### 3.2 NPC Trading + Scrap Economy
**Why:** Rust's trader NPC and Minecraft villagers are social anchors that create goals
("I need 20 iron to get that sword"). Simple economy prevents resource stagnation.

**Design:**
- **The Scrapper** (NPC, appears in band 0 shed): Trades bulk materials. Iron ×10 → Spring ×3; Fuel ×5 → Gear ×4
- **Circuit Sally** (NPC, band 2): Trades circuit boards for rare electronics items. Daily refresh.
- **Earl's Favor**: Completing Earl's quests unlocks "Earl Bucks" — a special currency he reluctantly offers for exceptional crafting feats. Spendable at The Scrapper for rare items.
- Items have a "junk value" — you can sell anything to The Scrapper for Earl Bucks at low rates

**Files:** New `src/NPC.js`, `src/Game.js` (NPC interaction), `src/World.js` (NPC spawn positions),
`src/UI.js` (trading panel).

### 3.3 Weather + Environmental Hazards
**Why:** Valheim's weather changes exploration strategy. Rust's radiation zones gate loot.
Environmental variety makes the world feel alive and creates risk/reward decisions.

**Design:**
- **Acid Rain** (random, 90-second events): Damages non-roofed metals; speeds up corrosion on certain blocks; players under ROOF_METAL are safe. Teaches shelter design.
- **Electrical Storm**: Power boxes spark and briefly disable electrical connections; gives copper wire drops on struck CLEAN_METAL
- **Dense Fog** (night, band 3 only): Visibility drops to 15 blocks, items glow green through fog (requires Finder's Eye skill or Welding Mask)
- **Heat Wave** (noon, band 1): Forge crafting speed 2×; player "overheating" indicator slows movement if unshaded for 60 seconds

**Files:** `src/DayNight.js` (weather state), `src/Renderer.js` (fog + visual effects), `src/Game.js` (hazard tick).

### 3.4 Minimap + Explorer's Journal
**Why:** Minecraft's map and Forager's expanding reveal mechanic both drive exploration.
Middle schoolers get lost in 128×128 worlds without navigation help.

**Design:**
- **Minimap** (top-right HUD): 64×64 pixel canvas updated every 2 seconds. Shows current band color + player dot + discovered landmarks as icons.
- **Explorer's Journal** (new tab in overlay): Each discovered landmark (station, crashed plane, monument, NPC) gets an entry. Earl writes one sardonic sentence per entry. 20 possible entries = completionist hook.
- **Compass** (craftable): Shows cardinal direction + nearest undiscovered landmark arrow.
- **Map Pins**: Right-click minimap to drop a pin. Pins appear as 3D world markers. Middle schoolers love marking their discoveries.

**Files:** New `src/Minimap.js`, `src/UI.js` (new journal tab + compass widget), `src/World.js` (landmark registry expansion).

---

## Phase 4 — Social & Polish
*Target: ongoing. Multiplayer is a 10× engagement multiplier for this demographic.*

### 4.1 Multiplayer (WebRTC / WebSocket)
**Why:** Roblox's entire value proposition is social. Middle schoolers will play a mediocre
game with friends rather than a great game alone. Co-op crafting is proven (Valheim, Scrap Mechanic co-op, Minecraft SMP).

**Design:** WebSocket server (Node.js, ~200 lines). Players see each other as colored box-figure avatars (same ScrapBot skeleton). Shared world state — blocks mined by one player are gone for all. Earl talks to the group. Building becomes collaborative.

**Implementation notes:** 
- Server-authoritative for blocks; client-side prediction for movement
- Cap at 4 players to keep server costs zero on free tiers (Cloudflare Workers Durable Objects)
- Chat: simple T-to-type overlay (content filtered for middle-school context)
- Shared achievement unlocks: "Earl's Crew" — complete a quest with 2+ players simultaneously

**Files:** New `server/` directory, `src/systems/MultiplayerSystem.js`, `src/UI.js` (player list, chat).

### 4.2 Build Sharing + Blueprints
**Why:** Scrap Mechanic's workshop integration and Minecraft's screenshot culture prove that
sharing creations is a primary motivation for this age group.

**Design:**
- **Blueprint system**: Select a 16×16×8 region → save as JSON blueprint. Blueprints stored in localStorage.
- **Share code**: Blueprint JSON → base64 → shareable URL param. Friend pastes URL → loads blueprint for placement.
- **Hall of Fame**: Top 5 blueprints (voted by local plays) shown on start screen.

### 4.3 Mobile-Friendly Controls
**Why:** Middle schoolers are on phones. The current pointer-lock + keyboard setup is desktop-only.

**Design:**
- Virtual joystick (left thumb) for movement
- Mine/interact button (right side)
- Swipe gestures for hotbar selection
- Touch-hold for mining (mimics mouse-hold behavior)
- Responsive UI breakpoints for 375px screens

### 4.4 Accessibility & Educational Integration
**Why:** STEM-game research shows content lands when embedded in decisions. Currently the
Codex is a passive read tab. Make the science actionable.

**Design:**
- **Codex entries unlock recipe hints**: Reading the "How Do Gears Work?" entry reveals the Gear Assembly recipe.
- **Earl quizzes**: Once per session, Earl asks a science question related to the last thing you built. Correct answer = 2× XP bonus. Wrong answer = Earl quip.
- **Teacher Mode** (URL param `?teacher=1`): Shows a sidebar with curriculum alignment labels (Physics, Chemistry, Engineering). Generates a session report of which concepts the player encountered.

---

## Priority Matrix

```
                    HIGH IMPACT
                        │
     Save System ───────┤──── Functional Items
     Block Placement ───┤──── Recipe Expansion
                        │
    LOW EFFORT ─────────┼──────────────── HIGH EFFORT
                        │
     Minimap ───────────┤──── Multiplayer
     Side Quests ───────┤──── Automation Layer
                        │
                    LOW IMPACT
```

### Recommended execution order
1. **Save System** — table stakes, 1 day of work, eliminates #1 churn reason
2. **Functional Items** — spring boots + flight mode, 2 days, immediate "wow" moment
3. **Block Placement** — 3 days, unlocks the entire creative half of the game
4. **Recipe Expansion** — 1 day, pure content, doubles session length
5. **Skill Tree** — 5 days, biggest single retention driver, cross-session hook
6. **Crafting Station Upgrades** — 3 days, creates band progression motivation
7. **Side Quests** — 3 days, content, eliminates the post-Earl void
8. **World Interactables** — 4 days, environmental storytelling
9. **Automation Layer** — 7 days, makes the game replayable for power users
10. **Minimap + Journal** — 3 days, navigation quality-of-life
11. **NPC Trading** — 4 days, economy depth
12. **Weather Hazards** — 3 days, world variety
13. **Multiplayer** — 2–3 weeks, 10× engagement but requires server infrastructure
14. **Mobile Controls** — 1 week, doubles accessible player base
15. **Educational Integration** — 3 days, unlocks school/classroom market

---

## Earl's Vision (North Star)

The end state: a player starts fresh, gets greeted by Earl, mines their first scrap, crafts
a wrench, builds a workbench upgrade, unlocks a skill, discovers the crashed plane, builds
a conveyor system, crafts a go-kart that actually drives, invites a friend, and two hours
later they've built a machine that mines for them while they fly around in a flying machine.

At that point they've learned electromagnetic induction, gear ratios, vulcanization, and
circuit board logic — and they have no idea it happened.

That's the game.
```
