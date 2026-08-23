# SPEC B — Spectator/Coach mode + Game integration (DOM/game-side)

You are coding in the Scrapcraft worktree /tmp/scrap-coach-wt. ONLY create/modify
the files listed below. Another coder owns src/radio/VhfRadio.js,
src/radio/NudgeRouter.js, docs/VHF-DOCTRINE.md and the radio tests — do NOT
create or edit those; import from them using the exact API below.

## Files you own
1. `src/radio/SpectatorCoach.js` (new — all new logic lives here)
2. `src/Game.js` (surgical edits only, listed below)
3. `src/index.html` is at `index.html` (repo root) — menu buttons + HUD panel + CSS
4. `src/ScrapBot.js` (ONE tiny addition: directive hook in _tickBrain)
5. `src/maker/__tests__/run-tests.mjs` — do NOT touch (coder A wires tests)

## The radio core API you import (already being written, exact):
```js
import { VhfRadio, RadioStack, MAX_TX_MS } from './VhfRadio.js';
import { parseNudge, NudgeRouter } from './NudgeRouter.js';
```
- `radio.state` ∈ 'IDLE'|'RECEIVING'|'TRANSMITTING'; `radio.channel`;
  `radio.squelchOpen`; `radio.isBusy()`;
  `radio.beginTransmit()` → `{ok, reason}` (reason 'CHANNEL_BUSY' when agent
  speaking); `radio.endTransmit()`; `radio.beginReceive(id)`/`endReceive(id)`;
  `radio.setChannel(name)`; `radio.tick(now?)` enforces MAX_TX_MS.
- `RadioStack` = { coach: VhfRadio, chatter: VhfRadio } both constructed with
  shared onState.
- `parseNudge(text)` → `{ intent, payload, targetHint, ttlMs }` with intents
  'goto'|'mine'|'follow'|'stop'|'race'|'banter'.
- `new NudgeRouter()`; `router.deliver(bot, text)` sets `bot.directive`;
  `router.consume(bot)` returns+clears unexpired directive or null.

## SpectatorCoach.js — the coach/spectator mode
Constructor `new SpectatorCoach(game)`; store refs; build lazily on enter().

### Mode toggle (`enter()` / `exit()` — MUST be clean round-trips)
- `enter({ from = 'menu' } = {})`:
  - set `game._spectator = true` (Game will use this flag)
  - stash + freeze player: `game.player.vel.set(0,0,0)`; player input already
    gated by Game._update guard (below)
  - spawn DEMO CREW if none: 3 demo ScrapBots (pattern copied from
    Game._toggleBot2): `new ScrapBot(game.renderer.scene, game.player)`,
    `_slotKey = 'demo1|demo2|demo3'`, `setGame(game)`,
    `activate({x, y, z})` near yard center (8,2,5) spread out, each
    `setBrain(<program>, game.world, game.player, game.dayNight)` with varied
    programs from TileEditor.js imports: EXAMPLE_WALL_AVOIDER,
    EXAMPLE_LIGHT_RUNNER, EXAMPLE_SQUARE (exported from
    './TileEditor.js' — CHECK the actual export names with grep first; they're
    also in src/maker/TileProgram.js). One bot = "racer": give it an oval
    waypoint loop (oval center x=35,z=84, radius ~14) by pushing waypoints into
    its `bot._adapter.waypoint` sequentially as each is reached (poll in tick).
  - give each demo bot a personality voice: use BotPersonality's existing
    random names; map bot → TTS voice by cycling ['rivet','bolt','juno'].
  - camera: FREE-FLY spectate — you own `game.renderer.camera` while
    spectating. Keys WASD+R/F up-down (R conflicts with respawn? respawn is
    guarded by pointerLock — you ARE pointer-locked in spectator, so use
    Q/E for down/up instead), mouse look via your own mousemove handler
    (only while `game._spectator` and pointer-locked), speed 12 m/s,
    clamp y to [1.5, 60].
  - FOLLOW-CAM: `follow(bot)` — smooth chase cam behind bot
    (lerp position to bot.pos + offset(0,3,-6) rotated by nothing — simple
    world-space offset is fine; lookAt bot). `unfollow()` → free-fly.
    Cycle targets with Tab (preventDefault) or digit keys 1-3.
  - show HUD panel (see index.html) — roster with names/status, radio state
    (IDLE/ON AIR/RX), followed bot name, "PRESS-TO-TALK: hold SPACE".
  - exit pointer-lock pause overlay confusion: while spectator, pointer lock
    stays; ESC exits lock → Game shows pause; that's acceptable. `exit()`
    must: unfollow, restore camera to player eye (`camera.position.copy(
    player.pos + EYE_HEIGHT)`, restore player yaw/pitch → the player camera is
    driven by Player.tick yaw/pitch, so just set camera from player.pos and
    let Player.tick take over), despawn demo bots (bot.deactivate? CHECK
    ScrapBot API — there is activate(); look for deactivate/destroy; if none,
    set `_active=false` via any public path it has and remove mesh from scene
    if such a method exists; grep first), `game._spectator = false`, hide HUD.
