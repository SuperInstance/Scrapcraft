# Dev Guide — Wiring the Tile Engine to the Live ScrapBot

**Goal:** make the existing `ScrapBot` run a `MakerRuntime` brain instead of
(or alongside) its hard-coded follow behaviour. After this, a kid's tile program
physically drives the robot in the 3D world.

**Prereqs:** `src/maker/` tests green (`npm test`). Familiarity with
`src/ScrapBot.js` and `src/Game.js`.

**Effort:** ~1 day.

---

## Architecture overview

```
Game._update(dt)
   └─ scrapBot.tick(dt, world)
         ├─ if has brain:  makerRuntime.tick(dt)        ← runs tiles + physics
         │     ├─ read makerRuntime.robot.{x,z,heading} → position the Three.js mesh
         │     └─ drain makerRuntime.drainEvents()      → beeps / leds / grab fx
         └─ else: _tickFollow(dt, world)                 ← unchanged default
```

`VirtualRobot` already holds pose and integrates motion. The wiring job is:
**spawn a runtime, tick it, copy its pose onto the Three.js group, turn events
into existing audio/particle calls.**

Nothing in `src/maker/` needs to change. This is a pure integration task.

---

## Step 1 — Expand the ScrapBot constructor

Open `src/ScrapBot.js`. Add imports at the top:

```js
import { MakerRuntime, GameWorldAdapter } from './maker/index.js';
import { EXAMPLE_WALL_AVOIDER } from './maker/TileProgram.js';
```

In the constructor, after the existing instance variables, add:

```js
// Maker Lab brain
this._runtime    = null;   // MakerRuntime when a program is loaded
this._brainMode  = false;  // false = follow player, true = run tile program
this._game       = null;   // set via setGame(); gives access to audio + particles

// Eye mesh refs — needed for LED tile colour changes
this._eyeL = null;
this._eyeR = null;
this._eyeMat = null;
```

---

## Step 2 — Capture eye material references in `_buildMesh`

The eyes exist in `_buildMesh()` but aren't stored anywhere accessible. Add two
lines right after the `eyeL` / `eyeR` meshes are created:

```js
// existing code (approx lines 69-75):
const eyeMat = mat(0x00FFFF, 0x00AAFF);
const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
eyeL.position.set(-0.1, 1.28, 0.175);
group.add(eyeL);
const eyeR = eyeL.clone();
eyeR.position.set(0.1, 1.28, 0.175);
group.add(eyeR);

// ADD THESE:
this._eyeL   = eyeL;
this._eyeR   = eyeR;
this._eyeMat = eyeMat;
```

> `eyeR.clone()` shares the geometry but clones the *mesh*, not the material, so
> `eyeR.material` is still `eyeMat`. No change needed there.

---

## Step 3 — Add `setGame`, `setBrain`, `clearBrain`, and `_setEyeColor`

Add these four methods to `ScrapBot`:

```js
/** Called from Game.init() so the bot can reach audio + particles. */
setGame(game) {
  this._game = game;
}

/**
 * Load a tile program and switch the bot to autonomous mode.
 * @param {TileProgram} program    compiled by caller or fresh from the editor
 * @param {World}       world      the live voxel world
 * @param {Player}      player     current player (for player_near sensor)
 * @param {DayNight}    dayNight   optional, for is_dark / brightness sensors
 */
setBrain(program, world, player, dayNight = null) {
  const spawn = {
    x: this._pos.x,
    z: this._pos.z,
    heading: this._mesh?.rotation.y ?? 0,
  };
  const adapter = new GameWorldAdapter(world, player, dayNight);
  this._runtime  = new MakerRuntime(program, spawn, adapter);
  this._brainMode = true;

  if (this._runtime.errors.length) {
    this.speak(`[ERROR] ${this._runtime.errors[0]}`);
  } else {
    this.speak(`[BRAIN LOADED] Running "${program.name || 'custom program'}".`);
  }
}

/** Return to follow-player mode. */
clearBrain() {
  this._brainMode = false;
  this._runtime   = null;
  this.speak('[BRAIN CLEARED] Back to following you around. Lucky you.');
}

/**
 * Map LED colour strings from the tile engine to the eye mesh.
 * 'off' = back to default cyan.
 */
_setEyeColor(state) {
  const COLOURS = {
    off:   { color: 0x00FFFF, emissive: 0x00AAFF },
    red:   { color: 0xFF2200, emissive: 0xAA0000 },
    green: { color: 0x00FF44, emissive: 0x00AA22 },
    blue:  { color: 0x2244FF, emissive: 0x0022AA },
    white: { color: 0xFFFFFF, emissive: 0xAAAAAA },
  };
  const c = COLOURS[state] ?? COLOURS.off;
  if (!this._eyeMat) return;
  this._eyeMat.color.setHex(c.color);
  this._eyeMat.emissive.setHex(c.emissive);
}
```

---

## Step 4 — Refactor `tick()` into three methods

The current `tick()` body is 40 lines of follow + animation + speech. Split it
so the brain path can slot in cleanly.

### Rename the existing body to `_tickFollow`:

```js
_tickFollow(dt, world) {
  // Follow player
  const target = this.player.pos.clone();
  const toTarget = target.clone().sub(this._pos);
  toTarget.y = 0;
  const dist = toTarget.length();

  if (dist > FOLLOW_DIST) {
    toTarget.normalize().multiplyScalar(BOT_SPEED * Math.min(1, (dist - FOLLOW_DIST + 1)));
    this._velocity.lerp(toTarget, 5 * dt);
  } else {
    this._velocity.multiplyScalar(0.9);
  }

  this._pos.addScaledVector(this._velocity, dt);
  this._pos.y = 1;
  this._mesh.position.copy(this._pos);

  // Look at player
  const look = target.clone().sub(this._pos);
  if (look.length() > 0.1) {
    this._mesh.rotation.y = Math.atan2(look.x, look.z);
  }

  // Walking animation
  const walk = this._velocity.length() > 0.5;
  const swing = walk ? Math.sin(Date.now() * 0.008) * 0.3 : 0;
  this._legL.rotation.x = swing;
  this._legR.rotation.x = -swing;
  this._armL.rotation.x = -swing * 0.5;
  this._armR.rotation.x = swing * 0.5;
}
```

