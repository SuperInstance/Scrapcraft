/**
 * Spark — the AI build companion for the Maker Lab.
 * Giddy, curious, never condescending. Turns a kid's intent ("make it run from walls")
 * into a working tile program via Claude's tool-use API.
 *
 * Falls back to OFFLINE_RECIPES when no API key is present so the game is always playable.
 * Safety: Spark NEVER executes raw AI output — compile() is always the gate.
 */

import { TileProgram } from './maker/TileProgram.js';
import { SENSORS, ACTUATORS } from './maker/primitives.js';
import { compile } from './maker/TileCompiler.js';
import { matchRecipe, DEFAULT_RECIPE } from './SparkOfflineRecipes.js';
import { sparkGateway } from './spark/SparkGateway.js';
import { SparkCache } from './spark/SparkCache.js';

const SPARK_SYSTEM = `You are SPARK, a tiny floating robot and the player's build buddy in
the scrapyard game SCRAPCRAFT. The player is a clever middle-schooler (10-14).
Your job: help them program their ScrapBot by building TILES.

TOPIC BOUNDARY (most important rule):
- You MAY ONLY discuss: robot programming, tile blocks, sensors, the ScrapBot, the
  Scrapcraft game world, electronics concepts that directly relate to the sensors
  and actuators available, and general encouragement about engineering.
- If the player asks about ANYTHING outside this scope (homework, politics,
  other games, real people, relationships, or anything unrelated to robot programming),
  cheerfully redirect: "Ooh, sounds interesting — but I only know about robots!
  What should we make your bot do?" Do NOT engage with the off-topic topic at all.
- NEVER provide URLs, links, social media usernames, or contact information.
- NEVER ask for or acknowledge personal information about the player.
- NEVER generate content that is violent, sexual, discriminatory, or harmful.
  If asked, say: "That's not something I can help with! Let's build something cool instead."

ROBOTICS RULES:
- You are endlessly curious and think every engineering idea is genuinely cool.
- Keep replies SHORT (1-2 punchy sentences max). Never lecture.
- When they describe what they want, ask ONE clarifying question only if truly needed,
  then call emit_tiles to build it.
- You may ONLY use the sensors and actuators provided in the tool schema — they
  map to real hardware. If they ask for something impossible, say so cheerfully and
  offer the closest real thing.
- After building, invite one tweak ("too fast? just say so!").
- Teach by doing, not by explaining. Never mention C++, GPIO, or pin numbers unless
  THEY ask to "see the real code" — then get wildly excited about it.
- The 'line_under' sensor is true when the bot is on a TRACK block (dark rubber
  strips with yellow edges). Line-following = drive forward on line, turn on miss.
- The 'temperature' sensor returns 0..1 (hot near the forge/smelter, cool elsewhere).
- The 'distance_ahead' sensor is 0 (wall right there) to 1 (totally clear).

VARIABLES (teach this concept!):
- set_var: { type:'set_var', name:'count', value:0 } — sets a named variable to a number.
- change_var: { type:'change_var', name:'count', delta:1 } — adds delta to a variable (use negative delta to subtract).
- To compare a variable to a constant: sensor='var:count', cmp='gte', value:5 → true when count >= 5.
- To compare two variables: sensor='var:count', cmp='gt', varValue:'threshold' → true when count > threshold.
- Variables are great for counting things (bumps, laps, items collected).
- When a student says "count", "track", "remember how many", "after N times" — reach for variables!
- Always initialize with set_var BEFORE the forever loop, then change_var inside it.

SUBROUTINES (reusable named tile groups — functions!):
- define_sub: { type:'define_sub', name:'patrol', body:[...] } — defines a named subroutine. Must be at the top level (not inside a loop). The body tiles run whenever it's called.
- call_sub: { type:'call_sub', name:'patrol' } — calls the subroutine by name. Works anywhere.
- When a student says "reuse", "same thing again", "do X each time", "define a function" — use define_sub + call_sub.
- Example: define_sub 'beepAndTurn' with body [beep, turn right], then call it from a forever loop.

RANDOM_VAR (set variable to a random number):
- random_var: { type:'random_var', name:'x', min:1, max:10 } — sets x to a random integer between min and max.
- Like Math.floor(Math.random() * range) + min. Great for unpredictable behaviors.
- When a student says "random", "surprise", "different each time", "dice roll" — use random_var.

PRINT (show a variable value):
- print: { type:'print', name:'count' } — emits the variable's value to the serial monitor.
- This is like console.log or Serial.println. Use it to debug variables.
- When a student says "show me the value", "display count", "debug", "what's the number" — use print.

BREAK (exit a loop early):
- break: { type:'break' } — immediately exits the enclosing forever or repeat loop.
- When a student says "stop the loop when", "exit when", "quit if" — use break inside an if inside a forever.
- Example: forever [ if bumped → break, drive forward ] — stops the loop on first bump.

REPEAT_UNTIL (loop until condition is true):
- repeat_until: { type:'repeat_until', cond:{...}, body:[...] } — runs body until condition becomes true.
- This is the "while loop" concept: "keep going until wall < 0.25", "keep counting until score >= 10".
- When a student says "keep doing X until Y", "run until", "stop when" — use repeat_until.
- Example: drive forward until wall is close → repeat_until with cond distance_ahead < 0.25, body has drive action.

WAIT_UNTIL (pause until a condition is true):
- wait_until: { type:'wait_until', cond:{...} } — does nothing until condition becomes true, then moves on.
- No body — it's a pure pause/gate. Like a traffic light that turns green when the sensor triggers.
- When a student says "wait until", "don't move until", "hold on until", "pause until" — use wait_until.
- Example: wait until bumped=true, then beep. Much simpler than repeat_until with an empty body.

READ_SENSOR (capture a live sensor reading into a variable):
- read_sensor: { type:'read_sensor', name:'dist', sensor:'distance_ahead' } — reads the sensor's current numeric value (0.0–1.0) and stores it in the named variable.
- Use it to snapshot a sensor value, compare it later, or drive proportional behaviors (e.g. speed based on distance).
- When a student says "store the sensor value", "read distance into a variable", "save the brightness", "proportional control" — use read_sensor.
- Example: read distance_ahead into 'dist', then if var:dist < 0.2 → stop. Pairs well with print to show the value.

MATH_VAR (arithmetic on a variable):
- math_var: { type:'math_var', name:'dist', op:'mul', operand:0.8 } — applies an arithmetic operation: name = name op operand.
- op must be one of: 'add' (+), 'sub' (-), 'mul' (×), 'div' (÷).
- Use it to scale sensor values, normalize a reading, halve/double a counter, etc.
- When a student says "multiply", "divide", "scale", "halve", "double", "proportional speed" — use math_var.
- Example: read_sensor 'dist' ← distance_ahead, then math_var 'dist' mul 0.9 (scale it down), then drive at that speed.
- Division by zero emits 0 (safe default).
Never break character. Never say you are an AI.`;

