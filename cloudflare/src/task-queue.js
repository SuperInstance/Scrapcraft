/**
 * task-queue.js — Cloudflare Queues consumer for Scrapcraft async operations.
 *
 * Offloads heavy or non-urgent work to background tasks via Queues,
 * so the main game API stays snappy.
 *
 * Task types:
 *   'embed-recipes'           → Batch embed all recipes into Vectorize
 *   'generate-thumbnail'      → Generate program thumbnail via Workers AI
 *   'analyze-bot-program'     → Analyze a brain program for bugs/optimization
 *   'generate-codex-illustrations' → Create illustrations for codex entries
 *   'batch-index-codex'       → Re-index all codex entries into Vectorize
 *   'process-bot-race-result' → Async processing of race results
 *
 * Usage from any Worker handler:
 *   env.SCRAPCRAFT_TASKS.send({ type: 'embed-recipes', data: {} });
 */

import { batchUpsertEmbeddings } from './vectorize.js';

// ── Queue consumer (entry point) ──────────────────────────────────

export default {
  async queue(batch, env) {
    for (const msg of batch.messages) {
      const { type, data } = msg.body;

      try {
        switch (type) {
          case 'embed-recipes':
            await indexRecipes(env);
            break;

          case 'generate-thumbnail':
            await generateProgramThumbnail(env, data.programJson, data.id);
            break;

          case 'analyze-bot-program':
            await analyzeProgram(env, data.programJson, data.id);
            break;

          case 'generate-codex-illustrations':
            await generateCodexIllustrations(env, data.codexIds);
            break;

          case 'batch-index-codex':
            await batchIndexCodex(env);
            break;

          case 'process-bot-race-result':
            await processRaceResult(env, data);
            break;

          default:
            console.warn(`Unknown task type: ${type}`, data);
        }
      } catch (err) {
        console.error(`Task ${type} failed:`, err.message);
        // Re-throw to trigger retry if the queue is configured for it
        if (data.retry !== false) {
          throw err;
        }
      }

      msg.ack();
    }
  },
};

// ── Task implementations ──────────────────────────────────────────

/**
 * Batch-embed all recipes from D1 into the Vectorize index.
 * Called on first deploy or when recipes change significantly.
 */
async function indexRecipes(env) {
  if (!env.SCRAPCRAFT_DB || !env.SCRAPCRAFT_VECTORIZE) {
    console.warn('D1 or Vectorize not available — skipping indexRecipes');
    return;
  }

  const db = env.SCRAPCRAFT_DB;
  const { results: recipes } = await db.prepare('SELECT * FROM recipes').all();

  if (!recipes || recipes.length === 0) {
    console.log('No recipes to index');
    return;
  }

  const items = recipes.map(r => ({
    id: `recipe:${r.id}`,
    text: `${r.title} ${r.description || ''} ${r.ingredients || ''} ${r.steps || ''}`,
  }));

  await batchUpsertEmbeddings(env, items);
  console.log(`Indexed ${items.length} recipes into Vectorize`);
}

/**
 * Generate a thumbnail image for a shared bot program.
 * Uses Workers AI or procedural fallback.
 */
async function generateProgramThumbnail(env, programJson, id) {
  if (!env.SCRAPCRAFT_ASSETS) {
    console.warn('R2 not available — skipping thumbnail');
    return;
  }

  // Extract a description from the program structure
  let description = 'bot program';
  try {
    const prog = typeof programJson === 'string' ? JSON.parse(programJson) : programJson;
    const nodes = prog.nodes || [];
    description = nodes.map(n => n.label || n.type || 'node').join('-');
    if (description.length > 80) description = description.slice(0, 80);
  } catch {
    description = 'custom program';
  }

  const key = `thumbnails/${id}.png`;

  try {
    if (env.AI) {
      const ai = env.AI;
      const result = await ai.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
        prompt: `Game bot program thumbnail, ${description}, circuit board style, 16-bit game art`,
        height: 64,
        width: 64,
      });

      if (result.image) {
        await env.SCRAPCRAFT_ASSETS.put(key, result.image, {
          httpMetadata: { contentType: 'image/png' },
        });
        console.log(`Generated thumbnail for program ${id}`);
        return;
      }
    }
  } catch (err) {
    console.warn(`AI thumbnail failed for ${id}:`, err.message);
  }

  // Procedural SVG fallback
  const svg = generateProgramSvg(description);
  await env.SCRAPCRAFT_ASSETS.put(key.replace('.png', '.svg'), svg, {
    httpMetadata: { contentType: 'image/svg+xml' },
  });
  console.log(`Generated procedural thumbnail for program ${id}`);
}

/**
 * Analyze a bot program for potential issues or optimization suggestions.
 * Returns analysis stored back to D1.
 */
