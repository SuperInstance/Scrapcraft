/**
 * Tutorial module: headless mission engine + rendering adapter.
 * Exported for Game.js integration: event dispatch via notify(), DOM via renderMissionCard().
 */

export { TutorialEngine, TUTORIAL_MISSIONS } from './TutorialMissions.js';
export { renderMissionCard, missionCompleteToast } from './missionCard.js';
export { runTutorialTests } from './__tests__/tutorial-tests.mjs';
