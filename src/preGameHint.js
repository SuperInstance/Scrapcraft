/**
 * preGameHint — the hotkey onboarding toast.
 *
 * The boot HUD advertises E / T / F before CLOCK IN, but the game hasn't
 * booted yet — those keys are dead and kids (reasonably) think the game is
 * broken. This module decides, pure and testable, whether pressing one of
 * the advertised keys pre-game should surface the "press CLOCK IN" toast.
 * Once per browser session (sessionStorage), so it informs, never nags.
 */

export const PRE_GAME_KEYS = ['KeyE', 'KeyT', 'KeyF'];
export const PRE_GAME_HINT_MSG =
  '⏰ Press <b>CLOCK IN</b> to start — then <b>E</b>/<b>T</b>/<b>F</b> come alive.';
const STORAGE_KEY = 'scrapcraft_pregame_hint_shown';

/**
 * @param {{code: string, booted: boolean, getSession?: () => string|null, setSession?: (v: string) => void}} ctx
 * @returns {string|null} the toast message, or null when nothing should show
 */
export function maybePreGameHint(ctx) {
  const { code, booted } = ctx;
  if (booted) return null;                       // game live → keys work, no toast
  if (!PRE_GAME_KEYS.includes(code)) return null; // only the advertised keys
  const getSession = ctx.getSession ?? (() => null);
  const setSession = ctx.setSession ?? (() => {});
  if (getSession() === '1') return null;         // once per session
  setSession('1');
  return PRE_GAME_HINT_MSG;
}
