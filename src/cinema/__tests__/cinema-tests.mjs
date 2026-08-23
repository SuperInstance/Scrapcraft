/**
 * Cinema tests — headless timeline + director contracts.
 *
 * Unit: Timeline evaluation (keyframe interpolation, easing, letterbox ramps,
 * subtitle cues, done flag), Timeline validation (sorted keyframes, cue windows,
 * garbage input handling), CutsceneDirector lifecycle (play, update, skip, end),
 * pause-safety, persistence (seen), and fail-soft with no camera/DOM.
 *
 * Tests the three real cutscenes (CUTSCENES registry wholesale).
 *
 * FakeEl: minimal DOM stub for headless tests (no-op appendChild, classList, style).
 */

import { evalTimeline, validateTimeline, cutsceneById, getCutscenes, registerCutscenes } from '../Timeline.js';
import { CutsceneDirector } from '../CutsceneDirector.js';
import { CUTSCENES } from '../data/cutscenes.js';

// Fake DOM element for tests
class FakeEl {
  constructor(tag = '') {
    this.tag = tag;
    this.id = '';
    this.classList = { add: () => {}, remove: () => {} };
    this.style = {};
    this.textContent = '';
    this.innerHTML = '';
    this.children = [];
    this.parentElement = null;
  }
  appendChild(child) {
    this.children.push(child);
    if (child) child.parentElement = this;
  }
}

// Fake camera
class FakeCamera {
  constructor() {
    this.position = { set: (...args) => { this._pos = args; } };
    this.lookAt = (...args) => { this._look = args; };
    this._pos = null;
    this._look = null;
  }
}

