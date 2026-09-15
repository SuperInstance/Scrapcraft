/**
 * ───────────────────────────────────────────────────────────────────────────
 *  QUILT BRIDGE  —  opt-in link from the running game to the scrap-quilt Worker
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  `scrap-quilt` (a deployed Cloudflare Worker) turns Scrapcraft's live play
 *  into a networked reactive spreadsheet: POST /tick ingests the game's value
 *  cells and computes formulas server-side (motor volts, battery %, lap
 *  detection, odometry); /predict runs a ghost-racer forward-sim; /chat answers
 *  questions grounded in the live cells. This module is the client.
 *
 *  Non-negotiables (this ships to children):
 *    • OFF BY DEFAULT. Nothing leaves the browser unless a person opts in.
 *    • FAIL-SOFT. Every network path is guarded; a failure returns null and
 *      NEVER throws or touches gameplay. Telemetry is strictly downstream.
 *    • NO PII. Only game-derived value cells are sent. Free text a child typed
 *      (spark.lastQuestion) is never transmitted. The payload is robot pose /
 *      motors / sensors / program counters — not the kid.
 *    • THROTTLED. ~2 Hz, one request in flight at a time.
 *
 *  The cell ids + which are inputs vs. server-computed formulas come straight
 *  from the Worker's published schema (GET / → layout[]).
 * ───────────────────────────────────────────────────────────────────────────
 */

export const DEFAULT_QUILT_URL = 'https://scrap-quilt.casey-digennaro.workers.dev';
const STORAGE_KEY = 'scrapcraft_quilt_bridge';

// Value (input) cells the Worker accepts. Formula cells (robot.speed,
// robot.battery.pct, race.lapFrac, …) are computed server-side and are NOT
// sent. `spark.lastQuestion` is a value cell but is deliberately EXCLUDED — it
// is free text the child typed, kept off the wire for privacy.
export const SENDABLE_CELLS = new Set([
  'player.x', 'player.z', 'player.biome', 'player.scrap', 'player.inventoryCount',
  'robot.x', 'robot.z', 'robot.heading', 'robot.batteryV', 'robot.dutyL', 'robot.dutyR',
  'robot.drivePower', 'robot.turnPower', 'robot.sensor.ultrasonic', 'robot.sensor.ir',
  'robot.sensor.encoder', 'robot.gripper',
  'program.currentTile', 'program.ip', 'program.length', 'program.loopDepth',
  'program.tilesRun', 'program.state',
  'race.lap', 'race.splitMs', 'race.bestLapMs', 'race.position',
  'build.partsCount', 'build.chassisIntegrity', 'build.maxIntegrity', 'build.motorTier',
  'spark.cacheHit', 'spark.lastTookMs', 'spark.hits', 'spark.misses',
  'flash.hexHash', 'flash.board', 'flash.size', 'flash.at', 'flash.count',
]);

function loadConfig() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return (o && typeof o === 'object') ? o : {};
  } catch { return {}; }
}
function saveConfig(cfg) {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* blocked storage — session-only */ }
}

/** Read the persisted opt-in flag (default false). For the Settings UI. */
export function isQuiltBridgeEnabled() { return !!loadConfig().enabled; }
/** Persist the opt-in flag. For the Settings UI — takes effect immediately
 *  because live bridges read the flag on each send. */
export function setQuiltBridgeEnabled(v) {
  saveConfig({ ...loadConfig(), enabled: !!v });
  return !!v;
}

export class QuiltBridge {
  /** @param {object} [opts] { url, enabled, fetch, minIntervalMs } (fetch injectable for tests). */
  constructor(opts = {}) {
    const cfg = loadConfig();
    this.url = (opts.url ?? cfg.url ?? DEFAULT_QUILT_URL).replace(/\/$/, '');
    // Explicit `enabled` in opts is an override (used by tests); otherwise the
    // flag is read LIVE from persisted config on every send, so a Settings
    // toggle takes effect immediately without re-constructing the bridge.
    this._enabledOverride = ('enabled' in opts) ? !!opts.enabled : null;
    this._fetch = opts.fetch ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    this._minIntervalMs = opts.minIntervalMs ?? 500;
    this._lastPost = 0;
    this._inflight = false;
    this._now = opts.now ?? (() => Date.now());
  }

  isEnabled() {
    const en = this._enabledOverride ?? (loadConfig().enabled ?? false);
    return !!en && !!this.url && !!this._fetch;
  }

