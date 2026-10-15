/**
 * ───────────────────────────────────────────────────────────────────────────
 *  LEVEL 3 — POCKET CINEMA DIRECTOR
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The Story Cinema's pocket edition. The film runs itself — six beats,
 * scored once, projected forever. On a phone there are no dials, only
 * looks: one-tap preset chips (and a restless director's drift that picks
 * a new one every ~14 seconds) steer the Projectionist's ASCII mirror.
 *
 *   tabs          VOXEL | TEXT — one full-width pane at a time
 *   bottom sheet  look chips + 3 dials + drift toggle + telemetry + moments
 *   takeover      grab the canvas → the camera is yours; RESUME hands it back
 *
 * Same film, same mysteries, smaller screen. The son's lines stay verbatim.
 * Snug, not strained.
 */

import * as THREE from 'three';
import './cutscenes.js';
import { startAscii } from './ascii.js';
import { cutsceneById } from '../cinema/Timeline.js';

// ── the film ────────────────────────────────────────────────────────────────
const PLAYLIST = [
  'l2-dawn-arrival',
  'l2-yard-awakens',
  'l2-workbench',
  'l2-midnight',
  'l2-lap1',
  'l2-yards-name',
];
const INTERLUDE_MS = 600;
const MOMENT_KEY = 'l2-moments';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches;

// ── looks ───────────────────────────────────────────────────────────────────
// Stepped fields (ramp / colorMode / invert / fg / bg) cut instantly;
// numeric fields ease toward their targets 5% per frame — the chiaroscuro
// director pattern: cur chases tgt, so every change feels like a dissolve.
const LOOKS = [
  { id: 'amber', name: 'Amber Terminal', ramp: 'fine', colorMode: 'phosphor',
    hue: 36, sat: 85, contrast: 1.5, brightness: 0, gamma: 0.9, invert: false,
    fg: '#ffb84d', bg: '#140a00' },
  { id: 'matrix', name: 'Green Matrix', ramp: 'classic', colorMode: 'phosphor',
    hue: 120, sat: 85, contrast: 1.6, brightness: 0.05, gamma: 0.9, invert: false,
    fg: '#33ff66', bg: '#000f00' },
  { id: 'blueprint', name: 'Blueprint', ramp: 'minimal', colorMode: 'duotone',
    shadow: [6, 42, 102], high: [207, 230, 255],
    contrast: 1.6, brightness: 0, gamma: 0.85, invert: false,
    fg: '#cfe6ff', bg: '#031233' },
  { id: 'ink', name: 'Ink & Paper', ramp: 'fine', colorMode: 'mono',
    contrast: 1.4, brightness: 0.08, gamma: 1.1, invert: true,
    fg: '#2a2418', bg: '#f2efe6' },
  { id: 'ghost', name: 'Ghost', ramp: 'stars', colorMode: 'phosphor',
    hue: 190, sat: 30, contrast: 1.1, brightness: 0, gamma: 1.35, invert: true,
    fg: '#9fd8e8', bg: '#0b0d12' },
  { id: 'neon', name: 'Neon Noir', ramp: 'blocks', colorMode: 'duotone',
    shadow: [42, 0, 79], high: [0, 246, 255],
    contrast: 1.7, brightness: -0.05, gamma: 0.85, invert: false,
    fg: '#00f6ff', bg: '#05000c' },
];
const ADJECTIVES = ['Slow', 'Soft', 'Restless', 'Bright', 'Hollow', 'Wide', 'Quiet', 'Feral', 'Lucid', 'Low'];
const LOOK_MS = 14000;
const LERP_KEYS = ['contrast', 'brightness', 'gamma', 'hue', 'sat'];

// The live params object the ASCII sampler reads every frame.
const params = {
  cols: COARSE ? 72 : 110,
  asciiFps: COARSE ? 8 : 12,
  contrast: 1.5, brightness: 0, gamma: 0.9,
  hue: 36, sat: 85,
  shadow: [10, 6, 0], high: [255, 184, 77],
  ramp: 'fine', colorMode: 'phosphor', invert: false,
  fg: '#ffb84d',
  autoTune: true, // the Projectionist finds the best image on its own
};
// …and what it's drifting toward.
const tgt = {
  contrast: 1.5, brightness: 0, gamma: 0.9,
  hue: 36, sat: 85,
  shadow: [10, 6, 0], high: [255, 184, 77],
};
let lookName = 'Amber Terminal';
let lookId = 'amber';
let driftOn = true;
let lastLookAt = 0;

function applyLook(look, name) {
  params.ramp = look.ramp;
  params.colorMode = look.colorMode;
  params.invert = !!look.invert;
  params.fg = look.fg || null;
  for (const k of LERP_KEYS) {
    if (look[k] !== undefined) tgt[k] = look[k];
  }
  if (look.shadow) tgt.shadow = [...look.shadow];
  if (look.high) tgt.high = [...look.high];
  lookName = name || look.name;
  lookId = look.id;
  const pane = document.getElementById('l3-viewtext');
  if (pane && look.bg) pane.style.background = look.bg;
  paintChips();
}

