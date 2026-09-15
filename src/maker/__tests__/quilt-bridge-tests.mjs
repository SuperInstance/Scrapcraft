/**
 * QuiltBridge tests — the opt-in link to the scrap-quilt Worker.
 * Uses an injected fetch mock + injected clock, so nothing touches the network.
 * Verifies the load-bearing safety properties: OFF by default, no-PII/​formula
 * stripping, throttle, fail-soft, and the state→cell mapping.
 */

import { QuiltBridge, snapshotScrapQuiltCells, snapshotFromRun, activeTileLabel, SENDABLE_CELLS, DEFAULT_QUILT_URL } from '../QuiltBridge.js';

function mockFetch(responder) {
  const calls = [];
  const fn = async (url, opts) => { calls.push({ url, opts, body: opts?.body ? JSON.parse(opts.body) : null }); return responder(url, opts); };
  fn.calls = calls;
  return fn;
}
const okRes = (obj = { ok: true }) => ({ ok: true, json: async () => obj });

export async function runQuiltBridgeTests(ok, fail) {
  const check = (name, cond, extra = '') => (cond ? ok(name) : fail(name, extra));

  // ── OFF by default ─────────────────────────────────────────────────────────
  {
    const f = mockFetch(() => okRes());
    const b = new QuiltBridge({ fetch: f });   // no enabled → default off
    check('disabled by default', b.isEnabled() === false);
    const r = await b.postTick({ 'robot.x': 5 });
    check('disabled postTick returns null', r === null);
    check('disabled postTick makes no request', f.calls.length === 0);
  }

  // ── enabled happy path + endpoint/body shape ────────────────────────────────
  {
    const f = mockFetch(() => okRes({ ok: true, tickCount: 1, cells: {} }));
    const b = new QuiltBridge({ fetch: f, enabled: true, now: () => 10_000 });
    const r = await b.postTick({ 'robot.x': 29.8, 'robot.drivePower': 80 });
    check('enabled postTick returns worker json', r && r.tickCount === 1);
    check('POSTs to /tick', f.calls[0]?.url === `${DEFAULT_QUILT_URL}/tick`);
    check('body is { cells: {...} }', !!f.calls[0]?.body?.cells && f.calls[0].body.cells['robot.x'] === 29.8);
  }

  // ── sanitize: strips formula cells, PII, and non-finite ─────────────────────
  {
    const b = new QuiltBridge({ enabled: true, fetch: mockFetch(() => okRes()) });
    const clean = b.sanitize({
      'robot.x': 3, 'robot.drivePower': 50,
      'robot.speed': 9,          // formula cell — server computes, must drop
      'race.lapFrac': 0.5,       // formula cell — drop
      'spark.lastQuestion': 'my name is Sam',  // PII free text — drop
      'robot.z': NaN,            // non-finite — drop
      'program.state': 'running',
    });
    check('sanitize keeps sendable value cells', clean['robot.x'] === 3 && clean['program.state'] === 'running');
    check('sanitize drops formula cells', !('robot.speed' in clean) && !('race.lapFrac' in clean));
    check('sanitize drops the PII question cell', !('spark.lastQuestion' in clean));
    check('spark.lastQuestion is NOT sendable', !SENDABLE_CELLS.has('spark.lastQuestion'));
    check('sanitize drops NaN', !('robot.z' in clean));
    // an all-formula/PII payload yields no request
    const f2 = mockFetch(() => okRes());
    const b2 = new QuiltBridge({ enabled: true, fetch: f2, now: () => 1 });
    const r2 = await b2.postTick({ 'robot.speed': 1, 'spark.lastQuestion': 'hi' });
    check('empty-after-sanitize sends nothing', r2 === null && f2.calls.length === 0);
  }

  // ── throttle ────────────────────────────────────────────────────────────────
  {
    let t = 0;
    const f = mockFetch(() => okRes());
    const b = new QuiltBridge({ enabled: true, fetch: f, minIntervalMs: 500, now: () => t });
    t = 1000; await b.postTick({ 'robot.x': 1 });
    t = 1200; const r = await b.postTick({ 'robot.x': 2 });   // 200ms later → throttled
    check('second post within interval is throttled', r === null && f.calls.length === 1);
    t = 1700; await b.postTick({ 'robot.x': 3 });             // 700ms after first → allowed
    check('post after interval is allowed', f.calls.length === 2);
  }

  // ── fail-soft: never throws ─────────────────────────────────────────────────
  {
    const bReject = new QuiltBridge({ enabled: true, now: () => 1, fetch: async () => { throw new Error('network down'); } });
    let threw = false, r;
    try { r = await bReject.postTick({ 'robot.x': 1 }); } catch { threw = true; }
    check('fetch rejection does not throw', !threw && r === null);
    const bNotOk = new QuiltBridge({ enabled: true, now: () => 1, fetch: async () => ({ ok: false, json: async () => ({}) }) });
    check('non-ok response returns null', (await bNotOk.postTick({ 'robot.x': 1 })) === null);
  }

  // ── predict / chat hit the right endpoints ──────────────────────────────────
  {
    const f = mockFetch((url) => okRes({ endpoint: url }));
    const b = new QuiltBridge({ enabled: true, fetch: f });
    await b.predict({ 'robot.x': 1 }, 30);
    await b.chat('why did it stop?', { 'robot.x': 1 });
    check('predict → /predict with ticks', f.calls[0].url.endsWith('/predict') && f.calls[0].body.ticks === 30);
    check('chat → /chat with question+cells', f.calls[1].url.endsWith('/chat') && f.calls[1].body.question === 'why did it stop?');
  }

  // ── snapshotScrapQuiltCells mapping ─────────────────────────────────────────
  {
    const cells = snapshotScrapQuiltCells({
      robot: { x: 1.234, z: 5, heading: Math.PI / 2, drivePower: 0.8, turnPower: -0.1, batteryV: 7.4, gripper: 'open' },
      sensors: { distance_ahead: 0.6, line_under: true },
      program: { currentTile: 'drive', ip: 3, tilesRun: 40, state: 'running' },
      player: { x: 10, z: 20, biome: 'heaps', scrap: 12, inventoryCount: 3 },
      race: { lap: 2, splitMs: 3400, position: 1 },
    });
    check('maps robot pose', cells['robot.x'] === 1.234 && cells['robot.z'] === 5);
    check('converts heading rad→deg', cells['robot.heading'] === 90);
    check('converts drivePower -1..1 → pct', cells['robot.drivePower'] === 80 && cells['robot.turnPower'] === -10);
    check('maps sensors to robot.sensor.*', cells['robot.sensor.ultrasonic'] === 0.6 && cells['robot.sensor.ir'] === 1);
    check('maps program + player + race', cells['program.state'] === 'running' && cells['player.scrap'] === 12 && cells['race.lap'] === 2);
    check('emits only sendable ids (no formula cells)', Object.keys(cells).every(id => SENDABLE_CELLS.has(id)));
    check('omits absent groups', !('build.partsCount' in cells) && !('flash.board' in cells));
  }

  // ── activeTileLabel: source-map + program-counter → human label ─────────────
  {
    const rt = {
      vm: { pc: 5 },
      sourceMap: [
        { pc: 0, nodeId: 'a' },
        { pc: 4, nodeId: 'b' },
        { pc: 8, nodeId: 'c' },
      ],
      program: { nodes: [
        { id: 'a', type: 'action', prim: 'drive_forward' },
        { id: 'b', type: 'if', cond: { sensor: 'distance_ahead' } },
        { id: 'c', type: 'forever' },
      ] },
    };
    check('label picks the tile at/under the pc', activeTileLabel(rt) === 'if if distance_ahead');
    rt.vm.pc = 1;
    check('label resolves prim tiles', activeTileLabel(rt) === 'action drive_forward');
    rt.vm.pc = 9;
    check('label special-cases forever', activeTileLabel(rt) === 'forever ∞');
    check('label is — with no runtime', activeTileLabel(null) === '—' && activeTileLabel({}) === '—');
    check('label is — when pc precedes first entry', activeTileLabel({ vm: { pc: -1 }, sourceMap: rt.sourceMap, program: rt.program }) === '—');
    // nested nodes (inside a forever body) resolve too
    const nested = {
      vm: { pc: 2 }, sourceMap: [{ pc: 0, nodeId: 'root' }, { pc: 2, nodeId: 'inner' }],
      program: { nodes: [{ id: 'root', type: 'forever', body: [{ id: 'inner', type: 'action', prim: 'beep' }] }] },
    };
    check('label finds nested body nodes', activeTileLabel(nested) === 'action beep');
  }

  // ── snapshotFromRun: runtime + world adapter → cells (the decoupled path) ────
  {
    const world = {
      distanceAhead: () => 0.42,
      lineUnder: () => true,
    };
    const rt = {
      robot: { x: 2, z: 3, heading: 0, drivePower: 0.5 },
      vm: { pc: 0, steps: 17 },
      sourceMap: [{ pc: 0, nodeId: 'a' }],
      program: { nodes: [{ id: 'a', type: 'action', prim: 'drive_forward' }] },
      isRunning: true,
      world,
    };
    const cells = snapshotFromRun(rt, world);
    check('snapshotFromRun maps robot pose', cells['robot.x'] === 2 && cells['robot.drivePower'] === 50);
    check('snapshotFromRun samples world sensors', cells['robot.sensor.ultrasonic'] === 0.42 && cells['robot.sensor.ir'] === 1);
    check('snapshotFromRun sets program tilesRun/state/label',
      cells['program.tilesRun'] === 17 && cells['program.state'] === 'running' && cells['program.currentTile'] === 'action drive_forward');
    check('snapshotFromRun emits only sendable ids', Object.keys(cells).every(id => SENDABLE_CELLS.has(id)));
    // stopped runtime, no world → still safe, no sensor cells
    const stopped = snapshotFromRun({ robot: { x: 1 }, vm: { pc: 0, steps: 0 }, sourceMap: [], program: { nodes: [] }, isRunning: false }, null);
    check('snapshotFromRun state=stopped when not running', stopped['program.state'] === 'stopped');
    check('snapshotFromRun without world omits sensors', !('robot.sensor.ultrasonic' in stopped));
    check('snapshotFromRun with no runtime returns {}', Object.keys(snapshotFromRun(null, world)).length === 0);
    // extra state groups merge through (e.g. player context from the game loop)
    const withPlayer = snapshotFromRun(rt, world, { player: { x: 9, z: 8, scrap: 5 } });
    check('snapshotFromRun merges extra state groups', withPlayer['player.x'] === 9 && withPlayer['player.scrap'] === 5);
  }
}
