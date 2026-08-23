/**
 * GEOGRAPHY TESTS — landmarks, beacon safety, band flavor.
 * Run via the maker harness (run-tests.mjs imports this).
 *
 * Doctrine: seeds shuffle the scatter, NEVER the skyline. Landmarks are
 * deterministic, spawn on every seed, and may not bury the junk-lantern
 * trail, stations, tracks, plaques, or caches.
 */

import { World } from '../../World.js';
import { LANDMARKS } from '../../data/landmarks.js';
import { PLAQUES } from '../../data/plaques.js';
import { B, isInteractive } from '../../data/blocks.js';

const SEEDS = Array.from({ length: 30 }, (_, i) => 1 + i * 137);

const PROTECTED = id => id === B.BEACON || id === B.TRACK || id === B.BURIED_CACHE || isInteractive(id);

export function runGeographyTests(ok) {
  // ── every landmark build stays inside the world ────────────────────────
  const writes = [];
  const probe = new World(); probe.generate(1, { landmarks: false });
  const origSet = probe.setBlock.bind(probe);
  probe.setBlock = (x, y, z, id) => { writes.push([x, y, z]); origSet(x, y, z, id); };
  for (const lm of LANDMARKS) lm.build(probe);
  const oob = writes.filter(([x, y, z]) =>
    x < 0 || x >= probe.width || y < 0 || y >= probe.height || z < 0 || z >= probe.depth);
  ok(`all landmark writes in-bounds (${writes.length} writes)`, oob.length === 0);

  // ── determinism: same seed, identical skyline ──────────────────────────
  const w1 = new World(); w1.generate(777);
  const w2 = new World(); w2.generate(777);
  let identical = true;
  for (const lm of LANDMARKS)
    for (const [x, y, z] of landmarkProbes(lm))
      if (w1.getBlock(x, y, z) !== w2.getBlock(x, y, z)) identical = false;
  ok('landmarks deterministic across identical seeds', identical);

  // ── every probe of every landmark lands, every seed ────────────────────
  let allPresent = true, offender = '';
  for (const seed of SEEDS) {
    const w = new World(); w.generate(seed);
    if (w.landmarks.named?.length !== LANDMARKS.length) { allPresent = false; offender = `count@${seed}`; }
    for (const lm of LANDMARKS)
      for (const [x, y, z] of landmarkProbes(lm))
        if (w.getBlock(x, y, z) === B.AIR) { allPresent = false; offender = `${lm.id}@${seed}:${x},${y},${z}`; }
  }
  ok(`all ${LANDMARKS.length} landmarks spawn on ${SEEDS.length} seeds (every probe hits)`, allPresent, offender);

  // ── the junk-lantern trail is never buried ─────────────────────────────
  let trailSafe = true;
  for (const seed of SEEDS) {
    const w = new World(); w.generate(seed);
    for (const t of w.landmarks.smelter_trail) {
      if (w.getBlock(t.x, 1, t.z) !== B.BEACON) trailSafe = false;   // beacon intact
      if (w.getBlock(t.x, 2, t.z) !== B.AIR)    trailSafe = false;   // nothing stacked on it
    }
  }
  ok('junk-lantern trail: beacon intact + visible (all seeds)', trailSafe);

  // ── full-grid invariant: landmarks change ONLY unprotected cells ───────
  let gridSafe = true;
  for (const seed of [1, 42, 777, 2056, 4100]) {
    const w = new World(); w.generate(seed);
    const base = new World(); base.generate(seed, { landmarks: false });
    for (let y = 0; y < w.height; y++) for (let z = 0; z < w.depth; z++) for (let x = 0; x < w.width; x++) {
      const a = w.getBlock(x, y, z), b = base.getBlock(x, y, z);
      if (a !== b && PROTECTED(b)) gridSafe = false;                 // landmark overwrote something sacred
    }
    if (w.signalCaches.size !== 6) gridSafe = false;
    for (const key of w.signalCaches) {                             // cache blocks themselves survive
      const [cx, cz] = key.split(',').map(Number);
      if (w.getBlock(cx, 0, cz) !== B.BURIED_CACHE) gridSafe = false;
    }
    for (const p of PLAQUES) {                                      // plaque posts/boards survive
      if (w.getBlock(p.x, 1, p.z) !== B.RUST_METAL || w.getBlock(p.x, 2, p.z) !== B.CLEAN_METAL) gridSafe = false;
    }
    if (w.getBlock(80, 9, 71) !== B.POWER_BOX) gridSafe = false;    // radio tower apex
    let trackCount = 0;
    for (let z = 64; z < 96; z++) for (let x = 0; x < 128; x++)
      if (w.getBlock(x, 0, z) === B.TRACK) trackCount++;
    if (trackCount < 80) gridSafe = false;                          // Circuit City oval intact
  }
  ok('landmarks overwrite only unprotected cells; caches/plaques/oval/tower intact', gridSafe);

  // ── the Ghost Track preview exists in the Deep Yard — tease, never gate ─
  const w = new World(); w.generate(42);
  const ghost = LANDMARKS.find(l => l.id === 'ghost_track');
  let scaffoldLights = 0, letterBoards = 0, ghostTrack = 0;
  for (let z = 96; z < 128; z++) for (let x = 0; x < 128; x++) {
    if (w.getBlock(x, 7, z) === B.FLOODLIGHT) scaffoldLights++;
    if (w.getBlock(x, 6, z) === B.POWER_BOX)  letterBoards++;
    if (w.getBlock(x, 0, z) === B.TRACK)      ghostTrack++;
  }
  ok('Ghost Track: oval silhouette on the ground (Deep Yard)', ghostTrack >= 55);
  ok('Ghost Track: scaffold floodlights standing (all four towers)', scaffoldLights >= 4);
  ok('Ghost Track: empty letter boards waiting for the county', letterBoards >= 3);
  ok('Ghost Track is preview-only (no gate/unlock objects placed)', !ghost.gate && !ghost.requires);
  ok('Ghost Track lore stays Earl-voiced and quiet', ghost.lore.includes('letters'));

  // ── band flavor: corridors read differently ────────────────────────────
  // Discriminating signature: base band-1 gen emits only CONCRETE/GRAVEL at
  // y=0, so DIRT there can only come from the oil-stain flavor pass.
  let dirtInBand1 = 0;
  for (let z = 32; z < 64; z++) for (let x = 0; x < 128; x++)
    if (w.getBlock(x, 0, z) === B.DIRT) dirtInBand1++;
  ok('band flavor applied (oil-stain DIRT signature in Industrial Corridor)', dirtInBand1 > 50);
}

