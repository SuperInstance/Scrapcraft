/**
 * ───────────────────────────────────────────────────────────────────────────
 *  BROKEN BOT  —  debugging as PLAY
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Every scenario is a REAL TileProgram with ONE seeded bug, a symptom the kid
 * reads ("spins left forever"), hypothesis options, and a fix verified by
 * RUNNING the kid's edited program in the real VM against a deterministic
 * virtual world — no answer key matching, the physics decides. If the fixed
 * program doesn't cure the symptom, it isn't fixed.
 *
 * Each scenario certifies `debugging` plus the concept the bug is about
 * (conceptsInScenario): left-forever → conditionals, never-stops →
 * loops-until, wrong-sensor → sensors-overview. Completing a clinic feeds
 * the ConceptLedger via ledgerEvent() (a program_ran + a quest_done-style
 * carrier; the synthetic quest ids live in QUEST_CONCEPTS).
 *
 * Headless: no DOM, no game imports — only the maker VM + virtual robot.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { MakerRuntime, TileProgram, T } from '../maker/index.js';

// ── deterministic test worlds ───────────────────────────────────────────────

/** Open yard: sonar always clear, nothing solid. The left-forever stage. */
function openWorld() {
  return {
    distanceAhead: () => 1,
    lightAt: () => 0.5,
    isSolidAt: () => false,
  };
}

/** Corridor with one wall ahead: sonar fed from the robot's live pose. */
function corridorWorld(WALL_Z) {
  const world = {
    _d: 1,
    distanceAhead: () => world._d,
    lightAt: () => 0.5,
    isSolidAt: (x, z) => z >= WALL_Z,
  };
  return world;
}

/** Bright flashlight world: no walls, light constant. The wrong-sensor stage. */
function brightWorld(brightness) {
  return {
    distanceAhead: () => 1,
    lightAt: () => brightness,
    isSolidAt: () => false,
  };
}

function drive(program, world, { steps, dt = 0.05, spawn = { x: 0, z: 0, heading: 0 }, onTick } = {}) {
  const rt = new MakerRuntime(program, spawn, world);
  for (let i = 0; i < steps; i++) {
    onTick?.(rt, world);
    rt.tick(dt);
  }
  return rt;
}

const displacement = (r, x = 0, z = 0) => Math.hypot(r.x - x, r.z - z);

// ── program builders (T.* constructors — real, compilable programs) ─────────

/** Wall-avoider. `cmp` is the seeded knob: 'lt' is correct, 'gt' is the bug. */
function wallAvoider(cmp) {
  return new TileProgram({
    name: `Wall Avoider (${cmp === 'lt' ? 'fixed' : 'broken'})`,
    brain: 'tin',
    nodes: [
      T.forever([
        T.ifElse(
          T.cond('distance_ahead', cmp, 0.3),
          [T.action('turn', { dir: 'left', speed: 0.6 }), T.wait(0.4)],
          [T.action('drive', { dir: 'forward', speed: 0.6 })],
        ),
      ]),
    ],
  });
}

/** Drive to the wall and park. `exit` is the seeded knob: break vs beep. */
function wallParker(exit) {
  return new TileProgram({
    name: `Wall Parker (${exit === 'break' ? 'fixed' : 'broken'})`,
    brain: 'tin',
    nodes: [
      T.forever([
        T.action('drive', { dir: 'forward', speed: 0.6 }),
        T.if(T.cond('distance_ahead', 'lt', 0.25),
          exit === 'break' ? [T.break()] : [T.action('beep', { pitch: 'high' })]),
      ]),
      T.action('stop'),
    ],
  });
}

