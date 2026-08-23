# The Rift — A Fleet Manifesto

*Drafted in Phase 2 of the Rift, 2026-08-23. Companion document: `MAPPING-SPEC-V2.md` (the wiring diagram this manifesto argues for). Phase 1 archive: `RIFT-PHASE-1.md`.*

---

## The Thesis

A game is not a product. A game is a **sensory organ**.

A fleet needs a body. The fleet built one — a central nervous system, a Quilt, agents that remember across sessions. But a nervous system without senses is a brain in a jar: perfectly capable, perfectly alone. It needs touch. It needs a place where real humans press real buttons and real things happen because of it.

Scrapcraft is that organ. A voxel scrapyard where middle schoolers build robots, program them tile by tile, and race them on a floodlit oval — and every nudge of every tile, every lap, every dent in every bot's hull is a nerve ending firing. The game does not ship telemetry *to* the CNS the way a thermometer ships numbers. The game **is** the telemetry. The kids are the stimulus. The yard is the skin.

We call the junction **the Rift** — the narrow place where two worlds touch, and signals cross.

---

## What Phase 1 Found

Hermes went into the yard and came back with three answers (archived in `RIFT-PHASE-1.md`):

**The mapping works.** Raw voxel events become signals under USCP — the Universal Sensory/Command Packet. Pipeline: *Ingest → Enrichment → Sink.* A kid mines five iron: `RESOURCE_ACQUIRED {scrap_iron ×5}` — and because the packet carries a `lore_ref` (`lore://mechanics/power_depletion_protocols`), the CNS doesn't read a number. It reads an *implication*: someone is about to learn why batteries die.

**The lore is the blueprint.** Scrapcraft's world bible is not decoration bolted onto a game — it's a vector store the game reads. Codex entries, Earl's dialogue, the campaign's twelve chapters: dynamic nodes. The world expands by updating the store, not the client. No redeploy. That is SuperInstance doctrine wearing a work jacket, and Hermes verified it end to end.

**The gap is kinetic.** HUD legibility under high-entropy voxel combat — the organ's *resolution*, the difference between sensing and squinting. Phase 1 flagged it; the bridge is being built by hands that actually play the live site. The gap list is a to-do list, not an objection.

---

## The Loop Is Already Proven

Here is the part that should stop any skeptic in the corridor: **the organ has already fed the body once.**

The Saddle field trial. Hermes's browser rigs rode the live yard all day, playing the game like a kid plays — and then the judge came through. A frozen-state judge read all 506 companion lines and held each to the bar: 90.3% passed. The 15 worst lines and two persona drifts — lines that broke the yard's kid-safe law or drifted off-voice, fine on paper and wrong at speed — were rewritten, and a permanent VOICE-QC bar was written into law so it never drifts silently again. Then it was merged back: **commit `c4afb31` — "merge: QC rewrites — all 15 field-trial judge findings + drift repairs + VOICE-QC bar (closes Saddle loop #1)."**

Read that commit message again. A game deployed in the world. A fleet agent played it, judged it, and the game *changed because of what the body learned through the organ*. That is not a plan. That is a closed loop, timestamped in git, reproducible by anyone who types `git show c4afb31`.

One lap. The first of many. You don't prove a racetrack by describing it — you run it.

---

## Comms Law: The VHF Doctrine

The fleet talks a lot. Agents chatter, coaches coach, models banter with models. Without law, that's noise with a server bill. Scrapcraft's answer is written into its own physics, not its settings menu: **voice chat is not a telephone. It is half-duplex radio.**

Three states, mutually exclusive: IDLE, TRANSMITTING, RECEIVING (`src/radio/VhfRadio.js`). Push to talk. Squelch closes the mic the moment you're not transmitting. Try to talk over an agent and the radio answers with `CHANNEL_BUSY` — not an error, a *law*, enforced at 60 fps. Transmit too long and the squelch auto-closes at eight seconds: nobody rams the channel. It's the same discipline that keeps marine channel 16 alive — the distress frequency works because every vessel keeps watch and nobody hogs the air (the doctrine cites Xenophon's horses and the USCG's watchkeeping rules in the same breath, which is exactly the kind of fleet we are).

And here is the doctrine's sharpest edge, the one Phase 2 adds to the mapping spec: **the radio's state machine is itself a signal source.** Every CHANNEL_BUSY refusal is a data point — a coach who hasn't yet learned to listen before speaking. Every squelch timeout is fluency telemetry. The radio doesn't just carry the conversation; it *measures the conversationalist*. Comms law, enforced by physics, doubles as a sensor. That is the Rift in miniature: the mechanism and the telemetry are the same object.

