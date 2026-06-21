// Multi-provider AI Gateway for Scrapcraft
// Supports: Anthropic, OpenAI, DeepSeek, Z.AI, DeepInfra, Together, Workers AI

const PROVIDER_CONFIGS = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1/messages',
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }),
    transformRequest: (messages, model) => ({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages,
    }),
    transformResponse: (raw) => raw.content?.[0]?.text || '',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    headers: (key) => ({
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    }),
    transformRequest: (messages, model) => ({
      model: model || 'gpt-4o',
      messages,
    }),
    transformResponse: (raw) => raw.choices?.[0]?.message?.content || '',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    headers: (key) => ({
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    }),
    transformRequest: (messages, model) => ({
      model: model || 'deepseek-chat',
      messages,
    }),
    transformResponse: (raw) => raw.choices?.[0]?.message?.content || '',
  },
  'z.ai': {
    baseUrl: 'https://api.z.ai/v1/chat/completions',
    headers: (key) => ({
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    }),
    transformRequest: (messages, model) => ({
      model: model || 'z-ai-chat',
      messages,
    }),
    transformResponse: (raw) => raw.choices?.[0]?.message?.content || '',
  },
  deepinfra: {
    baseUrl: 'https://api.deepinfra.com/v1/openai/chat/completions',
    headers: (key) => ({
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    }),
    transformRequest: (messages, model) => ({
      model: model || 'mistralai/Mixtral-8x22B-Instruct-v0.1',
      messages,
    }),
    transformResponse: (raw) => raw.choices?.[0]?.message?.content || '',
  },
  together: {
    baseUrl: 'https://api.together.xyz/v1/chat/completions',
    headers: (key) => ({
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    }),
    transformRequest: (messages, model) => ({
      model: model || 'mistralai/Mixtral-8x22B-Instruct-v0.1',
      messages,
    }),
    transformResponse: (raw) => raw.choices?.[0]?.message?.content || '',
  },
  workers_ai: {
    baseUrl: '', // uses Workers AI binding
    transformRequest: (messages, model) => ({
      model: model || '@cf/meta/llama-3.1-8b-instruct',
      messages,
    }),
  },
};

// Simple in-memory rate limiter per provider
const rateLimitBuckets = new Map();

