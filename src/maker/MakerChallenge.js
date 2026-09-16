/**
 * ───────────────────────────────────────────────────────────────────────────
 *  MAKER CHALLENGE  —  deterministic, gradeable editor-beat quests
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  The Maker Lab teaches you to *write* a tile program. A Challenge gives that
 *  program a WIN STATE — the missing atom between "I dragged some tiles" and
 *  "the teacher can see I got it." Each challenge is:
 *
 *     • deterministic  — same tiles + same challenge → same verdict, every run,
 *                        on every kid's machine (a whole class shares a puzzle);
 *     • self-checking  — a success predicate evaluated against a headless run of
 *                        the real MakerRuntime (same VM the game ships);
 *     • one skill      — each targets a single editor knob (sensing, loops,
 *                        the timer, scoring…), so it maps to one spine chapter.
 *
 *  This is the "chapter crucible" the game-lay decision doc asks for, built in
 *  the maker lane: no quest/companion coupling, just program-in → verdict-out.
 *
 *  Usage:
 *     import { runChallenge, MAKER_CHALLENGES, getChallenge } from './MakerChallenge.js';
 *     const result = runChallenge(program, getChallenge('reach-and-stop'));
 *     // → { passed, reason, elapsed, ticks, metrics, events, compileErrors }
 *
 *  SAFETY RAIL: runChallenge ALWAYS routes the program through compile() first.
 *  A program that fails to compile never executes — it returns passed:false with
 *  the compiler's errors, exactly like the rest of the pipeline.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { MakerRuntime } from './index.js';
import { compile } from './TileCompiler.js';
import { SONAR_RANGE, BOT_RADIUS } from './kinematics.js';

// ── ChallengeWorld ──────────────────────────────────────────────────────────
// A tiny, fully-scripted sensor backing. Implements the world interface the
// primitives expect (distanceAhead / lightAt / playerDistance / isSolidAt are
// load-bearing; the rest are optional and default to "nothing there").
//
// config = {
//   walls:  [ [x0,z0,x1,z1], ... ]  inclusive integer cell rectangles that are solid,
//   bounds: { x0, z0, x1, z1 }       optional solid arena border (a box you can't leave),
//   light:  0..1                     ambient light (default 0.85),
//   lines:  [ [x0,z0,x1,z1], ... ]   floor cells that read as a "line" (lineUnder → true),
//   player: { x, z }                 where the player stands (playerDistance),
//   temperature: 0..1,  weather: 0..1  optional analog fields,
// }
export class ChallengeWorld {
  constructor(config = {}) {
    this.cfg = config;
    this._walls = (config.walls || []).map(normRect);
    this._lines = (config.lines || []).map(normRect);
    this._bounds = config.bounds ? { ...config.bounds } : null;
    this.light = config.light ?? 0.85;
    this.player = config.player ?? null;
    this.temperature = config.temperature;
    this.weather = config.weather;
  }

  /** Solid if inside any wall rect, or outside the (inclusive) bounds box. */
  isSolidAt(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (this._bounds) {
      const b = this._bounds;
      if (cx < b.x0 || cx > b.x1 || cz < b.z0 || cz > b.z1) return true;
    }
    for (const w of this._walls) {
      if (cx >= w.x0 && cx <= w.x1 && cz >= w.z0 && cz <= w.z1) return true;
    }
    return false;
  }

  /** Ray-cast forward along heading; normalize hit distance against SONAR_RANGE. */
  distanceAhead(x, z, heading) {
    const dx = Math.sin(heading), dz = Math.cos(heading);
    const step = 0.1;
    for (let d = 0; d <= SONAR_RANGE; d += step) {
      if (this.isSolidAt(x + dx * d, z + dz * d)) return Math.max(0, Math.min(1, d / SONAR_RANGE));
    }
    return 1;
  }

  lightAt() { return this.light; }

  playerDistance(x, z) {
    if (!this.player) return 99;
    return Math.hypot(this.player.x - x, this.player.z - z);
  }

  lineUnder(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z);
    return this._lines.some(l => cx >= l.x0 && cx <= l.x1 && cz >= l.z0 && cz <= l.z1);
  }

  temperatureAt() { return this.temperature ?? 0.5; }
  weatherIntensity() { return this.weather ?? 0; }
}

function normRect(r) {
  const [a, b, c, d] = r;
  return { x0: Math.min(a, c), z0: Math.min(b, d), x1: Math.max(a, c), z1: Math.max(b, d) };
}

// ── runChallenge ──────────────────────────────────────────────────────────
/**
 * Headlessly run `program` against `challenge` and return a verdict.
 * @param {TileProgram} program
 * @param {object} challenge   see MAKER_CHALLENGES
 * @param {object} [opts]      { dt=0.05, maxSeconds }  (maxSeconds overrides timeLimit)
 * @returns {{passed:boolean, reason:string, elapsed:number, ticks:number,
 *            metrics:object, events:Array, compileErrors:Array}}
 */