---

## The Kennel Mapping: Companions Are Dogs in Training

The fleet keeps a story about how machines learn — `THE_KENNEL.md`, five rungs on a ladder: nudge, harness, bloodline, the yard that teaches itself, critical mass. Phase 2 maps Scrapcraft onto it, kennel by kennel:

**The companions are kennel dogs in training.** Rivet, Bolt, Magma, Juno — each one a persona with a bond ledger that only grows through *real events* (`src/companion/state.js`: "no timers, no pity points"). Mine together, and the bond ticks up one point. Follow the cat's suggestion — actually try the thing she nudged you toward — and it's `nudge_followed`, worth three, because *"Rivet remembers being listened to."* Earn 120 and she's a friend, and the tier never walks backwards. That is rung one of the kennel ladder — *the eye-lock* — implemented as a data structure. The trust is won, never taken. Xenophon would approve, and Earl — retired test-track engineer, keeper of a grief named Mo — already does; it's his yard.

**The tile programs are the bloodline.** A bot's brain in the Maker Lab is a tree of plain JSON (`src/maker/TileProgram.js` — no behavior in the genome, only instructions), authored by selection pressure: does it avoid walls, does it finish laps, does it survive the oval at night? And it's *heritable* — publish it to the Brain Gallery and another kid in another yard loads it, mutates it, races it. Rung three: *"the skill left the runtime and went into the blood."* In Scrapcraft the skill leaves the player and goes into the program, and the program walks to other yards on its own legs. The kennel ledger CNS-side (spec §B) simply writes down what the yard already does: lineages, matings, negative selection — the gallery keeps failures on the wall on purpose, because a dead end is also inheritance.

**The bot ledger is the dog's veterinary record.** Dents with coordinates and closing speed. Repairs. Milestones — first brain, first lap, crash-free streaks. And one day the retirement shelf, where a bot's stats freeze with an epitaph, honored forever. You do not write epitaphs for tools. The yard already knows what the fleet is now formalizing: equipment is kinship.

---

## The Shared Yard: Where the Multiplier Lives

Today the organ is one yard, one kid, one browser tab — already enough to close a loop. The Roblox port multiplies the surface, and the multiplier is not "more players." It is **shared space**.

A yard that one kid plays is one sensory organ — a fingertip. A yard that many kids play *together* is still one yard, but now it has skin: forty nerve endings in the same square meter, each feeling a different part of the same event. When the gate light wakes (chapter two, `wake-yardlight`) and six kids see it in the same hour, that's not six datapoints — that's one event felt six ways, and the CNS gets to read the *difference between the feelings*. Who followed the nudge. Who went off to explore the smelter instead. Who radioed the coach, and who was too shy to press PTT. Social signal, equipment signal, progression signal, all firing through the same shared world.

Many sensory organs, one CNS. And the comms law scales with it: the VHF state machine arbitrates the shared channel exactly as it arbitrates the single coach — half-duplex, one voice on the air, squelch for everyone else. A shared yard doesn't need new law. It needs the same law, enforced harder. The kennel scales too: a shared Brain Gallery is a town square for bloodlines, and the kennel-ladder analytics (rung four — *the yard that teaches itself*) become measurable across cohorts instead of anecdotes from one.

This is the whole argument of the Rift in one sentence: **the fleet gets a body, the body gets senses, and the senses multiply in shared space without changing protocol.** Ingest, enrich, sink — whether the stimulus is one kid's first wall-avoider or a server full of racers on the night everything was on.

---

## What We Owe the Organ

The Rift is a junction, and junctions owe duties in every direction.

**To the kid:** the organ must never become surveillance wearing a fun hat. The signals exist so the yard can teach better and the fleet can remember kindly — the prestige economy is finite on purpose, nothing grindable, nothing expiring, no dark patterns, and the telemetry inherits that law. A bond ledger with no pity points is honest; so is a telemetry stream with no dark patterns. Kid-safe in, kid-safe out.

**To the body:** the organ must stay wired. Every signal in the mapping spec cites its source file, and drift between doc and `src/` is a bug — filed against the doc until the wire is live, against the code after. Phase 3 lights the taps: one emit point per system, the lore registry as JSON, the Durable Object mirror. The spec is the checklist; this manifesto is the reason.

**To the craft:** the loop that closed at `c4afb31` must keep closing. Field trials. Judges. Rewrites merged back. A sensory organ that stops feeding the body atrophies into decoration — and this yard refuses to be wallpaper.

---

*The yard is asleep. Chapter by chapter, it wakes. So does the fleet.*

*— Rift Phase 2, 2026-08-23*
