# Scrapcraft — playable playtest report, 2026-10-14

**Build under test:** Magnus's Scrapcraft, deployed by Muse at https://play.superinstance.dev/
(private, login-gated; username `casey`). Original repo `~/workspace/build/scrapcraft` never modified —
all work in the copy at `~/workspace/scrapcraft-play/engine`.

## Headline: the deployed game could not boot — fixed

- Symptom: CLOCK IN → "⚠️ Boot failed — refresh to try again", for every visitor, every browser.
- Root cause: `vite.config.js` marks `three` external; source `index.html` carried **no importmap**,
  so the lazily-imported game chunks failed with `Failed to resolve module specifier "three"`.
  (The cinema pages worked because `cinema.html` has its own importmap.)
- Fix (play copy only): vendored `three@0.168.0` (1,298,981 B) at `/vendor/three.module.js`,
  importmap added to `index.html`, cinema pages repointed to the vendored file, rebuilt, redeployed
  via KV-only `deploy-files.py` (passcode untouched). Live-verified: login 302, vendor 200, importmap
  served, boot probe clean (menu dismisses, zero console errors).

## Method — action logs, not video (Casey's doctrine)

- Rig: headless Chrome (SwiftShader) through a local CONNECT forwarder; game in `?observe=1&lite=1`,
  fixed seed (`playtest-1` → 1337) for a deterministic world; touch emulation (the game's native
  iPad mode — desktop pointer lock is denied in this rig because the software-rendered boot outlives
  the click's gesture activation; a rig artifact, not a game bug).
- Log format (JSONL, ms session clock): `session` / `nav` / `login` / `dialog` (semantic UI actions) /
  `entry` (director steps) / `key` / `mouse` / `touch` (raw in-world inputs) / `state` samples
  (HUD text + the game's own session-observer feed) / `shot` / `done`.
- UI navigation is recorded **semantically** (named DOM actions) because raw touch taps on DOM
  buttons are eaten by the game's touch layer; raw inputs are reserved for in-world play — the part
  worth replaying and re-skinning.

## Verified

- **Full entry walk** (sessions 7–9, deterministic): title → CLOCK IN → chapter card
  ("The Gate Is Never Locked") → CompanionGate Q1 (engines) → Q2 (explore) → Earl's briefing (Skip)
  → **Veteran Ride offer (Keep fresh)** → free play, Earl's mission live
  ("Mine 5 iron scrap (0/5)"), Rivet + Bolt beats in the observer feed.
- **Locomotion + look (session 9):** virtual joystick renders and tracks the drag (mid-hold
  screenshot); after two forward pushes and a look-drag the player stands in a different part of the
  yard facing a new structure, "SCRAP THIS WAY" marker swung ↑ → ←. Position and heading both moved.
- **Menus (session 4):** E opens the Workshop (Crafting / Achievements / Codex / Field Report),
  F opens Talk-to-Earl. Zero console errors in clean sessions.
- **REPLAY (session 9 log):** fresh browser, entry re-walked semantically, recorded in-world inputs
  re-issued on schedule — **end frame matches the original session's end frame** (same structure,
  same marker, same HUD; observer clocks 01:39 vs 01:43). Actions replay. The format works.

## Not verified / open

- **Mining:** the (0/5) counter never moved under the rig (tap-action switch is a DOM button —
  touch taps don't reach it; centre-hold didn't dig). Needs a human hand or a driver v2 that sets
  the tap action semantically before holding.
- **Fun over time:** a machine can prove function, not feel. Zero-shot human verdict still owed —
  Casey on the phone is the real test (touch is the native path and his GPU renders properly).

## Findings worth Magnus's eye

1. **The onboarding gauntlet is five layers deep** before a new player touches the world:
   chapter card → two gate questions → paged briefing → Veteran Ride offer. Each beat is charming;
   together they're a lot of fence before the yard. The Veteran Ride offer (a skip-ahead upsell)
   landing on a *first-ever* run is the oddest beat.
2. In touch mode the tutorial card still reads "Press **W A S D** to walk" — desktop copy on the
   iPad path.
3. The game is genuinely funny in the small: Earl's mug, Rivet's count-keeping, Bolt's entrance.
   The writing carries the first five minutes.

## Artefacts

- Sessions: `~/workspace/scrapcraft-play/sessions/session-{1..9}.jsonl` + `session-9.replay.jsonl`
- Screenshots: `~/workspace/scrapcraft-play/shots-record/`, `shots-replay/`
- Driver: `~/workspace/scrapcraft-play/record.cjs` (+ `record.sh`, `proxy-fwd.cjs`)
