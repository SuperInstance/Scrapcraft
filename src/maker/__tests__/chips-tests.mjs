/**
 * Inference-chip test suite — the crystal form (papers/223).
 *
 *   1. SHA-256 + seeded growth determinism (same wafer/bath/night → same crystal)
 *   2. Cracked outcome: seeded, threshold-gated, jitter bounded ±15% (canon)
 *   3. ChipForge shelf: game-loop-ticked timer, sockets, save round-trip
 *   4. Mask gating: agentic tile without its chip = compile ERROR (the lattice
 *      doesn't bend); with the chip mounted = compiles
 *   5. Assembly gating: no wheels bolted on → no drive blocks
 *   6. Codegen snapshots: all six chips × both targets, honest templates,
 *      deterministic; cracked-chip jitter reaches the emitted delays
 *   7. Sim behaviour: SENTRY hysteresis, EMBER parks, WITNESS counts,
 *      ECHO ring-buffer replay, PILOT P-control
 *
 * Run: node src/maker/__tests__/run-tests.mjs  (folded into the harness)
 */

import {
  CHIPS, CHIP_IDS, SHELF_MS, SHARD_CRACK_THRESHOLD, MAX_SHARDS, JITTER_BOUNDS,
  sha256Hex, growthSeed, growOutcome, makeChip, ChipForge,
} from '../Chips.js';
import { TileProgram, T } from '../TileProgram.js';
import { compile } from '../TileCompiler.js';
import { toArduino, toMicroPython } from '../FirmwareGen.js';
import { VirtualRobot } from '../VirtualRobot.js';

// ── shared fixtures ─────────────────────────────────────────────────────────

/** Minimal sensor-backing world for the sim behaviour tests. */
class ChipMockWorld {
  constructor({ dist = 1, lineL = false, lineR = false, lineC = false, battery = 1 } = {}) {
    Object.assign(this, { dist, lineL, lineR, lineC, battery });
  }
  distanceAhead()    { return this.dist; }
  batteryLevel()     { return this.battery; }
  lineUnder(x, z)    { return this.lineC; }
  lineBearing()      { return this.lineR && !this.lineL ? 1 : (this.lineL && !this.lineR ? -1 : (this.lineC ? 0 : 0.6)); }
}

/** One agentic tile in a forever loop, with the chip (or not) mounted. */
function chipProgram(tileId, params = {}, chips = null) {
  const prog = new TileProgram({
    name: `Chip Test ${tileId}`,
    brain: 'tin',
    nodes: [T.forever([T.action(tileId, params), T.wait(1)])],
  });
  if (chips) prog.chips = chips;
  return prog;
}

const CLEAN = (type, tick = 1000) => makeChip({ type, shards: 0, shelfStartTick: tick });
const CRACKED = (type, tick = 1000) => makeChip({ type, shards: 6, shelfStartTick: tick });