/** Structural probe points per landmark (extremes of each build). */
function landmarkProbes(lm) {
  const pts = [];
  const probe = (x, y, z) => pts.push([x, y, z]);
  switch (lm.id) {
    case 'thirsty_tower':   probe(33, 1, 25); probe(34, 7, 26); probe(34, 8, 26); break;
    case 'cratesaurus':     probe(108, 1, 12); probe(109, 4, 12); probe(108, 7, 12); break;
    case 'tire_mountain':   probe(58, 1, 6); probe(58, 4, 6); probe(58, 5, 6); break;
    case 'old_smokestack':  probe(110, 1, 48); probe(110, 8, 48); probe(110, 9, 48); break;
    case 'big_grabber':     probe(28, 8, 56); probe(37, 8, 56); probe(28, 6, 56); break;
    case 'eternal_flame':   probe(98, 1, 40); probe(98, 5, 40); probe(98, 6, 40); break;
    case 'trace_gate':      probe(61, 7, 88); probe(67, 7, 88); probe(64, 8, 88); break;
    case 'listening_wall':  probe(14, 1, 88); probe(16, 4, 87); probe(14, 8, 88); break;
    case 'the_quads':       probe(106, 6, 88); probe(110, 7, 92); probe(108, 6, 90); break;
    case 'ghost_track':     probe(102, 0, 116); probe(88, 7, 114); probe(99, 4, 112); break;
    case 'doorhouse_light': probe(14, 1, 118); probe(14, 7, 118); probe(14, 8, 118); break;
    case 'the_fist':        probe(40, 1, 100); probe(40, 7, 100); probe(40, 8, 100); break;
  }
  return pts;
}
