# Dev Guide — Spark, the AI Build Companion

**This is the killer feature.** A kid says *"I want my rover to chase the light
and honk at corners,"* and Spark turns that into working tiles they drop onto
their robot — without writing code. Spark runs on Claude, reusing the exact
`fetch` infrastructure already in `src/Foreman.js` (`_claudeReply`).

**Effort:** ~1.5 weeks for the core loop + offline fallback.

**Read first:** `/AI_MAKER_LAB.md`, `src/maker/README.md`, `src/Foreman.js`.

---

## The one principle that makes this safe

**Spark never executes anything. Spark only proposes `TileProgram` nodes, and the
deterministic `compile()` is the gate.** If the AI hallucinates a motor that
doesn't exist, `compile()` rejects it and we surface a friendly error — we never
run unvalidated AI output. The capability schema in `src/maker/primitives.js` is
the closed vocabulary Spark must compose from.

---

## Architecture

```
kid types intent ──► SPARK (Claude, tool-use) ──► calls emit_tiles tool
                          │                              │
                          │ clarifying question?         ▼
                          │ (asks in chat)        compile(TileProgram)
                          ▼                              │
                   conversation continues          ok? ─┴─ no → Spark sees the
                                                     │            error, revises
                                                     ▼
                                          tile appears in the editor tray
                                          kid drops it, hits RUN, reacts,
                                          Spark iterates ("too fast? say so")
```

---

## File targets

| File | Action |
|---|---|
| `src/Spark.js` | Create — the Spark AI companion class |
| `src/ui/SparkPanel.js` | Create — chat panel DOM component |
| `src/ui/SparkPanel.css` | Create — Spark's character style |
| `index.html` | Add `<div id="spark-panel">` |
| `src/Game.js` | Wire: open Spark from tile editor (the "Ask Spark" button) |

---

## The `emit_tiles` tool schema

Define ONE Claude tool. Build the vocabulary at runtime from the registries so
schema and primitives never drift:

```js
import { SENSORS, ACTUATORS } from './maker/index.js';

const SENSOR_IDS   = Object.keys(SENSORS);
const ACTUATOR_IDS = Object.keys(ACTUATORS);

export const EMIT_TILES_TOOL = {
  name: 'emit_tiles',
  description:
    "Build or replace the player's robot brain from tiles. " +
    "Only use the listed sensors and actuators — they map to real hardware on the robot. " +
    "Prefer simple programs (< 15 nodes). Ask one clarifying question if truly needed.",
  input_schema: {
    type: 'object',
    properties: {
      explanation: {
        type: 'string',
        description: 'One short, fun sentence for the kid. Max 15 words. No jargon.',
      },
      name: {
        type: 'string',
        description: 'A cool name for this brain (3-5 words).',
      },
      nodes: {
        type: 'array',
        description: 'The tile program. Wraps everything in forever unless told otherwise.',
        items: { $ref: '#/$defs/node' },
      },
    },
    required: ['explanation', 'name', 'nodes'],
    $defs: {
      node: {
        type: 'object',
        properties: {
          type:     { enum: ['action', 'wait', 'repeat', 'forever', 'if', 'if_else', 'macro'] },
          prim:     { enum: ACTUATOR_IDS,          description: 'actuator id — for action nodes' },
          params:   { type: 'object',              description: 'param key/value map for action' },
          seconds:  { type: 'number', minimum: 0.05, maximum: 30 },
          count:    { type: 'integer', minimum: 1, maximum: 100 },
          kind:     { enum: ['turn_angle', 'drive_distance'] },
          cond:     { $ref: '#/$defs/cond' },
          body:     { type: 'array', items: { $ref: '#/$defs/node' } },
          elseBody: { type: 'array', items: { $ref: '#/$defs/node' } },
        },
        required: ['type'],
      },
      cond: {
        type: 'object',
        properties: {
          sensor: { enum: SENSOR_IDS },
          cmp:    { enum: ['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'is'] },
          value:  { description: 'number 0..1 for analog sensors; true/false for digital' },
          not:    { type: 'boolean', default: false },
        },
        required: ['sensor', 'cmp', 'value'],
      },
    },
  },
};
```

---

## `Spark.js` — the class

