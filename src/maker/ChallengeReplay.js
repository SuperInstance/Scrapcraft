/**
 * ───────────────────────────────────────────────────────────────────────────
 *  CHALLENGE REPLAY  —  reproducible, verifiable challenge results
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  The deterministic VM turns a challenge solve into something no other coding
 *  toy can offer: a RESULT ANYONE CAN REPRODUCE. `runChallenge(program,
 *  challenge)` is a pure function of the program + the scripted world, so the
 *  same tiles always earn the same stars. That makes real competitions possible
 *  — a class shares one puzzle, everyone's ★★★ is verifiable, a leaderboard
 *  can't be faked because the token re-runs to the same verdict.
 *
 *  This module is the substrate (see docs/FLEET-AND-FRONTIER.md — "reproducible
 *  competitions"):
 *    • encodeReplay(challengeId, program) → a compact, tamper-evident token a
 *      kid can share ("beat my Don't-Crash ★★★").
 *    • verifyReplay(token) → re-runs the encoded program against the named
 *      challenge and returns the verdict {passed, stars, metrics} — proof, not
 *      a claim. A tampered token fails the integrity check and never runs.
 *    • isDeterministic(challengeId, program) → runs twice and confirms the
 *      verdict is stable (guards against a program that used a random tile).
 *
 *  Pure + dependency-light (MakerChallenge + TileProgram only), so it unit-tests
 *  headlessly. The integrity hash is a fast non-crypto checksum (FNV-1a): it
 *  detects accidental corruption and casual edits of a shared token, not a
 *  determined forger — appropriate for a classroom leaderboard, not a bank.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { runChallenge, getChallenge } from './MakerChallenge.js';
import { TileProgram } from './TileProgram.js';

const REPLAY_VERSION = 1;

/** FNV-1a 32-bit → 8-char hex. Deterministic, synchronous, dependency-free. */
export function checksum(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Base64 that works in both Node and the browser, unicode-safe.
function b64encode(s) {
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'utf8').toString('base64');
  return btoa(unescape(encodeURIComponent(s)));
}
function b64decode(s) {
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64').toString('utf8');
  return decodeURIComponent(escape(atob(s)));
}

/** Normalize a program to its serializable node payload (accepts a TileProgram
 *  or a plain {nodes,...} object). */
function _progJSON(program) {
  if (program && typeof program.toJSON === 'function') return program.toJSON();
  return {
    version: program?.version ?? 2,
    name: program?.name ?? 'Untitled Brain',
    brain: program?.brain ?? 'tin',
    nodes: program?.nodes ?? [],
    meta: program?.meta ?? {},
    chips: program?.chips ?? [],
  };
}

/**
 * Encode a challenge attempt into a shareable, tamper-evident token.
 * @param {string} challengeId
 * @param {TileProgram|object} program
 * @returns {string} an opaque token (base64 of a small JSON envelope)
 */
export function encodeReplay(challengeId, program, seed) {
  const prog = _progJSON(program);
  const payload = { cid: String(challengeId), prog };
  // A seed (optional) captures the RNG stream so a solve that uses random tiles
  // reproduces exactly — required for a fair competition on such programs.
  if (seed != null && Number.isFinite(+seed)) payload.seed = +seed >>> 0;
  const body = JSON.stringify(payload);
  const env = { v: REPLAY_VERSION, h: checksum(body), body };
  return b64encode(JSON.stringify(env));
}

/**
 * Decode + integrity-check a token. Returns { challengeId, program } or throws
 * on a malformed / tampered / wrong-version token. Pure.
 * @returns {{ challengeId: string, program: TileProgram }}
 */
export function decodeReplay(token) {
  let env;
  try { env = JSON.parse(b64decode(String(token))); }
  catch { throw new Error('replay: not a valid token'); }
  if (!env || env.v !== REPLAY_VERSION) throw new Error('replay: unsupported token version');
  if (typeof env.body !== 'string' || env.h !== checksum(env.body)) {
    throw new Error('replay: integrity check failed (token was edited or corrupted)');
  }
  const payload = JSON.parse(env.body);
  return { challengeId: payload.cid, program: TileProgram.fromJSON(payload.prog), seed: payload.seed };
}

/**
 * Verify a replay token by re-running its program against the named challenge.
 * Fail-soft: never throws — a bad token or unknown challenge returns
 * { ok:false, reason }. On success returns the reproduced verdict.
 * @returns {{ ok:boolean, challengeId?, passed?, stars?, reason?, metrics? }}
 */
export function verifyReplay(token, opts = {}) {
  let decoded;
  try { decoded = decodeReplay(token); }
  catch (e) { return { ok: false, reason: e.message }; }

  const challenge = getChallenge(decoded.challengeId);
  if (!challenge) return { ok: false, reason: `replay: unknown challenge "${decoded.challengeId}"` };

  // Honor the token's captured seed (if any) so random-using solves reproduce.
  const runOpts = decoded.seed != null ? { ...opts, seed: decoded.seed } : opts;
  const result = runChallenge(decoded.program, challenge, runOpts);
  return {
    ok: true,
    challengeId: decoded.challengeId,
    passed: result.passed,
    stars: result.stars,
    reason: result.reason,
    metrics: result.metrics,
  };
}

/**
 * Confirm a program's verdict on a challenge is reproducible: run it `runs`
 * times and check the star rating + final pose are identical every time. A
 * program that leans on a random tile (RAND_VAR) will fail this and is unfit
 * for a fair competition.
 * @returns {{ deterministic:boolean, stars:number|null, runs:number }}
 */
export function isDeterministic(challengeId, program, runs = 2, opts = {}) {
  const challenge = getChallenge(challengeId);
  if (!challenge) return { deterministic: false, stars: null, runs: 0 };
  let first = null;
  for (let i = 0; i < Math.max(2, runs); i++) {
    const r = runChallenge(program, challenge, opts);
    const sig = JSON.stringify([r.stars, r.passed, r.metrics?.finalPos, r.metrics?.maxScore]);
    if (first == null) first = { sig, stars: r.stars };
    else if (sig !== first.sig) return { deterministic: false, stars: first.stars, runs: i + 1 };
  }
  return { deterministic: true, stars: first.stars, runs: Math.max(2, runs) };
}