export function runChipsTests(ok) {
  // ═══ 1. SHA-256 + growth determinism ═══════════════════════════════════════
  ok('sha256: empty-string vector', sha256Hex('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  ok('sha256: "abc" vector', sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  ok('sha256: 64-hex output', /^[0-9a-f]{64}$/.test(sha256Hex('scrapcraft')));

  const a = growOutcome({ type: 'echo', shards: 2, shelfStartTick: 4242 });
  const b = growOutcome({ type: 'echo', shards: 2, shelfStartTick: 4242 });
  ok('growth: same recipe+shards+tick → same crystal (seed)', a.seed === b.seed);
  ok('growth: determinism extends to cracked + jitter', a.cracked === b.cracked && a.jitter === b.jitter);

  const c = growOutcome({ type: 'echo', shards: 3, shelfStartTick: 4242 });
  ok('growth: different shard count → different seed', a.seed !== c.seed);
  const d = growOutcome({ type: 'echo', shards: 2, shelfStartTick: 9999 });
  ok('growth: different shelf night → different seed', a.seed !== d.seed);
  ok('growth: different chip type → different seed',
    growthSeed({ type: 'echo', shards: 1, shelfStartTick: 7 }) !== growthSeed({ type: 'sentry', shards: 1, shelfStartTick: 7 }));

  // ═══ 2. Cracked outcome (canon, not bug) ═══════════════════════════════════
  let neverCracksAtSafeDose = true;
  for (let tick = 0; tick < 400; tick++) {
    for (let s = 0; s <= SHARD_CRACK_THRESHOLD; s++) {
      if (growOutcome({ type: 'witness', shards: s, shelfStartTick: tick }).cracked) neverCracksAtSafeDose = false;
    }
  }
  ok(`cracked: ≤ ${SHARD_CRACK_THRESHOLD} shards never cracks`, neverCracksAtSafeDose);

  let someCrack = false, jitterInBounds = true;
  for (let tick = 0; tick < 500 && (!someCrack || !jitterInBounds); tick++) {
    const o = growOutcome({ type: 'ember', shards: MAX_SHARDS, shelfStartTick: tick });
    if (o.cracked) {
      someCrack = true;
      if (!(o.jitter >= 1 - JITTER_BOUNDS && o.jitter <= 1 + JITTER_BOUNDS)) jitterInBounds = false;
    }
  }
  ok('cracked: > threshold can crack (seeded)', someCrack);
  ok('cracked: jitter stays within seeded ±15%', jitterInBounds);
  ok('cracked: clean chips jitter exactly 1.0',
    growOutcome({ type: 'pilot', shards: 0, shelfStartTick: 5 }).jitter === 1);

  // ═══ 3. ChipForge — shelf timer, sockets, save round-trip ══════════════════
  const forge = new ChipForge();
  const g1 = forge.startGrowth('sentry', 2);
  ok('forge: growth starts with shelfStartTick stamp', g1 && g1.shelfStartTick === 0 && g1.doneMs === SHELF_MS);
  ok('forge: one bath per chip type', forge.startGrowth('sentry', 0) === null && forge.startGrowth('echo', 0) !== null);

  let finished = [];
  for (let t = 0; t < SHELF_MS; t += 1000) finished = forge.tick(1000);
  ok('forge: shelf not done one tick early', finished.length === 0 && forge.growing.length === 2);
  finished = forge.tick(1000);
  ok('forge: shelf completes on time (game-loop ticked)', finished.length === 2 && forge.ready.length === 2);
  ok('forge: outcome seeded from the shelf start tick',
    forge.ready[0].seed === growOutcome({ type: 'sentry', shards: 2, shelfStartTick: 0 }).seed);

  const sentryChip = forge.ready.find(ch => ch.type === 'sentry');
  ok('forge: mount fills a socket', forge.mount(sentryChip.uid, 0) && forge.mounted[0]?.type === 'sentry');
  ok('forge: mountedTypes gates tiles', JSON.stringify(forge.mountedTypes()) === '["sentry"]');
  ok('forge: unmount returns to shelf', forge.unmount(0)?.type === 'sentry' && forge.mounted[0] === null && forge.ready.some(ch => ch.uid === sentryChip.uid));

  const forge2 = new ChipForge();
  forge2.mount(sentryChip.uid, 1);
  const saved = JSON.parse(JSON.stringify(forge2.toSaveData()));
  const forge3 = new ChipForge();
  forge3.fromSaveData(saved);
  ok('forge: save/load round-trip keeps mounted chip + seed',
    forge3.mounted[1]?.type === 'sentry' && forge3.mounted[1]?.seed === sentryChip.seed);

  // ═══ 4. Mask gating — the lattice doesn't bend ═════════════════════════════
  for (const id of CHIP_IDS) {
    const tile = CHIPS[id].tile;
    const bare = compile(chipProgram(tile));
    ok(`mask: ${CHIPS[id].label} tile without chip → compile error`,
      !bare.ok && bare.errors.some(e => e.includes(CHIPS[id].label) && e.includes("lattice doesn't bend")));
    const mounted = compile(chipProgram(tile, {}, [id]));
    ok(`mask: ${CHIPS[id].label} tile with chip mounted → compiles`, mounted.ok);
  }
  ok('mask: descriptor chips ({type…}) gate too', compile(chipProgram('watch_obstacle', {}, [{ type: 'sentry', seed: 'ff', cracked: false }])).ok);
  ok('mask: a different chip does NOT unlock the tile',
    !compile(chipProgram('remember_path', {}, ['sentry'])).ok);

  // ═══ 5. Assembly gating — no wheels, no drive blocks ═══════════════════════
  const driveProg = new TileProgram({ nodes: [T.forever([T.action('drive', { dir: 'forward', speed: 0.5 })])], meta: { assembly: { wheels: false, motors: true } } });
  ok('assembly: drive with no wheels → error', !compile(driveProg).ok && compile(driveProg).errors[0].includes('wheels'));
  const motorProg = new TileProgram({ nodes: [T.forever([T.action('turn', { dir: 'right', speed: 0.5 })])], meta: { assembly: { wheels: true, motors: false } } });
  ok('assembly: turn with no motors → error', !compile(motorProg).ok && compile(motorProg).errors[0].includes('motors'));
  ok('assembly: legacy programs (no stamp) stay permissive',
    compile(new TileProgram({ nodes: [T.forever([T.action('drive', {})])] })).ok);

  // ═══ 6. Codegen snapshots — all six chips × both targets ═══════════════════
  const SNAP = {
    echo:   { cpp: ['echoBuf[64][2]', 'void echoReplay()', 'delay(500)'], py: ['def echo_replay()', 'sleep_ms(500)'] },
    sentry: { cpp: ['void sentryWatch(int tripPct,int clearPct)', 'sentryTripped'], py: ['def sentry_watch(trip, clear)', 'sentry_tripped'] },
    rumor:  { cpp: ['Serial1.write(f)', 'rumorIn=Serial1.read()'], py: ['uart.write(bytes([f]))', 'uart.any()'] },
    witness:{ cpp: ['#include <EEPROM.h>', 'EEPROM.update(addr,c)'], py: ['from esp32 import NVS', 'nvs.commit()'] },
    pilot:  { cpp: ['analogRead(IR_R)-analogRead(IR_L)', 'constrain(kp*err/4'], py: ['pilot_seek(kp, speed)', 'ir_r.read() - ir_l.read()'] },
    ember:  { cpp: ['ina219.getBusVoltage_V()', 'digitalWrite(LED_R,HIGH)'], py: ['ina.voltage() / 7.4', 'lr.value(1)'] },
  };
  for (const id of CHIP_IDS) {
    const prog = chipProgram(CHIPS[id].tile, {}, [{ type: id, seed: 'deadbeef', cracked: false }]);
    const cpp = toArduino(prog);
    const py  = toMicroPython(prog);
    for (const needle of SNAP[id].cpp) ok(`codegen ${id}/arduino: "${needle.slice(0, 30)}"`, cpp.includes(needle));
    for (const needle of SNAP[id].py)  ok(`codegen ${id}/micropython: "${needle.slice(0, 30)}"`, py.includes(needle));
    // snapshot determinism: same program → byte-identical firmware
    ok(`codegen ${id}: deterministic snapshots`, cpp === toArduino(prog) && py === toMicroPython(prog));
  }

  // jitter: a cracked chip mumbles in the EMITTED timing (not a comment)
  const cracked = chipProgram('remember_path', { mode: 'replay' }, [{ type: 'echo', seed: 'a1b2c3d4', cracked: true, jitter: 0.85 }]);
  const clean   = chipProgram('remember_path', { mode: 'replay' }, [{ type: 'echo', seed: 'a1b2c3d4', cracked: false, jitter: 1 }]);
  ok('codegen: cracked chip scales delays by seeded jitter',
    toArduino(cracked).includes('delay(850)') && toMicroPython(cracked).includes('sleep(0.85)'));
  ok('codegen: clean chip keeps honest timing',
    toArduino(clean).includes('delay(1000)') && toMicroPython(clean).includes('sleep(1.00)'));
  ok('codegen: cracked canon note in header',
    toArduino(cracked).includes('cracked ECHO chip') && toMicroPython(cracked).includes('cracked ECHO chip'));

  // ═══ 7. Sim behaviour — the chips dispose, the tiles propose ═══════════════
  // SENTRY: hysteresis — trips under, holds, releases only past clear
  {
    const robot = new VirtualRobot({ x: 0, z: 0 });
    const world = new ChipMockWorld({ dist: 0.5 });
    const watch = (p) => CHIPS && execTile('watch_obstacle', robot, p, world);
    robot.setDrive(0.6);
    watch({ trip: 0.25, clear: 0.4 });               // far — nothing
    ok('sim sentry: no trip when clear', !robot.sentryTripped && robot.drivePower === 0.6);
    world.dist = 0.2; watch({ trip: 0.25, clear: 0.4 });
    ok('sim sentry: trips + parks under threshold', robot.sentryTripped && robot.drivePower === 0);
    world.dist = 0.3; watch({ trip: 0.25, clear: 0.4 });
    ok('sim sentry: hysteresis holds inside the band', robot.sentryTripped);
    world.dist = 0.6; watch({ trip: 0.25, clear: 0.4 });
    ok('sim sentry: releases past clear', !robot.sentryTripped);
  }

  // EMBER: parks + flashes on low battery
  {
    const robot = new VirtualRobot({ x: 0, z: 0 });
    robot.setDrive(0.8);
    execTile('keep_warm', robot, { floor: 0.2 }, new ChipMockWorld({ battery: 0.5 }));
    ok('sim ember: warm battery keeps rolling', robot.drivePower === 0.8);
    execTile('keep_warm', robot, { floor: 0.2 }, new ChipMockWorld({ battery: 0.1 }));
    const evs = robot.drainEvents();
    ok('sim ember: parks + red flash on low battery',
      robot.drivePower === 0 && evs.some(e => e.kind === 'led' && e.state === 'red') && evs.some(e => e.kind === 'ember' && e.state === 'park'));
  }

  // WITNESS: milestone counters
  {
    const robot = new VirtualRobot({ x: 0, z: 0 });
    execTile('log_tick', robot, { milestone: 'laps' }, {});
    execTile('log_tick', robot, { milestone: 'laps' }, {});
    ok('sim witness: counts its ledger pages', robot.witnessCounters.laps === 2);
  }

  // ECHO: record → replay ring buffer through VirtualRobot.tick
  {
    const robot = new VirtualRobot({ x: 0, z: 0 });
    execTile('remember_path', robot, { mode: 'record', pwm: 128, spin: -64 }, {});
    execTile('remember_path', robot, { mode: 'replay' }, {});
    ok('sim echo: replay queue seeded from ring buffer', robot.replayQueue?.length === 1);
    robot.tick(0.6, new ChipMockWorld());
    ok('sim echo: replay drives the recorded order', Math.abs(robot.drivePower - 128 / 255) < 1e-9 && Math.abs(robot.turnPower + 64 / 255) < 1e-9);
    robot.tick(0.6, new ChipMockWorld());
    ok('sim echo: replay ends stopped', robot.drivePower === 0 && robot.turnPower === 0 && !robot.replayQueue);
  }

  // PILOT: P-control steers toward the line (inside a forever loop in real use)
  {
    const robot = new VirtualRobot({ x: 0, z: 0, heading: 0 });
    execTile('seek_line', robot, { speed: 0.4, gain: 0.6 }, new ChipMockWorld({ lineR: true }));
    ok('sim pilot: line right → steer right', robot.drivePower === 0.4 && robot.turnPower > 0);
    execTile('seek_line', robot, { speed: 0.4, gain: 0.6 }, new ChipMockWorld({ lineC: true }));
    ok('sim pilot: centred → dead ahead', robot.turnPower === 0);
  }

  // Program save/share carries chips
  {
    const p = chipProgram('watch_obstacle', {}, [{ type: 'sentry', seed: 'ff00', cracked: true, jitter: 1.1 }]);
    const rt = TileProgram.fromJSON(JSON.parse(JSON.stringify(p.toJSON())));
    ok('program: chips survive toJSON/fromJSON', rt.chips.length === 1 && rt.chips[0].type === 'sentry');
    ok('program: share code round-trips chips', TileProgram.fromShareCode(p.toShareCode()).mountedChipTypes().includes('sentry'));
    ok('program: legacy saves (no chips field) load empty', TileProgram.fromJSON({ name: 'x', nodes: [] }).chips.length === 0);
  }
}

/** Run one actuator's exec directly against a robot + world (sim spot tests). */
import { ACTUATORS } from '../primitives.js';
function execTile(prim, robot, params, world) {
  const def = ACTUATORS[prim];
  if (!def) throw new Error(`no such actuator ${prim}`);
  const filled = { ...params };
  for (const [k, schema] of Object.entries(def.params ?? {})) {
    if (filled[k] === undefined) filled[k] = schema.default;
  }
  def.exec(robot, filled, world);
}
