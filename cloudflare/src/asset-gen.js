/**
 * asset-gen.js — Workers AI + R2 asset generation for Scrapcraft.
 *
 * Asset Studio: generate custom block textures, item icons, and robot
 * skin patterns using Workers AI (Stable Diffusion XL). Generated assets
 * are cached in R2 for fast retrieval.
 *
 * SuperInstance feature: requires paid Cloudflare Workers AI + R2.
 * Free tier falls back to procedurally generated placeholder assets.
 *
 * Endpoints (mounted via superinstance.js router):
 *   POST /api/v1/asset/generate-texture  → Generate a block/item texture
 *   POST /api/v1/asset/generate-icon     → Generate a small item icon
 *   POST /api/v1/asset/generate-skin     → Generate a robot skin pattern
 *   GET  /api/v1/asset/:key              → Retrieve a generated asset
 */

// ── Generation ─────────────────────────────────────────────────────

/**
 * Generate a custom block or item texture from a prompt.
 * Attempts Workers AI first; falls back to a SVG procedural placeholder.
 *
 * @param {object} env  - Worker env with AI + SCRAPCRAFT_ASSETS bindings
 * @param {string} prompt - User-provided description
 * @param {'voxel'|'pixel'|'natural'} style - Artistic style hint
 * @returns {{ url: string, key: string, fallback: boolean }}
 */
export async function generateTexture(env, prompt, style = 'voxel') {
  const styleSuffix = style === 'pixel'
    ? 'pixel art, 8-bit, 16x16 grid, game sprite'
    : style === 'natural'
      ? 'realistic texture, detailed, 64x64'
      : 'voxel art style, 16x16 pixel, game texture, low poly, top-down view, industrial scrapyard aesthetic';

  const fullPrompt = `${prompt}, ${styleSuffix}`;
  const key = `textures/${Date.now()}-${slugify(prompt.slice(0, 30))}.png`;

  try {
    if (env.AI) {
      const ai = env.AI;
      const result = await ai.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
        prompt: fullPrompt,
        height: 64,
        width: 64,
      });

      // result.image is an ArrayBuffer or ReadableStream
      if (result.image) {
        await env.SCRAPCRAFT_ASSETS.put(key, result.image, {
          httpMetadata: { contentType: 'image/png' },
          customMetadata: { prompt, style, generated: new Date().toISOString() },
        });
        return { url: `/api/v1/asset/${key}`, key, fallback: false };
      }
    }
  } catch (err) {
    // Workers AI unavailable — fall through to procedural generation
    console.warn('AI texture generation failed, using procedural fallback:', err.message);
  }

  // Fallback: generate a procedural SVG placeholder
  const svg = generateProceduralTexture(prompt, style);
  await env.SCRAPCRAFT_ASSETS.put(key, svg, {
    httpMetadata: { contentType: 'image/svg+xml' },
    customMetadata: { prompt, style, fallback: 'true', generated: new Date().toISOString() },
  });
  return { url: `/api/v1/asset/${key}`, key, fallback: true };
}

/**
 * Generate a small item icon (32x32) using AI or procedural fallback.
 */
export async function generateIcon(env, prompt) {
  const fullPrompt = `${prompt}, game item icon, 32x32 pixel art, inventory sprite, transparent background`;
  const key = `icons/${Date.now()}-${slugify(prompt.slice(0, 30))}.png`;

  try {
    if (env.AI) {
      const ai = env.AI;
      const result = await ai.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
        prompt: fullPrompt,
        height: 32,
        width: 32,
      });

      if (result.image) {
        await env.SCRAPCRAFT_ASSETS.put(key, result.image, {
          httpMetadata: { contentType: 'image/png' },
        });
        return { url: `/api/v1/asset/${key}`, key, fallback: false };
      }
    }
  } catch (err) {
    console.warn('AI icon generation failed:', err.message);
  }

  // Procedural fallback
  const svg = generateProceduralIcon(prompt);
  const svgKey = key.replace('.png', '.svg');
  await env.SCRAPCRAFT_ASSETS.put(svgKey, svg, {
    httpMetadata: { contentType: 'image/svg+xml' },
  });
  return { url: `/api/v1/asset/${svgKey}`, key: svgKey, fallback: true };
}

