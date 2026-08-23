# USCP Mapping Spec v2 — Scrapcraft ⇄ CNS Transduction

> **Status:** Phase 2 of the Rift (see `RIFT-PHASE-1.md` for the archive, `RIFT-MANIFESTO.md` for the doctrine).
> **Rule of honesty:** every signal below is marked **LIVE** (emits real, inspectable state in this repo today) or **PROPOSED** (transduction rule + consumer defined, wire not yet lit). The source files are real and cited — grep them.

USCP = Universal Sensory/Command Packet. Phase 1 established the pipeline:

```
Ingest (raw game event) → Enrichment (Pincher-cache + lore-grounded RAG via lore_ref) → Sink (Quilt Engine / Durable Objects → Live Quilt Sheet)
```

Phase 2 expands the signal surface from mechanics-only to the full yard: **social**, **equipment**, **progression**, plus the **lore_ref registry** that lets the CNS read implications, not just values.

Real-world precedent: the statement shape follows the xAPI model (actor–verb–object + result + context, stored in a Learning Record Store; see xapi.com / IEEE 2247-1) — Scrapcraft is a learning game, and USCP is its experience API. The discipline model follows marine VHF (ch.16 watchkeeping, squelch, PTT — see `../docs/VHF-DOCTRINE.md` in-repo and navcen.uscg.gov watchkeeping rules).

---

## USCP envelope (unchanged from Phase 1, restated)

```jsonc
{
  "ts": 1771900000000,          // client clock at emit
  "actor": "player:slot1",      // or "bot:demo3", "companion:rivet", "coach:local"
  "verb": "RESOURCE_ACQUIRED",  // see vocabularies below
  "object": { "kind": "item", "id": "scrap_iron", "qty": 5 },
  "result": { ... },            // optional: deltas, scores, outcomes
  "context": {                  // where the yard was when it happened
    "band": "yard-gate",        // soft band from Spine.unlockedBand()
    "chapterPos": 4,            // spine position
    "wakes": ["wake-yardlight"] // yard-remembers state
  },
  "lore_ref": "lore://mechanics/power_depletion_protocols"
}
```

Every section below follows the same template: **Source** (file in this repo) → **Transduction** (rule) → **Consumer** (who reads it, CNS-side).

---

## A. SOCIAL signals — the yard is a relationship, measure it as one

The companion system already maintains a rigorous social state machine. It is not decoration; it is graded, monotonic, and persisted. Social signals tell the CNS not what the player *did* but what the player *is becoming* — a kid who follows nudges is a kid who trusts the yard's teaching voice.

### A1. `COMPANION_BOND_DELTA` — bond points earned/lost — **LIVE (source) / PROPOSED (wire)**

- **Source:** `src/companion/state.js` — `BOND_EVENTS` maps 17 shared-event types to bond weights (`first_meet: 0`, `block_mined: 1`, `rare_loot: 3`, `bot_built: 12`, `program_run: 4`, `lap_complete: 6`, `race_run: 8`, `crash_survived: 3`, `flash_success: 10`, `conversation: 5`, `biome_first: 5`, `repair_done: 4`, `nudge_followed: 3`, `ghost_beaten: 10`, `spark_consult: 4`). Comment in source: *"Real events only — no timers, no pity points."* `CompanionState.record()` updates `data.bond`, a 12-entry recent-event ring (`RECENT_CAP`), and per-event counters.
- **Transduction:** each `record(event)` call emits one USCP packet: verb `COMPANION_BOND_DELTA`, object `{personaId, event}`, result `{gain: BOND_EVENTS[event], bond: data.bond}`. Enrichment attaches `lore_ref: lore://cast/<persona>` so the CNS can ground *why this persona cares about this event* (e.g. trackside personas weight `nudge_followed` — see `src/companion/personas.js` persona event lists).
- **Consumer:** Quilt Sheet `companions` group (already declared in `src/maker/QuiltSheet.js` GROUPS) renders live bond per persona; CNS fleet-memory keys social growth curves per player across sessions.

