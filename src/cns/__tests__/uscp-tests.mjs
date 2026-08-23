/**
 * USCP telemetry tests — the Rift emitter (RIFT-PHASE-1).
 *
 * Pure tests: no DOM, no network. A spy fetch and a fake clock prove the
 * four load-bearing promises: batching, packet shape, the opt-in gate,
 * and fail-soft (a dead endpoint never touches gameplay).
 *
 * Exported as runUscpTests(pass, fail) so run-tests.mjs folds this into
 * the one harness.
 */

import {
  USCP_ENDPOINT, SIGNAL_TYPES, buildPacket, mapForemanEvent,
  UscpEmitter, installUscp,
} from '../uscp.js';

export async function runUscpTests(pass, fail) {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const ok = (name, cond, extra = '') => {
    if (cond) pass(name);
    else fail(name, extra);
  };

  // spy fetch: records calls, programmable outcome
  const spyFetch = (outcome = { ok: true, status: 200 }) => {
    const calls = [];
    const fn = (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      if (outcome.throw) return Promise.reject(new Error('endpoint down'));
      return Promise.resolve(outcome);
    };
    fn.calls = calls;
    return fn;
  };
  const fakeClock = () => {
    let t = 1000;
    return { now: () => t, advance: (ms) => { t += ms; } };
  };

  // ══ 1. Packet shape — {payload:{signal_type,data}, metadata:{lore_ref,t}} ══
  console.log('\nUSCP · packet shape');
  {
    const p = buildPacket('block_mined', { item: 'iron_scrap' }, 42);
    ok('top-level keys are payload + metadata only',
      Object.keys(p).length === 2 && 'payload' in p && 'metadata' in p);
    ok('payload.signal_type', p.payload.signal_type === 'block_mined');
    ok('payload.data carries structured event', p.payload.data.item === 'iron_scrap');
    ok('metadata.lore_ref resolves to worldbible namespace',
      p.metadata.lore_ref === 'lore://worldbible/items#iron_scrap');
    ok('metadata.t stamps the event', p.metadata.t === 42);

    const lap = buildPacket('lap_complete', { secs: 41.2 });
    ok('lap lore grounds in the yard bible',
      lap.metadata.lore_ref === 'lore://worldbible/yard-bible#race-oval');

    const line = buildPacket('companion_line', { speaker: 'rivet' });
    ok('companion lines ground in the characters namespace',
      line.metadata.lore_ref === 'lore://worldbible/characters/rivet');

    const prog = buildPacket('program_run', {});
    ok('program runs ground in the maker lab', prog.metadata.lore_ref.startsWith('lore://scrapcraft/'));

    ok('every signal type has a lore ref', SIGNAL_TYPES.every((s) =>
      buildPacket(s, { item: 'x', speaker: 'x' }).metadata.lore_ref.startsWith('lore://')));
  }

  // ══ 2. Kid-safe scrub — free text never ships ═════════════════════════════
  console.log('\nUSCP · payload scrub');
  {
    const p = buildPacket('coach_radio', {
      dir: 'tx', intent: 'goto',
      text: 'hey coach please drive to the big pile',
      nested: { secret: 'x' }, n: 3,
    });
    ok('short clean strings pass', p.payload.data.dir === 'tx');
    ok('numbers pass', p.payload.data.n === 3);
    ok('free text is dropped', !('text' in p.payload.data));
    ok('nested objects are dropped', !('nested' in p.payload.data));
    const long = buildPacket('block_mined', { item: 'a'.repeat(99) });
    ok('long strings truncate to 32', long.payload.data.item.length === 32);
  }

  // ══ 3. Event mapping — one vocabulary out ═════════════════════════════════
  console.log('\nUSCP · event mapping');
  {
    const m1 = mapForemanEvent('mine_iron_scrap');
    ok('mine_* → block_mined', m1?.signal === 'block_mined' && m1.data.item === 'iron_scrap');
    const m2 = mapForemanEvent('craft_gear');
    ok('craft_* → item_crafted', m2?.signal === 'item_crafted' && m2.data.item === 'gear');
    ok('quest_complete passes through', mapForemanEvent('quest_complete')?.signal === 'quest_complete');
    ok('foreman chatter is not a signal', mapForemanEvent('near_tower') === null);
    ok('lucky_find is not a signal (no mining happened)', mapForemanEvent('lucky_find') === null);
  }

  // ══ 4. Opt-in gating — OFF means inert ════════════════════════════════════
  console.log('\nUSCP · opt-in gate');
  {
    const f = spyFetch();
    let enabled = false;
    const e = new UscpEmitter({ fetch: f, isEnabled: () => enabled, maxBatch: 5, flushMs: 10_000 });
    e.witness('block_mined', { item: 'iron_scrap' });
    e.witness('lap_complete', { secs: 40 });
    ok('disabled: nothing queues', e._queue.length === 0);
    e.flush();
    ok('disabled: nothing sends', f.calls.length === 0);

    enabled = true;
    e.witness('block_mined', { item: 'copper_wire' });
    e.flush();
    ok('enabled: batch sends', f.calls.length === 1);
    ok('batch envelope carries source + packets',
      f.calls[0].body.source === 'scrapcraft' && Array.isArray(f.calls[0].body.packets));
    ok('packet in the batch has the USCP shape',
      f.calls[0].body.packets[0].payload.signal_type === 'block_mined'
      && typeof f.calls[0].body.packets[0].metadata.lore_ref === 'string');
    ok('POSTs to the fleet endpoint with JSON', f.calls[0].url === USCP_ENDPOINT
      && f.calls[0].init.method === 'POST'
      && f.calls[0].init.headers['Content-Type'] === 'application/json');
    ok('keepalive set for tab-close flushes', f.calls[0].init.keepalive === true);
  }

  // ══ 5. Batching — size trigger + age trigger ══════════════════════════════
  console.log('\nUSCP · batching');
  {
    const f = spyFetch();
    const e = new UscpEmitter({ fetch: f, isEnabled: () => true, maxBatch: 3, flushMs: 60_000 });
    e.witness('block_mined', {});
    e.witness('block_mined', {});
    ok('under maxBatch: queued, not sent', e._queue.length === 2 && f.calls.length === 0);
    e.witness('block_mined', {});
    ok('hitting maxBatch flushes one batch of 3',
      f.calls.length === 1 && f.calls[0].body.packets.length === 3);
    ok('queue drains after flush', e._queue.length === 0);
    e.witness('lap_complete', { secs: 1 });
    ok('post-flush events start a new batch', e._queue.length === 1);
  }
  {
    // age trigger: the oldest packet forces a flush after flushMs
    const f = spyFetch();
    const clock = fakeClock();
    const e = new UscpEmitter({ fetch: f, now: clock.now, isEnabled: () => true, maxBatch: 50, flushMs: 15_000 });
    const timers = [];
    const origSet = globalThis.setTimeout;
    globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
    try {
      e.witness('block_mined', {});
      ok('age flush schedules a timer', timers.length === 1);
      ok('timer fires within flushMs', timers[0].ms <= 15_000);
      clock.advance(15_000);
      timers[0].fn();
      ok('age-triggered flush sends', f.calls.length === 1 && f.calls[0].body.packets.length === 1);
    } finally {
      globalThis.setTimeout = origSet;
    }
  }

  // ══ 6. Fail-soft — a dead endpoint never touches gameplay ═════════════════
  console.log('\nUSCP · fail-soft');
  {
    // fetch rejects (endpoint unreachable)
    const f = spyFetch({ throw: true });
    const e = new UscpEmitter({ fetch: f, isEnabled: () => true, maxBatch: 2 });
    let threw = false;
    try {
      e.witness('block_mined', {});
      e.witness('block_mined', {});
    } catch { threw = true; }
    ok('witness never throws while endpoint is down', !threw);
    await tick();
    ok('failed batch is counted as dropped', e.dropped === 2 && e.sent === 0);

    // non-2xx response: drop, don't retry-storm
    const f2 = spyFetch({ ok: false, status: 500 });
    const e2 = new UscpEmitter({ fetch: f2, isEnabled: () => true, maxBatch: 2 });
    e2.witness('block_mined', {});
    e2.witness('block_mined', {});
    await tick();
    ok('non-2xx drops silently', e2.dropped === 2 && e2.sent === 0);

    // no fetch at all (ancient browser): still nothing throws
    const e3 = new UscpEmitter({ fetch: null, isEnabled: () => true, maxBatch: 1 });
    e3.witness('block_mined', {});
    ok('missing fetch is tolerated', true);

    // emitter recovers when the endpoint comes back
    let up = false;
    const f4 = spyFetch();
    f4; // eslint bedside
    const e4 = new UscpEmitter({ fetch: (u, i) => (up ? Promise.resolve({ ok: true, status: 200 }) : Promise.reject(new Error('down'))), isEnabled: () => true, maxBatch: 2 });
    e4.witness('block_mined', {}); e4.witness('block_mined', {});
    up = true;
    e4.witness('lap_complete', {}); e4.witness('lap_complete', {});
    await tick();
    ok('recovery: later batches send once the endpoint lives', e4.sent === 2 && e4.dropped === 2);
  }

  // ══ 7. installUscp — choke-point taps, chained + idempotent ═══════════════
  console.log('\nUSCP · game wiring');
  {
    const makeGame = () => ({
      foreman: { onEvent(event, data) { this.seen.push(['foreman', event]); }, seen: [] },
      companions: {
        activeId: 'rivet',
        observe(event, detail) { this.obs.push(event); return { ok: true }; },
        say(text, meta) { this.said.push(text); return true; },
        obs: [], said: [],
      },
      radio: {
        sendNudge(text) { this.tx.push(text); },
        _beginAck(bot, d, ch) { this.rx.push(d?.intent); },
        tx: [], rx: [],
      },
    });

    // gating via injected loadConfig
    let cfg = {};
    const game = makeGame();
    const emitter = installUscp(game, {
      loadConfig: () => cfg,
      fetch: spyFetch(),
      now: () => 5,
      maxBatch: 100, flushMs: 60_000,
    });
    ok('install returns an emitter', emitter instanceof UscpEmitter);

    game.foreman.onEvent('mine_iron_scrap', {});
    game.companions.observe('lap_complete', { secs: 39 });
    game.companions.say('you did it!', { mood: 'happy' });
    game.radio.sendNudge('go left');
    game.radio._beginAck({}, { intent: 'goto' }, 'coach');
    ok('disabled config: events flow but nothing queues', emitter._queue.length === 0);
    ok('original streams still run (foreman)', game.foreman.seen.length === 1);
    ok('original streams still run (observe)', game.companions.obs.length === 1);
    ok('original streams still run (say)', game.companions.said.length === 1);
    ok('original streams still run (radio tx)', game.radio.tx.length === 1);

    cfg = { uscpEnabled: true };
    game.foreman.onEvent('mine_copper_wire', {});
    game.companions.observe('program_run', { note: 'x' });
    game.companions.observe('greet_return', {});       // not a signal
    game.radio.sendNudge('go right');
    game.radio._beginAck({}, { intent: 'stop' }, 'coach');
    ok('enabled: 4 signals queued (mine, program, tx, rx)', emitter._queue.length === 4, `got ${emitter._queue.length}`);
    ok('mined packet lore grounds', emitter._queue[0].metadata.lore_ref === 'lore://worldbible/items#copper_wire');
    ok('radio tx/rx are distinct packets',
      emitter._queue[2].payload.data.dir === 'tx' && emitter._queue[3].payload.data.dir === 'rx');

    // idempotent install: second install doesn't double-tap
    const before = emitter._queue.length;
    installUscp(game, { loadConfig: () => cfg, fetch: spyFetch() });
    game.foreman.onEvent('mine_iron_scrap', {});
    ok('double-install does not double-queue', emitter._queue.length === before + 1);

    // fail-soft install: no game → null, never a throw
    ok('install on missing game returns null', installUscp(null) === null);
    ok('install tolerates missing radio/companions',
      installUscp({ foreman: { onEvent() {} } }, { loadConfig: () => ({}) }) instanceof UscpEmitter);
  }

  // ══ 8. Endpoint override — teachers can point at a local fleet ════════════
  console.log('\nUSCP · endpoint');
  {
    const f = spyFetch();
    const e = new UscpEmitter({ fetch: f, isEnabled: () => true, endpoint: 'http://localhost:8787/api/uscp', maxBatch: 1 });
    e.witness('block_mined', {});
    ok('custom endpoint honored (local fleet dev)', f.calls[0]?.url === 'http://localhost:8787/api/uscp');
  }
}
