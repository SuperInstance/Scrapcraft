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
}
