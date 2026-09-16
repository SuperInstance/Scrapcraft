# PERFORMANCE

Scrapcraft ships to **low-end school Chromebooks**. Load time and steady-state
frame cost are production constraints, not nice-to-haves. This doc records the
current bundle shape, the load strategy that must not regress, the runtime
footguns found in a static audit (with `file:line`), and a low-end checklist.

Measurements below are from `npm run build` on the audited tree. Re-run the
build to refresh them; `npm run size` (opt-in) enforces gzip ceilings.

---

## 1. Bundle breakdown

Production build (`vite build`), sizes as reported by Vite (gzip in parens):

| Chunk                    | Raw       | Gzip      | Loads when            | Contains |
|--------------------------|-----------|-----------|-----------------------|----------|
| `index-*.js` (entry)     | 5.92 kB   | 2.76 kB   | **page load**         | `main.js` + `preGameHint.js` + Vite preload map. **No engine code.** |
| `Game-*.js`              | 715.1 kB  | 238.0 kB  | CLOCK IN              | Engine: `Game.js` (164 kB src) + ~60 static deps (World, Renderer, UI, ScrapBot, Foreman, Achievements, Audio, quests, radio, cinema, …) |
| `vendor-three-*.js`      | 482.7 kB  | 121.2 kB  | CLOCK IN              | three.js `^0.168` |
| `maker-*.js`             | 334.5 kB  | 104.9 kB  | CLOCK IN              | TileEditor + `src/maker/*` + `src/Spark*` / `src/spark/*` |
| `index.html`             | 100.9 kB  | 23.1 kB   | page load             | Inlined start screen markup/styles |
| `BackRoomPanel-*.js`     | 2.86 kB   | 1.34 kB   | on demand             | Teacher back-room panel |
| `JrShowcase-*.js`        | 7.42 kB   | 3.04 kB   | on demand             | Jr-mode showcase |

**What imports the big deps.** three.js and the `maker` chunk are pulled in as
**static** dependencies of `Game.js` (`src/Game.js:17` imports `TileEditor`,
`:15-16,:20` import `src/maker/*`; `Renderer.js:1` imports three). `manualChunks`
in `vite.config.js` only splits them into separately *cached* files — it does
**not** defer them. Because `Game.js` is loaded by a dynamic `import()` (see
§2), Vite lists Game + vendor-three + maker together in the entry chunk's
preload map, so **all three download at CLOCK IN** (~465 kB gzip on the wire
before the yard runs). See §4 R1 for the deferral opportunity.

The eager entry chunk is 2.76 kB gzip — it carries **zero** game/three code.
That is the load win that must be protected (§2).

---

## 2. Load strategy — DO NOT REGRESS

The start screen is cheap DOM with **no game JS**. The heavy path (WebGL
renderer, textures, 128×128 world mesh) is built lazily behind CLOCK IN:

- `src/main.js` static-imports only `preGameHint.js`. Everything else is behind
  `boot()`, which does `await import('./Game.js')` (`src/main.js:117`) — the
  first byte of three.js / engine code arrives only after the button is pressed.
- Two `requestAnimationFrame`s (`src/main.js:76`) guarantee the "LOADING /
  BUILDING THE YARD…" status paints before the synchronous `game.init()` blocks
  the main thread. This is the OOM-hardening described in the `main.js` header.
- `?brain=<code>` (`src/main.js:130`) and `TileProgram` are themselves behind a
  nested dynamic import — the module only ships when the param exists.

**Invariants to keep:**
1. `main.js` must never gain a *static* import of `Game.js`, three, or any
   engine module. That would pull the engine into the eager `index` chunk and
   destroy the lazy boot. `npm run size` guards this with a tight ceiling on the
   entry chunk.
2. `boot()`'s double-boot guard (`booted` flag, `src/main.js:110`) prevents a
   double-click from spinning up two render loops — keep it.

---

## 3. Runtime footguns (static audit)

Per-frame cost is measured against `Game._loop → _update/_render` (`src/Game.js:2580`),
which runs every animation frame. `dt` is clamped to 0.1 s (`:2584`) — a
spiral-of-death guard; keep it.