/** Light runner. `sensor` is the seeded knob: 'brightness' is correct. */
function lightRunner(sensor) {
  const cond = sensor === 'brightness'
    ? T.cond('brightness', 'gt', 0.6)
    : T.is('bumped', true);
  return new TileProgram({
    name: `Light Runner (${sensor === 'brightness' ? 'fixed' : 'broken'})`,
    brain: 'spark',
    nodes: [
      T.forever([
        T.ifElse(
          cond,
          [T.action('led', { state: 'red' }), T.action('drive', { dir: 'forward', speed: 1 })],
          [T.action('led', { state: 'blue' }), T.action('drive', { dir: 'forward', speed: 0.3 })],
        ),
      ]),
    ],
  });
}

// ── the scenarios ───────────────────────────────────────────────────────────

export const SCENARIOS = [
  {
    id: 'left-forever',
    name: 'The Bot That Turns Left Forever',
    symptom: 'Spins left forever in the open — no walls anywhere, just spinning.',
    earlLine: "Trade-in bot from the shed. Runs in circles in an empty yard. Wall-avoider, supposedly. Read what it's DOING, kid, not what it's supposed to do.",
    brokenProgram: wallAvoider('gt'),
    hypotheses: [
      { text: 'The turn tile is the wrong direction — should be right, not left', correct: false },
      { text: 'The comparison is flipped — it turns when the path is CLEAR instead of when it\u2019s blocked', correct: true },
      { text: 'The forever loop is too fast for the sensor to keep up', correct: false },
    ],
    hintLadder: [
      'Read the IF tile out loud: what has to be true for the bot to turn?',
      'Look at the arrow on the condition. Which side of 0.3 means "wall is close"?',
    ],
    fix: {
      expectedNodePatch: {
        node: 'the if_else condition',
        change: { cmp: 'gt → lt' },
        why: 'turn away only when the wall is CLOSE',
      },
    },
    /** In the open, a fixed avoider DRIVES somewhere; the broken one pirouettes. */
    verify(program, steps = 150) {
      const rt = drive(program, openWorld(), { steps });
      const d = displacement(rt.robot);
      return {
        pass: d > 2,
        detail: `open-field displacement ${d.toFixed(2)} blocks (heading ${rt.robot.heading.toFixed(2)}) — fixed avoider travels, broken one spins in place`,
      };
    },
  },

  {
    id: 'never-stops',
    name: 'The Bot That Never Parks',
    symptom: 'Drives at the wall, keeps bumping it, honking — never parks.',
    earlLine: "Simple job: drive to the wall, stop. This one treats the wall like a suggestion. Watch the loop, kid — where does it ever END?",
    brokenProgram: wallParker('beep'),
    hypotheses: [
      { text: 'The drive speed is too high to stop in time', correct: false },
      { text: 'The forever loop has no exit — it needs a break when the wall is close', correct: true },
      { text: 'The wall sensor is broken and reads far away up close', correct: false },
    ],
    hintLadder: [
      'The IF already notices the wall. What does its body DO about it?',
      'A forever loop only stops if something breaks out of it.',
    ],
    fix: {
      expectedNodePatch: {
        node: 'the if body inside the forever loop',
        change: { insert: 'break' },
        why: 'the forever needs an exit once the wall is close',
      },
    },
    /** Fixed: the program HALTS (break → stop) before the wall. Broken: never. */
    verify(program, steps = 400) {
      const WALL = 4;
      const world = corridorWorld(WALL);
      const rt = drive(program, world, {
        steps,
        onTick: (_rt, w) => { w._d = Math.max(0, Math.min(1, (WALL - 0.3 - _rt.robot.z) / 6)); },
      });
      const parked = rt.vm.halted && rt.robot.drivePower === 0;
      const pass = parked && rt.robot.z > 2 && rt.robot.z < WALL;
      return {
        pass,
        detail: `z=${rt.robot.z.toFixed(2)} halted=${rt.vm.halted} drive=${rt.robot.drivePower.toFixed(2)} — fixed parker breaks out and halts by the wall`,
      };
    },
  },

  {
    id: 'wrong-sensor',
    name: 'The Bot That Ignores the Flashlight',
    symptom: 'Shine a flashlight right at it — nothing. Ignores the light completely.',
    earlLine: "Flashlight test. It's supposed to FLEE the light like it's being busted at a junkyard fence. It just creeps. The tile's checking SOMETHING — question is what.",
    brokenProgram: lightRunner('bump'),
    hypotheses: [
      { text: 'The LED tiles are wired to the wrong colors', correct: false },
      { text: 'The condition reads the wrong sensor — it checks the bumper instead of the light', correct: true },
      { text: 'The flashlight is too bright, overloading the sensor', correct: false },
    ],
    hintLadder: [
      'Which tile decides between fleeing and creeping?',
      'Open that condition: which sensor does it actually read?',
    ],
    fix: {
      expectedNodePatch: {
        node: 'the if_else condition',
        change: { sensor: 'bumped → brightness' },
        why: 'flee on LIGHT, not on bumper hits',
      },
    },
    /** Bright light, no walls: fixed runner flees at full speed; broken creeps. */
    verify(program, steps = 150) {
      const rt = drive(program, brightWorld(0.95), { steps });
      const d = displacement(rt.robot);
      return {
        pass: d > 15,
        detail: `bright-light displacement ${d.toFixed(2)} blocks (drive=${rt.robot.drivePower.toFixed(2)}) — fixed runner flees at full speed, broken one creeps`,
      };
    },
  },
];

