/**
 * ───────────────────────────────────────────────────────────────────────────
 *  ASCII SAMPLER — the Projectionist's live text mirror
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Reads the WebGL canvas every frame (throttled to params.fps) and renders
 * the same picture as text into a <pre>. The sampler never touches the
 * film: any failure is swallowed so the voxel view keeps playing.
 *
 * Requires the renderer to run with preserveDrawingBuffer (cinema mode).
 *
 * params is a LIVE object; the loop reads it every frame:
 *   cols       20–200
 *   ramp       ramp name (below) — falls back to legacy params.charset
 *   contrast   0.5–2.5     brightness -0.5–0.5     gamma 0.5–2 (exponent)
 *   invert     bool
 *   colorMode  'mono' | 'phosphor' | 'duotone' | 'source'
 *              (legacy: params.color === true  →  'source')
 *   hue/sat    phosphor hue 0–360 / saturation 0–100
 *   shadow/high [r,g,b]     duotone endpoints
 *   fg         mono-mode text color (CSS fallback otherwise)
 *   asciiFps / fps  4–24
 *
 * Ramps are the chiaroscuro vocabulary (Casey's ASCII doors).
 */

const RAMPS = {
  classic: ' .:-=+*#%@@',
  fine: ' .\'`^\\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  blocks: ' \u2591\u2592\u2593\u2588',
  minimal: ' .:*#',
  stars: '\u00b7\u2234\u2217\u2726\u2731\u2733\u274b\u2588',
  runes: '\u00b7\u16a0\u16a2\u16a6\u16a8\u16b1\u16b2\u16b7\u16b9\u16ba\u16be\u16c3\u2588',
  waves: '\u00b7\u2248\u224b\u2592\u2593\u2588',
  moons: '\u00b7\u263d\u263e\u25cf\u2588',
  crypt: ' \u2301\u2307\u237e\u2364\u2368\u2366\u2588',
  // Level 2 legacy aliases
  standard: ' .:-=+*#%@',
  micro: ' .\u00b7:;+x%#@',
};

// The classic 16 ANSI colors, as [r,g,b] — the 'source' color mode.
const ANSI16 = [
  [0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0],
  [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
  [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0],
  [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
];
const ANSI16_HEX = ANSI16.map(([r, g, b]) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''));

function nearestAnsi(r, g, b) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < 16; i++) {
    const c = ANSI16[i];
    const dr = r - c[0], dg = g - c[1], db = b - c[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = i; }
  }
  return ANSI16_HEX[best];
}

function hsl(h, s, l) {
  return 'hsl(' + h + ',' + s + '%,' + l + '%)';
}

