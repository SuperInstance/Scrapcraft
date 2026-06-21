/**
 * MultiProviderClient — low-level API client for any LLM provider.
 * Used by SparkGateway to handle the different API formats.
 */
export const PROVIDER_CLIENTS = {
  anthropic: {
    transformRequest: (system, messages, model) => ({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system,
      messages,
    }),
    transformResponse: (raw) => raw.content?.[0]?.text || '',
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }),
  },
  openai: {
    transformRequest: (system, messages, model) => ({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    transformResponse: (raw) => raw.choices?.[0]?.message?.content || '',
    headers: (key) => ({
      'authorization': `Bearer ${key}`,
      'content-type': 'application/json',
    }),
  },
  deepseek: {
    transformRequest: (system, messages, model) => ({
      model: model || 'deepseek-chat',
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    transformResponse: (raw) => raw.choices?.[0]?.message?.content || '',
    headers: (key) => ({
      'authorization': `Bearer ${key}`,
      'content-type': 'application/json',
    }),
  },
  'z.ai': {
    transformRequest: (system, messages, model) => ({
      model: model || 'z-ai-chat',
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    transformResponse: (raw) => raw.choices?.[0]?.message?.content || '',
    headers: (key) => ({
      'authorization': `Bearer ${key}`,
      'content-type': 'application/json',
    }),
  },
  deepinfra: {
    transformRequest: (system, messages, model) => ({
      model: model || 'mistralai/Mixtral-8x22B-Instruct-v0.1',
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    transformResponse: (raw) => raw.choices?.[0]?.message?.content || '',
    headers: (key) => ({
      'authorization': `Bearer ${key}`,
      'content-type': 'application/json',
    }),
  },
  together: {
    transformRequest: (system, messages, model) => ({
      model: model || 'meta-llama/Llama-3.3-70B-Instruct',
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    transformResponse: (raw) => raw.choices?.[0]?.message?.content || '',
    headers: (key) => ({
      'authorization': `Bearer ${key}`,
      'content-type': 'application/json',
    }),
  },
};
