/**
 * ───────────────────────────────────────────────────────────────────────────
 *  XP SYSTEM TESTS  —  run via run-tests.mjs (`npm test`)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Covers: the level formula (floor(sqrt(xp/10))) against its own documented
 * thresholds, monotonicity as XP accumulates, multi-level jumps, skill-node
 * unlock gating (including "warp past several levels at once" catching every
 * skill in between), the one-time sensor/variable XP bonuses (and that they
 * don't collide with each other), the progress-bar fraction, and the
 * save/load round trip (including a missing/corrupt payload).
 */

import { XPSystem, XP_SKILLS } from '../XPSystem.js';

export function runXPSystemTests(ok) {
  // ── 1. Level formula matches its own documented thresholds ────────────────
  console.log('\nXPSystem · level thresholds');
  {
    // From the module header comment: Level 1:10, 2:40, 3:90, 4:160, 5:250,
    // 8:640, 12:1440. One XP short of a threshold must NOT grant the level;
    // landing exactly on it must.
    const thresholds = [[1, 10], [2, 40], [3, 90], [4, 160], [5, 250], [8, 640], [12, 1440]];
    for (const [level, xpNeeded] of thresholds) {
      const short = new XPSystem();
      short.gain(xpNeeded - 1);
      ok(`${xpNeeded - 1} XP is NOT enough for level ${level}`, short.level < level,
         `level=${short.level}`);

      const exact = new XPSystem();
      exact.gain(xpNeeded);
      ok(`exactly ${xpNeeded} XP reaches level ${level}`, exact.level === level,
         `level=${exact.level}`);
    }
  }

  // ── 2. gain() is monotonic and reports levels gained correctly ────────────
  console.log('\nXPSystem · gain() monotonicity');
  {
    const xp = new XPSystem();
    let prevLevel = 0;
    let everDropped = false;
    for (let i = 0; i < 50; i++) {
      xp.gain(17); // odd, non-round increments to stress the boundary math
      if (xp.level < prevLevel) everDropped = true;
      prevLevel = xp.level;
    }
    ok('level never decreases as XP accumulates', !everDropped);
    ok('50 gains of 17 XP produced real level progress', xp.level > 0, `level=${xp.level}`);

    // A single big gain that crosses several thresholds at once reports the
    // total levels gained, not just "at least one".
    const jumper = new XPSystem();
    const gained = jumper.gain(1000); // floor(sqrt(100)) = 10
    ok('gain(1000) from zero lands on level 10', jumper.level === 10, `level=${jumper.level}`);
    ok('gain() returns the number of levels actually gained in that call', gained === 10,
       `gained=${gained}`);

    // Zero/negative gains are no-ops.
    const noop = new XPSystem();
    noop.gain(50);
    const before = { xp: noop.xp, level: noop.level };
    const r1 = noop.gain(0);
    const r2 = noop.gain(-5);
    ok('gain(0) returns 0 and does not change xp/level', r1 === 0 && noop.xp === before.xp && noop.level === before.level);
    ok('gain(-5) returns 0 and does not change xp/level', r2 === 0 && noop.xp === before.xp && noop.level === before.level);
  }

  // ── 3. Skill-node unlocks fire exactly at their gate level ─────────────────
  console.log('\nXPSystem · skill unlocks');
  {
    const xp = new XPSystem();
    ok('no skills at level 0', xp.skills.size === 0);

    xp.gain(9); // level stays 0
    ok('still no tinkerer skill just below level 1', !xp.hasSkill('tinkerer'));

    xp.gain(1); // crosses into level 1 (xp=10)
    ok('tinkerer unlocks exactly at level 1', xp.hasSkill('tinkerer'));
    ok('scrapper (level 2) not yet unlocked at level 1', !xp.hasSkill('scrapper'));

    const drained = xp.drainNewSkills();
    ok('drainNewSkills returns the newly unlocked skill', drained.some(s => s.id === 'tinkerer'));
    ok('drainNewSkills empties the pending queue', xp.drainNewSkills().length === 0);

    // Warping straight to level 12 must retroactively unlock every skill
    // gated at or below 12, not just the final one.
    const warp = new XPSystem();
    warp.gain(1440); // level 12
    const allIds = XP_SKILLS.map(s => s.id);
    ok('warping to level 12 unlocks every skill node',
       allIds.every(id => warp.hasSkill(id)), `have=${[...warp.skills].join(',')}`);
    ok('warp drainNewSkills yields all 8 skills in one shot',
       warp.drainNewSkills().length === XP_SKILLS.length);
  }

  // ── 4. One-time sensor/variable XP bonuses ─────────────────────────────────
  console.log('\nXPSystem · one-time bonuses');
  {
    const xp = new XPSystem();
    xp.trackSensor('ultrasonic');
    ok('first trackSensor call awards +8 XP', xp.xp === 8, `xp=${xp.xp}`);
    xp.trackSensor('ultrasonic');
    ok('repeat trackSensor for the same id awards nothing more', xp.xp === 8, `xp=${xp.xp}`);
    xp.trackSensor('ldr');
    ok('a different sensor id awards its own +8', xp.xp === 16, `xp=${xp.xp}`);

    const xv = new XPSystem();
    const total1 = xv.trackVariables(['speed', 'score']);
    ok('trackVariables awards 10 XP per new distinct name', total1 === 20 && xv.xp === 20,
       `total=${total1} xp=${xv.xp}`);
    const total2 = xv.trackVariables(['speed', 'score', 'lap']);
    ok('re-seen names in a later call award nothing; only "lap" counts', total2 === 10 && xv.xp === 30,
       `total=${total2} xp=${xv.xp}`);

    // A sensor id and a variable of the same literal name must not collide —
    // trackVariables namespaces its bookkeeping key ("var:<name>").
    const mixed = new XPSystem();
    mixed.trackSensor('speed');
    const varTotal = mixed.trackVariables(['speed']);
    ok('a variable name that matches an already-tracked sensor id still awards XP',
       varTotal === 10, `varTotal=${varTotal}`);
    ok('sensor bonus (8) + variable bonus (10) both landed', mixed.xp === 18, `xp=${mixed.xp}`);
  }

  // ── 5. progress getter reflects position within the current level band ────
  console.log('\nXPSystem · progress fraction');
  {
    const xp = new XPSystem();
    xp.gain(25); // from=_xpForLevel(1)=10, to=_xpForLevel(2)=40 → (25-10)/30
    ok('level is 1 right after gaining 25 XP', xp.level === 1, `level=${xp.level}`);
    ok('progress is exactly 0.5 halfway through level 1\'s band',
       Math.abs(xp.progress - 0.5) < 1e-9, `progress=${xp.progress}`);

    const fresh = new XPSystem();
    ok('progress is clamped into [0,1] even at zero XP',
       fresh.progress >= 0 && fresh.progress <= 1, `progress=${fresh.progress}`);
  }

  // ── 6. Save/load round trip ────────────────────────────────────────────────
  console.log('\nXPSystem · save/load round trip');
  {
    const xp = new XPSystem();
    xp.gain(300); // level 5, unlocks several skills
    xp.trackSensor('pir');
    xp.trackVariables(['count']);
    const data = xp.toSaveData();

    const restored = new XPSystem();
    restored.fromSaveData(data);
    ok('restored xp matches', restored.xp === xp.xp, `${restored.xp} vs ${xp.xp}`);
    ok('restored level matches', restored.level === xp.level, `${restored.level} vs ${xp.level}`);
    ok('restored skill set matches', [...restored.skills].sort().join(',') === [...xp.skills].sort().join(','));

    // The one-time bonuses must not re-fire after a restore (seenSensors
    // round-trips too) — this is what stops save/load from being an XP farm.
    const xpBefore = restored.xp;
    restored.trackSensor('pir');
    restored.trackVariables(['count']);
    ok('restored seenSensors/vars prevent re-earning bonuses after load',
       restored.xp === xpBefore, `xp changed from ${xpBefore} to ${restored.xp}`);

    // Corrupt/missing save data is handled without throwing and without
    // clobbering existing state.
    const untouched = new XPSystem();
    untouched.gain(50);
    let threw = false;
    try { untouched.fromSaveData(null); } catch { threw = true; }
    ok('fromSaveData(null) does not throw', !threw);
    ok('fromSaveData(null) leaves existing progress alone', untouched.xp === 50, `xp=${untouched.xp}`);

    const emptyRestore = new XPSystem();
    emptyRestore.fromSaveData({});
    ok('fromSaveData({}) fails soft to defaults (xp=0, level=0)',
       emptyRestore.xp === 0 && emptyRestore.level === 0);
  }
}
