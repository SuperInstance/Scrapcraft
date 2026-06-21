/**
 * vectorize.js — Embedding + Vectorize search for Scrapcraft.
 *
 * Uses Workers AI text-embeddings (@cf/baai/bge-small-en-v1.5) to vectorize game
 * content, then searches via Cloudflare Vectorize for:
 *   - Recipe discovery ("how do I make a robot arm?")
 *   - Codex semantic search ("what's a generator?")
 *   - Bot program similarity
 *   - SuperInstance: MemoryBank — bots can "remember" places they've been
 *
 * Falls back to a deterministic hash-based embedding when Workers AI is unavailable
 * (e.g. during local dev or when free-tier AI quota is exhausted).
 */

// ── Embedding ─────────────────────────────────────────────────────

const FALLBACK_DIMS = 512;

/**
 * Get a 512-dimension embedding vector for arbitrary text.
 *
 * Preferred path: Workers AI @cf/baai/bge-small-en-v1.5
 * Fallback: deterministic hash embedding (no external call needed).
 */
export async function getEmbedding(env, text) {
  try {
    const ai = env.AI;
    const result = await ai.run('@cf/baai/bge-small-en-v1.5', { text: [text] });
    return result.data[0];
  } catch (e) {
    // Workers AI unavailable — use deterministic hash embedding (512d)
    return generateFallbackEmbedding(text);
  }
}

/**
 * Deterministic 512-dimension embedding from text hash.
 * Every run produces the same vector for the same input.
 * Vectors are L2-normalised so cosine similarity works correctly.
 */
export function generateFallbackEmbedding(text) {
  const arr = new Array(FALLBACK_DIMS).fill(0);
  for (let i = 0; i < text.length; i++) {
    const idx = (text.charCodeAt(i) * 7 + i * 13) % FALLBACK_DIMS;
    arr[idx] += 0.1;
  }
  // L2 normalise
  const mag = Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
  return arr.map(v => (mag > 0 ? v / mag : 0));
}

// ── Search ────────────────────────────────────────────────────────

/**
 * Semantic recipe search. Embeds the query, searches Vectorize,
 * then fetches full recipe data from D1 using matched IDs.
 */
export async function searchRecipes(env, query, limit = 5) {
  const embedding = await getEmbedding(env, query);
  const results = await env.SCRAPCRAFT_VECTORIZE.query(embedding, {
    topK: limit,
    returnVectors: true,
    returnMetadata: true,
  });

  // Fetch full recipe data from D1
  const ids = results.matches.map(m => m.id);
  if (ids.length === 0) return { recipes: [] };

  const placeholders = ids.map(() => '?').join(',');
  const db = env.SCRAPCRAFT_DB;
  const { results: recipes } = await db
    .prepare(`SELECT * FROM recipes WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all();

  return { recipes: recipes || [], matches: results.matches };
}

/**
 * Semantic codex search. Same pattern — embed query, search Vectorize,
 * fetch from D1.
 */
export async function searchCodex(env, query) {
  const embedding = await getEmbedding(env, query);
  const results = await env.SCRAPCRAFT_VECTORIZE.query(embedding, {
    topK: 5,
    returnVectors: true,
    returnMetadata: true,
  });

  const ids = results.matches.map(m => m.id);
  if (ids.length === 0) return { entries: [] };

  const placeholders = ids.map(() => '?').join(',');
  const db = env.SCRAPCRAFT_DB;
  const { results: entries } = await db
    .prepare(`SELECT id, title, icon, category, difficulty, tags FROM codex WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all();

  return { entries: entries || [], matches: results.matches };
}

// ── Upsert ────────────────────────────────────────────────────────

/**
 * Insert or update a single recipe embedding in the Vectorize index.
 * Call this whenever a recipe is created or edited.
 */
export async function upsertRecipeEmbedding(env, recipeId, text) {
  const embedding = await getEmbedding(env, text);
  await env.SCRAPCRAFT_VECTORIZE.upsert([{ id: recipeId, values: embedding }]);
}

/**
 * Insert or update a single codex embedding.
 */
export async function upsertCodexEmbedding(env, codexId, text) {
  const embedding = await getEmbedding(env, text);
  await env.SCRAPCRAFT_VECTORIZE.upsert([{ id: codexId, values: embedding }]);
}

/**
 * Batch-insert many recipe/codex embeddings at once.
 */
export async function batchUpsertEmbeddings(env, items) {
  const vectors = await Promise.all(
    items.map(async (item) => ({
      id: item.id,
      values: await getEmbedding(env, item.text),
    }))
  );
  await env.SCRAPCRAFT_VECTORIZE.upsert(vectors);
}

// ── Bot program similarity ────────────────────────────────────────

/**
 * Find bot programs similar to a given program description.
 * Uses semantic search on the program description + node structure.
 */
export async function findSimilarPrograms(env, programJson, limit = 5) {
  const description = extractProgramDescription(programJson);
  return searchRecipes(env, description, limit);
}

function extractProgramDescription(programJson) {
  try {
    const prog = typeof programJson === 'string' ? JSON.parse(programJson) : programJson;
    const nodes = prog.nodes || [];
    return nodes
      .map(n => n.label || n.type || '')
      .filter(Boolean)
      .join(' then ');
  } catch {
    return String(programJson);
  }
}

// ── HTTP handlers (mounted by the main router) ────────────────────

/**
 * POST /api/v1/vectorize/search
 * Body: { query, type: "recipes"|"codex", limit }
 */
export async function handleVectorizeSearch(request, env) {
  try {
    const body = await request.json();
    const { query, type = 'recipes', limit = 5 } = body;

    if (!query) {
      return new Response(JSON.stringify({ error: 'query is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const results =
      type === 'codex'
        ? await searchCodex(env, query)
        : await searchRecipes(env, query, limit);

    return new Response(JSON.stringify(results), {
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
 * POST /api/v1/vectorize/index-all
 * Batch re-index all recipes and codex entries into Vectorize.
 */
export async function handleVectorizeIndexAll(request, env) {
  try {
    const db = env.SCRAPCRAFT_DB;

    // Fetch all recipes from D1
    const { results: recipes } = await db.prepare('SELECT * FROM recipes').all();
    const { results: codex } = await db.prepare('SELECT * FROM codex').all();

    const toIndex = [
      ...(recipes || []).map(r => ({ id: `recipe:${r.id}`, text: `${r.title} ${r.description} ${r.ingredients || ''}` })),
      ...(codex || []).map(c => ({ id: `codex:${c.id}`, text: `${c.title} ${c.text}` })),
    ];

    await batchUpsertEmbeddings(env, toIndex);

    return new Response(
      JSON.stringify({ ok: true, indexed: toIndex.length }),
      { headers: { 'content-type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