function checkRateLimit(provider, maxRequests = 30, windowMs = 60000) {
  const now = Date.now();
  const key = provider;

  if (!rateLimitBuckets.has(key)) {
    rateLimitBuckets.set(key, { count: 1, windowStart: now });
    return true;
  }

  const bucket = rateLimitBuckets.get(key);
  if (now - bucket.windowStart > windowMs) {
    // Reset window
    bucket.count = 1;
    bucket.windowStart = now;
    return true;
  }

  if (bucket.count >= maxRequests) {
    const retryAfter = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  bucket.count++;
  return true;
}

/**
 * Resolve the secret key from env for a given provider id.
 * Handles dots/aliases (e.g. "z.ai" -> "ZAI_KEY").
 */
function resolveSecretKey(env, providerId) {
  // Direct lookup first: e.g. ANTHROPIC_KEY, OPENAI_KEY
  const upper = providerId.replace(/[.\-]/g, '_').toUpperCase();
  const directKey = `${upper}_KEY`;
  if (env[directKey]) return env[directKey];

  // Fallback: check for alternate name
  const aliasMap = {
    'z.ai': 'ZAI_KEY',
  };
  if (aliasMap[providerId]) {
    return env[aliasMap[providerId]];
  }

  return null;
}

/**
 * Route a chat completion to the specified provider.
 *
 * @param {object} env - Workers env bindings
 * @param {object} body - Request body { provider, messages, model }
 * @returns {Promise<Response>}
 */
export async function routeChat(env, body) {
  const { provider, messages, model } = body;

  if (!provider) {
    return new Response(JSON.stringify({ error: 'Missing provider' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing or empty messages array' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    return new Response(
      JSON.stringify({
        error: `Unknown provider: ${provider}. Available: ${Object.keys(PROVIDER_CONFIGS).join(', ')}`,
      }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  // Rate limiting
  const rateCheck = checkRateLimit(provider);
  if (typeof rateCheck === 'object' && !rateCheck.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: rateCheck.retryAfter,
      }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': String(rateCheck.retryAfter),
        },
      }
    );
  }

  try {
    // Workers AI uses the built-in binding
    if (provider === 'workers_ai') {
      const ai = env.AI;
      if (!ai) {
        return new Response(
          JSON.stringify({ error: 'Workers AI binding (AI) is not configured' }),
          { status: 500, headers: { 'content-type': 'application/json' } }
        );
      }

      const requestConfig = config.transformRequest(messages, model);
      const result = await ai.run(requestConfig.model, {
        messages: requestConfig.messages,
      });

      const content = result?.response || '';
      return new Response(JSON.stringify({ content }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // External provider
    const secretKey = resolveSecretKey(env, provider);
    if (!secretKey) {
      return new Response(
        JSON.stringify({
          error: `Missing API key for provider "${provider}". Set ${provider.replace(/[.\-]/g, '_').toUpperCase()}_KEY secret.`,
        }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }

    const requestConfig = config.transformRequest(messages, model);

    const response = await fetch(config.baseUrl, {
      method: 'POST',
      headers: config.headers(secretKey),
      body: JSON.stringify(requestConfig),
    });

    if (!response.ok) {
      let errorDetail;
      try {
        errorDetail = await response.json();
      } catch {
        errorDetail = await response.text();
      }

      return new Response(
        JSON.stringify({
          error: `Provider returned ${response.status}`,
          detail: errorDetail,
        }),
        {
          status: response.status,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    const raw = await response.json();
    const content = config.transformResponse(raw);

    return new Response(JSON.stringify({ content, model: requestConfig.model }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Gateway error',
        message: err.message || 'Unknown error',
      }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }
}

/**
 * Route a text generation request (non-chat).
 * Uses the chat endpoint internally with a system/user message structure.
 *
 * @param {object} env - Workers env bindings
 * @param {object} body - Request body { provider, prompt, model }
 * @returns {Promise<Response>}
 */
export async function routeGenerate(env, body) {
  const { provider, prompt, model, system } = body;

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Missing prompt' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const messages = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content: prompt });

  return routeChat(env, { provider, messages, model });
}

/**
 * List all configured providers with metadata.
 */
export function listProviders() {
  const PROVIDER_META = {
    anthropic: { name: 'Anthropic Claude', icon: '🤖', tier: 'premium' },
    openai: { name: 'OpenAI GPT', icon: '⚡', tier: 'premium' },
    deepseek: { name: 'DeepSeek', icon: '🧠', tier: 'budget' },
    'z.ai': { name: 'Z.AI', icon: '⚡', tier: 'budget' },
    deepinfra: { name: 'DeepInfra', icon: '☁️', tier: 'budget' },
    together: { name: 'Together AI', icon: '🔮', tier: 'budget' },
    workers_ai: { name: 'Workers AI (Cloudflare)', icon: '🌤️', tier: 'free' },
  };

  return Object.entries(PROVIDER_CONFIGS).map(([id, config]) => {
    const meta = PROVIDER_META[id] || { name: id, icon: '🔌', tier: 'unknown' };
    const transformed = config.transformRequest([{ role: 'user', content: '' }]);
    return {
      id,
      name: meta.name,
      icon: meta.icon,
      tier: meta.tier,
      requiresKey: id !== 'workers_ai',
      defaultModel: transformed.model,
      models: getModelsForProvider(id),
    };
  });
}

function getModelsForProvider(id) {
  const modelMap = {
    anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-3-5', 'claude-opus-4'],
    openai: ['gpt-4o', 'gpt-4o-mini'],
    deepseek: ['deepseek-chat'],
    'z.ai': ['z-ai-chat'],
    deepinfra: ['mistralai/Mixtral-8x22B-Instruct-v0.1', 'meta-llama/Llama-3.3-70B-Instruct'],
    together: ['mistralai/Mixtral-8x22B-Instruct-v0.1', 'meta-llama/Llama-3.3-70B-Instruct'],
    workers_ai: ['@cf/meta/llama-3.1-8b-instruct', '@cf/mistral/mistral-7b-instruct-v0.1'],
  };
  return modelMap[id] || [];
}

/**
 * Validate whether a provider has a key configured in the environment.
 */
export function isProviderConfigured(env, providerId) {
  if (providerId === 'workers_ai') return !!env.AI;
  const key = resolveSecretKey(env, providerId);
  return !!key;
}
