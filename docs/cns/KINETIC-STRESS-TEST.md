# Rift Audit — Kinetic HUD Stress-Test Report (SCRAPCRAFT)

**Date:** 2026-08-23, 12:33–13:30 AKDT
**Target:** https://fleet-static-host.casey-digennaro.workers.dev/scrap/ (live)
**Tester:** Lucineer subagent (browser automation + raw CDP)
**Method:** Live play in headless Chromium (SwiftShader WebGL, 780×437), engineered entropy (movement sweeps, turn-in-place, LMB mining hold with aim jiggle), rAF frame probe, DOM geometry audit, pixel-contrast analysis of screenshots, console capture.

---

## ⚠️ INCIDENT: Boot failure encountered (stop-condition hit)

At **13:21–13:26 AKDT**, clock-in ended in `⚠️ Boot failed` overlay.

**Console evidence:**
```
[main] Boot failed TypeError: Failed to fetch dynamically imported module:
https://fleet-static-host.casey-digennaro.workers.dev/scrap/assets/Game-D_W9XXMp.js
Failed to load resource: the server responded with a status of 404 ()
```

**Root cause — deploy churn, not code regression:** the site was redeployed repeatedly *during* the test (parallel session actively publishing):
- 12:33 boot OK on `index-RUDnBcPL.js`
- 13:15 index served `index-spmwRYFy.js` (+`Game-D_W9XXMp.js`, fetched fine at 13:19)
- 13:2x `Game-D_W9XXMp.js` → 404 (purged); index now `index-5vb0A5A7.js` (third hash this session)

A stale cached index referencing a purged chunk 404s on dynamic import → boot failure. **Deploy-time window exists where cached clients hard-fail.** Per mission directive, gameplay testing stopped here. Screenshot: `11-loading-yard.png` (near-black screen, quest-stack text/bg gap 1.7 luminance units — effectively UNREADABLE failure state).

---

## Environment context (affects interpretation)

- Headless SwiftShader (no GPU): **sustained 0.5 FPS** (rAF probe: 49 frames / 102.4 s; p95 frame delta 2400 ms, max 2700 ms; 47 hiccups >1800 ms). All "entropy" moments render ~1 frame per 2 s. Real-GPU behavior will differ; the *DOM* HUD updates are unaffected by rAF, so text legibility findings stand.
- Console during play: no JS exceptions. Warnings: SwiftShader deprecation; **"GPU stall due to ReadPixels (High)"** — game-side ReadPixels pattern is a real perf risk on weak GPUs.
- Heavy co-tenant load on the test box (parallel agent session: vite preview on 127.0.0.1:4199, dev server :5213, repeated live-site reploys; system load avg 8+, RAM ~100 MB free). One 10-minute hard page freeze (renderer 630% CPU) and one Chrome death occurred under this pressure; both recovered.
- Shared-browser interference: production tab was externally navigated to `127.0.0.1:4199` (local dev build, different asset hash) — NOT a production-code redirect (bundle grep: zero localhost/127.0.0.1 references in shipped JS).

## Gameplay-flow findings (stability class)

1. **Zone-gate crossings are full page reloads** (`?vet1→vet2→restore1..4→wipe2` state machine). Each crossing: multi-second freeze, JS context wipe, and one observed **state regression** — Lv.8→Lv.0, hotbar inventory wiped (40 iron, 12 rope…), active quest changed ("Craft a repair kit" → "Break 8 Concrete Blocks").
2. **Contradictory quest rows during restore churn**: SALVAGE RUN panel showed "Break 8 Concrete Blocks 0/8" while the QUESTS/NEXT row simultaneously showed "Mine 5 iron scrap (0/5)".
3. Dialogue overlays (z90/z2000, 55% black scrims) render **above the entire HUD** (HUD z ≤ 40) — HUD dims to near-unreadable during every Earl dialogue.

---

## Verdicts per HUD surface

