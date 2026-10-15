/**
 * ───────────────────────────────────────────────────────────────────────────
 *  LEVEL 2 CINEMA DIRECTOR — the film runs itself (until you grab it)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * v2: autoplay + takeover + the Projectionist studio.
 *
 * The playlist is a chain of timeline cutscenes played through the game's
 * own CutsceneDirector (game.cinema) — which also gates player.tick, so the
 * camera is the director's from the first beat to the last. Beats chain via
 * onDone; the end card loops back to the cold open. The film never stops.
 *
 * Takeover: dragging the 3D view (>6px), pressing WASD/arrows, or the
 * TAKE THE CAMERA button freezes the timeline (setPaused) and hands the
 * viewer an orbit rig — drag to orbit, wheel/pinch to dolly, WASD to pan,
 * ESC (or RESUME FILM) to hand the film back, replaying the current beat
 * from its start.
 *
 * Organic drift: slow LFOs breathe on orbit radius, camera height and ASCII
 * contrast — the dials mirror the drifted positions, so you can watch the
 * machine thinking.
 *
 * Side-by-side: the ASCII sampler (./ascii.js) mirrors the WebGL canvas as
 * text in #l2-ascii, driven by the same live params object as the TEXT
 * dials. Telemetry lands on window.__cinema.telemetry every frame; the
 * studio sidebar reads it at ~4Hz.
 *
 * MARK MOMENT ♥ drops {t, beatId, azDeg, radius, height} into localStorage
 * `l2-moments` (cap 40) — the seed of the greatest-hits reel.
 */

import * as THREE from 'three';
import './cutscenes.js'; // side effect: registers the l2-* beats
import { startAscii } from './ascii.js';
import { cutsceneById } from '../cinema/Timeline.js';

// [beat id, time-of-day 0–1] — the light is part of the direction.
const PLAYLIST = [
  ['intro-dawn-arrival', 0.30], // cold open — the yard's own dawn arrival
  ['l2-gate',            0.38], // morning at the gate
  ['l2-oval',            0.50], // midday on the oval
  ['l2-workshop',        0.62], // afternoon in the corridor
  ['l2-midnight',        0.00], // midnight — the race
  ['l2-endcard',         0.30], // dawn again — loop
];

const INTERLUDE_MS = 600;
const MOMENT_KEY = 'l2-moments';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Live params — shared by reference with the ASCII sampler and every dial.
const params = {
  orbitSpeed: 1,    // 0.2–2 — scales the film's timeline in film mode
  orbitRadius: 1,   // 0.6–1.6 — framing multiplier
  camHeight: 1,     // 0.6–1.6 — framing multiplier
  fov: 70,          // 40–90
  cols: 110,        // 20–240 — resolution: 20 = huge glyphs, 240 = fine engraving
  charset: 'standard',
  contrast: 1,      // 0.5–2.5 — wider, more dramatic
  brightness: 0,    // -0.5–0.5
  gamma: 1,         // 0.5–2.0 — bends the midtones
  invert: false,
  color: false,
  asciiFps: 12,     // 4–24
  autoTune: true,   // the Projectionist finds the best image on its own
};

// Organic drift — slow LFOs. The machine breathes; the dials show it.
const drift = { r: 1, h: 1, c: 1 };
let driftOn = true;
function tickDrift() {
  const t = performance.now() / 1000;
  if (!driftOn) { drift.r = drift.h = drift.c = 1; return; }
  drift.r = 1 + 0.10 * Math.sin(t * 0.11);
  drift.h = 1 + 0.12 * Math.sin(t * 0.07 + 1.3);
  drift.c = 1 + 0.15 * Math.sin(t * 0.23 + 0.5);
}

