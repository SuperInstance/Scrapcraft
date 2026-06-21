/**
 * BotRace — Durable Object for multiplayer bot racing.
 *
 * Multiple players join a race lobby, deploy their bot programs,
 * and race in real-time with position updates broadcast via WebSocket.
 *
 * SuperInstance feature: Spectator mode with Vectorize-powered
 * "ghost" from best historic run.
 *
 * Architecture:
 *   - HTTP POST  /join          → Create/join a race lobby
 *   - WebSocket  /ws            → Real-time race communication
 *   - HTTP POST  /start         → Start countdown + race
 *   - HTTP GET   /state         → Get current race state (spectator API)
 *   - HTTP POST  /ghost         → Load ghost data from best historic run
 *
 * WebSocket message protocol (JSON):
 *   → { type: "join", botId, program }
 *   → { type: "position", x, y, z, rotation, speed }
 *   → { type: "lap_complete", lap }
 *   ← { type: "race_state", state, players }
 *   ← { type: "position_update", players }
 *   ← { type: "lap_update", playerId, lap }
 *   ← { type: "race_finished", winner, results }
 *   ← { type: "countdown", seconds }
 *   ← { type: "ghost", positions }
 */

// ── Constants ─────────────────────────────────────────────────────

const POSITION_BROADCAST_MS = 50;   // 20 fps position updates
const COUNTDOWN_SECONDS = 3;
const DEFAULT_LAPS = 3;
const RACE_TIMEOUT_SECONDS = 300;    // 5 minute max race duration
const RACE_TIMEOUT_MS = RACE_TIMEOUT_SECONDS * 1000;

// ── BotRace Durable Object ────────────────────────────────────────

export class BotRace {
  constructor(state, env) {
    this.state = state;
    this.env = env;

    // Race state (persisted via DO storage for durability)
    this.players = new Map();          // socket -> PlayerInfo
    this.lapCount = DEFAULT_LAPS;
    this.raceState = 'waiting';        // waiting | countdown | racing | finished
    this.trackLayout = null;           // track data (waypoints, checkpoints)
    this.raceTimer = null;
    this.ghostPositions = [];          // loaded from Vectorize
    this.broadcastInterval = null;
    this.raceStartTime = null;
    this.finishOrder = [];
    this.spectatorSockets = new Set();
  }

  // ── HTTP entry point ────────────────────────────────────────────

