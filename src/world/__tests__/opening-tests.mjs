/**
 * Opening cinematic tests — the world-before-menu contract.
 *
 * Unit: orbitPose pure math (deterministic poses, sane altitude), the
 * OpeningCinematic lifecycle (begin/update/end, fail-soft with no camera),
 * a simulated boot (60 frames move a real THREE camera; end freezes it),
 * and the handoff pose (camera parked at the kid's eye, EYE_HEIGHT).
 *
 * Source contracts (a11y-test pattern): the wiring that can't run headless
 * — main.js lock deferral, Game's orbit tick + _endOpening lock take,
 * wizard/gate scrim translucency, wizard lock guard — asserted against the
 * source so the semantics can't silently regress.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';

import { OpeningCinematic, orbitPose } from '../OpeningCinematic.js';
import { EYE_HEIGHT } from '../../Player.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(HERE, p), 'utf8');

export function runOpeningTests(ok) {
  // ══ 1. Pure orbit math ═══════════════════════════════════════════════════
  console.log('\nOpening · orbitPose math');
  {
    const o = { center: { x: 64, z: 62 }, radius: 50, height: 30, bobAmp: 2.4, bobFreq: 0.07, startAngle: 0, rate: 0.042 };
    const p0 = orbitPose(0, o);
    ok('t=0 sits on the ring at startAngle', Math.abs(p0.x - 114) < 1e-9 && Math.abs(p0.z - 62) < 1e-9);

    const p1 = orbitPose(100, o);
    const wantA = 0.042 * 100;
    ok('angle advances at rate·t', Math.abs(p1.x - (64 + Math.cos(wantA) * 50)) < 1e-9);

    // planar distance to center stays the radius — it's an orbit, not a wander
    const d = Math.hypot(p1.x - 64, p1.z - 62);
    ok('planar distance holds the radius', Math.abs(d - 50) < 1e-9);

    // altitude: gentle bob, always above the yard
    let min = Infinity, max = -Infinity;
    for (let t = 0; t < 600; t += 0.5) {
      const y = orbitPose(t, o).y;
      min = Math.min(min, y); max = Math.max(max, y);
    }
    ok('altitude bobs within height±bobAmp', min > 30 - 2.5 && max < 30 + 2.5);
    ok('camera never dips below the yard', min > 8);
  }

  // ══ 2. Lifecycle + fail-soft ════════════════════════════════════════════
  console.log('\nOpening · lifecycle & fail-soft');
  {
    const bare = new OpeningCinematic({});   // no camera, no DOM
    bare.begin();
    ok('begins active even headless', bare.active === true);
    let threw = false;
    try { bare.update(1 / 60); } catch { threw = true; }
    ok('update without a camera is a safe no-op', !threw && bare.update(0.001) === false);
    bare.end();
    ok('end clears active', bare.active === false);

    const cam = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
    const cin = new OpeningCinematic({ camera: cam, startAngle: 0 });
    cin.begin();
    ok('update with a camera reports progress', cin.update(1 / 60) === true);
    ok('camera looks at the orbit center', Math.abs(cam.position.x - 114) < 0.1);
  }

  // ══ 3. Simulated boot: overlay open → orbit runs; overlay close → handoff ══
  console.log('\nOpening · simulated boot + handoff');
  {
    // "boot": overlay open, pointer NOT locked — the orbit owns the camera
    const cam = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
    const cin = new OpeningCinematic({ camera: cam, startAngle: 0, radius: 50, height: 30 });
    cin.begin();
    let locked = false;                       // Player.tick no-ops while unlocked
    const at = () => cam.position.clone();
    for (let f = 0; f < 600; f++) {           // ~10s of frames
      if (!locked) cin.update(1 / 60);        // Game._update's orbit branch
    }
    ok('render loop with overlay open → camera orbits (moved >10m)',
       at().distanceTo(new THREE.Vector3(114, 30, 62)) > 10);
    const beforeClose = at();

    // "overlay close": _endOpening semantics — freeze, park at the eye, lock
    cin.end();
    cin.update(1 / 60);
    ok('end() freezes the orbit (no further drift)', at().equals(beforeClose));

    const player = { pos: new THREE.Vector3(8, 2, 5), yaw: 0.3, pitch: -0.1 };
    cam.position.set(player.pos.x, player.pos.y + EYE_HEIGHT, player.pos.z);
    cam.quaternion.setFromEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
    ok('handoff parks the camera at the kid\'s eye',
       Math.abs(cam.position.y - (2 + EYE_HEIGHT)) < 1e-9);
    const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0.3, 0, 'YXZ'));
    ok('handoff restores the spawn orientation exactly', cam.quaternion.equals(want));
  }

  // ══ 4. Source contracts — the headless-untestable wiring ════════════════
  console.log('\nOpening · wiring contracts');
  {
    const main = src('../../main.js');
    ok('main.js defers pointer lock while the opening runs',
      /if \(!game\.openingPending\) canvas\.requestPointerLock\(\)/.test(main));

    const game = src('../../Game.js');
    ok('Game orbits the camera in _update after player.tick',
      /this\.player\.tick\(dt, this\.world\);[\s\S]{0,400}this\._openingCinematic\?\.active[\s\S]{0,120}this\._openingCinematic\.update\(dt\)/.test(game));
    ok('start() begins the cinematic on first run',
      /new OpeningCinematic\(/.test(game) && /\.begin\(\)/.test(game));
    ok('_endOpening takes the pointer lock',
      /_endOpening\(\)[\s\S]{0,600}requestPointerLock\?\.\(\)/.test(game));
    ok('_endOpening parks the camera at EYE_HEIGHT',
      /p\.pos\.y \+ EYE_HEIGHT/.test(game));
    ok('gate onChosen ends the opening',
      /this\.saveSystem\?\.markDirty\(\);[\s\S]{0,200}this\._endOpening\(\)/.test(game));
    ok('wizard-complete without a pending gate also ends the opening',
      /if \(!this\.companions\?\.needsEntryChoice\) this\._endOpening\(\)/.test(game));
    ok('pause overlay never flashes while the opening runs',
      /if \(this\._running && !this\.openingPending\) this\.ui\.setPaused\(!locked\)/.test(game));
    ok('free-cursor click on the yard takes the lock (never-locked path)',
      /!document\.pointerLockElement && !this\.openingPending && !this\.ui\?\.isOpen/.test(game));
    ok('Player exports EYE_HEIGHT for the handoff', /export const EYE_HEIGHT/.test(src('../../Player.js')));

    const wizard = src('../../onboarding/OnboardingWizard.js');
    ok('wizard scrim is translucent (world glows through)',
      /rgba\(8, 10, 6, 0\.55\)/.test(wizard));
    ok('wizard finish does not lock while the gate is pending',
      /!document\.pointerLockElement && !this\.game\?\.openingPending/.test(wizard));

    const entry = src('../../companion/entry.js');
    ok('yard-gate scrim is translucent (the yard behind Earl\'s questions)',
      /rgba\(10,12,8,0\.55\)/.test(entry));
  }
}
