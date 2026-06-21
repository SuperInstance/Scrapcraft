/**
 * superinstance.js — Scrapcraft's Cloudflare platform bridge.
 *
 * Connects Scrapcraft to the full Cloudflare ecosystem and provides
 * feature-negotiation so the frontend knows what capabilities are available.
 *
 * Harnesses:
 *   D1              — Persistent cloud saves across devices
 *   Vectorize       — Semantic recipe/codex/program search + bot memory bank
 *   R2              — Custom texture and icon storage
 *   Workers AI      — Free-tier LLM and image generation
 *   Durable Objects — Real-time multiplayer racing
 *   Queues          — Async batch processing
 *   KV              — Session state, rate limiting
 *   AI Gateway      — Multi-provider LLM routing
 *
 * SuperInstance-unlocked features (require paid Cloudflare):
 *   - Vectorize:     Bot memory bank (bots remember routes)
 *   - Durable Objects: Multiplayer racing arena
 *   - Workers AI:    Custom texture generation
 *   - R2:            Unlimited braincode sharing
 *   - Queues:        Automated codex generation
 *
 * Free CF tier features:
 *   - D1 (limited):  Cloud saves
 *   - AI Gateway:    Multi-provider routing
 *   - Workers:       Game API
 *   - KV:            Session state
 */

import { generateTexture, generateIcon, handleGetAsset } from './asset-gen.js';
import { handleVectorizeSearch, handleVectorizeIndexAll, getEmbedding, generateFallbackEmbedding } from './vectorize.js';

// ── Feature catalogue ─────────────────────────────────────────────

const SUPERINSTANCE_FEATURES = {
  cloud_saves: {
    name: '☁️ Cloud Saves',
    tier: 'free',
    description: 'Save your game to the cloud. Play on any device.',
    requiredBindings: ['D1'],
  },
  semantic_search: {
    name: '🔍 Semantic Recipe Search',
    tier: 'paid',
    description: 'Search recipes by what you want to build, not just by name.',
    requiredBindings: ['AI', 'Vectorize'],
  },
  custom_textures: {
    name: '🎨 Custom Texture Generation',
    tier: 'paid',
    description: 'Generate block textures and item icons with AI prompts.',
    requiredBindings: ['AI', 'R2'],
  },
  bot_memory: {
    name: '🧠 Bot Memory Bank',
    tier: 'paid',
    description: 'Your bots remember routes, ores, and waypoints across sessions. Powered by Vectorize.',
    requiredBindings: ['AI', 'Vectorize'],
  },
  multiplayer_racing: {
    name: '🏁 Multiplayer Racing Arena',
    tier: 'paid',
    description: 'Race your bots against other players in real-time.',
    requiredBindings: ['DurableObjects'],
  },
  brain_bazaar: {
    name: '🧬 Brain Bazaar',
    tier: 'paid',
    description: 'Share and download bot programs from the community.',
    requiredBindings: ['D1', 'R2'],
  },
  codex_genius: {
    name: '📚 Codex Genius',
    tier: 'paid',
    description: 'Generate new Codex entries on any engineering topic via Queues + AI.',
    requiredBindings: ['AI', 'Queues'],
  },
};

// ── Capability check ──────────────────────────────────────────────

/**
 * Determine which features are available based on bound resources.
 * Returns an object keyed by feature ID with availability status.
 */
export function getCapabilities(env) {
  const features = {};
  for (const [id, def] of Object.entries(SUPERINSTANCE_FEATURES)) {
    const available = def.requiredBindings.every(b => env[b] !== undefined);
    features[id] = { ...def, available };
  }
  return features;
}

// ── Main request handler ──────────────────────────────────────────

/**
 * Dispatch SuperInstance API requests to the right handler.
 * Mounted at /api/v1/superinstance/*.
 */