  /** Opt in / out. Persists the choice (best-effort) and applies immediately. */
  setEnabled(v) {
    this._enabledOverride = !!v;
    saveConfig({ ...loadConfig(), enabled: !!v, url: this.url });
    return !!v;
  }

  /** Keep only sendable value cells with finite/usable values (strips formula
   *  cells, the PII question cell, and null/NaN/undefined). Pure. */
  sanitize(cells = {}) {
    const out = {};
    for (const [id, v] of Object.entries(cells)) {
      if (!SENDABLE_CELLS.has(id)) continue;
      if (v == null) continue;
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      out[id] = v;
    }
    return out;
  }

  /** POST one tick. Throttled, single-flight, fail-soft. Returns the Worker's
   *  response JSON (computed cells + lapEvents) or null (disabled/throttled/failed). */
  async postTick(cells) {
    if (!this.isEnabled()) return null;
    const now = this._now();
    if (now - this._lastPost < this._minIntervalMs) return null;
    if (this._inflight) return null;
    const payload = this.sanitize(cells);
    if (Object.keys(payload).length === 0) return null;
    this._lastPost = now;
    this._inflight = true;
    try {
      const res = await this._fetch(`${this.url}/tick`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cells: payload }),
      });
      return res && res.ok ? await res.json() : null;
    } catch {
      return null;                    // fail-soft: telemetry never disrupts play
    } finally {
      this._inflight = false;
    }
  }

  /** Ghost-racer forward simulation. Fail-soft → null. Not throttled (on demand). */
  async predict(cells, ticks = 40) {
    if (!this.isEnabled()) return null;
    try {
      const res = await this._fetch(`${this.url}/predict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cells: this.sanitize(cells), ticks }),
      });
      return res && res.ok ? await res.json() : null;
    } catch { return null; }
  }

  /** Ask Spark a question grounded in the live cells. Fail-soft → null. */
  async chat(question, cells) {
    if (!this.isEnabled()) return null;
    try {
      const res = await this._fetch(`${this.url}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: String(question ?? '').slice(0, 500), cells: this.sanitize(cells) }),
      });
      return res && res.ok ? await res.json() : null;
    } catch { return null; }
  }
}

const _pct = (v) => (v == null ? undefined : (Math.abs(v) <= 1 ? Math.round(v * 100) : Math.round(v)));
const _num = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(3) : undefined);

/** Depth-first find a program node by id (walks body + elseBody). Pure. */
function _findNodeById(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    const inBody = n.body ? _findNodeById(n.body, id) : null;
    if (inBody) return inBody;
    const inElse = n.elseBody ? _findNodeById(n.elseBody, id) : null;
    if (inElse) return inElse;
  }
  return null;
}

/**
 * Human-readable label for the tile a runtime is currently executing, derived
 * from its source map + program counter. Mirrors the local Quilt-view label so
 * the cloud sheet and the on-screen panel agree. Returns '—' when nothing is
 * resolvable. Pure — reads only the runtime it's handed.
 *
 * @param {object} rt  MakerRuntime-shaped { vm:{pc}, sourceMap:[{pc,nodeId}], program:{nodes} }
 */
export function activeTileLabel(rt) {
  if (!rt?.vm || !Array.isArray(rt.sourceMap)) return '—';
  let activeId = null;
  for (const e of rt.sourceMap) {
    if (e.pc <= rt.vm.pc) activeId = e.nodeId;
    else break;
  }
  if (!activeId) return '—';
  const node = _findNodeById(rt.program?.nodes ?? [], activeId);
  if (!node) return '—';
  if (node.type === 'forever') return 'forever ∞';
  const bits = [node.type];
  if (node.prim) bits.push(node.prim);
  if (node.cond?.sensor) bits.push(`if ${node.cond.sensor}`);
  if (node.seconds !== undefined) bits.push(`${node.seconds}s`);
  return bits.join(' ');
}

/**
 * Build a scrap-quilt cell snapshot straight from a live run (runtime + world
 * adapter), so any caller with a running bot can mirror it — the Maker Lab
 * panel, the game loop, a test. Sensors are sampled from the world adapter at
 * the robot's pose. `extra` is merged onto the state object (e.g. { player })
 * before mapping. Pure with respect to a mock world.
 *
 * @param {object} rt     MakerRuntime (has .robot, .vm, .sourceMap, .program, .isRunning)
 * @param {object} world  GameWorldAdapter-shaped sensor backing (optional)
 * @param {object} [extra] additional state groups forwarded to the mapper
 * @returns {object} scrap-quilt cell id → value
 */