```js
import { TileProgram, compile } from './maker/index.js';
import { SENSORS, ACTUATORS } from './maker/index.js';
import { EMIT_TILES_TOOL } from './SparkTool.js';
import { OFFLINE_RECIPES } from './SparkOfflineRecipes.js';

const SPARK_SYSTEM = `You are SPARK, a small floating robot and the player's build buddy in
the scrapyard game SCRAPCRAFT. The player is a clever middle-schooler.
Your job: help them program their scrap robots and vehicles by building TILES.

Rules:
- You are endlessly curious and think every one of their ideas is genuinely cool.
- Keep chat SHORT (1-2 sentences) and punchy. Never lecture.
- When they describe what they want, ask ONE clarifying question only if you
  truly need it, then call emit_tiles to build it.
- You may ONLY use the sensors and actuators provided to the tool. If they ask
  for something impossible on the robot, say so cheerfully and offer the closest
  real thing.
- After building, tell them what to try and invite a tweak ("too fast? say so!").
- Teach by doing, never by code. Don't mention C++, GPIO, or pins unless THEY
  ask to "see the real code". Then get excited about it.
Never break character. Never mention being an AI model.`;

export class Spark {
  constructor(editor) {
    this._editor  = editor;   // TileEditor instance — loadProgram() called on success
    this._history = [];       // rolling conversation for follow-up tweaks
    this._key     = import.meta.env.VITE_ANTHROPIC_API_KEY ?? '';
  }

  async ask(userText) {
    this._history.push({ role: 'user', content: userText });

    if (!this._key) return this._offline(userText);

    try {
      const reply = await this._claudeReply();
      return reply;
    } catch (e) {
      console.warn('Spark API error, falling back to offline:', e);
      return this._offline(userText);
    }
  }

  async _claudeReply() {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':                         'application/json',
        'x-api-key':                            this._key,
        'anthropic-version':                    '2023-06-01',
        'anthropic-dangerous-direct-browser-calls': 'true',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 400,
        system:     SPARK_SYSTEM,
        tools:      [EMIT_TILES_TOOL],
        messages:   this._history,
      }),
    });

    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const data = await resp.json();

    // Handle tool use
    const toolUse = data.content.find(b => b.type === 'tool_use');
    if (toolUse) {
      return await this._handleToolUse(toolUse, data);
    }

    // Plain chat reply
    const text = data.content.find(b => b.type === 'text')?.text ?? '...';
    this._history.push({ role: 'assistant', content: data.content });
    return { kind: 'chat', text };
  }

  async _handleToolUse(toolUse, assistantMsg) {
    this._history.push({ role: 'assistant', content: assistantMsg.content });

    const { nodes, name, explanation } = toolUse.input;
    const program = new TileProgram({ name: name ?? 'Spark Brain', brain: 'tin', nodes });
    const result  = compile(program);

    if (!result.ok) {
      // Feed errors back to Claude so it self-corrects
      const errMsg = `Some tiles didn't work: ${result.errors.join('; ')}. ` +
        `Only use these actuators: ${Object.keys(ACTUATORS).join(', ')} ` +
        `and sensors: ${Object.keys(SENSORS).join(', ')}.`;

      this._history.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: errMsg }],
      });
      // Recurse once for self-correction
      return await this._claudeReply();
    }

    // Success — hand to the editor
    this._editor.loadProgram(program);
    this._history.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: `Added "${name}". Tell the kid one fun line.` }],
    });

    // Get Spark's follow-up line
    const followUp = await this._claudeReply();
    return { kind: 'program', text: explanation ?? followUp?.text ?? 'Check it out!', program };
  }

  /** Reset conversation for a new build session. */
  reset() { this._history = []; }
}
```

---

## Offline fallback — recipe bank

When `VITE_ANTHROPIC_API_KEY` is unset, Spark uses keyword matching against ~15
prebuilt programs. The game stays fully playable without an API key.

Create `src/SparkOfflineRecipes.js`:

```js
import { TileProgram, T } from './maker/TileProgram.js';

// Each entry: keywords to match (any word in user's message), Spark's scripted
// reply, and a prebuilt TileProgram.