export async function handleSuperInstance(request, env) {
  const url = new URL(request.url);

  switch (url.pathname) {
    case '/api/v1/superinstance/capabilities':
      return handleCapabilities(env);

    case '/api/v1/superinstance/memory-bank':
      return handleMemoryBank(request, env);

    case '/api/v1/superinstance/asset-studio':
      return handleAssetStudio(request, env);

    default:
      return new Response(JSON.stringify({ error: 'SuperInstance endpoint not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
  }
}

// ── Capabilities endpoint ─────────────────────────────────────────

/**
 * GET /api/v1/superinstance/capabilities
 * Returns all SuperInstance features with their availability status.
 */
async function handleCapabilities(env) {
  const caps = getCapabilities(env);
  const availableCount = Object.values(caps).filter(c => c.available).length;
  const totalCount = Object.keys(caps).length;

  return new Response(JSON.stringify({
    features: caps,
    summary: {
      available: availableCount,
      total: totalCount,
      allAvailable: availableCount === totalCount,
    },
  }), {
    headers: { 'content-type': 'application/json' },
  });
}

// ── Memory Bank ───────────────────────────────────────────────────

/**
 * POST /api/v1/superinstance/memory-bank
 *
 * Bot Memory Bank — stores and retrieves bot memories as vector embeddings.
 *
 * Request body:
 *   { action: 'remember', botId, memory: { type, description, x, z } }
 *   { action: 'recall',   botId, query: "where did I see copper?" }
 *
 * Powered by Vectorize — each memory is embedded and searchable.
 */
async function handleMemoryBank(request, env) {
  if (!env.SCRAPCRAFT_VECTORIZE || !env.AI) {
    return new Response(JSON.stringify({
      error: 'Memory Bank requires Vectorize + AI bindings',
      available: false,
    }), {
      status: 501,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { action, botId, memory, query } = body;

    switch (action) {
      case 'remember': {
        if (!botId || !memory) {
          return new Response(JSON.stringify({ error: 'botId and memory are required' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        }

        // Build descriptive text for embedding
        const text = `${memory.type || 'memory'}: ${memory.description || ''} at ${memory.x || 0},${memory.z || 0}`;
        const embedding = await getEmbedding(env, text);

        await env.SCRAPCRAFT_VECTORIZE.upsert([{
          id: `${botId}-${Date.now()}`,
          values: embedding,
          metadata: {
            botId,
            type: memory.type || 'general',
            description: memory.description || '',
            x: memory.x || 0,
            y: memory.y || 0,
            z: memory.z || 0,
            timestamp: Date.now(),
          },
        }]);

        return new Response(JSON.stringify({ ok: true, memoryId: `${botId}-${Date.now()}` }), {
          headers: { 'content-type': 'application/json' },
        });
      }

      case 'recall': {
        if (!botId || !query) {
          return new Response(JSON.stringify({ error: 'botId and query are required' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        }

        const embedding = await getEmbedding(env, query);
        const results = await env.SCRAPCRAFT_VECTORIZE.query(embedding, {
          topK: 10,
          filter: { botId },
          returnMetadata: true,
        });

        return new Response(JSON.stringify({
          botId,
          query,
          memories: (results.matches || []).map(m => ({
            id: m.id,
            score: m.score,
            memory: {
              type: m.metadata?.type,
              description: m.metadata?.description,
              x: m.metadata?.x,
              y: m.metadata?.y,
              z: m.metadata?.z,
            },
            timestamp: m.metadata?.timestamp,
          })),
        }), {
          headers: { 'content-type': 'application/json' },
        });
      }

      case 'forget': {
        // Delete old memories for this bot (keep Vectorize index tidy)
        // Note: Vectorize doesn't support delete by metadata filter directly,
        // so this is a placeholder for future implementation.
        return new Response(JSON.stringify({ ok: true, note: 'Memory pruning not yet implemented via Vectorize API' }), {
          headers: { 'content-type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

// ── Asset Studio ──────────────────────────────────────────────────

/**
 * POST /api/v1/superinstance/asset-studio
 *
 * Asset Studio — generate game textures, icons, and robot skins.
 * Delegates to asset-gen.js for the actual generation logic.
 *
 * Request body:
 *   { action: 'generate-texture', prompt, style }
 *   { action: 'generate-icon', prompt }
 *   { action: 'generate-skin', prompt }
 */
async function handleAssetStudio(request, env) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'generate-texture': {
        const result = await generateTexture(env, body.prompt, body.style || 'voxel');
        return new Response(JSON.stringify(result), {
          headers: { 'content-type': 'application/json' },
        });
      }

      case 'generate-icon': {
        const result = await generateIcon(env, body.prompt);
        return new Response(JSON.stringify(result), {
          headers: { 'content-type': 'application/json' },
        });
      }

      case 'generate-skin': {
        const result = await generateTexture(env, `robot skin pattern: ${body.prompt}`, 'voxel');
        return new Response(JSON.stringify(result), {
          headers: { 'content-type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({
          error: `Unknown Asset Studio action: ${action}`,
          validActions: ['generate-texture', 'generate-icon', 'generate-skin'],
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

// ── Vectorize proxy ───────────────────────────────────────────────

/**
 * Route /api/v1/vectorize/* endpoints from the main router to vectorize.js handlers.
 */
export async function handleVectorizeProxy(request, env) {
  const url = new URL(request.url);

  switch (url.pathname) {
    case '/api/v1/vectorize/search':
      return handleVectorizeSearch(request, env);
    case '/api/v1/vectorize/index-all':
      return handleVectorizeIndexAll(request, env);
    default:
      return new Response(JSON.stringify({ error: 'Vectorize endpoint not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
  }
}

// ── Feature-insight helper ────────────────────────────────────────

/**
 * Check whether a single SuperInstance feature is available.
 * Useful for in-game feature gates.
 */
export function isFeatureAvailable(env, featureId) {
  const def = SUPERINSTANCE_FEATURES[featureId];
  if (!def) return false;
  return def.requiredBindings.every(b => env[b] !== undefined);
}

/**
 * Get the display name and description for a feature.
 */
export function getFeatureInfo(featureId) {
  const def = SUPERINSTANCE_FEATURES[featureId];
  if (!def) return null;
  return { id: featureId, ...def };
}

// ── Exports ───────────────────────────────────────────────────────

export { SUPERINSTANCE_FEATURES };
