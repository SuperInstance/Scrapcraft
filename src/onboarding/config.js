/**
 * Shared onboarding/advanced config persistence.
 *
 * The 2-step wizard no longer collects AI/Cloudflare config — that moved to
 * Settings → Advanced (post-spawn, optional). Both surfaces read/write the
 * same localStorage record so the Spark/Earl gateways keep working, and
 * `saveAdvancedConfig` bumps a version counter so cached provider lookups
 * know to re-read (entering a key later upgrades Spark live, no restart).
 */

export const CONFIG_KEY = 'scrapcraft_onboarding_config';

export function loadConfig() {
  try {
    return JSON.parse(
      (typeof localStorage !== 'undefined' ? localStorage : null)?.getItem(CONFIG_KEY) || '{}',
    );
  } catch {
    return {};
  }
}

/** Write a patch into the config record. @returns the merged config */
export function saveConfig(patch = {}) {
  const merged = { ...loadConfig(), ...patch, _rev: Date.now() };
  try {
    (typeof localStorage !== 'undefined' ? localStorage : null)
      ?.setItem(CONFIG_KEY, JSON.stringify(merged));
  } catch { /* corrupt-world tolerant */ }
  return merged;
}

/** True when an AI provider is meaningfully configured (live Spark). */
export function hasLiveAI(cfg = loadConfig()) {
  return Boolean(
    cfg.cfWorkerUrl || (cfg.apiKey && cfg.aiProvider && cfg.aiProvider !== 'offline'),
  );
}

/**
 * Called after the config changes: notifies listeners (the game wires this to
 * Spark.refreshProvider() + gateway refresh) so a key entered later upgrades
 * the yard's voices without a restart.
 */
export function announceConfigChange() {
  try {
    (typeof document !== 'undefined' ? document : null)
      ?.dispatchEvent?.(new CustomEvent('scrapcraft:config-changed'));
  } catch { /* never fatal */ }
}
