/**
 * ───────────────────────────────────────────────────────────────────────────
 *  DRIVE GESTURE  —  read the SHAPE of how a robot drove
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  When a kid's tile program runs, the VirtualRobot traces a path across the
 *  floor. That path is a *gesture* — and like any gesture it has a shape we can
 *  read order by order, the same reading the SuperInstance fleet uses for notes,
 *  rooms, conversations and cells ("abstraction as gesture"):
 *
 *     1st order  arcLength / meanSpeed   — how far the drive travelled, how fast.
 *     2nd order  bendingEnergy           — CURVATURE: how much the drive keeps
 *                changing direction. A clean straight-then-stop bends almost not
 *                at all; a hunt-and-peck, over-corrected drive bends hard. This
 *                is the headline kid-facing signal: JERKY vs SMOOTH.
 *     3rd order  twistEnergy             — TORSION: how much the drive SCREWS
 *                through space — turning and moving AT ONCE. A robot that drives
 *                a circle (turn + drive together) traces a HELIX in (x,z,heading)
 *                space, and a helix has torsion; a robot that drives in straight
 *                legs with separate stop-and-turn beats stays in a plane and has
 *                none. So twist reads "flowing racing-line arcs" vs "stop-and-
 *                turn". "The property is in the twist." `planarity` is its
 *                scale-free inverse (1 = one flat plane of motion, no screw).
 *
 *  Heading is a genuine third coordinate here, so the third order is REAL, not
 *  fabricated: the point cloud is (x, z, heading) in SE(2), per-column min-max
 *  normalized so metres and radians compare fairly (no dimension dominates). It
 *  is honest about its limits too — a straight or stop-and-turn drive reports
 *  zero twist, because there genuinely is none.
 *
 *  Pure logic, ZERO deps, ZERO Three.js — runs in a unit test as happily as in
 *  the game, and it is deterministic, so the same program yields the same shape
 *  every run. It is analysis ONLY: it never feeds back into a challenge verdict
 *  unless a challenge author explicitly reads it. Never throws on empty input.
 * ───────────────────────────────────────────────────────────────────────────
 */

// Cap the point cloud so the reading stays cheap and legible no matter how long
// the run; a stride keeps the shape while dropping redundant near-duplicate ticks.
const MAX_POINTS = 128;

function stridedSample(points, cap = MAX_POINTS) {
  if (points.length <= cap) return points.slice();
  const out = [];
  const step = (points.length - 1) / (cap - 1);
  for (let i = 0; i < cap; i++) out.push(points[Math.round(i * step)]);
  return out;
}

// Per-column min-max normalization to [0,1] so no single axis dominates the
// geometry (a constant column maps to 0). This is what makes x/z (metres) and
// heading (radians) comparable directions rather than one drowning the others.
function normalizeColumns(rows) {
  if (rows.length === 0) return rows;
  const d = rows[0].length;
  const min = new Array(d).fill(Infinity);
  const max = new Array(d).fill(-Infinity);
  for (const r of rows) {
    for (let k = 0; k < d; k++) {
      if (r[k] < min[k]) min[k] = r[k];
      if (r[k] > max[k]) max[k] = r[k];
    }
  }
  return rows.map((r) =>
    r.map((x, k) => {
      const span = max[k] - min[k];
      return span > 1e-12 ? (x - min[k]) / span : 0;
    })
  );
}

function sub(a, b) { return a.map((x, i) => x - b[i]); }
function norm(a) { return Math.sqrt(a.reduce((s, x) => s + x * x, 0)); }
function dot(a, b) { return a.reduce((s, x, i) => s + x * b[i], 0); }
function cosine(a, b) {
  const na = norm(a), nb = norm(b);
  return na < 1e-12 || nb < 1e-12 ? 0 : dot(a, b) / (na * nb);
}

function steps(points) {
  const out = [];
  for (let i = 1; i < points.length; i++) out.push(sub(points[i], points[i - 1]));
  return out;
}

function arcLength(points) {
  return steps(points).reduce((s, d) => s + norm(d), 0);
}

// Curvature: summed 1 - cos between consecutive step directions. 0 for a
// perfectly straight run; grows with every change of direction.
function bendingEnergy(points) {
  const s = steps(points);
  let e = 0;
  for (let i = 1; i < s.length; i++) {
    if (norm(s[i - 1]) > 1e-12 && norm(s[i]) > 1e-12) e += 1 - cosine(s[i - 1], s[i]);
  }
  return e;
}

