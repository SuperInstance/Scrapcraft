# Dev Guide — Spark, the AI Build Companion

**This is the killer feature.** A kid says *"I want my rover to chase the light
and honk at corners,"* and Spark turns that into working tiles they drop onto
their robot — without writing code. Spark runs on Claude, reusing the exact
`fetch` infrastructure already in `src/Foreman.js` (`_claudeReply`).

**Effort:** ~1.5 weeks for the core loop + offline fallback.

**Read first:** `/AI_MAKER_LAB.md` (the vision), `src/maker/README.md` (the
engine Spark targets), and `src/Foreman.js` (the existing Claude call to copy).

---

## The one principle that makes this safe

**Spark never executes anything. Spark only proposes `TileProgram` nodes, and the
deterministic `compile()` is the gate.** If the AI hallucinates a motor that
doesn't exist, `compile()` rejects it and we surface a friendly error — we never
run unvalidated AI output. The capability schema in `src/maker/primitives.js` is
the closed vocabulary Spark must compose from. This is why "function-first,
firmware-blurred" is safe: the blur is bounded by real, validated primitives.

---

## Architecture

```
kid types intent ──► SPARK (Claude, tool-use) ──► emits TILE_SPEC (tool call)
                          │                              │
                          │ clarifying question?         ▼
                          │ (asks in chat)        compile(TileProgram)
                          ▼                              │
                   conversation continues          ok? ─┴─ no → Spark sees the
                                                     │            error, revises
                                                     ▼
                                          tile appears in the editor tray
                                          kid drops it, hits RUN, reacts,
                                          Spark iterates ("tighter turns?")
```

## The tool Spark is given

Define ONE Claude tool. Its input schema mirrors `TileProgram` nodes so Claude's
output drops straight into the engine. Keep the vocabulary closed via enums
generated from the registries.

```js
// build these enums at runtime from the schema so they never drift:
import { SENSORS, ACTUATORS } from '../maker/index.js';
const SENSOR_IDS   = Object.keys(SENSORS);     // ['brightness','distance_ahead',...]
const ACTUATOR_IDS = Object.keys(ACTUATORS);   // ['drive','turn','beep',...]

const emitTiles = {
  name: 'emit_tiles',
  description: "Build or replace the robot's brain from tiles. Only use the listed "
    + "sensors and actuators — they map to real hardware on the robot.",
  input_schema: {
    type: 'object',
    properties: {
      explanation: { type: 'string', description: 'One short, fun sentence for the kid.' },
      nodes: { type: 'array', items: { $ref: '#/$defs/node' } },
    },
    required: ['nodes'],
    $defs: {
      node: {
        type: 'object',
        properties: {
          type: { enum: ['action','wait','repeat','forever','if','if_else','macro'] },
          prim: { enum: ACTUATOR_IDS },          // for action
          params: { type: 'object' },
          seconds: { type: 'number' },           // for wait
          count: { type: 'integer' },            // for repeat
          kind: { enum: ['turn_angle','drive_distance'] },  // for macro
          cond: { $ref: '#/$defs/cond' },
          body: { type: 'array', items: { $ref: '#/$defs/node' } },
          elseBody: { type: 'array', items: { $ref: '#/$defs/node' } },
        },
        required: ['type'],
      },
      cond: {
        type: 'object',
        properties: {
          sensor: { enum: SENSOR_IDS },
          cmp: { enum: ['gt','lt','gte','lte','eq','neq','is'] },
          value: {},
          not: { type: 'boolean' },
        },
        required: ['sensor','cmp','value'],
      },
    },
  },
};
```

When Claude calls `emit_tiles`, you do:

```js
const program = new TileProgram({ name, brain: currentBrain, nodes: toolInput.nodes });
const result = compile(program);
if (!result.ok) {
  // hand the errors back to Claude as the tool_result so it self-corrects:
  return { type: 'tool_result', content: `Some tiles didn't work: ${result.errors.join('; ')}. `
    + `Only use these actuators: ${ACTUATOR_IDS.join(', ')} and sensors: ${SENSOR_IDS.join(', ')}.` };
}
// success: insert the tiles into the editor, return a happy tool_result
editor.loadProgram(program);
return { type: 'tool_result', content: `Added "${name}". Tell the kid in one fun line.` };
```

That self-correction loop (feed `compile` errors back as `tool_result`) is what
makes Spark robust: the model fixes its own mistakes against the real validator.

## System prompt (Spark's character)

Spark is NOT Earl. Earl is the gruff foreman who sets problems; Spark is the
giddy build-partner who helps solve them. Keep them distinct.

```
You are SPARK, a small floating robot and the player's build buddy in the
scrapyard game SCRAPCRAFT. The player is a clever middle-schooler.
Your job: help them program their scrap robots and vehicles by building TILES.

Rules:
- You are endlessly curious and think every one of their ideas is genuinely cool.
- Keep chat SHORT (1-2 sentences) and fun. Never lecture.
- When they describe what they want, ask ONE clarifying question only if you
  truly need it, then call emit_tiles to build it.
- You may ONLY use the sensors and actuators provided to the tool. If they ask
  for something impossible on the robot, say so cheerfully and offer the closest
  real thing.
- After building, tell them what to try and invite a tweak ("too fast? say so").
- Teach by doing, never by code. Don't mention C++, GPIO, or pins unless THEY
  ask to "see the real code". Then get excited about it.
Never break character. Never mention being an AI model.
```

## Offline fallback (no API key)

Mirror `Foreman.js`'s pattern: if `import.meta.env.VITE_ANTHROPIC_API_KEY` is
unset, Spark uses a **recipe-conversation bank** — a handful of canned intents
mapped to prebuilt `TileProgram`s (reuse `EXAMPLE_*` from `TileProgram.js` plus
~10 more). Pattern-match keywords ("light", "wall", "square", "follow") to a
recipe, deliver a scripted Spark line, and load the program. The game stays fully
playable offline; live Claude just unlocks open-ended requests.

## Model + call details

- Use the same endpoint/headers as `Foreman._claudeReply` (note the
  `anthropic-dangerous-direct-browser-calls` header already there).
- Model: `claude-sonnet-4-6` for snappy in-game latency; the task is small and
  well-scoped. (Document this in a `.env.example`.)
- Keep `max_tokens` modest (~400 — tool calls + a one-liner).
- Maintain a short rolling history per build session for "make it tighter"
  follow-ups, exactly like `Foreman._history`.

> If you need to verify model ids / tool-use request shape / streaming, consult
> the `claude-api` skill rather than guessing.

---

## Acceptance criteria

- "make it drive away from bright light" → Spark builds a `forever` with an
  `if brightness > …` driving away; it RUNs and the bot flees light.
- Asking for something impossible ("shoot lasers") → Spark declines in character
  and offers the closest real capability (e.g. beep + LED), never crashes.
- A deliberately bad model output (unknown prim) is caught by `compile()` and
  triggers self-correction, not a runtime error.
- Offline (no key): keyword intents still produce working brains.

## Why this is the moat

Wokwi simulates firmware but demands C++. Scratch generates blocks but controls a
sprite. ChatScratch helps inside Scratch's sandbox. **Spark is the only one that
turns conversation into validated, real-hardware-shaped robot behaviour that
lives in a game world AND exports to a $6 chip.** Guard the safety rail
(`compile()` between AI and execution) and that moat holds.