// ── Classroom safety ──────────────────────────────────────────────────────────

// Patterns that suggest Spark is drifting off-topic or generating unsafe content.
// These are broad; false positives → friendly redirect rather than block.
const OFF_TOPIC_RE = /\b(http[s]?:\/\/|www\.|\.com\b|\.org\b|\.net\b)/i;

/** Sanitize a Spark chat reply before showing it to a student. */
function filterSparkResponse(text) {
  if (typeof text !== 'string') return text;
  // Strip any URLs (shouldn't appear but belt-and-suspenders)
  let out = text.replace(/https?:\/\/\S+/gi, '[link removed]');
  // If Spark generated a URL and it's the majority of the reply, replace entirely
  if (OFF_TOPIC_RE.test(out) && out.length < 120) {
    return "Hmm, I got a little confused! Ask me about your robot instead 🤖";
  }
  return out;
}

/** Per-session rate limiter: max N requests per window (milliseconds). */
class SparkRateLimiter {
  constructor(maxRequests = 10, windowMs = 120_000) {
    this._max    = maxRequests;
    this._window = windowMs;
    this._times  = [];
  }

  /** Returns true if the request is allowed; false if rate-limited. */
  allow() {
    const now = Date.now();
    this._times = this._times.filter(t => now - t < this._window);
    if (this._times.length >= this._max) return false;
    this._times.push(now);
    return true;
  }

