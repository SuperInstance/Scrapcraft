/**
 * Trace-debugger tests — the VM decision trace + the "why did it do that?"
 * narrator. Covers: trace OFF by default (deterministic core untouched), ring
 * buffer bounds, entry shapes, the narrator's headline/reason linking, and an
 * end-to-end run of a real compiled wall-avoider program.
 */

import { TileVM } from '../TileVM.js';
import { compile } from '../TileCompiler.js';
import { VirtualRobot } from '../VirtualRobot.js';
import { MakerRuntime } from '../index.js';
import { EXAMPLE_WALL_AVOIDER } from '../TileProgram.js';
import { explainTrace, narrateSnapshot, describeAction } from '../explain.js';

class MockWorld {
  constructor() { this.dist = 1; }
  lightAt() { return 1; }
  distanceAhead() { return this.dist; }
  playerDistance() { return 99; }
  isSolidAt() { return false; }
  lineUnder() { return false; }
  temperatureAt() { return 0; }
}

export async function runExplainTests(ok, fail) {
  const check = (name, cond, extra = '') => (cond ? ok(name) : fail(name, extra));

  // ── trace is OFF by default (no overhead, no risk to the deterministic core) ─
  {
    // A minimal branch program: SENSE, CONST, CMP, JZ, ACT(stop), HALT
    const code = [
      { op: 'SENSE', sensor: 'distance_ahead' },
      { op: 'CONST', value: 0.3 },
      { op: 'CMP', cmp: 'lt' },
      { op: 'JZ', target: 6 },
      { op: 'ACT', action: 'turn', params: { dir: 'left', speed: 0.5 } },
      { op: 'JMP', target: 7 },
      { op: 'ACT', action: 'drive', params: { dir: 'forward', speed: 0.5 } },
      { op: 'HALT' },
    ];
    const robot = new VirtualRobot({});
    const world = new MockWorld();
    const vm = new TileVM(code, robot, world);      // no opts → trace off
    vm.step(0.016);
    check('trace off by default → empty', Array.isArray(vm.trace) && vm.trace.length === 0);
    check('trace off → traceCap 0', vm.traceCap === 0);
  }

  // ── trace ON records sense/cmp/branch/act in order ──────────────────────────
  {
    const code = [
      { op: 'SENSE', sensor: 'distance_ahead' },
      { op: 'CONST', value: 0.3 },
      { op: 'CMP', cmp: 'lt' },
      { op: 'JZ', target: 6 },
      { op: 'ACT', action: 'turn', params: { dir: 'left', speed: 0.5 } },
      { op: 'JMP', target: 7 },
      { op: 'ACT', action: 'drive', params: { dir: 'forward', speed: 0.5 } },
      { op: 'HALT' },
    ];
    const robot = new VirtualRobot({});
    const world = new MockWorld(); world.dist = 0.1;   // close wall → condition TRUE → turn
    const vm = new TileVM(code, robot, world, { traceCap: 48 });
    vm.step(0.016);
    const ops = vm.trace.map(e => e.op);
    check('trace records sense→cmp→branch→act', ops.join(',') === 'sense,cmp,branch,act,halt', ops.join(','));
    const sense = vm.trace.find(e => e.op === 'sense');
    check('sense entry carries sensor + value', sense.sensor === 'distance_ahead' && sense.value === 0.1);
    const cmp = vm.trace.find(e => e.op === 'cmp');
    check('cmp entry carries a,b,result', cmp.a === 0.1 && cmp.b === 0.3 && cmp.result === 1);
    const branch = vm.trace.find(e => e.op === 'branch');
    check('branch taken when condition true', branch.taken === true);
    const act = vm.trace.find(e => e.op === 'act');
    check('act entry is the guarded turn', act.action === 'turn' && act.params.dir === 'left');
    check('entries are stamped with step counter', typeof sense.t === 'number' && sense.t < act.t);
  }

  // ── far wall → condition FALSE → drives forward (else path) ──────────────────
  {
    const code = [
      { op: 'SENSE', sensor: 'distance_ahead' },
      { op: 'CONST', value: 0.3 },
      { op: 'CMP', cmp: 'lt' },
      { op: 'JZ', target: 6 },
      { op: 'ACT', action: 'turn', params: { dir: 'left', speed: 0.5 } },
      { op: 'JMP', target: 7 },
      { op: 'ACT', action: 'drive', params: { dir: 'forward', speed: 0.5 } },
      { op: 'HALT' },
    ];
    const vm = new TileVM(code, new VirtualRobot({}), Object.assign(new MockWorld(), { dist: 0.9 }), { traceCap: 48 });
    vm.step(0.016);
    const branch = vm.trace.find(e => e.op === 'branch');
    const act = vm.trace.find(e => e.op === 'act');
    check('branch NOT taken when condition false', branch.taken === false);
    check('act is the fall-through drive', act.action === 'drive');
  }

  // ── ring buffer stays bounded ───────────────────────────────────────────────
  {
    const vm = new TileVM([{ op: 'HALT' }], new VirtualRobot({}), new MockWorld(), { traceCap: 4 });
    for (let i = 0; i < 20; i++) vm._trace({ op: 'sense', sensor: 'x', value: i });
    check('ring buffer honors cap', vm.trace.length === 4);
    check('ring buffer keeps newest', vm.trace[vm.trace.length - 1].value === 19 && vm.trace[0].value === 16);
  }

  // ── enableTrace / clearTrace ────────────────────────────────────────────────
  {
    const vm = new TileVM([{ op: 'HALT' }], new VirtualRobot({}), new MockWorld());
    check('enableTrace turns it on', vm.enableTrace(8).traceCap === 8);
    vm._trace({ op: 'act', action: 'stop' });
    check('records after enable', vm.trace.length === 1);
    vm.clearTrace();
    check('clearTrace wipes entries', vm.trace.length === 0);
    vm.enableTrace(0);
    check('enableTrace(0) disables', vm.traceCap === 0);
  }

  // ── describeAction phrasing ─────────────────────────────────────────────────
  {
    check('describe drive forward', describeAction('drive', { dir: 'forward', speed: 0.5 }) === '🚗 Driving forward at 50%');
    check('describe drive backward', describeAction('drive', { dir: 'backward', speed: 1 }).startsWith('🚗 Driving backward'));
    check('describe turn left', describeAction('turn', { dir: 'left', speed: 0.5 }).includes('Turning left'));
    check('describe stop', describeAction('stop') === '🛑 Stopping');
    check('describe beep', describeAction('beep', { pitch: 'high' }).includes('Beeping'));
    check('describe unknown falls back', describeAction('nope', {}).startsWith('▶️'));
  }

  // ── explainTrace: empty, headline, reason ───────────────────────────────────
  {
    check('empty trace → waiting', explainTrace([]).headline === 'Waiting to start…');

    const trace = [
      { op: 'sense', sensor: 'distance_ahead', value: 0.12, t: 0 },
      { op: 'cmp', cmp: 'lt', a: 0.12, b: 0.3, result: 1, t: 1 },
      { op: 'branch', taken: true, t: 2 },
      { op: 'act', action: 'turn', params: { dir: 'left', speed: 0.5 }, t: 3 },
    ];
    const ex = explainTrace(trace);
    check('headline is the last action', ex.headline.includes('Turning left'));
    check('reason names the sensor, threshold, reading, outcome',
      ex.reason.includes('distance ahead') && ex.reason.includes('0.30') && ex.reason.includes('0.12') && ex.reason.includes('YES'),
      ex.reason);
    check('history is oldest→newest lines', Array.isArray(ex.history) && ex.history[ex.history.length - 1].includes('Turning left'));

    // false branch phrasing
    const trace2 = [
      { op: 'sense', sensor: 'distance_ahead', value: 0.9, t: 0 },
      { op: 'cmp', cmp: 'lt', a: 0.9, b: 0.3, result: 0, t: 1 },
      { op: 'branch', taken: false, t: 2 },
      { op: 'act', action: 'drive', params: { dir: 'forward', speed: 0.5 }, t: 3 },
    ];
    check('false-branch reason says no', explainTrace(trace2).reason.includes('→ no'));

    // an unconditional action has no borrowed reason
    check('unconditional action → empty reason',
      explainTrace([{ op: 'act', action: 'drive', params: { dir: 'forward', speed: 0.5 }, t: 0 }]).reason === '');

    // wait / halt headlines
    check('wait headline', explainTrace([{ op: 'wait', seconds: 2, t: 0 }]).headline.includes('Waiting 2s'));
    check('halt headline', explainTrace([{ op: 'halt', t: 0 }]).headline.includes('finished'));
  }

  // ── narrateSnapshot (the trace-off fallback) ────────────────────────────────
  {
    check('snapshot: still', narrateSnapshot({ robot: { drivePower: 0, turnPower: 0 } }).headline.includes('Holding still'));
    check('snapshot: driving', narrateSnapshot({ robot: { drivePower: 60, turnPower: 0 } }).headline.includes('Driving forward'));
    check('snapshot: turning', narrateSnapshot({ robot: { drivePower: 5, turnPower: -40 } }).headline.includes('Turning left'));
    check('snapshot: shows current tile', narrateSnapshot({ robot: { drivePower: 50 }, currentTile: 'action drive' }).reason.includes('action drive'));
  }

  // ── end-to-end: a real compiled program, run through MakerRuntime.explain() ──
  {
    const world = Object.assign(new MockWorld(), { dist: 0.1 });   // wall close
    const rt = new MakerRuntime(EXAMPLE_WALL_AVOIDER, { x: 0, z: 0, heading: 0 }, world);
    check('runtime enables trace', rt.vm.traceCap > 0);
    for (let i = 0; i < 5; i++) rt.tick(0.05);
    const ex = rt.explain();
    check('e2e explain produces a headline', typeof ex.headline === 'string' && ex.headline.length > 0);
    check('e2e trace captured decisions', rt.vm.trace.length > 0);
    check('e2e wall-avoider reacts to the near wall', /Turning|Driving|Stopping|Waiting/.test(ex.headline), ex.headline);
  }
}