- `tick(dt, now)` — call from Game._update when `game._spectator`:
  radio.stack tick, camera move/follow lerp, racer waypoint sequencing,
  consume directives from followed/all bots and ACT on them (below), update
  HUD DOM states cheaply (only on change).

### Nudge routing (the coach's voice → agent decisions)
- PTT: hold SPACE (and also KeyT as radio key) while spectator + pointer
  locked: keydown (no repeat) → `radio.beginTransmit()`; if not ok → HUD flash
  "🚫 CHANNEL BUSY — agent transmitting" + play a short busy blip via
  game.audio if trivially available (skip if unsure). If ok → STT:
  `await voiceIn.start()` (import from '../voice/index.js'); keyup →
  `const text = await voiceIn.stop()` → `radio.endTransmit()` →
  `this.sendNudge(text)` (skip if empty/whitespace).
  - MIC FAIL-SOFT: wrap getUserMedia failure — if voiceIn.start() rejects or
    transcript is '' twice in a row → open TEXT FALLBACK panel (input box in
    the HUD; Enter sends same sendNudge path; it enters the same half-duplex
    machine: beginTransmit on focus-enter is NOT required — treat text submit
    as an instant TX burst: beginTransmit→sendNudge→endTransmit).
- `sendNudge(text, { channel = 'coach' } = {})`:
  - pick target bot: parseNudge targetHint matches a demo bot name
    (case-insensitive) else followed bot else bot[0]. 'all'/'both' → fan-out.
  - `router.deliver(bot, text)` then IMMEDIATELY `router.consume(bot)` and
    act on intent:
      - goto: target = bot pos + payload unit vector * 10 →
        `bot._adapter.waypoint = { x, z }` (bots already navigate waypoints)
      - mine: scan world in 24m radius for nearest block id containing
        'ore'|'scrap'|'crystal' (grep World.js for the block id API first —
        `world.getBlock(x,y,z)` or similar) → set waypoint there
      - stop: `bot._holdUntil = performance-ish now + 12000` (ScrapBot edit below)
      - follow: waypoint = live-follow player pos (re-set every tick while
        directive active — simplest: store `bot._followPlayerUntil`)
      - race: enqueue oval loop waypoints (same as racer bot)
      - banter: bond +1 via `bot.personality.bond` if present
  - ACK (the agent answers on the radio): `radio.beginReceive(bot.voiceId)`,
    `voiceOut.speak(ackText, { voice: bot.ttsVoice })` where ackText is
    flavored per intent, e.g. goto → `"[ROGER] ${name} steering ${dir}."`,
    stop → `[HOLDING POSITION]`, banter → short bot-flavored line from
    BOT_LINES style (write 2-3 variants per intent, rotate). Prefix all with a
    roger-beep emoji in the HUD log (📻). While the ack TTS is queued, watch
    `voiceOut._playing` — endReceive when it's null again (poll in tick; also
    hard timeout 8s). HUD shows RX state + subtitle line.
  - CHANNEL-BUSY ENFORCEMENT: sendNudge on chatter channel while coach radio
    RECEIVING is fine (two radios); same-channel attempt while busy → rejected
    with HUD flash. This falls out of VhfRadio; just surface it.

### Game.js surgical edits (keep them minimal & marked with comments
`// ── Spectator/coach mode (radio) ──`)
1. import SpectatorCoach; in init() after tileEditor creation:
   `this.radio = new SpectatorCoach(this);` and `this._spectator = false;`
2. In `_update(dt)` right after `this._clock += dt;`:
   ```js
   if (this._spectator) {
     this.radio?.tick(dt);
     // world/life keeps running; skip player physics + hazards + mining
     this.dayNight?.tick(dt);
     this.weather?.tick(dt, this.renderer.camera.position, this.renderer.ambientLight);
     this._tickRivet?.(dt);
     for (const b of this._demoBots ?? []) b.tick(dt, this.world);
     this.scrapBot?.tick(dt, this.world);  // existing bots keep playing
     this.scrapBot2?.tick(dt, this.world);
     return; // skip the rest of player-centric update
   }
   ```
   (Check what _tickRivet needs — if it touches player it's fine, player just
   stands still. Verify no crash with player static.)
3. In the keydown handler near the other key guards, add spectator branch
   FIRST (before KeyB/KeyR handlers that assume play mode):
   ```js
   if (this._spectator) { this.radio?.onKeyDown(e); return; }
   ```
   plus a keyup listener registration in the same place (grep how existing
   keyup listeners are registered; add `this.radio?.onKeyUp(e)` similarly).
   ESC handling: let the existing pointerlock pause flow work; ALSO make the
   pause overlay show a "RETURN TO COACH MODE" resume — pause overlay click
   re-locks, that already works.