  async fetch(request) {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (url.pathname.endsWith('/ws')) {
      return this.handleWebSocketUpgrade(request);
    }

    // JSON API endpoints
    switch (url.pathname.split('/').pop()) {
      case 'join':
        return this.handleJoin(request);
      case 'start':
        return this.handleStart(request);
      case 'state':
        return this.handleGetState();
      case 'ghost':
        return this.handleLoadGhost(request);
      default:
        return new Response(JSON.stringify({ error: 'Unknown endpoint' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
    }
  }

  // ── WebSocket ───────────────────────────────────────────────────

  async handleWebSocketUpgrade(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();
    this.registerSocket(server);

    // Send initial race state
    server.send(JSON.stringify({
      type: 'race_state',
      state: this.raceState,
      players: this.serializePlayers(),
      laps: this.lapCount,
      ghost: this.ghostPositions.length > 0 ? this.ghostPositions : undefined,
    }));

    // Message handler
    server.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(server, msg);
      } catch (err) {
        server.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    // Close handler
    server.addEventListener('close', () => {
      this.removePlayer(server);
      this.broadcast({ type: 'player_left', players: this.serializePlayers() });
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  registerSocket(socket) {
    if (!this.players.has(socket) && !this.spectatorSockets.has(socket)) {
      // Initially mark as spectator — becomes player on 'join' message
      this.spectatorSockets.add(socket);
    }
  }

  handleMessage(socket, msg) {
    switch (msg.type) {
      case 'join':
        return this.handlePlayerJoin(socket, msg);
      case 'position':
        return this.handlePosition(socket, msg);
      case 'lap_complete':
        return this.handleLapComplete(socket, msg);
      case 'spectate':
        // Already spectating by default
        break;
      default:
        socket.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
    }
  }

  // ── Player management ───────────────────────────────────────────

  handlePlayerJoin(socket, msg) {
    if (this.raceState !== 'waiting') {
      socket.send(JSON.stringify({ type: 'error', message: 'Race already in progress' }));
      return;
    }

    // Move from spectator to player
    this.spectatorSockets.delete(socket);
    this.players.set(socket, {
      botId: msg.botId || `bot-${Date.now()}`,
      program: msg.program || '',
      x: 0, y: 0, z: 0,
      rotation: 0,
      speed: 0,
      currentLap: 1,
      checkpoints: new Set(),
      finished: false,
      finishTime: null,
    });

    socket.send(JSON.stringify({
      type: 'joined',
      botId: this.players.get(socket).botId,
      raceState: this.raceState,
    }));

    this.broadcast({
      type: 'player_joined',
      players: this.serializePlayers(),
    });
  }

  removePlayer(socket) {
    this.players.delete(socket);
    this.spectatorSockets.delete(socket);
    this.cleanupIfEmpty();
  }

  // ── Race flow ───────────────────────────────────────────────────

  async handleStart(request) {
    if (this.raceState !== 'waiting') {
      return new Response(JSON.stringify({ error: 'Race already started' }), { status: 400 });
    }
    if (this.players.size < 1) {
      return new Response(JSON.stringify({ error: 'Need at least 1 player' }), { status: 400 });
    }

    // Accept optional track layout
    try {
      const body = await request.json();
      if (body.trackLayout) this.trackLayout = body.trackLayout;
      if (body.laps) this.lapCount = body.laps;
    } catch {
      // No body — use defaults
    }

    this.startCountdown();
    return new Response(JSON.stringify({ ok: true, raceId: this.state.id }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  startCountdown() {
    this.raceState = 'countdown';
    let count = COUNTDOWN_SECONDS;

    const countdownInterval = setInterval(() => {
      this.broadcast({ type: 'countdown', seconds: count });
      count--;

      if (count < 0) {
        clearInterval(countdownInterval);
        this.startRace();
      }
    }, 1000);
  }

  startRace() {
    this.raceState = 'racing';
    this.raceStartTime = Date.now();
    this.finishOrder = [];

    // Broadcast race start
    this.broadcast({ type: 'race_started', players: this.serializePlayers() });

    // Start broadcasting position updates
    this.broadcastInterval = setInterval(() => {
      this.broadcastPositions();
    }, POSITION_BROADCAST_MS);

    // Race timeout
    this.raceTimer = setTimeout(() => {
      this.finishRace(null, 'timeout');
    }, RACE_TIMEOUT_MS);
  }

  broadcastPositions() {
    if (this.raceState !== 'racing') return;
    this.broadcast({
      type: 'position_update',
      players: this.serializePlayers(),
      raceTime: Date.now() - this.raceStartTime,
    });
  }

  // ── Position / Lap handling ─────────────────────────────────────

  handlePosition(socket, msg) {
    const player = this.players.get(socket);
    if (!player || player.finished) return;

    player.x = msg.x ?? player.x;
    player.y = msg.y ?? player.y;
    player.z = msg.z ?? player.z;
    player.rotation = msg.rotation ?? player.rotation;
    player.speed = msg.speed ?? player.speed;
  }

  handleLapComplete(socket, msg) {
    const player = this.players.get(socket);
    if (!player) return;

    player.currentLap = Math.min(msg.lap ?? player.currentLap + 1, this.lapCount + 1);

    this.broadcast({
      type: 'lap_update',
      playerId: player.botId,
      lap: player.currentLap,
      totalLaps: this.lapCount,
    });

    // Check if player finished
    if (player.currentLap > this.lapCount) {
      player.finished = true;
      player.finishTime = Date.now() - this.raceStartTime;
      this.finishOrder.push(player.botId);

      socket.send(JSON.stringify({
        type: 'finished',
        position: this.finishOrder.length,
        time: player.finishTime,
      }));

      // Store result to D1
      this.storeRaceResult(player);

      // Check if all finished
      if (this.finishOrder.length >= this.players.size) {
        this.finishRace(this.finishOrder[0]);
      }
    }
  }

  async storeRaceResult(player) {
    try {
      const db = this.env.SCRAPCRAFT_DB;
      if (!db) return;

      const trackName = this.trackLayout?.name || 'unknown_track';
      await db
        .prepare(
          'INSERT INTO lap_times (playerId, trackName, timeMs, botProgram) VALUES (?, ?, ?, ?)'
        )
        .bind(player.botId, trackName, Math.round(player.finishTime || 0), player.program)
        .run();

      // Update ghost data in Vectorize for future ghost runs
      if (this.env.SCRAPCRAFT_VECTORIZE) {
        const positions = this.collectPlayerPositions(player);
        await this.env.SCRAPCRAFT_VECTORIZE.upsert([{
          id: `ghost:${trackName}:${player.botId}:${Date.now()}`,
          values: await this.getGhostEmbedding(player),
          metadata: { trackName, playerId: player.botId, timeMs: player.finishTime, positions },
        }]);
      }
    } catch (err) {
      // Non-critical — race continues
      console.error('Failed to store race result:', err);
    }
  }

  finishRace(winnerId, reason = 'complete') {
    this.raceState = 'finished';
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
    if (this.raceTimer) clearTimeout(this.raceTimer);

    this.broadcast({
      type: 'race_finished',
      winner: winnerId,
      reason,
      results: this.finishOrder,
      raceTime: Date.now() - (this.raceStartTime || Date.now()),
    });

    // Allow re-joining after a delay
    setTimeout(() => {
      this.resetRace();
    }, 10000);
  }

  resetRace() {
    this.players.clear();
    this.spectatorSockets.clear();
    this.raceState = 'waiting';
    this.finishOrder = [];
    this.raceStartTime = null;
    this.broadcast({ type: 'race_reset', state: 'waiting' });
  }

  cleanupIfEmpty() {
    if (this.players.size === 0 && this.spectatorSockets.size === 0) {
      // Allow the DO to be evicted naturally
    }
  }

  // ── Ghost ───────────────────────────────────────────────────────

  async handleLoadGhost(request) {
    try {
      const body = await request.json();
      const { trackName } = body;

      if (!trackName) {
        return new Response(JSON.stringify({ error: 'trackName required' }), { status: 400 });
      }

      if (!this.env.SCRAPCRAFT_VECTORIZE) {
        return new Response(JSON.stringify({ error: 'Vectorize not available' }), { status: 501 });
      }

      // Search for the best ghost run on this track
      const { getEmbedding } = await import('./vectorize.js');
      const embedding = await getEmbedding(this.env, `ghost track:${trackName}`);
      const results = await this.env.SCRAPCRAFT_VECTORIZE.query(embedding, {
        topK: 1,
        filter: { trackName },
        returnMetadata: true,
      });

      if (results.matches.length > 0 && results.matches[0].metadata?.positions) {
        this.ghostPositions = results.matches[0].metadata.positions;
      }

      return new Response(JSON.stringify({
        ok: true,
        ghostCount: this.ghostPositions.length,
      }), { headers: { 'content-type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  async getGhostEmbedding(player) {
    try {
      const { getEmbedding } = await import('./vectorize.js');
      return await getEmbedding(this.env, `player ${player.botId} race positions`);
    } catch {
      const { generateFallbackEmbedding } = await import('./vectorize.js');
      return generateFallbackEmbedding(`player ${player.botId} race positions`);
    }
  }

  collectPlayerPositions(player) {
    // Return a summary of positions for ghost replay
    return { botId: player.botId, lapCount: player.currentLap - 1 };
  }

  // ── State helpers ───────────────────────────────────────────────

  handleGetState() {
    const state = {
      raceState: this.raceState,
      players: this.serializePlayers(),
      lapCount: this.lapCount,
      trackLayout: this.trackLayout,
      ghostAvailable: this.ghostPositions.length > 0,
      finishOrder: this.finishOrder,
    };
    return new Response(JSON.stringify(state), {
      headers: { 'content-type': 'application/json' },
    });
  }

  serializePlayers() {
    const arr = [];
    for (const [, player] of this.players) {
      arr.push({
        botId: player.botId,
        x: player.x,
        y: player.y,
        z: player.z,
        rotation: player.rotation,
        speed: player.speed,
        currentLap: player.currentLap,
        finished: player.finished,
      });
    }
    // Sort by race position: more laps first, then lower time (approximate)
    arr.sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.currentLap !== b.currentLap) return b.currentLap - a.currentLap;
      return 0;
    });
    return arr;
  }

  // ── Broadcast ───────────────────────────────────────────────────

  broadcast(msg) {
    const payload = JSON.stringify(msg);
    for (const [socket] of this.players) {
      try {
        socket.send(payload);
      } catch {
        this.removePlayer(socket);
      }
    }
    for (const socket of this.spectatorSockets) {
      try {
        socket.send(payload);
      } catch {
        this.spectatorSockets.delete(socket);
      }
    }
  }
}
