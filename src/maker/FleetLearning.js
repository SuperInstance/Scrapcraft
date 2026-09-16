/**
 * ───────────────────────────────────────────────────────────────────────────
 *  FLEET LEARNING  —  deterministic federated-tiny-ML engine (headless CORE)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  This is the ENGINE only. No game/UI wiring here — a classroom "Fleet
 *  Learning" tile/panel that lets kids watch their robots train together is
 *  a follow-up PR. This module is the pure, testable math underneath it.
 *
 *  Design mirrors SuperInstance/federated-tinyml-vessel, a real deployed
 *  system: a FROZEN feature projection ("backbone") that never learns, plus
 *  a TINY trainable head (a couple dozen numbers) that each device trains
 *  locally, averaged across devices with FedAvg. Same shape here, toy scale:
 *
 *      raw sensor window ──makeFeatures()──▶ fixed feature vector (frozen)
 *                                                   │
 *                                          trainHead() (per robot, local)
 *                                                   │
 *                                            tiny weight vector
 *                                                   │
 *                        fedAvg() ◀── one head per robot, each with a count
 *                                                   │
 *                                       new shared/global head weights
 *
 *  Everything here is deterministic: a fixed seed always produces the same
 *  weights (checked byte-for-byte via JSON in the test suite). No
 *  Math.random, no Date, no I/O — just arrays of numbers in, arrays of
 *  numbers out.
 * ───────────────────────────────────────────────────────────────────────────
 */

// ── shapes ───────────────────────────────────────────────────────────────
// A "sample" is a plain numeric array: one robot sensor window (e.g. a few
// consecutive light/distance readings). RAW_DIM is the length this engine
// expects; makeFeatures() pads/truncates so a slightly-off-length input
// never throws (fail-soft), it just gets clamped to shape.
export const RAW_DIM = 6;

// FEATURE_DIM is the size of the frozen projection's output — the "backbone"
// output width. It stays fixed forever: retraining never touches it.
export const FEATURE_DIM = 8;

// The tiny trainable head is FEATURE_DIM weights + 1 bias = 9 numbers here
// (the real vessel project's head is ~325 params for a richer backbone;
// this toy task only needs a handful to prove the same mechanism).
export const HEAD_PARAM_COUNT = FEATURE_DIM + 1;

// ── deterministic RNG (mulberry32) — no Math.random anywhere in this file ──
function hashSeed(seed) {
  // Turns any seed (number or string) into a 32-bit integer, deterministically.
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed ?? 0);
  let h = 0x811c9dc5; // FNV-1a offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = hashSeed(seed);
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Signed uniform draw in [-scale, scale], from a seeded rng() in [0,1).
function signedRand(rng, scale) { return (rng() * 2 - 1) * scale; }

// ── the frozen backbone ─────────────────────────────────────────────────
// Generated once, from a hardcoded seed, at module load. It NEVER changes
// and NEVER trains — it is the "fixed feature projection" half of the
// frozen-backbone + tiny-head design. Every call to makeFeatures() with the
// same input produces the exact same output, forever, on every platform.
const BACKBONE_SEED = 0xF00DFACE;
const { W: BACKBONE_W, B: BACKBONE_B } = (function buildBackbone() {
  const rng = mulberry32(BACKBONE_SEED);
  const scale = 1 / Math.sqrt(RAW_DIM);
  const W = [];
  for (let r = 0; r < FEATURE_DIM; r++) {
    const row = [];
    for (let c = 0; c < RAW_DIM; c++) row.push(signedRand(rng, scale));
    W.push(row);
  }
  const B = [];
  for (let r = 0; r < FEATURE_DIM; r++) B.push(signedRand(rng, 0.1));
  return { W, B };
})();

function tanh(x) {
  if (x > 20) return 1;
  if (x < -20) return -1;
  const e2x = Math.exp(2 * x);
  return (e2x - 1) / (e2x + 1);
}

/**
 * FIXED, non-trained projection from a raw sensor window to a small feature
 * vector. Deterministic — same input always yields the same output. Never
 * touched by trainHead(); this is the "frozen backbone" half of the design.
 *
 * @param {number[]} sample  raw numeric vector (any length; padded/truncated
 *                           to RAW_DIM so malformed input never throws)
 * @returns {number[]} length-FEATURE_DIM feature vector, each in (-1, 1)
 */
export function makeFeatures(sample) {
  const x = new Array(RAW_DIM).fill(0);
  if (Array.isArray(sample)) {
    for (let i = 0; i < RAW_DIM; i++) {
      const v = sample[i];
      x[i] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
    }
  }
  const out = new Array(FEATURE_DIM);
  for (let r = 0; r < FEATURE_DIM; r++) {
    let z = BACKBONE_B[r];
    const row = BACKBONE_W[r];
    for (let c = 0; c < RAW_DIM; c++) z += row[c] * x[c];
    out[r] = tanh(z);
  }
  return out;
}

function sigmoid(z) {
  if (z >= 0) { const e = Math.exp(-z); return 1 / (1 + e); }
  const e = Math.exp(z); return e / (1 + e);
}

function cloneWeights(weights) {
  return { w: weights.w.slice(), b: weights.b };
}

function zeroWeights() {
  return { w: new Array(FEATURE_DIM).fill(0), b: 0 };
}

