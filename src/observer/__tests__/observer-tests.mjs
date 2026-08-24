/**
 * ───────────────────────────────────────────────────────────────────────────
 *  OBSERVER MODE TESTS  —  the playtest instrument's contract
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Fail-soft doctrine locked down:
 *   1. URL gate — only ?observe=1 / =true arms the observer; anything else
 *      (no flag, garbage, =0, =false) returns null → normal play is untouched.
 *   2. Milestones log exactly once per session (first mine/build/race/reset).
 *   3. The export payload is the facilitator's artifact: schema, session
 *      timing, milestone timestamps, and every entry with t + kind + detail.
 *   4. Headless-safe: no `document`, no `performance`, no `window` — the
 *      observer still records and exports (DOM is a garnish).
 *   5. createObserver() throws nothing, ever — even with hostile opts.
 *
 * Observer-v2 capture paths (additive, schema v1 preserved):
 *   6. sessionType — fresh | returning | unknown in the export, stamped into
 *      the session_start line (late-markable via markSessionType).
 *   7. idle_marker — dead-air heartbeat: after 60s with no event and no
 *      activity() ping, entries carry an idle_marker with a duration;
 *      continuous quiet → one marker per 60s window; activity()/events reset.
 *   8. menu_open / menu_close — surface vocabulary (workshop, maker_bench,
 *      codex, pause, logbook, ledger, help, settings).
 *   9. input_failure — pointer-lock denials/refusals (would have diagnosed
 *      the dry-run's dead-controls session instantly).
 */

import { observerFromURL, createObserver, SessionObserver } from '../ObserverMode.js';