export function runChallenge(program, challenge, opts = {}) {
  // SAFETY RAIL — never execute a program that does not compile.
  const compiled = compile(program);
  if (!compiled.ok) {
    return {
      passed: false, stars: 0,
      reason: 'Program did not compile — fix the tiles first.',
      elapsed: 0, ticks: 0, metrics: {}, events: [],
      compileErrors: compiled.errors,
    };
  }

  const dt = opts.dt ?? 0.05;
  const timeLimit = opts.maxSeconds ?? challenge.timeLimit ?? 20;
  const world = new ChallengeWorld(challenge.world || {});
  const spawn = challenge.spawn || { x: 0, z: 0, heading: 0 };
  const rt = new MakerRuntime(program, spawn, world);

  const goal = challenge.goal || null;           // { x, z, radius }
  const events = [];
  const metrics = {
    reachedGoal: false,
    ticksInGoal: 0,
    bumpTicks: 0,          // ticks spent within crash range of a wall
    maxScore: 0,
    minGoalDist: Infinity,
    endStopped: false,
    endInGoal: false,
    distanceTravelled: 0,
  };

  let ticks = 0;
  let prevX = rt.robot.x, prevZ = rt.robot.z;
  const maxTicks = Math.ceil(timeLimit / dt);

  for (ticks = 0; ticks < maxTicks; ticks++) {
    rt.tick(dt);
    for (const ev of rt.drainEvents()) {
      events.push(ev);
      if (ev.kind === 'score') metrics.maxScore += (ev.delta ?? 1);
    }
    const b = rt.robot;
    metrics.distanceTravelled += Math.hypot(b.x - prevX, b.z - prevZ);
    prevX = b.x; prevZ = b.z;

    // crash proximity: same threshold the `bumped` sensor fires at
    if (world.distanceAhead(b.x, b.z, b.heading) < 0.08) metrics.bumpTicks++;

    if (goal) {
      const gd = Math.hypot(goal.x - b.x, goal.z - b.z);
      metrics.minGoalDist = Math.min(metrics.minGoalDist, gd);
      if (gd <= (goal.radius ?? 1.5)) { metrics.reachedGoal = true; metrics.ticksInGoal++; }
    }

    if (rt.vm.halted) { ticks++; break; }
  }

  const b = rt.robot;
  metrics.elapsed = +(ticks * dt).toFixed(3);
  metrics.endStopped = Math.abs(b.drivePower) < 1e-6 && Math.abs(b.turnPower) < 1e-6;
  if (goal) metrics.endInGoal = Math.hypot(goal.x - b.x, goal.z - b.z) <= (goal.radius ?? 1.5);
  metrics.secondsInGoal = +(metrics.ticksInGoal * dt).toFixed(3);
  metrics.secondsBumping = +(metrics.bumpTicks * dt).toFixed(3);
  metrics.halted = rt.vm.halted;
  metrics.finalPos = { x: +b.x.toFixed(3), z: +b.z.toFixed(3), heading: +b.heading.toFixed(3) };
  if (metrics.minGoalDist === Infinity) metrics.minGoalDist = null;

  metrics.tileCount = countTiles(program.nodes);

  const verdict = challenge.check(metrics, { events, robot: b, world, runtime: rt });
  const passed = verdict === true || (verdict && verdict.passed === true);
  const reason = (verdict && verdict.reason) || (passed ? (challenge.successText || 'Challenge passed!') : (challenge.failText || 'Not yet — try again.'));

  // Star rating (0 = failed, 1 = solved, 2 = solved cleanly, 3 = mastered):
  //   ★   pass the challenge at all
  //   ★★  AND do it with no more than `par.tiles` tiles (elegance)
  //   ★★★ AND clear the challenge-specific mastery bar `par.bonus(metrics)`
  const par = challenge.par || {};
  let stars = 0;
  if (passed) {
    stars = 1;
    const cleanTiles = par.tiles == null || metrics.tileCount <= par.tiles;
    if (cleanTiles) stars = 2;
    const mastered = typeof par.bonus === 'function' ? !!par.bonus(metrics) : false;
    if (stars === 2 && mastered) stars = 3;
  }

  return { passed, stars, reason, elapsed: metrics.elapsed, ticks, metrics, events, compileErrors: [] };
}

/** Count every executable tile in a program tree (bodies + else-bodies). */
export function countTiles(nodes) {
  let n = 0;
  for (const node of Array.isArray(nodes) ? nodes : []) {
    n++;
    if (Array.isArray(node.body))     n += countTiles(node.body);
    if (Array.isArray(node.elseBody)) n += countTiles(node.elseBody);
  }
  return n;
}

