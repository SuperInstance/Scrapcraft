# VETERAN RIDE — the honest fork at the gate

Some kids already know the yard. Maybe they played last summer at a cousin's
house; maybe a classroom cohort is six chapters deep and a new student wants
to ride along. The Veteran Ride is the one honest offer at the yard gate:

> **🚚 VETERAN RIDE — jump in at Chapter 7** or **Keep fresh**

It generates a *deterministic* veteran profile (`src/veteran/veteranRide.js`,
pass-1 module): a player who walked six of the twelve spine chapters, owns
their tools (wrench, headlamp, generator, stocked materials), has both bots
(Sparky + Nano), and rides into the yard mid-spine at Chapter 7 with Rivet —
a friend, not a stranger — at their shoulder.

## When the offer shows (and never shows again)

- **Only** on a truly fresh boot (no save on disk) at the onboarding-complete
  moment — the fork at the gate, before the intro cutscene. One session guard:
  `Game._veteranRideOffered`.
- **Or** by an explicit click: the `🚚 VETERAN RIDE (NEW SLOT)` button in the
  pause menu. That path is always available to a curious kid.

## The honest gate — achievements are LIVE-ONLY

The yard doesn't hand out trophies for a backstory.

- `achievements.unlocked` ships **empty** — zero seeded medals.
- The stats bag is a **fresh all-zeros replica** of `SaveSystem._collect()`'s
  shape — zero fabricated `totalMined`, `programsRun`, laps, anything. Every
  achievement, every milestone, every plaque is still earned by doing it.
- The veteran save carries a top-level `veteran: { ride: true, at, seed, bots }`
  flag — debugging provenance only. `SaveSystem._apply` tolerates unknown
  keys, so nothing in the save pipeline reads it as gameplay state.
- The companion friendship (Rivet at bond 130, friend tier, real shared
  history counters) **is** part of the story seed — narrative state, not an
  achievement stat. The bots' ledgers live outside the save (own
  `localStorage` keys); the profile carries a `veteran.bots` hint array the
  host may apply.

## No ceremony wall

Chapters ch01–ch06 are seeded as **completed with `migrated: true`** entries
in the tracker (`scrapcraft_quests` — the spine's position truth), and the
spine storage marks them opened+completed. Spine/Tracker read these as
backfilled history: the veteran arrives to Chapter 7 already in progress —
no wall of catch-up ceremony cards, no re-run quests. The wakes for
chapters 2/4/6 are pre-fired (the yard is already quietly alive), so the
first *live* wake still gets its cutscene only when it's genuinely new.

## The slot policy — nothing is ever lost

- The veteran module **never** writes the live key `scrapcraft_save_v6`
  itself. `Game.activateVeteranRide()` does the switch:
  1. If a live save exists, back it up first:
     `scrapcraft_save_v6_backup_<Date.now()>`, and remember the newest backup
     key in `scrapcraft.veteran.backup`.
  2. `applyVeteranProfile()` seeds the four side-storage keys (spine
     `scrapcraft_spine_v1`, wakes `scrap.wakes.v1`, companion
     `scrapcraft_rivet`, tracker `scrapcraft_quests`).
  3. The profile's save is written to **both** the veteran slot
     (`scrapcraft_save_v6_veteran`, provenance) and the **live** key — that
     write *is* the profile switch. On a fresh boot there was no live save,
     so nothing is lost by construction.
  4. `scrapcraft.profile = 'veteran'` is stamped, then `location.reload()`.
- **Restore**: while `scrapcraft.veteran.backup` exists, the pause menu shows
  `⬅ RESTORE MY SAVE` — copy the backup over the live key, clear the flag,
  reload. The backup blob itself is kept (belt and braces).
