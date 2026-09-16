/**
 * RobotMindPanel tests — the pure, DOM-free parts: the defensive extractors that
 * turn an unknown-shaped scrap-quilt /chat or /predict response into a readable
 * line. (The panel's DOM rendering is exercised in-game, not here.) The panel
 * constructor touches no DOM, so we can instantiate it headlessly and call the
 * parsers directly.
 */

import { RobotMindPanel } from '../RobotMindPanel.js';

export function runRobotMindTests(ok, fail) {
  const check = (name, cond, extra = '') => (cond ? ok(name) : fail(name, extra));
  const p = new RobotMindPanel(null);   // no game / no DOM needed for the parsers

  // ── _readChat: pull a human answer out of assorted response shapes ──────────
  check('chat: raw string passes through', p._readChat('just because') === 'just because');
  check('chat: {answer}', p._readChat({ answer: 'it saw a wall' }) === 'it saw a wall');
  check('chat: {reply}', p._readChat({ reply: 'turning left' }) === 'turning left');
  check('chat: {text}', p._readChat({ text: 'clear ahead' }) === 'clear ahead');
  check('chat: {message}', p._readChat({ message: 'hi' }) === 'hi');
  check('chat: {response}', p._readChat({ response: 'ok' }) === 'ok');
  check('chat: trims whitespace', p._readChat({ answer: '  spaced  ' }) === 'spaced');
  check('chat: empty-string field falls back to JSON', p._readChat({ answer: '   ', foo: 1 }).includes('foo'));
  check('chat: unknown shape → JSON fallback', p._readChat({ foo: 'bar' }).includes('bar'));

  // ── _readPredict: summarize a ghost-racer forward-sim ───────────────────────
  check('predict: {summary} wins', p._readPredict({ summary: 'reaches the gate' }) === 'reaches the gate');
  check('predict: flat cells → heads toward',
    p._readPredict({ 'robot.x': 5, 'robot.z': 6 }) === 'In ~40 ticks it heads toward (5.0, 6.0).');
  check('predict: wrapped cells {v} → heads toward',
    p._readPredict({ cells: { 'robot.x': { v: 3 }, 'robot.z': { v: 4 } } }).includes('heads toward (3.0, 4.0)'));
  check('predict: includes plan (robot.think)',
    p._readPredict({ 'robot.x': 1, 'robot.z': 1, 'robot.think': 'avoid' }).includes('plan: avoid'));
  check('predict: flags a likely crash',
    p._readPredict({ 'robot.x': 1, 'robot.z': 1, crash: true }).includes('crash'));
  check('predict: lap fraction reported as %',
    p._readPredict({ 'race.lapFrac': 0.5 }).includes('lap 50%'));
  check('predict: unknown shape → JSON fallback', p._readPredict({ mystery: 9 }).includes('mystery'));
  check('predict: raw string passes through', p._readPredict('done') === 'done');

  // Real deployed-Worker shape: { ghosts: [{ tick, lapCrossings, cells:{…} }] }
  {
    const real = { base_t: 12, dt_ms: 500, ghosts: [
      { tick: 1, lapCrossings: 0, cells: { 'robot.x': 29.76, 'robot.z': 4.96, 'robot.think': 'cruise', 'race.lapFrac': 0.0263 } },
      { tick: 2, lapCrossings: 1, cells: { 'robot.x': 30.10, 'robot.z': 14.2, 'robot.think': 'cruise', 'race.lapFrac': 0.51 } },
    ] };
    const s = p._readPredict(real);
    check('predict: summarizes the endpoint ghost', s.includes('heads toward (30.1, 14.2)'), s);
    check('predict: uses ghost count for tick horizon', s.includes('In ~2 ticks'), s);
    check('predict: reports lap crossings from ghosts', s.includes('crosses the line 1×'), s);
    check('predict: reads plan from endpoint ghost', s.includes('plan: cruise'), s);
  }
}