export function runCinemaTests(ok) {
  console.log('\nCinema · Timeline evaluation');
  {
    // Test 1: Single keyframe → static pose
    const def = {
      id: 'test-static',
      duration: 10,
      camera: {
        keyframes: [
          { t: 0, x: 10, y: 20, z: 30, look: { x: 40, y: 50, z: 60 } },
        ],
      },
    };
    const p0 = evalTimeline(def, 0);
    ok('single keyframe at t=0 returns exact pose', p0.pose?.x === 10 && p0.pose?.y === 20 && p0.pose?.z === 30);
    const p5 = evalTimeline(def, 5);
    ok('single keyframe at mid-t returns same pose', p5.pose?.x === 10 && p5.pose?.y === 20);

    // Test 2: Multiple keyframes — interpolation
    const def2 = {
      id: 'test-interp',
      duration: 10,
      camera: {
        keyframes: [
          { t: 0, x: 0, y: 0, z: 0, look: { x: 0, y: 0, z: 0 }, ease: 'linear' },
          { t: 10, x: 10, y: 10, z: 10, look: { x: 10, y: 10, z: 10 }, ease: 'linear' },
        ],
      },
    };
    const p_mid = evalTimeline(def2, 5);
    ok('linear interpolation at t=5 (midpoint) is 0.5 lerp',
      Math.abs(p_mid.pose?.x - 5) < 1e-9 && Math.abs(p_mid.pose?.y - 5) < 1e-9);

    // Test 3: Easing — easeOut should be closer to end value at midpoint
    const def3 = {
      id: 'test-ease',
      duration: 10,
      camera: {
        keyframes: [
          { t: 0, x: 0, y: 0, z: 0, look: { x: 0, y: 0, z: 0 }, ease: 'out' },
          { t: 10, x: 10, y: 10, z: 10, look: { x: 10, y: 10, z: 10 }, ease: 'out' },
        ],
      },
    };
    const p_ease = evalTimeline(def3, 5);
    ok('easeOut at midpoint is closer to end value (>5)', p_ease.pose?.x > 6.5);

    // Test 4: Before first keyframe
    const def4 = {
      id: 'test-before',
      duration: 20,
      camera: {
        keyframes: [
          { t: 5, x: 50, y: 50, z: 50, look: { x: 0, y: 0, z: 0 }, ease: 'linear' },
          { t: 15, x: 150, y: 150, z: 150, look: { x: 100, y: 100, z: 100 }, ease: 'linear' },
        ],
      },
    };
    const p_before = evalTimeline(def4, 2);
    ok('before first keyframe returns first pose', p_before.pose?.x === 50);

    // Test 5: After last keyframe
    const p_after = evalTimeline(def4, 18);
    ok('after last keyframe returns last pose (held)', p_after.pose?.x === 150);

    // Test 6: Letterbox ramp in/out
    const def5 = {
      id: 'test-letterbox',
      duration: 10,
      letterbox: { in: 2, out: 2, height: 0.11 },
      camera: { keyframes: [] },
    };
    const lb0 = evalTimeline(def5, 0);
    ok('letterbox at t=0 ramps in from 0', lb0.letterbox === 0);
    const lb1 = evalTimeline(def5, 1);
    ok('letterbox at t=1 (midway through in) is 0.5', Math.abs(lb1.letterbox - 0.5) < 1e-9);
    const lb2 = evalTimeline(def5, 2);
    ok('letterbox at t=2 (end of in) is 1', lb2.letterbox === 1);
    const lb5 = evalTimeline(def5, 5);
    ok('letterbox at mid-range holds at 1', lb5.letterbox === 1);
    const lb8 = evalTimeline(def5, 8);
    ok('letterbox at t=8 (start of out ramp) is 1', lb8.letterbox === 1);
    const lb9 = evalTimeline(def5, 9);
    ok('letterbox at t=9 (midway through out) is 0.5', Math.abs(lb9.letterbox - 0.5) < 1e-9);
    const lb10 = evalTimeline(def5, 10);
    ok('letterbox at t=10 (end of out) is 0', lb10.letterbox === 0);

    // Test 7: Subtitles — window [t, end)
    const def6 = {
      id: 'test-subs',
      duration: 10,
      camera: { keyframes: [] },
      subtitles: [
        { t: 1, end: 3, speaker: 'A', text: 'First' },
        { t: 4, end: 6, speaker: 'B', text: 'Second' },
      ],
    };
    const s_before = evalTimeline(def6, 0.5);
    ok('subtitle before first cue is null', s_before.subtitle === null);
    const s_during1 = evalTimeline(def6, 2);
    ok('subtitle during first cue returns first', s_during1.subtitle?.speaker === 'A' && s_during1.subtitle?.text === 'First');
    const s_between = evalTimeline(def6, 3.5);
    ok('subtitle between cues is null', s_between.subtitle === null);
    const s_during2 = evalTimeline(def6, 5);
    ok('subtitle during second cue returns second', s_during2.subtitle?.speaker === 'B' && s_during2.subtitle?.text === 'Second');
    const s_after = evalTimeline(def6, 10);
    ok('subtitle after all cues is null', s_after.subtitle === null);

    // Test 8: Last matching cue wins if overlapping (not forbidden, but noted)
    const def7 = {
      id: 'test-overlap',
      duration: 10,
      camera: { keyframes: [] },
      subtitles: [
        { t: 0, end: 5, speaker: 'A', text: 'First' },
        { t: 3, end: 7, speaker: 'B', text: 'Second' }, // overlaps [3,5)
      ],
    };
    const s_overlap = evalTimeline(def7, 4);
    ok('overlapping cues: last matching (B) wins', s_overlap.subtitle?.speaker === 'B');

    // Test 9: done flag
    const def8 = {
      id: 'test-done',
      duration: 5,
      camera: { keyframes: [] },
    };
    const done_before = evalTimeline(def8, 4);
    ok('done is false before duration', done_before.done === false);
    const done_at = evalTimeline(def8, 5);
    ok('done is true at duration', done_at.done === true);
    const done_after = evalTimeline(def8, 6);
    ok('done is true after duration', done_after.done === true);

    // Test 10: Garbage input doesn't throw
    const bad = evalTimeline(null, 0);
    ok('null def returns safe defaults', bad.pose === null && bad.letterbox === 0 && bad.done === false);
    const bad2 = evalTimeline({}, 'nope');
    ok('non-numeric t returns safe defaults', bad2.pose === null);
  }

  console.log('\nCinema · Timeline validation');
  {
    // Test 1: Valid def passes
    const valid = {
      id: 'good',
      duration: 10,
      camera: {
        keyframes: [
          { t: 0, x: 0, y: 0, z: 0, look: { x: 1, y: 1, z: 1 } },
        ],
      },
      subtitles: [
        { t: 1, end: 5, speaker: 'A', text: 'Hi' },
      ],
    };
    const val1 = validateTimeline(valid);
    ok('valid timeline passes validation', val1.ok === true && val1.errors.length === 0);

    // Test 2: Missing id fails
    const noId = { ...valid, id: null };
    const val2 = validateTimeline(noId);
    ok('missing id fails validation', val2.ok === false);

    // Test 3: Bad duration fails
    const noDuration = { ...valid, duration: -5 };
    const val3 = validateTimeline(noDuration);
    ok('negative duration fails validation', val3.ok === false);

    // Test 4: Keyframes not sorted fails
    const unsorted = {
      id: 'unsorted',
      duration: 10,
      camera: {
        keyframes: [
          { t: 5, x: 0, y: 0, z: 0, look: { x: 0, y: 0, z: 0 } },
          { t: 2, x: 1, y: 1, z: 1, look: { x: 1, y: 1, z: 1 } },
        ],
      },
    };
    const val4 = validateTimeline(unsorted);
    ok('unsorted keyframes fail validation', val4.ok === false);

    // Test 5: Cue end <= t fails
    const badCue = {
      id: 'badcue',
      duration: 10,
      subtitles: [
        { t: 5, end: 3, speaker: 'A', text: 'Backwards' },
      ],
    };
    const val5 = validateTimeline(badCue);
    ok('cue with end<=t fails validation', val5.ok === false);

    // Test 6: Real cutscenes validate
    const realCutscenes = getCutscenes();
    let allReal = true;
    for (const cs of realCutscenes) {
      const val = validateTimeline(cs);
      if (!val.ok) {
        console.log('  Failed cutscene:', cs.id, val.errors);
        allReal = false;
      }
    }
    ok('all real cutscenes pass validation', allReal && realCutscenes.length === 3);
  }

  console.log('\nCinema · Director lifecycle & fail-soft');
  {
    // Test 1: No-deps construction
    const dir = new CutsceneDirector({});
    ok('director constructs with no deps', dir instanceof CutsceneDirector && dir.active === false);

    // Test 2: play() with invalid id returns false, still calls onDone
    let onDoneCalled = false;
    const result = dir.play('invalid-id', {
      onDone: () => { onDoneCalled = true; },
    });
    ok('play invalid id returns false', result === false);
    ok('play invalid id still calls onDone', onDoneCalled === true);

    // Test 3: Successful play
    const dir2 = new CutsceneDirector({
      camera: new FakeCamera(),
      container: new FakeEl(),
    });
    const playResult = dir2.play('intro-dawn-arrival', {});
    ok('play valid id returns true', playResult === true);
    ok('play sets active', dir2.active === true);

    // Test 4: update advances time when active and not paused
    const before = dir2._t;
    dir2.update(1);
    ok('update advances time', dir2._t > before);

    // Test 5: setPaused stops time advance
    dir2.setPaused(true);
    const paused = dir2._t;
    dir2.update(1);
    ok('paused update does not advance time', dir2._t === paused);

    // Test 6: skip fires onDone once
    let skipCalls = 0;
    const dir3 = new CutsceneDirector({ container: new FakeEl() });
    dir3.play('intro-dawn-arrival', {
      onDone: () => { skipCalls++; },
    });
    dir3.skip();
    dir3.skip(); // second skip should not fire again
    ok('skip fires onDone once', skipCalls === 1 && dir3.active === false);

    // Test 7: onDone fires exactly once when done
    let doneCalls = 0;
    const dir4 = new CutsceneDirector({ container: new FakeEl() });
    const cs = getCutscenes()[0]; // intro-dawn-arrival, ~26s
    dir4.play('intro-dawn-arrival', {
      onDone: () => { doneCalls++; },
    });
    // Simulate ~26s of updates
    for (let i = 0; i < 260; i++) dir4.update(0.1);
    ok('onDone fires exactly once when done', doneCalls === 1);
  }

  console.log('\nCinema · Director with fake camera');
  {
    const fakeCamera = new FakeCamera();
    const fakeContainer = new FakeEl();
    const dir = new CutsceneDirector({
      camera: fakeCamera,
      container: fakeContainer,
    });

    const ok_play = dir.play('intro-dawn-arrival', {});
    if (!ok_play) {
      console.log('  ERROR: could not play intro-dawn-arrival');
      return;
    }

    // Update a few frames
    for (let i = 0; i < 30; i++) {
      dir.update(1 / 60);
    }

    ok('camera.position.set was called', fakeCamera._pos !== null);
    ok('camera.lookAt was called', fakeCamera._look !== null);
    ok('DOM bars were created', dir._barTop !== null && dir._barBot !== null);
    ok('subtitle element was created', dir._subtitleEl !== null);

    dir.end();
    ok('end clears active', dir.active === false);
  }

  console.log('\nCinema · Persistence (seen)');
  {
    // Mock storage
    const mockStorage = new Map();
    const storage = {
      getItem: (k) => mockStorage.get(k) ?? null,
      setItem: (k, v) => mockStorage.set(k, v),
    };

    const dir = new CutsceneDirector({});
    dir._getStorage = () => storage; // inject fake storage

    ok('seen returns false for unseen cutscene', dir.seen('intro-dawn-arrival') === false);

    dir.play('intro-dawn-arrival', {}); // marks seen
    ok('play marks cutscene as seen', dir.seen('intro-dawn-arrival') === true);

    // Verify persistence: new director with same storage
    const dir2 = new CutsceneDirector({});
    dir2._getStorage = () => storage;
    ok('new director sees the mark', dir2.seen('intro-dawn-arrival') === true);
  }

  console.log('\nCinema · Director pause-safety');
  {
    const dir = new CutsceneDirector({ container: new FakeEl() });
    dir.play('intro-dawn-arrival', {});

    const t_before = dir._t;
    dir.setPaused(true);
    dir.update(5); // try to advance
    ok('paused director does not advance time', dir._t === t_before);

    dir.setPaused(false);
    dir.update(1);
    ok('unpaused director resumes advancing', dir._t > t_before);
  }

  console.log('\nCinema · Idempotent play (replace running cutscene)');
  {
    let calls = 0;
    const dir = new CutsceneDirector({ container: new FakeEl() });
    dir.play('intro-dawn-arrival', {
      onDone: () => { calls++; },
    });

    // Play while playing → should end current, start new
    const cs2 = getCutscenes()[1]; // wake-first-light
    dir.play(cs2.id, {
      onDone: () => { calls++; },
    });

    ok('play while playing replaces cleanly', dir._def?.id === cs2.id);
    // The FIRST cutscene's onDone fires at replace (never stranded); the
    // second fires when ITS playback finishes.
    ok('replaced cutscene\'s onDone fired (not stranded)', calls === 1);
    for (let i = 0; i < Math.ceil(cs2.duration) + 2; i++) dir.update(1);
    ok('both onDone callbacks fired (second at finish)', calls === 2);
  }

  console.log('\nCinema · real CUTSCENES registry');
  {
    const cutscenes = getCutscenes();
    ok('cutscenes registry has 3 items', cutscenes.length === 3);

    const ids = ['intro-dawn-arrival', 'wake-first-light', 'finale-candlelight'];
    for (const id of ids) {
      const cs = cutsceneById(id);
      ok(`cutsceneById('${id}') returns def`, cs !== null && cs.id === id);

      const val = validateTimeline(cs);
      ok(`'${id}' passes validation`, val.ok === true);
    }
  }

  console.log('\n✓ Cinema tests complete\n');
}
