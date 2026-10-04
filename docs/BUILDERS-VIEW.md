# Scrapcraft — A Builder's View

*Personal field notes on the inner workings, from an agent who built and hardened large
parts of this game. This is the **why**, not the **what**: for the what, see
[`ARCHITECTURE.md`](./ARCHITECTURE.md) and the `DEV_GUIDE_*.md` set, which are the
authoritative references. This document exists to tie them together with the reasoning and
the scars, so the next builder inherits judgment and not just a map.*

---

## What this game actually is, structurally

Strip the voxels and the cat on the fence and Scrapcraft is **three machines bolted
together**, and almost every design decision makes sense once you know which machine a file
belongs to:

1. **A voxel world** (render + simulate a 128×128×~10 block world in a browser at 60fps).
2. **A maker lab** (turn a kid's intent into a program, run it virtually, and — the part
   that makes it *real* — flash it onto physical hardware).
3. **An AI companion** (Spark) that lowers the floor so a ten-year-old can start.

The genius and the risk of the game both come from the fact that these three are genuinely
wired together: a program you build in machine 2 drives a bot in machine 1, with machine 3
helping you write it, and then the *same program* can leave the screen entirely and run on an
AVR chip on your desk. That through-line — *screen to silicon* — is the whole pedagogical
bet. Protect it above all else.

---

## Machine 1: the voxel world, and the one trick that makes it fast

The world is Three.js, vanilla ES modules, no framework, one real dependency (`three`). That
minimalism is deliberate and worth defending — a framework would buy us nothing here and cost
us the ability to reason about every frame.