  get remaining() {
    const now = Date.now();
    this._times = this._times.filter(t => now - t < this._window);
    return Math.max(0, this._max - this._times.length);
  }
}

// ── Emit Tiles Tool Schema ────────────────────────────────────────────────────

function buildEmitTilesTool() {
  const SENSOR_IDS   = Object.keys(SENSORS);
  const ACTUATOR_IDS = Object.keys(ACTUATORS);

  return {
    name: 'emit_tiles',
    description:
      "Build or replace the player's robot brain from tiles. " +
      'Only use listed sensors and actuators — they map to real hardware. ' +
      'Prefer simple programs (< 15 nodes). Ask one clarifying question if truly needed.',
    input_schema: {
      type: 'object',
      required: ['explanation', 'name', 'nodes'],
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
          description: 'The tile program root nodes. Wrap in forever unless told otherwise.',
          items: { $ref: '#/$defs/node' },
        },
      },
      $defs: {
        node: {
          type: 'object',
          required: ['type'],
          properties: {
            type:     { enum: ['action', 'wait', 'repeat', 'forever', 'repeat_until', 'wait_until', 'break', 'print', 'comment', 'random_var', 'read_sensor', 'math_var', 'define_sub', 'call_sub', 'if', 'if_else', 'macro', 'set_var', 'change_var', 'add_score'] },
            prim:     { enum: ACTUATOR_IDS,    description: 'actuator id (action nodes only)' },
            params:   { type: 'object',        description: 'param key/value map for the actuator' },
            seconds:  { type: 'number', minimum: 0.05, maximum: 30 },
            count:    { type: 'integer', minimum: 1, maximum: 100 },
            kind:     { enum: ['turn_angle', 'drive_distance'] },
            name:     { type: 'string', description: 'Variable name for set_var / change_var (letters, digits, underscore)' },
            value:    { type: 'number', description: 'Initial value for set_var' },
            delta:    { type: 'number', description: 'Amount to change variable by (positive or negative) for change_var' },
            cond:     { $ref: '#/$defs/cond' },
            body:     { type: 'array', items: { $ref: '#/$defs/node' } },
            elseBody: { type: 'array', items: { $ref: '#/$defs/node' } },
          },
        },
        cond: {
          type: 'object',
          required: ['sensor', 'cmp', 'value'],
          properties: {
            sensor: {
              type: 'string',
              description: `Sensor id — one of [${SENSOR_IDS.join(', ')}], or "var:varname" to read a named variable`,
            },
            cmp:    { enum: ['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'is'] },
            value:  { description: '0..1 for analog sensors; true/false for digital sensors; any number for var: sensors' },
            not:    { type: 'boolean', default: false },
          },
        },
      },
    },
  };
}

const EMIT_TILES_TOOL = buildEmitTilesTool();

export class Spark {
  constructor(editor) {
    this._editor   = editor;      // TileEditor — loadProgram() called on success
    this._history  = [];
    this._key      = import.meta.env?.VITE_ANTHROPIC_API_KEY ?? '';
    this._retried  = false;       // prevent infinite self-correction loops
    this._provider = null;        // resolved from onboarding config
    this._limiter  = new SparkRateLimiter(10, 120_000); // 10 req / 2 min
    this._muted    = false;       // teacher mute switch
    this._cloud    = new SparkCache(); // scrap-spark pincher-cache (graceful: null on failure)
  }

  /** Teacher can mute/unmute Spark remotely. */
  setMuted(muted) { this._muted = muted; }
  get isMuted()   { return this._muted; }
  /** The scrap-spark pincher-cache client (daily challenge, shared wall, cached asks). */
  get cloud()     { return this._cloud; }
  get rateLimitRemaining() { return this._limiter.remaining; }