function newLook(specific) {
  const look = specific || LOOKS[(Math.random() * LOOKS.length) | 0];
  const name = specific
    ? look.name
    : (Math.random() < 0.45
        ? ADJECTIVES[(Math.random() * ADJECTIVES.length) | 0] + ' ' + look.name
        : look.name);
  applyLook(look, name);
  lastLookAt = performance.now();
}

function tickLooks() {
  for (const k of LERP_KEYS) params[k] += (tgt[k] - params[k]) * 0.05;
  for (let i = 0; i < 3; i++) {
    params.shadow[i] += (tgt.shadow[i] - params.shadow[i]) * 0.05;
    params.high[i] += (tgt.high[i] - params.high[i]) * 0.05;
  }
  if (driftOn && performance.now() - lastLookAt > LOOK_MS) newLook();
}

export function startMobileCinema(game) {
  try { document.body.classList.add('cinema'); } catch { /* never kills the film */ }
  const cinema = game.cinema;
  if (!cinema) return;

  // ── take the wheel ──────────────────────────────────────────────────────
  try {
    const cur = cinema.current();
    if (cur && typeof cinema.stop === 'function') cinema.stop();
  } catch { /* never kills the film */ }
  for (const sel of ['#opening-cinematic', '#quest-overlay', '#companion-panel', '#onboarding-overlay']) {
    try { document.querySelector(sel)?.remove(); } catch { /* never kills the film */ }
  }

  // Phones get 1x pixels — the film looks identical, the GPU barely notices.
  try {
    if (COARSE && game.renderer?.renderer) {
      game.renderer.renderer.setPixelRatio(1);
      window.dispatchEvent(new Event('resize'));
    }
  } catch { /* never kills the film */ }

  // ── wake the audio on the first human gesture ───────────────────────────
  const wake = () => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC && !window.__yardAudio) {
        window.__yardAudio = new AC();
        if (window.__yardAudio.state === 'suspended') window.__yardAudio.resume();
      }
    } catch { /* never kills the film */ }
  };
  window.addEventListener('pointerdown', wake, { once: true });
  window.addEventListener('keydown', wake, { once: true });

  // ── letterbox docking: bars + subtitle live inside the voxel pane ───────
  const view3d = document.getElementById('l2-view3d');
  const subEl = () => document.getElementById('cs-subtitle');
  const dockLetterbox = () => {
    try {
      const top = document.getElementById('cs-bar-top');
      const bot = document.getElementById('cs-bar-bot');
      const sub = subEl();
      for (const el of [top, bot, sub]) {
        if (el && el.parentElement !== view3d) {
          el.style.position = 'absolute';
          view3d.appendChild(el);
        }
      }
    } catch { /* never kills the film */ }
  };

  // ── the playlist ────────────────────────────────────────────────────────
  let playIndex = 0;
  let chainToken = 0;
  let curBeatId = '';
  let beatT = 0;

  const playNext = () => {
    const my = ++chainToken;
    const id = PLAYLIST[playIndex % PLAYLIST.length];
    playIndex++;
    const def = cutsceneById(id);
    if (!def) { setTimeout(() => { if (my === chainToken) playNext(); }, 500); return; }
    try {
      cinema.play(def, {
        subtitleEl: subEl(),
        onDone: () => {
          if (my !== chainToken) return;
          dockLetterbox();
          setTimeout(() => { if (my === chainToken) playNext(); }, INTERLUDE_MS);
        },
      });
    } catch { /* never kills the film */
      setTimeout(() => { if (my === chainToken) playNext(); }, 500);
      return;
    }
    curBeatId = id;
    beatT = performance.now();
    dockLetterbox();
  };

  // ── camera takeover ─────────────────────────────────────────────────────
  let held = false;
  let downAt = null;
  let pinch0 = 0;
  let orbRadius = 26, orbTheta = 0, orbPhi = 0.32;
  const takeBtn = document.getElementById('l2-take');
  const resumeBtn = document.getElementById('l2-resume');
  const badge = document.getElementById('l2-held-badge');
  const canvas = document.getElementById('game-canvas');

  const setHeld = (on) => {
    held = on;
    takeBtn.hidden = on;
    resumeBtn.hidden = !on;
    badge.hidden = !on;
    try { cinema.setPaused(on); } catch { /* never kills the film */ }
  };
  const takeCamera = () => {
    chainToken++; // the beat ends here; no auto-advance while held
    try { cinema.stop(); } catch { /* never kills the film */ }
    try { cinema.setPaused(false); } catch { /* never kills the film */ }
    const cam = cinema.camera;
    if (cam) {
      const dx = cam.position.x, dy = cam.position.y, dz = cam.position.z;
      orbRadius = clamp(Math.hypot(dx, dy, dz), 8, 80);
      orbTheta = Math.atan2(dx, dz);
      orbPhi = clamp(Math.asin(clamp(dy / Math.max(1, orbRadius), -1, 1)), 0.08, 1.2);
    }
    setHeld(true);
  };
  const resumeFilm = () => {
    setHeld(false);
    playNext(); // replays the current beat from its first keyframe
  };

  try {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* never kills the film */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && e.buttons === 0) return;
      if (!downAt) return;
      const dx = e.clientX - downAt.x, dy = e.clientY - downAt.y;
      if (Math.hypot(dx, dy) > 6 && !held) { takeCamera(); return; }
      if (held) {
        orbTheta -= dx * 0.005;
        orbPhi = clamp(orbPhi + dy * 0.003, 0.08, 1.2);
        downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      }
    });
    const endPointer = () => { downAt = null; pinch0 = 0; };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', (e) => {
      if (!held) takeCamera();
      else { orbRadius = clamp(orbRadius * (1 + Math.sign(e.deltaY) * 0.1), 8, 80); }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        if (!held) { takeCamera(); pinch0 = d; return; }
        if (pinch0 > 0) orbRadius = clamp(orbRadius * (pinch0 / Math.max(1, d)), 8, 80);
        pinch0 = d;
        e.preventDefault();
      }
    }, { passive: false });
  } catch { /* never kills the film */ }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && held) resumeFilm();
    else if ((e.key === ' ' || e.key === 'Enter') && !held && document.activeElement === document.body) takeCamera();
    else if (held && 'wasd'.includes(e.key.toLowerCase())) takeCamera();
  });

  // ── tabs: one pane at a time ────────────────────────────────────────────
  const tabVoxel = document.getElementById('l3-tab-voxel');
  const tabText = document.getElementById('l3-tab-text');
  const viewText = document.getElementById('l3-viewtext');
  let asciiCtl = null;

  const showPane = (which) => {
    const text = which === 'text';
    tabVoxel.classList.toggle('on', !text);
    tabText.classList.toggle('on', text);
    view3d.hidden = text;
    viewText.hidden = !text;
    try {
      if (text) asciiCtl?.resume();
      else asciiCtl?.pause();
    } catch { /* never kills the film */ }
    if (!text) {
      try { window.dispatchEvent(new Event('resize')); } catch { /* never kills the film */ }
    }
  };
  tabVoxel.addEventListener('click', () => showPane('voxel'));
  tabText.addEventListener('click', () => showPane('text'));
  // Tapping the TEXT pane cuts straight to the next look.
  viewText.addEventListener('click', () => newLook());

  // ── the Projectionist's mirror ──────────────────────────────────────────
  const pre = document.getElementById('l2-ascii');
  try {
    if (canvas && pre) asciiCtl = startAscii(canvas, pre, params);
  } catch { /* never kills the film */ }
  showPane('voxel');

  // ── bottom sheet ────────────────────────────────────────────────────────
  const sheet = document.getElementById('l3-sheet');
  document.getElementById('l3-handle').addEventListener('click', () => {
    sheet.classList.toggle('open');
  });

  // look chips
  const chipsEl = document.getElementById('l3-chips');
  LOOKS.forEach((look) => {
    const b = document.createElement('button');
    b.textContent = look.name;
    b.dataset.look = look.id;
    b.addEventListener('click', () => {
      newLook(look);
      lastLookAt = performance.now(); // tapping a chip resets the drift timer
    });
    chipsEl.appendChild(b);
  });

  // three dials: resolution, contrast, gamma, invert
  const dialsEl = document.getElementById('l3-dials');
  const dialRow = (label, input) => {
    const row = document.createElement('div');
    row.className = 'l3-dial';
    const lab = document.createElement('span');
    lab.textContent = label;
    const val = document.createElement('b');
    row.appendChild(lab); row.appendChild(input); row.appendChild(val);
    dialsEl.appendChild(row);
    return val;
  };
  {
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = '20'; inp.max = '240'; inp.step = '2';
    inp.value = String(params.cols);
    const val = dialRow('RESOLUTION', inp);
    const fmtRes = (v) => String(v) + (v < 60 ? ' chunky' : v > 160 ? ' fine' : '');
    val.textContent = fmtRes(params.cols);
    inp.addEventListener('input', () => {
      params.cols = Math.round(+inp.value);
      val.textContent = fmtRes(params.cols);
    });
  }
  {
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = '0.5'; inp.max = '2.5'; inp.step = '0.05';
    inp.value = params.contrast.toFixed(2);
    const val = dialRow('CONTRAST', inp);
    val.textContent = params.contrast.toFixed(2);
    inp.addEventListener('input', () => {
      params.contrast = tgt.contrast = +inp.value;
      val.textContent = params.contrast.toFixed(2);
    });
  }
  {
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = '0.5'; inp.max = '2.0'; inp.step = '0.05';
    inp.value = params.gamma.toFixed(2);
    const val = dialRow('GAMMA', inp);
    val.textContent = params.gamma.toFixed(2);
    inp.addEventListener('input', () => {
      params.gamma = tgt.gamma = +inp.value;
      val.textContent = params.gamma.toFixed(2);
    });
  }
  {
    const lab = document.createElement('label');
    lab.className = 'l3-check';
    const span = document.createElement('span');
    span.textContent = 'INVERT';
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = params.invert;
    inp.addEventListener('change', () => { params.invert = inp.checked; });
    lab.appendChild(span); lab.appendChild(inp);
    dialsEl.appendChild(lab);
  }

  // drift toggle
  const driftBox = document.getElementById('l3-drift');
  driftBox.checked = driftOn;
  driftBox.addEventListener('change', () => {
    driftOn = driftBox.checked;
    if (driftOn) lastLookAt = performance.now();
  });

  // ── moments ─────────────────────────────────────────────────────────────
  const loadMoments = () => {
    try { return JSON.parse(localStorage.getItem(MOMENT_KEY) || '[]'); }
    catch { return []; }
  };
  const saveMoments = (m) => {
    try { localStorage.setItem(MOMENT_KEY, JSON.stringify(m.slice(0, 40))); }
    catch { /* never kills the film */ }
  };
  const renderMoments = () => {
    const box = document.getElementById('l3-moments');
    if (!box) return;
    const ms = loadMoments();
    box.innerHTML = ms.length
      ? ms.map((m) => '<div class="l3-moment">♥ ' + (m.beat || 'the film') + ' · ' + (m.at || '') + '</div>').join('')
      : '<div class="l3-moment dim">No moments yet — tap ♥ when the film lands one.</div>';
  };
  const markMoment = () => {
    const ms = loadMoments();
    const now = new Date();
    const at = now.toTimeString().slice(0, 5);
    ms.unshift({ beat: curBeatId || 'the film', at });
    saveMoments(ms);
    renderMoments();
  };
  document.getElementById('l2-mark').addEventListener('click', markMoment);
  renderMoments();

  // ── buttons ─────────────────────────────────────────────────────────────
  takeBtn.addEventListener('click', takeCamera);
  resumeBtn.addEventListener('click', resumeFilm);
  document.getElementById('l2-skip').addEventListener('click', () => {
    if (held) setHeld(false);
    chainToken++;
    playNext();
  });

  // ── telemetry line, 4 Hz ────────────────────────────────────────────────
  const beatEl = document.getElementById('l2-beat');
  const teleEl = document.getElementById('l3-teleline');
  setInterval(() => {
    try {
      let beat = '', az = '—';
      try {
        const c = cinema.current();
        beat = c ? (c.title || c.id || '') : '';
        if (beatT) beat += ' · ' + Math.round((performance.now() - beatT) / 1000) + 's';
        const cam = cinema.camera;
        if (cam) az = Math.round(THREE.MathUtils.radToDeg(Math.atan2(cam.position.x, cam.position.z)));
      } catch { /* never kills the film */ }
      if (beatEl) beatEl.textContent = (curBeatId || '···').toUpperCase().replace(/^L2-/, '');
      if (teleEl) teleEl.textContent = (beat || '—') + '  ·  ' + lookName + '  ·  ' + az + '°';
    } catch { /* never kills the film */ }
  }, 250);

  // ── the director's drift: a new look every ~14 seconds ──────────────────
  newLook(LOOKS[0]); // open on Amber Terminal
  (function lookLoop() {
    try { tickLooks(); } catch { /* never kills the film */ }
    requestAnimationFrame(lookLoop);
  })();

  // ── lift the veil ───────────────────────────────────────────────────────
  setTimeout(() => {
    try {
      const veil = document.getElementById('l2-veil');
      if (veil) {
        veil.classList.add('gone');
        setTimeout(() => veil.remove(), 1600);
      }
    } catch { /* never kills the film */ }
  }, 2500);

  playNext();

  // ── for the curious ─────────────────────────────────────────────────────
  window.__cinema = {
    params, looks: LOOKS, newLook,
    get lookName() { return lookName; },
    get currentBeat() { return curBeatId; },
    get held() { return held; },
    takeCamera, resumeFilm, markMoment,
    asciiFps: () => (asciiCtl ? asciiCtl.fps : 0),
  };
}

function paintChips() {
  try {
    document.querySelectorAll('#l3-chips button').forEach((b) => {
      b.classList.toggle('on', b.dataset.look === lookId);
    });
  } catch { /* never kills the film */ }
}
