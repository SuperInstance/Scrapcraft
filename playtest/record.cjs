// Action-recording playtester for the deployed Scrapcraft build.
//
// Casey's doctrine: don't record video of playtests — record ACTIONS.
// Every input this driver sends is written to an action log (JSONL, ms
// timestamps on a session clock). The log is replayable: `replay` mode
// re-issues the same inputs on the same schedule in a fresh session and
// samples the same state channel, so a cool run can be re-run cheaply —
// and re-skinned (the world seed is fixed; rendering is the game's).
//
// State channel (sampled, never an input): HUD text, observer event
// count (?observe=1), pointer-lock status, and sparse screenshots for
// the human verifier only.
//
// Modes:
//   node record.cjs record  <actions.jsonl> <shotsDir>
//   node record.cjs replay  <actions.jsonl> <shotsDir>
const fs = require('fs');
const http = require('http');
const path = require('path');

const MODE = process.argv[2] || 'record';
const LOG_PATH = process.argv[3] || 'actions.jsonl';
const SHOTS = process.argv[4] || 'shots';
const CDP_PORT = 9223;
const BASE = 'https://play.superinstance.dev';
const PASS = process.env.SC_PASS || '';
const GAME_URL = BASE + '/?observe=1&seed=playtest-1&lite=1';

fs.mkdirSync(SHOTS, { recursive: true });

