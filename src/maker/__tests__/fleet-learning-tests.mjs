/**
 * Fleet Learning tests — proves the deterministic federated-tiny-ML engine
 * (src/maker/FleetLearning.js) actually has the properties that matter for
 * a classroom "robots train together" feature:
 *
 *   1. determinism   — same seed + data ⇒ byte-identical weights
 *   2. learning      — the trained head clearly beats chance on held-out data
 *   3. FedAvg math   — equal counts = plain mean, unequal counts = weighted mean
 *   4. fedRound      — federated rounds converge and generalize
 *   5. edge cases    — fail-soft on empty input, single-head FedAvg is a no-op
 *
 * The toy task: classify a 6-number "sensor window" as high (1) or low (0)
 * mean — two well-separated clusters, generated with a local seeded LCG (no
 * Math.random) so the dataset itself is reproducible.
 */

import {
  makeFeatures, trainHead, predict, fedAvg, fedRound, RAW_DIM, FEATURE_DIM,
} from '../FleetLearning.js';

// Tiny local LCG for generating toy datasets — deliberately NOT the engine's
// own RNG, so the test data is independent of the engine's internals.
function lcg(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

function makeDataset(seed, n, { spread = 0.6 } = {}) {
  const rng = lcg(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = rng() < 0.5 ? 0 : 1;
    const base = y === 1 ? 1.2 : -1.2;
    const x = Array.from({ length: RAW_DIM }, () => base + (rng() * 2 - 1) * spread);
    out.push({ x, y });
  }
  return out;
}

function accuracy(weights, samples) {
  let correct = 0;
  for (const s of samples) if (predict(weights, s.x).label === s.y) correct++;
  return samples.length ? correct / samples.length : 0;
}

export function runFleetLearningTests(ok, fail) {
  const check = (name, cond, extra = '') => (cond ? ok(name) : fail(name, extra));

  // ── frozen backbone ────────────────────────────────────────────────────
  const f1 = makeFeatures([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  const f2 = makeFeatures([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  check('makeFeatures is deterministic (same input → identical output)',
    JSON.stringify(f1) === JSON.stringify(f2));
  check('makeFeatures returns FEATURE_DIM numbers',
    Array.isArray(f1) && f1.length === FEATURE_DIM && f1.every((v) => typeof v === 'number'),
    `got ${JSON.stringify(f1)}`);
  check('makeFeatures never trains: identical across unrelated calls with fresh args',
    JSON.stringify(makeFeatures([1, 1, 1, 1, 1, 1])) === JSON.stringify(makeFeatures([1, 1, 1, 1, 1, 1])));
  check('makeFeatures is fail-soft on malformed/short input (no throw)',
    (() => {
      try {
        const short = makeFeatures([1, 2]);
        const bad = makeFeatures(null);
        const weird = makeFeatures([1, 'x', undefined, NaN, 5, 6]);
        return short.length === FEATURE_DIM && bad.length === FEATURE_DIM && weird.length === FEATURE_DIM;
      } catch { return false; }
    })());

  // ── 1. determinism ─────────────────────────────────────────────────────
  const trainSet = makeDataset(42, 200);
  const testSet = makeDataset(999, 200);

  const wA = trainHead(trainSet, { seed: 7, epochs: 300, lr: 0.8 });
  const wB = trainHead(trainSet, { seed: 7, epochs: 300, lr: 0.8 });
  check('trainHead: same seed + data → byte-identical weights (JSON compare)',
    JSON.stringify(wA) === JSON.stringify(wB));

  // With no data to train on, trainHead returns the raw seeded init untouched —
  // a clean way to confirm the seed actually drives initialization.
  const initOnlySeed7 = trainHead([], { seed: 7 });
  const initOnlySeed8 = trainHead([], { seed: 8 });
  check('trainHead: different seeds produce different random inits',
    JSON.stringify(initOnlySeed7) !== JSON.stringify(initOnlySeed8));
  check('trainHead: same seed reproduces the same random init',
    JSON.stringify(initOnlySeed7) === JSON.stringify(trainHead([], { seed: 7 })));

  // ── 2. learning: beats chance by a wide margin on held-out data ────────
  const acc = accuracy(wA, testSet);
  check('trained head clears 0.9 accuracy on held-out separable toy data',
    acc >= 0.9, `accuracy=${acc}`);

  const untrainedWeights = { w: new Array(FEATURE_DIM).fill(0), b: 0 };
  const chanceAcc = accuracy(untrainedWeights, testSet);
  check('an untrained (all-zero) head sits at chance (~0.5), well below the trained head',
    acc - chanceAcc > 0.3, `trained=${acc} chance=${chanceAcc}`);

  // ── 3. FedAvg math ──────────────────────────────────────────────────────
  const headX = { w: [1, 2, 3, 4, 5, 6, 7, 8], b: 10 };
  const headY = { w: [3, 4, 5, 6, 7, 8, 9, 10], b: 20 };

  const equalAvg = fedAvg([{ weights: headX, count: 5 }, { weights: headY, count: 5 }]);
  const expectedEqual = { w: headX.w.map((v, i) => (v + headY.w[i]) / 2), b: (headX.b + headY.b) / 2 };
  check('fedAvg with equal counts = plain mean (exact numeric check)',
    JSON.stringify(equalAvg) === JSON.stringify(expectedEqual), JSON.stringify(equalAvg));

  const weightedAvg = fedAvg([{ weights: headX, count: 1 }, { weights: headY, count: 3 }]);
  const expectedWeighted = {
    w: headX.w.map((v, i) => (v * 1 + headY.w[i] * 3) / 4),
    b: (headX.b * 1 + headY.b * 3) / 4,
  };
  check('fedAvg with unequal counts = count-weighted mean (exact numeric check)',
    JSON.stringify(weightedAvg) === JSON.stringify(expectedWeighted), JSON.stringify(weightedAvg));

  // ── 4. fedRound convergence + generalization ────────────────────────────
  const shards = [makeDataset(101, 40), makeDataset(102, 40), makeDataset(103, 40), makeDataset(104, 40)];
  let globalWeights = { w: new Array(FEATURE_DIM).fill(0), b: 0 };
  const roundAccuracies = [];
  for (let round = 0; round < 5; round++) {
    const result = fedRound(shards, globalWeights, { seed: 55, epochs: 25, lr: 0.8 });
    globalWeights = result.globalWeights;
    roundAccuracies.push(accuracy(globalWeights, testSet));
  }
  check('fedRound: 4 robots\' averaged model reaches ≥0.9 accuracy on a global test set after several rounds',
    roundAccuracies.at(-1) >= 0.9, `accuracies=${JSON.stringify(roundAccuracies)}`);
  check('fedRound: accuracy improved (or held) from round 1 to the final round',
    roundAccuracies.at(-1) >= roundAccuracies[0], `accuracies=${JSON.stringify(roundAccuracies)}`);

  // Deterministic reproducibility of an entire federated round.
  let globalA = { w: new Array(FEATURE_DIM).fill(0), b: 0 };
  let globalB = { w: new Array(FEATURE_DIM).fill(0), b: 0 };
  const resA = fedRound(shards, globalA, { seed: 55, epochs: 25, lr: 0.8 });
  const resB = fedRound(shards, globalB, { seed: 55, epochs: 25, lr: 0.8 });
  check('fedRound is deterministic end-to-end (same seed/data/global → identical output)',
    JSON.stringify(resA) === JSON.stringify(resB));

  // ── 5. edge cases ────────────────────────────────────────────────────────
  check('fedAvg of a single head returns that head\'s values unchanged',
    JSON.stringify(fedAvg([{ weights: headX, count: 7 }])) === JSON.stringify({ w: headX.w.slice(), b: headX.b }));

  check('fedAvg([]) fails soft: returns null, does not throw',
    (() => { try { return fedAvg([]) === null; } catch { return false; } })());

  check('fedAvg(undefined) fails soft: does not throw',
    (() => { try { fedAvg(undefined); return true; } catch { return false; } })());

  check('trainHead([]) fails soft: returns a valid (unchanged/init) head, does not throw',
    (() => {
      try {
        const w = trainHead([], { seed: 3, initWeights: { w: [1, 2, 3, 4, 5, 6, 7, 8], b: 9 } });
        return JSON.stringify(w) === JSON.stringify({ w: [1, 2, 3, 4, 5, 6, 7, 8], b: 9 });
      } catch { return false; }
    })());

  check('predict on a malformed sample fails soft (no throw) and still returns a label/score',
    (() => {
      try {
        const r = predict(wA, null);
        return typeof r.label === 'number' && typeof r.score === 'number';
      } catch { return false; }
    })());
}
