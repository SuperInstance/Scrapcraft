/**
 * ───────────────────────────────────────────────────────────────────────────
 *  MAKER LAB  —  public API
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  The one import the rest of the game needs. Wires a tile program + a virtual
 *  robot + a sensor-backing world into a single tickable runtime.
 *
 *      const rt = new MakerRuntime(program, { x, z, heading }, worldAdapter);
 *      // each game frame:
 *      rt.tick(dt);                       // runs brain, advances robot physics
 *      syncMeshTo(rt.robot);              // integration layer positions ScrapBot
 *      for (const ev of rt.drainEvents()) handleEffect(ev);  // beeps/leds/...
 *
 *  See DEV_GUIDE_scrapbot_integration.md for the glue to the live ScrapBot.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { compile } from './TileCompiler.js';
import { TileVM } from './TileVM.js';
import { VirtualRobot } from './VirtualRobot.js';

export { TileProgram, T } from './TileProgram.js';
export { compile } from './TileCompiler.js';
export { TileVM } from './TileVM.js';
export { VirtualRobot } from './VirtualRobot.js';
export { toArduino, toMicroPython, toWokwiDiagram, toWiringSVG } from './FirmwareGen.js';
export { SENSORS, ACTUATORS, BRAINS, chipForPrimitive, validateParams } from './primitives.js';
export { GameWorldAdapter } from './GameWorldAdapter.js';
export { QuiltBridge, snapshotScrapQuiltCells, snapshotFromRun, activeTileLabel, isQuiltBridgeEnabled, setQuiltBridgeEnabled, DEFAULT_QUILT_URL } from './QuiltBridge.js';
export { explainTrace, narrateSnapshot, describeAction } from './explain.js';
import { explainTrace } from './explain.js';
export { runChallenge, getChallenge, MAKER_CHALLENGES, ChallengeWorld, countTiles } from './MakerChallenge.js';
export { ChallengeProgress } from './ChallengeProgress.js';
export { encodeReplay, decodeReplay, verifyReplay, isDeterministic } from './ChallengeReplay.js';
export {
  CHIPS, CHIP_IDS, SOCKET_COUNT, SHELF_MS, SHARD_CRACK_THRESHOLD, MAX_SHARDS,
  JITTER_BOUNDS, ECHO_CAP, ECHO_STEP_S,
  sha256Hex, rngFromSeed, growthSeed, growOutcome, makeChip, ChipForge,
} from './Chips.js';
// Fleet Learning: deterministic federated-tiny-ML ENGINE (frozen backbone +
// tiny trainable head + FedAvg). Headless core only — a classroom tile/UI is
// a follow-up. See FleetLearning.js's docstring for the design.
export { makeFeatures, trainHead, predict, fedAvg, fedRound, RAW_DIM, FEATURE_DIM } from './FleetLearning.js';

export class MakerRuntime {
  /**
   * @param {TileProgram} program
   * @param {object} spawn   { x, z, heading }
   * @param {object} world   sensor backing (GameWorldAdapter or a mock)
   * @param {object} opts    { seed } — set seed for a deterministic run (competitions)
   */
  constructor(program, spawn = {}, world = {}, opts = {}) {
    this.program = program;
    this.world = world;
    this._seed = opts.seed;
    this.robot = new VirtualRobot(spawn);

    const result = compile(program);
    this.errors = result.errors;
    this.warnings = result.warnings;
    this.ok = result.ok;
    this.sourceMap = result.sourceMap ?? [];
    this.vm = new TileVM(result.bytecode, this.robot, world, { traceCap: 48, seed: opts.seed });

    this.elapsedMs    = 0;
    this.stepsPerSec  = 0;
    this.budgetPct    = 0;
    this._prevSteps   = 0;
  }

  /** Advance one frame: run the brain, then move the robot.
   *  @param {number} timeScale  Optional speed multiplier (Neural Optimizer: 1.4).
   */
  tick(dt, timeScale = 1) {
    this.vm.step(dt * timeScale);
    this.robot.tick(dt, this.world);
    this.elapsedMs   += dt * 1000;
    const delta       = this.vm.steps - this._prevSteps;
    this._prevSteps   = this.vm.steps;
    // budgetPct: fraction of per-frame step budget consumed (0=idle, 100=maxed out every frame)
    this.budgetPct    = Math.round(Math.min(100, delta / 4096 * 100));
    // keep stepsPerSec for backwards compat (raw throughput, informational)
    this.stepsPerSec  = dt > 0 ? Math.round(delta / dt) : this.stepsPerSec;
  }

  /** Hot-swap the program (e.g. after the kid edits tiles) without respawning. */
  load(program) {
    this.program = program;
    const result = compile(program);
    this.errors = result.errors;
    this.warnings = result.warnings;
    this.ok = result.ok;
    this.sourceMap = result.sourceMap ?? [];
    this.vm = new TileVM(result.bytecode, this.robot, this.world, { traceCap: 48, seed: this._seed });
    this.elapsedMs   = 0;
    this.stepsPerSec = 0;
    this.budgetPct   = 0;
    this._prevSteps  = 0;
  }

  drainEvents() { return this.robot.drainEvents(); }
  get isRunning() { return this.vm.isRunning; }

  /** Plain-English "why did it do that?" narration of the live decision trace.
   *  Deterministic and offline — see explain.js. */
  explain() { return explainTrace(this.vm?.trace ?? []); }
}