export function runObserverTests(ok) {
  console.log('\nObserver mode · URL gate');

  ok('no flag → OFF',            observerFromURL('') === false);
  ok('?observe=1 → ON',          observerFromURL('?observe=1') === true);
  ok('?observe=true → ON',       observerFromURL('?observe=true') === true);
  ok('?observe=0 → OFF',         observerFromURL('?observe=0') === false);
  ok('?observe=false → OFF',     observerFromURL('?observe=false') === false);
  ok('?observe=garbage → OFF',   observerFromURL('?observe=banana') === false);
  ok('other params → OFF',       observerFromURL('?lite=1&seed=42') === false);
  ok('hostile search → OFF',     observerFromURL(null) === false);
  ok('hostile search 2 → OFF',   observerFromURL(42) === false);

  console.log('\nObserver mode · createObserver fail-soft');

  const disabled = createObserver({ search: '', seed: 1337 });
  ok('no flag → null',           disabled === null);
  const hostile = createObserver({ search: '?observe=1', seed: NaN, now: 'nope' });
  ok('hostile opts → still an observer or null, never throws', hostile === null || !!hostile);
  const fresh = createObserver({ search: '?observe=1', seed: 1337 });
  ok('?observe=1 → observer',    !!fresh);
  fresh?.endSession?.();   // stop any interval a DOM build started (none headless)

  console.log('\nObserver mode · session log');

  // Deterministic clock: t=0 at construction, +1000ms per tick() call.
  let nowMs = 100000;
  const obs = new SessionObserver({
    search: '?observe=1',
    seed: 1337,
    now: () => nowMs,
  });
  ok('starts with session_start', obs.entries[0]?.kind === 'session_start');

  obs.quest({ arc: 'earl', id: 'earl-1', title: 'Mine Five Scrap' });
  obs.levelUp(2);
  obs.companion('Rivet', 'Hi!');
  obs.death();
  obs.pause(true);
  nowMs += 1000;
  obs.pause(false);

  ok('quest entry logged',       obs.entries.some(e => e.kind === 'quest' && e.detail.includes('earl-1')));
  ok('levelup entry logged',     obs.entries.some(e => e.kind === 'levelup' && e.detail.includes('2')));
  ok('companion entry has text', obs.entries.some(e => e.kind === 'companion' && e.detail.includes('Rivet: Hi!')));
  ok('death entry logged',       obs.entries.some(e => e.kind === 'death'));
  ok('pause entry logged',       obs.entries.some(e => e.kind === 'pause'));
  ok('resume entry logged',      obs.entries.some(e => e.kind === 'resume'));
  const pauseAt = obs.entries.find(e => e.kind === 'pause');
  const resumeAt = obs.entries.find(e => e.kind === 'resume');
  ok('timestamps advance',       pauseAt && resumeAt && resumeAt.t > pauseAt.t);
  ok('timestamps are seconds',   pauseAt && pauseAt.t === 0);

  console.log('\nObserver mode · milestones (once per session)');

  obs.firstMine();
  obs.firstMine();            // duplicate — must be ignored
  obs.firstBuild('wrench');
  obs.firstBuild('generator'); // duplicate
  obs.firstRace();
  const firstMines = obs.entries.filter(e => e.kind === 'first_mine');
  const firstBuilds = obs.entries.filter(e => e.kind === 'first_build');
  const firstRaces  = obs.entries.filter(e => e.kind === 'first_race');
  ok('first_mine logged once',  firstMines.length === 1);
  ok('first_build logged once', firstBuilds.length === 1);
  ok('first_race logged once',  firstRaces.length === 1);
  ok('milestone detail kept',   firstBuilds[0]?.detail === 'wrench');
  ok('milestones map has all',  obs.milestones.first_mine && obs.milestones.first_build && obs.milestones.first_race);
  ok('milestone timestamps set', typeof obs.milestones.first_mine.t === 'number' && obs.milestones.first_mine.t === 1);

  console.log('\nObserver mode · export');

  const out = obs.exportJSON();
  ok('schema stamped',          out.schema === 'scrapcraft/observer-session/v1');
  ok('seed recorded',           out.seed === 1337);
  ok('source recorded',         typeof out.source === 'string');
  ok('startedAt recorded',      typeof out.startedAt === 'string' && out.startedAt.length > 10);
  ok('durationSec recorded',    typeof out.durationSec === 'number' && out.durationSec >= 1);
  ok('entries all well-formed', out.entries.every(e =>
    typeof e.t === 'number' && typeof e.kind === 'string' && typeof e.detail === 'string'));
  ok('JSON-serializable',       (() => { try { JSON.stringify(out); return true; } catch { return false; } })());
  const n = out.entries.length;
  const ended = obs.endSession();
  ok('endSession returns export', ended.entries.length === n + 1);
  ok('session_end appended',    obs.entries.at(-1)?.kind === 'session_end');
  obs.log('after_end', 'ignored');
  ok('no logging after end',    obs.entries.at(-1)?.kind === 'session_end');

  console.log('\nObserver mode · headless hardening');

  const headless = new SessionObserver({ search: '?observe=1' });   // no document, no performance
  headless.log('quest', 'works headless');
  ok('logs without document',   headless.entries.some(e => e.kind === 'quest'));
  ok('exports without document', !!headless.exportJSON());
  headless.endSession();
  const noPerf = new SessionObserver({ search: '?observe=1', now: () => Date.now() });
  ok('custom clock respected',  typeof noPerf._t() === 'number');
  noPerf.endSession();

  console.log('\nObserver mode · fresh vs returning (sessionType)');

  const freshObs = new SessionObserver({ search: '?observe=1', seed: 7, sessionType: 'fresh' });
  ok('sessionType from opts',          freshObs.sessionType === 'fresh');
  ok('export has sessionType',         freshObs.exportJSON().sessionType === 'fresh');
  ok('session_start names type',       freshObs.entries[0]?.detail.includes('fresh session'));
  freshObs.endSession();

  const unkObs = new SessionObserver({ search: '?observe=1' });
  ok('default sessionType unknown',    unkObs.sessionType === 'unknown');
  ok('export defaults unknown',        unkObs.exportJSON().sessionType === 'unknown');
  unkObs.markSessionType('returning');
  ok('markSessionType late set',       unkObs.sessionType === 'returning');
  ok('session_start reflects late set', unkObs.entries[0]?.detail.includes('returning session'));
  ok('export reflects late set',       unkObs.exportJSON().sessionType === 'returning');
  unkObs.endSession();

  console.log('\nObserver mode · idle heartbeat (dead-air markers)');

  let idleNow = 0;
  const idleObs = new SessionObserver({ search: '?observe=1', now: () => idleNow });
  ok('no idle marker at t=0',          idleObs.entries.every(e => e.kind !== 'idle_marker'));
  idleNow += 30_000; idleObs._idleCheck();
  ok('no idle marker at 30s',          idleObs.entries.every(e => e.kind !== 'idle_marker'));
  idleNow += 31_000; idleObs._idleCheck();   // t=61 → 61s quiet
  const m1 = idleObs.entries.find(e => e.kind === 'idle_marker');
  ok('idle marker after 60s quiet',    !!m1);
  ok('idle marker has duration',       m1 && typeof m1.duration === 'number' && m1.duration >= 60);
  ok('idle marker detail names idle',  m1 && m1.detail.includes('idle 61'));
  idleNow += 60_000; idleObs._idleCheck();   // t=121 → another full quiet window
  ok('second marker after 60s more',   idleObs.entries.filter(e => e.kind === 'idle_marker').length === 2);
  // activity() pings reset the window — quiet restarts from the ping
  idleObs.activity();                        // t=121
  idleNow += 59_000; idleObs._idleCheck();   // t=180 → 59s quiet → suppressed
  ok('activity suppresses idle marker', idleObs.entries.filter(e => e.kind === 'idle_marker').length === 2);
  idleNow += 2_000; idleObs._idleCheck();    // t=182 → 61s quiet again → fires
  ok('quiet after activity → marker',  idleObs.entries.filter(e => e.kind === 'idle_marker').length === 3);
  // a logged event also counts as alive
  idleObs.log('quest', 'alive');             // t=182
  idleNow += 59_000; idleObs._idleCheck();   // t=241 → 59s since event → suppressed
  ok('logged event suppresses idle',   idleObs.entries.filter(e => e.kind === 'idle_marker').length === 3);
  idleObs.endSession();
  idleNow += 60_000; idleObs._idleCheck();
  ok('no idle marker after end',       idleObs.entries.filter(e => e.kind === 'idle_marker').length === 3);

  console.log('\nObserver mode · menu surfaces + input failures');

  const menuObs = new SessionObserver({ search: '?observe=1' });
  menuObs.menuOpen('workshop', 'workbench');
  menuObs.menuClose('workshop');
  menuObs.menuOpen('maker_bench');
  menuObs.menuClose('maker_bench');
  menuObs.menuOpen('codex');
  menuObs.inputFailure('pointer-lock request denied by browser');
  ok('menu_open with detail',          menuObs.entries.some(e => e.kind === 'menu_open' && e.detail === 'workshop — workbench'));
  ok('menu_close logged',              menuObs.entries.some(e => e.kind === 'menu_close' && e.detail === 'workshop'));
  ok('maker_bench open/close pair',    menuObs.entries.some(e => e.kind === 'menu_open' && e.detail === 'maker_bench')
    && menuObs.entries.some(e => e.kind === 'menu_close' && e.detail === 'maker_bench'));
  ok('codex open logged',              menuObs.entries.some(e => e.kind === 'menu_open' && e.detail === 'codex'));
  ok('menu events carry timestamps',   menuObs.entries.filter(e => e.kind.startsWith('menu_')).every(e => typeof e.t === 'number'));
  ok('input_failure logged',           menuObs.entries.some(e => e.kind === 'input_failure' && e.detail.includes('pointer-lock')));
  menuObs.endSession();

  console.log('\nObserver mode · schema backward-compat (additive-only)');

  const bc = new SessionObserver({ search: '?observe=1', seed: 42, source: 'kid-session' });
  bc.menuOpen('help');
  bc.menuClose('help');
  bc.inputFailure('pointer-lock refused after 6 attempts — controls dead');
  bc.log('quest', 'q1');
  bc.milestone('first_mine', 'first block mined');
  const bce = bc.exportJSON();
  ok('schema still v1',                bce.schema === 'scrapcraft/observer-session/v1');
  ok('legacy fields intact',           typeof bce.startedAt === 'string' && typeof bce.durationSec === 'number'
    && bce.seed === 42 && bce.source === 'kid-session' && bce.milestones && typeof bce.milestones === 'object');
  ok('sessionType additive',           'sessionType' in bce);
  ok('entries still well-formed',      bce.entries.every(e =>
    typeof e.t === 'number' && typeof e.kind === 'string' && typeof e.detail === 'string'));
  ok('JSON-serializable with new kinds', (() => { try { JSON.stringify(bce); return true; } catch { return false; } })());
  bc.endSession();
}
