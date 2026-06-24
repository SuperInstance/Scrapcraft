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
    CREATE TABLE IF NOT EXISTS classes (
      code TEXT PRIMARY KEY,
      teacher_name TEXT NOT NULL,
      created TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      class_code TEXT NOT NULL REFERENCES classes(code),
      display_name TEXT NOT NULL,
      last_seen TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS session_saves (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id),
      data TEXT NOT NULL,
      updated TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_class ON sessions(class_code);
  `);
}

// ── Router ────────────────────────────────────────────────────────

/** Main router: dispatch to the matching handler. */
export default async function handleGameApi(request, env, ctx) {
  const url = new URL(request.url);
  const db = env.SCRAPCRAFT_DB;

  await ensureTables(db);

  // ── Session-based cloud save (from SaveBackend.js) ────────────
  const session = request.headers.get('X-Scrapcraft-Session');
  if (session) {
    if (request.method === 'PUT' && url.pathname === '/api/v1/save') {
      return handleSessionSave(request, session, db);
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/save') {
      return handleSessionLoad(session, db);
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/save/check') {
      return handleSessionCheck(session, db);
    }
    if (request.method === 'DELETE' && url.pathname === '/api/v1/save') {
      return handleSessionDelete(session, db);
    }
  }

  // ── Classroom ──────────────────────────────────────────────────
  if (request.method === 'POST' && url.pathname === '/api/v1/class/join') {
    return handleClassJoin(request, db);
  }
  if (request.method === 'POST' && url.pathname === '/api/v1/class/create') {
    return handleClassCreate(request, db);
  }
  const rosterMatch = url.pathname.match(/^\/api\/v1\/class\/([A-Z0-9]+)\/roster$/);
  if (request.method === 'GET' && rosterMatch) {
    return handleClassRoster(rosterMatch[1], db);
  }

  // ── Legacy save game state (by explicit playerId) ─────────────
  if (request.method === 'POST' && url.pathname === '/api/v1/save') {
    return handleSave(request, db);
  }

  // ── Load game state (legacy) ──────────────────────────────────
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

// ── Session-based save handlers (classroom cloud saves) ───────────

async function handleSessionSave(request, sessionId, db) {
  try {
    const body = await request.text();
    await db.prepare(
      `INSERT INTO session_saves (session_id, data, updated)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(session_id) DO UPDATE SET data=excluded.data, updated=excluded.updated`
    ).bind(sessionId, body).run();
    // Update last_seen on the session row
    await db.prepare(`UPDATE sessions SET last_seen=datetime('now') WHERE id=?`).bind(sessionId).run();
    return json({ ok: true });
  } catch (err) { return json({ error: err.message }, 500); }
}

async function handleSessionLoad(sessionId, db) {
  try {
    const row = await db.prepare(
      'SELECT data, updated FROM session_saves WHERE session_id=?'
    ).bind(sessionId).first();
    if (!row) return json({ error: 'No save found' }, 404);
    return json({ data: JSON.parse(row.data), updated: row.updated });
  } catch (err) { return json({ error: err.message }, 500); }
}

async function handleSessionCheck(sessionId, db) {
  try {
    const row = await db.prepare(
      'SELECT 1 FROM session_saves WHERE session_id=?'
    ).bind(sessionId).first();
    return json({ exists: !!row });
  } catch (err) { return json({ error: err.message }, 500); }
}

async function handleSessionDelete(sessionId, db) {
  try {
    await db.prepare('DELETE FROM session_saves WHERE session_id=?').bind(sessionId).run();
    return json({ ok: true });
  } catch (err) { return json({ error: err.message }, 500); }
}

// ── Classroom handlers ────────────────────────────────────────────

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function handleClassCreate(request, db) {
  try {
    const { teacherName } = await request.json();
    if (!teacherName?.trim()) return json({ error: 'teacherName required' }, 400);
    let classCode, tries = 0;
    do {
      classCode = genCode();
      tries++;
    } while (tries < 10 &&
      await db.prepare('SELECT 1 FROM classes WHERE code=?').bind(classCode).first());
    await db.prepare(
      `INSERT INTO classes (code, teacher_name) VALUES (?, ?)`
    ).bind(classCode, teacherName.trim()).run();
    return json({ classCode, teacherName: teacherName.trim() });
  } catch (err) { return json({ error: err.message }, 500); }
}

async function handleClassJoin(request, db) {
  try {
    const { classCode, displayName } = await request.json();
    if (!classCode || !displayName?.trim()) return json({ error: 'classCode and displayName required' }, 400);
    const code = classCode.toUpperCase().trim();
    const cls = await db.prepare('SELECT code FROM classes WHERE code=?').bind(code).first();
    if (!cls) return json({ error: 'Class not found. Check the code.' }, 404);
    const sessionId = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO sessions (id, class_code, display_name) VALUES (?, ?, ?)`
    ).bind(sessionId, code, displayName.trim()).run();
    return json({ sessionId, classCode: code, displayName: displayName.trim() });
  } catch (err) { return json({ error: err.message }, 500); }
}

async function handleClassRoster(classCode, db) {
  try {
    const rows = await db.prepare(
      `SELECT s.id, s.display_name, s.last_seen,
              CASE WHEN ss.session_id IS NOT NULL THEN 1 ELSE 0 END AS has_save
       FROM sessions s
       LEFT JOIN session_saves ss ON ss.session_id = s.id
       WHERE s.class_code = ?
       ORDER BY s.last_seen DESC`
    ).bind(classCode).all();
    return json({ classCode, students: rows.results ?? [] });
  } catch (err) { return json({ error: err.message }, 500); }
}

// ── Helper ────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