/**
 * Generate a robot skin pattern.
 */
export async function generateSkin(env, prompt) {
  return generateTexture(env, `robot skin pattern: ${prompt}`, 'voxel');
}

// ── Retrieval ──────────────────────────────────────────────────────

/**
 * Retrieve a generated asset from R2.
 * Returns the object body, or null if not found.
 */
export async function getAsset(env, key) {
  try {
    const obj = await env.SCRAPCRAFT_ASSETS.get(key);
    if (!obj) return null;
    return obj;
  } catch {
    return null;
  }
}

// ── Procedural fallbacks ──────────────────────────────────────────

/**
 * Generate a deterministic SVG placeholder texture.
 * Creates a simple coloured grid pattern based on the prompt hash.
 */
function generateProceduralTexture(prompt, style = 'voxel') {
  const hash = simpleHash(prompt);
  const r = (hash & 0xFF0000) >> 16;
  const g = (hash & 0x00FF00) >> 8;
  const b = hash & 0x0000FF;

  const gridSize = style === 'pixel' ? 4 : 8;
  const cellSize = 64 / gridSize;
  let rects = '';

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const offset = ((row * gridSize + col) * 37) % 256;
      const cr = Math.min(255, r + offset - 128);
      const cg = Math.min(255, g + offset - 128);
      const cb = Math.min(255, b + offset - 128);
      rects += `<rect x="${col * cellSize}" y="${row * cellSize}" width="${cellSize}" height="${cellSize}" fill="rgb(${cr},${cg},${cb})" />`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect width="64" height="64" fill="rgb(${r},${g},${b})" />
    ${rects}
  </svg>`;
}

/**
 * Generate a simple icon SVG from a prompt.
 */
function generateProceduralIcon(prompt) {
  const hash = simpleHash(prompt);
  const r = (hash & 0xFF0000) >> 16;
  const g = (hash & 0x00FF00) >> 8;
  const b = hash & 0x0000FF;

  const shapes = ['circle', 'rect', 'polygon', 'path'];
  const shape = shapes[hash % shapes.length];

  let inner = '';
  switch (shape) {
    case 'circle':
      inner = `<circle cx="16" cy="16" r="12" fill="rgb(${r},${g},${b})" stroke="#fff" stroke-width="2"/>`;
      break;
    case 'rect':
      inner = `<rect x="6" y="6" width="20" height="20" rx="4" fill="rgb(${r},${g},${b})" stroke="#fff" stroke-width="2"/>`;
      break;
    case 'polygon':
      inner = `<polygon points="16,4 28,24 4,24" fill="rgb(${r},${g},${b})" stroke="#fff" stroke-width="2"/>`;
      break;
    case 'path':
      inner = `<path d="M8,24 L16,8 L24,24 Z" fill="rgb(${r},${g},${b})" stroke="#fff" stroke-width="2"/>`;
      break;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="#1a1a2e" rx="4"/>
    ${inner}
  </svg>`;
}

// ── HTTP handlers ─────────────────────────────────────────────────

/**
 * POST /api/v1/asset/generate-texture
 * Body: { prompt, style }
 */
export async function handleGenerateTexture(request, env) {
  try {
    const body = await request.json();
    const { prompt, style = 'voxel' } = body;

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const result = await generateTexture(env, prompt, style);
    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

/**
 * POST /api/v1/asset/generate-icon
 * Body: { prompt }
 */
export async function handleGenerateIcon(request, env) {
  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const result = await generateIcon(env, prompt);
    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

/**
 * GET /api/v1/asset/:key
 * Retrieve a previously generated asset.
 */
export async function handleGetAsset(request, env, url) {
  const key = url.pathname.replace('/api/v1/asset/', '');
  if (!key) {
    return new Response(JSON.stringify({ error: 'Asset key required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const obj = await getAsset(env, key);
  if (!obj) {
    return new Response(JSON.stringify({ error: 'Asset not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  const headers = new Headers();
  headers.set('content-type', obj.httpMetadata?.contentType || 'image/png');
  headers.set('cache-control', 'public, max-age=86400');
  obj.writeHttpMetadata(headers);

  return new Response(obj.body, { headers });
}

// ── Utilities ─────────────────────────────────────────────────────

function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}