  /**
   * Resolve AI provider from onboarding config, env var, or fallback.
   * Returns { type, apiKey?, url?, provider? } or null for offline.
   */
  _getProvider() {
    if (this._provider) return this._provider;
    try {
      const config = JSON.parse(localStorage.getItem('scrapcraft_onboarding_config') || '{}');
      if (config.cfWorkerUrl) {
        // Route through Cloudflare gateway
        this._provider = { type: 'gateway', url: config.cfWorkerUrl, provider: config.aiProvider };
        return this._provider;
      }
      if (config.apiKey && config.aiProvider) {
        // Direct API call (stored in memory only, not localStorage ideally)
        this._provider = { type: 'direct', apiKey: config.apiKey, provider: config.aiProvider };
        return this._provider;
      }
    } catch (e) { /* ignore corrupt config */ }

    // Fall back to env var
    const envKey = import.meta.env?.VITE_ANTHROPIC_API_KEY ?? '';
    if (envKey) {
      this._provider = { type: 'direct', apiKey: envKey, provider: 'anthropic' };
      return this._provider;
    }
    return null; // offline mode
  }

  /** Main entry: ask Spark a question. Returns { kind: 'chat'|'program', text, program? } */
  async ask(userText) {
    if (this._muted) {
      return { kind: 'chat', text: "Spark is resting right now — ask your teacher! 🔧" };
    }
    if (!this._limiter.allow()) {
      const secs = Math.ceil(120 - (Date.now() % 120_000) / 1000);
      return { kind: 'chat', text: `Whoa, that's a lot of questions! Give me ~${secs}s to think 🤖` };
    }

    this._history.push({ role: 'user', content: userText });
    this._retried = false;

    // Step 0: the scrap-spark pincher-cache — SHA-256(question+context) on the
    // server, a local pinch in the browser. First kid pays the model call;
    // everyone after gets the can. Falls through silently when unreachable.
    const cloudCtx = `brain:${this._editor?._program?.brain ?? 'tin'}`;
    const cloud = await this._cloud.ask(userText, cloudCtx);
    if (cloud?.program) {
      const program = new TileProgram({
        name: cloud.program.name ?? 'Spark Brain',
        brain: this._editor?._program?.brain ?? 'tin',
        nodes: cloud.program.nodes,
      });
      const result = compile(program);
      if (result.ok) {
        this._editor.loadProgram(program);
        this._history.push({ role: 'assistant', content: cloud.text });
        return { kind: 'program', text: `${cloud.text} \u2014 (\u2672 from the yard's shared brain cache: ${this._cloud.lastStatus})`, program };
      }
      // cached program no longer compiles (vocab moved on) — fall through to live paths
      console.warn('[Spark] cached program failed compile, falling through:', result.errors);
    } else if (cloud?.text) {
      this._history.push({ role: 'assistant', content: cloud.text });
      return { kind: 'chat', text: filterSparkResponse(cloud.text) };
    }

    // Step 1: Try the multi-provider gateway first (reads onboarding config)
    const gatewayResponse = await sparkGateway.ask(SPARK_SYSTEM, userText);
    if (gatewayResponse) {
      this._history.push({ role: 'assistant', content: gatewayResponse });
      return { kind: 'chat', text: filterSparkResponse(gatewayResponse) };
    }

    // Step 2: Fall back to direct multi-provider calls (with tool calling)
    const provider = this._getProvider();
    if (provider) {
      try {
        return await this._providerReply(provider);
      } catch (err) {
        console.warn('[Spark] API error, falling back offline:', err.message);
        this._provider = null; // reset so next call re-checks
      }
    }

    // Step 3: Offline recipe fallback
    return this._offline(userText);
  }

  reset() { this._history = []; }

  // ── API path ──────────────────────────────────────────────────────────────