/**
 * Train the tiny logistic head with plain full-batch gradient descent over
 * the FIXED features from makeFeatures(). Deterministic given the same seed
 * and data: two calls with identical inputs produce byte-identical weights.
 *
 * @param {Array<{x: number[], y: 0|1}>} samples  labeled training examples
 * @param {object} [opts]
 * @param {number|string} [opts.seed=1]        RNG seed for weight init (ignored if initWeights given)
 * @param {number} [opts.epochs=200]           gradient-descent steps
 * @param {number} [opts.lr=0.5]               learning rate
 * @param {number} [opts.l2=0]                 L2 weight-decay coefficient
 * @param {{w: number[], b: number}} [opts.initWeights]  start from these
 *        weights instead of a fresh random init — this is how a robot
 *        resumes from the shared/global head each federated round.
 * @returns {{w: number[], b: number}} the trained head
 */
export function trainHead(samples, opts = {}) {
  const { seed = 1, epochs = 200, lr = 0.5, l2 = 0, initWeights = null } = opts;

  const data = Array.isArray(samples) ? samples : [];
  const weights = initWeights
    ? cloneWeights(initWeights)
    : (function initRandom() {
        const rng = mulberry32(seed);
        return { w: Array.from({ length: FEATURE_DIM }, () => signedRand(rng, 0.1)), b: 0 };
      })();

  if (data.length === 0) return weights; // fail-soft: nothing to learn from

  const feats = data.map((s) => makeFeatures(s.x));
  const labels = data.map((s) => (s.y ? 1 : 0));
  const n = data.length;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array(FEATURE_DIM).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const f = feats[i];
      let z = weights.b;
      for (let d = 0; d < FEATURE_DIM; d++) z += weights.w[d] * f[d];
      const pred = sigmoid(z);
      const err = pred - labels[i];
      for (let d = 0; d < FEATURE_DIM; d++) gradW[d] += err * f[d];
      gradB += err;
    }
    for (let d = 0; d < FEATURE_DIM; d++) {
      const grad = gradW[d] / n + l2 * weights.w[d];
      weights.w[d] -= lr * grad;
    }
    weights.b -= lr * (gradB / n);
  }
  return weights;
}

/**
 * Run the trained head on one sample.
 * @param {{w: number[], b: number}} weights
 * @param {number[]} sample  raw sensor window
 * @returns {{label: 0|1, score: number}} score is P(label === 1)
 */
export function predict(weights, sample) {
  const w = weights?.w ?? zeroWeights().w;
  const b = weights?.b ?? 0;
  const f = makeFeatures(sample);
  let z = b;
  for (let d = 0; d < FEATURE_DIM; d++) z += w[d] * f[d];
  const score = sigmoid(z);
  return { label: score >= 0.5 ? 1 : 0, score };
}

/**
 * FedAvg: the sample-count-weighted average of several robots' local head
 * weights. This is the heart of federated learning — no raw data ever
 * leaves a robot, only these small weight vectors get combined.
 *
 * @param {Array<{weights: {w: number[], b: number}, count: number}>} headsWithCounts
 * @returns {{w: number[], b: number}|null} the averaged head, or null for
 *          empty input (fail-soft — never throws).
 */
export function fedAvg(headsWithCounts) {
  const entries = Array.isArray(headsWithCounts) ? headsWithCounts : [];
  const valid = entries.filter((e) => e && e.weights && Number(e.count) > 0);
  if (valid.length === 0) return null;

  const totalCount = valid.reduce((sum, e) => sum + Number(e.count), 0);
  const w = new Array(FEATURE_DIM).fill(0);
  let b = 0;
  for (const { weights, count } of valid) {
    const c = Number(count);
    for (let d = 0; d < FEATURE_DIM; d++) w[d] += (weights.w[d] ?? 0) * c;
    b += (weights.b ?? 0) * c;
  }
  for (let d = 0; d < FEATURE_DIM; d++) w[d] /= totalCount;
  b /= totalCount;
  return { w, b };
}

/**
 * One federated round: every robot trains locally starting from the shared
 * global head, then their results are FedAvg'd back into a new global head.
 * Mirrors federated-tinyml-vessel's round structure (local SGD steps, then
 * a weighted average) at toy scale.
 *
 * @param {Array<Array<{x: number[], y: 0|1}>>} perRobotData  one array of
 *        labeled samples per robot (a "shard")
 * @param {{w: number[], b: number}} globalWeights  the shared head to start from
 * @param {object} [opts]
 * @param {number|string} [opts.seed=1]       base seed; each robot gets a
 *        distinct-but-deterministic derived seed (only used if a robot's
 *        shard is empty and falls back to random init)
 * @param {number} [opts.epochs=50]           local gradient-descent steps per robot
 * @param {number} [opts.lr=0.5]              local learning rate
 * @returns {{globalWeights: {w: number[], b: number}, robotWeights: Array<{w: number[], b: number, count: number}>}}
 */
export function fedRound(perRobotData, globalWeights, opts = {}) {
  const { seed = 1, epochs = 50, lr = 0.5 } = opts;
  const shards = Array.isArray(perRobotData) ? perRobotData : [];
  const start = globalWeights && globalWeights.w ? globalWeights : zeroWeights();

  const robotWeights = shards.map((shard, i) => {
    const localSeed = hashSeed(`${seed}:${i}`);
    const trained = trainHead(shard, { seed: localSeed, epochs, lr, initWeights: start });
    return { w: trained.w, b: trained.b, count: Array.isArray(shard) ? shard.length : 0 };
  });

  const averaged = fedAvg(robotWeights.map((r) => ({ weights: { w: r.w, b: r.b }, count: r.count })));
  return { globalWeights: averaged ?? cloneWeights(start), robotWeights };
}
