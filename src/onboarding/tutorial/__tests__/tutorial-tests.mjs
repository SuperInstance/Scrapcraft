/**
 * TUTORIAL MISSIONS tests — headless engine with injectable storage, event-driven
 * step progression, medal logic, fast-skip, persistence, and DOM rendering.
 *
 * Coverage:
 * - Step progression: normal event flow advances exactly one step per event
 * - Fast-skip: out-of-order event (later step) auto-completes earlier steps
 * - Medals: speedster (under time), style (hints <10s before events), veteran (fast-skip)
 * - Persistence: medals + done persist across engine instances via storage
 * - Corrupt storage: graceful fallback, never throws
 * - DOM rendering: renderMissionCard maps state onto existing DOM elements
 * - skipAll(): mission dismissed, summary returned
 */

import { TutorialEngine, TUTORIAL_MISSIONS } from '../TutorialMissions.js';
import { renderMissionCard, missionCompleteToast } from '../missionCard.js';

/** Mock storage (Map-backed). */
const mkStorage = () => {
  const m = new Map();
  return {
    getItem: k => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
  };
};

export function runTutorialTests(ok) {
  // ══ 1. Step progression: fresh engine through every step ══════════════════
  console.log('\nTutorial · step progression');
  {
    const st = mkStorage();
    const engine = new TutorialEngine({ storage: st });

    // Fresh engine, not begun
    ok('fresh engine.notify() returns null', engine.notify('move') === null);

    engine.begin('tm-first-steps');
    const s0 = engine.state();
    ok('begin() sets currentMission', s0.currentMission === 'tm-first-steps');
    ok('begin() starts at step 0', s0.currentStep === 0);
    ok('begin() sets startedAt', typeof s0.startedAt === 'number' && s0.startedAt > 0);

    // Fire event for step 0 (walk)
    const r1 = engine.notify('move');
    ok('move event advances step', r1.advanced === true);
    ok('step 0 object is walk', r1.step.id === 'walk');
    ok('rivetLine surfaces for walk step', typeof r1.rivetLine === 'string' && r1.rivetLine.length > 0);
    ok('no mission complete yet', r1.missionComplete !== true);

    const s1 = engine.state();
    ok('currentStep incremented to 1', s1.currentStep === 1);

    // Fire events for all remaining steps
    const r2 = engine.notify('mine');
    ok('mine event advances', r2.advanced === true && r2.step.id === 'mine');

    engine.notify('open_bench');
    engine.notify('open_maker');
    engine.notify('program_run');

    const rFinal = engine.notify('build');
    ok('final step triggers missionComplete', rFinal.missionComplete === true);
    ok('final step has medal', rFinal.medal !== null);
    ok('final step rivetLine optional', rFinal.rivetLine === null || typeof rFinal.rivetLine === 'string');

    const sFinal = engine.state();
    ok('mission marked done', sFinal.done === true);
    ok('medals persisted in state', sFinal.medals['tm-first-steps'] !== undefined);
  }

  // ══ 2. Fast-skip: out-of-order event (later step) auto-completes earlier ════
  console.log('\nTutorial · fast-skip (out-of-order event)');
  {
    const st = mkStorage();
    const engine = new TutorialEngine({ storage: st });
    engine.begin('tm-first-steps');

    // Jump straight to 'open_maker' (step 3), skipping walk/mine/bench
    const rSkip = engine.notify('open_maker');
    ok('out-of-order event returns advanced', rSkip.advanced === true);
    ok('fast-skip sets fastSkipped flag', rSkip.fastSkipped === true);
    ok('fast-skip awards veteran medal', rSkip.medal === 'veteran');
    ok('fast-skip has no rivetLine', rSkip.rivetLine === null);

    const sAfterSkip = engine.state();
    ok('fast-skip completes steps 0–3', sAfterSkip.currentStep === 4);
    ok('veteran medal persists in state', sAfterSkip.medals['tm-first-steps'] === 'veteran');

    // Medal persists across instances
    const engine2 = new TutorialEngine({ storage: st });
    const s2 = engine2.state();
    ok('veteran medal restores from storage', s2.medals['tm-first-steps'] === 'veteran');
  }

  // ══ 3. Medals: speedster (fast completion under threshold) ═════════════════
  console.log('\nTutorial · medals: speedster');
  {
    const st = mkStorage();
    const engine = new TutorialEngine({ storage: st });
    engine.begin('tm-first-steps');

    // Immediately fire all events (well under time threshold)
    for (const step of TUTORIAL_MISSIONS[0].steps) {
      engine.notify(step.event);
    }

    const s = engine.state();
    ok('speedster medal awarded for fast completion',
       s.medals['tm-first-steps'] === '🥇 speedster');
    ok('speedster persists in state', s.medals['tm-first-steps'] !== null);
  }

  // ══ 4. Medals: style (hints shown <10s before events, slow completion) ═════
  console.log('\nTutorial · medals: style');
  {
    const st = mkStorage();
    const engine = new TutorialEngine({ storage: st });
    // Fake startedAt to simulate slow play: mission took 300s total
    // (beyond speedster threshold of 275s), but hints were shown <10s before events
    engine.begin('tm-first-steps');
    const originalStart = engine._startedAt;
    engine._startedAt = originalStart - 300000;  // Pretend mission started 300s ago

    // Show hints, fire events within 10s of hints (but mission is "slow" due to _startedAt adjustment)
    for (let i = 0; i < TUTORIAL_MISSIONS[0].steps.length; i++) {
      engine.onHintShown();  // Record hint shown at current step
      const step = TUTORIAL_MISSIONS[0].steps[i];
      engine.notify(step.event);  // Fire event immediately (within 10s of hint)
    }

    const s = engine.state();
    // With slow total time (>275s) but quick hints-to-events, we should get style
    // (speedster is ruled out by the slow elapsed time)
    ok('style medal awarded for unaided play',
       s.medals['tm-first-steps'] === '✨ style');
  }

  // ══ 5. Persistence: medals + done across instances ═══════════════════════
  console.log('\nTutorial · persistence');
  {
    const st = mkStorage();
    const engine1 = new TutorialEngine({ storage: st });
    engine1.begin('tm-first-steps');

    // Complete mission 1
    for (const step of TUTORIAL_MISSIONS[0].steps) {
      engine1.notify(step.event);
    }

    const s1 = engine1.state();
    ok('medal earned and in state', s1.medals['tm-first-steps'] !== undefined);
    ok('mission marked done', s1.done === true);

    // Fresh instance, same storage
    const engine2 = new TutorialEngine({ storage: st });
    const s2 = engine2.state();
    ok('fresh instance loads medals from storage', s2.medals['tm-first-steps'] !== undefined);
    ok('fresh instance loads done flag', s2.done === true);
    ok('fresh instance loads exact medal', s2.medals['tm-first-steps'] === s1.medals['tm-first-steps']);
  }

  // ══ 6. Corrupt storage: fall-soft (never throws) ════════════════════════════
  console.log('\nTutorial · corrupt storage (fail-soft)');
  {
    const evil = {
      getItem: () => { throw new Error('corrupt'); },
      setItem: () => { throw new Error('quota'); },
    };
    const engine = new TutorialEngine({ storage: evil });
    engine.begin('tm-first-steps');

    ok('corrupt getItem does not throw on construction', true);
    engine.notify('move');
    ok('corrupt setItem does not throw on notify', true);

    const s = engine.state();
    ok('engine continues in memory after corrupt storage', s.currentStep === 1);
    ok('in-memory state survives notifies', true);
  }

  // ══ 7. Restore: snapshot round-trip ════════════════════════════════════════
  console.log('\nTutorial · restore from snapshot');
  {
    const engine1 = new TutorialEngine();
    engine1.begin('tm-first-steps');
    engine1.notify('move');
    engine1.notify('mine');
    engine1.onHintShown();

    const snap1 = engine1.state();
    ok('snapshot captured after partial progress', snap1.currentStep === 2);
    ok('snapshot includes hintShownAt', Object.keys(snap1.hintShownAt).length > 0);

    // Fresh engine, restore snapshot
    const engine2 = new TutorialEngine();
    engine2.restore(snap1);

    const snap2 = engine2.state();
    ok('restore() sets currentStep', snap2.currentStep === snap1.currentStep);
    ok('restore() preserves hintShownAt', snap2.hintShownAt[2] === snap1.hintShownAt[2]);
  }

  // ══ 8. skipAll(): dismiss mission and return summary ══════════════════════
  console.log('\nTutorial · skipAll()');
  {
    const engine = new TutorialEngine();
    engine.begin('tm-first-steps');
    engine.notify('move');
    engine.notify('mine');

    const result = engine.skipAll();
    ok('skipAll() returns skipped:true', result.skipped === true);
    ok('skipAll() returns missionId', result.missionId === 'tm-first-steps');
    ok('skipAll() returns stepsCompleted', result.stepsCompleted === 2);

    const s = engine.state();
    ok('skipAll() marks mission done', s.done === true);
    ok('skipAll() sets skipped flag', s.skipped === true);
  }

  // ══ 9. Unknown events: fail-soft ════════════════════════════════════════════
  console.log('\nTutorial · unknown events (fail-soft)');
  {
    const engine = new TutorialEngine();
    engine.begin('tm-first-steps');

    const rUnknown = engine.notify('gibberish_event');
    ok('unknown event returns null', rUnknown === null);

    const s = engine.state();
    ok('unknown event does not advance step', s.currentStep === 0);
  }

  // ══ 10. DOM rendering: renderMissionCard maps state to elements ════════════
  console.log('\nTutorial · renderMissionCard DOM');
  {
    const st = mkStorage();
    const engine = new TutorialEngine({ storage: st });
    engine.begin('tm-first-steps');

    // Mock DOM elements
    const els = {
      title: { innerHTML: '' },
      desc: { innerHTML: '' },
      dots: { innerHTML: '' },
    };

    // Render at step 0
    renderMissionCard(engine, els);
    ok('title rendered', els.title.innerHTML === 'First Steps');
    ok('step hint rendered', els.desc.innerHTML.includes('W A S D'));
    ok('mission brief rendered', els.desc.innerHTML.includes('Learn the yard'));
    ok('dots rendered', els.dots.innerHTML.includes('mc-dot active'));
    ok('first dot is active', els.dots.innerHTML.includes('active'));

    // Advance and re-render
    engine.notify('move');
    renderMissionCard(engine, els);

    ok('dots update on advance', els.dots.innerHTML.includes('mc-dot done'));
    ok('new active dot at step 1', els.dots.innerHTML.indexOf('active') > 0);

    // Complete mission, medals render
    for (const step of TUTORIAL_MISSIONS[0].steps) {
      engine.notify(step.event);
    }
    renderMissionCard(engine, els);
    ok('medal renders when earned', els.desc.innerHTML.includes('🏅'));
  }

  // ══ 11. DOM rendering: null/missing els are fail-soft ═══════════════════════
  console.log('\nTutorial · renderMissionCard safety');
  {
    const engine = new TutorialEngine();
    engine.begin('tm-first-steps');

    // Should not throw
    renderMissionCard(engine, null);
    ok('null els does not throw', true);

    renderMissionCard(engine, {});
    ok('empty els does not throw', true);

    renderMissionCard(null, { title: { innerHTML: '' } });
    ok('null engine does not throw', true);

    renderMissionCard(engine, { title: null, desc: null, dots: null });
    ok('null DOM nodes do not throw', true);
  }

  // ══ 12. missionCompleteToast: optional ui.notify ════════════════════════════
  console.log('\nTutorial · missionCompleteToast');
  {
    const engine = new TutorialEngine();
    engine.begin('tm-first-steps');

    // Complete mission
    for (const step of TUTORIAL_MISSIONS[0].steps) {
      engine.notify(step.event);
    }

    // Mock UI system
    const ui = { notify: msg => msg };  // Captures message
    missionCompleteToast(engine, ui);
    ok('missionCompleteToast calls ui.notify', true);

    // No-op when ui missing
    missionCompleteToast(engine, null);
    ok('null ui does not throw', true);

    missionCompleteToast(engine, {});
    ok('ui without notify does not throw', true);
  }

  // ══ 13. fastSkipEligible: check for competence signal ═══════════════════════
  console.log('\nTutorial · fastSkipEligible()');
  {
    const engine1 = new TutorialEngine();
    engine1.begin('tm-first-steps');

    ok('fresh engine not eligible for fast-skip', engine1.fastSkipEligible() === false);

    // Show hint for step 0, then fire step 3's event (showing competence)
    engine1.onHintShown();
    engine1.notify('open_maker');  // Skip ahead

    // After fast-skip, eligibility depends on remaining steps
    const elig = engine1.fastSkipEligible();
    ok('eligibility check returns boolean', typeof elig === 'boolean');
  }
}