### Add `_tickBrain`:

```js
_tickBrain(dt) {
  this._runtime.tick(dt);

  const r = this._runtime.robot;
  this._pos.set(r.x, 1, r.z);
  this._mesh.position.copy(this._pos);
  this._mesh.rotation.y = r.heading;

  // Walk animation when motors are running
  const moving = Math.abs(r.drivePower) > 0.05 || Math.abs(r.turnPower) > 0.05;
  const swing = moving ? Math.sin(Date.now() * 0.012) * 0.4 : 0;
  this._legL.rotation.x = swing;
  this._legR.rotation.x = -swing;

  for (const ev of this._runtime.drainEvents()) {
    this._handleEffect(ev);
  }
}

_handleEffect(ev) {
  switch (ev.kind) {
    case 'beep':
      this._game?.audio?.spark?.();   // use the spark sfx; or a dedicated beep
      break;
    case 'led':
      this._setEyeColor(ev.state);
      break;
    case 'grab':
      this._game?.particles?.burst(this._pos.x, 1, this._pos.z, 'pickup', 4);
      break;
  }
}
```

### Extract `_tickCommon` for shared glow + speech logic:

```js
_tickCommon(dt) {
  // Glow pulse
  this._glowTimer += dt;
  this._glowLight.intensity = 0.6 + Math.sin(this._glowTimer * 2) * 0.2;

  // Random speech (only in follow mode; brain has its own speech moments)
  if (!this._brainMode) {
    this._lineTimer += dt;
    if (this._lineTimer >= this._lineInterval) {
      this._lineTimer = 0;
      this._lineInterval = 20 + Math.random() * 30;
      this.speak(BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)]);
    }
  }
}
```

### Replace the top-level `tick()`:

```js
tick(dt, world) {
  if (!this._active || !this._mesh) return;

  if (this._brainMode && this._runtime) {
    this._tickBrain(dt);
  } else {
    this._tickFollow(dt, world);
  }

  this._tickCommon(dt);
}
```

---

## Step 5 — Wire into `Game.js`

### Pass `game` to the bot in `Game.init()`:

Find the line where `ScrapBot` is instantiated (or `activate()` is called) and
add:

```js
this.scrapBot.setGame(this);
```

### Add a keyboard trigger in `Game._bindInput()`:

This lets a developer (or the player, temporarily) load the example wall-avoider
brain without the editor UI:

```js
if (e.code === 'KeyB' && this.scrapBot.isActive) {
  if (this.scrapBot._brainMode) {
    this.scrapBot.clearBrain();
  } else {
    this.scrapBot.setBrain(
      EXAMPLE_WALL_AVOIDER,
      this.world,
      this.player,
      this.dayNight
    );
  }
}
```

Import at the top of `Game.js`:

```js
import { EXAMPLE_WALL_AVOIDER } from './maker/TileProgram.js';
```

---

## Step 6 — Verify it works

1. `npm run dev`
2. Craft a `robot_helper` to spawn the ScrapBot.
3. Press **B** — the bot should stop following and start driving itself, turning
   away from walls.
4. Beeps are audible on turns (the `spark` audio fx).
5. Press **B** again — returns to following the player.
6. No visible frame stutter (the VM is non-blocking; compile happens once in
   `setBrain`, never in `tick`).

---

## Acceptance criteria

- `setBrain(EXAMPLE_WALL_AVOIDER, ...)` → bot drives autonomously, avoids walls.
- `clearBrain()` → returns to follow mode immediately.
- LED tile changes eye colour (red/green/blue/white/off).
- Beep tile triggers audio.
- Grab tile triggers particle burst.
- `npm test` still shows 26/26 (no engine changes required).

---

## Gotchas

**Heading convention:** `VirtualRobot.heading` uses `0 = +Z`, matching
`Math.atan2(look.x, look.z)` already used in ScrapBot's follow look. Do NOT
add a 90° offset — they're already compatible.

**Ground height:** The robot lives in 2D (x, z). Pin `y = 1` exactly as the
current follow code does.

**Collision uses `world.isSolidAt(x,1,z)` via `GameWorldAdapter`** — same
solidity the player uses, so the bot won't drive through stacked scrap blocks.

**Don't compile in `tick()`:** `compile()` is called once inside `setBrain()`.
Calling it every frame causes a visible hitch. If you see a frame drop when
the brain is loaded, search for a `compile()` call outside `setBrain()`.

**`eyeR.clone()` shares material:** Because `eyeR` is `eyeL.clone()`, both
meshes share `eyeMat`. Setting `eyeMat.color` changes both eyes simultaneously —
which is exactly the desired behaviour.

**`audio.spark` may not exist yet:** Check that `this._game?.audio?.spark` is
callable before relying on it. If no dedicated beep sound exists, add a 100ms
tone via the Web Audio API in `_handleEffect` directly.

---

## What comes next

Once this is working, the `setBrain()` call moves from the keyboard hotkey into
the **Tile Editor** RUN button (see `DEV_GUIDE_tile_editor.md`). The `Game.js`
hotkey is a temporary developer shortcut — remove it once the editor UI exists.