export function startCinema(game) {
  document.body.classList.add('cinema');

  // Defensive: the cinema owns the frame. Kill the opening orbit (if any),
  // hide pause/help overlays, make sure the game isn't paused.
  try { game._openingCinematic?.end?.(); } catch { /* garnish */ }
  for (const sel of ['#pause-overlay', '#help-overlay', '#pregame-toast']) {
    try { document.querySelector(sel)?.style.setProperty('display', 'none'); } catch { /* noop */ }
  }

  const cinema = game.cinema;
  const camera = game.renderer?.camera;
  const canvas = document.getElementById('game-canvas');
  const view3d = document.getElementById('l2-view3d');
  if (!cinema || !camera) {
    console.warn('[cinema] game.cinema/camera missing — cannot direct.');
    return;
  }

  // Autoplay starts silent (no gesture yet). First touch of the page wakes
  // the game's audio graph so the yard can make noise.
  const wakeAudio = () => {
    try { game.audio?._ensure?.(); game.audio?._resume?.(); } catch { /* silent film */ }
  };
  window.addEventListener('pointerdown', wakeAudio, { once: true });
  window.addEventListener('keydown', wakeAudio, { once: true });

  // ── letterbox + subtitle docking ──────────────────────────────────────
  // The engine creates bars/subtitles as position:fixed under <body>; in the
  // studio they belong inside the voxel pane, absolutely positioned.
  function dockLetterbox() {
    if (!view3d) return;
    for (const id of ['cs-bar-top', 'cs-bar-bot']) {
      const el = document.getElementById(id);
      if (el && el.parentElement !== view3d) {
        el.style.position = 'absolute';
        view3d.appendChild(el);
      }
    }
    const sub = document.getElementById('cs-subtitle');
    if (sub && sub.parentElement !== view3d) view3d.appendChild(sub);
  }
  const subEl = () => document.getElementById('cs-subtitle') || undefined;
  const rawPlay = cinema.play.bind(cinema);
  cinema.play = (id, opts = {}) => {
    const ok = rawPlay(id, { ...opts, subtitleEl: subEl() });
    if (ok) dockLetterbox();
    return ok;
  };

  // ── film-mode framing: orbit-speed scales the timeline; radius/height ──
  // reframe the director's pose around the beat's center; FOV is live.
  const rawUpdate = cinema.update.bind(cinema);
  cinema.update = (dt) => {
    if (held) return; // frozen — the viewer has the camera
    tickDrift();
    rawUpdate(dt * params.orbitSpeed);
    const rm = params.orbitRadius * drift.r;
    const hm = params.camHeight * drift.h;
    if ((rm !== 1 || hm !== 1) && currentId) {
      const c = cutsceneById(currentId)?.camera?.center || { x: 64, z: 62 };
      const p = camera.position;
      p.x = c.x + (p.x - c.x) * rm;
      p.z = c.z + (p.z - c.z) * rm;
      p.y = Math.max(3, p.y * hm);
    }
    if (camera.fov !== params.fov) {
      camera.fov = params.fov;
      camera.updateProjectionMatrix();
    }
    updateTelemetryFilm();
  };

  // ── playlist ──────────────────────────────────────────────────────────
  let i = 0;
  let stopped = false;
  let chainToken = 0;
  let currentId = null;
  let currentTitle = '';

  const setBeatLabel = () => {
    const el = document.getElementById('l2-beat');
    if (el) el.textContent = currentTitle ? `NOW SHOWING — ${currentTitle}` : 'NOW SHOWING';
  };

  const playNext = () => {
    if (stopped) return;
    const [id, tod] = PLAYLIST[i % PLAYLIST.length];
    i += 1;
    const tok = ++chainToken;
    currentId = id;
    currentTitle = cutsceneById(id)?.title || id;
    try { if (game.dayNight) game.dayNight._time = tod; } catch { /* light stays */ }
    try { game.ui?.setPaused?.(false); } catch { /* unpauses best-effort */ }
    setBeatLabel();
    const ok = cinema.play(id, {
      onDone: () => {
        if (tok !== chainToken) return; // superseded by a resume replay
        setTimeout(playNext, INTERLUDE_MS);
      },
    });
    if (!ok) {
      console.warn('[cinema] beat failed to play:', id);
      setTimeout(playNext, INTERLUDE_MS);
    }
  };

  // ── takeover: the viewer grabs the camera ──────────────────────────────
  let held = false;
  const rig = { yaw: 0, pitch: -0.25, dist: 30, tx: 64, ty: 5, tz: 62 };
  const keysDown = new Set();
  let freeRaf = 0;
  let freeLast = 0;

  const heldBadge = () => document.getElementById('l2-held-badge');
  const takeBtn = () => document.getElementById('l2-take');
  const resumeBtn = () => document.getElementById('l2-resume');

  function takeCamera() {
    if (held || !camera) return;
    held = true;
    try { cinema.setPaused(true); } catch { /* timeline freezes best-effort */ }
    // Seed the rig from the director's current framing.
    try {
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      const d = 30;
      rig.tx = clamp(camera.position.x + fwd.x * d, 0, 128);
      rig.ty = clamp(camera.position.y + fwd.y * d, 2, 40);
      rig.tz = clamp(camera.position.z + fwd.z * d, 0, 130);
      rig.pitch = clamp(Math.asin(clamp(-fwd.y, -1, 1)), -1.2, 1.2);
      rig.yaw = Math.atan2(-fwd.x, -fwd.z);
      rig.dist = 30;
    } catch { /* rig keeps its defaults */ }
    heldBadge()?.removeAttribute('hidden');
    takeBtn()?.setAttribute('hidden', '');
    resumeBtn()?.removeAttribute('hidden');
    freeLast = performance.now();
    cancelAnimationFrame(freeRaf);
    freeRaf = requestAnimationFrame(freeCamLoop);
  }

  function resumeFilm() {
    if (!held) return;
    held = false;
    keysDown.clear();
    cancelAnimationFrame(freeRaf);
    try { cinema.setPaused(false); } catch { /* noop */ }
    heldBadge()?.setAttribute('hidden', '');
    resumeBtn()?.setAttribute('hidden', '');
    takeBtn()?.removeAttribute('hidden');
    // Replay the current beat from its start; the chain token kills the
    // stale onDone so the playlist doesn't double-advance.
    const tok = ++chainToken;
    if (currentId) {
      cinema.play(currentId, {
        onDone: () => {
          if (tok !== chainToken) return;
          setTimeout(playNext, INTERLUDE_MS);
        },
      });
    } else {
      playNext();
    }
  }

  function freeCamLoop(now) {
    if (!held) return;
    freeRaf = requestAnimationFrame(freeCamLoop);
    tickDrift();
    const dt = clamp((now - freeLast) / 1000, 0.001, 0.1);
    freeLast = now;

    // WASD/arrows pan the look target across the yard, in the yaw frame.
    const sp = rig.dist * 0.55 * dt;
    const sy = Math.sin(rig.yaw), cy = Math.cos(rig.yaw);
    let f = 0, r = 0;
    if (keysDown.has('KeyW') || keysDown.has('ArrowUp')) f += 1;
    if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) f -= 1;
    if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) r += 1;
    if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) r -= 1;
    if (f || r) {
      rig.tx = clamp(rig.tx + (-sy * f + cy * r) * sp, 0, 128);
      rig.tz = clamp(rig.tz + (-cy * f - sy * r) * sp, 0, 130);
    }

    const rm = params.orbitRadius * drift.r;
    const hm = params.camHeight * drift.h;
    const d = clamp(rig.dist * rm, 4, 60);
    const cp = Math.cos(rig.pitch);
    camera.position.set(
      rig.tx + d * Math.sin(rig.yaw) * cp,
      clamp(rig.ty + d * Math.sin(rig.pitch) * hm, 2, 60),
      rig.tz + d * Math.cos(rig.yaw) * cp
    );
    camera.lookAt(rig.tx, rig.ty, rig.tz);
    if (camera.fov !== params.fov) {
      camera.fov = params.fov;
      camera.updateProjectionMatrix();
    }
    updateTelemetryHeld();
  }

  // Takeover triggers: drag >6px on the 3D view, WASD/arrows, or the button.
  let dragStart = null;
  let dragMoved = 0;
  const pointers = new Map();
  let pinchD0 = 0;

  if (canvas) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragStart = { x: e.clientX, y: e.clientY };
        dragMoved = 0;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchD0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        if (!held) takeCamera();
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d1 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        if (!held) takeCamera();
        rig.dist = clamp(rig.dist * (pinchD0 / d1), 4, 60);
        pinchD0 = d1;
        return;
      }
      if (!dragStart) return;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      if (dragMoved > 6 && !held) takeCamera();
      if (held) {
        rig.yaw -= dx * 0.005;
        rig.pitch = clamp(rig.pitch - dy * 0.005, -1.2, 1.2);
      }
    });
    const endPointer = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) dragStart = null;
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!held) takeCamera();
      rig.dist = clamp(rig.dist * (1 + e.deltaY * 0.001), 4, 60);
    }, { passive: false });
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (held) { e.preventDefault(); resumeFilm(); }
      return;
    }
    if (e.code === 'Space') {
      if (!held) { e.preventDefault(); skip(); }
      return;
    }
    if (/^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(e.code)) {
      if (!held) takeCamera();
      keysDown.add(e.code);
      if (held) e.preventDefault();
    }
  });
  document.addEventListener('keyup', (e) => keysDown.delete(e.code));

  const skip = () => { try { if (!held) cinema.skip(); } catch { /* nothing playing */ } };
  document.getElementById('l2-skip')?.addEventListener('click', skip);
  document.getElementById('cinema-skip')?.addEventListener('click', skip);
  takeBtn()?.addEventListener('click', takeCamera);
  resumeBtn()?.addEventListener('click', resumeFilm);

  // ── telemetry ─────────────────────────────────────────────────────────
  const telemetry = {
    mode: 'film', beatId: null, beatTitle: '', beatT: 0,
    azDeg: 0, radius: 0, height: 0, tod: 0, asciiFps: 0,
  };
  let asciiCtl = null;

  function beatCenter() {
    return cutsceneById(currentId)?.camera?.center || { x: 64, z: 62 };
  }
  function updateTelemetryFilm() {
    telemetry.mode = 'film';
    telemetry.beatId = currentId;
    telemetry.beatTitle = currentTitle;
    telemetry.beatT = cinema._t ?? 0;
    const c = beatCenter();
    const dx = camera.position.x - c.x, dz = camera.position.z - c.z;
    telemetry.azDeg = ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;
    telemetry.radius = Math.hypot(dx, dz);
    telemetry.height = camera.position.y;
    try { telemetry.tod = game.dayNight?._time ?? 0; } catch { /* noop */ }
    telemetry.asciiFps = asciiCtl?.fps ?? 0;
  }
  function updateTelemetryHeld() {
    telemetry.mode = 'held';
    telemetry.beatId = currentId;
    telemetry.beatTitle = currentTitle;
    telemetry.beatT = cinema._t ?? 0;
    telemetry.azDeg = ((rig.yaw * 180) / Math.PI + 360) % 360;
    telemetry.radius = rig.dist;
    telemetry.height = camera.position.y;
    try { telemetry.tod = game.dayNight?._time ?? 0; } catch { /* noop */ }
    telemetry.asciiFps = asciiCtl?.fps ?? 0;
  }

  // ── moments (greatest-hits seed) ──────────────────────────────────────
  function loadMoments() {
    try { return JSON.parse(localStorage.getItem(MOMENT_KEY)) || []; }
    catch { return []; }
  }
  function saveMoments(m) {
    try { localStorage.setItem(MOMENT_KEY, JSON.stringify(m.slice(0, 40))); }
    catch { /* private mode */ }
  }
  function renderMoments() {
    const box = document.getElementById('l2-moments');
    if (!box) return;
    const m = loadMoments();
    if (!m.length) {
      box.innerHTML = '<div class="l2-empty">No moments yet — hit ♥ when the yard does something worth keeping.</div>';
      return;
    }
    box.innerHTML = '';
    m.forEach((mom, idx) => {
      const row = document.createElement('div');
      row.className = 'l2-moment' + (mom.star ? ' starred' : '');
      const when = new Date(mom.t).toLocaleTimeString();
      row.innerHTML =
        '<button class="l2-star" title="greatest hit">' + (mom.star ? '★' : '☆') + '</button>' +
        '<span class="l2-moment-meta">' + when + ' · ' + (mom.beatId || '?') +
        ' · az ' + mom.azDeg + '°</span>';
      row.querySelector('.l2-star').addEventListener('click', () => {
        const all = loadMoments();
        if (all[idx]) { all[idx].star = !all[idx].star; saveMoments(all); renderMoments(); }
      });
      box.appendChild(row);
    });
  }
  function markMoment() {
    const m = loadMoments();
    m.unshift({
      t: Date.now(),
      beatId: currentId,
      azDeg: +telemetry.azDeg.toFixed(1),
      radius: +telemetry.radius.toFixed(1),
      height: +telemetry.height.toFixed(1),
      star: false,
    });
    saveMoments(m);
    renderMoments();
  }
  document.getElementById('l2-mark')?.addEventListener('click', markMoment);

  // ── studio dials ──────────────────────────────────────────────────────
  function dial(containerId, { label, min, max, step, get, set, fmt, drifted }) {
    const box = document.getElementById(containerId);
    if (!box) return;
    const wrap = document.createElement('div');
    wrap.className = 'l2-dial';
    const lab = document.createElement('label');
    lab.innerHTML = '<span>' + label + '</span><b></b>';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min; input.max = max; input.step = step;
    input.value = get();
    const val = lab.querySelector('b');
    const paint = () => { val.textContent = fmt(drifted ? drifted() : get()); };
    input.addEventListener('input', () => { set(parseFloat(input.value)); paint(); });
    let scrubbing = false;
    input.addEventListener('pointerdown', () => { scrubbing = true; });
    window.addEventListener('pointerup', () => { scrubbing = false; });
    wrap.appendChild(lab);
    wrap.appendChild(input);
    box.appendChild(wrap);
    paint();
    // The drifted position moves under your hand — unless you're holding it.
    dialPainters.push(() => {
      if (!scrubbing && document.activeElement !== input) {
        const v = drifted ? drifted() : get();
        input.value = clamp(v, min, max);
      }
      paint();
    });
  }
  const dialPainters = [];
  const f1 = (v) => (+v).toFixed(1);
  const f2 = (v) => (+v).toFixed(2);

  dial('l2-dials-voxel', { label: 'ORBIT SPEED', min: 0.2, max: 2, step: 0.05, get: () => params.orbitSpeed, set: (v) => (params.orbitSpeed = v), fmt: (v) => f2(v) + '×' });
  dial('l2-dials-voxel', { label: 'ORBIT RADIUS', min: 0.6, max: 1.6, step: 0.05, get: () => params.orbitRadius, set: (v) => (params.orbitRadius = v), fmt: (v) => f2(v) + '×', drifted: () => params.orbitRadius * drift.r });
  dial('l2-dials-voxel', { label: 'CAMERA HEIGHT', min: 0.6, max: 1.6, step: 0.05, get: () => params.camHeight, set: (v) => (params.camHeight = v), fmt: (v) => f2(v) + '×', drifted: () => params.camHeight * drift.h });
  dial('l2-dials-voxel', { label: 'FOV', min: 40, max: 90, step: 1, get: () => params.fov, set: (v) => (params.fov = v), fmt: (v) => Math.round(v) + '°' });

  dial('l2-dials-text', { label: 'RESOLUTION', min: 20, max: 240, step: 2, get: () => params.cols, set: (v) => (params.cols = v), fmt: (v) => Math.round(v) + (v < 60 ? ' chunky' : v > 160 ? ' fine' : '') });
  dial('l2-dials-text', { label: 'CONTRAST', min: 0.5, max: 2.5, step: 0.05, get: () => params.contrast, set: (v) => (params.contrast = v), fmt: (v) => f2(v), drifted: () => params.contrast * drift.c });
  dial('l2-dials-text', { label: 'BRIGHTNESS', min: -0.5, max: 0.5, step: 0.05, get: () => params.brightness, set: (v) => (params.brightness = v), fmt: (v) => (v >= 0 ? '+' : '') + f2(v) });
  dial('l2-dials-text', { label: 'GAMMA', min: 0.5, max: 2.0, step: 0.05, get: () => params.gamma, set: (v) => (params.gamma = v), fmt: (v) => f2(v) });
  dial('l2-dials-text', { label: 'ASCII FPS', min: 4, max: 24, step: 1, get: () => params.asciiFps, set: (v) => (params.asciiFps = v), fmt: (v) => Math.round(v) + ' fps' });

  function toggleRow(containerId, label, get, set) {
    const box = document.getElementById(containerId);
    if (!box) return;
    const lab = document.createElement('label');
    lab.className = 'l2-check';
    lab.innerHTML = '<span>' + label + '</span>';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = get();
    input.addEventListener('change', () => set(input.checked));
    lab.appendChild(input);
    box.appendChild(lab);
  }
  toggleRow('l2-dials-text', 'INVERT', () => params.invert, (v) => (params.invert = v));
  toggleRow('l2-dials-text', 'COLOR', () => params.color, (v) => (params.color = v));

  const charsetSel = document.getElementById('l2-charset');
  if (charsetSel) {
    charsetSel.value = params.charset;
    charsetSel.addEventListener('change', () => { params.charset = charsetSel.value; });
  }
  const driftBox = document.getElementById('l2-drift');
  if (driftBox) {
    driftBox.checked = driftOn;
    driftBox.addEventListener('change', () => { driftOn = driftBox.checked; });
  }

  // Telemetry readout at ~4Hz; dials mirror drift in the same tick.
  setInterval(() => {
    tickDrift();
    for (const p of dialPainters) { try { p(); } catch { /* garnish */ } }
    const el = document.getElementById('l2-telemetry');
    if (!el) return;
    const t = telemetry;
    el.innerHTML =
      '<div><span>MODE</span><b>' + t.mode.toUpperCase() + '</b></div>' +
      '<div><span>BEAT</span><b>' + (t.beatTitle || '—') + '</b></div>' +
      '<div><span>BEAT T</span><b>' + f1(t.beatT) + 's</b></div>' +
      '<div><span>AZIMUTH</span><b>' + f1(t.azDeg) + '°</b></div>' +
      '<div><span>RADIUS</span><b>' + f1(t.radius) + '</b></div>' +
      '<div><span>HEIGHT</span><b>' + f1(t.height) + '</b></div>' +
      '<div><span>TIME OF DAY</span><b>' + f2(t.tod) + '</b></div>' +
      '<div><span>ASCII</span><b>' + f1(t.asciiFps) + ' fps</b></div>';
  }, 250);

  // ── go ────────────────────────────────────────────────────────────────
  renderMoments();
  asciiCtl = startAscii(canvas, document.getElementById('l2-ascii'), params, drift);

  // The renderer sized itself to the window at boot; the pane is smaller.
  // Nudge it onto the pane once layout settles.
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  setTimeout(() => window.dispatchEvent(new Event('resize')), 800);

  // Lift the title veil — the film is on.
  setTimeout(() => document.getElementById('l2-veil')?.classList.add('gone'), 2500);

  // Expose for debugging / the supervised-learning loop to come.
  window.__cinema = {
    game, cinema, skip, takeCamera, resumeFilm, markMoment,
    params, drift, telemetry,
    moments: loadMoments,
    stop: () => { stopped = true; },
  };

  playNext();
}