| Surface | Calm | High entropy | Evidence |
|---|---|---|---|
| HP / Lv | LEGIBLE (gap 106) | **DEGRADED** (gap 19.7–37 under scrim/dark) | 01, 06, 08 |
| Battery + sensors (BATT/DRIVE/TURN) | LEGIBLE (gap 46–157) | **DEGRADED** (gap 0.3–46; static at 0.5 fps) | 01, 06, 08 |
| Quest/NEXT row (top-right stack) | LEGIBLE (gap 143.7) | **DEGRADED** — 10px text, panel overlap, contradiction bug | 01, 06, 07; DOM audit |
| Hotbar | LEGIBLE (gap 145) | **DEGRADED** (gap 20.7 on dark frames; 9px slot numbers) | 01, 06, 08 |
| Crosshair + mine arc | LEGIBLE on dark/mid (p99 153 vs bg 18; mining-hold bright fraction 3.91%, edge 8.58) | **DEGRADED against bright sky** (220 vs 164 sky) | 01, 06, 08 |
| Hint bar (`[E] WORKSHOP…`) | gap 122 (lucky dark backdrop) | **DEGRADED by design** — 10px #444 text, no background, no text-shadow over live 3D | DOM audit; 01 |
| Location/time bar | LEGIBLE (11px on 0.52 black, gap 85–144) | LEGIBLE | 01, 06 |
| Top-right stack geometry | — | **OVERLAP**: SALVAGE RUN (591,16 173×66) ∩ QUESTS panel (518,64 250×136) ∩ DAILY CONTRACT (564,112 200×79) — sibling panels share screen area | DOM audit (0 clipped at edges) |
| Race HUD (ghost lap) | NOT TESTED — oval not reached before boot-fail stop | bundle confirms `ghost_lap_start`, `bot_lap_record` | — |
| Coach mode / radio UI | NOT TESTED — `📻 COACH MODE` found in pause menu; bundle confirms `radios: {coach, chatter}` channels | stopped per boot-fail directive | — |
| Panic button | NOT TESTED — bundle: crash-streak trigger (`crashCount≥Va`), 5-min cooldown, `panic_button` Earl line | not reachable deterministically | — |

Jitter: sequential screenshots 1.2–3 s apart during motion are 98.2% pixel-identical (frame freeze at 0.5 fps — no HUD jitter observable, only staleness). No text clipping at viewport edges (0/24 HUD nodes clipped). No element z-fighting found in DOM sampling.

---

## Worst 3 moments (named precisely)

1. **"Earl's welcome dialogue scrim over the live HUD at The Yard Gate, morning light"** — z2000 + z90 55%-black full-screen overlays sit above every HUD element; top-right quest stack text/background gap collapsed 143.7 → 20.7 luminance units; HP/hotbar/sensors dropped to gap 0–25 (borderline unreadable). (Shots 06/07; DOM audit z-order.)
2. **"Zone-gate crossing during movement entropy — W+A hold into THE YARD GATE boundary (vet2→restore2 reload)"** — hard main-thread freeze >10 min at 630% renderer CPU (system co-load), followed by full page reload with state regression (Lv.8→Lv.0, inventory wipe, quest rollback). The one moment where the HUD was *unrenderable*, not just illegible.
3. **"LMB mining hold on the rust heaps with camera pitched down + aim jiggle, dark backdrop"** — mine arc/crosshair clearly present (center bright fraction 3.91% vs 0.61% idle) and legible, but at 0.5 FPS the frame is ~2 s stale; HP/hotbar gaps fell to 20–37 on the dark frame. (Shot 08 + rAF probe: p95 dt 2400 ms.)

*(4th, outside gameplay: the 13:21 clock-in boot failure — 404 on purged deploy chunk.)*

---

## Recommendations (Rift follow-ups)

1. Deploy hygiene: keep old hashed chunks through the CDN cache window, or add import-failure auto-reload (boot-fail loop currently requires manual reload).
2. Put the hint bar (and quest-stack micro-text) on a scrim or text-shadow; raise 10px→12px minimum.
3. Resolve top-right panel stack overlap (QUESTS vs DAILY CONTRACT vs SALVAGE RUN rects).
4. Investigate zone-crossing state regression (Lv/inventory rollback) — reproduced once, high player-impact if real.
5. Audit the ReadPixels call path flagged by the GL driver.
6. Un-reached surfaces (race HUD, coach radio, panic button) remain open test debt for the next window on a stable deploy + GPU-equipped host.

## Evidence manifest (/tmp/rift/)

- `01-baseline-idle.png` — morning calm baseline
- `02/03-move-entropy-a/b.png` — first movement burst (pre-restore world)
- `04/05-move-fast-a/b.png` — W+A+look sweeps
- `06/07-turn-entropy-a/b.png` — turn-in-place + scrim-darkened HUD (jitter pair: 98.2% identical)
- `08-mining-a.png` — mid-LMB-hold mining burst (mine arc visible)
- `10-postcrash-title.png`, `11-loading-yard.png` — Chrome-death recovery; boot-fail frame
- `dom-audit.json` — HUD geometry/clipping/overlap/style dump
- `prod-bundle.js`, `prod-game.js`, `prod-index*.html` — deploy-version evidence (3 index hashes)
- Scripts: `cdp-eval.mjs`, `cdp-shot.mjs`, `entropy-move.mjs`, `entropy-turn.mjs`, `entropy-mine.mjs`, `pixanalyze.py`, `bootfail-watch.mjs`
