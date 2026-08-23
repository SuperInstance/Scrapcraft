/**
 * ───────────────────────────────────────────────────────────────────────────
 *  MISSION CARD PRESENTER — thin DOM adapter mapping engine state to
 *  existing Game.js mission-card elements. Pure-ish: no side effects beyond
 *  innerHTML updates. Fail-soft: all elements optional; missing → no-op.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { TUTORIAL_MISSIONS } from './TutorialMissions.js';

/**
 * Render engine state onto existing mission-card DOM elements (title, desc, dots).
 * All elements are optional; missing elements are safely ignored.
 * No new DOM elements created; works entirely with injected refs.
 *
 * @param {TutorialEngine} engine - Mission engine instance
 * @param {Object|null} els - { title?, desc?, dots? } existing DOM elements by ID
 */
export function renderMissionCard(engine, els) {
  if (!engine || !els) return;

  const snap = engine.state();
  const mission = snap.currentMission
    ? TUTORIAL_MISSIONS.find(m => m.id === snap.currentMission)
    : null;

  if (!mission) return;

  const currentStepObj = mission.steps[snap.currentStep];

  // Render title
  if (els.title) {
    els.title.innerHTML = mission.title;
  }

  // Render description: step hint + mission brief
  if (els.desc) {
    let html = '';
    if (currentStepObj) {
      html += `<div class="mc-step-hint">${currentStepObj.hint}</div>`;
      html += `<div class="mc-mission-brief">${mission.brief}</div>`;
    }
    // Append medals row if any earned
    if (snap.medals[mission.id]) {
      html += `<div class="mc-medals">🏅 ${snap.medals[mission.id]}</div>`;
    }
    els.desc.innerHTML = html;
  }

  // Render step dots (one per step, done/active classes)
  if (els.dots) {
    const dots = mission.steps.map((_, i) => {
      const cls = i < snap.currentStep ? 'mc-dot done'
                : i === snap.currentStep ? 'mc-dot active'
                : 'mc-dot';
      return `<div class="${cls}"></div>`;
    }).join('');
    els.dots.innerHTML = dots;
  }
}

/**
 * Announce mission completion via ui.notify (host optional).
 * Fail-soft: no-op if ui or ui.notify missing.
 *
 * @param {TutorialEngine} engine - Mission engine instance
 * @param {Object|null} ui - { notify?: fn } optional UI system
 */
export function missionCompleteToast(engine, ui) {
  if (!ui?.notify) return;
  const snap = engine.state();
  if (snap.done) {
    ui.notify('✅ Mission complete! Keep exploring.');
  }
}
