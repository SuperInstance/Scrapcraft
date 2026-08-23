/**
 * ───────────────────────────────────────────────────────────────────────────
 *  TIMELINE — pure, headless cutscene timeline evaluation
 * ───────────────────────────────────────────────────────────────────────────
 *
 * A cutscene is a JSON-ish declarative timeline: camera keyframes (with easing),
 * letterbox ramp-in/out, and subtitle cues. `evalTimeline` is pure math —
 * no DOM, no THREE — so it's headless-testable and can be stepped through
 * in a test harness without a browser.
 *
 * Pose interpolation: between adjacent keyframes with configurable easing
 * (in/out/inout/linear). Letterbox and subtitles are time-windowed: a cue is
 * active if the current time falls within its [t, end) window. The registry
 * (`cutsceneById`) is populated from the data module.
 */

// Easing functions (0-1 parameter, return 0-1)
function easeIn(t) {
  return t * t;
}

function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}

function applyEase(t, easeType = 'linear') {
  if (easeType === 'in') return easeIn(t);
  if (easeType === 'out') return easeOut(t);
  if (easeType === 'inout') return easeInOut(t);
  return t; // linear
}

// Lerp helper for numeric values and objects with numeric fields
function lerp(a, b, t) {
  if (typeof a === 'number') {
    return a + (b - a) * t;
  }
  if (a && b && typeof a === 'object') {
    const result = {};
    for (const key in a) {
      result[key] = lerp(a[key], b[key], t);
    }
    return result;
  }
  return b; // fallback for non-numeric
}

/**
 * Evaluate a cutscene timeline at time t (seconds).
 * @param {object} def - cutscene definition (id, duration, letterbox, camera, subtitles)
 * @param {number} t - current time (seconds)
 * @returns {object} { pose, letterbox, subtitle, done }
 */
export function evalTimeline(def, t) {
  const result = { pose: null, letterbox: 0, subtitle: null, done: false };

  if (!def || typeof t !== 'number') return result;

  const { duration = 0, letterbox: lbCfg = {}, camera = {}, subtitles = [] } = def;

  // --- POSE EVALUATION ---
  const keyframes = camera.keyframes ?? [];
  if (keyframes.length > 0) {
    if (keyframes.length === 1) {
      // Single keyframe: static pose for entire timeline
      const kf = keyframes[0];
      result.pose = {
        x: kf.x ?? 0,
        y: kf.y ?? 0,
        z: kf.z ?? 0,
        look: {
          x: kf.look?.x ?? 0,
          y: kf.look?.y ?? 0,
          z: kf.look?.z ?? 0,
        },
      };
    } else if (t < keyframes[0].t) {
      // Before first keyframe: first pose
      const kf = keyframes[0];
      result.pose = {
        x: kf.x ?? 0,
        y: kf.y ?? 0,
        z: kf.z ?? 0,
        look: {
          x: kf.look?.x ?? 0,
          y: kf.look?.y ?? 0,
          z: kf.look?.z ?? 0,
        },
      };
    } else if (t >= keyframes[keyframes.length - 1].t) {
      // After last keyframe: last pose
      const kf = keyframes[keyframes.length - 1];
      result.pose = {
        x: kf.x ?? 0,
        y: kf.y ?? 0,
        z: kf.z ?? 0,
        look: {
          x: kf.look?.x ?? 0,
          y: kf.look?.y ?? 0,
          z: kf.look?.z ?? 0,
        },
      };
    } else {
      // Interpolate between adjacent keyframes
      let i = 0;
      while (i < keyframes.length - 1 && keyframes[i + 1].t <= t) i++;

      const kf0 = keyframes[i];
      const kf1 = keyframes[i + 1];
      const dt = kf1.t - kf0.t;
      const localT = dt > 0 ? (t - kf0.t) / dt : 0;
      const eased = applyEase(localT, kf0.ease ?? 'linear');

      result.pose = {
        x: lerp(kf0.x ?? 0, kf1.x ?? 0, eased),
        y: lerp(kf0.y ?? 0, kf1.y ?? 0, eased),
        z: lerp(kf0.z ?? 0, kf1.z ?? 0, eased),
        look: {
          x: lerp(kf0.look?.x ?? 0, kf1.look?.x ?? 0, eased),
          y: lerp(kf0.look?.y ?? 0, kf1.look?.y ?? 0, eased),
          z: lerp(kf0.look?.z ?? 0, kf1.look?.z ?? 0, eased),
        },
      };
    }
  }

  // --- LETTERBOX EVALUATION ---
  const { in: inDur = 0, out: outDur = 0 } = lbCfg;
  if (t < inDur) {
    // Ramp in: 0 → 1
    result.letterbox = t / inDur;
  } else if (t >= duration - outDur) {
    // Ramp out: 1 → 0
    result.letterbox = Math.max(0, (duration - t) / outDur);
  } else {
    // Held at 1
    result.letterbox = 1;
  }

  // --- SUBTITLE EVALUATION ---
  for (let i = subtitles.length - 1; i >= 0; i--) {
    const cue = subtitles[i];
    if (cue.t <= t && t < cue.end) {
      result.subtitle = { speaker: cue.speaker ?? '', text: cue.text ?? '' };
      break; // Last cue whose window contains t
    }
  }

  // --- DONE ---
  result.done = t >= duration;

  return result;
}