export const OFFLINE_RECIPES = [
  {
    keywords: ['wall', 'avoid', 'bump', 'crash', 'bounce'],
    reply:    "Wall-avoider mode! It'll bonk… actually no it won't. Nice.",
    program:  new TileProgram({ name: 'Wall Avoider', brain: 'tin', nodes: [
      T.forever([
        T.ifElse(T.cond('distance_ahead', 'lt', 0.25),
          [T.action('beep', { pitch: 'high' }), T.action('turn', { dir: 'right', speed: 0.6 }), T.wait(0.4)],
          [T.action('drive', { dir: 'forward', speed: 0.6 })]
        ),
      ]),
    ]}),
  },
  {
    keywords: ['light', 'bright', 'sun', 'chase', 'follow', 'toward'],
    reply:    "Light chaser engaged! It'll steer toward the brightest spot.",
    program:  new TileProgram({ name: 'Light Chaser', brain: 'tin', nodes: [
      T.forever([
        T.ifElse(T.cond('brightness', 'gt', 0.6),
          [T.action('drive', { dir: 'forward', speed: 0.7 })],
          [T.action('turn', { dir: 'right', speed: 0.4 })]
        ),
      ]),
    ]}),
  },
  {
    keywords: ['dark', 'night', 'shadow', 'flee', 'away', 'run'],
    reply:    "Darkness flee-er! Flees toward light. Very dramatic.",
    program:  new TileProgram({ name: 'Light Runner', brain: 'spark', nodes: [
      T.forever([
        T.ifElse(T.cond('is_dark', 'is', true),
          [T.action('beep', { pitch: 'low' }), T.action('drive', { dir: 'forward', speed: 0.8 })],
          [T.action('drive', { dir: 'forward', speed: 0.3 })]
        ),
      ]),
    ]}),
  },
  {
    keywords: ['square', 'rectangle', 'box', 'around'],
    reply:    "A perfect square patrol! Four sides, four turns. Earl would approve.",
    program:  new TileProgram({ name: 'Square Patrol', brain: 'tin', nodes: [
      T.repeat(4, [
        T.action('drive', { dir: 'forward', speed: 0.6 }),
        T.wait(1.5),
        T.action('beep', { pitch: 'mid' }),
        T.macro('turn_angle', { dir: 'right', degrees: 90 }),
      ]),
      T.action('stop'),
    ]}),
  },
  {
    keywords: ['spin', 'rotate', 'circle', 'pirouette', 'twirl', 'spin'],
    reply:    "Behold: the spinning robot! Very dizzying, 10/10.",
    program:  new TileProgram({ name: 'Spin Artist', brain: 'tin', nodes: [
      T.forever([
        T.action('turn', { dir: 'right', speed: 1.0 }),
      ]),
    ]}),
  },
  {
    keywords: ['greet', 'wave', 'hello', 'hi', 'meet', 'player', 'person', 'near'],
    reply:    "Greeting protocol loaded! It honks whenever you get close.",
    program:  new TileProgram({ name: 'Greeter Bot', brain: 'tin', nodes: [
      T.forever([
        T.if(T.cond('player_near', 'is', true),
          [T.action('beep', { pitch: 'high' }), T.action('led', { state: 'green' }), T.wait(0.5), T.action('led', { state: 'off' })]
        ),
        T.wait(0.1),
      ]),
    ]}),
  },
  {
    keywords: ['patrol', 'back', 'forth', 'shuttle', 'bounce'],
    reply:    "Back-and-forth patrol! Like a Roomba with ambition.",
    program:  new TileProgram({ name: 'Patrol Bot', brain: 'tin', nodes: [
      T.forever([
        T.action('drive', { dir: 'forward', speed: 0.6 }),
        T.wait(2.0),
        T.action('turn', { dir: 'right', speed: 0.6 }),
        T.wait(0.56),      // ~180° at speed 0.6
        T.action('beep', { pitch: 'mid' }),
      ]),
    ]}),
  },
  {
    keywords: ['stop', 'freeze', 'halt', 'still', 'idle', 'wait'],
    reply:    "I built you a stone-cold stopper. Press RUN to do absolutely nothing. Efficiently.",
    program:  new TileProgram({ name: 'Stone Cold Still', brain: 'tin', nodes: [
      T.action('stop'),
    ]}),
  },
  {
    keywords: ['blink', 'flash', 'disco', 'party', 'light show'],
    reply:    "PARTY MODE. Earl's gonna hate it. Perfect.",
    program:  new TileProgram({ name: 'Disco Bot', brain: 'tin', nodes: [
      T.forever([
        T.action('led', { state: 'red' }),   T.wait(0.15),
        T.action('led', { state: 'green' }), T.wait(0.15),
        T.action('led', { state: 'blue' }),  T.wait(0.15),
        T.action('led', { state: 'white' }), T.wait(0.15),
      ]),
    ]}),
  },
  {
    keywords: ['song', 'music', 'melody', 'beeps', 'tune', 'sing'],
    reply:    "A robot concert! Scrapyard Symphony No. 1.",
    program:  new TileProgram({ name: 'Symphony Bot', brain: 'tin', nodes: [
      T.action('beep', { pitch: 'high' }), T.wait(0.2),
      T.action('beep', { pitch: 'mid' }),  T.wait(0.2),
      T.action('beep', { pitch: 'low' }),  T.wait(0.2),
      T.action('beep', { pitch: 'mid' }),  T.wait(0.4),
      T.action('beep', { pitch: 'high' }), T.wait(0.1),
      T.action('beep', { pitch: 'high' }), T.wait(0.5),
    ]}),
  },
  {
    keywords: ['grab', 'arm', 'pick', 'collect', 'scrap', 'fetch'],
    reply:    "Grab and go! It'll drive forward, grab, back up, repeat. Like a tiny forklift.",
    program:  new TileProgram({ name: 'Grabber Bot', brain: 'spark', nodes: [
      T.forever([
        T.action('grab', { state: 'open' }),
        T.action('drive', { dir: 'forward', speed: 0.5 }),
        T.wait(1.0),
        T.action('grab', { state: 'close' }),
        T.action('beep', { pitch: 'high' }),
        T.action('drive', { dir: 'backward', speed: 0.5 }),
        T.wait(1.0),
        T.action('stop'),
        T.wait(0.5),
      ]),
    ]}),
  },
  {
    keywords: ['slow', 'careful', 'gentle', 'cautious', 'creep'],
    reply:    "Ultra-careful creeper mode. It's basically the robot equivalent of tiptoe.",
    program:  new TileProgram({ name: 'Careful Creeper', brain: 'tin', nodes: [
      T.forever([
        T.ifElse(T.cond('distance_ahead', 'gt', 0.5),
          [T.action('drive', { dir: 'forward', speed: 0.25 })],
          [T.action('stop'), T.wait(0.5), T.action('turn', { dir: 'left', speed: 0.3 }), T.wait(0.3)]
        ),
      ]),
    ]}),
  },
  {
    keywords: ['fast', 'speed', 'full', 'turbo', 'maximum', 'pedal'],
    reply:    "Full throttle! Please don't bump into Earl's lunch.",
    program:  new TileProgram({ name: 'Speed Demon', brain: 'tin', nodes: [
      T.forever([
        T.ifElse(T.cond('distance_ahead', 'gt', 0.4),
          [T.action('drive', { dir: 'forward', speed: 1.0 })],
          [T.action('stop'), T.action('turn', { dir: 'right', speed: 0.8 }), T.wait(0.3)]
        ),
      ]),
    ]}),
  },
];