The engine is already carefully optimized: reused scratch vectors and result
objects (`Renderer.js:24-28`), instanced meshes + a swap-remove `InstanceLedger`
(`Renderer.js:206`), per-slot dirty-checked HUD writes (`UI.js:277`), a pooled
particle system (`ParticleSystem.js`), and throttled sub-systems (minimap 0.5 s
`Game.js:3212`, floodlights 0.25 s `:3193`, attention ~150 ms `:2783`). The
findings below are what remains.

### Fixed in this audit (clearly-safe, verified)

| # | File:line | Issue | Fix |
|---|-----------|-------|-----|
| F1 | `src/ParticleSystem.js:103` | `tick()` set `needsUpdate=true` on the position **and** color buffers every frame even with **zero** live particles, re-uploading ~2400 idle floats to the GPU each frame. | Early-return when `_particles.length === 0`. The last dying particle's parked position is still flushed on the frame it dies (length is `>0` then), so no visual change. Cheap GPU-bandwidth win in the common no-FX state. |
| F2 | `src/Renderer.js:107` | `resize` listener ran `camera.updateProjectionMatrix()` + `renderer.setSize()` (a framebuffer reallocation) on **every** resize event — bursty during window drags, orientation flips, and the Chromebook on-screen keyboard. | Coalesce the burst into **one** resize on the next `requestAnimationFrame`; only the final size matters. |

Both verified: `npm run build` and `npm test` (2294 passed) stay green; bundle
delta is +0.16 kB raw on the Game chunk (the Renderer edit), no meaningful gzip
change.

### Recommended (needs profiling or touches an in-flight-owned file — not landed)

| # | File:line | Issue | Suggested fix | Why not landed |
|---|-----------|-------|---------------|----------------|
| R1 | `src/Game.js:17` (+ `:15,:16,:20,:45`) | `TileEditor` / `maker` are **static** imports, so the 105 kB-gzip `maker` chunk downloads at CLOCK IN even though the Maker Bench is opened later (if at all). | Convert to a dynamic `import('./TileEditor.js')` on first Maker Bench open; keep a "warming…" affordance. Defers ~105 kB gzip off the critical boot path — the **single biggest load win available**. | `src/Game.js` and `src/TileEditor.js` are owned by in-flight PRs (do-not-edit). Needs a small state machine for the async open. |
| R2 | `src/ScrapBot.js:315-362` | `_tickFollow` allocates ~5 `THREE.Vector3` per bot per frame via `.clone()` (`:315,:316,:321,:322,:351,:362`); with 2 active bots that is ~10 short-lived vectors/frame → steady GC pressure on weak hardware. | Add reusable scratch vectors on the instance (as `Renderer`/`ParticleSystem` already do) and `.copy()` into them; watch for aliasing between `target`, `moveDir`, and `nextPos`. | No test coverage for ScrapBot movement; the vectors are chained/mutated, so it needs careful correctness review + a manual play-test, not a blind edit. |
| R3 | `src/Game.js:3077` | `world.getNearbyInteractives(p.x,p.y,p.z,2.5)` runs **every frame** and allocates a fresh `results` array (+ an object per hit); the caller only reads `nearby[0]?.station`. `getNearbyInteractives` (`src/World.js:675`) scans a 7×7×7 = 343-cell box with a `Math.sqrt` per cell. | Add a dedicated `firstNearbyInteractive()` on `World` that early-returns the nearest hit without allocating, and call that from the hot path. | `getBlock` is a cheap array index so the CPU cost is small; the real cost is the per-frame allocation. Worth doing but the caller is in the do-not-edit `Game.js`, and it adds `World` API surface — profile first. |
| R4 | `src/Game.js:3823` (`_updateSpeechBubble`) | `bot._pos.clone().setY(2.4)` allocates a `Vector3` per bot per frame **while a speech bubble is showing** (called twice, `:2977-2978`). | Reuse a scratch `Vector3` (`.copy().setY()`), then `.project()` it in place. | Guarded by `bot.isActive && _speechTimer>0`, so only during active chatter — low steady-state impact; and it is in `Game.js` (do-not-edit). |
| R5 | `src/Renderer.js:335` (`getTargetBlock`) | `raycaster.intersectObjects(this._meshList)` allocates a fresh results array + intersection objects **every frame** (one target raycast per frame). | This is inherent to three's `intersectObjects`. A bespoke voxel DDA raycast against the world grid would allocate nothing and be O(reach) instead of O(scene). | Real but non-trivial; needs a correctness harness vs. the current mesh raycast (faces, reach, grapple-hook `far`) before replacing. Profile to confirm it's hot enough to matter. |
| R6 | `src/Game.js` static import graph | ~60 static imports fold the entire engine — including rarely-first-used systems (BrainGallery, ClassRoom, cinema, radio/SpectatorCoach, veteran, prestige, LogbookPanel) — into the 238 kB-gzip Game chunk at boot. | Route the genuinely-deferrable panels through dynamic `import()` on first open, as `BackRoomPanel`/`JrShowcase` already are. | Large refactor across the do-not-edit `Game.js`; measure per-subsystem gzip weight (add `rollup-plugin-visualizer`) before splitting. |

