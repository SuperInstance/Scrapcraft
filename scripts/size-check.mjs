#!/usr/bin/env node
/**
 * Opt-in bundle size budget check — `npm run size` (run `npm run build` first).
 *
 * Fails (exit 1) if any built chunk's gzipped size exceeds its documented
 * ceiling. The ceilings sit ~10-15% above the sizes recorded in
 * docs/PERFORMANCE.md so ordinary churn passes but a real regression — most
 * importantly, the engine leaking into the eager entry chunk and breaking the
 * lazy CLOCK-IN boot — trips the build.
 *
 * This is NOT wired into `npm test` or CI here; it's a manual guard rail.
 * Update the ceilings (and PERFORMANCE.md) deliberately when a size genuinely
 * needs to grow.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const ASSETS = join('dist', 'assets');

// Gzip ceilings in KB, matched against the chunk filename PREFIX (Vite appends
// a content hash: `Game-CrLczY3l.js`). The eager entry (`index-*.js`) ceiling
// is deliberately tight: it must stay tiny for the boot to remain lazy.
const BUDGETS = [
  { prefix: 'index',        maxGzipKB: 12,  note: 'eager entry — must stay tiny (lazy boot)' },
  { prefix: 'vendor-three', maxGzipKB: 135, note: 'three.js — loads at CLOCK IN' },
  { prefix: 'maker',        maxGzipKB: 118, note: 'Maker Lab / TileEditor' },
  { prefix: 'Game',         maxGzipKB: 260, note: 'engine — loads at CLOCK IN' },
];

if (!existsSync(ASSETS)) {
  console.error(`✗ ${ASSETS} not found — run \`npm run build\` first.`);
  process.exit(1);
}

const files = readdirSync(ASSETS).filter(f => f.endsWith('.js'));
const kb = bytes => (bytes / 1024).toFixed(2);

let failed = false;
let checked = 0;

for (const budget of BUDGETS) {
  const match = files.find(f => f.startsWith(budget.prefix + '-'));
  if (!match) {
    console.error(`✗ no chunk matching "${budget.prefix}-*" in ${ASSETS}`);
    failed = true;
    continue;
  }
  checked++;
  const gz = gzipSync(readFileSync(join(ASSETS, match))).length;
  const overBy = gz - budget.maxGzipKB * 1024;
  const status = overBy > 0 ? '✗' : '✓';
  const line = `${status} ${match.padEnd(34)} ${kb(gz).padStart(8)} KB gz  (ceiling ${budget.maxGzipKB} KB — ${budget.note})`;
  if (overBy > 0) {
    failed = true;
    console.error(`${line}  → OVER by ${kb(overBy)} KB`);
  } else {
    console.log(line);
  }
}

if (checked === 0) {
  console.error('✗ no budgeted chunks were found — did the build output change?');
  process.exit(1);
}

if (failed) {
  console.error('\nSize budget exceeded. Investigate the growth, then either trim it or');
  console.error('raise the ceiling in scripts/size-check.mjs AND docs/PERFORMANCE.md together.');
  process.exit(1);
}

console.log('\nAll chunks within budget.');
