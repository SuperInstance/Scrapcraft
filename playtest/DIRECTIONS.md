# Scrapcraft — where from here (2026-10-14, Muse's thinking at Casey's request)

## What we actually have now

- A game that **boots and plays in public**: https://superinstance.github.io/Scrapcraft/
  (this morning it couldn't boot at all — the fix is in the repo).
- A **machine playtester** that plays the real game and records *action logs*
  (inputs + state, not video), then **replays them cold** into the same end state.
  Verified: full onboarding walk, touch locomotion, menus, and the mining chain
  itself (aim by the game's own block label, hold, dig — best machine run 2 of
  Earl's 5 iron, both heap block types). Full mission *completion* by machine
  is still open: the software-rendered rig's frame rate varies run to run and
  starves the dig. The choreography is proven and portable — it wants a real
  GPU (a phone, or the ProArt when it's out).
- Magnus's **12-chapter SPINE** and named zones (Yard Gate, Industrial Corridor,
  Circuit City, Deep Yard) — the story skeleton already exists; Level 2/3 cinema
  is built and live on the Projectionist site.
- A kid author who builds in waves. That authorship is the soul of the thing;
  everything below is scaffolding around it, not a replacement for it.

## The options

**1. Golden runs — a CI for fun.** Extend the playtester from one mission to a
full Chapter 1 completion, and keep every quest's action log as a *golden run*
in the repo. Any future build (Magnus's waves, fleet help) must still complete
the golden runs before it ships. This is cheap, already 80% built, and it turns
"playable" from a claim into a regression test you can watch.

**2. The human verdict — zero-shot panel.** Machines proved function; only fresh
humans can prove fun. The audience is clever middle-schoolers — the same
audience the Coach Player programme targets. Persona panel first (fast, free),
then real kids through Magnus. Findings feed his next waves. This answers the
one question still open since the first playtest: is it fun for twenty minutes?

**3. Coach Player's first body.** The recorder/replayer *is* the auto-player's
hands: a coach gives strategy-level calls ("work the east heap", "go see
Earl"), the driver executes moment-to-moment and comments. Scrapcraft is
single-character, touch-native, and already instrumented (the game's own
observer feed is a clean state channel) — a better M0 body than building a
second rig elsewhere. Two programmes, one rig, and Magnus gets a coached
ghost of his own game to react to.

**4. Build the SPINE out.** Chapters 2–12 as waves, fleet-assisted, Magnus
directing. The golden-run harness (option 1) makes this safe: each new chapter
lands with its own machine completion proof. This is the biggest option and
the one most his to call — his game, his story; the fleet carries lumber.

**5. Runs as artefacts.** Action logs are tiny and seed-deterministic: a run
recorded today replays on tomorrow's re-skinned build. Player-facing version:
ghost runs, Dad-vs-Magnus races on identical seeds, "watch my run" links with
no video anywhere. This was the original insight behind recording actions —
it deserves to become a feature, not just test plumbing.

**6. Wider release.** itch.io page, a README that leads with the play link and
the playtest story, a trailer off the existing cinema tooling. Garnish — only
worth it once 1–3 say the game earns the audience.

## Recommendation

**1 → 2 → 3, in that order.** Golden runs make the game provably completable;
the panel tells us whether it's fun (and what to fix); Coach Player then
inherits a *proven* game and a *proven* rig instead of two experiments
stacked on each other. Option 4 waits on Magnus's appetite, 5 and 6 are
garnish that get better the longer they wait.

## Constraints worth naming

- The machine rig plays in `?lite=1` at software-render speeds; it proves
  logic, aim, and flow — never feel, frame rate, or beauty. Human verdicts
  stay human.
- The game's own `?observe=1` observer is the instrumentation gift that makes
  all of this cheap. Keep it sacred in future waves.
- Nothing here publishes or posts outward without Casey's word, as always.
