/**
 * SparkGateway — routes AI requests through the user's configured provider.
 *
 * Reads onboarding config from localStorage and:
 * 1. If a Cloudflare Worker URL is configured → routes through it
 * 2. If a direct API key is stored → calls the provider API directly
 * 3. Otherwise → returns null (offline fallback)
 */

export class SparkGateway {
  constructor() {
    this._config = this._loadConfig();
    this._cache = new Map();
  }

  _loadConfig() {
    try {
      return JSON.parse(localStorage.getItem('scrapcraft_onboarding_config') || '{}');
    } catch {
      return {};
    }
  }

  /** Settings → Advanced changed the config: re-read it live (no restart). */
  refresh() {
    this._config = this._loadConfig();
  }

  /** Returns the active provider config, or null if offline */
  getActiveProvider() {
    const config = this._config;

    // If Cloudflare gateway is configured, use that
    if (config.cfWorkerUrl) {
      return {
        type: 'gateway',
        url: config.cfWorkerUrl.replace(/\/$/, ''),
        provider: config.aiProvider || 'workers_ai',
        apiKey: config.apiKey,
      };
    }

    // If direct API key + provider is configured
    if (config.apiKey && config.aiProvider && config.aiProvider !== 'offline') {
      const PROVIDER_API = {
        anthropic: { baseUrl: 'https://api.anthropic.com/v1/messages' },
        openai: { baseUrl: 'https://api.openai.com/v1/chat/completions' },
        deepseek: { baseUrl: 'https://api.deepseek.com/v1/chat/completions' },
        'z.ai': { baseUrl: 'https://api.z.ai/v1/chat/completions' },
        deepinfra: { baseUrl: 'https://api.deepinfra.com/v1/openai/chat/completions' },
        together: { baseUrl: 'https://api.together.xyz/v1/chat/completions' },
      };
      const providerConfig = PROVIDER_API[config.aiProvider];
      if (providerConfig) {
        return {
          type: 'direct',
          ...providerConfig,
          apiKey: config.apiKey,
          provider: config.aiProvider,
        };
      }
    }

    // Check for env var fallback
    const envKey = import.meta.env?.VITE_ANTHROPIC_API_KEY ?? '';
    if (envKey) {
      return {
        type: 'direct',
        baseUrl: 'https://api.anthropic.com/v1/messages',
        apiKey: envKey,
        provider: 'anthropic',
      };
    }

    return null; // offline mode
  }

  /**
   * Send a prompt to the configured AI provider.
   * @param {string} systemPrompt - System prompt for the AI
   * @param {string} userMessage - User's message
   * @param {object} options - { model, temperature, maxTokens }
   * @returns {Promise<string>} AI response text
   */
  async ask(systemPrompt, userMessage, options = {}) {
    const provider = this.getActiveProvider();
    if (!provider) return null; // caller should fall back to offline

    const cacheKey = `${provider.provider}:${systemPrompt.slice(0, 50)}:${userMessage.slice(0, 50)}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    let result;

    if (provider.type === 'gateway') {
      // Route through Cloudflare Worker
      result = await this._askViaGateway(provider, systemPrompt, userMessage, options);
    } else {
      // Call provider API directly
      result = await this._askDirect(provider, systemPrompt, userMessage, options);
    }

    // Cache for 30 seconds to avoid redundant calls
    if (result) {
      this._cache.set(cacheKey, result);
      setTimeout(() => this._cache.delete(cacheKey), 30000);
    }

    return result;
  }

  async _askViaGateway(provider, systemPrompt, userMessage, options) {
    try {
      const response = await fetch(`${provider.url}/api/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: provider.provider,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
          model: options.model || undefined,
          temperature: options.temperature ?? 0.7,
          maxTokens: options.maxTokens || 1024,
          apiKey: provider.apiKey, // forwarded for the gateway
        }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.content || null;
    } catch (e) {
      console.warn('[SparkGateway] Gateway call failed:', e);
      return null;
    }
  }

  async _askDirect(provider, systemPrompt, userMessage, options) {
    try {
      const models = {
        anthropic: options.model || 'claude-sonnet-4-20250514',
        openai: options.model || 'gpt-4o-mini',
        deepseek: options.model || 'deepseek-chat',
        'z.ai': options.model || 'z-ai-chat',
        deepinfra: options.model || 'mistralai/Mixtral-8x22B-Instruct-v0.1',
        together: options.model || 'meta-llama/Llama-3.3-70B-Instruct',
      };
      const model = models[provider.provider] || options.model;

      if (provider.provider === 'anthropic') {
        const resp = await fetch(provider.baseUrl, {
          method: 'POST',
          headers: {
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model,
            max_tokens: options.maxTokens || 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
          }),
        });
        const data = await resp.json();
        return data.content?.[0]?.text || null;
      }

      // OpenAI-compatible providers (OpenAI, DeepSeek, Z.AI, DeepInfra, Together)
      const resp = await fetch(provider.baseUrl, {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${provider.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens || 1024,
        }),
      });
      const data = await resp.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (e) {
      console.warn('[SparkGateway] API call failed:', e);
      return null;
    }
  }

  /** Test if the configured provider is working */
  async ping() {
    const response = await this.ask('Respond with just OK', 'ping');
    return response !== null;
  }
}

// Singleton export
export const sparkGateway = new SparkGateway();
