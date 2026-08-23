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
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      class_code TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      criteria TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS challenge_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      grade TEXT,
      budget_pct INTEGER,
      completed_at TEXT DEFAULT (datetime('now')),
      UNIQUE(challenge_id, session_id)
    );
    CREATE INDEX IF NOT EXISTS idx_challenges_class ON challenges(class_code, active);
    CREATE INDEX IF NOT EXISTS idx_completions_challenge ON challenge_completions(challenge_id);
  `);
  // Migrate columns — silently ignored if they already exist
  try { await db.exec('ALTER TABLE classes ADD COLUMN teacher_key TEXT'); } catch { /* already present */ }
  try { await db.exec('ALTER TABLE classes ADD COLUMN spark_enabled INTEGER DEFAULT 1'); } catch { /* already present */ }
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
  const classPathMatch = url.pathname.match(/^\/api\/v1\/class\/([A-Z0-9]+)\/([a-z_.]+)$/);
  if (classPathMatch) {
    const [, code, sub] = classPathMatch;
    if (request.method === 'GET'    && sub === 'roster')       return handleClassRoster(code, url, db);
    if (request.method === 'GET'    && sub === 'challenge')    return handleGetChallenge(code, db);
    if (request.method === 'POST'   && sub === 'challenge')    return handleAssignChallenge(code, request, url, db);
    if (request.method === 'DELETE' && sub === 'challenge')    return handleEndChallenge(code, url, db);
    if (request.method === 'GET'    && sub === 'spark-config') return handleGetSparkConfig(code, db);
    if (request.method === 'POST'   && sub === 'spark-config') return handleSetSparkConfig(code, request, url, db);
    if (request.method === 'GET'    && sub === 'leaderboard')  return handleClassLeaderboard(code, db);
    if (request.method === 'GET'    && sub === 'export.csv')   return handleClassExportCsv(code, url, db);
  }
  // Teacher view of a single student's saved brain
  const brainMatch = url.pathname.match(/^\/api\/v1\/class\/([A-Z0-9]+)\/student\/([^/]+)\/brain$/);
  if (request.method === 'GET' && brainMatch) {
    return handleStudentBrain(brainMatch[1], brainMatch[2], url, db);
  }

  // Student submits challenge completion (session auth)
  if (session && request.method === 'POST' && url.pathname === '/api/v1/challenge/complete') {
    return handleChallengeComplete(request, session, db);
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
  // (renamed from brainMatch — the classroom-student route above already
  //  declared that const in this scope, which broke module parsing)
  const singleBrainMatch = url.pathname.match(/^\/api\/v1\/brains\/([^/]+)$/);
  if (request.method === 'GET' && singleBrainMatch) {
    return handleGetBrain(singleBrainMatch[1], db);
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
    const teacherKey = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO classes (code, teacher_name, teacher_key) VALUES (?, ?, ?)`
    ).bind(classCode, teacherName.trim(), teacherKey).run();
    return json({ classCode, teacherName: teacherName.trim(), teacherKey });
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

async function handleClassRoster(classCode, url, db) {
  try {
    const key = url.searchParams.get('key');
    const cls = await db.prepare('SELECT teacher_key FROM classes WHERE code=?').bind(classCode).first();
    if (!cls) return json({ error: 'Class not found' }, 404);
    if (cls.teacher_key && cls.teacher_key !== key) return json({ error: 'Invalid teacher key' }, 403);

    // Active challenge for this class
    const challenge = await db.prepare(
      'SELECT id, title, description FROM challenges WHERE class_code=? AND active=1 ORDER BY created_at DESC LIMIT 1'
    ).bind(classCode).first();

    // Roster with challenge completion status
    const rows = await db.prepare(
      `SELECT s.id, s.display_name, s.last_seen,
              CASE WHEN ss.session_id IS NOT NULL THEN 1 ELSE 0 END AS has_save,
              cc.grade, cc.budget_pct, cc.completed_at
       FROM sessions s
       LEFT JOIN session_saves ss ON ss.session_id = s.id
       LEFT JOIN challenge_completions cc
         ON cc.session_id = s.id AND cc.challenge_id = ?
       WHERE s.class_code = ?
       ORDER BY s.last_seen DESC`
    ).bind(challenge?.id ?? '', classCode).all();

    return json({ classCode, students: rows.results ?? [], challenge: challenge ?? null });
  } catch (err) { return json({ error: err.message }, 500); }
}