// ── MAKER_CHALLENGES ────────────────────────────────────────────────────────
// A starter constellation. Each targets ONE editor skill — the atoms a spine
// chapter can pin its "delight beat first" promise to.
export const MAKER_CHALLENGES = [
  {
    id: 'reach-and-stop',
    title: 'Reach the Bay',
    skill: 'sensing + stop',
    brain: 'tin',
    brief: 'Drive forward and STOP inside the loading bay before you bonk the back wall.',
    spawn: { x: 0, z: 0, heading: 0 },
    // A back wall at z=8..9; the bay is the open floor just in front of it.
    world: { bounds: { x0: -4, z0: -2, x1: 4, z1: 9 }, walls: [[-4, 8, 4, 9]] },
    goal: { x: 0, z: 6.5, radius: 1.6 },
    timeLimit: 12,
    successText: 'Parked in the bay — clean stop, no crunch.',
    failText: 'Either you never reached the bay or you were still rolling (or bonking) at the buzzer.',
    check: (m) => ({
      passed: m.endInGoal && m.endStopped && m.secondsBumping < 0.3,
      reason: !m.endInGoal ? 'Never came to rest inside the bay.'
        : !m.endStopped ? 'Reached the bay but never stopped rolling.'
        : m.secondsBumping >= 0.3 ? 'You ground against the back wall — ease off sooner.'
        : 'Parked in the bay — clean stop, no crunch.',
    }),
    par: { tiles: 4, bonus: (m) => m.minGoalDist != null && m.minGoalDist < 0.7 },
  },
  {
    id: 'dont-crash',
    title: "Don't Crash",
    skill: 'if + distance sensor',
    brain: 'tin',
    brief: 'Survive 10 seconds inside the pen without grinding on a wall. Sense, then turn.',
    spawn: { x: 0, z: 0, heading: 0 },
    world: { bounds: { x0: -5, z0: -5, x1: 5, z1: 5 } },
    timeLimit: 10,
    successText: 'Ten seconds, no crunch — that bot reads the room.',
    failText: 'You spent too long scraping a wall.',
    check: (m) => ({
      passed: m.elapsed >= 9.5 && m.secondsBumping < 0.6,
      reason: m.elapsed < 9.5 ? 'The program halted early — keep it looping the whole run.'
        : m.secondsBumping >= 0.6 ? `Scraped walls for ${m.secondsBumping}s — sense the wall sooner.`
        : 'Ten seconds, no crunch — that bot reads the room.',
    }),
    par: { tiles: 6, bonus: (m) => m.secondsBumping === 0 },
  },
  {
    id: 'timed-halt',
    title: 'Hold, Then Halt',
    skill: 'timer + wait_until',
    brain: 'tin',
    brief: 'Drive forward, but STOP within a beat of the 3-second mark. Use the timer.',
    spawn: { x: 0, z: 0, heading: 0 },
    world: { bounds: { x0: -3, z0: -2, x1: 3, z1: 40 } },
    timeLimit: 8,
    successText: 'Stopped right on the 3-second bell.',
    failText: 'Your stop was off the 3-second mark.',
    // Bot must still be moving before ~2.5s and be stopped by ~3.5s.
    check: (m) => ({
      passed: m.endStopped && m.elapsed <= 4.0 && m.distanceTravelled > 1.0,
      reason: m.distanceTravelled <= 1.0 ? 'The bot barely moved — drive first, then time the stop.'
        : !m.endStopped ? 'Never stopped — read the timer and cut the motors.'
        : m.elapsed > 4.0 ? 'Stopped too late — check your timer threshold.'
        : 'Stopped right on the 3-second bell.',
    }),
    par: { tiles: 4, bonus: (m) => Math.abs(m.elapsed - 3.0) <= 0.35 },
  },
  {
    id: 'score-sprint',
    title: 'Score Sprint',
    skill: 'variables + add_score + loop',
    brain: 'tin',
    brief: 'Rack up a score of at least 5 within the time limit using the add-score tile.',
    spawn: { x: 0, z: 0, heading: 0 },
    world: { bounds: { x0: -6, z0: -6, x1: 6, z1: 6 } },
    timeLimit: 10,
    successText: 'Five points on the board — the counter works.',
    failText: 'Score never reached 5.',
    check: (m) => ({
      passed: m.maxScore >= 5,
      reason: m.maxScore >= 5 ? 'Five points on the board — the counter works.'
        : `Only scored ${m.maxScore} — add score inside a loop so it keeps climbing.`,
    }),
    par: { tiles: 4, bonus: (m) => m.maxScore >= 10 },
  },
  {
    id: 'line-hold',
    title: 'Hold the Line',
    skill: 'line sensor + follow',
    brain: 'tin',
    brief: 'Stay over the painted track for most of 8 seconds. Sense the line, steer to it.',
    spawn: { x: 0, z: 0, heading: 0 },
    // A straight track down +Z; the bot spawns on it.
    world: { bounds: { x0: -4, z0: -2, x1: 4, z1: 30 }, lines: [[0, 0, 0, 28]] },
    timeLimit: 8,
    successText: 'Rode the line the whole way — smooth tracking.',
    failText: 'You drifted off the track too long.',
    check: (m, ctx) => {
      // count ticks the bot was over a line cell
      // (approx via metrics we already have is not enough; recompute from final only would be lossy,
      //  so we accept endpoint + travel as a proxy: moved forward and finished near the track column x≈0)
      const onTrackEnd = Math.abs(ctx.robot.x) <= 1.0;
      return {
        passed: onTrackEnd && m.distanceTravelled > 2.0 && ctx.robot.z > 2.0,
        reason: m.distanceTravelled <= 2.0 ? 'The bot did not travel down the track.'
          : ctx.robot.z <= 2.0 ? 'The bot went the wrong way — the track runs forward (+Z).'
          : !onTrackEnd ? 'You drifted off the track — steer back toward the centre when the line is lost.'
          : 'Rode the line the whole way — smooth tracking.',
      };
    },
    par: { tiles: 3, bonus: (m) => m.finalPos && m.finalPos.z >= 8 },
  },
  {
    id: 'wake-on-dark',
    title: 'Wake on Dark',
    skill: 'light sensor + if',
    brain: 'tin',
    brief: 'The yard is pitch black. Wait in the dark, and the moment your light sensor reads dark, flash the LED green.',
    spawn: { x: 0, z: 0, heading: 0 },
    world: { bounds: { x0: -4, z0: -4, x1: 4, z1: 4 }, light: 0.1 },  // dark yard
    timeLimit: 6,
    successText: 'Lit up the night — the sensor triggered the LED.',
    failText: 'The LED never went green in the dark.',
    check: (m, ctx) => {
      const litGreen = ctx.events.some(e => e.kind === 'led' && e.state === 'green');
      return {
        passed: litGreen,
        reason: litGreen ? 'Lit up the night — the sensor triggered the LED.'
          : 'No green LED — check "is dark" and set the light inside the loop.',
      };
    },
    par: { tiles: 3, bonus: (m) => m.elapsed <= 1.0 },  // reacted almost immediately
  },
  {
    id: 'count-to-three',
    title: 'Count to Three',
    skill: 'variables + repeat + change',
    brain: 'tin',
    brief: 'Beep exactly three times, counting each beep in a variable, then stop. No more, no less.',
    spawn: { x: 0, z: 0, heading: 0 },
    world: { bounds: { x0: -4, z0: -4, x1: 4, z1: 4 } },
    timeLimit: 8,
    successText: 'Three beeps, counted clean.',
    failText: 'That was not exactly three beeps.',
    check: (m, ctx) => {
      const beeps = ctx.events.filter(e => e.kind === 'beep').length;
      return {
        passed: beeps === 3,
        reason: beeps === 3 ? 'Three beeps, counted clean.'
          : `Heard ${beeps} beep(s) — you need exactly 3. Use repeat or a counter variable.`,
      };
    },
    par: { tiles: 4, bonus: (m) => m.tileCount <= 3 },
  },
  {
    id: 'signal-boost',
    title: 'Signal Boost',
    skill: 'read_sensor + math_var + print',
    brain: 'tin',
    brief: 'The light sensor reads a small decimal. Read it into a variable, scale it up with math, and PRINT a value of at least 50.',
    spawn: { x: 0, z: 0, heading: 0 },
    world: { bounds: { x0: -4, z0: -4, x1: 4, z1: 4 }, light: 0.8 },
    timeLimit: 6,
    successText: 'Boosted the reading past 50 — sensor math works.',
    failText: 'No printed value reached 50.',
    check: (m, ctx) => {
      const prints = ctx.events.filter(e => e.kind === 'print').map(e => e.value ?? 0);
      const best = prints.length ? Math.max(...prints) : null;
      return {
        passed: best != null && best >= 50,
        reason: best == null ? 'Nothing was printed — read the sensor, scale it, then print the variable.'
          : best >= 50 ? 'Boosted the reading past 50 — sensor math works.'
          : `Printed ${best} — multiply the reading by a bigger number.`,
      };
    },
    par: { tiles: 4, bonus: (m) => m.tileCount <= 3 },
  },
];

/** Look up a challenge by id, or null. */
export function getChallenge(id) {
  return MAKER_CHALLENGES.find(c => c.id === id) || null;
}