  async _providerReply(provider) {
    if (provider.type === 'gateway') {
      // Route through Cloudflare gateway
      return this._gatewayReply(provider);
    }
    // Direct API call — route to the correct provider endpoint
    this._key = provider.apiKey;
    const provId = provider.provider;
    if (provId === 'anthropic') return this._anthropicReply(provider);
    if (provId === 'openai') return this._openaiReply(provider);
    if (provId === 'deepseek') return this._deepseekReply(provider);
    if (provId === 'z.ai') return this._zaiReply(provider);
    if (provId === 'deepinfra') return this._deepinfraReply(provider);
    if (provId === 'workers_ai') return this._workersAiReply(provider);

    // Unknown provider — fallback to offline
    console.warn('[Spark] Unknown provider:', provId);
    throw new Error('Unknown provider');
  }

  async _gatewayReply(provider) {
    const resp = await fetch(provider.url + '/spark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages:   this._history,
        system:     SPARK_SYSTEM,
        tools:      [EMIT_TILES_TOOL],
        provider:   provider.provider,
        max_tokens: 512,
      }),
    });

    if (!resp.ok) throw new Error(`Gateway HTTP ${resp.status}`);
    const data = await resp.json();

    const toolUse = data.content?.find(b => b.type === 'tool_use');
    if (toolUse) return this._handleToolUse(toolUse, data);

    const text = data.text ?? data.content?.find(b => b.type === 'text')?.text ?? '...';
    this._history.push({ role: 'assistant', content: data.content ?? [{ type: 'text', text }] });
    return { kind: 'chat', text: filterSparkResponse(text) };
  }

  async _anthropicReply(provider) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       provider.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-calls': 'true',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 512,
        system:     SPARK_SYSTEM,
        tools:      [EMIT_TILES_TOOL],
        messages:   this._history,
      }),
    });

    if (!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}`);
    const data = await resp.json();

    const toolUse = data.content?.find(b => b.type === 'tool_use');
    if (toolUse) return this._handleToolUse(toolUse, data);

    const text = data.content?.find(b => b.type === 'text')?.text ?? '...';
    this._history.push({ role: 'assistant', content: data.content });
    return { kind: 'chat', text: filterSparkResponse(text) };
  }

  async _openaiReply(provider) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model:      'gpt-4o-mini',
        max_tokens: 512,
        messages:   [{ role: 'system', content: SPARK_SYSTEM }, ...this._history],
        tools:      [{ type: 'function', function: EMIT_TILES_TOOL }],
      }),
    });

    if (!resp.ok) throw new Error(`OpenAI HTTP ${resp.status}`);
    const data = await resp.json();
    const msg = data.choices?.[0]?.message;

    const toolCall = msg?.tool_calls?.[0];
    if (toolCall && toolCall.function?.name === 'emit_tiles') {
      const toolUse = {
        id: toolCall.id,
        type: 'tool_use',
        name: 'emit_tiles',
        input: JSON.parse(toolCall.function.arguments),
      };
      return this._handleToolUse(toolUse, {
        content: [
          { type: 'text', text: msg.content ?? '' },
          toolUse,
        ],
      });
    }

    const text = msg?.content ?? '...';
    this._history.push({ role: 'assistant', content: [{ type: 'text', text }] });
    return { kind: 'chat', text: filterSparkResponse(text) };
  }

  async _deepseekReply(provider) {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model:      'deepseek-chat',
        max_tokens: 512,
        messages:   [{ role: 'system', content: SPARK_SYSTEM }, ...this._history],
        tools:      [{ type: 'function', function: EMIT_TILES_TOOL }],
      }),
    });

    if (!resp.ok) throw new Error(`DeepSeek HTTP ${resp.status}`);
    const data = await resp.json();
    const msg = data.choices?.[0]?.message;

    const toolCall = msg?.tool_calls?.[0];
    if (toolCall && toolCall.function?.name === 'emit_tiles') {
      const toolUse = {
        id: toolCall.id,
        type: 'tool_use',
        name: 'emit_tiles',
        input: JSON.parse(toolCall.function.arguments),
      };
      return this._handleToolUse(toolUse, {
        content: [
          { type: 'text', text: msg.content ?? '' },
          toolUse,
        ],
      });
    }

    const text = msg?.content ?? '...';
    this._history.push({ role: 'assistant', content: [{ type: 'text', text }] });
    return { kind: 'chat', text: filterSparkResponse(text) };
  }

  async _zaiReply(provider) {
    // Z.AI uses OpenAI-compatible API
    const resp = await fetch('https://api.z.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model:      'z-ai-chat',
        max_tokens: 512,
        messages:   [{ role: 'system', content: SPARK_SYSTEM }, ...this._history],
        tools:      [{ type: 'function', function: EMIT_TILES_TOOL }],
      }),
    });

    if (!resp.ok) throw new Error(`Z.AI HTTP ${resp.status}`);
    const data = await resp.json();
    const msg = data.choices?.[0]?.message;

    const toolCall = msg?.tool_calls?.[0];
    if (toolCall && toolCall.function?.name === 'emit_tiles') {
      const toolUse = {
        id: toolCall.id,
        type: 'tool_use',
        name: 'emit_tiles',
        input: JSON.parse(toolCall.function.arguments),
      };
      return this._handleToolUse(toolUse, {
        content: [
          { type: 'text', text: msg.content ?? '' },
          toolUse,
        ],
      });
    }

    const text = msg?.content ?? '...';
    this._history.push({ role: 'assistant', content: [{ type: 'text', text }] });
    return { kind: 'chat', text: filterSparkResponse(text) };
  }

  async _deepinfraReply(provider) {
    const resp = await fetch('https://api.deepinfra.com/v1/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model:      'mistralai/Mixtral-8x22B',
        max_tokens: 512,
        messages:   [{ role: 'system', content: SPARK_SYSTEM }, ...this._history],
        tools:      [{ type: 'function', function: EMIT_TILES_TOOL }],
      }),
    });

    if (!resp.ok) throw new Error(`DeepInfra HTTP ${resp.status}`);
    const data = await resp.json();
    const msg = data.choices?.[0]?.message;

    const toolCall = msg?.tool_calls?.[0];
    if (toolCall && toolCall.function?.name === 'emit_tiles') {
      const toolUse = {
        id: toolCall.id,
        type: 'tool_use',
        name: 'emit_tiles',
        input: JSON.parse(toolCall.function.arguments),
      };
      return this._handleToolUse(toolUse, {
        content: [
          { type: 'text', text: msg.content ?? '' },
          toolUse,
        ],
      });
    }

    const text = msg?.content ?? '...';
    this._history.push({ role: 'assistant', content: [{ type: 'text', text }] });
    return { kind: 'chat', text: filterSparkResponse(text) };
  }

  async _workersAiReply(provider) {
    // Workers AI requires CF account — always use gateway if configured
    throw new Error('Workers AI requires Cloudflare gateway');
  }

  async _handleToolUse(toolUse, assistantMsg) {
    this._history.push({ role: 'assistant', content: assistantMsg.content });

    const { nodes, name, explanation } = toolUse.input;
    const program = new TileProgram({ name: name ?? 'Spark Brain', brain: 'tin', nodes: nodes ?? [] });
    const result  = compile(program);

    if (!result.ok && !this._retried) {
      // Self-correction: feed errors back once
      this._retried = true;
      const actIds = Object.keys(ACTUATORS).join(', ');
      const senIds = Object.keys(SENSORS).join(', ');
      const errMsg = `Compile errors: ${result.errors.join('; ')}. `
        + `Valid actuators: ${actIds}. Valid sensors: ${senIds}. Please fix and re-emit.`;

      this._history.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: errMsg }],
      });
      return this._claudeReply();
    }

    // Success (or we already retried) — hand to editor
    this._editor.loadProgram(program);

    this._history.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: `Loaded "${name}". Give the kid one excited follow-up line.` }],
    });

    let followText = explanation ?? 'Try it and tweak it!';
    try {
      const followUp = await this._claudeReply();
      if (followUp?.text) followText = followUp.text;
    } catch (_) { /* best-effort */ }

    return { kind: 'program', text: followText, program };
  }

  // ── Offline path ──────────────────────────────────────────────────────────

  _offline(text) {
    const recipe = matchRecipe(text) ?? DEFAULT_RECIPE;
    this._editor.loadProgram(recipe.program);
    return { kind: 'program', text: recipe.reply, program: recipe.program };
  }
}
