/**
 * renderMode — workshop/render hardening for memory-fragile environments.
 *
 * The yard's WebGL renderer is the heaviest thing this page builds. On weak
 * hardware (small RAM, high devicePixelRatio phones) a full-res framebuffer
 * plus shadow maps can push the tab over the cliff. This module decides —
 * pure, DOM-free, testable — whether the renderer should run in LITE mode:
 *   • `?lite=1`  → force low-res render (pixel ratio capped at 1, shadows off)
 *   • `?lite=0`  → force full render, ignore the device heuristic
 *   • neither    → auto: navigator.deviceMemory < 4 GB suggests lite
 *
 * Normal mode still caps the pixel ratio at 1.5 — a 3x-retina panel buys
 * nothing in a voxel yard and costs 4× the pixels.
 */

export const FULL_PIXEL_RATIO_CAP = 1.5;
export const LITE_PIXEL_RATIO    = 1.0;
export const LITE_MEMORY_GB      = 4;

/**
 * @param {{search?: string, deviceMemory?: number, devicePixelRatio?: number}} env
 * @returns {{lite: boolean, forced: boolean, auto: boolean, pixelRatioCap: number, reason: string}}
 */
export function resolveRenderMode(env = {}) {
  const search = env.search ?? '';
  const deviceMemory = env.deviceMemory;   // navigator.deviceMemory (GB), undefined if unavailable
  const dpr = env.devicePixelRatio ?? 1;

  const params = new URLSearchParams(search);
  const flag = params.get('lite');

  if (flag === '1' || flag === 'true') {
    return { lite: true,  forced: true,  auto: false, pixelRatioCap: LITE_PIXEL_RATIO,    reason: 'flag' };
  }
  if (flag === '0' || flag === 'false') {
    return { lite: false, forced: true,  auto: false, pixelRatioCap: FULL_PIXEL_RATIO_CAP, reason: 'flag' };
  }
  // Auto heuristic: deviceMemory is Chromium-only; when it's missing, trust the player's machine.
  if (typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory < LITE_MEMORY_GB) {
    return { lite: true,  forced: false, auto: true,  pixelRatioCap: LITE_PIXEL_RATIO,    reason: 'deviceMemory' };
  }
  return { lite: false, forced: false, auto: false, pixelRatioCap: FULL_PIXEL_RATIO_CAP, reason: 'default' };
}

/** Effective device pixel ratio under a mode — never below 1, never above the cap. */
export function effectivePixelRatio(mode, dpr) {
  return Math.max(1, Math.min(dpr ?? 1, mode.pixelRatioCap));
}