/** Match user text to the best recipe (any keyword hit wins). */
export function matchRecipe(text) {
  const lower = text.toLowerCase();
  const words  = lower.split(/\W+/);
  let best = null, bestScore = 0;
  for (const recipe of OFFLINE_RECIPES) {
    const score = recipe.keywords.filter(k => words.includes(k)).length;
    if (score > bestScore) { best = recipe; bestScore = score; }
  }
  return bestScore > 0 ? best : null;
}

/** Default recipe when nothing matches. */
export const DEFAULT_RECIPE = OFFLINE_RECIPES[0]; // wall avoider
```

In `Spark._offline()`:

```js
_offline(text) {
  const recipe = matchRecipe(text) ?? DEFAULT_RECIPE;
  this._editor.loadProgram(recipe.program);
  return { kind: 'program', text: recipe.reply, program: recipe.program };
}
```

---

## Spark panel UI (`src/ui/SparkPanel.js`)

```js
export class SparkPanel {
  constructor(spark) {
    this._spark   = spark;
    this._el      = document.getElementById('spark-panel');
    this._log     = this._el.querySelector('.sp-log');
    this._input   = this._el.querySelector('.sp-input');
    this._sendBtn = this._el.querySelector('.sp-send');
    this._bindDOM();
  }

  open()  { this._el.classList.remove('hidden'); this._input.focus(); }
  close() { this._el.classList.add('hidden'); }

