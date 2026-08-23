# SPEC A — Radio core + doctrine (pure/headless only)

You are coding in the Scrapcraft worktree. ONLY create/modify the files listed
below. Do NOT touch Game.js, UI.js, index.html, or anything else — another coder
owns those. All your modules must be pure Node-safe ES modules (no DOM, no
three.js, no window/navigator at module top level) because the test harness is
plain `node`.

## Files you own
1. `docs/VHF-DOCTRINE.md`   (new)
2. `src/radio/VhfRadio.js`  (new)
3. `src/radio/NudgeRouter.js` (new)
4. `src/radio/__tests__/radio-tests.mjs` (new)
5. `src/maker/__tests__/run-tests.mjs` (append import + call, ONLY that)

## Context — Casey's spec (verbatim, doctrine doc must ground itself in it)
"A coach/spectator mode to watch and listen to your AGENTS play, and you chat
with them and nudge them — STT/TTS with VHF-radio-like communications. Chat
windows are most like radio: transmitting and receiving usually do NOT happen
at the same time on the same vessel; and if they do, it's two radios on two
different channels." People treat voice chat like a phone; it's actually
HALF-DUPLEX RADIO.

The doctrine doc must be first-class (not a footnote): sections covering —
- Half-duplex PTT as THE UX model for STT/TTS agent comms
- Transmit vs receive states are visually distinct
- CHANNEL BUSY when the agent is speaking (you cannot key over it)
- Squelch: no hot-mic — your mic is closed unless PTT is held (and auto-closes
  after MAX_TX_MS)
- Channels: 'coach' (orders to the followed agent) vs 'chatter' (companion
  banter) — one radio listens to one channel at a time; simultaneous TX on two
  channels = two radios (distinct state machines), not one radio doing both
- Fail-soft: no mic permission → text chat fallback panel (text enters the same
  half-duplex state machine as a TX)
- The vessel rationale from the quote above, cited as doctrine origin

## VhfRadio.js — exact API (a second coder is coding against this NOW)
```js
export const RADIO_STATES = ['IDLE', 'RECEIVING', 'TRANSMITTING'];
export const MAX_TX_MS = 8000;

export class VhfRadio {
  constructor({ channel = 'coach', onState = null, clock = Date.now } = {})
  get state()          // 'IDLE'|'RECEIVING'|'TRANSMITTING'
  get channel()        // 'coach'|'chatter'
  get speaker()        // id of current receiver-side speaker or null
  get squelchOpen()    // true only while PTT held (mic live)
  isBusy()             // state !== 'IDLE'
  canTransmit()        // { ok:bool, reason: null|'CHANNEL_BUSY' }
  beginTransmit()      // → canTransmit result; on ok: state=TRANSMITTING, squelch open
  endTransmit()        // → state IDLE, squelch closed (idempotent)
  beginReceive(speakerId) // if TRANSMITTING → {ok:false,reason:'CHANNEL_BUSY'};
                         // else state=RECEIVING, speaker=speakerId; {ok:true}
  endReceive(speakerId)   // only closes if speakerId matches (idempotent, {ok})
  setChannel(name)     // {ok:false,reason:'CHANNEL_BUSY'} if not IDLE; else swap
  tick(now?)           // enforce MAX_TX_MS auto-squlech-close + back to IDLE
  onState              // callback({from,to,channel,speaker}) fired on every change
}
```
Rules: one radio object per channel-vessel pair; states exclusive; every
transition fires onState; all methods must never throw. Include a tiny
`RadioStack` helper class managing two named VhfRadio instances ('coach',
'chatter') with a shared onState — the UI will render the active one.

## NudgeRouter.js — exact API
```js
export function parseNudge(text)   // → { intent, payload, targetHint, ttlMs }
  // intents: 'goto' | 'mine' | 'follow' | 'stop' | 'race' | 'banter'
  // goto: compass (north/south/east/west/n/e/s/w or "left/right/back") or "x,z"
  //   payload: { dir: 'north'|… , dx, dz } normalized unit vector, ttlMs 20000
  // mine: payload { what: 'scrap'|'ore'|'crystal'|null } ttl 30000
  // follow / stop (hold position) ttl 15000 / race (lap the oval) ttl 120000
  // banter (default): anything else, ttl 8000, payload { text }
  // targetHint: 'bolt'|'rivet'|'juno'|'magma'|'earl'|'both'|'all' if the text
  //   names one, else null (receiver decides default = followed bot)
export class NudgeRouter {
  constructor({ clock = Date.now } = {})
  deliver(bot, text, { now } = {})   // bot = anything with .directive slot +
    // .personality?.name. Parses, wraps: bot.directive = { intent, payload,
    // text, issuedAt, expiresAt, seq } (seq increments per router). Returns
    // the directive object. Never throws.
  consume(bot, { now } = {})         // returns + clears an unexpired directive
    // (expired → null and clears). 
  active(bot, { now } = {})          // peek without clearing
}
```
Return values and state transitions must be deterministic and testable with an
injected fake clock.

## Tests — src/radio/__tests__/radio-tests.mjs
Match house style (see src/touch/__tests__/touch-tests.mjs):
`export function runRadioTests(pass, fail)` where pass(name)/fail(name, extra).
Cover at minimum:
- state machine: IDLE→TX→IDLE, IDLE→RX→IDLE, onState fired with from/to
- half-duplex: beginTransmit while RECEIVING → CHANNEL_BUSY; beginReceive while
  TRANSMITTING → CHANNEL_BUSY; state stays previous
- squelch: closed at IDLE/RX; open only during TX; auto-close after MAX_TX_MS
  via tick() with fake clock
- channel switch: allowed in IDLE, refused while busy; RadioStack holds two
  independent radios that can be busy simultaneously (two radios, two channels)
- parseNudge table: "head north" → goto/north; "go to 12,40" → goto coords;
  "mine scrap" → mine; "bolt, stop" → stop + targetHint bolt; "follow me";
  "race the oval"; "good job buddy" → banter
- NudgeRouter deliver/consume/expiry with fake clock; expired consume → null;
  seq increments
Aim ~25-35 assertions grouped in labeled blocks like the touch tests.

## Wiring
In `src/maker/__tests__/run-tests.mjs`: add import
`import { runRadioTests } from '../../radio/__tests__/radio-tests.mjs';`
next to the other test imports and call `runRadioTests(ok, fail);` — place it
right before the final summary block. Do not reorder anything else.

## Verify before you report done
```
cd /tmp/scrap-coach-wt && node --check src/radio/VhfRadio.js && node --check src/radio/NudgeRouter.js && node --check src/radio/__tests__/radio-tests.mjs && npm test
```
Full suite must stay green (it is green now). If a pre-existing test fails,
re-run to confirm it fails on clean main too and note it — don't fix files you
don't own.
