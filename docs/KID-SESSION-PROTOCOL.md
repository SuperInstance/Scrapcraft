# KID-SESSION PROTOCOL — First Real Playtest (30 minutes)

> **Purpose:** generate the project's FIRST primary customer evidence (docs/RESEARCH-2026-08.md §4.4 Step 0: "instrumented informal play sessions"). One kid, one fresh device, one observer, 30 minutes. The question is not "can they learn engineering" — it's **do they voluntarily re-enter the world**. Watch for that; everything else is signal.
>
> **Instrument:** Observer Mode (`?observe=1`). OFF in normal play, zero-cost when absent.

---

## 0. Before the kid arrives (5 min, observer only)

- [ ] Fresh device/browser profile (incognito is fine). **No existing save, no auto-login.**
- [ ] Open the game with the observer flag:
      `https://<deploy-url>/?observe=1`
- [ ] Confirm the **OBSERVER** panel is visible bottom-left (dark box, gold `OBSERVER` header, ticking clock).
- [ ] Note the session start time and the kid's age/name shorthand in your own notes (the log only records game events).
- [ ] Silence your phone. Sit **behind and to the side** — you are a camera, not a co-player.
- [ ] Have the recorder ready (voice memo is fine) — verbatim quotes are gold.

## 1. Handoff (minute 0–1)

Say, calmly and exactly once:

> "This is a game about building robots in a scrapyard. Play however you want.
> I'm not going to help unless you're really stuck — mostly I'm just watching.
> There's no wrong way to play."

Then **stop talking**. Do not fill silence. Do not narrate.

## 2. Observing (minute 1–29)

You are watching for **one thing**: does the kid *choose* to keep playing?

### What to record (in your own notes, verbatim where possible)
- **Confusion moments** — write the kid's exact words ("what do I do", "where do I go", "how do I mine"). The game's job is to make these unnecessary; every one is a bug report with a timestamp.
- **Delight moments** — smiles, "oh cool", "look what I made", reading something aloud.
- **Boredom moments** — "this is boring", fidgeting, asking to do something else, tab-switching.
- **Bypasses** — things the kid does that the game didn't expect (climbing weirdly, ignoring the tutorial, building nonsense). These are design gold.
- **Voluntary re-entry signals** — kid starts a *second* thing on their own (new quest, new bot, new area) without being told.

### What the observer log captures automatically (via `?observe=1`)
Scrollable session log with timestamps, exportable as JSON:

| Entry kind | When |
|---|---|
| `session_start` / `session_end` | observer armed / page close or END button |
| `quest` | every quest completion (`arc/id — title`) |
| `levelup` | every XP level gained |
| `first_mine` / `first_build` / `first_race` | first occurrence of each (once per session) |
| `companion` | every companion line (`Name: text`) — see the moment the bot "talks" |
| `death` | player death / respawn |
| `reset` | save wipe (once per session) |
| `pause` / `resume` | pause overlay open / closed |
| `note` | facilitator scratchpad (type in console: `window.__scrapcraftObserver.note('...')`) |

**At minute 30 (or when the kid stops):** click **⤓ JSON** in the observer panel (or `window.__scrapcraftObserver.downloadJSON()`). The file is `scrapcraft-session-<timestamp>.json`. Crash insurance: the log also auto-stashes to localStorage (`SessionObserver.recoverStash()`).

## 3. When NOT to help

- **Don't help** with: controls you know are in the UI, quest objectives, what to build next, "is this right".
- **Do help** (count it as a fail): anything that blocks play for >60s of obvious frustration, or the kid asks directly *and* looks distressed. When you do help, **note it** in the log (`note('helped with X at ~12min')`) — helped-moments are first-class data: they mark tutorial/onboarding gaps.
- **Never** solve it *for* them — hint the next single step, then back off.
- If the kid wanders off mid-session, **let them**. End early, export, write it down. A walkaway at minute 12 is the most important data of the day.

## 4. The 3 questions (minute 30, right after they stop)

Ask all three, in order, **exactly** (or as close as fits the kid's energy). Record answers verbatim:

1. **"What were you trying to do?"**
   — reveals their goal structure vs. the game's; what they thought the game was *about*.
2. **"What was your favorite moment?"**
   — the wow that worked; cross-reference against the log's `first_*` milestones and companion lines.
3. **"What was boring?"**
   — the honest cut; no defensiveness, no fixing it in the moment. Just "ok, thanks."

Then: **"Would you play this again tomorrow?"** (bonus, off-script — it's the closest thing to a voluntary re-entry verdict you can get in one session.)

## 5. Wrap-up (minutes 31–35, after the kid leaves)

- [ ] Click **■ END** then **⤓ JSON** in the observer panel. Save the file: `sessions/kid-<name>-<date>.json` (create the folder).
- [ ] Save your observer notes alongside: `sessions/kid-<name>-<date>.md` (verbatim quotes + timestamps).
- [ ] Transcribe the 3 answers into that file.
- [ ] One-line verdict: `VOLUNTARY RE-ENTRY: yes / maybe / no` + the reason in one sentence.
- [ ] Do NOT fix the game tonight. Collect ≥3 sessions first, then mine the logs for the top-3 friction and top-3 delight, and only then touch code.

## Rules of the road
- One kid per session; never two (they coach each other and the signal blurs).
- Fresh profile every session — observer data must not inherit prior progress.
- No pizza/tablet bribes mid-session; a drink is fine.
- If the kid asks "is this AI?" — say yes, it's a robot friend that talks, and let them react. Record the reaction.
- **Nothing in this protocol is a promise to the kid.** No "you'll get a prize for finishing." The session ends when they want it to end.

---

*Companion doc: docs/RESEARCH-2026-08.md (§4.4 Step 0). Instrument: src/observer/ObserverMode.js (`?observe=1`).*
