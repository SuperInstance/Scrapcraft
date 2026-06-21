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

const SPARK_SYSTEM = `You are SPARK, a tiny floating robot and the player's build buddy in
the scrapyard game SCRAPCRAFT. The player is a clever middle-schooler (10-14).
Your job: help them program their ScrapBot by building TILES.

Rules:
- You are endlessly curious and think every idea is genuinely cool.
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
Never break character. Never say you are an AI.`;

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
            type:     { enum: ['action', 'wait', 'repeat', 'forever', 'if', 'if_else', 'macro'] },
            prim:     { enum: ACTUATOR_IDS,    description: 'actuator id (action nodes only)' },
            params:   { type: 'object',        description: 'param key/value map for the actuator' },
            seconds:  { type: 'number', minimum: 0.05, maximum: 30 },
            count:    { type: 'integer', minimum: 1, maximum: 100 },
            kind:     { enum: ['turn_angle', 'drive_distance'] },
            cond:     { $ref: '#/$defs/cond' },
            body:     { type: 'array', items: { $ref: '#/$defs/node' } },
            elseBody: { type: 'array', items: { $ref: '#/$defs/node' } },
          },
        },
        cond: {
          type: 'object',
          required: ['sensor', 'cmp', 'value'],
          properties: {
            sensor: { enum: SENSOR_IDS },
            cmp:    { enum: ['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'is'] },
            value:  { description: '0..1 for analog sensors; true/false for digital sensors' },
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
    this._editor  = editor;      // TileEditor — loadProgram() called on success
    this._history = [];
    this._key     = import.meta.env?.VITE_ANTHROPIC_API_KEY ?? '';
    this._retried = false;       // prevent infinite self-correction loops
    this._provider = null;       // resolved from onboarding config
  }

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
    this._history.push({ role: 'user', content: userText });
    this._retried = false;

    // Step 1: Try the multi-provider gateway first (reads onboarding config)
    const gatewayResponse = await sparkGateway.ask(SPARK_SYSTEM, userText);
    if (gatewayResponse) {
      this._history.push({ role: 'assistant', content: gatewayResponse });
      return { kind: 'chat', text: gatewayResponse };
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
    return { kind: 'chat', text };
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
    return { kind: 'chat', text };
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
    return { kind: 'chat', text };
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
    return { kind: 'chat', text };
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
    return { kind: 'chat', text };
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
    return { kind: 'chat', text };
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