async function handleGetChallenge(classCode, db) {
  try {
    const row = await db.prepare(
      'SELECT id, title, description, criteria, created_at FROM challenges WHERE class_code=? AND active=1 ORDER BY created_at DESC LIMIT 1'
    ).bind(classCode).first();
    if (!row) return json({ challenge: null });
    return json({ challenge: { ...row, criteria: JSON.parse(row.criteria) } });
  } catch (err) { return json({ error: err.message }, 500); }
}

async function handleAssignChallenge(classCode, request, url, db) {
  try {
    const key = url.searchParams.get('key');
    const cls = await db.prepare('SELECT teacher_key FROM classes WHERE code=?').bind(classCode).first();
    if (!cls) return json({ error: 'Class not found' }, 404);
    if (cls.teacher_key !== key) return json({ error: 'Invalid teacher key' }, 403);

    const { title, description, criteria } = await request.json();
    if (!title || !criteria) return json({ error: 'title and criteria required' }, 400);

    // End any active challenges first
    await db.prepare(
      `UPDATE challenges SET active=0, ended_at=datetime('now') WHERE class_code=? AND active=1`
    ).bind(classCode).run();

    const id = crypto.randomUUID();
    await db.prepare(
      'INSERT INTO challenges (id, class_code, title, description, criteria) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, classCode, title, description ?? '', JSON.stringify(criteria)).run();

    return json({ ok: true, challengeId: id });
  } catch (err) { return json({ error: err.message }, 500); }
}

async function handleEndChallenge(classCode, url, db) {
  try {
    const key = url.searchParams.get('key');
    const cls = await db.prepare('SELECT teacher_key FROM classes WHERE code=?').bind(classCode).first();
    if (!cls) return json({ error: 'Class not found' }, 404);
    if (cls.teacher_key !== key) return json({ error: 'Invalid teacher key' }, 403);

    await db.prepare(
      `UPDATE challenges SET active=0, ended_at=datetime('now') WHERE class_code=? AND active=1`
    ).bind(classCode).run();
    return json({ ok: true });
  } catch (err) { return json({ error: err.message }, 500); }
}

async function handleChallengeComplete(request, sessionId, db) {
  try {
    const { challengeId, grade, budgetPct } = await request.json();
    if (!challengeId) return json({ error: 'challengeId required' }, 400);

    // Verify session owns a challenge in the same class
    const sess = await db.prepare('SELECT class_code FROM sessions WHERE id=?').bind(sessionId).first();
    if (!sess) return json({ error: 'Invalid session' }, 403);
    const ch = await db.prepare('SELECT class_code FROM challenges WHERE id=?').bind(challengeId).first();
    if (!ch || ch.class_code !== sess.class_code) return json({ error: 'Challenge not found' }, 404);

    await db.prepare(
      `INSERT INTO challenge_completions (challenge_id, session_id, grade, budget_pct)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(challenge_id, session_id) DO NOTHING`
    ).bind(challengeId, sessionId, grade ?? 'C', budgetPct ?? 50).run();

    return json({ ok: true });
  } catch (err) { return json({ error: err.message }, 500); }
}

// ── Spark config handlers ─────────────────────────────────────────

async function handleGetSparkConfig(classCode, db) {
  try {
    const row = await db.prepare('SELECT spark_enabled FROM classes WHERE code=?').bind(classCode).first();
    if (!row) return json({ error: 'Class not found' }, 404);
    return json({ sparkEnabled: row.spark_enabled !== 0 });
  } catch (err) { return json({ error: err.message }, 500); }
}

async function handleSetSparkConfig(classCode, request, url, db) {
  try {
    const key = url.searchParams.get('key');
    const cls = await db.prepare('SELECT teacher_key FROM classes WHERE code=?').bind(classCode).first();
    if (!cls) return json({ error: 'Class not found' }, 404);
    if (cls.teacher_key !== key) return json({ error: 'Invalid teacher key' }, 403);
    const { sparkEnabled } = await request.json();
    await db.prepare('UPDATE classes SET spark_enabled=? WHERE code=?')
      .bind(sparkEnabled ? 1 : 0, classCode).run();
    return json({ ok: true, sparkEnabled: !!sparkEnabled });
  } catch (err) { return json({ error: err.message }, 500); }
}

async function handleClassLeaderboard(classCode, db) {
  try {
    const cls = await db.prepare('SELECT 1 FROM classes WHERE code=?').bind(classCode).first();
    if (!cls) return json({ error: 'Class not found' }, 404);

    const challenge = await db.prepare(
      'SELECT id, title FROM challenges WHERE class_code=? AND active=1 ORDER BY created_at DESC LIMIT 1'
    ).bind(classCode).first();

    const totalStudents = await db.prepare(
      'SELECT COUNT(*) AS n FROM sessions WHERE class_code=?'
    ).bind(classCode).first();

    if (!challenge) return json({ leaderboard: [], challengeId: null, totalStudents: totalStudents?.n ?? 0 });

    const GRADE_ORDER = { 'A+': 0, A: 1, B: 2, C: 3, D: 4 };
    const rows = await db.prepare(
      `SELECT s.display_name AS name, cc.grade, cc.budget_pct, cc.completed_at
       FROM challenge_completions cc
       JOIN sessions s ON s.id = cc.session_id
       WHERE cc.challenge_id = ?
       ORDER BY cc.completed_at ASC`
    ).bind(challenge.id).all();

    const sorted = (rows.results ?? []).sort((a, b) => {
      const ga = GRADE_ORDER[a.grade] ?? 99;
      const gb = GRADE_ORDER[b.grade] ?? 99;
      if (ga !== gb) return ga - gb;
      return (a.budget_pct ?? 50) - (b.budget_pct ?? 50);
    }).map((r, i) => ({ rank: i + 1, ...r }));

    return json({
      leaderboard: sorted,
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      totalStudents: totalStudents?.n ?? 0,
    });
  } catch (err) { return json({ error: err.message }, 500); }
}

async function handleStudentBrain(classCode, sessionId, url, db) {
  try {
    const key = url.searchParams.get('key');
    const cls = await db.prepare('SELECT teacher_key FROM classes WHERE code=?').bind(classCode).first();
    if (!cls) return json({ error: 'Class not found' }, 404);
    if (cls.teacher_key && cls.teacher_key !== key) return json({ error: 'Invalid teacher key' }, 403);

    // Verify the session belongs to this class
    const sess = await db.prepare('SELECT display_name FROM sessions WHERE id=? AND class_code=?')
      .bind(sessionId, classCode).first();
    if (!sess) return json({ error: 'Student not found in this class' }, 404);

    const save = await db.prepare('SELECT data FROM session_saves WHERE session_id=?')
      .bind(sessionId).first();
    if (!save) return json({ brain: null, displayName: sess.display_name });

    const saveData = JSON.parse(save.data);
    const brain = saveData.tileEditor ?? null;
    // Concept ladder (learning engine) rides the same payload — the teacher
    // dashboard's CONCEPT COVERAGE panel aggregates it. Older saves → null.
    const concepts = saveData.concepts ?? null;
    return json({ brain, concepts, displayName: sess.display_name });
  } catch (err) { return json({ error: err.message }, 500); }
}

async function handleClassExportCsv(classCode, url, db) {
  try {
    const key = url.searchParams.get('key');
    const cls = await db.prepare('SELECT teacher_name, teacher_key FROM classes WHERE code=?').bind(classCode).first();
    if (!cls) return json({ error: 'Class not found' }, 404);
    if (cls.teacher_key && cls.teacher_key !== key) return json({ error: 'Invalid teacher key' }, 403);

    // All challenges for this class (most recent first)
    const challenges = await db.prepare(
      'SELECT id, title FROM challenges WHERE class_code=? ORDER BY created_at DESC'
    ).bind(classCode).all();
    const cList = challenges.results ?? [];

    // All students
    const students = await db.prepare(
      'SELECT id, display_name, last_seen FROM sessions WHERE class_code=? ORDER BY display_name'
    ).bind(classCode).all();

    // All completions for this class
    const completions = await db.prepare(
      `SELECT cc.session_id, cc.challenge_id, cc.grade, cc.budget_pct, cc.completed_at
       FROM challenge_completions cc
       JOIN challenges ch ON ch.id = cc.challenge_id
       WHERE ch.class_code=?`
    ).bind(classCode).all();
    const compMap = {};
    for (const c of completions.results ?? []) {
      compMap[`${c.session_id}:${c.challenge_id}`] = c;
    }

    // Build CSV
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const challengeTitles = cList.map(c => c.title);
    const header = ['Student', 'Last Active', ...challengeTitles.flatMap(t => [`${t} Grade`, `${t} Budget%`])];
    const rows = (students.results ?? []).map(s => {
      const cells = [s.display_name, s.last_seen?.split('T')[0] ?? ''];
      for (const c of cList) {
        const comp = compMap[`${s.id}:${c.id}`];
        cells.push(comp?.grade ?? '', comp?.budget_pct != null ? comp.budget_pct : '');
      }
      return cells.map(esc).join(',');
    });
    const csv = [header.map(esc).join(','), ...rows].join('\r\n');
    const filename = `scrapcraft_${classCode}_${new Date().toISOString().slice(0,10)}.csv`;

    return new Response(csv, {
      headers: {
        'content-type': 'text/csv',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) { return json({ error: err.message }, 500); }
}

// ── Helper ────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
