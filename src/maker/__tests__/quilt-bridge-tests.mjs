/**
 * QuiltBridge tests — the opt-in link to the scrap-quilt Worker.
 * Uses an injected fetch mock + injected clock, so nothing touches the network.
 * Verifies the load-bearing safety properties: OFF by default, no-PII/​formula
 * stripping, throttle, fail-soft, and the state→cell mapping.
 */

import { QuiltBridge, snapshotScrapQuiltCells, SENDABLE_CELLS, DEFAULT_QUILT_URL } from '../QuiltBridge.js';

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
}