4. Expose `this._demoBots = []` — SpectatorCoach manages the array contents.

### ScrapBot.js — ONE addition (guarded, no behavior change otherwise)
In `_tickBrain(dt)` at the very top:
```js
// ── Coach directive: hold position (VHF radio nudge) ──
if (this._holdUntil && this._game?._clock != null && this._game._clock * 1000 < this._holdUntil) return;
```
Careful: Game._clock is in SECONDS — either use seconds consistently or
performance.now(); pick performance.now() for _holdUntil and compare against
performance.now() directly (no dependency on game clock). Use whichever is
simpler but DOCUMENT it in a comment. Also expose `get pos()` if not already
public (grep first — ScrapBot has `this._pos`; add a small getter if absent).

### index.html — entry points + HUD
1. Start screen: add a second button under #start-btn: `SPECTATOR` (id
   `spectator-btn`, same styling family, smaller). Wire in main.js? NO —
   main.js boots the game on CLOCK IN. Instead: make the spectator button
   ALSO boot the game the same lazy way, then enter spectator. Look at how
   main.js start-btn works: simplest = dispatch a real click on #start-btn
   then set a flag `window.__scrapcraft_spectator = true` BEFORE, and in
   Game.start() (or after boot promise resolves in main.js) check the flag →
   `game.radio.enter({from:'menu'})`. You MAY add ~10 lines to src/main.js
   for this (you own main.js for this task).
2. Pause overlay (#pause-inner): add button `📻 COACH MODE` (id
   `coach-mode-btn`) → on click: resume-then-enter: `game.radio.enter()`.
   The pause overlay click handler already re-locks pointer. Register the
   button handler in SpectatorCoach constructor (document.getElementById,
   guarded).
3. Coach HUD (created dynamically by SpectatorCoach — do NOT bloat
   index.html): a fixed bottom-center panel `#coach-hud` with:
   - top row: radio state pill (IDLE gray / TX amber "ON AIR ▲" / RX green
     "RX ▼ — <name>"), channel indicator (CH-1 COACH / CH-2 CHATTER, switch
     with K), followed bot name, EXIT COACH (X)
   - roster line: bot names + status ( RUNNING / HOLDING / RACING )
   - log: last 3 radio transmissions (coach → agent arrows)
   - text fallback input (hidden until mic fails; or toggle with T)
   Inline styles via a <style> block injected once from SpectatorCoach.js
   (keeps index.html edits to the two buttons). TX state = amber border +
     pulsing; RX = green; BUSY flash = red 400ms.

### Voice routing note
voiceOut voices allowed: spark/earl/announcer/rivet/bolt/magma/juno (see
speak.js VOICE_RATE). Demo bots get rivet/bolt/juno. Agent acks on the coach
channel use their own voice.

## Non-negotiables
- Every DOM/`window`/`localStorage` access guarded (the file is imported by
  the browser only, but write defensively like listen.js does).
- No console noise in normal operation (console.debug ok).
- `node --check` must pass on SpectatorCoach.js, Game.js, ScrapBot.js,
  main.js. `npm run build` must succeed. `npm test` must stay green (you add
  no tests; coder A wires the radio tests).
- Verify before reporting: `cd /tmp/scrap-coach-wt && npm run build && npm test`
- READ files before editing them; grep for real export names (ScrapBot
  deactivate path, TileEditor program exports, World block API) — do not
  guess APIs.

## ADDENDUM — verified facts (supersede any guesses above)
- Example programs: import from `../maker/TileProgram.js` (NOT TileEditor.js):
  EXAMPLE_WALL_AVOIDER, EXAMPLE_LIGHT_RUNNER, EXAMPLE_SQUARE, EXAMPLE_ORE_HUNTER.
- World API: `world.getBlock(x, y, z)` returns numeric block id; block ids
  exported as `B` (check `src/data/blocks.js` for the export name — World.js
  imports it). Interesting ids: B.SCRAP_PILE, B.RUST_METAL, B.CRYSTAL_ORE.
  For 'mine' scans use numeric id equality against those three, y in 0..9.
- ScrapBot has NO deactivate — you may add a small public `deactivate()` to
  ScrapBot.js (sets _active=false, removes mesh from scene if present, clears
  runtime/brain state). That is your second allowed ScrapBot edit.
- ScrapBot position: `bot._pos` (THREE.Vector3) — add a `get pos()` if absent.
- Game keyup listeners: grep for existing `addEventListener('keyup'` in
  Game.js — add your radio.onKeyUp hook in the same registration place.
- main.js: you own it for the spectator boot flag (~10 lines).
