/**
 * ChallengeReplay tests — reproducible, verifiable challenge results.
 * Covers the integrity checksum, token round-trip, tamper detection, the
 * verify-reproduces-the-verdict guarantee, determinism checking, and fail-soft
 * behavior on bad tokens / unknown challenges. Fully headless.
 */

import {
  encodeReplay, decodeReplay, verifyReplay, isDeterministic, checksum,
} from '../ChallengeReplay.js';
import { EXAMPLE_WALL_AVOIDER } from '../TileProgram.js';
import { runChallenge, getChallenge } from '../MakerChallenge.js';

export function runChallengeReplayTests(ok, fail) {
  const check = (name, cond, extra = '') => (cond ? ok(name) : fail(name, extra));

  const CID = 'dont-crash';

  // ── checksum: stable + sensitive ────────────────────────────────────────────
  check('checksum is deterministic', checksum('hello world') === checksum('hello world'));
  check('checksum changes with input', checksum('hello world') !== checksum('hello worlff'));
  check('checksum is 8 hex chars', /^[0-9a-f]{8}$/.test(checksum('anything')));

  // ── baseline: the example actually earns stars on the challenge ──────────────
  const baseline = runChallenge(EXAMPLE_WALL_AVOIDER, getChallenge(CID));
  check('baseline solve passes with stars', baseline.passed === true && baseline.stars >= 1, JSON.stringify({ p: baseline.passed, s: baseline.stars }));

  // ── encode → decode round-trip ──────────────────────────────────────────────
  {
    const token = encodeReplay(CID, EXAMPLE_WALL_AVOIDER);
    check('token is a non-empty string', typeof token === 'string' && token.length > 0);
    const decoded = decodeReplay(token);
    check('decodes back the challenge id', decoded.challengeId === CID);
    check('decodes back a program with the same node count',
      decoded.program.nodes.length === EXAMPLE_WALL_AVOIDER.nodes.length);
  }

  // ── verify reproduces the exact verdict ─────────────────────────────────────
  {
    const token = encodeReplay(CID, EXAMPLE_WALL_AVOIDER);
    const v = verifyReplay(token);
    check('verify ok', v.ok === true);
    check('verify reproduces passed', v.passed === baseline.passed);
    check('verify reproduces the star rating', v.stars === baseline.stars, `${v.stars} vs ${baseline.stars}`);
    check('verify echoes the challenge id', v.challengeId === CID);
  }

  // ── tamper detection: editing the token breaks the integrity check ──────────
  {
    const token = encodeReplay(CID, EXAMPLE_WALL_AVOIDER);
    // Flip a character in the middle of the token.
    const mid = Math.floor(token.length / 2);
    const tampered = token.slice(0, mid) + (token[mid] === 'A' ? 'B' : 'A') + token.slice(mid + 1);
    let threw = false;
    try { decodeReplay(tampered); } catch { threw = true; }
    check('decodeReplay rejects a tampered token', threw);
    const v = verifyReplay(tampered);
    check('verifyReplay is fail-soft on tampered token', v.ok === false && /integrity|valid|token/i.test(v.reason));
  }

  // ── fail-soft: garbage token + unknown challenge ────────────────────────────
  {
    check('verify garbage → ok:false', verifyReplay('not-a-real-token').ok === false);
    check('verify empty → ok:false', verifyReplay('').ok === false);
    const bogus = encodeReplay('no-such-challenge', EXAMPLE_WALL_AVOIDER);
    const v = verifyReplay(bogus);
    check('verify unknown challenge → ok:false with reason', v.ok === false && /unknown challenge/i.test(v.reason));
  }

  // ── determinism guarantee ───────────────────────────────────────────────────
  {
    const d = isDeterministic(CID, EXAMPLE_WALL_AVOIDER, 3);
    check('example solve is deterministic across runs', d.deterministic === true && d.runs >= 2);
    check('determinism reports the stable star rating', d.stars === baseline.stars);
    check('isDeterministic on unknown challenge → false', isDeterministic('nope', EXAMPLE_WALL_AVOIDER).deterministic === false);
  }

  // ── accepts a plain serialized program object (not just a TileProgram) ───────
  {
    const plain = EXAMPLE_WALL_AVOIDER.toJSON();
    const token = encodeReplay(CID, plain);
    const v = verifyReplay(token);
    check('encodes+verifies from a plain program object', v.ok === true && v.stars === baseline.stars);
  }
}