async function analyzeProgram(env, programJson, id) {
  if (!env.SCRAPCRAFT_DB) return;

  const issues = [];
  let complexity = 0;

  try {
    const prog = typeof programJson === 'string' ? JSON.parse(programJson) : programJson;
    const nodes = prog.nodes || [];
    complexity = calculateProgramComplexity(nodes);

    // Check for common issues
    if (nodes.length === 0) {
      issues.push({ severity: 'error', message: 'Program has no nodes' });
    }
    if (nodes.length > 50) {
      issues.push({ severity: 'warning', message: 'Large program — may cause lag' });
    }

    // Check for infinite loops
    if (hasCycles(nodes)) {
      issues.push({ severity: 'warning', message: 'Detected potential infinite loop in program' });
    }

    // Check for orphaned nodes (no connections)
    const orphaned = findOrphanedNodes(nodes);
    if (orphaned.length > 0) {
      issues.push({
        severity: 'info',
        message: `${orphaned.length} disconnected node(s) found — they do nothing`,
      });
    }
  } catch (err) {
    issues.push({ severity: 'error', message: `Parse error: ${err.message}` });
  }

  // Store analysis
  const result = {
    programId: id,
    complexity,
    nodeCount: typeof programJson === 'string'
      ? (JSON.parse(programJson).nodes || []).length
      : (programJson.nodes || []).length,
    issues,
    analyzed: new Date().toISOString(),
  };

  // Save to D1 analysis table
  try {
    const db = env.SCRAPCRAFT_DB;
    await db.exec(`CREATE TABLE IF NOT EXISTS program_analysis (
      programId TEXT PRIMARY KEY,
      analysis TEXT NOT NULL
    )`);
    await db
      .prepare('INSERT OR REPLACE INTO program_analysis (programId, analysis) VALUES (?, ?)')
      .bind(id, JSON.stringify(result))
      .run();
  } catch (err) {
    console.error('Failed to store analysis:', err.message);
  }
}

/**
 * Generate illustrations for codex entries using Workers AI.
 */
async function generateCodexIllustrations(env, codexIds) {
  if (!env.AI || !env.SCRAPCRAFT_ASSETS || !env.SCRAPCRAFT_DB) return;

  const db = env.SCRAPCRAFT_DB;
  for (const codexId of codexIds) {
    const entry = await db
      .prepare('SELECT id, title, icon, text FROM codex WHERE id = ?')
      .bind(codexId)
      .first();

    if (!entry) continue;

    const prompt = `${entry.icon} ${entry.title}: ${entry.text.slice(0, 100)}`;
    const key = `codex-illustrations/${entry.id}.png`;

    try {
      const ai = env.AI;
      const result = await ai.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
        prompt: `${prompt}, educational game illustration, 128x128, colourful`,
        height: 128,
        width: 128,
      });

      if (result.image) {
        await env.SCRAPCRAFT_ASSETS.put(key, result.image, {
          httpMetadata: { contentType: 'image/png' },
        });
      }
    } catch (err) {
      console.warn(`Failed to generate illustration for ${codexId}:`, err.message);
    }
  }
}

/**
 * Batch-index all codex entries into Vectorize.
 */
async function batchIndexCodex(env) {
  if (!env.SCRAPCRAFT_DB || !env.SCRAPCRAFT_VECTORIZE) return;

  const db = env.SCRAPCRAFT_DB;
  const { results: entries } = await db.prepare('SELECT * FROM codex').all();

  if (!entries || entries.length === 0) return;

  const items = entries.map(e => ({
    id: `codex:${e.id}`,
    text: `${e.title} ${e.text} ${e.tags || ''}`,
  }));

  await batchUpsertEmbeddings(env, items);
  console.log(`Indexed ${items.length} codex entries`);
}

/**
 * Process completed bot race results — generate highlights, update stats, etc.
 */
async function processRaceResult(env, data) {
  const { trackName, winner, results, raceTime } = data;
  console.log(`Race on ${trackName} complete — winner: ${winner}, time: ${raceTime}ms`);

  // Could extend: generate highlight reel, update track stats, send notifications, etc.
}

// ── Helper functions ──────────────────────────────────────────────

function calculateProgramComplexity(nodes) {
  // Simple heuristic: count unique node types + connections
  const types = new Set(nodes.map(n => n.type || n.label));
  let connections = 0;
  for (const node of nodes) {
    if (node.outputs) connections += node.outputs.length;
    if (node.inputs) connections += node.inputs.length;
  }
  return types.size * 2 + connections;
}

function hasCycles(nodes) {
  // Very simplified cycle detection — real implementation would use DFS
  const degree = new Map();
  for (const node of nodes) {
    degree.set(node.id || node, (degree.get(node.id || node) || 0) + 1);
  }
  // If any node is referenced more than its own connections, cycles are likely
  for (const node of nodes) {
    const refs = (node.outputs || []).length;
    const refCount = degree.get(node.id || node) || 0;
    if (refCount > refs + 1) return true;
  }
  return false;
}

function findOrphanedNodes(nodes) {
  const connected = new Set();
  for (const node of nodes) {
    if (node.outputs) {
      for (const out of node.outputs) {
        if (typeof out === 'string') connected.add(out);
        else if (out.nodeId) connected.add(out.nodeId);
      }
    }
  }
  return nodes.filter(n => !connected.has(n.id || n) && !n.isStart);
}

function generateProgramSvg(description) {
  const hash = description.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  const r = (hash * 7) % 200 + 30;
  const g = (hash * 13) % 200 + 30;
  const b = (hash * 19) % 200 + 30;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect width="64" height="64" fill="rgb(${r},${g},${b})" rx="4"/>
    <circle cx="16" cy="16" r="6" fill="rgba(255,255,255,0.3)"/>
    <circle cx="48" cy="16" r="6" fill="rgba(255,255,255,0.3)"/>
    <circle cx="32" cy="48" r="6" fill="rgba(255,255,255,0.3)"/>
    <line x1="16" y1="16" x2="48" y2="16" stroke="#fff" stroke-width="1" opacity="0.5"/>
    <line x1="48" y1="16" x2="32" y2="48" stroke="#fff" stroke-width="1" opacity="0.5"/>
    <line x1="32" y1="48" x2="16" y2="16" stroke="#fff" stroke-width="1" opacity="0.5"/>
  </svg>`;
}