function getJson(p) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (r) => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const OUT_PATH = MODE === 'record' ? LOG_PATH : LOG_PATH.replace(/\.jsonl$/, '') + '.replay.jsonl';
  fs.writeFileSync(OUT_PATH, '');
  const out = { write: (s) => fs.appendFileSync(OUT_PATH, s) };
  const t0 = Date.now();
  const now = () => Date.now() - t0;
  const log = (kind, data = {}) => out.write(JSON.stringify({ t: now(), kind, ...data }) + '\n');
  const watchdog = setTimeout(() => { log('fatal', { error: 'watchdog' }); process.exit(2); }, 560000);
  log('session', { mode: MODE, gameUrl: GAME_URL });

  // ── CDP plumbing (same proven pattern as the cinema rig + proxy auth) ──
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await getJson('/json/list')).find(t => t.type === 'page' && t.webSocketDebuggerUrl); } catch {}
    if (!target) await sleep(1000);
  }
  if (!target) { log('fatal', { error: 'no page target' }); process.exit(1); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pending = new Map();
  const proxyAuth = null; // proxy auth is handled by the local forwarder now
  const consoleErrors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 160));
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++seq;
    const timer = setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ timeout: true }); } }, 60000);
    pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (!r || r.timeout) return { timeout: true };
    if (r.result?.exceptionDetails) return { error: String(r.result.exceptionDetails.text || '').slice(0, 120) };
    return r.result?.result?.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  if (process.env.SC_TOUCH === '1') {
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setEmitTouchEventsForMouse', { enabled: false });
    log('note', { text: 'touch emulation on' });
  }

  // ── input primitives — EVERY one is written to the action log ──
  const key = async (dir, code, vk) => {
    log('key', { code, dir });
    await send('Input.dispatchKeyEvent', { type: dir === 'down' ? 'keyDown' : 'keyUp', code, key: code.replace(/^(Key|Digit)/, '').toLowerCase(), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };
  const touch = async (type, points) => {
    log('touch', { type, points: points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id })) });
    await send('Input.dispatchTouchEvent', { type, touchPoints: points });
  };
  const tap = async (x, y) => { await touch('touchStart', [{ x, y, id: 1 }]); await sleep(130); await touch('touchEnd', []); };
  const mouse = async (type, x, y, opts = {}) => {
    log('mouse', { type, x: Math.round(x), y: Math.round(y), ...opts });
    await send('Input.dispatchMouseEvent', { type, x, y, button: opts.button || 'left', buttons: opts.buttons ?? (type === 'mousePressed' ? 1 : 0), clickCount: type === 'mousePressed' ? 1 : 0 });
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 55 });
    if (r.result?.data) fs.writeFileSync(path.join(SHOTS, name + '.jpg'), Buffer.from(r.result.data, 'base64'));
    log('shot', { name });
  };
  const sampleState = async (tag) => {
    const s = await evalJs(`(() => {
      const hud = document.getElementById('hud');
      const obs = window.__scrapcraftObserver;
      let evs = null;
      try { evs = obs ? (obs.events?.length ?? obs._events?.length ?? null) : null; } catch {}
      return {
        href: location.href,
        locked: !!document.pointerLockElement,
        hud: hud ? hud.innerText.replace(/\\s+/g, ' ').slice(0, 220) : null,
        obsEvents: evs,
        gate: !!document.getElementById('companion-gate'),
        canvas: !!document.getElementById('game-canvas'),
        menu: !![...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /CLOCK IN/i.test(x.textContent || '')),
        veteran: !![...document.querySelectorAll('button')].find(x => /Keep fresh/i.test(x.textContent || '')),
        gateText: document.getElementById('companion-gate') ? (document.getElementById('companion-gate').textContent || '').replace(/\\s+/g, ' ').slice(0, 140) : null,
        obsText: (() => { try { const o = window.__scrapcraftObserver; const el = o && (o._listEl || o.listEl); return el ? el.innerText.replace(/\\s+/g, ' ').slice(-300) : null; } catch { return null; } })(),
      };
    })()`);
    log('state', { tag, ...(s && !s.timeout ? s : { sampleTimeout: true }) });
    return s;
  };

  // ── shared preamble: login, then into the game ──
  await send('Page.navigate', { url: BASE + '/login' });
  log('nav', { url: BASE + '/login' });
  await sleep(5000);
  const loginRes = await evalJs(`(() => {
    const u = document.querySelector('input[name="user"]');
    const p = document.querySelector('input[name="pass"]');
    if (!u || !p) return 'no-form';
    u.value = 'casey'; p.value = ${JSON.stringify(PASS)};
    document.querySelector('form').requestSubmit();
    return 'submitted';
  })()`);
  log('login', { result: loginRes });
  await sleep(3000);
  await send('Page.navigate', { url: GAME_URL });
  log('nav', { url: GAME_URL });

  // wait for the game canvas + click through dialogs as they appear
  const answerGate = async () => {
    const r = await evalJs(`(() => {
      const gate = document.getElementById('companion-gate');
      if (!gate) return 'none';
      const txt = gate.textContent || '';
      const pick = txt.includes('pulls your eye') ? 'engines' : txt.includes('first job') ? 'explore' : null;
      if (pick) { const b = gate.querySelector('button[data-a="' + pick + '"]'); if (b) { b.click(); return 'gate:' + pick; } }
      return 'gate:waiting';
    })()`);
    if (r && r !== 'none' && !r.timeout) log('dialog', { result: r });
    return r;
  };

  let booted = false;
  for (let i = 0; i < 45 && !booted; i++) {
    await answerGate();
    const s = await sampleState('boot');
    if (s && s.canvas && !s.gate) booted = true;
    if (!booted) await sleep(2500);
  }
  log('booted', { ok: booted });
  await shot('00-booted');
  if (!booted) { log('fatal', { error: 'never booted', consoleErrors: consoleErrors.slice(0, 6) }); process.exit(3); }

  // ── Shared entry flow: CLOCK IN, then the entry director ────────────
  // UI navigation is SEMANTIC (DOM clicks on named controls, logged as
  // dialog actions) because raw touch taps on DOM buttons are unreliable
  // here — the game's touch layer eats them. Raw inputs are reserved
  // for in-world play, which is the part worth replaying/re-skinning.
  const TOUCH = process.env.SC_TOUCH === '1';
  const pressClockIn = async () => {
    const ciRect = await evalJs(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.offsetParent !== null && /CLOCK IN/i.test(x.textContent || ''));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    log('dialog', { action: 'clock-in-rect', rect: ciRect });
    if (ciRect && !ciRect.timeout) {
      if (TOUCH) await tap(ciRect.x, ciRect.y);
      else { await mouse('mousePressed', ciRect.x, ciRect.y); await mouse('mouseReleased', ciRect.x, ciRect.y); }
    }
    await sleep(3000);
  };
  const entryAct = () => evalJs(`(() => {
    const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
    const gate = document.getElementById('companion-gate');
    if (vis(gate)) {
      const txt = gate.textContent || '';
      const pick = txt.includes('pulls your eye') ? 'engines' : txt.includes('first job') ? 'explore' : null;
      const b = pick ? gate.querySelector('button[data-a="' + pick + '"]') : null;
      if (b) { b.click(); return { step: 'gate:' + pick }; }
      return { step: 'gate-wait' };
    }
    const btns = [...document.querySelectorAll('button')].filter(vis);
    const vf = btns.find(x => /Keep fresh/i.test(x.textContent || ''));
    if (vf) { vf.click(); return { step: 'veteran:keep-fresh' }; }
    const nb = btns.find(x => /^(Next|Skip|Got it|Begin)/i.test((x.textContent || '').trim()));
    if (nb) { nb.click(); return { step: 'card-btn:' + nb.textContent.trim().slice(0, 16) }; }
    const card = [...document.querySelectorAll('div')].find(d => vis(d) && /click to return to the yard/i.test(d.textContent || '') && d.getBoundingClientRect().width > 300);
    if (card) { card.click(); return { step: 'chapter-card' }; }
    return { step: 'clear' };
  })()`);
  const runEntry = async () => {
    let cleared = false;
    for (let i = 0; i < 30 && !cleared; i++) {
      const st = await entryAct();
      log('entry', { i, st });
      if (!st || st.timeout) { await sleep(2000); continue; }
      if (st.step === 'clear') {
        const s = await sampleState('entry-check');
        if (s && !s.gate && !s.menu && !s.veteran) cleared = true;
        else await sleep(2000);
        continue;
      }
      await sleep(1800);
    }
    log('entry', { cleared });
    return cleared;
  };

  if (MODE === 'replay') {
    // UI entry is re-run semantically; only the in-world inputs (after
    // the recorded entry cleared) are re-issued, on their schedule.
    const lines = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const clearedLine = lines.find(e => e.kind === 'entry' && e.cleared === true);
    const clearedT = clearedLine ? clearedLine.t : 0;
    const inputs = lines.filter(e => ['key', 'mouse', 'touch'].includes(e.kind) && e.t > clearedT);
    await pressClockIn();
    await runEntry();
    await sampleState('replay-in-world');
    const startAt = inputs.length ? inputs[0].t : 0;
    const myStart = now();
    for (const e of inputs) {
      const wait = (e.t - startAt) - (now() - myStart);
      if (wait > 0) await sleep(Math.min(wait, 30000));
      if (e.kind === 'key') {
        log('key', { code: e.code, dir: e.dir, replay: true });
        await send('Input.dispatchKeyEvent', { type: e.dir === 'down' ? 'keyDown' : 'keyUp', code: e.code, key: e.code.replace(/^(Key|Digit)/, '').toLowerCase(), windowsVirtualKeyCode: 0, nativeVirtualKeyCode: 0 });
      } else if (e.kind === 'touch') {
        log('touch', { type: e.type, points: e.points, replay: true });
        await send('Input.dispatchTouchEvent', { type: e.type, touchPoints: e.points || [] });
      } else {
        log('mouse', { type: e.type, x: e.x, y: e.y, replay: true });
        await send('Input.dispatchMouseEvent', { type: e.type, x: e.x, y: e.y, button: e.button || 'left', buttons: e.buttons ?? (e.type === 'mousePressed' ? 1 : 0), clickCount: e.type === 'mousePressed' ? 1 : 0 });
      }
      if (inputs.indexOf(e) % 6 === 0) await sampleState('replay');
    }
    await sleep(2000);
    await sampleState('replay-end');
    await shot('replay-end');
    log('done', { consoleErrors: consoleErrors.slice(0, 6) });
    clearTimeout(watchdog);
    process.exit(0);
  }

  // ── RECORD MODE: an actual play session (touch path — the game's
  // native iPad mode; pointer lock is denied in this rig because the
  // software-rendered boot outlives the click's gesture activation).
  await sampleState('title');
  await pressClockIn();
  await runEntry();
  await sampleState('in-world');
  await shot('00-in-world');

  // ── Play: joystick forward (left-thumb anchor, drag up = forward).
  // Anchor mid-left: bottom-left is the OBSERVER PANEL's ground (it eats
  // touches — a playtest-only artifact), top-left is the quest panels.
  const joy = async (dx, dy, holdMs, tag) => {
    const ax = 320, ay = 300;
    await touch('touchStart', [{ x: ax, y: ay, id: 1 }]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: ax + dx * i / 6, y: ay + dy * i / 6, id: 1 }]); await sleep(160); }
    if (tag) await shot(tag);
    await sleep(holdMs);
    await touch('touchEnd', []);
  };
  await joy(0, -95, 4000, '01-joy-hold');
  await sampleState('joy-fwd');
  await shot('01-joy-fwd');
  // Look: right-thumb drag.
  await touch('touchStart', [{ x: 900, y: 300, id: 1 }]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: 900 - i * 45, y: 300, id: 1 }]); await sleep(120); }
  await touch('touchEnd', []);
  await sleep(600);
  await sampleState('looked');
  await shot('02-looked');

  await joy(0, -95, 3000);
  await sampleState('joy-fwd-2');
  await shot('03-joy-fwd-2');

  // Mine: set the tap action to 'mine' if there's a switch for it, then
  // hold on the centre of the view (the crosshair target) — the heap the
  // "SCRAP THIS WAY" marker points at. Watch the (n/5) counter after.
  const tb = await evalJs(`(() => [...document.querySelectorAll('button,[role="button"]')].filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: Math.round(r.width), label: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 32) }; }).filter(o => o.w > 28 && o.w < 110 && o.x > innerWidth * 0.82).slice(0, 6))()`);
  log('note', { text: 'touch buttons: ' + JSON.stringify(tb) });
  const mineSwitch = tb && tb.find(b => /tap action: mine/i.test(b.label || ''));
  if (mineSwitch) { await tap(mineSwitch.x, mineSwitch.y); await sleep(800); }
  await touch('touchStart', [{ x: 640, y: 330, id: 1 }]);
  await sleep(5000);
  await touch('touchEnd', []);
  await sampleState('mined');
  await shot('04-mined');
  await sampleState('end');
  await shot('05-end');
  log('done', { consoleErrors: consoleErrors.slice(0, 6) });
  clearTimeout(watchdog);
  process.exit(0);
})();
