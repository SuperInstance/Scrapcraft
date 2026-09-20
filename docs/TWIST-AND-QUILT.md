# Twist and Quilt — how Scrapcraft fits the fleet's own physics

*A grounded mapping between two SuperInstance repos —
[`twist-engine`](https://github.com/SuperInstance/twist-engine) (the fleet's
law, as an interactive canvas toy) and
[`quilt`](https://github.com/SuperInstance/quilt) (the reactive cellular
runtime) — and what Scrapcraft already ships. Shipped claims cite a file in
this repo; forward-looking claims are marked **[aspirational]**.*

## Scrapcraft is already a quilt node (shipped)

`quilt`'s thesis is blunt: *"Everything is a cell. A sheet is a JSON document
of cells with dependencies. An engine evaluates the sheet reactively."*
`src/maker/QuiltSheet.js` is exactly that pattern, ported local-only inside
Scrapcraft: a table of `{ id, group, kind: value|formula, deps? }` cell
metadata, backed by `TickCell { v, t, ch }` — value, timestamp, and a
changed-this-tick flag. Formula cells (`motor.left = drive + turn`,
`pose.speed = |drive| × DRIVE_SPEED`) are recomputed every tick from their
`deps`, and the sheet exposes `changed()` so the view can flash exactly the
cells that moved. That's the reactive spreadsheet, running on a kid's robot
instead of a server.

`src/maker/QuiltBridge.js` is the opt-in bridge that turns the *local* sheet
into a *networked* one: an off-by-default, fail-soft client for the deployed
`scrap-quilt` Cloudflare Worker (`/tick`, `/predict`, `/chat`). Its
`SENDABLE_CELLS` allow-list carries 41 input cells (robot pose, motors,
sensors, program counters, race/build/flash state — never free text a child
typed); the Worker computes 14 more formula cells server-side (per
`docs/FLEET-AND-FRONTIER.md`), for **55 cells total** in the live schema —
the same value/formula split as `QuiltSheet.js`, just running on the far side
of a POST. The gap `FLEET-AND-FRONTIER.md` documents still holds: the bridge
class exists and is tested, but the running game does not call it yet.

## The twist law, played out on a kid's yard

`twist-engine`'s law is "layers + a deliberate offset → interference →
emergence — the cell is the universal substrate, the offset is the cheapest
program." Scrapcraft's robots are the layer: every bot runs the same
deterministic `TileVM` (`src/maker/TileVM.js`), the same sensors, the same
physics. The *offset* is the kid's tile program — the one arrangement of
`SENSE`/`CMP`/`ACT` bytecode that makes an identical chassis swerve, hug a
wall, or spin in place. Same substrate, different angle, different emergent
behavior — TWIST's moiré pattern with a chassis instead of a hex lattice.

What Scrapcraft adds that the toy substrates don't have is a **ledger for the
offset's effect that survives beyond one session**: `ChallengeReplay.js`
encodes a tamper-evident token of a program, `verifyReplay` re-runs it against
a scripted challenge and returns the *same* verdict every time, and
`explain.js` narrates the VM's bounded decision trace into "it checked
distance ≥ 0.3 → yes, so it turned." Where TWIST's ledger reads S(θ) off a
canvas, Scrapcraft's ledger is a replayable star rating plus a trace anyone
can re-run and audit — measurement of emergence, not just a demo of it.

## Mapping to QUILT mode specifically

`twist-engine`'s QUILT mode is a 24×24 grid of Kuramoto oscillators, even/odd
sub-lattices offset by a tempo δ, with a ledger that builds a co-fire graph
and counts holes: `b1 = E − V + C`, the first Betti number. Scrapcraft's
`QuiltSheet` is not that — it has no oscillator phases and computes no Betti
number. The honest mapping is conceptual: both are grids of "dumb" cells
(oscillator phase vs. sensor/motor value) whose *pattern of simultaneous
change* is the interesting signal — QUILT's ledger counts topological holes
in co-firing cells, Scrapcraft's `changed()` set is the same idea at a much
smaller scale, cell-by-cell causality a kid can watch by eye instead of a
number a chart plots.

## The third order: the shape of the drive (shipped)

The fleet reads any process as a *gesture* with three orders — how far it
travels (arc), how much it turns within a plane (bending / curvature), and how
much it turns *out of* that plane (twist / torsion): "abstraction as gesture,"
the same reading `gesture-kit` gives notes, rooms, conversations and cells, and
the property `twist-engine` says lives "in the twist."

Scrapcraft ships that reading over a robot's own path. When a kid's program
runs, `MakerChallenge.js`'s deterministic headless loop records the bot's pose
each tick, and `src/maker/DriveGesture.js` reads the shape of the resulting
`(x, z, heading)` curve in SE(2), per-column normalized so metres and radians
compare fairly:

- **arc / meanSpeed** (1st) — how far and how fast the bot drove.
- **bendingEnergy → `smoothness`** (2nd) — how much the drive keeps changing
  direction. This is the headline kid-facing signal: a clean straight-then-stop
  barely bends; a hunt-and-peck, over-corrected drive bends hard. *Jerky vs.
  glided.*
- **twistEnergy → `arcFlow`** (3rd) — how much the drive *screws through space*,
  turning and moving at once. A bot that drives a circle (turn + drive together)
  traces a **helix** in `(x, z, heading)`, which has torsion; a bot that drives
  in straight legs with separate stop-and-turn beats stays in a plane and has
  none. So twist reads *flowing racing-line arcs* vs. *stop-and-turn* — and it
  is honest about its limit: a straight or stop-and-turn drive reports zero
  twist, because there genuinely is none.

The reading is attached to every run as `metrics.driveGesture` and is
**analysis only** — no built-in challenge verdict reads it, so it changes no
existing star rating; it is deterministic like the rest of the sim (same
program → same shape), and it is covered by `drive-gesture-tests.mjs`. This is
the fleet's third-order lens carried authentically into the game: the kid's
tile program is the offset, and the drive it produces has a shape you can read.

## What's shipped vs. what's a direction

**Shipped:** `QuiltSheet.js` (local reactive cell graph), `QuiltBridge.js`
(tested, opt-in, unwired client), the deployed `scrap-quilt` Worker (per
`FLEET-AND-FRONTIER.md`), `TileVM.js` (deterministic, seedable, traced),
`ChallengeReplay.js` (reproducible verdicts), `explain.js` (offline trace
narration), `DriveGesture.js` (three-order reading of a run's path, attached to
every challenge's `metrics.driveGesture`). **[Aspirational]:** wiring the bridge into live play; any
Kuramoto/Betti-style topology ledger over Scrapcraft's own cells; a
classroom of bots coordinated the way `quilt-swarm`/`quilt-nomad` coordinate
a cluster. None of that second group exists in this repo today.