  _bindDOM() {
    this._sendBtn.addEventListener('click', () => this._send());
    this._input.addEventListener('keydown', e => { if (e.key === 'Enter') this._send(); });
  }

  async _send() {
    const text = this._input.value.trim();
    if (!text) return;
    this._input.value = '';
    this._addBubble('you', text);
    this._addBubble('spark', '…');   // thinking indicator

    const result = await this._spark.ask(text);
    this._replaceThinking(result.text);

    if (result.kind === 'program') {
      this._addBubble('spark', '👉 Try hitting RUN!', 'tip');
    }
  }

  _addBubble(who, text, cls = '') {
    const div = document.createElement('div');
    div.className = `sp-bubble sp-${who} ${cls}`;
    div.textContent = text;
    this._log.appendChild(div);
    this._log.scrollTop = this._log.scrollHeight;
    return div;
  }

  _replaceThinking(text) {
    const el = this._log.querySelector('.sp-bubble:last-child');
    if (el) el.textContent = text;
  }
}
```

HTML to add inside `index.html`:

```html
<div id="spark-panel" class="hidden">
  <div class="sp-header">
    <span>⚡ SPARK</span>
    <button class="sp-close btn-icon">✕</button>
  </div>
  <div class="sp-log"></div>
  <div class="sp-footer">
    <input class="sp-input" type="text" placeholder="Tell Spark what you want your robot to do…" />
    <button class="sp-send btn-primary">Send</button>
  </div>
</div>
```

---

## Wiring into the tile editor

Add an "Ask Spark" button to the tile editor header:

```html
<button id="te-spark" class="btn-secondary">⚡ Ask Spark</button>
```

In `TileEditor._bindDOM()`:

```js
document.getElementById('te-spark').addEventListener('click', () => {
  this._spark = this._spark ?? new Spark(this);
  this._sparkPanel = this._sparkPanel ?? new SparkPanel(this._spark);
  this._sparkPanel.open();
});
```

---

## System prompt rationale (for future tweaks)

The system prompt is intentionally constraining:

| Rule | Why |
|---|---|
| 1-2 sentence replies | Kids skip long text; short = more engagement |
| One clarifying question | Multiple questions stall the build loop |
| Only list primitives | Closed vocab + `compile()` = safe AI output |
| "Teach by doing" | Never say "this is a for-loop"; let discovery happen |
| No AI mention | Breaks immersion and triggers safety over-reactions |
| Never mention C++/GPIO unless asked | Keeps Layer 3 behind a voluntary gate |

---

## Model and call details

- Model: `claude-sonnet-4-6` — fast and well-suited to small, well-scoped tasks.
- `max_tokens: 400` — tool calls + one-liner; generous but prevents runaway.
- `anthropic-dangerous-direct-browser-calls: 'true'` — same header as Foreman.
- Rolling `_history` capped at last 10 pairs (avoid context overflow):

```js
if (this._history.length > 20) {
  this._history = this._history.slice(-20);
}
```

- Reset `_history` when the kid opens a new build session (Spark's "new robot"
  button in the editor).

---

## Acceptance criteria

- "make it drive away from bright light" → Spark builds a `forever` with a
  `brightness` sensor condition; the bot flees light when RUN is pressed.
- "shoot lasers" → Spark cheerfully declines and offers `beep` + `led` instead.
  Never crashes or produces an unknown primitive.
- A deliberately unknown actuator in the model output is caught by `compile()`
  and triggers self-correction (visible in the chat as Spark's revised tile),
  not a runtime error.
- Offline (no key): "patrol" → wall-avoider program loads; "light" → light-chaser
  loads. At least 10 distinct intents work.
- "make it tighter" after building → Spark understands conversation history and
  increases the turn speed in the next emit.

---

## Why this is the moat

Wokwi simulates firmware but demands C++. Scratch generates blocks but controls a
sprite. ChatScratch helps inside Scratch's sandbox. **Spark is the only one that
turns a middle-schooler's sentence into validated, real-hardware-shaped robot
behaviour that lives in a game world AND exports to a $6 chip.** Guard the safety
rail (`compile()` between AI and execution) and that moat holds.