export const conceptsInScenario = Object.fromEntries(SCENARIOS.map(s => [s.id,
  s.id === 'left-forever' ? ['debugging', 'conditionals']
  : s.id === 'never-stops' ? ['debugging', 'loops-until']
  : ['debugging', 'sensors-overview'],
]));

export class BrokenBot {
  /** @param {{ledger?: import('./ConceptLedger.js').ConceptLedger}} [opts] */
  constructor({ ledger } = {}) {
    this._ledger = ledger ?? null;
  }

  scenario(id) { return SCENARIOS.find(s => s.id === id) ?? null; }

  /**
   * Hypothesis check — the diagnosis round.
   * @returns {{correct:boolean, earlNod?:string, earlNudge?:string}}
   */
  diagnose(scenarioId, hypothesisIdx) {
    const sc = this.scenario(scenarioId);
    if (!sc || !Number.isInteger(hypothesisIdx) || hypothesisIdx < 0 || hypothesisIdx >= sc.hypotheses.length) {
      return { correct: false, earlNudge: 'Watch the bot first. THEN pick. One clue at a time.' };
    }
    if (sc.hypotheses[hypothesisIdx].correct) {
      return { correct: true, earlNod: 'Earl nods. Barely. That\u2019s a passing grade around here — now fix it.' };
    }
    return { correct: false, earlNudge: `${sc.earlLine} One clue at a time — read the symptom again.` };
  }

  /**
   * Fix verification — the kid's edited program runs in the real VM.
   * Accepts a TileProgram (or a plain {nodes:[...]}).
   * @returns {{fixed:boolean, verifyDetail:string}}
   */
  attemptFix(scenarioId, program) {
    const sc = this.scenario(scenarioId);
    if (!sc) return { fixed: false, verifyDetail: `unknown scenario "${scenarioId}"` };
    const prog = program instanceof TileProgram ? program
      : new TileProgram({ nodes: program?.nodes ?? [] });
    try {
      const result = sc.verify(prog);
      return { fixed: result.pass, verifyDetail: result.detail };
    } catch (err) {
      return { fixed: false, verifyDetail: `could not run: ${err?.message ?? err}` };
    }
  }

  /**
   * Ledger events for COMPLETING a clinic (diagnosed + fixed): the tile
   * usage counts as practice, and the clinic itself is a quest_done-style
   * carrier (its synthetic quest id rides QUEST_CONCEPTS).
   * @returns {object[]} events for ledger.observe()
   */
  ledgerEvent(scenarioId) {
    const used = conceptsInScenario[scenarioId];
    if (!used) return [];
    return [
      { type: 'program_ran', used },
      { type: 'quest_done', questId: `brokenbot-${scenarioId}` },
    ];
  }
}