### A2. `COMPANION_TIER_CROSSED` — stranger → coworker → friend — **LIVE (source) / PROPOSED (wire)**

- **Source:** `src/companion/state.js` — `TIER_THRESHOLDS = { stranger: 0, coworker: 30, friend: 120 }`; the derived `tier` getter comment: *"Never decreases."* Tiers are ratchet-only by design.
- **Transduction:** on tier transition emit `COMPANION_TIER_CROSSED {from, to, personaId}` with `lore_ref: lore://cast/<persona>#arc`. Tier crossings are rare, high-signal, ceremony-grade events — the kid *feels* them (persona dialogue changes), so the CNS should too.
- **Consumer:** fleet Longitudinal Memory (milestones); Back Room eligibility context (an arc completion earns a Prestige Mark — see C3); manifesto-grade stories ("Rivet made friend on day 3 of the field trial").

### A3. `NUDGE_FOLLOWED` — the player tried what the companion suggested — **LIVE (source) / PROPOSED (wire)**

- **Source:** `src/companion/Companion.js` (≈lines 150–166) — `NUDGE_MAP` translates game verbs to nudge ids (`build_first_bot`, `program_bot`, `race_lap`, `flash_hardware`, `repair_bot`, `beat_a_ghost`, `ask_spark_question`, `line_follow`); when the player completes a mapped event that the nudger had fired, `state.record('nudge_followed', …)` runs. Rationale in `src/companion/nudge.js`: *"Rivet remembers being listened to."*
- **Transduction:** emit `NUDGE_FOLLOWED {nudge: NUDGE_MAP[event], personaId}`; enrichment resolves `lore_ref: lore://cast/<persona>#nudges` and the teaching-moment implication (this is the *trust* channel — the single best leading indicator that the kid is coachable by the yard's voices).
- **Consumer:** CNS pedagogy heuristics (nudge-follow rate per band); VHF coach doctrine (a kid who follows companion nudges is ready for radio nudges — see A4); Quilt companions group.

### A4. `RADIO_TX` / `RADIO_RX` — coach radio exchanges; the state machine is itself a signal — **LIVE (source) / PROPOSED (wire)**

- **Source:** `src/radio/VhfRadio.js` — three exclusive states `['IDLE','RECEIVING','TRANSMITTING']`, `MAX_TX_MS = 8000` auto-squelch, `CHANNEL_BUSY` on overlap attempts, squelch open only while transmitting. `src/radio/SpectatorCoach.js` — DEMO_CREW of three bots on real tile programs (`EXAMPLE_WALL_AVOIDER`, `EXAMPLE_LIGHT_RUNNER`, `EXAMPLE_WAYPOINT_NAV`), PTT input, per-bot TTS voices, ACK line rotation. `src/radio/NudgeRouter.js` — parses spoken/text coach input into intents `goto | mine | follow | stop | race | banter` (ttl 8000 ms). Doctrine: `docs/VHF-DOCTRINE.md`.
- **Transduction (two layers):**
  1. **Exchange layer:** each PTT press emits `RADIO_TX {intent, targetBot, durationMs}`; each bot ACK emits `RADIO_RX {ack, intent}`. These are teach/learn events: the coach spoke, the agent obeyed or bantered back.
  2. **Protocol layer — the doctrine signal:** every `CHANNEL_BUSY` refusal, every squelch timeout, every state transition is emitted as `RADIO_PROTOCOL {from, to, reason}`. Marine VHF ch.16 discipline says *a radio that is always watched is a safety system* (navcen.uscg.gov watchkeeping); a radio that is *misused* is a diagnosis. A session with many CHANNEL_BUSY refusals is a coach who hasn't internalized half-duplex — the CNS reads protocol friction as fluency telemetry. **The state machine is not just plumbing; it is itself a sensor.**
- **Consumer:** fleet comms-law monitoring (VHF doctrine compliance), pedagogy (intent diversity per session — did the coach only ever say `goto`?), Quilt `program`/`companions` cells; future Roblox-port multiplayer: one channel per yard, arbitration by the same state machine (see Manifesto §Shared Yard).

### A5. `CONVERSATION_HELD` / `PARTY_CROSSTALK` — dialogue and multi-persona dynamics — **LIVE (source) / PROPOSED (wire)**

- **Source:** `src/companion/converse.js` (free-talk), `src/companion/party.js` (multi-companion crosstalk), `src/companion/story.js` — summary snapshot exposes `{tier, bond, drift, driftLabel, pull, firsts, crosstalkCount}`.
- **Transduction:** `conversation` bond events already flow through A1; additionally emit `PARTY_CROSSTALK {personas: [ids]}` when party.js hands the mic between companions. `crosstalkCount` rides in `result`.
- **Consumer:** social-graph enrichment CNS-side (which personas the player collects); lore-RAG grounding via `lore://cast/index`.

---

## B. EQUIPMENT signals — a tile program is heritable DNA

The kennel doctrine (SuperInstance `THE_KENNEL.md`, rung 3: *"The skill left the runtime and went into the blood"*) maps 1:1 onto Scrapcraft's Maker Lab: **a tile program is a genome.** It is pure JSON (`src/maker/TileProgram.js`: *"plain JSON-serializable data — NO behaviour lives here… what makes save/load, sharing-by-URL, AI-authoring, and remixing all trivial"*), it is authored by selection pressure (does it win laps? avoid walls?), and it is already shared through a gallery — reproduction with variation. Equipment signals make the *lineage* legible to the CNS.

### B1. `PROGRAM_AUTHORED` / `PROGRAM_RUN` — bot build configs and brain programs — **LIVE (source) / PROPOSED (wire)**

- **Source:** `src/TileEditor.js` (editor, undo history as program-JSON snapshots, `spark_program` achievement hook), `src/maker/TileProgram.js` (`SCHEMA_VERSION = 1`, node constructors `T.*`), `src/ScrapBot.js` (runtime). Build config = `{name, brain, nodes[]}` tree; node types documented in TileProgram header (action/wait/repeat/forever/repeat_until/break/print/comment/random_var/read_sensor/math_var/wait_until/if/if_else/macro).
- **Transduction:** on save/first-run emit `PROGRAM_AUTHORED` with a **genome digest**: `sha256(canonicalJson(program))`, node census by type, depth, sensor/actuator vocabulary used. Runs emit `PROGRAM_RUN {digest, ticks, outcome}`. Enrichment attaches `lore_ref: lore://mechanics/tile_programs` (the "program as DNA" doctrine) plus the plaque it exercises, if any (`lore://plaques/...`).
- **Consumer:** kennel lineage book (CNS): parent/child by digest similarity; Quilt `program` group (live, already in QuiltSheet); teacher dashboard (`teacher.html` — class progress surface) gets "programs authored per student."

### B2. `BRAIN_SHARED` / `BRAIN_LOADED` — gallery reproduction events — **LIVE (source) / PROPOSED (wire)**

- **Source:** `src/BrainGallery.js` — publish flow ("Publishing shares your tile program with the community"), worker endpoint `POST /api/v1/share-brain`, scrap-spark shared wall merge (builds AND failures tagged), load-back notifies and tracks `brain_share` achievement. Legacy worker brains + scrap-spark wall are merged in one grid.
- **Transduction:** emit `BRAIN_SHARED {digest, name, tag}` and `BRAIN_LOADED {digest, byPlayer}` — these are **mating events** in kennel terms: a genome left one yard and took root in another. Failures shared are just as heritable (the gallery keeps them deliberately) — negative selection data.
- **Consumer:** fleet kennel ledger (which bloodlines propagate across yards); SuperInstance kennel-ladder analytics (rung 3 evidence: skill leaving the runtime).

### B3. `BOT_BUILD_CONFIG` — editions and upgrades as phenotype — **LIVE (source) / PROPOSED (wire)**

- **Source:** `src/data/botEditions.js` — `BOT_EDITIONS` standard vs gate (`speedMult 1.0/0.8`, `batteryDrainMult 1.0/1.25`; *"weaker-not-worse contract is data, testable headless"*). `src/BotUpgrades.js` (upgrade path). `src/BotPersonality.js` (names).
- **Transduction:** on build/upgrade emit `BOT_BUILD_CONFIG {edition, upgradeSet, name}`. Enrichment: `lore_ref: lore://items` (parts) and `lore://yard#gate` (the Gate Edition story — Earl's "not as clean as the Smelter's").
- **Consumer:** Quilt `pose`/`heart` context; kennel phenotype book (genome × phenotype → observed behavior, e.g. does a wall-avoider genome on a gate edition still avoid?).

### B4. `BOT_LEDGER_EVENT` — dents, repairs, milestones, retirement — **LIVE (source) / PROPOSED (wire)**

- **Source:** `src/BotLedger.js` — dents (wall-bonk with where + how fast, `DENT_COOLDOWN_S 2.5`, `STALL_TIME_S 0.8`), repairs (repair_kit), milestones ("first program, first lap, crash-free streaks, bond levels — the bot REMEMBERS"), retirement shelf with epitaph (`scrapcraft_bot_shelf`).
- **Transduction:** every ledger append emits one USCP packet, verb `BOT_LEDGER_EVENT {kind: dent|repair|milestone|retire, …}`. Retirement emits a terminal packet with the epitaph — a eulogy is a high-signal artifact; archive it verbatim with `lore_ref: lore://yard#shelf`.
- **Consumer:** fleet memory (bot biographies); QC/UX (dent heatmaps = where the yard's geometry fights new drivers); the heart — the manifesto's proof that equipment is kinship, not inventory.

### B5. `QUILT_CELL_TICK` — the live spreadsheet as continuous equipment telemetry — **LIVE (source, local) / PROPOSED (wire to CNS)**

- **Source:** `src/maker/QuiltSheet.js` — TickCell `{v, t, ch}` (value, timestamp, changed-flag); groups sensors/pose/motors/program/pins/heart/companions; *"every value that changes flashes. A kid watching `distance_ahead` tick down… is watching causality happen, cell by cell."*
- **Transduction:** the quilt sheet is already a USCP Sink in miniature — map TickCell → USCP `QUILT_CELL_TICK {cell, v, t}` batched per tick-window; unchanged cells are silent (`ch` flag suppresses noise — squelch for spreadsheets).
- **Consumer:** Quilt Engine / Durable Objects (Live Quilt Sheet, fleet-side); this is the Phase-1 sink made concrete: the local sheet is the on-device cache, the DO is the fleet mirror.

---

## C. PROGRESSION signals — the spine, the wakes, the marks

Progression in Scrapcraft is deliberately anti-grind (see `src/prestige/Prestige.js`: *"the kid chooses, nothing is grindable, nothing expires"*). Progression signals are therefore low-volume, high-meaning: the CNS should treat each one as a chapter boundary in a biography, not a score tick.

### C1. `SPINE_POSITION_ADVANCED` / `CHAPTER_OPENED` / `CHAPTER_COMPLETED` — the twelve-chapter reading order — **LIVE (source) / PROPOSED (wire)**

- **Source:** `src/quests/Spine.js` — `SpineState` (`scrapcraft_spine_v1`): chapter position is monotonic (*"completed sets only grow… the position never walks backwards"*), chapter-open ceremonies fire once ever (cold-start-gate persisted), soft bands (`unlockedBand()`) swap zone quips for Earl nudges — never blocks. Spine data in `src/quests/data/index.js`; bible in `docs/SPINE.md`; arc in `../scrapcraft-world/worldbible/campaign.md` (12 chapters, gate arrival → Midnight Race).
- **Transduction:** emit on ceremony and completion: `CHAPTER_OPENED {n}` (with `lore_ref: lore://campaign/ch{n}`), `SPINE_POSITION_ADVANCED {from, to}`. Band context rides in every packet's `context.band` (already in the envelope).
- **Consumer:** fleet longitudinal memory; teacher dashboard chapters view; lore-RAG enrichment (the campaign doc is the canonical chapter text — the CNS can narrate progress in-world).

### C2. `YARD_WAKE` — dormant things waking, one per completed chapter — **LIVE (source) / PROPOSED (wire)**

- **Source:** `src/story/Wakes.js` — 7 `WAKE_EVENTS` across ch 2/4/6/7/8/9/12 (`wake-yardlight` … `wake-racenight` "The Night Everything Was On"), monotonic (*"the yard wakes, it never sleeps again"*), fail-soft, `scrap.wakes.v1`.
- **Transduction:** on `sync()` returning newly-woken ids, emit `YARD_WAKE {id, chapter}` with `lore_ref: lore://yard/wakes#<id>`. These are ambient ceremony events — low frequency, maximum atmosphere.
- **Consumer:** fleet memory (the yard-state timeline per player); Quilt context; the Manifesto's "the yard remembers" thread — a wake is the world's own progression, parallel to the kid's.

### C3. `PRESTIGE_MARK_EARNED` / `BACKROOM_PURCHASED` — marks in, kindness out — **LIVE (source) / PROPOSED (wire)**

- **Source:** `src/prestige/Prestige.js` — marks: 6 max (1 per companion arc: Bolt/Magma/Juno/Rivet ×5 quests each, + 2 for the Midnight Race); spendable on the Back Room board (`backroom.json`): paint, yard decor, lantern colors, second bot slot. `src/prestige/perks.js` (perk effects), `src/prestige/BackRoomPanel.js` (UI). Economy is FINITE by design, no dark patterns.
- **Transduction:** emit `PRESTIGE_MARK_EARNED {source: arc|race}` and `BACKROOM_PURCHASED {rewardId, category, marksLeft}`. Enrichment: `lore_ref: lore://cast/earl#backroom` (Earl's Back Room is a character beat — marks in, kindness out).
- **Consumer:** fleet memory (what a kid *chose* with unrepeatable currency is a values signal, not a shopping signal); teacher dashboard (engagement depth).

### C4. `QUEST_COMPLETED` / `LOGBOOK_ENTRY` — the transcript for teachers — **LIVE (source) / PROPOSED (wire)**

- **Source:** `src/quests/QuestSystem.js` (completion flow → prestige wiring), `src/quests/Logbook.js` / `LogbookPanel.js` (the transcript UI), `src/quests/README.md` — vessel-quest doctrine: *"the Logbook is the transcript for teachers."* Objective taxonomy from SuperInstance/luau-quest; declarative JSON quests from SuperInstance/lau-quest.
- **Transduction:** quest completion already funnels through `_completeQuest` — the natural single tap point. Emit `QUEST_COMPLETED {questId, chapter, objectives}`; the Logbook IS the human-readable projection of the stream (same data, two renderings).
- **Consumer:** teacher dashboard (`teacher.html`, live) is the first-class consumer; xAPI-shaped export for LRS interop is the proposed bridge (actor–verb–object maps 1:1 — see envelope).

### C5. `MOS_LEDGER_UPDATE` / `XP_SKILL` / `ACHIEVEMENT_UNLOCKED` — supporting progression — **LIVE (source) / PROPOSED (wire)**

- **Source:** `src/quests/MosLedger.js` (MoS ledger), `src/XPSystem.js` (XP + skill nodes), `src/Achievements.js` (49 achievements incl. `spark_program`, `brain_share` tracked from TileEditor/BrainGallery).
- **Transduction:** batch low-priority progression events; emit achievements with their id + `lore_ref` where a plaque/landmark is implicated (`lore://plaques/*`, `src/data/plaques.js`, 14 plaques each teaching an embedded concept — see `../scrapcraft-world/worldbible/plaques.md`).
- **Consumer:** Quilt progress cells; fleet analytics (achievement curves per cohort).

---

## D. lore_ref registry skeleton — namespaces over the world bible

`lore_ref` is the enrichment join-key that lets the CNS read implications instead of values (Phase 1 finding). The registry is aligned to the world bible repo (`../scrapcraft-world/worldbible/` — the narrative layer the game lanes consume directly). **Registry format: PROPOSED; target files: LIVE.**

| Namespace | Source file(s) | Covers | Example lore_ref |
|---|---|---|---|
| `lore://yard/` | `worldbible/yard-bible.md` | The place: history, four bands, the Oval (35,84), the Ghost legend, doctrine | `lore://yard#oval` |
| `lore://yard/wakes/` | `worldbible/yard-bible.md` + `src/story/Wakes.js` | The seven wakes | `lore://yard/wakes#wake-racenight` |
| `lore://cast/` | `worldbible/characters/*.md` (earl, spark, june, quill, mo, ox, rivet-the-cat; index.md casting rules) | Cast roster + arcs | `lore://cast/earl#backroom` |
| `lore://campaign/` | `worldbible/campaign.md` | The 12-chapter arc | `lore://campaign/ch7` |
| `lore://items/` | `worldbible/items.md` + `src/data/items.js` | ~40 named parts w/ story | `lore://items/scrap_iron` |
| `lore://plaques/` | `worldbible/plaques.md` + `src/data/plaques.js` | 14 landmark plaques, each a real embedded concept | `lore://plaques/hc-sr04` |
| `lore://spark/` | `worldbible/spark-personality.md` + `src/spark/*` | Mentor AI sheet (curiosity-first, one-knob-at-a-time) | `lore://spark#voice` |
| `lore://mechanics/` | game docs: `docs/SPINE.md`, `docs/VHF-DOCTRINE.md`, `docs/VOICE-QC.md`, codex (`src/Codex.js`, 27 entries) | Game mechanics doctrine — the Phase-1 example `lore://mechanics/power_depletion_protocols` lives here | `lore://mechanics/tile_programs` |
| `lore://kennel/` | SuperInstance doctrine docs (`THE_KENNEL.md`, `WORKING_ANIMAL_ARCHITECTURE.md`) — cross-repo | The bloodline/program-DNA doctrine (B-section implications) | `lore://kennel/rung3` |

Rules (proposed):
1. `lore_ref` MUST resolve to a file that exists at enrichment time; unresolvable refs are logged and dropped, never fatal (fail-soft, like Wakes).
2. Fragment (`#id`) addresses anchor within a file; the enrichment layer uses the vector store (Phase-1 lore-RAG), so refs are retrieval hints, not hyperlinks.
3. Cross-repo namespaces (`lore://kennel/`) are allowed but flagged `external:true` in enrichment output.
4. The registry ships as `docs/cns/LORE-REGISTRY.json` when Phase 3 lights the wire (generated from the table above + a crawl of the worldbible).

---

## E. What is live vs proposed — the honest ledger

| Layer | Status |
|---|---|
| All A/B/C source systems (companion state, VHF radio, tile programs, gallery share endpoint, bot ledger, quilt sheet, spine, wakes, prestige, quests, achievements) | **LIVE** in `src/` — persisted, headless-testable, grep-able |
| Local Quilt Sheet/View (on-device telemetry rendering) | **LIVE** (`src/maker/QuiltSheet.js`, `QuiltView.js`) |
| scrap-spark worker + shared wall + `share-brain` API | **LIVE** (cloud-config dependent) |
| Teacher dashboard (`teacher.html`) | **LIVE** (class connection flow) |
| USCP envelope + emit taps (the wire from game → CNS) | **PROPOSED** — single tap points identified: `CompanionState.record()`, `VhfRadio` state transitions, `TileProgram` save, `BotLedger` appends, `SpineState` ceremonies, `PrestigeSystem.onQuestCompleted`, `QuestSystem._completeQuest` |
| lore_ref enrichment / lore-RAG join | **PROPOSED** (Phase-1 verified the blueprint; registry skeleton in §D) |
| Quilt Engine Durable Object sink (fleet mirror) | **PROPOSED** |
| Roblox-port multiplayer signal fan-out | **PROPOSED** (see Manifesto) |

— *Rift Phase 2, 2026-08-23. Sources cited by file; drift between this doc and `src/` is a bug — file it against the doc.*
