/**
 * game-api.js — D1-backed game state API for Scrapcraft.
 *
 * Endpoints:
 *   POST /api/v1/save          — Save full game state
 *   GET  /api/v1/load/:playerId — Load game state
 *   GET  /api/v1/leaderboard    — Top 10 lap times
 *   POST /api/v1/lap-time       — Record a lap time
 *   GET  /api/v1/codex          — List all codex entries
 *   GET  /api/v1/codex/:id      — Single codex entry
 *   POST /api/v1/share-brain    — Share a bot brain program
 *   GET  /api/v1/brains          — List shared brains (optional ?tag=)
 *   GET  /api/v1/brains/:id      — Get a single shared brain
 *
 * Every handler receives (request, env, ctx) and uses env.SCRAPCRAFT_DB (D1).
 */

// ── Schema helpers ────────────────────────────────────────────────

const SAVE_SCHEMA = {
  playerId: 'TEXT NOT NULL',
  data: 'TEXT NOT NULL',          // full player state as JSON
  created: 'TEXT DEFAULT (datetime(\'now\'))',
  updated: 'TEXT DEFAULT (datetime(\'now\'))',
};

const LAP_TIME_SCHEMA = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  playerId: 'TEXT NOT NULL',
  trackName: 'TEXT NOT NULL',
  timeMs: 'INTEGER NOT NULL',
  botProgram: 'TEXT',
  recorded: 'TEXT DEFAULT (datetime(\'now\'))',
};

const CODEX_SCHEMA = {
  id: 'TEXT PRIMARY KEY',
  title: 'TEXT NOT NULL',
  icon: 'TEXT NOT NULL DEFAULT \'📖\'',
  text: 'TEXT NOT NULL',
  category: 'TEXT',
  difficulty: 'INTEGER DEFAULT 1',
  tags: 'TEXT',
};

const BRAIN_SCHEMA = {
  id: 'TEXT PRIMARY KEY',
  name: 'TEXT NOT NULL',
  description: 'TEXT',
  program_json: 'TEXT NOT NULL',
  author: 'TEXT NOT NULL DEFAULT \'Anonymous\'',
  rating: 'REAL DEFAULT 0',
  tag: 'TEXT',
  downloads: 'INTEGER DEFAULT 0',
  created: 'TEXT DEFAULT (datetime(\'now\'))',
};

