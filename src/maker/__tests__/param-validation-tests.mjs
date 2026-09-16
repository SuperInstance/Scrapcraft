/**
 * Param-validation tests.
 *
 * `coerceParam`/`withDefaults` deliberately swallow bad actuator params at
 * runtime (safety rail), which also silently hides authoring typos — e.g.
 * `led: 'yellow'` becomes 'green' the instant T.action() builds the node, so a
 * test that inspects the built program can never see the mistake. So this suite
 * does two things:
 *   1. unit-tests the pure `validateParams` lint (which sees RAW params); and
 *   2. SOURCE-SCANS the shipped recipe/example files for string/number literal
 *      params and lints them — catching a future `yellow`-class regression that
 *      coercion would otherwise erase.
 */

import { readFileSync } from 'node:fs';
import { validateParams } from '../primitives.js';

// Pull literal `T.action('prim', { k: 'v', n: 5 })` params straight from source,
// before coercion can hide them. Only simple string/number literal params are
// parsed (which is all the shipped content uses); dynamic params are skipped.
function scanSource(relPath) {
  const text = readFileSync(new URL(relPath, import.meta.url), 'utf8');
  const calls = [];
  const re = /T\.action\(\s*'([a-z_]+)'\s*,\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const prim = m[1];
    const body = m[2];
    const params = {};
    for (const p of body.matchAll(/([a-zA-Z_]+)\s*:\s*'([^']*)'/g)) params[p[1]] = p[2];
    for (const p of body.matchAll(/([a-zA-Z_]+)\s*:\s*(-?\d+(?:\.\d+)?)\b/g)) params[p[1]] = Number(p[2]);
    calls.push({ prim, params });
  }
  return calls;
}

export function runParamValidationTests(ok, fail) {
  const check = (name, cond, extra = '') => (cond ? ok(name) : fail(name, extra));

  // ── 1. validateParams unit behaviour ──────────────────────────────────────
  check('validateParams: flags an out-of-enum led colour',
    validateParams('led', { state: 'yellow' }).length === 1);
  check('validateParams: message names the coercion target',
    /would silently become "green"/.test(validateParams('led', { state: 'yellow' })[0] || ''));
  check('validateParams: accepts a valid enum value',
    validateParams('led', { state: 'white' }).length === 0);
  check('validateParams: flags an out-of-range number',
    validateParams('beep', { }).length === 0 &&
    validateParams('add_score', { amount: 9999 }).length === 1);
  check('validateParams: flags a non-number for a number param',
    validateParams('add_score', { amount: 'lots' }).length === 1);
  check('validateParams: flags an unknown param key',
    validateParams('led', { colour: 'red' }).some(i => i.includes('unknown param')));
  check('validateParams: unknown actuator returns an issue',
    validateParams('frobnicate', {}).length === 1);

  // ── 2. Source-scan: no shipped recipe/example uses an invalid literal ──────
  for (const rel of ['../../SparkOfflineRecipes.js', '../TileProgram.js']) {
    let calls;
    try { calls = scanSource(rel); }
    catch { calls = null; }
    if (calls === null) { ok(`source-scan: ${rel} (skipped — not present)`); continue; }
    const bad = [];
    for (const { prim, params } of calls) {
      for (const issue of validateParams(prim, params)) bad.push(issue);
    }
    check(`source-scan: ${rel} has no invalid actuator params`, bad.length === 0, bad.slice(0, 5).join(' | '));
  }
}