export function startAscii(canvas, pre, params, drift) {
  const off = document.createElement('canvas');
  const octx = off.getContext('2d', { willReadFrequently: true });
  let running = true;
  let paused = false;
  let lastT = 0;
  let emaFps = 12;
  let lastFg = '';
  
  // ── auto-tuner: the Projectionist finds the best image ────────────────
  // Every ~2 seconds, measure the frame's brightness/contrast and nudge
  // gamma, contrast, and brightness toward the sweet spot. If the measured
  // FPS is below target, reduce columns (chunkier = faster); if above,
  // increase columns (finer = prettier). The dials move on their own.
  let tuneLast = 0;
  let tuneGamma = params.gamma ?? 1;
  let tuneContrast = params.contrast ?? 1;
  let tuneBright = params.brightness ?? 0;
  
  function autoTune(px, cols, rows) {
    if (!params.autoTune) return;
    const now = performance.now();
    if (now - tuneLast < 2000) return;
    tuneLast = now;
    
    // Measure brightness histogram
    let sum = 0, sumSq = 0, n = 0;
    for (let i = 0; i < px.length; i += 16) { // sample every 4th pixel
      const v = (0.299 * px[i] + 0.587 * px[i+1] + 0.114 * px[i+2]) / 255;
      sum += v; sumSq += v * v; n++;
    }
    if (!n) return;
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));
    
    // Too dark (mean < 0.35): lift gamma down (brighten midtones)
    // Too bright (mean > 0.65): push gamma up (darken midtones)
    if (mean < 0.32 && tuneGamma > 0.55) {
      tuneGamma = Math.max(0.5, tuneGamma - 0.08);
    } else if (mean > 0.68 && tuneGamma < 1.95) {
      tuneGamma = Math.min(2.0, tuneGamma + 0.08);
    } else {
      // Drift back toward 1.0 when balanced
      tuneGamma += (1 - tuneGamma) * 0.05;
    }
    
    // Low contrast (std < 0.18): boost contrast
    // High contrast (std > 0.35): ease off
    if (std < 0.16 && tuneContrast < 2.4) {
      tuneContrast = Math.min(2.5, tuneContrast + 0.1);
    } else if (std > 0.38 && tuneContrast > 0.6) {
      tuneContrast = Math.max(0.5, tuneContrast - 0.1);
    }
    
    // Apply (lerped by the caller via params)
    params.gamma = tuneGamma;
    params.contrast = tuneContrast;
    
    // FPS-driven resolution: chunkier if slow, finer if fast
    const targetFps = params.asciiFps || 12;
    if (emaFps < targetFps * 0.7 && params.cols > 24) {
      params.cols = Math.max(20, params.cols - 8);
    } else if (emaFps > targetFps * 1.1 && params.cols < 236) {
      params.cols = Math.min(240, params.cols + 4);
    }
  }

  const render = (now) => {
    if (!running) return;
    requestAnimationFrame(render);
    try {
      if (paused) { lastT = now; return; }
      const fps = Math.max(1, Math.min(30, params.asciiFps || params.fps || 12));
      if (now - lastT < 1000 / fps - 1) return;
      const dtMs = now - lastT;
      lastT = now;
      if (dtMs > 0) emaFps += (1000 / dtMs - emaFps) * 0.08;

      const w = canvas.clientWidth || canvas.width || 2;
      const h = canvas.clientHeight || canvas.height || 2;
      const cols = Math.max(20, Math.min(240, Math.round(params.cols) || 110));
      // Terminal chars are ~twice as tall as wide — halve the row count.
      const rows = Math.max(8, Math.round((cols * h) / Math.max(1, w) * 0.5));
      if (off.width !== cols || off.height !== rows) {
        off.width = cols;
        off.height = rows;
      }
      octx.drawImage(canvas, 0, 0, cols, rows);
      const px = octx.getImageData(0, 0, cols, rows).data;
      
      // Auto-tune: let the Projectionist find the best image.
      autoTune(px, cols, rows);

      const set = RAMPS[params.ramp] || RAMPS[params.charset] || RAMPS.classic;
      const n = set.length;
      const contrast = (params.contrast ?? 1) * (drift ? drift.c : 1);
      const bright = params.brightness ?? 0;
      const gamma = params.gamma ?? 1;
      const inv = !!params.invert;
      const mode = params.colorMode || (params.color ? 'source' : 'mono');
      const useSpans = mode !== 'mono';
      const hue = params.hue ?? 36;
      const sat = params.sat ?? 85;
      const sh = params.shadow || [8, 5, 0];
      const hi = params.high || [255, 200, 120];

      if (!useSpans && params.fg && params.fg !== lastFg) {
        pre.style.color = params.fg;
        lastFg = params.fg;
      }

      const lines = [];
      let row = '';
      for (let y = 0; y < rows; y++) {
        row = '';
        for (let x = 0; x < cols; x++) {
          const o = (y * cols + x) * 4;
          const r = px[o], g = px[o + 1], b = px[o + 2];
          let v = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          v = (v - 0.5) * contrast + 0.5 + bright;
          v = v < 0 ? 0 : v > 1 ? 1 : v;
          if (gamma !== 1) v = Math.pow(v, gamma);
          let idx = Math.min(n - 1, (v * n) | 0);
          if (inv) idx = n - 1 - idx;
          const ch = set[idx];
          if (!useSpans) { row += ch; continue; }
          let col;
          if (mode === 'phosphor') {
            col = hsl(hue, sat, 5 + v * 62);
          } else if (mode === 'duotone') {
            col = 'rgb(' +
              Math.round(sh[0] + (hi[0] - sh[0]) * v) + ',' +
              Math.round(sh[1] + (hi[1] - sh[1]) * v) + ',' +
              Math.round(sh[2] + (hi[2] - sh[2]) * v) + ')';
          } else {
            col = nearestAnsi(r, g, b);
          }
          row += '<span style="color:' + col + '">' + (ch === ' ' ? '&nbsp;' : ch) + '</span>';
        }
        lines.push(row);
      }
      if (useSpans) pre.innerHTML = lines.join('\n');
      else pre.textContent = lines.join('\n');
    } catch {
      /* the sampler never kills the film */
    }
  };
  requestAnimationFrame(render);

  return {
    stop() { running = false; },
    pause() { paused = true; },
    resume() { paused = false; lastT = 0; },
    get fps() { return emaFps; },
  };
}