// Torsion: per interior vertex, the component of the next step that leaves the
// osculating plane of the previous two. 0 for any planar path; needs >=4 points
// and a genuine third dimension to be non-zero.
function twistEnergy(points) {
  const s = steps(points);
  let e = 0;
  for (let i = 2; i < s.length; i++) {
    const s1 = s[i - 2], s2 = s[i - 1], s3 = s[i];
    const n1 = norm(s1);
    if (n1 < 1e-12) continue;
    const e1 = s1.map((x) => x / n1);
    const d21 = dot(s2, e1);
    const perp = s2.map((x, k) => x - d21 * e1[k]);
    const np = norm(perp);
    if (np < 1e-12) continue;
    const e2 = perp.map((x) => x / np);
    const n3 = norm(s3);
    if (n3 < 1e-12) continue;
    const d3 = s3.map((x) => x / n3);
    const c1 = dot(d3, e1);
    const c2 = dot(d3, e2);
    const out = d3.map((x, k) => x - c1 * e1[k] - c2 * e2[k]);
    e += Math.min(norm(out), 1);
  }
  return e;
}

function planarity(points) {
  const vertices = Math.max(0, steps(points).length - 1);
  if (vertices === 0) return 1;
  return Math.min(1, Math.max(0, 1 - twistEnergy(points) / vertices));
}

function heading(points) {
  const s = steps(points);
  if (s.length === 0) return points[0] ? points[0].map(() => 0) : [];
  const last = s[s.length - 1];
  const n = norm(last);
  return n > 1e-12 ? last.map((x) => x / n) : last.map(() => 0);
}

/**
 * Read the geometry of a path of plain numeric vectors, order by order.
 * Never mutates its input.
 *
 * @param {number[][]} path            array of equal-length numeric vectors.
 * @param {object} [opts]
 * @param {boolean} [opts.normalize]   per-column min-max normalize (default true).
 * @param {number}  [opts.cap]         max points after striding (default 128).
 * @returns {{readings, arcLength, bendingEnergy, twistEnergy, planarity, meanSpeed, heading, normalized}}
 */
export function readPathGesture(path, opts = {}) {
  const doNorm = opts.normalize !== false;
  const cap = opts.cap ?? MAX_POINTS;
  const clean = Array.isArray(path)
    ? path.filter((p) => Array.isArray(p) && p.length && p.every((x) => Number.isFinite(x)))
    : [];
  const sampled = stridedSample(clean, cap);
  const points = doNorm ? normalizeColumns(sampled) : sampled;
  const segs = Math.max(0, points.length - 1);
  const arc = arcLength(points);
  return {
    readings: points.length,
    arcLength: arc,
    bendingEnergy: bendingEnergy(points),
    twistEnergy: twistEnergy(points),
    planarity: planarity(points),
    meanSpeed: segs ? arc / segs : 0,
    heading: heading(points),
    normalized: doNorm,
  };
}

/**
 * Read a robot's drive from a series of pose samples, and translate the raw
 * geometry into kid-facing coaching scalars in [0,1].
 *
 * @param {Array<{x:number,z:number,heading:number}>} poses  one per recorded tick.
 * @param {object} [opts]  forwarded to readPathGesture.
 * @returns {{readings, arcLength, bendingEnergy, twistEnergy, planarity, meanSpeed,
 *            smoothness:number, arcFlow:number}}
 *          smoothness  1 = glided, 0 = jerky (from bending per segment).
 *          arcFlow     0 = straight / stop-and-turn (planar), 1 = constantly
 *                      arcing (turn + drive together — a screw through space).
 */
export function driveGesture(poses, opts = {}) {
  const list = Array.isArray(poses) ? poses : [];
  const path = list
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.heading))
    .map((p) => [p.x, p.z, p.heading]);
  const g = readPathGesture(path, opts);
  // Bending is summed 1-cos over interior vertices (each in [0,2]); per-segment
  // mean bending maps to a 0..1 smoothness the UI can show without a legend.
  const interior = Math.max(1, g.readings - 2);
  const meanBend = g.bendingEnergy / interior;
  const smoothness = Math.max(0, Math.min(1, 1 - meanBend / 2));
  return {
    readings: g.readings,
    arcLength: g.arcLength,
    bendingEnergy: g.bendingEnergy,
    twistEnergy: g.twistEnergy,
    planarity: g.planarity,
    meanSpeed: g.meanSpeed,
    smoothness: +smoothness.toFixed(4),
    arcFlow: +Math.max(0, Math.min(1, 1 - g.planarity)).toFixed(4),
  };
}
