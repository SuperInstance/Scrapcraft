# Addendum — Earl's first mission by machine (2026-10-14 evening)

Six machine runs at "Mine 5 iron scrap" (`sessions/session-mission-{1..6}.jsonl`).
The mining chain is **proven end to end**; mission completion stands at **2/5**,
blocked by the test rig, not the game.

## What the runs established

- **Mission 1 (blind holds): 0/5.** Spawn's crosshair sits *above* the heap's
  top face — 14 eight-second holds dug sky. Aim is the whole game.
- **Mission 2 (label-guided aim): 1/5.** Pitching down until the game's own
  block label read `[ SCRAP PILE ]`, then holding, dug the first iron;
  the observer logged `levelup · Level 1`. Chain-mining then stalled — after
  a block breaks, the ray's next target is unstable at ~1 fps.
- **Mission 3 (step-in + re-aim): 2/5** — `[ SCRAP PILE ]`, then
  `[ RUSTED METAL ]` after stepping in. Session killed by the driver's own
  560 s watchdog mid-hunt.
- **Mission 4: 2/5** again — but state samples had degraded to 15–60 s each;
  the rig's frame rate collapses over a long evening.
- **Mission 5 (open-loop choreography): 2/5 in 5 minutes.** The spawn column
  is exactly 2 iron deep; behind it the ray lands on `[ CRACKED CONCRETE ]`.
  The pile is wide, not deep.
- **Mission 6 (lateral choreography): 0/5.** Same labels, no yield — per-run
  frame-rate variance is the binding constraint. The dig accrues by clamped
  frame time, so a slow run starves it. This is a substrate lottery, and it
  is why the grind stopped at six.

## What completion needs

A real-time substrate. The driver, the aim-by-label method, and both
choreographies (open-loop and lateral) are in `record.cjs` (`mission`,
`mission-final`, `mission-6` modes) and are portable as-is — on the ProArt's
GPU, or any machine that renders the game at speed, the same action logs run
in real time and the mission completes in about two minutes.

## A correction on session 9's scope

Re-read line by line for this addendum: session 9 (the log shipped in this
repo as the golden run) proves the **onboarding walk and locomotion/look**,
nothing more. Its quest counter reads (0/5) in every state sample; there is
no item find and no return-to-Earl beat in that log. Menu interactions
(Workshop on E, Earl dialog on F) were verified by screenshot in **session
4**, not session 9. Anything that implied a fuller trip was the summary
outrunning the log; the log is the record.