/**
 * Validate a cutscene definition.
 * @param {object} def - cutscene definition
 * @returns {object} { ok: boolean, errors: string[] }
 */
export function validateTimeline(def) {
  const errors = [];

  if (!def || typeof def !== 'object') {
    errors.push('def must be an object');
    return { ok: false, errors };
  }

  const { id, duration, letterbox = {}, camera = {}, subtitles = [] } = def;

  if (!id || typeof id !== 'string') {
    errors.push('id must be a non-empty string');
  }

  if (typeof duration !== 'number' || duration <= 0) {
    errors.push('duration must be a positive number');
  }

  const keyframes = camera.keyframes ?? [];
  if (Array.isArray(keyframes)) {
    // Check sorted by t
    for (let i = 1; i < keyframes.length; i++) {
      if (keyframes[i].t < keyframes[i - 1].t) {
        errors.push(`keyframes not sorted by t (kf[${i}].t < kf[${i - 1}].t)`);
        break;
      }
    }
  } else if (keyframes) {
    errors.push('camera.keyframes must be an array or undefined');
  }

  if (Array.isArray(subtitles)) {
    const onScreen = [];
    for (let i = 0; i < subtitles.length; i++) {
      const cue = subtitles[i];
      if (typeof cue.t !== 'number' || typeof cue.end !== 'number') {
        errors.push(`cue[${i}] must have numeric t and end`);
        continue;
      }
      if (cue.end <= cue.t) {
        errors.push(`cue[${i}] end (${cue.end}) must be > t (${cue.t})`);
      }
      // Detect overlaps for warnings (not errors)
      for (let j = 0; j < onScreen.length; j++) {
        const other = onScreen[j];
        const overlap = !(cue.end <= other.t || cue.t >= other.end);
        if (overlap) {
          // Overlaps allowed but noted — could warn if severity warranted
        }
      }
      onScreen.push(cue);
    }
  } else if (subtitles) {
    errors.push('subtitles must be an array or undefined');
  }

  return { ok: errors.length === 0, errors };
}

// Global registry
let CUTSCENES_REGISTRY = [];

/**
 * Register cutscenes into the global registry (called from data module).
 * @param {array} cutscenes - array of cutscene definitions
 */
export function registerCutscenes(cutscenes) {
  CUTSCENES_REGISTRY = cutscenes || [];
}

/**
 * Retrieve a cutscene by id from the registry.
 * @param {string} id
 * @returns {object} cutscene definition or null
 */
export function cutsceneById(id) {
  if (!id) return null;
  return CUTSCENES_REGISTRY.find(cs => cs.id === id) ?? null;
}

/**
 * Export the registry (read-only for tests).
 * @returns {array} the CUTSCENES registry
 */
export function getCutscenes() {
  return CUTSCENES_REGISTRY;
}