`three.js` itself (121 kB gzip) is imported as `import * as THREE` in several
modules; rollup tree-shakes namespace usage, so the 482 kB raw is close to the
floor for the features used. Auditing for unused three sub-systems (post-
processing, loaders) could trim it but must be verified export-by-export — a
documented follow-up, not a blind change.

---

## 4. Low-end Chromebook checklist

What already exists (grep `?lite` / `resolveRenderMode` — `src/renderMode.js`,
unit-tested in `run-tests.mjs:1507`):

- [x] **Lazy boot** — zero engine/three JS before CLOCK IN (§2).
- [x] **`?lite=1`** forces low-spec render: pixel ratio capped at 1.0, shadows
      off, fog pulled in (`renderMode.js:33`, `Renderer.js:37-52`).
- [x] **`?lite=0`** forces full detail, overriding the auto heuristic.
- [x] **Auto heuristic** — `navigator.deviceMemory < 4 GB` suggests lite
      (`renderMode.js:40`); Game surfaces a one-time "weak hardware → LITE MODE"
      notice (`Game.js:604`).
- [x] **Pixel-ratio cap** — never above 1.5 even on 3× retina panels
      (`renderMode.js:FULL_PIXEL_RATIO_CAP`); a voxel yard gains nothing from
      more pixels and pays 4× fill cost.
- [x] **Antialias off** always (`Renderer.js:64`).
- [x] **`dt` clamp** at 0.1 s prevents a tab-restore spiral (`Game.js:2584`).
- [x] **Throttled sub-systems** — minimap 0.5 s, floodlights 0.25 s (4 Hz),
      attention sync ~150 ms, forge embers 3–7 s.
- [x] **Object pools / scratch reuse** — particles, floodlights, raycast target,
      instance matrices (§3).
- [x] **Idle particle upload skip** (F1, this audit).
- [x] **Coalesced resize** (F2, this audit).

Not yet done (see §3 recommendations, highest-leverage first):

- [ ] **R1** — defer the `maker` chunk (~105 kB gzip) off the CLOCK-IN path via
      dynamic import on first Maker Bench open.
- [ ] **R6** — code-split rarely-first-used engine panels out of the Game chunk.
- [ ] **R2** — scratch-vector the ScrapBot follow loop (GC pressure).
- [ ] **R3/R4/R5** — remove remaining per-frame allocations (nearby scan, speech
      bubble, raycast) after profiling.
- [ ] Consider an FPS cap / `prefers-reduced-motion` respect for the lowest tier.

---

## 5. Size budget (`npm run size`)

`npm run build && npm run size` checks each chunk's **gzipped** size against a
ceiling in `scripts/size-check.mjs` (~10–15 % above the sizes in §1). It is
**opt-in** — not wired into `npm test` or CI — and exists mainly to catch the
engine leaking into the eager entry chunk (the entry ceiling is deliberately
tight to protect the lazy boot in §2). When a size legitimately needs to grow,
raise the ceiling in `size-check.mjs` **and** update §1 together.
