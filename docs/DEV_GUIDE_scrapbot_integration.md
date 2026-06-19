# Dev Guide — Wiring the Tile Engine to the live ScrapBot

**Goal:** make the existing `ScrapBot` run a `MakerRuntime` brain instead of
(or in addition to) its hard-coded follow behaviour. After this, a kid's tile
program physically drives the robot in the 3D world.

**Prereqs:** `src/maker/` (done, tested). Familiarity with `src/ScrapBot.js`
and `src/Game.js`.

**Effort:** ~1 day.

---

## What connects to what

```
Game._update(dt)
   └─ scrapBot.tick(dt, world)
         ├─ if has a brain:  makerRuntime.tick(dt)         ← runs tiles + physics
         │     ├─ read makerRuntime.robot.{x,z,heading}    → position the mesh
         │     └─ drain makerRuntime.drainEvents()         → beeps / leds / grab fx
         └─ else: existing follow-the-player behaviour (unchanged fallback)
```

The `VirtualRobot` already holds pose and integrates motion. The integration
job is purely: **spawn a runtime, tick it, and copy its pose onto the Three.js
group** — plus turn its events into existing audio/particle calls.

---

## Step 1 — Give ScrapBot a brain slot

In `src/ScrapBot.js`:

```js
import { MakerRuntime, GameWorldAdapter } from './maker/index.js';
import { EXAMPLE_WALL_AVOIDER } from './maker/TileProgram.js';

// in constructor:
this._runtime = null;          // MakerRuntime when a brain is loaded
this._brainMode = false;       // false = follow player (default), true = run tiles

setBrain(program, world, player, dayNight) {
  const spawn = { x: this._pos.x, z: this._pos.z, heading: this._mesh?.rotation.y ?? 0 };
  const adapter = new GameWorldAdapter(world, player, dayNight);
  this._runtime = new MakerRuntime(program, spawn, adapter);
  this._brainMode = true;
  if (this._runtime.errors.length) this.speak(`[COMPILE ERROR] ${this._runtime.errors[0]}`);
}

clearBrain() { this._brainMode = false; }   // back to following
```

## Step 2 — Branch in `tick()`

Replace the top of `ScrapBot.tick(dt, world)`:

```js
tick(dt, world) {
  if (!this._active || !this._mesh) return;

  if (this._brainMode && this._runtime) {
    this._tickBrain(dt);
  } else {
    this._tickFollow(dt, world);   // ← the existing body, renamed
  }
  this._tickCommon(dt);            // glow pulse + random speech (existing tail)
}
```

`_tickBrain`:

```js
_tickBrain(dt) {
  this._runtime.tick(dt);
  const r = this._runtime.robot;
  this._pos.set(r.x, 1, r.z);
  this._mesh.position.copy(this._pos);
  this._mesh.rotation.y = r.heading;

  // leg/arm walk animation when the motors are running
  const moving = Math.abs(r.drivePower) > 0.05 || Math.abs(r.turnPower) > 0.05;
  const swing = moving ? Math.sin(Date.now() * 0.012) * 0.4 : 0;
  this._legL.rotation.x = swing;  this._legR.rotation.x = -swing;

  for (const ev of this._runtime.drainEvents()) this._handleEffect(ev);
}

_handleEffect(ev) {
  if (ev.kind === 'beep')  this._game?.audio?.spark?.();          // or a dedicated beep sfx
  if (ev.kind === 'led')   this._setEyeColor(ev.state);            // tint the cyan eyes
  if (ev.kind === 'grab')  this._game?.particles?.burst(this._pos.x, 1, this._pos.z, 'pickup', 4);
}
```

`_setEyeColor` maps `'red'|'green'|'blue'|'white'|'off'` to the eye material's
`.color`/`.emissive` (the eyes are built in `_buildMesh`; keep refs to them).

## Step 3 — Pass the game in

`ScrapBot` currently only gets `scene, player`. Give it the `game` (for
`audio`/`particles`) via the existing `setUI` pattern, or add `setGame(game)`
and call it in `Game.init()` right after `new ScrapBot(...)`.

## Step 4 — Hook a trigger

For a first vertical slice, load the example brain when the player presses a
key, e.g. in `Game._bindInput()`:

```js
if (e.code === 'KeyB' && this.scrapBot.isActive) {
  this.scrapBot.setBrain(EXAMPLE_WALL_AVOIDER, this.world, this.player, this.dayNight);
}
```

Later this is replaced by "open the Maker Bench → edit tiles → press RUN" (see
`DEV_GUIDE_tile_editor.md`).

---

## Acceptance criteria

- Pressing B makes the ScrapBot stop following and start driving itself; it
  rolls forward and turns away from walls (the example program).
- Beeps are audible; LED tile changes the eye colour.
- No frame drops — the VM is non-blocking; if you see a hitch, something is
  calling `compile()` every frame (compile once in `setBrain`, not in `tick`).
- Pressing B again / `clearBrain()` returns it to following the player.

## Gotchas

- **Heading convention:** `VirtualRobot.heading` uses `0 = +Z`, matching
  `Math.atan2(look.x, look.z)` already used in ScrapBot. Don't add a 90° offset.
- **Ground height:** the robot is 2D (x,z); pin `y = 1` like the current code.
- **Collision uses `world.isSolidAt(x,1,z)`** via the adapter — same solidity
  the player uses, so the bot won't drive through stacked scrap.