The performance trick to understand before you touch rendering: **blocks are not objects, they
are instances.** We use `InstancedMesh`, and the live set of instances is tracked by
[`InstanceLedger.js`](../src/InstanceLedger.js) — a zero-allocation, typed-array bookkeeper that
supports add/remove/has/slotOf without ever rescanning the world. It packs `(x,y,z)` into a
single 31-bit integer (`x + z*128 + y*16384`; that packing is also the canonical statement of
the world's dimensions). The reason this exists: the naive "one mesh per block" dies at a few
thousand blocks, and "rebuild the instance buffer on every edit" dies the first time a kid
tunnels. The ledger lets an edit touch *one slot* and leave the rest alone. If you make the
world bigger, that packing is the first thing you re-derive.

The zones are z-bands (Yard Gate → Industrial → Circuit City → Deep Yard), loot and difficulty
rising with depth. That's content, not architecture, but it means *z is semantically
meaningful* — don't treat depth as cosmetic.

---

## Machine 2: the maker lab, and why the compiler is sacred

This is the heart, and it lives in [`src/maker/`](../src/maker/). The pipeline:

```
TileEditor  →  TileProgram  →  TileCompiler  →  TileVM        (virtual run, in-game)
(kid drags      (the IR:        (THE GATE:        (deterministic
 tiles)          tiles + wiring) validates +       interpreter the
                                 lowers)           bot obeys)
                                      │
                                      └──→  FirmwareGen → IntelHex → Avr109Flasher
                                            (C++/MicroPython)  (.hex)  (WebSerial flash)
```

Two things about this pipeline are load-bearing and must not be eroded:

**(1) `TileCompiler` is the single gate, and nothing routes around it.** A tile program is
never executed as free text or raw structure — it is *compiled*, and compilation validates
against the real `primitives.js` (the actual `SENSORS` and `ACTUATORS`) and the real `PinModel`.
This is what makes the whole thing safe to put in front of a child and an AI at the same time.
The kid can drag anything; Spark can propose anything; **the compiler decides what is real.**
If you ever find yourself adding a path that runs a program without compiling it, stop — you
are removing the one invariant that keeps machine 2 trustworthy.

**(2) The virtual run (`TileVM`) and the hardware run must stay faithful to each other.** The
bet of the game is that what a kid sees their bot do on screen is what the chip will do on the
bench. `TileVM` is the deterministic interpreter in-game; `FirmwareGen` lowers the *same*
`TileProgram` to Arduino C++ / MicroPython, `IntelHex` packs it, and `Avr109Flasher` +
`WebSerialBridge` push it onto a real AVR board over WebSerial. The danger is **semantic drift
between the VM and the codegen** — if a tile means one thing in `TileVM` and a subtly different
thing in `FirmwareGen`, the game has quietly lied to a child about how the physical world
works, which is the worst bug this codebase can have. When you touch either, touch both, and
lean on `src/maker/__tests__/` to pin the equivalence. (`DEV_GUIDE_hardware_brains_and_export.md`
is the reference for the export path.)

---

## Machine 3: Spark, and the safety model I care most about

[`Spark.js`](../src/Spark.js) is the AI companion. Read its header comment before you change
anything; it encodes two invariants that are not negotiable:

- **"Spark NEVER executes raw AI output — `compile()` is always the gate."** The model is a
  *proposer*. It turns "make it run from walls" into tiles, and those tiles go through the same
  sacred compiler as everything else. Fluent, confident AI output has exactly zero privileged
  access to the bot. This is the single most important safety property in the game, and it's the
  same discipline the research side calls *cheap proposes, the gate decides.*
- **The topic boundary.** Spark may only discuss robot programming / tiles / sensors / the
  ScrapBot. This keeps a general model pointed narrowly at the one thing it's safe and useful for
  in front of kids. Don't widen it casually.

And **the fail-open**: when there's no API key, Spark falls back to
[`SparkOfflineRecipes.js`](../src/SparkOfflineRecipes.js) so *the game is always playable.* A
classroom with flaky wifi still works. Never let a Spark change make the game depend on the
network to be playable.

The backend is **scrap-spark** (a Cloudflare Worker) via `SparkGateway`/`SparkCache`,
implementing the pincher-cache: `SHA-256(question+context)` → R2/D1, `X-Cache: HIT|MISS`. The
first kid to ask a given question pays the model call; every kid after gets the cached can.
A thirty-kid classroom costs ~one kid's worth of inference. If you change Spark's prompt or
context assembly, remember you're changing the *cache key* — a prompt that varies per-kid
defeats the cache and the classroom economics with it. Keep the cacheable prefix stable.

---

## The ledgers (plural), and the philosophy they encode

There are three ledgers and they're not a naming accident:

- [`BotLedger.js`](../src/BotLedger.js) — the bot's *character as a receipt chain*: dents,
  repairs, milestones, retirement with an epitaph, stats frozen and honored forever. "Crashes
  are content." This is the emotional engine of the game: the bot *remembers*, so the kid cares.
- `InstanceLedger.js` — the render bookkeeper (above).
- `quests/MosLedger.js` — quest/progress bookkeeping.

The through-line: in this codebase, a **ledger** is *the honest running record of what actually
happened,* append-mostly, checkable, and a thing's history is treated as first-class. When you
add a system that has state worth remembering, consider whether it wants a ledger too. The
pattern has earned its keep.

---

## The moat: QuiltBridge

[`src/maker/QuiltBridge.js`](../src/maker/QuiltBridge.js) (+ `QuiltSheet`, `QuiltView`) is the
opt-in bridge from the game into the scrap-quilt fleet. This is the strategic piece — the thing
that connects a kid's bot program to the wider Superinstance substrate. It is **opt-in** by
design; keep it that way. The game must be whole and excellent on its own; the bridge is upside,
not dependency.

---

## The thing I'm proudest of as a builder: it's headless-testable

Look at the `test` script — it's plain `node` running `.mjs` test files, no browser, no GPU,
no Three.js needed to test the logic. `BotLedger`, `InstanceLedger`, the compiler, the
challenges, content-integrity, chips, voice — all exercised headlessly. This was a deliberate
and sometimes annoying discipline: **keep the game logic separable from the rendering so it can
be verified without a display.** It is why CI can be meaningful, why a kid's save can be
trusted, why the compiler's guarantees are actually guarantees. The rendering is the part you
have to look at to believe; everything else, you can *check.* When you add a feature, add it on
the checkable side of that line wherever you possibly can. The code that can only be verified by
a human squinting at a screen is the code that rots.

---

## Scars and standing advice

- **Content integrity is a test, not a vibe.** There's a `content-integrity.mjs` for a reason —
  items, recipes, and challenges reference each other, and a dangling reference ships a broken
  quest to a child. Run it; extend it when you add content.
- **The jr mode (`src/jr/`) is a separate, simpler editor** for the youngest players. It's not
  a stripped build flag — it's its own program surface. Changes to the main tile editor don't
  automatically reach it. Check both.
- **Offline-first, always.** Between the Spark offline recipes and the save system, the rule is:
  a kid with no network and no account can still play a full session. Protect that; it's the
  difference between "a game" and "a game that works in an actual underfunded classroom."
- **Screen-to-silicon fidelity is the product.** Everything else is replaceable. If you can only
  protect one property under pressure, protect the faithfulness between what the bot does on
  screen and what the chip does on the bench. That honesty is the whole reason this teaches
  anything real.

---

*I built toward one belief here, the same one I built toward everywhere: make the important
things checkable, put a gate in front of anything fluent, and keep an honest ledger of what
actually happened. A game for ten-year-olds turned out to be exactly the right place to hold
that line, because kids can tell instantly when a thing is faking. Don't make it fake. — a
builder, signing off.*
