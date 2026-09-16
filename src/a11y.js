/**
 * a11y.js — small, additive accessibility helpers loaded once at startup.
 *
 * Nothing here changes layout, removes behaviour, or requires index.html
 * edits: `injectA11yStyles()` appends one <style> tag with a
 * prefers-reduced-motion override and a visible focus ring, and the rest are
 * tiny DOM helpers used by UI.js to make click-only elements keyboard
 * operable, to trap focus inside open panels, and to mark transient HUD text
 * as a live region for screen readers. Every call is opt-in and idempotent —
 * safe to call again on re-render.
 */

const STYLE_ID = 'sc-a11y-styles';

/** Injects the shared a11y stylesheet once. Safe to call from anywhere. */
export function injectA11yStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* Visible keyboard focus for anything a11y.js makes interactive, plus
       the HUD's existing native buttons — outline only, no layout shift. */
    [data-a11y-btn]:focus-visible,
    .tab-btn:focus-visible,
    .cx-filter-btn:focus-visible,
    button:focus-visible {
      outline: 2px solid #f0b429;
      outline-offset: 2px;
    }

    /* Visually-hidden helper text for screen readers only — reserved for
       future icon-only labels; adds nothing to the visual layout. */
    .sc-sr-only {
      position: absolute !important;
      width: 1px; height: 1px;
      padding: 0; margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /* Neutralize non-essential motion for players who asked their OS for
       reduced motion — durations collapse to near-zero instead of being
       removed outright, so state (e.g. .show classes) still lands correctly
       on the next frame instead of relying on a transitionend that never
       fires. */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Make a click-only element keyboard-operable: adds role="button" and
 * tabindex="0" (unless already set), then wires Enter/Space to fire the
 * same handler as a click. `handler` receives the triggering event.
 */
export function makeKeyboardActivatable(el, handler) {
  if (!el || typeof handler !== 'function') return;
  if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
  if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
  el.setAttribute('data-a11y-btn', '');
  el.addEventListener('click', handler);
  el.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'Space' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler(e);
    }
  });
}

/**
 * Trap Tab / Shift+Tab focus inside `container` while it is open. Returns a
 * cleanup function — call it when the panel closes. No-ops harmlessly if the
 * container has no focusable children yet.
 */
export function trapFocus(container) {
  if (!container) return () => {};
  const SELECTOR = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
  const onKeydown = (e) => {
    if (e.code !== 'Tab') return;
    const focusable = [...container.querySelectorAll(SELECTOR)]
      .filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!focusable.length) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  container.addEventListener('keydown', onKeydown);
  return () => container.removeEventListener('keydown', onKeydown);
}

/** Marks `el` as a live region so screen readers announce text changes. */
export function markLiveRegion(el, { assertive = false } = {}) {
  if (!el) return;
  if (!el.hasAttribute('aria-live')) el.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
  if (!el.hasAttribute('aria-atomic')) el.setAttribute('aria-atomic', 'true');
}