export function snapshotFromRun(rt, world, extra = {}) {
  if (!rt) return {};
  const robot = rt.robot;
  const sensors = (world && robot) ? {
    distance_ahead: world.distanceAhead?.(robot.x, robot.z, robot.heading) ?? 0,
    line_under:     !!world.lineUnder?.(robot.x, robot.z),
  } : undefined;
  return snapshotScrapQuiltCells({
    robot,
    sensors,
    program: {
      currentTile: activeTileLabel(rt),
      tilesRun:    rt.vm?.steps ?? 0,
      state:       rt.isRunning ? 'running' : 'stopped',
    },
    ...extra,
  });
}

/**
 * Map a live game/run state object to scrap-quilt INPUT cells. Only present
 * fields are emitted (partial payloads are fine — the Worker fills formulas
 * from whatever it receives). Pure and dependency-free, so it unit-tests
 * without a browser.
 *
 * @param {object} state
 *   state.robot    { x, z, heading(rad), batteryV, drivePower(-1..1|pct), turnPower, gripper }
 *   state.sensors  { distance_ahead, ir, encoder }
 *   state.program  { currentTile, ip, length, loopDepth, tilesRun, state }
 *   state.player   { x, z, biome, scrap, inventoryCount }
 *   state.race     { lap, splitMs, bestLapMs, position }
 *   state.build    { partsCount, chassisIntegrity, maxIntegrity, motorTier }
 *   state.flash    { hexHash, board, size, at, count }
 * @returns {object} scrap-quilt cell id → value
 */
export function snapshotScrapQuiltCells(state = {}) {
  const c = {};
  const put = (id, v) => { if (v !== undefined && v !== null) c[id] = v; };
  const r = state.robot, s = state.sensors, p = state.program;
  const pl = state.player, ra = state.race, b = state.build, fl = state.flash;

  if (r) {
    put('robot.x', _num(r.x)); put('robot.z', _num(r.z));
    if (typeof r.heading === 'number') put('robot.heading', +(((r.heading * 180 / Math.PI) + 360) % 360).toFixed(1));
    put('robot.batteryV', _num(r.batteryV));
    put('robot.drivePower', _pct(r.drivePower)); put('robot.turnPower', _pct(r.turnPower));
    if (typeof r.gripper === 'string') put('robot.gripper', r.gripper);
  }
  if (s) {
    put('robot.sensor.ultrasonic', _num(s.distance_ahead ?? s.ultrasonic));
    put('robot.sensor.ir', _num(s.ir ?? (s.line_under ? 1 : 0)));
    if (s.encoder != null) put('robot.sensor.encoder', Math.round(s.encoder));
  }
  if (p) {
    if (typeof p.currentTile === 'string') put('program.currentTile', p.currentTile);
    if (p.ip != null) put('program.ip', Math.round(p.ip));
    if (p.length != null) put('program.length', Math.round(p.length));
    if (p.loopDepth != null) put('program.loopDepth', Math.round(p.loopDepth));
    if (p.tilesRun != null) put('program.tilesRun', Math.round(p.tilesRun));
    if (typeof p.state === 'string') put('program.state', p.state);
  }
  if (pl) {
    put('player.x', _num(pl.x)); put('player.z', _num(pl.z));
    if (typeof pl.biome === 'string') put('player.biome', pl.biome);
    if (pl.scrap != null) put('player.scrap', Math.round(pl.scrap));
    if (pl.inventoryCount != null) put('player.inventoryCount', Math.round(pl.inventoryCount));
  }
  if (ra) {
    for (const k of ['lap', 'splitMs', 'bestLapMs', 'position']) if (ra[k] != null) put(`race.${k}`, Math.round(ra[k]));
  }
  if (b) {
    if (b.partsCount != null) put('build.partsCount', Math.round(b.partsCount));
    put('build.chassisIntegrity', _num(b.chassisIntegrity)); put('build.maxIntegrity', _num(b.maxIntegrity));
    if (b.motorTier != null) put('build.motorTier', Math.round(b.motorTier));
  }
  if (fl) {
    for (const k of ['hexHash', 'board', 'at']) if (typeof fl[k] === 'string') put(`flash.${k}`, fl[k]);
    for (const k of ['size', 'count']) if (fl[k] != null) put(`flash.${k}`, Math.round(fl[k]));
  }
  return c;
}