/** Ensure all required tables exist. */
export async function ensureTables(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS saves (
      playerId TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created TEXT DEFAULT (datetime('now')),
      updated TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS lap_times (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playerId TEXT NOT NULL,
      trackName TEXT NOT NULL,
      timeMs INTEGER NOT NULL,
      botProgram TEXT,
      recorded TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS codex (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '📖',
      text TEXT NOT NULL,
      category TEXT,
      difficulty INTEGER DEFAULT 1,
      tags TEXT
    );
    CREATE TABLE IF NOT EXISTS brains (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      program_json TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'Anonymous',
      rating REAL DEFAULT 0,
      tag TEXT,
      downloads INTEGER DEFAULT 0,
      created TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_laptimes_time ON lap_times(timeMs);
    CREATE INDEX IF NOT EXISTS idx_brains_tag ON brains(tag);
  `);
}

// ── Router ────────────────────────────────────────────────────────

/** Main router: dispatch to the matching handler. */
export default async function handleGameApi(request, env, ctx) {
  const url = new URL(request.url);
  const db = env.SCRAPCRAFT_DB;

  await ensureTables(db);

  // ── Save game state ───────────────────────────────────────────
  if (request.method === 'POST' && url.pathname === '/api/v1/save') {
    return handleSave(request, db);
  }

  // ── Load game state ───────────────────────────────────────────
  const loadMatch = url.pathname.match(/^\/api\/v1\/load\/([^/]+)$/);
  if (request.method === 'GET' && loadMatch) {
    return handleLoad(loadMatch[1], db);
  }

  // ── Leaderboard ───────────────────────────────────────────────
  if (request.method === 'GET' && url.pathname === '/api/v1/leaderboard') {
    return handleLeaderboard(db);
  }

  // ── Record lap time ───────────────────────────────────────────
  if (request.method === 'POST' && url.pathname === '/api/v1/lap-time') {
    return handleRecordLapTime(request, db);
  }

  // ── Codex list ────────────────────────────────────────────────
  if (request.method === 'GET' && url.pathname === '/api/v1/codex') {
    return handleCodexList(db);
  }

  // ── Codex single ──────────────────────────────────────────────
  const codexMatch = url.pathname.match(/^\/api\/v1\/codex\/([^/]+)$/);
  if (request.method === 'GET' && codexMatch) {
    return handleCodexSingle(codexMatch[1], db);
  }

  // ── Share brain ───────────────────────────────────────────────
  if (request.method === 'POST' && url.pathname === '/api/v1/share-brain') {
    return handleShareBrain(request, db);
  }

  // ── List brains ───────────────────────────────────────────────
  if (request.method === 'GET' && url.pathname === '/api/v1/brains') {
    return handleListBrains(url, db);
  }

  // ── Single brain ──────────────────────────────────────────────
  const brainMatch = url.pathname.match(/^\/api\/v1\/brains\/([^/]+)$/);
  if (request.method === 'GET' && brainMatch) {
    return handleGetBrain(brainMatch[1], db);
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  });
}

// ── Handlers ──────────────────────────────────────────────────────

async function handleSave(request, db) {
  try {
    const body = await request.json();
    const { playerId, data } = body;

    if (!playerId || !data) {
      return json({ error: 'playerId and data are required' }, 400);
    }

    const stringData = typeof data === 'string' ? data : JSON.stringify(data);

    await db
      .prepare(
        `INSERT INTO saves (playerId, data, updated)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(playerId) DO UPDATE SET
           data = excluded.data,
           updated = excluded.updated`
      )
      .bind(playerId, stringData)
      .run();

    return json({ ok: true, playerId });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function handleLoad(playerId, db) {
  try {
    const row = await db
      .prepare('SELECT data, updated FROM saves WHERE playerId = ?')
      .bind(playerId)
      .first();

    if (!row) {
      return json({ error: 'Save not found' }, 404);
    }

    return json({
      playerId,
      data: JSON.parse(row.data),
      updated: row.updated,
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function handleLeaderboard(db) {
  try {
    const rows = await db
      .prepare(
        `SELECT playerId, trackName, timeMs, botProgram, recorded
         FROM lap_times
         ORDER BY timeMs ASC
         LIMIT 10`
      )
      .all();

    return json({ leaderboard: rows.results || [] });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function handleRecordLapTime(request, db) {
  try {
    const body = await request.json();
    const { playerId, trackName, timeMs, botProgram } = body;

    if (!playerId || !trackName || timeMs == null) {
      return json({ error: 'playerId, trackName, and timeMs are required' }, 400);
    }

    await db
      .prepare(
        'INSERT INTO lap_times (playerId, trackName, timeMs, botProgram) VALUES (?, ?, ?, ?)'
      )
      .bind(playerId, trackName, timeMs, botProgram || null)
      .run();

    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function handleCodexList(db) {
  try {
    const rows = await db
      .prepare('SELECT id, title, icon, category, difficulty, tags FROM codex ORDER BY difficulty ASC')
      .all();

    return json({ codex: rows.results || [] });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function handleCodexSingle(id, db) {
  try {
    const row = await db
      .prepare('SELECT * FROM codex WHERE id = ?')
      .bind(id)
      .first();

    if (!row) {
      return json({ error: 'Codex entry not found' }, 404);
    }

    return json(row);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function handleShareBrain(request, db) {
  try {
    const body = await request.json();
    const { id, name, description, programJson, author, tag } = body;

    if (!id || !name || !programJson) {
      return json({ error: 'id, name, and programJson are required' }, 400);
    }

    const progStr = typeof programJson === 'string' ? programJson : JSON.stringify(programJson);

    await db
      .prepare(
        `INSERT INTO brains (id, name, description, program_json, author, tag)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           program_json = excluded.program_json,
           author = excluded.author,
           tag = excluded.tag`
      )
      .bind(id, name, description || '', progStr, author || 'Anonymous', tag || null)
      .run();

    return json({ ok: true, id });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function handleListBrains(url, db) {
  try {
    const tag = url.searchParams.get('tag');
    let rows;

    if (tag) {
      rows = await db
        .prepare(
          'SELECT id, name, description, author, rating, tag, downloads, created FROM brains WHERE tag = ? ORDER BY rating DESC'
        )
        .bind(tag)
        .all();
    } else {
      rows = await db
        .prepare(
          'SELECT id, name, description, author, rating, tag, downloads, created FROM brains ORDER BY downloads DESC'
        )
        .all();
    }

    return json({ brains: rows.results || [] });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function handleGetBrain(id, db) {
  try {
    // Increment download counter
    await db
      .prepare('UPDATE brains SET downloads = downloads + 1 WHERE id = ?')
      .bind(id)
      .run();

    const row = await db
      .prepare('SELECT * FROM brains WHERE id = ?')
      .bind(id)
      .first();

    if (!row) {
      return json({ error: 'Brain not found' }, 404);
    }

    return json(row);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// ── Helper ────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
