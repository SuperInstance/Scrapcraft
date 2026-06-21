/**
 * index.js — Scrapcraft Cloudflare Worker entry point.
 *
 * Routes all incoming requests to the appropriate handler:
 *   /api/v1/*               → Game API (D1-backed)
 *   /api/v1/superinstance/*  → SuperInstance platform bridge
 *   /api/v1/asset/*          → Asset generation & retrieval
 *   /api/v1/vectorize/*      → Semantic search endpoints
 *   /api/v1/seed             → Database seeding
 *
 * Exports:
 *   default (fetch)  — Worker fetch handler
 *   BotRace          — Durable Object for multiplayer racing
 *   queue            — Queues consumer
 */

import handleGameApi, { ensureTables } from './game-api.js';
import { handleSuperInstance, handleVectorizeProxy } from './superinstance.js';
import { handleGenerateTexture, handleGenerateIcon, handleGetAsset } from './asset-gen.js';
import { handleSeed } from './seed-data.js';
import { BotRace } from './durable-bot-race.js';
import queueConsumer from './task-queue.js';

// ── Export Durable Object class ────────────────────────────────────
export { BotRace };

// ── Export Queues consumer ─────────────────────────────────────────
export { queueConsumer as queue };

// ── Main request handler ───────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    // ── CORS headers (allow the game frontend to make cross-origin requests) ─
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization',
    };

    // Handle preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: { ...corsHeaders, 'access-control-max-age': '86400' },
      });
    }

    // ── Route table ─────────────────────────────────────────────────────────
    let response;

    try {
      if (url.pathname.startsWith('/api/v1/superinstance/')) {
        response = await handleSuperInstance(request, env);
      } else if (url.pathname.startsWith('/api/v1/vectorize/')) {
        response = await handleVectorizeProxy(request, env);
      } else if (url.pathname.startsWith('/api/v1/asset/generate')) {
        if (url.pathname.endsWith('generate-texture')) {
          response = await handleGenerateTexture(request, env);
        } else if (url.pathname.endsWith('generate-icon')) {
          response = await handleGenerateIcon(request, env);
        } else {
          response = new Response(JSON.stringify({ error: 'Unknown asset action' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        }
      } else if (url.pathname.startsWith('/api/v1/asset/')) {
        response = await handleGetAsset(request, env, url);
      } else if (url.pathname === '/api/v1/seed' && method === 'POST') {
        response = await handleSeed(request, env);
      } else if (url.pathname.startsWith('/api/v1/')) {
        // Durable Object routing for BotRace
        if (url.pathname.startsWith('/api/v1/race/')) {
          // Extract race lobby ID from path: /api/v1/race/:lobbyId/...
          const raceMatch = url.pathname.match(/^\/api\/v1\/race\/([^/]+)/);
          if (raceMatch) {
            const lobbyId = raceMatch[1];
            const doId = env.BOT_RACE.idFromName(`race-${lobbyId}`);
            const stub = env.BOT_RACE.get(doId);
            response = await stub.fetch(request);
          } else {
            response = new Response(JSON.stringify({ error: 'Invalid race path' }), {
              status: 400,
              headers: { 'content-type': 'application/json' },
            });
          }
        } else {
          response = await handleGameApi(request, env, ctx);
        }
      } else {
        // ── Health check / info endpoint ──────────────────────────────────────
        response = new Response(
          JSON.stringify({
            name: 'Scrapcraft API',
            version: env.GAME_VERSION || '1.0.0',
            environment: env.ENVIRONMENT || 'development',
            endpoints: {
              gameApi: 'GET/POST /api/v1/*',
              superInstance: '/api/v1/superinstance/*',
              assetGen: '/api/v1/asset/*',
              vectorize: '/api/v1/vectorize/*',
              racing: '/api/v1/race/:lobbyId/*',
              seed: 'POST /api/v1/seed',
            },
          }),
          { headers: { 'content-type': 'application/json' } }
        );
      }
    } catch (err) {
      response = new Response(
        JSON.stringify({ error: 'Internal server error', detail: err.message }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    // Add CORS headers to every response
    const resp = new Response(response.body, response);
    for (const [key, value] of Object.entries(corsHeaders)) {
      resp.headers.set(key, value);
    }
    return resp;
  },
};
